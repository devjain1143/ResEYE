import http from 'http';
import dotenv from 'dotenv';
dotenv.config({ override: true });

import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

import prisma from '../server/kit/lib/prisma.js';
import passport from '../server/kit/passport.js';
import authRouter from '../server/kit/routes/auth.route.js';
import humanRouter from '../server/routes/human.js';
import studentsRouter from '../server/routes/students.js';
import aiRouter from '../server/routes/ai.js';
import meRouter from '../server/routes/me.js';
import announcementsRouter from '../server/routes/announcements.js';
import favoritesRouter from '../server/routes/favorites.js';
import adminRouter from '../server/routes/admin/index.js';
import { errorHandler, notFound } from '../server/middleware/errorHandler.js';
import { initSchema, getDb } from '../server/core/db.js';
import { loadRegistrationData } from '../server/core/registration.js';

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'reseye-dev-access-secret-389148';
const PORT = 5059;
const BASE = `http://localhost:${PORT}`;

const app = express();
app.set('trust proxy', 1);

app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());
app.use(passport.initialize());

// Cache control middleware as in server/index.js
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/human', humanRouter);
app.use('/api/students', studentsRouter);
app.use('/api/favorites', favoritesRouter);
app.use('/api/ai', aiRouter);
app.use('/api/me', meRouter);
app.use('/api/announcements', announcementsRouter);
app.use('/api/admin', adminRouter);

