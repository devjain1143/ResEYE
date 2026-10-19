const TTL_MS = 15 * 60 * 1000;
const MAX_QUERIES = 20;
const state = new Map(); // userId -> { until, remaining }

export function grantHuman(userId) {
  state.set(userId, { until: Date.now() + TTL_MS, remaining: MAX_QUERIES });
}

export function requireHuman(req, res, next) {
  if (req.user?.role === 'ADMIN') return next();

  // If Turnstile is bypassed in development
  if (process.env.BYPASS_TURNSTILE === 'true' || (!process.env.TURNSTILE_SECRET_KEY && process.env.NODE_ENV !== 'production')) {
    return next();
  }

  const s = state.get(req.user?.id);
  if (!s || s.until < Date.now() || s.remaining <= 0) {
    return res.status(428).json({
      success: false,
      code: 'CAPTCHA_REQUIRED',
      message: 'Human verification required to access records.'
    });
  }
  s.remaining -= 1;
  next();
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of state) {
    if (v.until < now) state.delete(k);
  }
}, 5 * 60 * 1000).unref();
