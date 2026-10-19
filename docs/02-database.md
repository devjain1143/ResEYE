# 02 — Database

One Neon database, two schemas. Prisma manages only `auth`; your existing `pg` code keeps managing `public`. Reason: `prisma migrate` on a schema containing tables it doesn't know about (pgvector columns, HNSW indexes) causes drift errors.

## Connection strings

```env
# Prisma (auth schema)
DATABASE_URL="postgresql://USER:PASS@ep-xxx-pooler.neon.tech/resbot?sslmode=require&schema=auth"
DIRECT_URL="postgresql://USER:PASS@ep-xxx.neon.tech/resbot?sslmode=require&schema=auth"

# Existing pg pool (public schema), no schema param
RESBOT_DATABASE_URL="postgresql://USER:PASS@ep-xxx-pooler.neon.tech/resbot?sslmode=require"
```

Prisma migrations must use the direct (non-pooled) URL; Neon's pooler breaks them.

## Prisma changes (`prisma/schema.prisma`)

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

enum Role {
  USER
  ADMIN
}

enum UserStatus {
  PENDING   // signed up, waiting for admin approval (signup_mode = approval)
  ACTIVE
  BLOCKED
}

model User {
  // ...all existing kit fields stay...
  role          Role       @default(USER)
  status        UserStatus @default(ACTIVE)
  blockedReason String?
  blockedAt     DateTime?
  lastLoginAt   DateTime?

  @@index([status])
  @@index([role])
}
```

Run:

```bash
npx prisma migrate dev --name init_auth        # first time, creates schema "auth" tables
npx prisma migrate dev --name add_role_status  # after editing the model
```

Production: `npx prisma migrate deploy`.

Notes:
- The kit requires `username` 3–20 chars of `[A-Za-z0-9_]`. Institute local parts can contain dots. When creating users, derive: `local.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 20)`, and append a short suffix on collision. Check what the kit's Google flow does for usernames and adjust the same way.
- Emails are stored normalized (lowercase, `+tag` removed). See `03-AUTH.md`.

## SQL migration (`migrations/001_web_schema.sql`)

Adapt column and table names to your real schema (check `src/db.js`). The new link column is `web_user_id`, deliberately not `user_id`, so it can't collide with the existing Telegram ID column.

```sql
-- Link existing audit/feedback tables to web users. Legacy Telegram rows keep NULL.
ALTER TABLE search_history       ADD COLUMN IF NOT EXISTS web_user_id TEXT;
ALTER TABLE ai_query_history     ADD COLUMN IF NOT EXISTS web_user_id TEXT;
ALTER TABLE feedback_corrections ADD COLUMN IF NOT EXISTS web_user_id TEXT;
ALTER TABLE special_scholars     ADD COLUMN IF NOT EXISTS added_by_web_user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_search_history_web_user ON search_history (web_user_id);
CREATE INDEX IF NOT EXISTS idx_ai_history_web_user     ON ai_query_history (web_user_id);

-- No FKs to auth."User" on purpose: deleting a user must not delete audit history.

CREATE TABLE IF NOT EXISTS app_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app_settings (key, value) VALUES
  ('signup_mode',        '"approval"'),   -- "open" | "approval" | "closed"
  ('ai_daily_limit',     '10'),
  ('ai_burst_per_min',   '5'),
  ('lookup_daily_limit', '60')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS announcements (
  id          BIGSERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  level       TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info','warning','critical')),
  created_by  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ,
  active      BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS notifications (
  id          BIGSERIAL PRIMARY KEY,
  web_user_id TEXT NOT NULL,
  kind        TEXT NOT NULL,            -- 'WARNING', 'INFO'
  body        TEXT NOT NULL,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (web_user_id, read_at);

CREATE TABLE IF NOT EXISTS security_alerts (
  id           BIGSERIAL PRIMARY KEY,
  kind         TEXT NOT NULL,           -- 'SWEEP_BATCH','SWEEP_SEMESTER','SPECIAL_HIT','ENUMERATION','CAPTCHA_ABUSE'
  web_user_id  TEXT,
  details      JSONB NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','WARNED','REVOKED','DISMISSED')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_by  TEXT,
  resolved_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON security_alerts (status, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          BIGSERIAL PRIMARY KEY,
  admin_id    TEXT NOT NULL,
  action      TEXT NOT NULL,            -- e.g. 'USER_BLOCK', 'SPECIAL_ADD', 'EXPORT'
  target      TEXT,
  meta        JSONB NOT NULL DEFAULT '{}',
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_time ON admin_audit_log (created_at DESC);
```

Run it with whatever your `db.js` migration style is, or manually: `psql "$RESBOT_DATABASE_URL" -f migrations/001_web_schema.sql`.

## Retiring the whitelist
- `whitelist` table and `whitelist.json` stay untouched while the bot runs.
- Optional one-time import: for any Telegram whitelist entry with a known institute email, nothing to migrate. Web access is by account status, not by list.
- After cutover, drop `whitelist` only when you've decided the bot is gone for good.

## Settings access
`settingsService.get(key)` reads `app_settings` with a 30-second in-memory cache. `PATCH /api/admin/settings` writes it and clears the cache. Quotas and signup mode are read from here, not from env.

## Maintenance
`scripts/cleanup.js` (run daily via cron or `node-cron`):

```js
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const now = new Date();
await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
await prisma.verificationToken.deleteMany({ where: { expiresAt: { lt: now } } });
await prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: now } } });
await prisma.$disconnect();
```

Verify the token models' field names against `schema.prisma`; the kit README does not list them.