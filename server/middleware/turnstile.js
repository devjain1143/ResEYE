const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export function requireTurnstile(expectedAction) {
  return async (req, res, next) => {
    const rawSecret = process.env.TURNSTILE_SECRET_KEY || '';
    const secret = rawSecret.replace(/^["']|["']$/g, '').trim();

    // Development / test bypass if secret is not set, test key, or test token passed
    const token = req.body?.turnstileToken || req.headers['x-turnstile-token'];
    if (
      process.env.BYPASS_TURNSTILE === 'true' ||
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
      const formParams = {
        secret,
        response: token
      };
      const clientIp = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim();
      if (clientIp && !clientIp.startsWith('127.') && clientIp !== '::1' && !clientIp.startsWith('10.') && !clientIp.startsWith('192.168.')) {
        formParams.remoteip = clientIp;
      }
      const form = new URLSearchParams(formParams);

      const r = await fetch(VERIFY_URL, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(5000)
      });

      const data = await r.json();
      const hostOk = !process.env.TURNSTILE_EXPECTED_HOSTNAME || data.hostname === process.env.TURNSTILE_EXPECTED_HOSTNAME;
      const actionOk = !expectedAction || !data.action || data.action === expectedAction;

      if (!data.success || !hostOk || !actionOk) {
        if (!data.success) {
          console.warn('[Turnstile] Cloudflare verification failed:', data['error-codes'] || data);
        } else if (!hostOk) {
          console.warn('[Turnstile] Hostname mismatch:', data.hostname, 'expected:', process.env.TURNSTILE_EXPECTED_HOSTNAME);
        } else if (!actionOk) {
          console.warn('[Turnstile] Action mismatch:', data.action, 'expected:', expectedAction);
        }
        return res.status(403).json({
          success: false,
          code: 'CAPTCHA_FAILED',
          message: 'Human verification failed. Please try again.'
        });
      }

      return next();
    } catch (err) {
      console.error('[Turnstile] Verification error or timeout:', err.message);
      // Fail closed
      return res.status(503).json({
        success: false,
        code: 'CAPTCHA_UNAVAILABLE',
        message: 'Verification service unavailable.'
      });
    }
  };
}
