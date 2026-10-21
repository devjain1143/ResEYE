import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

dotenv.config({ override: true });

const getIpKey = (val) => (typeof val === 'string' ? val : val?.ip || val?.headers?.['x-forwarded-for'] || '127.0.0.1');

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: () => parseInt(process.env.RATE_LIMIT || '10', 10),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? getIpKey(req.ip),
  skip: (req) => req.user?.role === 'ADMIN',
  message: () => ({
    success: false,
    code: 'RATE_LIMIT',
    message: `Rate limit exceeded. You can only make ${process.env.RATE_LIMIT || 10} queries per minute. Please wait a moment.`
  })
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ip = getIpKey(req.ip);
    const coarseSignal = req.headers['x-client-signal'] || req.headers['x-client-fingerprint'] || req.headers['sec-ch-ua'] || '';
    return coarseSignal ? `${ip}:${coarseSignal}` : ip;
  },
  message: {
    success: false,
    code: 'AUTH_RATE_LIMIT',
    message: 'Too many authentication attempts. Please wait 15 minutes.'
  }
});

export const humanLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? getIpKey(req.ip),
  message: {
    success: false,
    code: 'CAPTCHA_RATE_LIMIT',
    message: 'Too many human verification attempts.'
  }
});
