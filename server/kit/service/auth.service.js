import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { normalizeInstitutionEmail } from '../config/domain.js';
import { settingsService } from '../../services/settingsService.js';
import { emailService } from '../../services/emailService.js';
import { firebaseAuthService } from '../../services/firebaseAuthService.js';
import { hashToken } from '../../crypto/index.js';

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'reseye-dev-access-secret-389148';
const JWT_ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
const REFRESH_EXPIRES_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Fixed bcrypt hash with cost 12 for constant-time comparison when account is missing
const DUMMY_HASH = '$2a$12$e80MvQkK1qQzX75H6N1sO.99L0sF9EwE0/H.0h2F377s7X7X7X7X.';

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
    const existingUsername = username ? await prisma.user.findUnique({ where: { username } }) : null;

    if (existingEmail || (existingUsername && (!existingEmail || existingUsername.id !== existingEmail.id))) {
      // Account exists: equalize timing with cost 12 hash and return uniform response
      await bcrypt.hash(password || 'dummyPassword', 12);
      return {
        id: null,
        username,
        email: normalizedEmail,
        requiresVerification: true,
        message: 'If this address is eligible, a message was dispatched.'
      };
    }

    const adminEmails = getAdminEmails();
    const isAdmin = adminEmails.includes(normalizedEmail);
    const role = isAdmin ? 'ADMIN' : 'USER';
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        username,
        email: normalizedEmail,
        passwordHash,
        role,
        status: 'PENDING',
        isEmailVerified: false
      }
    });

    // Dispatch verification link via Firebase Authentication
    await firebaseAuthService.sendVerificationLink({
      email: normalizedEmail,
      password
    }).catch(err => {
      console.warn('[AuthService] Firebase verification send error:', err.message);
    });

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      requiresVerification: true,
      message: 'If this address is eligible, a message was dispatched.'
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
    if (!user || user.isEmailVerified || !user.passwordHash) {
      // Equalize timing via dummy compare
      await bcrypt.compare(password || 'dummyPassword', DUMMY_HASH);
      return { success: true, message: 'If this address is eligible, a message was dispatched.' };
    }

    const isValid = await bcrypt.compare(password || '', user.passwordHash);
    if (isValid) {
      await firebaseAuthService.sendVerificationLink({
        email: normalizedEmail,
        password: password || 'TempPassword123!'
      }).catch(err => {
        console.warn('[AuthService] Firebase resend link error:', err.message);
      });
    }

    return { success: true, message: 'If this address is eligible, a message was dispatched.' };
  },

  async forgotPassword({ email }) {
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
    if (user && user.status !== 'BLOCKED') {
      await firebaseAuthService.sendPasswordResetLink({ email: normalizedEmail }).catch(err => {
        console.warn('[AuthService] Firebase password reset error:', err.message);
      });
    } else {
      await bcrypt.compare('dummyPassword', DUMMY_HASH);
    }

    return {
      success: true,
      message: 'If this address is eligible, a message was dispatched.'
    };
  },

  async createAuthSession(user, userAgent = null, ip = null) {
    const isFirstLogin = !user.lastLoginAt;
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    const rawRefreshToken = crypto.randomBytes(40).toString('hex');
    const hashedRefreshToken = hashToken(rawRefreshToken);
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        refreshToken: hashedRefreshToken,
        userAgent,
        ip,
        expiresAt: new Date(Date.now() + REFRESH_EXPIRES_MS)
      }
    });

    const authTime = Math.floor(Date.now() / 1000);
    const accessToken = jwt.sign(
      { userId: user.id, sessionId: session.id, role: user.role, status: user.status, authTime },
      JWT_ACCESS_SECRET,
      { expiresIn: JWT_ACCESS_EXPIRES_IN }
    );

    return {
      accessToken,
      refreshToken: rawRefreshToken,
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

  async login({ identifier, email, password, userAgent = null, ip = null }) {
    const rawId = String(identifier || email || '').trim();
    if (!rawId) {
      const err = new Error('Email or password is incorrect.');
      err.status = 401;
      throw err;
    }

    let user = null;
    if (rawId.includes('@')) {
      const normalizedEmail = normalizeInstitutionEmail(rawId);
      if (!normalizedEmail) {
        await bcrypt.compare(password || '', DUMMY_HASH);
        const err = new Error('Email or password is incorrect.');
        err.status = 401;
        throw err;
      }
      user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    } else {
      user = await prisma.user.findUnique({ where: { username: rawId } });
    }

    if (!user || !user.passwordHash) {
      await bcrypt.compare(password || '', DUMMY_HASH);
      const err = new Error('Email or password is incorrect.');
      err.status = 401;
      throw err;
    }

    const isValid = await bcrypt.compare(password || '', user.passwordHash);
    if (!isValid) {
      const err = new Error('Email or password is incorrect.');
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
        const err = new Error(`Verification mail has been sent to ${user.email}. Please check your inbox and junk folder.`);
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

    const hashedToken = hashToken(token);
    let session = await prisma.session.findUnique({
      where: { refreshToken: hashedToken },
      include: { user: true }
    });

    if (!session) {
      session = await prisma.session.findUnique({
        where: { refreshToken: token },
        include: { user: true }
      });
    }

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
    const newRawRefreshToken = crypto.randomBytes(40).toString('hex');
    const newHashedRefreshToken = hashToken(newRawRefreshToken);
    await prisma.session.update({
      where: { id: session.id },
      data: {
        refreshToken: newHashedRefreshToken,
        userAgent: userAgent || session.userAgent,
        ip: ip || session.ip,
        expiresAt: new Date(Date.now() + REFRESH_EXPIRES_MS)
      }
    });

    const authTime = Math.floor(session.createdAt.getTime() / 1000);
    const accessToken = jwt.sign(
      {
        userId: session.user.id,
        sessionId: session.id,
        role: session.user.role,
        status: session.user.status,
        authTime
      },
      JWT_ACCESS_SECRET,
      { expiresIn: JWT_ACCESS_EXPIRES_IN }
    );

    return {
      accessToken,
      refreshToken: newRawRefreshToken,
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
