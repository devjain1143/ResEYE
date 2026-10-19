# 06 — Admin Panel

Everything the Telegram admin could do, in a web UI at `/admin`. Visible only to `role = ADMIN`, enforced on the server by `requireRole('ADMIN')` on every `/api/admin/*` route; the frontend hiding the menu is cosmetic.

## Principles
1. **Server-side authority.** Role and status are read from the DB on each request (`authenticate`).
2. **Everything is audited.** Every admin write inserts into `admin_audit_log` (admin id, action, target, meta, IP). Reads of sensitive data (exports, registration reload) are audited too.
3. **Guardrails.** An admin can't block or demote themselves, and the last ADMIN can't be demoted or deleted. Destructive actions require a confirmation modal; user deletion requires typing the user's email.
4. **No Telegram dependency.** The panel is complete without the bot. Telegram DM push is an optional extra.

## Audit helper

```js
// server/services/auditService.js
export async function audit(req, action, target = null, meta = {}) {
  await pool.query(
    'INSERT INTO admin_audit_log (admin_id, action, target, meta, ip) VALUES ($1,$2,$3,$4,$5)',
    [req.user.id, action, target, meta, req.ip]
  );
}
```

Call it after each successful admin write inside the handler (or via a small wrapper `withAudit('USER_BLOCK', (req)=>req.params.id)`).

## Pages

| Page | What it does | Replaces |
|---|---|---|
| **Dashboard** | users by status, queries today, AI quota burn, open alerts, latest announcements | n/a |
| **Users** | search/filter by status/role; approve (PENDING→ACTIVE), block/unblock with reason, promote/demote, send warning, delete; shows last login and query counts | `/adduser`, `/rmuser`, `/showuser`, welcome flow |
| **Special Scholars** | add/remove tracked scholar numbers, optional note; also a "Track" button on every student card visible to admins | `/special`, `/rmspecial`, `/showspecial` |
| **Alerts** | queue of `security_alerts`: SPECIAL_HIT, SWEEP_BATCH, SWEEP_SEMESTER, ENUMERATION, CAPTCHA_ABUSE. Actions: Send Warning, Revoke Access, Dismiss | alert cards |
| **Search History** | filter Today / Yesterday / 7 days / All; by user; paginated | `/his`, `/his <user_id>` |
| **AI History** | same filters + rating state; link to Feedback | `/his ai` |
| **Feedback Triage** | one unrated AI query at a time; 👍 Good or 👎 Bad & Correct. Correction accepts shorthand (`topper cse-26 sem 2 spi`, `avg cpi it-28`, `unsupported`) or raw JSON, parsed by the existing `feedbackParser.js`, then embedded (Gemini 768-dim) and stored in `feedback_corrections` | `/feedback` |
| **Announcements** | create/edit/deactivate banners with level (info/warning/critical) and expiry; live preview; optional email to all active users | `/announce` |
| **Registration Data** | shows file/rows loaded and last reload time; upload a new `registration_data.xlsx` or reload from disk | `/reloadreg` |
| **Export** | download users / search history / AI history / special scholars / feedback as CSV or JSON | `/exportdata` |
| **NLQ Debug** | paste intent JSON, see Zod validation + executor output + SQL params | `/nlq_debug` |
| **Settings** | signup mode (open / approval / closed), AI daily + burst limits, lookup daily limit | env/config edits |
| **Audit Log** | filterable log of every admin action | n/a |

## Behaviors that need care

### Users
- `PATCH /admin/users/:id { status: 'BLOCKED', blockedReason }` → set status, set `blockedAt`, **delete all that user's sessions**, audit `USER_BLOCK`.
- Unblock → `status: 'ACTIVE'`, clear reason.
- Approve → PENDING → ACTIVE; optionally send a "you're approved" in-app notification (replaces the Telegram welcome DM).
- Role changes are audited with before/after.

### Alerts
- `warn`: insert into `notifications` (`kind: 'WARNING'`, admin-written message with a default template), set alert `WARNED`. The user sees it in the notification bell and as a blocking banner on next load.
- `revoke`: same as block, with `blockedReason: 'Revoked after security alert #id'`, alert `REVOKED`.
- Alert `details` JSON must include enough to decide: the queries, batches/semesters touched, time window, and for SPECIAL_HIT the full past-search timeline of that student (the bot's behavior).
- Admin's own searches never create SPECIAL_HIT alerts.

### Special-scholar alert content
`{ searcher: {id, username, email}, student: {scholarNo, name}, at: ISO time, timelineOfPastSearches: [...] }`. The UI renders time in IST (`Asia/Kolkata`).

### Announcements
- In-app: `GET /announcements/active` feeds a dismissible banner in the app shell; `critical` is not dismissible until expiry.
- Email (optional): `email: true` queues sends through Brevo to ACTIVE users in batches. Brevo's free tier has a daily send cap, so check the current limit and queue across days if the user count exceeds it. Default off.
- Replaces the old broadcast preview: the form shows recipient count and requires a confirm click before saving when `email: true`.

### Registration reload
- Upload: `multer` with memory storage, 10 MB cap, accept only `.xlsx` MIME + extension. Parse with the existing `registration.js`; on parse error keep the old data in memory and return the error. Replace in memory only after a successful parse. Write the file to `data/` only if your host's disk persists; on ephemeral disks, store the sheet in the DB or object storage, or the reload is lost at next deploy.
- Audit `REGISTRATION_RELOAD` with row count.

### Export
- Streams CSV (escape leading `= + - @` cells to block spreadsheet formula injection).
- Require the admin to re-confirm (password for local accounts; fresh Turnstile for Google accounts) before the download starts; audit `EXPORT` with the dataset name and row count.

### Optional Telegram push
Keep the bot token only for sending, no polling process:

```js
export async function pushAdminTelegram(text) {
  if (!process.env.TELEGRAM_ALERT_BOT_TOKEN || !process.env.TELEGRAM_ALERT_CHAT_ID) return;
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_ALERT_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: process.env.TELEGRAM_ALERT_CHAT_ID, text }),
  }).catch(() => {});
}
```

Call it from `alertService.create`. Don't include student names or academic data in the DM text; send "New alert: SPECIAL_HIT, open the panel". Telegram is a third party.

### Live updates
The panel polls `GET /admin/alerts/unread-count` every 15 seconds for the badge. Simple and enough. (Browser `EventSource` can't send the Bearer header; skip SSE unless you need it.)

## Authorization matrix

| Capability | USER (ACTIVE) | PENDING | BLOCKED | ADMIN |
|---|:---:|:---:|:---:|:---:|
| Log in | ✅ | ✅ (waiting screen only) | ❌ | ✅ |
| Student lookup / AI | ✅ (quotas, captcha) | ❌ | ❌ | ✅ (unlimited) |
| Contact/registration fields | ❌ | ❌ | ❌ | ✅ |
| Own history / notifications | ✅ | ❌ | ❌ | ✅ |
| `/api/admin/*` | ❌ | ❌ | ❌ | ✅ |

## Build order
1. Users + Settings (needed to run approval mode)
2. Alerts + Special Scholars (security parity with the bot)
3. History + Feedback
4. Announcements, Registration, Export, NLQ Debug, Audit Log