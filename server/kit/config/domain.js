export const ALLOWED_DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN || 'iiitbhopal.ac.in').toLowerCase();

/**
 * Returns the canonical email or null if not an allowed institute address.
 * Strips +alias tags to prevent multiple accounts mapping to the same inbox.
 */
export function normalizeInstitutionEmail(raw) {
  const email = String(raw ?? '').trim().toLowerCase();
  const parts = email.split('@');
  if (parts.length !== 2) return null;
  let [local, domain] = parts;
  if (domain !== ALLOWED_DOMAIN) return null;
  local = local.split('+')[0];
  if (!local || !/^[a-z0-9._-]+$/.test(local)) return null;
  return `${local}@${domain}`;
}
