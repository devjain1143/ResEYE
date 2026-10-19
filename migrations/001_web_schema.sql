-- Link existing audit/feedback tables to web users. Legacy Telegram rows keep NULL.
ALTER TABLE search_history       ADD COLUMN IF NOT EXISTS web_user_id TEXT;
ALTER TABLE ai_query_history     ADD COLUMN IF NOT EXISTS web_user_id TEXT;
ALTER TABLE user_ai_usage        ADD COLUMN IF NOT EXISTS web_user_id TEXT;
ALTER TABLE feedback_corrections ADD COLUMN IF NOT EXISTS web_user_id TEXT;
ALTER TABLE special_scholars     ADD COLUMN IF NOT EXISTS added_by_web_user_id TEXT;

ALTER TABLE search_history   ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE ai_query_history ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE user_ai_usage    ALTER COLUMN user_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_search_history_web_user ON search_history (web_user_id);
CREATE INDEX IF NOT EXISTS idx_ai_history_web_user     ON ai_query_history (web_user_id);
CREATE INDEX IF NOT EXISTS idx_user_ai_usage_web_user  ON user_ai_usage (web_user_id);

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
