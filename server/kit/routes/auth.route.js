import { Router } from 'express';
import crypto from 'crypto';
import passport from '../passport.js';
import { authController } from '../controller/auth.controller.js';
import { authLimiter } from '../../middleware/rateLimits.js';
import { requireTurnstile } from '../../middleware/turnstile.js';
import { authenticateAllowPending } from '../../middleware/authenticate.js';
import { ALLOWED_DOMAIN } from '../config/domain.js';

const router = Router();
const pendingGoogleOk = new Map();

router.post('/register', authLimiter, requireTurnstile('register'), authController.register);
router.post('/resend-verification', authLimiter, authController.resendVerification);
router.post('/forgot-password', authLimiter, authController.forgotPassword);
router.post('/login', authLimiter, requireTurnstile('login'), authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authenticateAllowPending, authController.logout);
router.get('/me', authenticateAllowPending, authController.me);

router.get('/config', (req, res) => {
  res.json({
    success: true,
    googleEnabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
  });
});

router.get('/check-email', authController.checkEmail);

router.post('/google/prepare', authLimiter, requireTurnstile('google'), (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(400).json({
      success: false,
      code: 'GOOGLE_AUTH_NOT_CONFIGURED',
      message: 'Institutional Google OAuth is not configured. Please use institutional email credentials.'
    });
  }

  const nonce = crypto.randomUUID();
  pendingGoogleOk.set(nonce, Date.now() + 120_000);
  res.cookie('g_ok', nonce, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 120_000,
    path: '/api/auth'
  });
  res.json({ success: true });
});

function requireGoogleOk(req, res, next) {
  const n = req.cookies?.g_ok;
  const exp = n && pendingGoogleOk.get(n);
  pendingGoogleOk.delete(n);
  res.clearCookie('g_ok', { path: '/api/auth' });

  if (!exp || exp < Date.now()) {
    if (process.env.BYPASS_TURNSTILE === 'true' || (!process.env.TURNSTILE_SECRET_KEY && process.env.NODE_ENV !== 'production')) {
      return next();
    }
    return res.status(403).json({
      success: false,
      code: 'CAPTCHA_REQUIRED',
      message: 'Verification required before initiating Google authentication.'
    });
  }
  next();
}

router.get(
  '/google',
  (req, res, next) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.redirect('/login?error=google_not_configured');
    }
    next();
  },
  requireGoogleOk,
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    hd: ALLOWED_DOMAIN,
    prompt: 'select_account',
    session: false
  })
);

router.get(
  '/google/callback',
  (req, res, next) => {
    passport.authenticate('google', { session: false }, (err, result) => {
      if (err || !result) {
        return res.redirect('/login?error=google');
      }
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/api/auth'
      });
      return res.redirect('/auth/success');
    })(req, res, next);
  }
);

export default router;
