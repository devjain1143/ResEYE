import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config({ override: true });

import { initSchema } from './core/db.js';
import { loadRegistrationData } from './core/registration.js';
import passport from './kit/passport.js';
import authRouter from './kit/routes/auth.route.js';
import humanRouter from './routes/human.js';
import studentsRouter from './routes/students.js';
import aiRouter from './routes/ai.js';
import meRouter from './routes/me.js';
import announcementsRouter from './routes/announcements.js';
import favoritesRouter from './routes/favorites.js';
import adminRouter from './routes/admin/index.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://challenges.cloudflare.com'],
        frameSrc: ["'self'", 'https://challenges.cloudflare.com'],
        connectSrc: ["'self'", 'https://challenges.cloudflare.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:']
      }
    }
  })
);

app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());
app.use(passport.initialize());

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/human', humanRouter);
app.use('/api/students', studentsRouter);
app.use('/api/favorites', favoritesRouter);
app.use('/api/ai', aiRouter);
app.use('/api/me', meRouter);
app.use('/api/announcements', announcementsRouter);
app.use('/api/admin', adminRouter);

// SEO & Crawl Discovery: robots.txt & sitemap.xml
app.get('/robots.txt', (req, res) => {
  const possiblePaths = [
    path.resolve(__dirname, '../web/public/robots.txt'),
    path.resolve(__dirname, '../web/dist/robots.txt')
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return res.type('text/plain').sendFile(p);
  }
  res.type('text/plain').send('User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin/\nSitemap: https://reseye.onrender.com/sitemap.xml\n');
});

app.get('/sitemap.xml', (req, res) => {
  const possiblePaths = [
    path.resolve(__dirname, '../web/public/sitemap.xml'),
    path.resolve(__dirname, '../web/dist/sitemap.xml')
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return res.type('application/xml').sendFile(p);
  }
  res.status(404).end();
});

// Google Search Console verification files
app.get('/google:id.html', (req, res, next) => {
  const fileName = `google${req.params.id}.html`;
  const possiblePaths = [
    path.resolve(__dirname, `../${fileName}`),
    path.resolve(__dirname, `../web/public/${fileName}`),
    path.resolve(__dirname, `../web/dist/${fileName}`)
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return res.sendFile(p);
    }
  }
  next();
});

// Serve web frontend build if present
const webDistPath = path.resolve(__dirname, '../web/dist');
if (fs.existsSync(webDistPath)) {
  app.use(express.static(webDistPath));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(webDistPath, 'index.html'));
  });
}

// Fallback handlers
app.use(notFound);
app.use(errorHandler);

async function startServer() {
  try {
    console.log('[ResEYE] Initializing database and surveillance tables...');
    await initSchema().catch(err => {
      console.warn('[ResEYE] Database init notice:', err.message);
    });

    console.log('[ResEYE] Loading registration intelligence records...');
    loadRegistrationData();

    app.listen(PORT, () => {
      console.log(`[ResEYE] Server active on port ${PORT}`);
    });
  } catch (err) {
    console.error('[ResEYE] Fatal startup failure:', err);
    process.exit(1);
  }
}

startServer();
