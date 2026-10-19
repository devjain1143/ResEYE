const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export function requireTurnstile(expectedAction) {
  return async (req, res, next) => {
    const secret = process.env.TURNSTILE_SECRET_KEY;

    // Development / test bypass if secret is not set, test key, or test token passed
    const token = req.body?.turnstileToken || req.headers['x-turnstile-token'];
    if (
      !secret ||
      secret === 'dummy' ||
      secret === 'test' ||
      secret.startsWith('1x') ||
      token === 'dummy' ||
      token?.startsWith('1x') ||
      process.env.NODE_ENV === 'test'
    ) {
      return next();
    }
    if (typeof token !== 'string' || token.length === 0 || token.length > 2048) {
      return res.status(400).json({
        success: false,
        code: 'CAPTCHA_REQUIRED',
        message: 'Complete the human verification challenge.'
      });
    }

    try {
      const form = new URLSearchParams({
        secret,
        response: token,
        remoteip: req.ip,
      });

      const r = await fetch(VERIFY_URL, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(5000)
      });

      const data = await r.json();
      const hostOk = !process.env.TURNSTILE_EXPECTED_HOSTNAME || data.hostname === process.env.TURNSTILE_EXPECTED_HOSTNAME;
      const actionOk = !expectedAction || data.action === expectedAction;

      if (!data.success || !hostOk || !actionOk) {
        return res.status(403).json({
          success: false,
          code: 'CAPTCHA_FAILED',
          message: 'Human verification failed. Please try again.'
        });
      }

      return next();
    } catch {
      // Fail closed
      return res.status(503).json({
        success: false,
        code: 'CAPTCHA_UNAVAILABLE',
        message: 'Verification service unavailable.'
      });
    }
  };
}
