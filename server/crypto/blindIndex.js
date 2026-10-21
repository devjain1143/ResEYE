import crypto from 'crypto';

/**
 * Blind index generator for equality lookups over encrypted columns.
 * Algorithm: HMAC-SHA256(blindKey, normalizedValue).slice(0, 16 bytes) -> 32 hex chars.
 */
export function computeBlindIndex(value, blindKeyBuf) {
  if (value === null || value === undefined) return null;
  if (!Buffer.isBuffer(blindKeyBuf) || blindKeyBuf.length !== 32) {
    throw new Error('Blind key must be a 32-byte Buffer');
  }

  const normalized = String(value).trim().toLowerCase();
  return crypto.createHmac('sha256', blindKeyBuf)
    .update(normalized, 'utf8')
    .digest()
    .subarray(0, 16)
    .toString('hex');
}
