import { checkScope } from './scopeGate.js';
import { checkRateLimit, recordQuery, getRemainingDailyQueries } from './rateLimiter.js';
import { getCachedResult, setCachedResult } from './cache.js';
import { routeToIntent, routeToConversationalResponse } from './providerRouter.js';
import { validateIntent } from './intentSchema.js';
import { executeIntent } from './dataExecutor.js';
import { formatResponse } from './responseFormatter.js';
import { logAiQuery } from '../core/query.js';
import { settingsService } from '../services/settingsService.js';

export async function run({ query, user }) {
  const userId = user?.id;
  const username = user?.username || user?.email;
  const firstName = user?.name || user?.username;

  // 1. Scope Gate
  const scope = checkScope(query);
  if (!scope.inScope) {
    await logAiQuery({
      webUserId: userId,
      username,
      firstName,
      queryText: query,
      intent: 'UNSUPPORTED',
      isAnswered: false,
      rejectionReason: scope.reason || 'Out of Scope',
      isCacheHit: false
    });

    const limit = await settingsService.get('ai_daily_limit', 10);
    const remaining = await getRemainingDailyQueries(user);

    return {
      intent: 'UNSUPPORTED',
      text: 'ACADEMIC RECORDS ONLY: The surveillance archive only answers questions about student results and records (e.g., "who topped 2nd sem in ece-28?" or "average CPI of cse-26").',
      cached: false,
      quota: {
        usedToday: user.role === 'ADMIN' ? 0 : Math.max(0, limit - remaining),
        limit: user.role === 'ADMIN' ? 999 : limit,
        remaining
      }
    };
  }

  // 2. Pre-LLM Rate Limit Check
  await checkRateLimit(user);

  // 3. Provider Router (NL -> Intent)
  const { rawIntent, providerUsed } = await routeToIntent(query);

  // 4. Intent Schema Validation
  const validation = validateIntent(rawIntent);
  if (!validation.valid) {
    await logAiQuery({
      webUserId: userId,
      username,
      firstName,
      queryText: query,
      intent: 'INVALID',
      isAnswered: false,
      rejectionReason: `Validation Failed: ${validation.error}`,
      isCacheHit: false
    });

    const limit = await settingsService.get('ai_daily_limit', 10);
    const remaining = await getRemainingDailyQueries(user);

    return {
      intent: 'INVALID',
      text: `COULD NOT PARSE QUERY: The archive could not translate this request into a valid query pattern. Details: ${validation.error}`,
      cached: false,
      quota: {
        usedToday: user.role === 'ADMIN' ? 0 : Math.max(0, limit - remaining),
        limit: user.role === 'ADMIN' ? 999 : limit,
        remaining
      }
    };
  }

  const validatedIntent = validation.data;
  const intentName = validatedIntent.intent;
  const batchParam = validatedIntent.params?.batch || null;
  const semesterParam = validatedIntent.params?.semester || null;

  // 5. Post-LLM Rate & Sweeping Anomaly Check
  await checkRateLimit(user, intentName, batchParam, semesterParam);

  if (intentName === 'UNSUPPORTED' || validatedIntent.confidence === 'low') {
    await logAiQuery({
      webUserId: userId,
      username,
      firstName,
      queryText: query,
      intent: intentName,
      batch: batchParam,
      semester: semesterParam,
      isAnswered: false,
      rejectionReason: 'Unsupported or low confidence',
      isCacheHit: false
    });

    const execResult = await executeIntent(validatedIntent);
    const formatted = formatResponse(execResult);
    const limit = await settingsService.get('ai_daily_limit', 10);
    const remaining = await getRemainingDailyQueries(user);

    return {
      intent: intentName,
      text: formatted.text,
      cached: false,
      quota: {
        usedToday: user.role === 'ADMIN' ? 0 : Math.max(0, limit - remaining),
        limit: user.role === 'ADMIN' ? 999 : limit,
        remaining
      }
    };
  }

  // 6. Cache Lookup
  const cached = getCachedResult(validatedIntent);
  if (cached) {
    await recordQuery(userId, intentName, batchParam, semesterParam, true);
    await logAiQuery({
      webUserId: userId,
      username,
      firstName,
      queryText: query,
      intent: intentName,
      batch: batchParam,
      semester: semesterParam,
      isAnswered: true,
      isCacheHit: true
    });

    const formatted = formatResponse(cached);
    const limit = await settingsService.get('ai_daily_limit', 10);
    const remaining = await getRemainingDailyQueries(user);

    return {
      intent: intentName,
      text: formatted.text,
      rows: cached.students || (cached.toppers ? cached.toppers : undefined),
      cached: true,
      quota: {
        usedToday: user.role === 'ADMIN' ? 0 : Math.max(0, limit - remaining),
        limit: user.role === 'ADMIN' ? 999 : limit,
        remaining
      }
    };
  }

  // 7. Authorized Data Execution
  const dataResult = await executeIntent(validatedIntent);
  const isAnswered = !dataResult.notFound;

  await logAiQuery({
    webUserId: userId,
    username,
    firstName,
    queryText: query,
    intent: intentName,
    batch: batchParam,
    semester: semesterParam,
    isAnswered,
    rejectionReason: isAnswered ? null : 'No Data Found',
    isCacheHit: false
  });

  if (isAnswered) {
    setCachedResult(validatedIntent, dataResult);
  }

  await recordQuery(userId, intentName, batchParam, semesterParam, false);

  // 8. Format Response
  const formatted = formatResponse(dataResult);
  let replyText = formatted.text;

  if (!dataResult.terminal && isAnswered) {
    try {
      const convRes = await routeToConversationalResponse(validatedIntent, dataResult);
      if (convRes?.response) {
        replyText = convRes.response;
      }
    } catch (e) {
      console.warn('[NLQ] Conversational generation notice:', e.message);
    }
  }

  const limit = await settingsService.get('ai_daily_limit', 10);
  const remaining = await getRemainingDailyQueries(user);

  return {
    intent: intentName,
    text: replyText,
    rows: dataResult.students || (dataResult.toppers ? dataResult.toppers : undefined),
    cached: false,
    quota: {
      usedToday: user.role === 'ADMIN' ? 0 : Math.max(0, limit - remaining),
      limit: user.role === 'ADMIN' ? 999 : limit,
      remaining
    }
  };
}

export async function handleDebugIntent(rawJson) {
  let parsed;
  try {
    parsed = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
  } catch (err) {
    const error = new Error(`Malformed JSON: ${err.message}`);
    error.status = 400;
    throw error;
  }

  const normalized = parsed.params ? parsed : {
    intent: parsed.intent,
    confidence: parsed.confidence || 'high',
    params: {
      degree: parsed.degree,
      specialization: parsed.specialization,
      scholar_no_prefix: parsed.scholar_no_prefix,
      batch: parsed.batch,
      metric: parsed.metric || (parsed.semester ? 'spi' : 'cpi'),
      semester: parsed.semester,
      position: parsed.position,
      limit: parsed.limit,
      identifier: parsed.identifier,
      name: parsed.name,
      scholar_no: parsed.scholar_no
    }
  };

  const validation = validateIntent(normalized);
  if (!validation.valid) {
    const error = new Error(`Validation failed: ${validation.error}`);
    error.status = 400;
    throw error;
  }
  const executed = await executeIntent(validation.data);
  const formatted = formatResponse(executed);
  return {
    validation: validation.data,
    execution: executed,
    formattedText: formatted.text
  };
}
