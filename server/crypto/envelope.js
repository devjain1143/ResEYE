import crypto from 'crypto';
import { DecryptionError } from './keys.js';

const ENVELOPE_PREFIX = 'v1';
const IV_LENGTH = 12; // 12 bytes = 96 bits recommended for AES-GCM
const TAG_LENGTH = 16; // 16 bytes = 128 bits authentication tag

/**
 * Encrypt plaintext string with AES-256-GCM and bind AAD.
 * Returns envelope: v1.<kid>.<iv_b64url>.<tag_b64url>.<ct_b64url>
 */
export function encryptEnvelope(plaintextStr, aadStr, subkey, kid) {
  if (typeof plaintextStr !== 'string') {
    throw new Error('Plaintext must be a string');
  }
  if (!Buffer.isBuffer(subkey) || subkey.length !== 32) {
    throw new Error('Encryption subkey must be a 32-byte Buffer');
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', subkey, iv, { authTagLength: TAG_LENGTH });

  if (aadStr) {
    cipher.setAAD(Buffer.from(aadStr, 'utf8'));
  }

  const ciphertext = Buffer.concat([
    cipher.update(plaintextStr, 'utf8'),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return `${ENVELOPE_PREFIX}.${kid}.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

/**
 * Decrypt envelope string with AES-256-GCM and verify AAD.
 * Throws DecryptionError if tampering, tag mismatch, wrong row, or unknown kid.
 */
export function decryptEnvelope(envelopeStr, aadStr, getSubkeyFn) {
  if (typeof envelopeStr !== 'string') {
    throw new DecryptionError('Invalid envelope: must be a string');
  }

  const parts = envelopeStr.split('.');
  if (parts.length !== 5 || parts[0] !== ENVELOPE_PREFIX) {
    throw new DecryptionError('Malformed ciphertext envelope format');
  }

  const [, kid, ivB64url, tagB64url, ctB64url] = parts;

  let subkey;
  try {
    subkey = getSubkeyFn(kid);
  } catch (err) {
    throw new DecryptionError(`Key resolution failure for kid [${kid}]: ${err.message}`);
  }

  let iv, tag, ciphertext;
  try {
    iv = Buffer.from(ivB64url, 'base64url');
    tag = Buffer.from(tagB64url, 'base64url');
    ciphertext = Buffer.from(ctB64url, 'base64url');
  } catch {
    throw new DecryptionError('Corrupted base64url encoding in envelope');
  }

  if (iv.length !== IV_LENGTH) {
    throw new DecryptionError(`Invalid IV length: expected ${IV_LENGTH}, got ${iv.length}`);
  }
  if (tag.length !== TAG_LENGTH) {
    throw new DecryptionError(`Invalid tag length: expected ${TAG_LENGTH}, got ${tag.length}`);
  }

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', subkey, iv, { authTagLength: TAG_LENGTH });
    if (aadStr) {
      decipher.setAAD(Buffer.from(aadStr, 'utf8'));
    }
    decipher.setAuthTag(tag);

    const plaintextBuf = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);
    return plaintextBuf.toString('utf8');
  } catch (err) {
    throw new DecryptionError('Decryption integrity check failed: authentication tag or AAD mismatch');
  }
}
