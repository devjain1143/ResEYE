import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { normalizeInstitutionEmail } from '../config/domain.js';
import { settingsService } from '../../services/settingsService.js';
import { emailService } from '../../services/emailService.js';
import { firebaseAuthService } from '../../services/firebaseAuthService.js';

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'reseye-dev-access-secret-389148';
const JWT_ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
const REFRESH_EXPIRES_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getAdminEmails() {
  const envAdmins = process.env.ADMIN_EMAILS || '';
  return envAdmins.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
}

export const authService = {
  async register({ username, email, password }) {
    const normalizedEmail = normalizeInstitutionEmail(email);
    if (!normalizedEmail) {
      const err = new Error('Invalid institutional email.');
      err.status = 400;
      throw err;
    }

    const mode = await settingsService.get('signup_mode', 'approval');
    if (mode === 'closed') {
      const err = new Error('Signups are currently closed.');
      err.status = 403;
      throw err;
    }

    const existingEmail = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingEmail && existingEmail.isEmailVerified) {
      const err = new Error('An account with this email already exists.');
      err.status = 400;
      throw err;
    }

    const existingUsername = await prisma.user.findUnique({ where: { username } });
    if (existingUsername && (!existingEmail || existingUsername.id !== existingEmail.id)) {
      const err = new Error('Username is already taken.');
      err.status = 400;
      throw err;
    }

    const adminEmails = getAdminEmails();
    const isAdmin = adminEmails.includes(normalizedEmail);
    const role = isAdmin ? 'ADMIN' : 'USER';
    const passwordHash = await bcrypt.hash(password, 10);

    let user;
    if (existingEmail && !existingEmail.isEmailVerified) {
      user = await prisma.user.update({
        where: { id: existingEmail.id },
        data: {
          username,
          passwordHash,
          role,
          status: 'PENDING'
        }
      });
    } else {
      user = await prisma.user.create({
        data: {
          username,
          email: normalizedEmail,
          passwordHash,
          role,
          status: 'PENDING',
          isEmailVerified: false
        }
      });
    }

    // Dispatch verification link via Firebase Authentication infrastructure
    await firebaseAuthService.sendVerificationLink({
      email: normalizedEmail,
      password
    });

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      requiresVerification: true,
      message: 'VERIFICATION LINK DISPATCHED TO INSTITUTION INBOX.'
    };
  },

  async resendVerificationLink({ email, password }) {
    if (!email) {
      const err = new Error('Email is required.');
      err.status = 400;
      throw err;
    }

    const normalizedEmail = normalizeInstitutionEmail(email);
    if (!normalizedEmail) {
      const err = new Error('Invalid institutional email.');
      err.status = 400;
      throw err;
    }

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      const err = new Error('Account not found.');
      err.status = 404;
      throw err;
    }

    if (user.isEmailVerified) {
      const err = new Error('Account is already verified. Please sign in.');
      err.status = 400;
      throw err;
    }

    await firebaseAuthService.sendVerificationLink({
      email: normalizedEmail,
      password: password || 'TempPassword123!'
    });

    return { success: true, message: 'Verification link re-sent to your institutional inbox.' };
  },

  async createAuthSession(user, userAgent = null, ip = null) {
    const isFirstLogin = !user.lastLoginAt;
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    const refreshToken = crypto.randomBytes(40).toString('hex');
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        refreshToken,
        userAgent,
        ip,
        expiresAt: new Date(Date.now() + REFRESH_EXPIRES_MS)
      }
    });

    const accessToken = jwt.sign(
      { userId: user.id, sessionId: session.id, role: user.role, status: user.status },
      JWT_ACCESS_SECRET,
      { expiresIn: JWT_ACCESS_EXPIRES_IN }
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        status: user.status,
        isEmailVerified: user.isEmailVerified,
        isFirstLogin
      }
    };
  },

  async checkEmail(raw) {
    if (!raw) return { exists: false, isEmail: false };
    const emailStr = String(raw).trim().toLowerCase();
    if (!emailStr.includes('@')) {
      return { exists: false, isEmail: false };
    }
    const normalized = normalizeInstitutionEmail(emailStr);
    if (!normalized) {
      return { exists: false, isEmail: true, validDomain: false };
    }
    const user = await prisma.user.findUnique({
      where: { email: normalized },
      select: { id: true, isEmailVerified: true }
    });
    return {
      exists: Boolean(user),
      isEmail: true,
      validDomain: true
    };
  },

  async login({ identifier, email, password, userAgent = null, ip = null }) {
    const rawId = String(identifier || email || '').trim();
    if (!rawId) {
      const err = new Error('Username or email is required.');
      err.status = 401;
      throw err;
    }

    let user = null;
    if (rawId.includes('@')) {
      const normalizedEmail = normalizeInstitutionEmail(rawId);
      if (!normalizedEmail) {
        const err = new Error('Invalid email or password.');
        err.status = 401;
        throw err;
      }
      user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (!user) {
        const err = new Error('No account found for this email. Please register.');
        err.status = 404;
        err.code = 'USER_NOT_FOUND';
        throw err;
      }
    } else {
      user = await prisma.user.findUnique({ where: { username: rawId } });
    }

    if (!user || !user.passwordHash) {
      const err = new Error('Invalid credentials.');
      err.status = 401;
      throw err;
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      const err = new Error('Invalid credentials.');
      err.status = 401;
      throw err;
    }

    if (user.status === 'BLOCKED') {
      const err = new Error('Your account has been revoked.');
      err.status = 403;
      err.code = 'ACCOUNT_BLOCKED';
      throw err;
    }

    if (!user.isEmailVerified) {
      // Check if user has clicked the Firebase email verification link
      const isVerified = await firebaseAuthService.checkEmailVerified({
        email: user.email,
        password
      });

      if (isVerified) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { isEmailVerified: true, status: 'ACTIVE' }
        });
      } else {
        const err = new Error('Institutional email not verified. Please click the verification link sent to your inbox.');
        err.status = 403;
        err.code = 'EMAIL_NOT_VERIFIED';
        err.email = user.email;
        throw err;
      }
    }

    // Bootstrap admin if added to ADMIN_EMAILS later
    const adminEmails = getAdminEmails();
    if (adminEmails.includes(user.email) && (user.role !== 'ADMIN' || user.status !== 'ACTIVE')) {
      await prisma.user.update({
        where: { id: user.id },
        data: { role: 'ADMIN', status: 'ACTIVE' }
      });
      user.role = 'ADMIN';
      user.status = 'ACTIVE';
    }

    return this.createAuthSession(user, userAgent, ip);
  },

  async refreshToken(token, userAgent = null, ip = null) {
    if (!token) {
      const err = new Error('Refresh token missing.');
      err.status = 401;
      throw err;
    }

    const session = await prisma.session.findUnique({
      where: { refreshToken: token },
      include: { user: true }
    });

    if (!session || session.expiresAt < new Date()) {
      if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      const err = new Error('Session expired.');
      err.status = 401;
      throw err;
    }

    if (session.user.status === 'BLOCKED') {
      await prisma.session.deleteMany({ where: { userId: session.userId } });
      const err = new Error('Your account has been revoked.');
      err.status = 403;
      err.code = 'ACCOUNT_BLOCKED';
      throw err;
    }

    // If email is verified, promote PENDING to ACTIVE
    if (session.user.isEmailVerified && session.user.status === 'PENDING') {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { status: 'ACTIVE' }
      });
      session.user.status = 'ACTIVE';
    }

    // Rotate refresh token
    const newRefreshToken = crypto.randomBytes(40).toString('hex');
    await prisma.session.update({
      where: { id: session.id },
      data: {
        refreshToken: newRefreshToken,
        userAgent: userAgent || session.userAgent,
        ip: ip || session.ip,
        expiresAt: new Date(Date.now() + REFRESH_EXPIRES_MS)
      }
    });

    const accessToken = jwt.sign(
      {
        userId: session.user.id,
        sessionId: session.id,
        role: session.user.role,
        status: session.user.status
      },
      JWT_ACCESS_SECRET,
      { expiresIn: JWT_ACCESS_EXPIRES_IN }
    );

    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: {
        id: session.user.id,
        username: session.user.username,
        email: session.user.email,
        avatar: session.user.avatar,
        role: session.user.role,
        status: session.user.status,
        isEmailVerified: session.user.isEmailVerified,
        lastLoginAt: session.user.lastLoginAt,
        createdAt: session.user.createdAt
      }
    };
  },

  async logout(sessionId) {
    if (!sessionId) return;
    await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
  },

  async findOrCreateGoogleUser({ email, avatar, userAgent = null, ip = null }) {
    const normalizedEmail = normalizeInstitutionEmail(email);
    if (!normalizedEmail) {
      const err = new Error('Google account must belong to the institution.');
      err.status = 400;
      throw err;
    }

    let user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    const adminEmails = getAdminEmails();
    const isAdmin = adminEmails.includes(normalizedEmail);

    if (!user) {
      const mode = await settingsService.get('signup_mode', 'open');
      if (mode === 'closed') {
        const err = new Error('Signups are currently closed.');
        err.status = 403;
        throw err;
      }

      const role = isAdmin ? 'ADMIN' : 'USER';
      const status = 'ACTIVE';

      // Derive clean username from email local part
      const local = normalizedEmail.split('@')[0];
      let baseUsername = local.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 16);
      let username = baseUsername;
      let counter = 1;
      while (await prisma.user.findUnique({ where: { username } })) {
        username = `${baseUsername}_${counter++}`;
      }

      user = await prisma.user.create({
        data: {
          username,
          email: normalizedEmail,
          avatar: avatar || null,
          role,
          status,
          isEmailVerified: true
        }
      });
    } else {
      // If already registered and email is verified, ensure ACTIVE clearance
      if (user.status === 'PENDING') {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { status: 'ACTIVE', isEmailVerified: true }
        });
      } else if (isAdmin && (user.role !== 'ADMIN' || user.status !== 'ACTIVE')) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { role: 'ADMIN', status: 'ACTIVE', isEmailVerified: true }
        });
      }
    }

    if (user.status === 'BLOCKED') {
      const err = new Error('Your account has been revoked.');
      err.status = 403;
      err.code = 'ACCOUNT_BLOCKED';
      throw err;
    }

    return this.createAuthSession(user, userAgent, ip);
  }
};
