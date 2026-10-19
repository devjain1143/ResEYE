import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from '../core/db.js';
import { findSimilarCorrections } from '../core/query.js';
import { getSystemPromptWithCorrections } from './systemPrompt.js';
import * as geminiAdapter from './providers/gemini.js';
import * as openaiCompatibleAdapter from './providers/openaiCompatible.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let providers = [];
try {
  const pPath = path.resolve(__dirname, '../../config/providers.json');
  if (fs.existsSync(pPath)) {
    providers = JSON.parse(fs.readFileSync(pPath, 'utf-8'));
  }
} catch (e) {
  console.warn('[ProviderRouter] Could not read providers.json:', e.message);
}

const adapters = {
  gemini: geminiAdapter,
  openaiCompatible: openaiCompatibleAdapter
};

const temporaryCooldowns = new Map();

export async function getProviderHeadroom(provider) {
  const now = Date.now();
  if (temporaryCooldowns.has(provider.name)) {
    if (now < temporaryCooldowns.get(provider.name)) {
      return -1;
    }
    temporaryCooldowns.delete(provider.name);
  }

  if (!process.env[provider.apiKeyEnv]) {
    return -1;
  }

  const result = await getDb().query(
    `SELECT CAST(extract(epoch from timestamp)*1000 AS BIGINT) as timestamp
     FROM provider_usage
     WHERE provider_name = $1 AND timestamp >= NOW() - INTERVAL '24 hours'`,
    [provider.name]
  );

  const timestamps = result.rows.map(r => parseInt(r.timestamp, 10));
  const minuteCount = timestamps.filter(t => now - t < 60 * 1000).length;
  const dayCount = timestamps.length;

  let minRatio = 1.0;
  for (const limit of provider.limits || []) {
    const count = limit.window === 'minute' ? minuteCount : dayCount;
    const remaining = limit.max - count;
    if (remaining <= 0) return -1;
    const ratio = remaining / limit.max;
    if (ratio < minRatio) minRatio = ratio;
  }

  return minRatio;
}

export async function recordProviderSuccess(providerName) {
  await getDb().query('INSERT INTO provider_usage (provider_name) VALUES ($1)', [providerName]);
}

export function markProviderCooldown(providerName, cooldownMs = 60000) {
  temporaryCooldowns.set(providerName, Date.now() + cooldownMs);
}

export async function routeToIntent(question) {
  const headrooms = await Promise.all(providers.map(p => getProviderHeadroom(p)));

  const candidates = providers
    .map((p, i) => ({ provider: p, headroom: headrooms[i] }))
    .filter(c => c.headroom > 0)
    .sort((a, b) => b.headroom - a.headroom)
    .map(c => c.provider);

  if (candidates.length === 0) {
    throw new Error('No LLM providers currently available or within quota limits.');
  }

  let systemPromptToUse = null;
  try {
    const similarCorrections = await findSimilarCorrections(question, 3);
    if (similarCorrections.length > 0) {
      systemPromptToUse = getSystemPromptWithCorrections(similarCorrections);
    }
  } catch (err) {
    console.warn('[ProviderRouter] Failed to retrieve feedback corrections:', err.message);
  }

  let lastError = null;
  for (const provider of candidates) {
    const adapter = adapters[provider.adapter];
    if (!adapter || !adapter.translateToIntent) continue;

    try {
      const rawIntent = await adapter.translateToIntent(question, provider, systemPromptToUse);
      await recordProviderSuccess(provider.name);
      return { rawIntent, providerUsed: provider.name };
    } catch (err) {
      console.warn(`[ProviderRouter] Provider ${provider.name} failed:`, err.message);
      lastError = err;
      markProviderCooldown(provider.name, err.isRateLimit ? 120000 : 30000);
    }
  }

  throw new Error(`All candidate providers failed. Last error: ${lastError ? lastError.message : 'Unknown'}`);
}

export async function routeToConversationalResponse(intent, dataResult) {
  const headrooms = await Promise.all(providers.map(p => getProviderHeadroom(p)));

  const candidates = providers
    .map((p, i) => ({ provider: p, headroom: headrooms[i] }))
    .filter(c => c.headroom > 0)
    .sort((a, b) => b.headroom - a.headroom)
    .map(c => c.provider);

  if (candidates.length === 0) {
    throw new Error('No LLM providers currently available or within quota limits.');
  }

  let lastError = null;
  for (const provider of candidates) {
    const adapter = adapters[provider.adapter];
    if (!adapter || !adapter.generateConversationalResponse) continue;

    try {
      const response = await adapter.generateConversationalResponse(intent, dataResult, provider);
      await recordProviderSuccess(provider.name);
      return { response, providerUsed: provider.name };
    } catch (err) {
      lastError = err;
      markProviderCooldown(provider.name, err.isRateLimit ? 120000 : 30000);
    }
  }

  throw new Error(`Conversational response generation failed: ${lastError ? lastError.message : 'Unknown'}`);
}
