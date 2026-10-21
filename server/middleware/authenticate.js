import jwt from 'jsonwebtoken';
import prisma from '../kit/lib/prisma.js';

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'reseye-dev-access-secret-389148';

export async function authenticate(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: 'Unauthorized.' });

  let payload;
  try {
    payload = jwt.verify(token, JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ success: false, message: 'Unauthorized.' });
  }

  const session = await prisma.session.findUnique({
    where: { id: payload.sessionId },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          email: true,
          avatar: true,
          role: true,
          status: true,
          isEmailVerified: true,
          lastLoginAt: true,
          createdAt: true
        }
      }
    },
  });

  if (!session || session.userId !== payload.userId || session.expiresAt < new Date()) {
    return res.status(401).json({ success: false, message: 'Session expired.' });
  }

  if (session.user.status === 'BLOCKED') {
    return res.status(403).json({
      success: false,
      code: 'ACCOUNT_BLOCKED',
      message: 'Your access has been revoked.'
    });
  }

  if (session.user.status === 'PENDING') {
    if (session.user.isEmailVerified) {
      session.user.status = 'ACTIVE';
    } else {
      return res.status(403).json({
        success: false,
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Please verify your institutional email address to access the archive.'
      });
    }
  }

  req.user = session.user;
  req.user.authTime = payload.authTime || Math.floor(session.createdAt.getTime() / 1000);
  req.sessionId = session.id;
  next();
}

export async function authenticateAllowPending(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: 'Unauthorized.' });

  let payload;
  try {
    payload = jwt.verify(token, JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ success: false, message: 'Unauthorized.' });
  }

  const session = await prisma.session.findUnique({
    where: { id: payload.sessionId },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          email: true,
          avatar: true,
          role: true,
          status: true,
          isEmailVerified: true
        }
      }
    },
  });

  if (!session || session.userId !== payload.userId || session.expiresAt < new Date()) {
    return res.status(401).json({ success: false, message: 'Session expired.' });
  }

  if (session.user.status === 'BLOCKED') {
    return res.status(403).json({
      success: false,
      code: 'ACCOUNT_BLOCKED',
      message: 'Your access has been revoked.'
    });
  }

  req.user = session.user;
  req.sessionId = session.id;
  next();
}
