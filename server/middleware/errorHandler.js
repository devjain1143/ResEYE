import { DecryptionError } from '../crypto/index.js';
import { alertService } from '../services/alertService.js';
import { redactString } from './logger.js';

export function notFound(req, res, next) {
  res.status(404).json({
    success: false,
    message: `Resource not found: ${req.method} ${req.originalUrl}`
  });
}

export function errorHandler(err, req, res, next) {
  const isCryptoError = err instanceof DecryptionError || err.name === 'DecryptionError';
  const status = isCryptoError ? 500 : (err.status || err.statusCode || 500);

  if (isCryptoError) {
    alertService.create('CRYPTO_FAILURE', req.user?.id || null, {
      endpoint: req.originalUrl,
      reason: 'Cryptographic envelope verification or tag mismatch'
    }).catch(() => {});
  }

  if (status >= 500) {
    console.error('[Server Anomaly]', redactString(err.message || ''));
  }

  // Sanitized message: never expose internal SQL, crypto keys, or stacks
  const isProd = process.env.NODE_ENV === 'production';
  let message = err.message || 'Internal server anomaly.';
  if (status >= 500 && (isProd || isCryptoError || /sql|syntax|prisma|column|table|relation/i.test(message))) {
    message = 'Internal server anomaly.';
  }

  res.status(status).json({
    success: false,
    message,
    ...(err.code && { code: err.code }),
    ...(err.email && { email: err.email }),
    ...(status >= 500 && { code: 'INTERNAL_ERROR' })
  });
}
