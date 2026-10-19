# 09 — Deployment

Default: **one service, one origin.** Express serves the API and `web/dist`. No CORS, and cookies stay first-party.

If you later split frontend and backend, they must share a registrable domain (`app.example.com` + `api.example.com`) so the `sameSite=lax` refresh cookie still works. Two unrelated domains (e.g. `*.pages.dev` + `*.onrender.com`) make the cookie third-party and refresh will break. Use a custom domain first.

## Environment variables (`.env.example`)

```env
# --- Server ---
NODE_ENV=production
PORT=5000
FRONTEND_URL=https://resbot.example.com        # also used by the kit for email/OAuth links
ALLOWED_EMAIL_DOMAIN=iiitbhopal.ac.in
ADMIN_EMAILS=you@iiitbhopal.ac.in              # bootstrap admins (comma-separated)
ALLOW_LOCAL_AUTH=false                         # true = enable password signup/login
REQUIRE_GOOGLE_HD=false                        # true only if the institute uses Google Workspace

# --- Database ---
DATABASE_URL="postgresql://…-pooler.neon.tech/resbot?sslmode=require&schema=auth"
DIRECT_URL="postgresql://…neon.tech/resbot?sslmode=require&schema=auth"
RESBOT_DATABASE_URL="postgresql://…-pooler.neon.tech/resbot?sslmode=require"

# --- JWT (two different long random values) ---
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
BCRYPT_SALT_ROUNDS=12

# --- Google OAuth ---
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=https://resbot.example.com/api/auth/google/callback

# --- Turnstile ---
TURNSTILE_SECRET_KEY=
TURNSTILE_EXPECTED_HOSTNAME=resbot.example.com   # leave empty in dev
# web/.env → VITE_TURNSTILE_SITE_KEY=

# --- Email (only if ALLOW_LOCAL_AUTH=true or email announcements are used) ---
BREVO_API_KEY=
EMAIL_FROM=

# --- Data files ---
EXCEL_FILE_PATH=./data/processed_output.xlsx
REGISTRATION_FILE_PATH=./data/registration_data.xlsx

# --- NLQ providers (unchanged from the bot) ---
GEMINI_API_KEY=            # …_2 … _6
NVIDIA_NIM_API_KEY=        # …_2, _3
GROQ_API_KEY=
MISTRAL_API_KEY=
OPENROUTER_API_KEY=
CEREBRAS_API_KEY=

# --- Optional admin Telegram push (send-only) ---
TELEGRAM_ALERT_BOT_TOKEN=
TELEGRAM_ALERT_CHAT_ID=
```

Generate secrets (run twice):

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Never reuse the bot's old `BOT_TOKEN`/`ADMIN_ID` for anything but the optional push.

## Third-party setup

### Cloudflare Turnstile
1. Cloudflare dashboard → Turnstile → Add widget.
2. Hostnames: your production domain (and `localhost` for dev, or use Cloudflare's dummy keys locally).
3. Mode: Managed. Copy the **site key** to `web/.env` and the **secret key** to the server env.

### Google OAuth
1. Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web application).
2. Authorized redirect URI: `https://<domain>/api/auth/google/callback` (add `http://localhost:5000/api/auth/google/callback` for dev).
3. Consent screen: if the institute is Google Workspace, set the app type to **Internal** to restrict to the org; otherwise External + the code-level domain check.

### Brevo (only if password auth or email announcements are on)
Verify the sender domain/address; send a test to a real institute inbox and check spam.

## Build and start

`package.json` scripts:

```json
{
  "scripts": {
    "dev": "node --watch server/index.js",
    "build:web": "cd web && npm ci && npm run build",
    "start": "node server/index.js",
    "migrate": "prisma migrate deploy && node scripts/run_sql.js migrations/001_web_schema.sql",
    "import": "node scripts/import_excel.js",
    "cleanup": "node scripts/cleanup.js"
  }
}
```

Serve the SPA from Express (after API routes):

```js
import path from 'node:path';
app.use(express.static(path.resolve('web/dist'), { index: false, maxAge: '1h' }));
app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.resolve('web/dist/index.html')));
```

(Express 5 changed wildcard syntax; a regex avoids path-to-regexp pitfalls.)

Host build command: `npm ci && npx prisma generate && npm run build:web`. Start command: `npm run migrate && npm start`. Run a **single instance** (PM2 `fork` mode or one container) because of the in-memory state in `04-ANTI-SCRAPING.md`.

Schedule `npm run cleanup` daily (host cron job or `node-cron`).

## Local development

```bash
cp .env.example .env            # use Turnstile dummy keys, TURNSTILE_EXPECTED_HOSTNAME empty
npm i && (cd web && npm i)
npx prisma migrate dev
node scripts/run_sql.js migrations/001_web_schema.sql
npm run import                  # student data (if the DB is fresh)
npm run dev                     # API on :5000
cd web && npm run dev           # UI on :5173, proxies /api
```

For local testing with `NODE_ENV!=production`, the refresh cookie isn't `secure`, so it works over http://localhost.

## Cutover checklist
1. [ ] Staging run on a Neon branch; all of `08-SECURITY-TESTING.md` passes.
2. [ ] Production env vars set; `ADMIN_EMAILS` contains you.
3. [ ] `npm run migrate` succeeded on production; `students` and registration data present.
4. [ ] First login as admin works; panel loads; `signup_mode` is `approval`.
5. [ ] Domain + HTTPS live; Google redirect URI matches exactly; Turnstile hostname matches.
6. [ ] Post an announcement ("Resbot is now a website") from the bot's last `/announce`, pointing to the URL.
7. [ ] Open signups (`signup_mode`) when ready, or approve users manually.
8. [ ] Bot kept running or stopped but not deleted for 1–2 weeks.

## Rollback
- Web issue: stop the web service; the Telegram bot (still pointing at the same `public` tables) keeps working because all web changes to existing tables are additive (`web_user_id` columns).
- Bad migration: restore from the Neon branch/backup taken in Phase 0.
- Compromise suspicion: rotate `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` (logs everyone out), then `DELETE FROM auth."Session"`.

## Monitoring
- Log auth failures, 403/428/429 counts, captcha failures, alert creation.
- Uptime ping on `GET /health` (add a route that checks DB connectivity for both pools).
- Watch provider quotas for the NLQ LLM keys; the web app's traffic is higher than the bot's.