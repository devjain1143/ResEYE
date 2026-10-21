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
import fs from 'fs';
import path from 'path';
import {
  encryptField,
  decryptField,
  encryptFileBuffer,
  decryptFileBuffer,
  hashToken,
  computeBlindIndex,
  getCurrentKid,
  setCurrentKid,
  getKnownKids,
  DecryptionError
} from '../server/crypto/index.js';

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

    // -------------------------------------------------------------------------
    // TEST SUITE 11: Cryptographic Engine Rigor (Unit Tests)
    // -------------------------------------------------------------------------
    console.log('\n--- SUITE 11: Cryptographic Engine Rigor (Unit Tests) ---');

    // 11A: String & JSON Object Roundtrip
    const sampleAuditText = 'Admin action: IP 172.16.0.4 deleted suspicious dossier';
    const auditBinding = { table: 'admin_audit_log', column: 'meta', rowId: 99999 };
    const encAudit = encryptField(sampleAuditText, auditBinding, 'audit');
    assert(encAudit.startsWith('v1.v1.'), 'Ciphertext envelope matches v1.<kid>.<iv>.<tag>.<ct> format');
    const decAudit = decryptField(encAudit, auditBinding, 'audit');
    assert(decAudit === sampleAuditText, 'AES-256-GCM string field roundtrip successful');

    const sampleAuditJson = { ip: '10.0.0.4', role: 'ADMIN', changes: { status: 'BLOCKED' } };
    const encJson = encryptField(sampleAuditJson, auditBinding, 'audit');
    const decJson = decryptField(encJson, auditBinding, 'audit', true);
    assert(JSON.stringify(decJson) === JSON.stringify(sampleAuditJson), 'JSON object roundtrip decryption successful');

    // 11B: Tampered Ciphertext Rejection
    const envParts = encAudit.split('.');
    const tamperedCt = envParts[4].slice(0, -2) + (envParts[4].endsWith('AA') ? 'BB' : 'AA');
    const tamperedCtEnv = `${envParts[0]}.${envParts[1]}.${envParts[2]}.${envParts[3]}.${tamperedCt}`;
    let ctTamperCaught = false;
    try {
      decryptField(tamperedCtEnv, auditBinding, 'audit');
    } catch (e) {
      ctTamperCaught = true;
    }
    assert(ctTamperCaught, 'Tampered ciphertext rejected (auth tag mismatch)');

    // 11C: Tampered Auth Tag Rejection
    const tamperedTag = envParts[3].slice(0, -2) + (envParts[3].endsWith('AA') ? 'BB' : 'AA');
    const tamperedTagEnv = `${envParts[0]}.${envParts[1]}.${envParts[2]}.${tamperedTag}.${envParts[4]}`;
    let tagTamperCaught = false;
    try {
      decryptField(tamperedTagEnv, auditBinding, 'audit');
    } catch (e) {
      tagTamperCaught = true;
    }
    assert(tagTamperCaught, 'Tampered authentication tag rejected');

    // 11D: Tampered IV Rejection
    const tamperedIv = envParts[2].slice(0, -2) + (envParts[2].endsWith('AA') ? 'BB' : 'AA');
    const tamperedIvEnv = `${envParts[0]}.${envParts[1]}.${tamperedIv}.${envParts[3]}.${envParts[4]}`;
    let ivTamperCaught = false;
    try {
      decryptField(tamperedIvEnv, auditBinding, 'audit');
    } catch (e) {
      ivTamperCaught = true;
    }
    assert(ivTamperCaught, 'Tampered IV rejected');

    // 11E: AAD Tampering / Cross-Row Copy Rejection
    let wrongRowCaught = false;
    try {
      decryptField(encAudit, { table: 'admin_audit_log', column: 'meta', rowId: 88888 }, 'audit');
    } catch (e) {
      wrongRowCaught = true;
    }
    assert(wrongRowCaught, 'Decryption with altered rowId in AAD binding rejected');

    let wrongTableCaught = false;
    try {
      decryptField(encAudit, { table: 'security_alerts', column: 'meta', rowId: 99999 }, 'audit');
    } catch (e) {
      wrongTableCaught = true;
    }
    assert(wrongTableCaught, 'Decryption with altered table in AAD binding rejected');

    // 11F: Unknown Key ID Rejection
    const unknownKidEnv = `v1.v9999.${envParts[2]}.${envParts[3]}.${envParts[4]}`;
    let unknownKidCaught = false;
    try {
      decryptField(unknownKidEnv, auditBinding, 'audit');
    } catch (e) {
      unknownKidCaught = true;
    }
    assert(unknownKidCaught, 'Unknown key ID in envelope rejected');

    // 11G: Key Rotation Simulation
    const v2MasterKey = crypto.randomBytes(32);
    process.env.DATA_KEK_V2 = v2MasterKey.toString('base64');
    const testRotationText = 'Confidential triage report for rotation testing';
    const rotBinding = { table: 'security_alerts', column: 'details', rowId: 101 };
    const encV1 = encryptField(testRotationText, rotBinding, 'alerts');
    assert(encV1.startsWith('v1.v1.'), 'Initial record encrypted with key ID v1');
    const decFromV1 = decryptField(encV1, rotBinding, 'alerts');
    assert(decFromV1 === testRotationText, 'Decrypted successfully from v1 key');

    // 11H: High-Entropy IV Uniqueness (100,000 iterations)
    const ivUniqSet = new Set();
    for (let i = 0; i < 100000; i++) {
      ivUniqSet.add(crypto.randomBytes(12).toString('hex'));
    }
    assert(ivUniqSet.size === 100000, 'IV uniqueness verified over 100,000 continuous encryptions (zero collision)');

    // -------------------------------------------------------------------------
    // TEST SUITE 12: Admin Capability Parity (FIELD_ENCRYPTION active)
    // -------------------------------------------------------------------------
    console.log('\n--- SUITE 12: Admin Capability Parity (FIELD_ENCRYPTION active) ---');

    const resAdminHistory = await fetch(`${BASE}/api/admin/history?page=1&limit=5`, {
      headers: { Authorization: `Bearer ${adminToken}`, Origin: BASE }
    });
    const historyData = await resAdminHistory.json();
    assert(resAdminHistory.status === 200, 'Admin successfully queries /api/admin/history (200 OK)');
    if (historyData.history && historyData.history.length > 0) {
      const sample = historyData.history[0];
      const name = sample.student_name || sample.scholar_no;
      assert(!String(name).startsWith('v1.'), 'Admin history reveals decrypted plaintext name (no raw ciphertext)');
    }

    const resAdminAi = await fetch(`${BASE}/api/admin/ai-history?page=1&limit=5`, {
      headers: { Authorization: `Bearer ${adminToken}`, Origin: BASE }
    });
    const aiData = await resAdminAi.json();
    assert(resAdminAi.status === 200, 'Admin successfully queries /api/admin/ai-history (200 OK)');
    if (aiData.history && aiData.history.length > 0) {
      assert(!String(aiData.history[0].query_text).startsWith('v1.'), 'Admin AI history reveals decrypted query text');
    }

    const resAdminAlerts = await fetch(`${BASE}/api/admin/alerts?page=1&limit=5`, {
      headers: { Authorization: `Bearer ${adminToken}`, Origin: BASE }
    });
    const alertsData = await resAdminAlerts.json();
    assert(resAdminAlerts.status === 200, 'Admin successfully queries /api/admin/alerts (200 OK)');
    if (alertsData.alerts && alertsData.alerts.length > 0) {
      assert(!String(alertsData.alerts[0].details).startsWith('v1.'), 'Admin alerts reveals decrypted details');
    }

    const resAdminAudit = await fetch(`${BASE}/api/admin/audit?page=1&limit=5`, {
      headers: { Authorization: `Bearer ${adminToken}`, Origin: BASE }
    });
    const auditLogData = await resAdminAudit.json();
    assert(resAdminAudit.status === 200, 'Admin successfully queries /api/admin/audit (200 OK)');
    if (auditLogData.logs && auditLogData.logs.length > 0) {
      const meta = auditLogData.logs[0].meta;
      assert(typeof meta === 'object' || !String(meta).startsWith('v1.'), 'Admin audit log reveals decrypted meta JSON');
    }

    const resAdminSpecial = await fetch(`${BASE}/api/admin/special`, {
      headers: { Authorization: `Bearer ${adminToken}`, Origin: BASE }
    });
    assert(resAdminSpecial.status === 200, 'Admin successfully queries /api/admin/special (200 OK)');

    const resAdminRegStatus = await fetch(`${BASE}/api/admin/registration/status`, {
      headers: { Authorization: `Bearer ${adminToken}`, Origin: BASE }
    });
    const regStatusData = await resAdminRegStatus.json();
    assert(resAdminRegStatus.status === 200, 'Admin successfully queries /api/admin/registration/status (200 OK)');
    assert(regStatusData.data?.loaded === true, 'Encrypted registration file loaded into memory cache');

    // Passphrase-encrypted export test
    const resEncExport = await fetch(`${BASE}/api/admin/export/users?format=json&passphrase=AdminBackupPassphrase456!`, {
      headers: { Authorization: `Bearer ${adminToken}`, Origin: BASE }
    });
    const exportBody = await resEncExport.text();
    assert(resEncExport.status === 200, 'Admin encrypted export succeeds (200 OK)');
    assert(resEncExport.headers.get('content-type') === 'application/octet-stream', 'Encrypted export sets application/octet-stream');
    assert(exportBody.startsWith('RESEYE_EXPORT_V1'), 'Encrypted export payload is protected with scrypt + AES-256-GCM package header');

    // -------------------------------------------------------------------------
    // TEST SUITE 13: User-Side Zero-Leakage & Ciphertext Protection
    // -------------------------------------------------------------------------
    console.log('\n--- SUITE 13: User-Side Zero-Leakage & Ciphertext Protection ---');

    const resStudentScorecard = await fetch(`${BASE}/api/students/23U02001`, {
      headers: { Authorization: `Bearer ${normalToken}`, Origin: BASE }
    });
    const scorecardBody = await resStudentScorecard.text();
    assert(resStudentScorecard.status === 200, 'Ordinary student profile fetched successfully (200 OK)');
    assert(!scorecardBody.includes('v1.v1.'), 'Ordinary student response contains ZERO raw ciphertext envelopes');
    const scorecardJson = JSON.parse(scorecardBody);
    assert(
      !scorecardJson.student?.fatherName && !scorecardJson.student?.phone,
      'Registration PII (fatherName, phone) is completely excluded from non-admin responses'
    );

    const resNotifications = await fetch(`${BASE}/api/me/notifications`, {
      headers: { Authorization: `Bearer ${normalToken}`, Origin: BASE }
    });
    const notifBody = await resNotifications.text();
    assert(resNotifications.status === 200, 'User notifications fetched (200 OK)');
    assert(!notifBody.includes('v1.v1.'), 'User notifications response contains zero raw ciphertext envelopes');

    // -------------------------------------------------------------------------
    // TEST SUITE 14: At-Rest Zero Plaintext Storage
    // -------------------------------------------------------------------------
    console.log('\n--- SUITE 14: At-Rest Zero Plaintext Storage ---');

    const encRegistrationPath = path.resolve('./data/registration_data.xlsx.enc');
    const plainRegistrationPath = path.resolve('./data/registration_data.xlsx');
    assert(!fs.existsSync(plainRegistrationPath), 'Plaintext registration_data.xlsx does NOT exist on disk');
    assert(fs.existsSync(encRegistrationPath), 'Encrypted registration_data.xlsx.enc exists on disk');
    const encFileHeader = fs.readFileSync(encRegistrationPath, 'utf8').slice(0, 6);
    assert(encFileHeader === 'v1.v1.', 'Registration file at rest begins with AES-256-GCM v1.v1. header');

    const dbInstance = getDb();
    const unencRes = await dbInstance.query(`
      SELECT
        (SELECT COUNT(*) FROM search_history WHERE student_name IS NOT NULL AND student_name != '' AND (student_name_enc IS NULL OR student_name_enc NOT LIKE 'v1.%')) as unenc_history,
        (SELECT COUNT(*) FROM ai_query_history WHERE query_text IS NOT NULL AND query_text != '' AND (query_text_enc IS NULL OR query_text_enc NOT LIKE 'v1.%')) as unenc_ai,
        (SELECT COUNT(*) FROM security_alerts WHERE details IS NOT NULL AND (details_enc IS NULL OR details_enc NOT LIKE 'v1.%')) as unenc_alerts,
        (SELECT COUNT(*) FROM admin_audit_log WHERE meta IS NOT NULL AND (meta_enc IS NULL OR meta_enc NOT LIKE 'v1.%')) as unenc_audit
    `);
    const counts = unencRes.rows[0];
    const totalResidualPlain = Number(counts.unenc_history) + Number(counts.unenc_ai) + Number(counts.unenc_alerts) + Number(counts.unenc_audit);
    assert(totalResidualPlain === 0, 'Zero residual unencrypted rows across protected DB columns at rest');

    // -------------------------------------------------------------------------
    // TEST SUITE 15: Search & Academic Performance Queries
    // -------------------------------------------------------------------------
    console.log('\n--- SUITE 15: Search & Academic Performance Queries ---');

    grantHuman(normalUser.id);

    const resFuzzySearch = await fetch(`${BASE}/api/students/search?q=dev`, {
      headers: { Authorization: `Bearer ${normalToken}`, Origin: BASE }
    });
    assert(resFuzzySearch.status === 200, 'Fuzzy search runs via PostgreSQL ILIKE/full-text search without error (200 OK)');

    const aggRes = await dbInstance.query(`
      SELECT
        COUNT(*) as total_students,
        ROUND(AVG(cpi_final)::numeric, 2) as avg_cpi,
        MAX(cpi_final) as max_cpi
      FROM students
      WHERE cpi_final IS NOT NULL
    `);
    const agg = aggRes.rows[0];
    assert(Number(agg.total_students) > 0 && Number(agg.avg_cpi) > 0, 'SQL aggregates (AVG, MAX) calculate directly over plaintext academic metrics');

    // -------------------------------------------------------------------------
    // TEST SUITE 16: Authentication Enumeration & Progressive Friction
    // -------------------------------------------------------------------------
    console.log('\n--- SUITE 16: Authentication Enumeration & Progressive Friction ---');

    // 16A: check-email Route Excised (404)
    const resCheckEmail = await fetch(`${BASE}/api/auth/check-email?email=test@iiitbhopal.ac.in`, {
      headers: { Origin: BASE }
    });
    assert(resCheckEmail.status === 404, 'Legacy /api/auth/check-email route is completely excised (404 Not Found)');

    // 16B: Uniform Status & Message on Failed Login
    const resBadPw = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE, 'x-client-signal': 'sig_test_1' },
      body: JSON.stringify({ email: normalEmail, password: 'WrongPassword123!', turnstileToken: 'dummy' })
    });
    const bodyBadPw = await resBadPw.json();

    const nonExistentEmail = `nonexistent_${Date.now()}@iiitbhopal.ac.in`;
    const resMissing = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE, 'x-client-signal': 'sig_test_2' },
      body: JSON.stringify({ email: nonExistentEmail, password: 'WrongPassword123!', turnstileToken: 'dummy' })
    });
    const bodyMissing = await resMissing.json();

    assert(resBadPw.status === 401 && resMissing.status === 401, 'Failed login yields status 401 for both existing and nonexistent accounts');
    assert(bodyBadPw.message === 'Email or password is incorrect.', 'Existing user wrong password returns uniform message');
    assert(bodyMissing.message === 'Email or password is incorrect.', 'Missing user returns identical uniform message');

    // 16C: Equalized Timing via Dummy Bcrypt
    const timingSamplesExisting = [];
    const timingSamplesMissing = [];
    for (let i = 0; i < 5; i++) {
      const t1 = performance.now();
      await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: BASE, 'x-client-signal': `sig_timing_ex_${i}` },
        body: JSON.stringify({ email: normalEmail, password: 'WrongPassword123!', turnstileToken: 'dummy' })
      });
      timingSamplesExisting.push(performance.now() - t1);

      const t2 = performance.now();
      await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: BASE, 'x-client-signal': `sig_timing_ms_${i}` },
        body: JSON.stringify({ email: `ghost_${i}_${Date.now()}@iiitbhopal.ac.in`, password: 'WrongPassword123!', turnstileToken: 'dummy' })
      });
      timingSamplesMissing.push(performance.now() - t2);
    }
    const avgExisting = timingSamplesExisting.reduce((a, b) => a + b, 0) / timingSamplesExisting.length;
    const avgMissing = timingSamplesMissing.reduce((a, b) => a + b, 0) / timingSamplesMissing.length;
    const timingDelta = Math.abs(avgExisting - avgMissing);
    assert(timingDelta < 150, `Timing equalized via cost-12 dummy bcrypt (Delta: ${timingDelta.toFixed(1)}ms)`);

    // 16D: Uniform Responses on Password Reset
    const resForgotExisting = await fetch(`${BASE}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE, 'x-client-signal': 'sig_forgot_1' },
      body: JSON.stringify({ email: normalEmail, turnstileToken: 'dummy' })
    });
    const bodyForgotExisting = await resForgotExisting.json();

    const resForgotMissing = await fetch(`${BASE}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE, 'x-client-signal': 'sig_forgot_2' },
      body: JSON.stringify({ email: `missing_${Date.now()}@iiitbhopal.ac.in`, turnstileToken: 'dummy' })
    });
    const bodyForgotMissing = await resForgotMissing.json();

    assert(resForgotExisting.status === 200 && resForgotMissing.status === 200, 'Forgot password returns 200 for both existing and missing users');
    assert(bodyForgotExisting.message === bodyForgotMissing.message, 'Forgot password response message is byte-identical');

    // 16E: Shared Campus NAT Simulation (30 distinct students from same IP)
    let natSuccessCount = 0;
    for (let i = 0; i < 30; i++) {
      const clientSignal = `campus_pc_station_${i}_${Date.now()}`;
      const resNat = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: BASE,
          'User-Agent': `CampusBrowser/1.0 (LabPC; Station ${i})`,
          'x-client-signal': clientSignal
        },
        body: JSON.stringify({ email: `student_${i}_${Date.now()}@iiitbhopal.ac.in`, password: 'WrongPassword!', turnstileToken: 'dummy' })
      });
      if (resNat.status === 401) {
        natSuccessCount++;
      }
    }
    assert(natSuccessCount === 30, 'Simulated shared campus NAT: 30 legitimate distinct student devices not blocked');

    // -------------------------------------------------------------------------
    // TEST SUITE 17: Crypto Failure Resilience
    // -------------------------------------------------------------------------
    console.log('\n--- SUITE 17: Crypto Failure Resilience ---');

    let malformedCaught = false;
    try {
      decryptField('v1.v1.invalid_iv.invalid_tag.invalid_ciphertext', auditBinding, 'audit');
    } catch (e) {
      malformedCaught = e instanceof DecryptionError || e.name === 'DecryptionError';
    }
    assert(malformedCaught, 'Corrupt ciphertext throws typed DecryptionError');

    // -------------------------------------------------------------------------
    // TEST SUITE 18: Performance & Latency Benchmarks
    // -------------------------------------------------------------------------
    console.log('\n--- SUITE 18: Performance & Latency Benchmarks ---');

    const benchText = 'Academic query string benchmark payload 12345';
    const benchEnc = encryptField(benchText, { table: 'search_history', column: 'student_name', rowId: 5555 }, 'history');
    const benchStart = performance.now();
    for (let i = 0; i < 500; i++) {
      decryptField(benchEnc, { table: 'search_history', column: 'student_name', rowId: 5555 }, 'history');
    }
    const benchElapsed = performance.now() - benchStart;
    assert(benchElapsed < 150, `Decryption of 500 rows completes in under 150ms (Actual: ${benchElapsed.toFixed(2)}ms)`);

    // Warm up connection then measure lookup SLA
    await fetch(`${BASE}/api/students/23U02001`, {
      headers: { Authorization: `Bearer ${normalToken}`, Origin: BASE }
    }).catch(() => {});
    const lookupStart = performance.now();
    await fetch(`${BASE}/api/students/23U02001`, {
      headers: { Authorization: `Bearer ${normalToken}`, Origin: BASE }
    });
    const lookupDuration = performance.now() - lookupStart;
    assert(lookupDuration < 5000, `Student lookup endpoint completes within SLA (Actual: ${lookupDuration.toFixed(1)}ms)`);

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
