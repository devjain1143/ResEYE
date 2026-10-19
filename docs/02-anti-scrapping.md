# 04 — Anti-scraping

Be realistic about what each layer does:

- **Turnstile** stops dumb scripts (curl, requests, headless defaults) and raises the cost of automation. It does not stop a determined person who solves captchas manually or pays a solving service.
- **Per-user quotas** are the real control. A logged-in student can only pull a bounded amount of data per day, whatever tooling they use.
- **Sweep and enumeration detection** catches patterns quotas allow (many small queries that together map the whole dataset).

Design for all three.

## 1. Human sessions

Login-time Turnstile only proves a human logged in once. A script can reuse that session forever. So data routes also require a recent captcha solve.

Flow: first data request (or any after expiry) → `428 CAPTCHA_REQUIRED` → frontend shows a Turnstile challenge → `POST /api/human/verify` → server grants a window of 15 minutes / 20 queries → frontend retries the original request.

```js
// server/middleware/humanSession.js
const TTL_MS = 15 * 60 * 1000;
const MAX_QUERIES = 20;
const state = new Map(); // userId -> { until, remaining }

export function grantHuman(userId) {
  state.set(userId, { until: Date.now() + TTL_MS, remaining: MAX_QUERIES });
}

export function requireHuman(req, res, next) {
  if (req.user.role === 'ADMIN') return next();
  const s = state.get(req.user.id);
  if (!s || s.until < Date.now() || s.remaining <= 0) {
    return res.status(428).json({ success: false, code: 'CAPTCHA_REQUIRED', message: 'Verification required.' });
  }
  s.remaining -= 1;
  next();
}

setInterval(() => {                       // cleanup
  const now = Date.now();
  for (const [k, v] of state) if (v.until < now) state.delete(k);
}, 5 * 60 * 1000).unref();
```

```js
// routes/human.js
router.post('/human/verify', authenticate, humanLimiter, requireTurnstile('search'), (req, res) => {
  grantHuman(req.user.id);
  res.json({ success: true, expiresInSeconds: 900, queries: 20 });
});
```

Constraints: state lives in process memory, so run one instance (single service / PM2 fork mode). A restart just forces everyone to re-verify, which is harmless. Tune `TTL_MS` and `MAX_QUERIES` after seeing real usage; if students hit the challenge constantly, raise them.

Count a human-session solve failure burst (e.g. 10 failed `/human/verify` in 10 minutes for one user) as a `CAPTCHA_ABUSE` alert.

## 2. Quotas (read from `app_settings`)

| Limit | Default | Scope | Notes |
|---|---|---|---|
| AI queries/day | 10 | per user, rolling 24h | cache hits don't count (existing behavior) |
| AI burst | 5/min | per user | existing |
| Direct lookups/day | 60 | per user, rolling 24h | **new**; scholar numbers are guessable, so this is the enumeration brake |
| General API | 60/min | per user | express-rate-limit |
| Auth endpoints | 10 / 15 min | per IP | express-rate-limit |
| Admins | unlimited | | role-based skip |

Implement the lookup counter with a query over `search_history` (`web_user_id` + `created_at > now() - interval '24 hours'`) or an in-memory sliding window; the table already exists and survives restarts.

`express-rate-limit` keyed by user when authenticated, IP otherwise. In v8 use its `ipKeyGenerator(req.ip)` helper for the IP fallback so IPv6 addresses are grouped correctly:

```js
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
export const apiLimiter = rateLimit({
  windowMs: 60_000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req.ip),
  skip: (req) => req.user?.role === 'ADMIN',
});
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
});
```

Note: the limiter must run *after* `authenticate` on data routes for `req.user` to exist.

## 3. Hard result caps (carry over from the bot)

- Batch roster: max 5 rows, no offset/page parameters.
- Name search: minimum 3 characters, max 10 results, max 2 pages (20 rows total). The bot's inline pagination had no real depth limit; on the web, searching "a" and paging would dump the dataset.
- No endpoint returns "all students" or accepts a raw SQL/filter expression. Intent-bound parameters only.

## 4. Detection

Reuse the existing sweep logic in `nlq/rateLimiter.js` (3+ batches in 10 minutes; 4+ semesters in one batch). Add:

- **Enumeration:** ≥ 15 direct scholar lookups within 10 minutes where the numbers are sequential or near-sequential (e.g. ≥ 8 of them within ±20 of each other numerically), or a high ratio of "not found" results (> 50% over ≥ 10 lookups). Both are scripts probing ranges.
- **Special hit:** any non-admin lookup resolving to a tracked scholar.

Detections call `alertService.create(kind, webUserId, details)`, which inserts into `security_alerts` and optionally pushes a Telegram DM to the admin (see `06-ADMIN-PANEL.md`). Detection never auto-blocks; it queues the alert for an admin decision (Send Warning / Revoke Access / Dismiss), same as the bot.

## 5. Response hygiene
- JSON only; the frontend renders cards. No HTML from the server.
- Strip contact fields (`phone`, `email`, `address`, `guardian`, `category`) in the service layer for non-admins, and cover it with a test. Don't rely on the frontend hiding them.
- `Cache-Control: no-store` on all `/api/*` data responses.
- Log search queries and result counts (not full result bodies).

## 6. What this does not stop
A student who legitimately logs in, solves captchas by hand, and stays under quota can still collect up to their daily allowance. If the data is sensitive enough that this matters, the remaining lever is access policy (approval mode, or scoping users to their own record), not more captcha.