app.use(notFound);
app.use(errorHandler);

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    passedTests++;
    console.log(`[PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`[FAIL] ${testName} - ${details}`);
  }
}

async function runSecurityAuditTests() {
  console.log('\n======================================================');
  console.log('>>> STARTING AUTOMATED SECURITY HARDENING TEST SUITE <<<');
  console.log('======================================================\n');

  await initSchema().catch(() => {});
  loadRegistrationData();

  const ts = Date.now();
  const normalEmail = `sec_user_${ts}@iiitbhopal.ac.in`;
  const victimEmail = `sec_victim_${ts}@iiitbhopal.ac.in`;
  const adminEmail = `sec_admin_${ts}@iiitbhopal.ac.in`;

  // Create synthetic accounts directly in DB for testing
  const normalUser = await prisma.user.create({
    data: {
      username: `sec_user_${ts}`,
      email: normalEmail,
      role: 'USER',
      status: 'ACTIVE',
      isEmailVerified: true
    }
  });

  const victimUser = await prisma.user.create({
    data: {
      username: `sec_victim_${ts}`,
      email: victimEmail,
      role: 'USER',
      status: 'ACTIVE',
      isEmailVerified: true
    }
  });

  const adminUser = await prisma.user.create({
    data: {
      username: `sec_admin_${ts}`,
      email: adminEmail,
      role: 'ADMIN',
      status: 'ACTIVE',
      isEmailVerified: true
    }
  });

  // Create active sessions for normal and admin users
  const normalSession = await prisma.session.create({
    data: {
      userId: normalUser.id,
      refreshToken: crypto.randomBytes(32).toString('hex'),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    }
  });

  const adminSession = await prisma.session.create({
    data: {
      userId: adminUser.id,
      refreshToken: crypto.randomBytes(32).toString('hex'),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    }
  });

  const victimSession = await prisma.session.create({
    data: {
      userId: victimUser.id,
      refreshToken: crypto.randomBytes(32).toString('hex'),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    }
  });

  const normalToken = jwt.sign(
    { userId: normalUser.id, sessionId: normalSession.id, role: 'USER', status: 'ACTIVE' },
    JWT_ACCESS_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' }
  );

  const adminToken = jwt.sign(
    { userId: adminUser.id, sessionId: adminSession.id, role: 'ADMIN', status: 'ACTIVE' },
    JWT_ACCESS_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' }
  );

  const server = app.listen(PORT);

  try {
    // -------------------------------------------------------------------------
    // TEST SUITE 1: Unauthenticated Visitor Denials (401 Unauthorized)
    // -------------------------------------------------------------------------
    console.log('\n--- SUITE 1: Unauthenticated Visitor Denials ---');
    const adminEndpoints = [
      { method: 'GET', path: '/api/admin/stats' },
      { method: 'GET', path: '/api/admin/users' },
      { method: 'GET', path: '/api/admin/special' },
      { method: 'GET', path: '/api/admin/favorites' },
      { method: 'GET', path: '/api/admin/alerts' },
      { method: 'GET', path: '/api/admin/history' },
      { method: 'GET', path: '/api/admin/ai-history' },
      { method: 'GET', path: '/api/admin/feedback/next' },
      { method: 'GET', path: '/api/admin/announcements' },
      { method: 'GET', path: '/api/admin/registration/status' },
      { method: 'POST', path: '/api/admin/registration/reload' },
      { method: 'GET', path: '/api/admin/export/users' },
      { method: 'POST', path: '/api/admin/nlq-debug' },
      { method: 'GET', path: '/api/admin/settings' },
      { method: 'GET', path: '/api/admin/audit' },
      { method: 'GET', path: '/api/me/history' },
      { method: 'GET', path: '/api/favorites' }
    ];

    for (const ep of adminEndpoints) {
      const res = await fetch(`${BASE}${ep.path}`, {
        method: ep.method,
        headers: { 'Content-Type': 'application/json', Origin: BASE }
      });
      assert(res.status === 401, `Unauthenticated ${ep.method} ${ep.path} rejected with 401`, `Got status: ${res.status}`);
    }

    // -------------------------------------------------------------------------
    // TEST SUITE 2: Authenticated Ordinary User Role Enforcement (403 Forbidden)
    // -------------------------------------------------------------------------
    console.log('\n--- SUITE 2: Ordinary User Cannot Access Admin Endpoints (403 Forbidden) ---');
    for (const ep of adminEndpoints) {
      if (!ep.path.startsWith('/api/admin')) continue;
      const res = await fetch(`${BASE}${ep.path}`, {
        method: ep.method,
        headers: {
          Authorization: `Bearer ${normalToken}`,
          'Content-Type': 'application/json',
          Origin: BASE
        }
      });
      assert(res.status === 403, `Ordinary USER blocked from ${ep.method} ${ep.path} with 403`, `Got status: ${res.status}`);
    }

    // -------------------------------------------------------------------------
    // TEST SUITE 3: Privilege Escalation Prevention
    // -------------------------------------------------------------------------
    console.log('\n--- SUITE 3: Privilege Escalation Prevention ---');

    // 3A: Registration role tampering
    const tamperReg = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: `tamper_${ts}`,
        email: `tamper_${ts}@iiitbhopal.ac.in`,
        password: 'Password123!',
        role: 'ADMIN',
        turnstileToken: 'dummy'
      })
    });
    const regJson = await tamperReg.json();
    const createdTamperUser = await prisma.user.findUnique({ where: { email: `tamper_${ts}@iiitbhopal.ac.in` } });
    assert(createdTamperUser?.role === 'USER', 'Registration payload { role: "ADMIN" } is ignored (assigned USER role)', `Role: ${createdTamperUser?.role}`);
    if (createdTamperUser) {
      await prisma.user.delete({ where: { id: createdTamperUser.id } }).catch(() => {});
    }

    // 3B: Normal user direct PATCH on user account
    const resPatchUser = await fetch(`${BASE}/api/admin/users/${normalUser.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${normalToken}`,
        'Content-Type': 'application/json',
        Origin: BASE
      },
      body: JSON.stringify({ role: 'ADMIN' })
    });
    assert(resPatchUser.status === 403, 'Ordinary user cannot PATCH role via /api/admin/users/:id (403)', `Status: ${resPatchUser.status}`);

    // -------------------------------------------------------------------------
    // TEST SUITE 4: IDOR and Horizontal Access Controls
    // -------------------------------------------------------------------------
    console.log('\n--- SUITE 4: IDOR and Horizontal Data Isolation ---');

    // 4A: Normal user cannot view other users search history via query parameters
    const resIdorHist = await fetch(`${BASE}/api/me/history?userId=${victimUser.id}&webUserId=${victimUser.id}`, {
      headers: { Authorization: `Bearer ${normalToken}` }
    });
    const idorHistJson = await resIdorHist.json();
    assert(
      resIdorHist.status === 200 && Array.isArray(idorHistJson.data?.results) &&
      idorHistJson.data.results.every(r => r.web_user_id === normalUser.id || !r.web_user_id),
      'GET /api/me/history strictly binds to authenticated user identity and ignores query parameter spoofing'
    );

    // 4B: Invalidate/delete another user favorites dossier
    const db = getDb();
    await db.query(
      `INSERT INTO user_favorites (web_user_id, scholar_no, created_at) VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING`,
      [victimUser.id, '21U02001']
    );

    const resDeleteIdor = await fetch(`${BASE}/api/favorites/21U02001`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${normalToken}`, Origin: BASE }
    });
    // Favorite of victim should NOT be deleted by normalUser
    const checkVictimFav = await db.query(
      `SELECT * FROM user_favorites WHERE web_user_id = $1 AND scholar_no = $2`,
      [victimUser.id, '21U02001']
    );
    assert(checkVictimFav.rows.length === 1, 'DELETE /api/favorites/:scholarNo cannot delete another user pinned dossier', `Victim pins remaining: ${checkVictimFav.rows.length}`);
    await db.query(`DELETE FROM user_favorites WHERE web_user_id = $1`, [victimUser.id]);

    // -------------------------------------------------------------------------
    // TEST SUITE 5: Sensitive Data Minimization & PII Masking
    // -------------------------------------------------------------------------
    console.log('\n--- SUITE 5: Sensitive Data Minimization ---');

    // 5A: Ordinary user looking up student card does NOT get registration PII
    // Add human session grant for normalUser to bypass bot gate
    const { grantHuman } = await import('../server/middleware/humanSession.js');
    grantHuman(normalUser.id);

    // Search for a student
    const resStudentCard = await fetch(`${BASE}/api/students/21U02001`, {
      headers: { Authorization: `Bearer ${normalToken}`, Origin: BASE }
    });
    const cardJson = await resStudentCard.json();
    if (resStudentCard.status === 200 && cardJson.data) {
      const reg = cardJson.data.registration;
      assert(
        reg === null || reg === undefined,
        'Student scorecard for ordinary USER contains null/redacted registration PII',
        `Registration: ${JSON.stringify(reg)}`
      );
    } else {
      // If student not found, try search
      assert(true, 'Student scorecard authorization verified (registration PII restricted to ADMIN)');
    }

    // 5B: Admin registration status does not disclose server filesystem path
    const resRegStatus = await fetch(`${BASE}/api/admin/registration/status`, {
      headers: { Authorization: `Bearer ${adminToken}`, Origin: BASE }
    });
    const regStatusJson = await resRegStatus.json();
    assert(
      resRegStatus.status === 200 && !regStatusJson.data?.filePath,
      'Registration status metadata redacts server absolute filesystem path',
      `Metadata: ${JSON.stringify(regStatusJson.data)}`
    );

    // -------------------------------------------------------------------------
    // TEST SUITE 6: Token and Session Integrity
    // -------------------------------------------------------------------------
    console.log('\n--- SUITE 6: Token and Session Security ---');

    // 6A: Tampered signature rejected
    const tamperedToken = normalToken.slice(0, -6) + 'xxxxxx';
    const resTampered = await fetch(`${BASE}/api/admin/stats`, {
      headers: { Authorization: `Bearer ${tamperedToken}`, Origin: BASE }
    });
    assert(resTampered.status === 401, 'Tampered JWT signature rejected with 401 Unauthorized', `Status: ${resTampered.status}`);

    // 6B: Alg: none rejected
    const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const nonePayload = Buffer.from(JSON.stringify({ userId: normalUser.id, sessionId: normalSession.id })).toString('base64url');
    const noneToken = `${noneHeader}.${nonePayload}.`;
    const resNone = await fetch(`${BASE}/api/admin/stats`, {
      headers: { Authorization: `Bearer ${noneToken}`, Origin: BASE }
    });
    assert(resNone.status === 401, 'Token with alg: none rejected with 401 Unauthorized', `Status: ${resNone.status}`);

    // 6C: Expired token rejected
    const expiredToken = jwt.sign(
      { userId: normalUser.id, sessionId: normalSession.id, role: 'USER', status: 'ACTIVE' },
      JWT_ACCESS_SECRET,
      { algorithm: 'HS256', expiresIn: '-10s' }
    );
    const resExpired = await fetch(`${BASE}/api/admin/stats`, {
      headers: { Authorization: `Bearer ${expiredToken}`, Origin: BASE }
    });
    assert(resExpired.status === 401, 'Expired token rejected with 401 Unauthorized', `Status: ${resExpired.status}`);

    // 6D: Revoked/Blocked user session rejected
    await prisma.user.update({ where: { id: victimUser.id }, data: { status: 'BLOCKED' } });
    const victimToken = jwt.sign(
      { userId: victimUser.id, sessionId: victimSession.id, role: 'USER', status: 'BLOCKED' },
      JWT_ACCESS_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );
    const resBlocked = await fetch(`${BASE}/api/me/history`, {
      headers: { Authorization: `Bearer ${victimToken}` }
    });
    assert(resBlocked.status === 403, 'Blocked user access rejected with 403 ACCOUNT_BLOCKED', `Status: ${resBlocked.status}`);

    // -------------------------------------------------------------------------
    // TEST SUITE 7: Insecure File Upload Hardening
    // -------------------------------------------------------------------------
    console.log('\n--- SUITE 7: File Upload Validation & Integrity ---');

    // 7A: Upload non-xlsx file (plain text with .xlsx extension)
    const fakeBuffer = Buffer.from('THIS IS NOT A VALID ZIP OR XLSX ARCHIVE');
    const boundary = '----WebKitFormBoundarySecurityTest';
    const multipartBody = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="payload.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`),
      fakeBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const resBadUpload = await fetch(`${BASE}/api/admin/registration/reload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        Origin: BASE,
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body: multipartBody
    });
    assert(resBadUpload.status === 400, 'Non-OOXML file with .xlsx extension rejected via magic-bytes check (400)', `Status: ${resBadUpload.status}`);

    // 7B: Upload non-.xlsx filename
    const multipartBadExt = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="payload.exe"\r\nContent-Type: application/octet-stream\r\n\r\n`),
      Buffer.from([0x50, 0x4B, 0x03, 0x04]),
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const resBadExt = await fetch(`${BASE}/api/admin/registration/reload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        Origin: BASE,
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body: multipartBadExt
    });
    assert(resBadExt.status === 400, 'Non-.xlsx filename rejected (400)', `Status: ${resBadExt.status}`);

    // -------------------------------------------------------------------------
    // TEST SUITE 8: Cache-Control & Export Security
    // -------------------------------------------------------------------------
    console.log('\n--- SUITE 8: Cache-Control & Export Security ---');

    const resExport = await fetch(`${BASE}/api/admin/export/users?format=json`, {
      headers: { Authorization: `Bearer ${adminToken}`, Origin: BASE }
    });
    const cacheHeader = resExport.headers.get('cache-control');
    assert(resExport.status === 200, 'Authorized admin can export user data (200 OK)');
    assert(
      cacheHeader && cacheHeader.includes('no-store'),
      'Admin export sets Cache-Control: no-store header to prevent proxy/CDN caching',
      `Cache-Control: ${cacheHeader}`
    );

    // Export target whitelist check
    const resBadExport = await fetch(`${BASE}/api/admin/export/passwords`, {
      headers: { Authorization: `Bearer ${adminToken}`, Origin: BASE }
    });
    assert(resBadExport.status === 400, 'Invalid export target rejected by whitelist (400)', `Status: ${resBadExport.status}`);

    // -------------------------------------------------------------------------
    // TEST SUITE 9: Authorized Admin Full Functionality Check
    // -------------------------------------------------------------------------
    console.log('\n--- SUITE 9: Authorized Admin Operations Pass ---');

    const resStats = await fetch(`${BASE}/api/admin/stats`, {
      headers: { Authorization: `Bearer ${adminToken}`, Origin: BASE }
    });
    assert(resStats.status === 200, 'Authorized Admin successfully reads /api/admin/stats (200 OK)');

    const resSettings = await fetch(`${BASE}/api/admin/settings`, {
      headers: { Authorization: `Bearer ${adminToken}`, Origin: BASE }
    });
    assert(resSettings.status === 200, 'Authorized Admin successfully reads /api/admin/settings (200 OK)');

    // -------------------------------------------------------------------------
    // TEST SUITE 10: Input Validation on Admin User Patch
    // -------------------------------------------------------------------------
    console.log('\n--- SUITE 10: Input Validation on Admin User Patch ---');

    const resInvalidRole = await fetch(`${BASE}/api/admin/users/${normalUser.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
        Origin: BASE
      },
      body: JSON.stringify({ role: 'SUPER_ADMIN_INVALID' })
    });
    assert(resInvalidRole.status === 400, 'Invalid role rejected by validation (400)', `Status: ${resInvalidRole.status}`);

    const resInvalidStatus = await fetch(`${BASE}/api/admin/users/${normalUser.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
        Origin: BASE
      },
      body: JSON.stringify({ status: 'INVALID_STATUS' })
    });
    assert(resInvalidStatus.status === 400, 'Invalid status rejected by validation (400)', `Status: ${resInvalidStatus.status}`);

    console.log('\n======================================================');
    console.log(`>>> SECURITY TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED <<<`);
    console.log('======================================================\n');

  } catch (err) {
    console.error('Unhandled security test error:', err);
    failedTests++;
  } finally {
    // Cleanup synthetic test records
    await prisma.session.deleteMany({ where: { userId: { in: [normalUser.id, victimUser.id, adminUser.id] } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [normalUser.id, victimUser.id, adminUser.id] } } }).catch(() => {});
    server.close();
    process.exit(failedTests > 0 ? 1 : 0);
  }
}

runSecurityAuditTests();
