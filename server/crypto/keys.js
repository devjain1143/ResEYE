import 'dotenv/config';
import crypto from 'crypto';

class DecryptionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DecryptionError';
    this.status = 500;
  }
}

export { DecryptionError };

// Master keys loaded from environment (DATA_KEK_V1, DATA_KEK_V2, etc.)
// Format: 32 random bytes, base64 encoded
const keyStore = new Map();
let currentKid = process.env.DATA_CURRENT_KID || 'v1';

function initializeKeys() {
  const v1Key = process.env.DATA_KEK_V1;
  if (v1Key) {
    const buf = Buffer.from(v1Key, 'base64');
    if (buf.length !== 32) {
      throw new Error(`FATAL: DATA_KEK_V1 must be 32 bytes (got ${buf.length})`);
    }
    keyStore.set('v1', buf);
  } else {
    // Deterministic fallback for dev / test mode only
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: DATA_KEK_V1 environment variable missing in production.');
    }
    const fallback = crypto.createHash('sha256').update('reseye-dev-test-master-kek-32bytes-entropy').digest();
    keyStore.set('v1', fallback);
  }

  // Check optional v2 key for rotation
  const v2Key = process.env.DATA_KEK_V2;
  if (v2Key) {
    const buf = Buffer.from(v2Key, 'base64');
    if (buf.length === 32) {
      keyStore.set('v2', buf);
    }
  }
}

initializeKeys();

/**
 * Derive a 32-byte subkey using HKDF-SHA256 for a specific purpose.
 * Info string: purpose ('registration', 'history', 'alerts', 'audit', 'notifications', 'tokens', 'blind-index')
 */
export function deriveSubkey(masterKeyBuf, purpose) {
  if (!masterKeyBuf || masterKeyBuf.length !== 32) {
    throw new Error('Invalid master key buffer for HKDF');
  }
  const derived = crypto.hkdfSync(
    'sha256',
    masterKeyBuf,
    Buffer.alloc(0), // empty salt per HKDF spec when salt is implicit
    Buffer.from(`reseye:${purpose}`, 'utf8'),
    32
  );
  return Buffer.from(derived);
}

export function getCurrentKid() {
  return currentKid;
}

export function setCurrentKid(kid) {
  if (!keyStore.has(kid)) {
    throw new Error(`Cannot set active kid to unknown key: ${kid}`);
  }
  currentKid = kid;
}

export function getKnownKids() {
  return Array.from(keyStore.keys());
}

const subkeyCache = new Map();

export function registerKey(kid, keyBuf) {
  if (!keyBuf || keyBuf.length !== 32) {
    throw new Error('Key buffer must be exactly 32 bytes');
  }
  keyStore.set(kid, keyBuf);
  // Invalidate any cached subkeys for this kid
  for (const k of subkeyCache.keys()) {
    if (k.startsWith(`${kid}:`)) subkeyCache.delete(k);
  }
}

export function getSubkey(kid, purpose) {
  const master = keyStore.get(kid);
  if (!master) {
    throw new DecryptionError(`Unknown key identifier (kid): ${kid}`);
  }
  const cacheKey = `${kid}:${purpose}`;
  let subkey = subkeyCache.get(cacheKey);
  if (!subkey) {
    subkey = deriveSubkey(master, purpose);
    subkeyCache.set(cacheKey, subkey);
  }
  return subkey;
}
