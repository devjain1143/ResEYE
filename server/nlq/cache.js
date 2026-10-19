import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let nlqConfig = { cacheTtlMs: 86400000 };
try {
  const cfgPath = path.resolve(__dirname, '../../config/nlq.json');
  if (fs.existsSync(cfgPath)) {
    nlqConfig = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
  }
} catch {
  // fallback
}

export function serializeKey(validatedIntent) {
  if (!validatedIntent || !validatedIntent.intent) return '';
  const intent = validatedIntent.intent.toUpperCase();
  const params = validatedIntent.params || {};

  const sortedParamKeys = Object.keys(params).sort();
  const paramParts = sortedParamKeys.map(k => `${k}=${String(params[k]).toLowerCase().trim()}`);
  return [intent, ...paramParts].join(':');
}

const cacheStore = new Map();

export function getCachedResult(validatedIntent) {
  const key = serializeKey(validatedIntent);
  if (!key || !cacheStore.has(key)) return null;

  const entry = cacheStore.get(key);
  if (Date.now() > entry.expiresAt) {
    cacheStore.delete(key);
    return null;
  }

  return entry.result;
}

export function setCachedResult(validatedIntent, result, ttlMs = null) {
  const key = serializeKey(validatedIntent);
  if (!key) return;

  const ttl = ttlMs || nlqConfig.cacheTtlMs || 86400000;
  cacheStore.set(key, {
    result,
    expiresAt: Date.now() + ttl
  });
}

export function clearCache() {
  cacheStore.clear();
}
