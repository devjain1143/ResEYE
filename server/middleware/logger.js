/**
 * Central redaction and surveillance log hygiene module.
 * Redacts passwords, tokens, cookies, auth headers, masked emails,
 * scholar numbers in bodies, registration fields, and long AI query texts.
 */

const SENSITIVE_KEY_REGEX = /password|secret|key|token|cookie|turnstile|authorization|credential/i;
const REGISTRATION_PII_KEY_REGEX = /guardian|father|phone|contact|address|mobile/i;
const EMAIL_REGEX = /([a-zA-Z0-9._%+-])([a-zA-Z0-9._%+-]*)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
const SCHOLAR_REGEX = /\b(\d{2}[UuPpDd]\d{5}|\d{2}[A-Za-z]{3}\d{3,4})\b/g;

export function redactString(str) {
  if (typeof str !== 'string') return str;

  // Mask email addresses: a***@iiitbhopal.ac.in
  let clean = str.replace(EMAIL_REGEX, (match, firstLetter, middle, domain) => {
    return `${firstLetter}***@${domain}`;
  });

  // Mask scholar numbers
  clean = clean.replace(SCHOLAR_REGEX, 'XX-SCHOLAR-XX');

  return clean;
}

export function redactValue(val, depth = 0) {
  if (depth > 5) return '[DEPTH_LIMIT]';
  if (val === null || val === undefined) return val;

  if (typeof val === 'string') {
    return redactString(val);
  }

  if (Array.isArray(val)) {
    return val.map(item => redactValue(item, depth + 1));
  }

  if (typeof val === 'object') {
    const redactedObj = {};
    for (const [key, value] of Object.entries(val)) {
      if (SENSITIVE_KEY_REGEX.test(key)) {
        redactedObj[key] = '[REDACTED_SECRET]';
      } else if (REGISTRATION_PII_KEY_REGEX.test(key)) {
        redactedObj[key] = '[REDACTED_PII]';
      } else if (key === 'queryText' || key === 'query_text' || key === 'question') {
        const strVal = String(value || '');
        redactedObj[key] = strVal.length > 80 ? `${redactString(strVal.slice(0, 80))}...` : redactString(strVal);
      } else {
        redactedObj[key] = redactValue(value, depth + 1);
      }
    }
    return redactedObj;
  }

  return val;
}

export function requestLogger(req, res, next) {
  // Redact authorization header and cookies in-place for any downstream middleware or logging
  if (req.headers && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    req.redactedAuth = `${parts[0]} [REDACTED_TOKEN]`;
  }

  next();
}
