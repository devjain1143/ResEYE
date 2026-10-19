import { authService } from '../service/auth.service.js';
import { firebaseAuthService } from '../../services/firebaseAuthService.js';
import { normalizeInstitutionEmail } from '../config/domain.js';

const COOKIE_NAME = 'refreshToken';
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/api/auth'
};

export const authController = {
  async register(req, res, next) {
    try {
      const user = await authService.register(req.body);
      res.status(200).json({
        success: true,
        requiresVerification: true,
        email: user.email,
        message: user.message || 'VERIFICATION LINK DISPATCHED TO INSTITUTION INBOX. (PLEASE CHECK JUNK / SPAM FOLDER).',
        user
      });
    } catch (err) {
      next(err);
    }
  },

  async checkEmail(req, res, next) {
    try {
      const raw = req.query.email || req.query.identifier;
      const result = await authService.checkEmail(raw);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  },

  async resendVerification(req, res, next) {
    try {
      const result = await authService.resendVerificationLink({
        email: req.body.email,
        password: req.body.password
      });
      res.json({
        success: true,
        message: result.message || 'NEW VERIFICATION LINK TRANSMITTED. (PLEASE CHECK JUNK / SPAM FOLDER).'
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

      const result = await firebaseAuthService.sendPasswordResetLink({ email: normalizedEmail });
      res.json({
        success: true,
        message: result.message || 'PASSWORD RESET LINK DISPATCHED TO INBOX.'
      });
    } catch (err) {
      next(err);
    }
  },

  async login(req, res, next) {
    try {
      const result = await authService.login({
        identifier: req.body.identifier || req.body.email || req.body.username,
        email: req.body.email,
        password: req.body.password,
        userAgent: req.get('user-agent'),
        ip: req.ip
      });

      res.cookie(COOKIE_NAME, result.refreshToken, COOKIE_OPTIONS);
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
      const token = req.cookies?.[COOKIE_NAME];
      if (!token) {
        return res.status(401).json({ success: false, message: 'No active session token.' });
      }

      const result = await authService.refreshToken(token, req.get('user-agent'), req.ip);
      res.cookie(COOKIE_NAME, result.refreshToken, COOKIE_OPTIONS);
      res.json({
        success: true,
        accessToken: result.accessToken,
        user: result.user
      });
    } catch (err) {
      res.clearCookie(COOKIE_NAME, { path: '/api/auth' });
      next(err);
    }
  },

  async logout(req, res, next) {
    try {
      if (req.sessionId) {
        await authService.logout(req.sessionId);
      }
      res.clearCookie(COOKIE_NAME, { path: '/api/auth' });
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
