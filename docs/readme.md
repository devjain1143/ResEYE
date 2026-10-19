# Resbot Web

Web version of Resbot: student academic lookup and a natural-language query (NLQ) assistant, with institute-only login, bot protection, and an admin panel that replaces every Telegram admin command.

> Status: planning docs. Read in the order listed under "Doc index".

## What changes vs. the Telegram bot

| Concern | Telegram bot | Web |
|---|---|---|
| Identity | Telegram user ID | Account from express-auth-kit (`User.id`, a cuid) |
| Access control | `whitelist` table / `whitelist.json` | Verified `@iiitbhopal.ac.in` account + `status` (ACTIVE / PENDING / BLOCKED) |
| Admin | `ADMIN_ID(S)` env | `User.role = ADMIN` in the DB, plus an admin panel |
| Bot protection | Telegram itself | Cloudflare Turnstile + per-user quotas + sweep detection |
| UI | Chat + inline keyboards | React SPA (student cards, AI chat, admin pages) |
| Alerts | Telegram DM to admin | Admin panel alerts (optional Telegram DM push) |
| Broadcast | `/announce` DM to all | In-app announcement banners (optional email) |

The NLQ pipeline (`scopeGate → rateLimiter → providerRouter → intentSchema → cache → dataExecutor → responseFormatter`) is kept. Only its edges change: the identity key and the output format.

## Architecture

```
Browser (React SPA)
   │  HTTPS, same origin (Express serves web/dist)
   ▼
Express 5 server
 ├── originCheck, helmet, rate limits (global)
 ├── /api/auth/*        ← express-auth-kit (vendored + patched)
 │      domain gate · Turnstile gate · Google OAuth (domain-locked)
 ├── authenticate       ← JWT + live session + status check
 ├── /api/human/verify  ← Turnstile → "human session" grant
 ├── /api/students/*    ← requireHuman · lookup quotas · sweep detection
 ├── /api/ai            ← requireHuman · NLQ pipeline (unchanged core)
 ├── /api/me/*          ← own history, notifications
 └── /api/admin/*       ← requireRole(ADMIN) · audit-logged
        │
        ▼
Neon Postgres (one database, two schemas)
 ├── schema "auth"   → Prisma: User, Session, tokens
 └── schema "public" → Resbot tables (students, registrations, history,
                       special_scholars, feedback_corrections + pgvector,
                       announcements, notifications, security_alerts, audit log)
```

Default deployment is **one service, one origin**: Express serves the built frontend. That avoids CORS and third-party-cookie problems entirely (see `09-DEPLOYMENT.md`).

## Stack

| Layer | Choice |
|---|---|
| Server | Node 20+, Express 5 (ESM) |
| Auth | express-auth-kit (vendored into `server/kit/`, MIT, edited as your own code) |
| Auth DB access | Prisma 6 (schema `auth`) |
| App DB access | existing `pg` pool + pgvector (schema `public`) |
| Bot protection | Cloudflare Turnstile, `express-rate-limit` |
| Email | Brevo (only needed if password signup stays enabled) |
| Frontend | Vite + React 18 + React Router + TanStack Query + Tailwind |
| Hosting | existing web service (single service) |

## Repo layout

```
resbot-web/
├── README.md
├── docs/                      # these files
├── prisma/                    # kit's schema + role/status additions
├── migrations/                # raw SQL for Resbot tables
│   └── 001_web_schema.sql
├── config/                    # nlq.json, providers.json (unchanged)
├── data/                      # xlsx datasets (unchanged)
├── server/
│   ├── index.js
│   ├── kit/                   # vendored express-auth-kit src/
│   ├── middleware/            # authenticate, requireRole, turnstile, humanSession,
│   │                          # originCheck, rateLimits, errorHandler
│   ├── routes/                # students.js, ai.js, me.js, human.js, admin/*.js
│   ├── services/              # studentService, settingsService, alertService, auditService
│   ├── nlq/                   # moved from bot, minimal edits
│   └── core/                  # dataAccess, db, embeddings, query, registration
├── web/                       # Vite React app
├── scripts/                   # import_excel.js, test_prompt.js, cleanup.js
└── legacy/                    # old bot.js/formatter.js kept until cutover
```

## Doc index

1. `docs/01-MIGRATION-PLAN.md`: phases, file-by-file changes, bot-handler → service mapping
2. `docs/02-DATABASE.md`: Prisma + SQL changes
3. `docs/03-AUTH.md`: domain lock, Google OAuth, Turnstile on auth, session-aware middleware, roles
4. `docs/04-ANTI-SCRAPING.md`: human sessions, quotas, sweep detection
5. `docs/05-API.md`: full endpoint reference
6. `docs/06-ADMIN-PANEL.md`: every admin command mapped to a page + endpoint
7. `docs/07-FRONTEND.md`: pages, API client, Turnstile component
8. `docs/08-SECURITY-TESTING.md`: threat model and test checklist
9. `docs/09-DEPLOYMENT.md`: env vars, third-party setup, cutover and rollback

## Decisions to make before coding

- **Who may sign up.** Open to every institute mailbox, or admin approval first (`signup_mode`)? Default in the docs: `approval`.
- **Password signup or Google only.** Google-only is simpler and stronger if the institute uses Google accounts; `ALLOW_LOCAL_AUTH` toggles it.
- **Whether students see only their own record.** If the email local part is the scholar number, self-scoping becomes possible. The current design keeps "any verified user can look up any student", as the bot did.