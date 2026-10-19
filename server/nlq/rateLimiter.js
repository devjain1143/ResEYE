import { getDb } from '../core/db.js';
import { settingsService } from '../services/settingsService.js';
import { alertService } from '../services/alertService.js';

export const AGGREGATE_INTENTS = new Set([
  'TOP_SCORER',
  'AVERAGE_METRIC',
  'RESULT_COUNT',
  'BATCH_ROSTER'
]);

export async function checkRateLimit(user, intent = null, batch = null, semester = null) {
  if (user?.role === 'ADMIN') {
    return {
      allowed: true,
      remaining: 999,
      isSweepingAnomaly: false
    };
  }

  const userId = user?.id;
  const now = Date.now();
  const db = getDb();

  const dailyMax = await settingsService.get('ai_daily_limit', 10);
  const burstMax = await settingsService.get('ai_burst_per_min', 5);

  const result = await db.query(
    `SELECT is_aggregate AS "isAggregate",
            batch,
            semester,
            is_cache_hit AS "isCacheHit",
            CAST(extract(epoch from timestamp)*1000 AS BIGINT) as timestamp
     FROM user_ai_usage
     WHERE web_user_id = $1 AND timestamp >= NOW() - INTERVAL '24 hours'`,
    [userId]
  );

  const records = result.rows.map(r => ({
    ...r,
    timestamp: parseInt(r.timestamp, 10)
  }));

  const providerCalls = records.filter(r => !r.isCacheHit);
  const remainingCalculated = Math.max(0, dailyMax - providerCalls.length);

  // 1. Rapid-fire burst check (sliding 60s)
  const recentBurst = records.filter(r => now - r.timestamp < 60000);
  if (recentBurst.length >= burstMax) {
    const error = new Error(`Burst limit reached. Maximum ${burstMax} AI queries per minute.`);
    error.status = 429;
    error.code = 'AI_BURST_LIMIT';
    error.retryAfterSeconds = 60;
    throw error;
  }

  // 2. Daily non-cache limit check
  if (providerCalls.length >= dailyMax) {
    const oldestTimestamp = Math.min(...providerCalls.map(r => r.timestamp));
    const hoursLeft = Math.ceil((oldestTimestamp + 24 * 3600 * 1000 - now) / 3600000);
    const error = new Error(`Daily AI limit reached (${dailyMax}/day). Refreshes in ~${hoursLeft}h.`);
    error.status = 429;
    error.code = 'AI_DAILY_LIMIT';
    error.retryAfterSeconds = hoursLeft * 3600;
    throw error;
  }

  // 3. Sweeping Anomaly Detection (10-minute sliding window)
  const isAggregate = intent && AGGREGATE_INTENTS.has(intent);
  if (isAggregate) {
    const windowMs = 10 * 60 * 1000;
    const recentAgg = records.filter(r => r.isAggregate && (now - r.timestamp < windowMs));

    // A. Cross-batch sweep (>= 3 distinct batches in 10 min)
    if (batch) {
      const distinctBatches = new Set(recentAgg.map(r => r.batch).filter(Boolean));
      distinctBatches.add(batch.toLowerCase());

      if (distinctBatches.size >= 3) {
        alertService.create('SWEEP_BATCH', userId, {
          reason: `Cross-batch sweep: queried ${distinctBatches.size} distinct batches in 10 minutes`,
          batches: Array.from(distinctBatches),
          intent
        }).catch(() => {});
      }
    }

    // B. Semester sweep within same batch (>= 4 semesters in 10 min)
    if (batch && semester) {
      const sameBatchRecords = recentAgg.filter(r => r.batch === batch.toLowerCase());
      const distinctSemesters = new Set(sameBatchRecords.map(r => r.semester).filter(Boolean));
      distinctSemesters.add(parseInt(semester, 10));

      if (distinctSemesters.size >= 4) {
        alertService.create('SWEEP_SEMESTER', userId, {
          reason: `Semester sweep: queried ${distinctSemesters.size} distinct semesters for batch ${batch}`,
          batch,
          semesters: Array.from(distinctSemesters).sort(),
          intent
        }).catch(() => {});
      }
    }
  }

  return {
    allowed: true,
    remaining: remainingCalculated
  };
}

export async function recordQuery(userId, intent, batch = null, semester = null, isCacheHit = false) {
  const isAggregate = AGGREGATE_INTENTS.has(intent);
  await getDb().query(
    `INSERT INTO user_ai_usage (web_user_id, is_aggregate, batch, semester, is_cache_hit)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      userId,
      isAggregate,
      batch ? batch.toLowerCase() : null,
      semester ? parseInt(semester, 10) : null,
      isCacheHit
    ]
  );
}

export async function getRemainingDailyQueries(user) {
  if (user?.role === 'ADMIN') return 999;
  const dailyMax = await settingsService.get('ai_daily_limit', 10);
  const result = await getDb().query(
    `SELECT COUNT(*) as count
     FROM user_ai_usage
     WHERE web_user_id = $1
       AND is_cache_hit = false
       AND timestamp >= NOW() - INTERVAL '24 hours'`,
    [user.id]
  );
  const providerCalls = parseInt(result.rows[0].count, 10);
  return Math.max(0, dailyMax - providerCalls);
}
