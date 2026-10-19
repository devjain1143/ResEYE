# 05 — API Reference

Base: `/api`. JSON in/out. Envelope: `{ success: boolean, data?, message?, code? }`. Auth: `Authorization: Bearer <accessToken>` unless noted.

Guard legend: **O** = originCheck, **A** = authenticate, **H** = requireHuman, **T(x)** = requireTurnstile(action x), **R** = rate limit, **ADM** = requireRole(ADMIN) + audit log.

## Auth (kit, patched; see 03-AUTH.md)

| Method | Route | Guards | Notes |
|---|---|---|---|
| POST | `/auth/register` | O R T(register) | domain-locked; may create PENDING |
| POST | `/auth/login` | O R T(login) | domain-locked |
| GET | `/auth/verify?token=` | R | email verification |
| POST | `/auth/resend-verification` | O R T(resend) | |
| POST | `/auth/forgot-password` | O R T(forgot) | |
| POST | `/auth/reset-password` | O R | token-gated |
| PATCH | `/auth/change-password` | O A | |
| POST | `/auth/refresh` | O | refresh cookie |
| POST | `/auth/logout` | O | |
| POST | `/auth/google/prepare` | O R T(google) | sets `g_ok` cookie |
| GET | `/auth/google` | R + g_ok | redirect to Google |
| GET | `/auth/google/callback` | | redirect to `/auth/success` or `/login?error=google` |
| GET | `/auth/me` | A* | returns `{id, username, email, avatar, role, status}`; *also allow PENDING |

Turnstile token goes in the JSON body as `turnstileToken`.

## Human verification

| Method | Route | Guards | Body | Response |
|---|---|---|---|---|
| POST | `/human/verify` | O A R T(search) | `{turnstileToken}` | `{success, expiresInSeconds, queries}` |

## Students

| Method | Route | Guards | Notes |
|---|---|---|---|
| GET | `/students/search?q=&page=` | O A R H | q ≥ 3 chars; ≤ 10 per page, ≤ 2 pages. Returns list or single card if exactly one match |
| GET | `/students/:scholarNo` | O A R H | counts against lookup quota; special-scholar check; logs search |

Student card response:

```json
{
  "success": true,
  "data": {
    "scholarNo": "25U020130",
    "name": "…",
    "degree": "B.Tech",
    "branch": "ECE",
    "semesters": [{ "sem": 1, "spi": 8.4, "result": "PASS" }],
    "cpi": 8.1,
    "registration": null
  }
}
```

`registration` is `null` for USER and populated for ADMIN: `{ guardian, category, phones[], emails[], addresses:[{sem,text}] }`. The fallback case (registered but no results yet) returns the registration block with `semesters: []` (admin only; users get 404).

Errors: `404` not found, `428 CAPTCHA_REQUIRED`, `429` quota or rate limit (`code: LOOKUP_QUOTA` or `RATE_LIMIT`, include `retryAfterSeconds`).

## AI

| Method | Route | Guards | Body |
|---|---|---|---|
| POST | `/ai` | O A R H | `{ query: string(≤1000) }` |
| GET | `/ai/quota` | A | `{ usedToday, limit, burstRemaining }` |

Response: `{ success, data: { intent, text, rows?, cached: boolean, quota: {usedToday, limit} } }`. `text` is plain Markdown (render with raw HTML disabled). Refusals from `scopeGate` or `UNSUPPORTED` intent return `200` with a static `text` (no LLM call), matching the hardened bot behavior.

## Me

| Method | Route | Guards | Notes |
|---|---|---|---|
| GET | `/me/history?type=search|ai&page=` | A | own history only |
| GET | `/me/notifications` | A | unread first |
| POST | `/me/notifications/:id/read` | O A | |
| GET | `/announcements/active` | A | unexpired and `active` |

## Admin (`/admin/*`, all guards: O A ADM)

| Method | Route | Purpose | Replaces |
|---|---|---|---|
| GET | `/admin/stats` | counts: users by status, queries today, open alerts | n/a |
| GET | `/admin/users?status=&q=&page=` | list/search users | `/showuser` |
| PATCH | `/admin/users/:id` | `{status?, role?, blockedReason?}` | `/adduser`, `/rmuser` |
| DELETE | `/admin/users/:id` | hard delete (confirm in UI) | `/rmuser` |
| POST | `/admin/users/:id/warn` | `{message}` creates notification | Send Warning |
| GET | `/admin/special` | list tracked scholars | `/showspecial` |
| POST | `/admin/special` | `{scholarNo, note?}` | `/special` |
| DELETE | `/admin/special/:scholarNo` | | `/rmspecial` |
| GET | `/admin/history?range=today|yesterday|7d|all&userId=&page=` | search logs | `/his`, `/his <id>` |
| GET | `/admin/ai-history?range=&userId=&rating=&page=` | AI logs | `/his ai` |
| GET | `/admin/feedback/next` | next unrated AI query | `/feedback` |
| POST | `/admin/feedback/:id/rate` | `{rating:'good'|'bad', correction?: string|object}` shorthand or JSON via `feedbackParser` | Good / Bad & Correct |
| GET | `/admin/alerts?status=&kind=&page=` | security alerts | alert cards |
| GET | `/admin/alerts/unread-count` | for polling badge | |
| POST | `/admin/alerts/:id/warn` | warn user, mark WARNED | ⚠️ Send Warning |
| POST | `/admin/alerts/:id/revoke` | block user + kill sessions, mark REVOKED | 🚫 Revoke Access |
| POST | `/admin/alerts/:id/dismiss` | | n/a |
| GET | `/admin/announcements` | list | |
| POST | `/admin/announcements` | `{title, body, level, expiresAt?, email?: boolean}` | `/announce` |
| PATCH | `/admin/announcements/:id` | edit / deactivate | |
| POST | `/admin/registration/reload` | multipart `file?` (xlsx); no file = reload from disk | `/reloadreg` |
| GET | `/admin/export/:what` | `what` = `users|search-history|ai-history|special|feedback`; `?format=csv|json` | `/exportdata` |
| POST | `/admin/nlq-debug` | `{ json }` run intent through executor | `/nlq_debug` |
| GET | `/admin/settings` | current settings | n/a |
| PATCH | `/admin/settings` | `{signup_mode?, ai_daily_limit?, ai_burst_per_min?, lookup_daily_limit?}` | n/a |
| GET | `/admin/audit?page=` | audit log | n/a |

## Status codes
`400` validation · `401` no/expired session · `403` blocked/pending/forbidden/captcha failed · `404` · `428` human verification needed · `429` rate/quota · `503` captcha service down.

## Validation
Zod on every body/query. Reject unknown query params on data routes. IDs are cuid strings; scholar numbers must match your real format (e.g. `/^\d{2}[A-Z]\d{6}$/i`; adjust to your data).