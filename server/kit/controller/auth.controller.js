import crypto from 'crypto';
import { authService } from '../service/auth.service.js';
import { normalizeInstitutionEmail } from '../config/domain.js';
import { alertService } from '../../services/alertService.js';

function getCookieOptions(req) {
  const isProd = process.env.NODE_ENV === 'production';
  const isHttps = req?.secure || req?.headers?.['x-forwarded-proto'] === 'https';
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd || isHttps,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/api/auth'
  };
}

// Progressive friction tracker: isolated by composite client fingerprint (IP + UA/signal)
// Prevents shared campus NAT from locking out all legitimate institute students
const frictionTracker = new Map();

function trackAndApplyFriction(req, emailOrId) {
  const ip = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
  const ua = req.get('user-agent') || 'generic';
  const coarseSignal = req.headers['x-client-signal'] || req.headers['x-client-fingerprint'] || req.headers['sec-ch-ua'] || '';
  const fpHash = crypto.createHash('sha256').update(`${ua}:${coarseSignal}`).digest('hex').slice(0, 16);
  const key = `${ip}:${fpHash}`;
  const now = Date.now();
  const windowMs = 5 * 60 * 1000; // 5 minutes

  const entry = frictionTracker.get(key) || {
    ip,
    fpHash,
    attempts: [],
    emails: new Set()
  };

  entry.attempts = entry.attempts.filter(t => now - t < windowMs);
  entry.attempts.push(now);

  const clean = String(emailOrId || '').trim().toLowerCase();
  if (clean.includes('@')) {
    entry.emails.add(clean);
  }
  frictionTracker.set(key, entry);

  const attemptCount = entry.attempts.length;
  const distinctEmails = entry.emails.size;

  let delayMs = 0;
  if (attemptCount >= 5 && attemptCount < 10) {
    delayMs = (attemptCount - 4) * 40; // 40ms to 200ms progressive delay
  } else if (attemptCount >= 10) {
    delayMs = 200 + Math.min((attemptCount - 9) * 50, 600); // 250ms to 800ms delay
  }

  // Throttle if aggressive enumeration (>= 8 distinct emails) or severe flooding (>= 25 attempts)
  if (distinctEmails >= 8 || attemptCount >= 25) {
    alertService.create('ENUMERATION', null, {
      ip,
      fingerprint: fpHash,
      distinctCount: distinctEmails,
      attemptCount,
      reason: `Automated email enumeration detected: ${distinctEmails} distinct emails probed across ${attemptCount} attempts in 5 minutes.`
    }).catch(() => {});

    return {
      blocked: true,
      delayMs,
      code: 'ENUMERATION_BLOCKED',
      message: 'Suspicious verification activity detected. Access restricted.'
    };
  }

  return {
    blocked: false,
    delayMs,
    forceFreshTurnstile: attemptCount >= 10 || distinctEmails >= 5
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of frictionTracker.entries()) {
    val.attempts = val.attempts.filter(t => now - t < 5 * 60 * 1000);
    if (val.attempts.length === 0) frictionTracker.delete(key);
  }
}, 5 * 60 * 1000).unref();

export const authController = {
  async register(req, res, next) {
    try {
      const friction = trackAndApplyFriction(req, req.body.email);
      if (friction.blocked) {
        return res.status(429).json({
          success: false,
          code: friction.code,
          message: friction.message
        });
      }
      if (friction.delayMs > 0) {
        await new Promise(r => setTimeout(r, friction.delayMs));
      }

      const user = await authService.register(req.body);
      res.status(200).json({
        success: true,
        requiresVerification: true,
        email: user.email,
        message: 'If this address is eligible, a message was dispatched.',
        user
      });
    } catch (err) {
      next(err);
    }
  },

  async resendVerification(req, res, next) {
    try {
      const friction = trackAndApplyFriction(req, req.body.email);
      if (friction.blocked) {
        return res.status(429).json({
          success: false,
          code: friction.code,
          message: friction.message
        });
      }
      if (friction.delayMs > 0) {
        await new Promise(r => setTimeout(r, friction.delayMs));
      }

      await authService.resendVerificationLink({
        email: req.body.email,
        password: req.body.password
      });
      res.json({
        success: true,
        message: 'If this address is eligible, a message was dispatched.'
      });
    } catch (err) {
      next(err);
    }
  },

  async forgotPassword(req, res, next) {
    try {
      const rawEmail = req.body.email;
      const normalizedEmail = normalizeInstitutionEmail(rawEmail);
      if (!normalizedEmail) {
        return res.status(400).json({
          success: false,
          message: 'Invalid institutional email address.'
        });
      }

      const friction = trackAndApplyFriction(req, normalizedEmail);
      if (friction.blocked) {
        return res.status(429).json({
          success: false,
          code: friction.code,
          message: friction.message
        });
      }
      if (friction.delayMs > 0) {
        await new Promise(r => setTimeout(r, friction.delayMs));
      }

      await authService.forgotPassword({ email: normalizedEmail });
      res.json({
        success: true,
        message: 'If this address is eligible, a message was dispatched.'
      });
    } catch (err) {
      next(err);
    }
  },

  async login(req, res, next) {
    try {
      const identifier = req.body.identifier || req.body.email || req.body.username;
      const friction = trackAndApplyFriction(req, identifier);
      if (friction.blocked) {
        return res.status(429).json({
          success: false,
          code: friction.code,
          message: friction.message
        });
      }
      if (friction.delayMs > 0) {
        await new Promise(r => setTimeout(r, friction.delayMs));
      }

      const result = await authService.login({
        identifier,
        email: req.body.email,
        password: req.body.password,
        userAgent: req.get('user-agent'),
        ip: req.ip
      });

      const cookieOpts = getCookieOptions(req);
      res.cookie('refresh_token', result.refreshToken, cookieOpts);
      res.cookie('refreshToken', result.refreshToken, cookieOpts);
      res.json({
        success: true,
        accessToken: result.accessToken,
        user: result.user
      });
    } catch (err) {
      next(err);
    }
  },

  async refresh(req, res, next) {
    try {
      const token = req.cookies?.refresh_token || req.cookies?.refreshToken;
      if (!token) {
        return res.status(401).json({ success: false, message: 'No active session token.' });
      }

      const result = await authService.refreshToken(token, req.get('user-agent'), req.ip);
      const cookieOpts = getCookieOptions(req);
      res.cookie('refresh_token', result.refreshToken, cookieOpts);
      res.cookie('refreshToken', result.refreshToken, cookieOpts);
      res.json({
        success: true,
        accessToken: result.accessToken,
        user: result.user
      });
    } catch (err) {
      res.clearCookie('refresh_token', { path: '/api/auth' });
      res.clearCookie('refreshToken', { path: '/api/auth' });
      next(err);
    }
  },

  async logout(req, res, next) {
    try {
      if (req.sessionId) {
        await authService.logout(req.sessionId);
      }
      res.clearCookie('refresh_token', { path: '/api/auth' });
      res.clearCookie('refreshToken', { path: '/api/auth' });
      res.json({ success: true, message: 'Session terminated.' });
    } catch (err) {
      next(err);
    }
  },

  async me(req, res) {
    res.json({
      success: true,
      user: {
        id: req.user.id,
        username: req.user.username,
        email: req.user.email,
        avatar: req.user.avatar,
        role: req.user.role,
        status: req.user.status,
        lastLoginAt: req.user.lastLoginAt,
        createdAt: req.user.createdAt
      }
    });
  }
};
