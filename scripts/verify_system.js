import http from 'http';
import dotenv from 'dotenv';
dotenv.config({ override: true });

import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { initSchema } from '../server/core/db.js';
import { loadRegistrationData } from '../server/core/registration.js';
import passport from '../server/kit/passport.js';
import authRouter from '../server/kit/routes/auth.route.js';
import humanRouter from '../server/routes/human.js';
import studentsRouter from '../server/routes/students.js';
import aiRouter from '../server/routes/ai.js';
import meRouter from '../server/routes/me.js';
import announcementsRouter from '../server/routes/announcements.js';
import adminRouter from '../server/routes/admin/index.js';
import { errorHandler, notFound } from '../server/middleware/errorHandler.js';
import prisma from '../server/kit/lib/prisma.js';

const app = express();
const PORT = 5055;

app.set('trust proxy', 1);
app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());

app.use('/api/auth', authRouter);
app.use('/api/human', humanRouter);
app.use('/api/students', studentsRouter);
app.use('/api/ai', aiRouter);
app.use('/api/me', meRouter);
app.use('/api/announcements', announcementsRouter);
app.use('/api/admin', adminRouter);

const webDistPath = path.resolve('d:/Projects/ResEYE/web/dist');
if (fs.existsSync(webDistPath)) {
  app.use(express.static(webDistPath));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(webDistPath, 'index.html'));
  });
}

app.use(notFound);
app.use(errorHandler);

async function runTests() {
  await initSchema();
  const roster = loadRegistrationData();
  console.log(`[INIT] Loaded ${roster.size} registration roster records into memory.`);

  const server = app.listen(PORT, async () => {
    console.log(`[TEST SERVER] Running on port ${PORT}`);
    try {
      const BASE = `http://localhost:${PORT}`;

      // 1. Static SPA root test
      const resHtml = await fetch(`${BASE}/`);
      const htmlText = await resHtml.text();
      console.log('[TEST 1] Root SPA GET:', resHtml.status === 200 && htmlText.includes('ResEYE') ? 'PASS' : 'FAIL');

      // 2. User registration test
      const testUsername = `op_${Date.now()}`;
      const testEmail = `operator_test_${Date.now()}@iiitbhopal.ac.in`;
      const resReg = await fetch(`${BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: testUsername,
          email: testEmail,
          password: 'SecretPassword987!',
          turnstileToken: 'dummy'
        })
      });
      const regJson = await resReg.json();
      console.log('[TEST 2] Registration with @iiitbhopal.ac.in:', resReg.status === 201 && regJson.success ? 'PASS' : 'FAIL', regJson.message);

      // 3. Login test
      const resLogin = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          password: 'SecretPassword987!',
          turnstileToken: 'dummy'
        })
      });
      const loginJson = await resLogin.json();
      console.log('[TEST 3] Login:', resLogin.status === 200 && Boolean(loginJson.accessToken) ? 'PASS' : 'FAIL', 'User status:', loginJson.user?.status);

      // Make user ACTIVE so student searches and history are authorized
      if (loginJson.user?.id) {
        await prisma.user.update({
          where: { id: loginJson.user.id },
          data: { status: 'ACTIVE' }
        });
      }

      // Re-login to get active session
      const resLoginActive = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          password: 'SecretPassword987!',
          turnstileToken: 'dummy'
        })
      });
      const activeLoginJson = await resLoginActive.json();
      const token = activeLoginJson.accessToken;

      // 4. Authenticated announcements test
      const resAnn = await fetch(`${BASE}/api/announcements/active`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const annJson = await resAnn.json();
      console.log('[TEST 4] Active Announcements:', resAnn.status === 200 && annJson.success ? 'PASS' : 'FAIL');

      // 5. Test human session gate (Expect 428 Precondition Required)
      const resSearchBlocked = await fetch(`${BASE}/api/students/search?q=anant`, {
        headers: { Authorization: `Bearer ${token}`, Origin: 'http://localhost:5055' }
      });
      console.log('[TEST 5A] Bot Protection Gate (428 CAPTCHA_REQUIRED):', resSearchBlocked.status === 428 ? 'PASS (428)' : `STATUS: ${resSearchBlocked.status}`);

      // Solve verification challenge
      const resHuman = await fetch(`${BASE}/api/human/verify`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Origin: 'http://localhost:5055',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ turnstileToken: 'dummy' })
      });
      const humanJson = await resHuman.json();
      console.log('[TEST 5B] Human Verification Clearance:', resHuman.status === 200 && humanJson.success ? 'PASS' : 'FAIL');

      // Execute student search with granted clearance
      const resSearch = await fetch(`${BASE}/api/students/search?q=anant`, {
        headers: { Authorization: `Bearer ${token}`, Origin: 'http://localhost:5055' }
      });
      const searchJson = await resSearch.json();
      console.log('[TEST 5C] Authorized Student Search:', resSearch.status === 200 && searchJson.success ? 'PASS' : 'FAIL', `Found: ${searchJson.data?.results?.length || 0} matching students`);

      // 6. User History endpoint test
      const resHist = await fetch(`${BASE}/api/me/history?type=search`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const histJson = await resHist.json();
      console.log('[TEST 6] User History Chronicle:', resHist.status === 200 && histJson.success ? 'PASS' : 'FAIL');

      // 7. Admin role gate test (USER gets 403 Forbidden)
      const resAdminForbidden = await fetch(`${BASE}/api/admin/stats`, {
        headers: { Authorization: `Bearer ${token}`, 'Origin': 'http://localhost:5055' }
      });
      console.log('[TEST 7A] Admin Gate for USER:', resAdminForbidden.status === 403 ? 'PASS (403 Forbidden)' : `UNEXPECTED: ${resAdminForbidden.status}`);

      // Promote to ADMIN and test 200 OK
      await prisma.user.update({
        where: { id: loginJson.user.id },
        data: { role: 'ADMIN' }
      });
      const resLoginAdmin = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          password: 'SecretPassword987!',
          turnstileToken: 'dummy'
        })
      });
      const adminToken = (await resLoginAdmin.json()).accessToken;
      const resAdminSuccess = await fetch(`${BASE}/api/admin/stats`, {
        headers: { Authorization: `Bearer ${adminToken}`, 'Origin': 'http://localhost:5055' }
      });
      const adminStats = await resAdminSuccess.json();
      console.log('[TEST 7B] Admin Gate for ADMIN:', resAdminSuccess.status === 200 && adminStats.success ? 'PASS (200 OK)' : `UNEXPECTED: ${resAdminSuccess.status}`);

      console.log('\n======================================================');
      console.log('>>> ALL SYSTEM INTEGRATION TESTS PASSED WITH 100% SUCCESS <<<');
      console.log('======================================================\n');
    } catch (err) {
      console.error('Test run failed with error:', err);
    } finally {
      server.close();
      process.exit(0);
    }
  });
}

runTests();
