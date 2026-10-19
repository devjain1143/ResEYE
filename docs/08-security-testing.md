# 08 — Security Model and Test Checklist

## Threat model

| Threat | Control | Residual risk |
|---|---|---|
| Outsider registers | Exact-domain check in Zod and service; Google `email_verified` (+ `hd` if Workspace); email verification for password signup | Anyone holding an institute mailbox (incl. alumni/staff) is "inside" |
| One person, many accounts | `+alias` stripped; unique normalized email; approval mode | Someone with several real institute mailboxes |
| Script registers/logs in | Turnstile on register/login/forgot/resend/google-prepare; IP rate limits | Captcha-solving services; residential proxies |
| Script mass-queries after one login | `requireHuman` windows; per-user daily/lookup quotas; sweep + enumeration alerts | Slow, quota-bounded harvesting by a real user |
| Blocked user keeps access | Session-checked `authenticate`; block deletes sessions | None beyond one in-flight request |
| Privilege escalation | Role from DB; `requireRole` on every admin route; no role field accepted from clients | Admin account compromise → enable Google-only + strong 2FA on that Google account |
| Prompt injection via NLQ | Existing `scopeGate`, no raw user text in the conversational LLM, static refusals, Zod intents | Re-run `test_prompt.js` after migration |
| SQL injection | Parameterized queries; Zod enum-bound intent params | Keep it that way in new admin queries |
| XSS | JSON-only API, React escaping, `react-markdown` without raw HTML, CSP via helmet | Third-party script (Turnstile) is the only allowed external |
| CSRF on cookie routes | `sameSite=lax` refresh cookie + `originCheck` on non-GET | Low |
| Token theft | Access token in memory, 15 min expiry; refresh cookie httpOnly; rotation | XSS would still be bad, hence the XSS controls |
| Secrets leakage | `.env` never committed; Turnstile secret server-only; separate JWT secrets | Rotate on any suspicion |
| Admin data export abuse | Re-confirm + audit; CSV formula escaping | A rogue admin; audit log is the deterrent |

## originCheck (`server/middleware/originCheck.js`)

```js
export function originCheck(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  // Browsers always send Origin on cross-site POST/PATCH/DELETE. Non-browser clients omit it
  // and aren't a CSRF vector (they have no ambient cookies).
  if (!origin || origin === process.env.FRONTEND_URL) return next();
  return res.status(403).json({ success: false, message: 'Bad origin.' });
}
```

## Helmet / CSP sketch

```js
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'script-src':  ["'self'", 'https://challenges.cloudflare.com'],
      'frame-src':   ["'self'", 'https://challenges.cloudflare.com'],
      'connect-src': ["'self'", 'https://challenges.cloudflare.com'],
      'img-src':     ["'self'", 'data:', 'https://lh3.googleusercontent.com'],  // Google avatars
    },
  },
}));
```

## Test checklist

Use Postman/curl for server tests; do each with and without a valid Turnstile token.

### Domain lock
- [ ] `a@gmail.com` register → 400
- [ ] `a@iiitbhopal.ac.in.evil.com` → 400
- [ ] `a@evil.com@iiitbhopal.ac.in` → 400
- [ ] `A@IIITBhopal.AC.IN` → accepted, stored lowercase
- [ ] `name+1@iiitbhopal.ac.in` and `name+2@…` → same normalized account; second signup → 409
- [ ] Google login with a non-institute Google account → redirected to `/login?error=google`, no user row created
- [ ] Service-layer check holds even if the Zod check is removed temporarily

### Turnstile
- [ ] Missing token on register/login/forgot/resend/google-prepare → 400
- [ ] Reused token → 403
- [ ] Token from action `login` used on `register` → 403
- [ ] `GET /api/auth/google` without `g_ok` → 403; `g_ok` can't be reused
- [ ] Block outbound to Cloudflare (hosts file) → 503, not a pass

### Session / blocking
- [ ] Block a logged-in user → their very next API call returns 403 `ACCOUNT_BLOCKED`
- [ ] Logout, then replay the old access token → 401
- [ ] PENDING user can reach `/me` but not `/students/*` or `/ai`

### Authorization
- [ ] Non-admin on every `/api/admin/*` route → 403 (script the full route list)
- [ ] Admin can't block/demote self; last admin can't be demoted/deleted
- [ ] `PATCH /users/:id {role:'ADMIN'}` by a non-admin → 403
- [ ] USER response for any student never contains `registration`, phones, emails, addresses, guardian, category (assert on the JSON, not the UI)

### Anti-scraping
- [ ] Data route without human session → 428; after `/human/verify` → 200; after 20 queries → 428 again
- [ ] 61st lookup in a day → 429 `LOOKUP_QUOTA`; AI 11th → 429; admin unaffected
- [ ] Name search `q=a` → 400; page 3 → 400; roster capped at 5
- [ ] Script looking up 20 sequential scholar numbers → ENUMERATION alert created
- [ ] Querying 3 batches in 10 min → SWEEP_BATCH alert; 4 semesters in one batch → SWEEP_SEMESTER alert
- [ ] Non-admin lookup of a tracked scholar → SPECIAL_HIT alert with timeline; admin lookup → none

### NLQ
- [ ] `scripts/test_prompt.js` injection cases still fail closed (re-run all earlier ones, including "valid lookup + injected instruction")
- [ ] `UNSUPPORTED` returns a static message with no LLM call
- [ ] Cache hits don't consume daily quota

### Admin actions
- [ ] Each admin write produces an `admin_audit_log` row
- [ ] Export requires re-confirmation and logs row count
- [ ] Registration upload with a non-xlsx or malformed file → rejected, old data intact

### Frontend
- [ ] No tokens in localStorage/sessionStorage; refresh on page reload works
- [ ] Markdown from `/ai` containing `<script>` or `<img onerror>` renders as inert text
- [ ] CSP doesn't break the Turnstile widget (check console)

## Known gaps to track
- In-memory human-session and Google-prepare state → single instance only.
- No 2FA beyond what Google provides. Admins should log in with Google and have 2-step verification on.
- No automated test suite in the kit; at minimum, script the checklist above (supertest or a Postman collection).
- Data-protection obligations for student records (India's DPDP Act 2023 among them) are outside this doc; get institute sign-off on who may see what.