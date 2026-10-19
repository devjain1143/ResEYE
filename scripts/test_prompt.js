import dotenv from 'dotenv';
import readline from 'readline';
import { checkScope } from '../server/nlq/scopeGate.js';
import { routeToIntent, routeToConversationalResponse } from '../server/nlq/providerRouter.js';
import { validateIntent } from '../server/nlq/intentSchema.js';
import { executeIntent } from '../server/nlq/dataExecutor.js';
import { formatResponse } from '../server/nlq/responseFormatter.js';
import { checkRateLimit, recordQuery, getRemainingDailyQueries } from '../server/nlq/rateLimiter.js';
import { getCachedResult, setCachedResult } from '../server/nlq/cache.js';

dotenv.config();

async function testPrompt(question, user = { id: 'test_admin_user', role: 'ADMIN' }) {
  console.log(`\n--------------------------------------------------`);
  console.log(`[INPUT]: "${question}"`);

  // 1. Scope Gate
  const scope = checkScope(question);
  console.log(`\n[1. Scope Gate]: ${scope.inScope ? 'PASS (in scope)' : 'BLOCKED: ' + scope.reason}`);
  if (!scope.inScope) {
    console.log(`[OUTPUT]: Query out of academic scope.`);
    return;
  }

  // 2. Rate Limit
  const limit = await checkRateLimit(user);
  console.log(`[2. Rate Limiter]: ${limit.allowed ? 'ALLOWED (' + limit.remaining + ' remaining today)' : 'BLOCKED: Daily limit reached'}`);

  // 3. Provider Call
  console.log(`[3. Calling LLM Provider...]`);
  const startTime = Date.now();
  let rawIntent, providerUsed;
  try {
    const routeRes = await routeToIntent(question);
    rawIntent = routeRes.rawIntent;
    providerUsed = routeRes.providerUsed;
    console.log(`   -> Provider: "${providerUsed}" in ${Date.now() - startTime}ms`);
    console.log(`   -> Raw Model Output:`, JSON.stringify(rawIntent, null, 2));
  } catch (err) {
    console.log(`LLM Call Failed: ${err.message}`);
    return;
  }

  // 4. Strict Schema Validation
  const val = validateIntent(rawIntent);
  console.log(`[4. Intent Schema Validation]: ${val.valid ? 'VALID' : 'REJECTED: ' + val.error}`);
  if (!val.valid) {
    console.log(`[OUTPUT]: Invalid intent schema.`);
    return;
  }

  const intent = val.data;

  // 5. Cache Check
  const cached = getCachedResult(intent);
  if (cached) {
    console.log(`[5. Cache]: HIT`);
    const formatted = formatResponse(cached);
    console.log(`\n[OUTPUT]:\n${formatted.text}`);
    return;
  }
  console.log(`[5. Cache]: MISS`);

  // 6. Data Execution
  console.log(`[6. Executing Query against PostgreSQL...]`);
  try {
    const execResult = await executeIntent(intent);
    setCachedResult(intent, execResult);
    const formatted = formatResponse(execResult);

    let finalReply = formatted.text;
    if (!execResult.terminal && !execResult.notFound) {
      try {
        const convRes = await routeToConversationalResponse(intent, execResult);
        if (convRes?.response) finalReply = convRes.response;
      } catch (convErr) {
        console.log(`Conversational generation failed: ${convErr.message}`);
      }
    }

    console.log(`\n[OUTPUT]:\n${finalReply}`);
  } catch (err) {
    console.log(`Data Execution Failed: ${err.message}`);
  }
}

const args = process.argv.slice(2);
if (args.length > 0) {
  testPrompt(args.join(' ')).then(() => process.exit(0));
} else {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('ResEYE NLQ Prompt Test Bench. Type questions or "exit".');
  rl.setPrompt('NLQ> ');
  rl.prompt();

  rl.on('line', async (line) => {
    const q = line.trim();
    if (q === 'exit' || q === 'quit') process.exit(0);
    if (q) await testPrompt(q);
    rl.prompt();
  });
}
