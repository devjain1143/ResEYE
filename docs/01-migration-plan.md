# 01 — Migration Plan

Do not delete bot code until the web app has been in use. Move it to `legacy/` and keep the bot running against the same DB until cutover.

## Phase 0 — Accounts and backups
- [ ] Neon: create a branch or backup of the production DB. All migrations run on the branch first.
- [ ] Cloudflare: create a Turnstile widget (Managed mode); note site key and secret.
- [ ] Google Cloud: OAuth client (Web), redirect `https://<domain>/api/auth/google/callback`.
- [ ] Brevo: API key and a verified sender (only if password signup stays on).
- [ ] Domain: pick the final domain now; cookie and OAuth settings depend on it.

## Phase 1 — Repo and kit
- [ ] Create `resbot-web/`. Copy the existing bot code into `legacy/`.
- [ ] Copy express-auth-kit `src/` to `server/kit/` and `prisma/` to `prisma/`. Do not install it as a dependency; you are going to edit it.
- [ ] Copy `nlq/`, `config/`, `data/`, `scripts/` and the non-Telegram `src/*.js` to `server/nlq`, `config`, `data`, `scripts`, `server/core`.
- [ ] Check `package.json` `"type"`. The kit is ESM. If the bot is CommonJS, convert the moved files (`require` → `import`, `module.exports` → `export`). Do it in one commit, nothing else in it.
- [ ] Install: `express@5 cookie-parser helmet express-rate-limit zod multer pg @prisma/client jsonwebtoken bcrypt passport passport-google-oauth20 @getbrevo/brevo @paralleldrive/cuid2` (match the kit's `package.json` versions) and `prisma` as dev dependency. Drop `telegraf`.

## Phase 2 — Database
Follow `02-DATABASE.md`. Order: Prisma auth schema → SQL migration → verify both with `psql`.

## Phase 3 — Extract logic from `bot.js`
`bot.js` mixes Telegram I/O with business logic. Pull the logic into plain functions that take a `user` and return JSON. Do not format for Telegram.

| Bot feature (bot.js / elsewhere) | Becomes | Web route |
|---|---|---|
| Scholar-number lookup | `studentService.getByScholar(no, user)` | `GET /api/students/:scholarNo` |
| Fuzzy name search + inline pagination | `studentService.search(q, page, user)` | `GET /api/students/search` |
| Scorecard (MarkdownV2 in `formatter.js`) | JSON only; React renders the card | included in responses |
| Registration enrichment (admins) | `registration.getFor(no)` called only when `user.role === 'ADMIN'` | same routes, extra `registration` field |
| `/ai` and the AI button | `nlq.run({ query, user })` | `POST /api/ai` |
| Search history logging | `query.logSearch({ webUserId, ... })` | internal |
| Special-scholar check + admin DM | `alertService.checkSpecial(...)` | internal → alert |
| Sweep anomaly + admin card | `alertService.create('SWEEP', ...)` | admin Alerts page |
| `/adduser /rmuser /showuser` | user management service | `/api/admin/users` |
| `/special /rmspecial /showspecial` | special-scholar service | `/api/admin/special` |
| `/his` variants | history service with filters | `/api/admin/history`, `/api/admin/ai-history` |
| `/feedback` | feedback service | `/api/admin/feedback/*` |
| `/announce` | announcement service | `/api/admin/announcements` |
| `/reloadreg` | `registration.reload()` | `POST /api/admin/registration/reload` |
| `/exportdata` | export service | `GET /api/admin/export/:what` |
| `/nlq_debug` | debug executor | `POST /api/admin/nlq-debug` |

Key edits inside `nlq/`:
- `rateLimiter.js`: key everything by `user.id` (string) instead of Telegram ID. Replace the "notify admin via bot" callback with `alertService.create(...)`.
- `responseFormatter.js`: it likely emits Telegram MarkdownV2 with escapes. Make it return `{ text, data }` where `text` is plain Markdown or plain text. The frontend renders it with `react-markdown` (raw HTML disabled).
- `index.js`: signature becomes `run({ query, user })`. Admins skip daily quota as before.
- Keep the `scopeGate` injection filters and the "no raw user text to the conversational LLM" fixes exactly as they are.

## Phase 4 — Auth hardening
Follow `03-AUTH.md` completely before exposing any data route.

## Phase 5 — Student and AI routes
Follow `04-ANTI-SCRAPING.md` and `05-API.md`. Every data route chain:
`originCheck → rate limit → authenticate → requireHuman → quota → handler`.

## Phase 6 — Admin routes
Follow `06-ADMIN-PANEL.md`. Admin routes are `authenticate → requireRole('ADMIN') → auditLog → handler`.

## Phase 7 — Frontend
Follow `07-FRONTEND.md`.

## Phase 8 — Hardening and tests
Run all of `08-SECURITY-TESTING.md`. Run `scripts/test_prompt.js` again after the NLQ edits; the injection test cases must still fail closed.

## Phase 9 — Cutover
Follow `09-DEPLOYMENT.md`. Keep the bot running read-only (or stopped) for 1–2 weeks as rollback.

## Definition of done
- A non-institute email can't register or log in through any path.
- A script with no Turnstile token can't register, log in, or query.
- A blocked user is rejected on their very next request.
- A non-admin gets 403 on every `/api/admin/*` route.
- Phone, email, address and guardian fields never appear in a non-admin response.
- Every admin action appears in the audit log.