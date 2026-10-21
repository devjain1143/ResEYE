import crypto from 'crypto';
import {
  DecryptionError,
  getSubkey,
  getCurrentKid,
  setCurrentKid,
  getKnownKids,
  registerKey
} from './keys.js';
import { encryptEnvelope, decryptEnvelope } from './envelope.js';
import { computeBlindIndex as calcBlindIndex } from './blindIndex.js';

export {
  DecryptionError,
  getCurrentKid,
  setCurrentKid,
  getKnownKids,
  registerKey
};

export function getEncryptionMode() {
  const mode = (process.env.FIELD_ENCRYPTION || 'dual').toLowerCase().trim();
  if (['on', 'off', 'dual'].includes(mode)) return mode;
  return 'dual';
}

/**
 * Encrypt a database field at rest.
 * @param {string|object} plaintext
 * @param {{ table: string, column: string, rowId: string|number }} binding
 * @param {'registration'|'history'|'alerts'|'audit'|'notifications'|'tokens'} purpose
 */
export function encryptField(plaintext, binding, purpose = 'history') {
  if (plaintext === null || plaintext === undefined) return null;
  const mode = getEncryptionMode();
  if (mode === 'off') {
    return typeof plaintext === 'object' ? JSON.stringify(plaintext) : String(plaintext);
  }

  if (!binding || !binding.table || !binding.column) {
    throw new Error('Encryption binding requires table and column specifications');
  }

  const rowId = binding.rowId !== undefined && binding.rowId !== null ? String(binding.rowId) : '0';
  const aad = `${binding.table}:${binding.column}:${rowId}`;
  const text = typeof plaintext === 'object' ? JSON.stringify(plaintext) : String(plaintext);

  const kid = getCurrentKid();
  const subkey = getSubkey(kid, purpose);

  return encryptEnvelope(text, aad, subkey, kid);
}

/**
 * Decrypt a database field at rest.
 * @param {string} envelope
 * @param {{ table: string, column: string, rowId: string|number }} binding
 * @param {'registration'|'history'|'alerts'|'audit'|'notifications'|'tokens'} purpose
 * @param {boolean} parseJson
 */
export function decryptField(envelope, binding, purpose = 'history', parseJson = false) {
  if (envelope === null || envelope === undefined) return null;
  const str = String(envelope);

  // Check if string is an encryption envelope
  if (!str.startsWith('v1.')) {
    const mode = getEncryptionMode();
    if (mode === 'on') {
      throw new DecryptionError(`Unexpected plaintext value encountered when FIELD_ENCRYPTION is set to 'on' for ${binding?.table}.${binding?.column}`);
    }
    // Fallback for transition in 'off' or 'dual' mode
    if (parseJson) {
      try {
        return JSON.parse(str);
      } catch {
        return str;
      }
    }
    return str;
  }

  if (!binding || !binding.table || !binding.column) {
    throw new Error('Decryption binding requires table and column specifications');
  }

  const rowId = binding.rowId !== undefined && binding.rowId !== null ? String(binding.rowId) : '0';
  const aad = `${binding.table}:${binding.column}:${rowId}`;

  const plaintext = decryptEnvelope(str, aad, (kid) => getSubkey(kid, purpose));

  if (parseJson) {
    try {
      return JSON.parse(plaintext);
    } catch {
      return plaintext;
    }
  }

  return plaintext;
}

/**
 * Encrypt a buffer (such as registration_data.xlsx) with AAD binding.
 * @param {Buffer} buffer
 * @param {string} filename
 * @param {string} version
 */
export function encryptFileBuffer(buffer, filename, version = 'v1') {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('File payload must be a Buffer');
  }

  const aad = `${filename}:${version}`;
  const kid = getCurrentKid();
  const subkey = getSubkey(kid, 'registration');

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', subkey, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));

  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Return serialized envelope string
  return `v1.${kid}.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

/**
 * Decrypt a file envelope directly into memory buffer.
 * @param {string|Buffer} envelopeData
 * @param {string} filename
 * @param {string} version
 */
export function decryptFileBuffer(envelopeData, filename, version = 'v1') {
  const str = Buffer.isBuffer(envelopeData) ? envelopeData.toString('utf8') : String(envelopeData);
  const aad = `${filename}:${version}`;

  const parts = str.split('.');
  if (parts.length !== 5 || parts[0] !== 'v1') {
    throw new DecryptionError('Malformed encrypted file envelope');
  }

  const [, kid, ivB64url, tagB64url, ctB64url] = parts;
  const subkey = getSubkey(kid, 'registration');
  const iv = Buffer.from(ivB64url, 'base64url');
  const tag = Buffer.from(tagB64url, 'base64url');
  const ciphertext = Buffer.from(ctB64url, 'base64url');

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', subkey, iv);
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (err) {
    throw new DecryptionError(`Failed to decrypt file [${filename}]: authentication tag mismatch`);
  }
}

/**
 * Generate a blind index for searchable equality queries.
 */
export function computeBlindIndex(value) {
  const kid = getCurrentKid();
  const blindKey = getSubkey(kid, 'blind-index');
  return calcBlindIndex(value, blindKey);
}

/**
 * Hash tokens (refresh, reset, verification) with SHA-256 for secure storage at rest.
 */
export function hashToken(token) {
  if (!token || typeof token !== 'string') return '';
  return crypto.createHash('sha256').update(token.trim(), 'utf8').digest('hex');
}
