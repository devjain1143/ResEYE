# 03 — Authentication (express-auth-kit, locked to the institute)

The kit gives you register / verify / login / refresh / reset / Google OAuth. It does **not** give you: domain restriction, roles, blocking, rate limiting, CSRF checks, or a session check on access tokens. This doc adds those. File names refer to the vendored copy in `server/kit/`; verify each against the actual code before pasting.

## 1. Domain lock

### Normalizer (`server/kit/config/domain.js`)

```js
export const ALLOWED_DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN || 'iiitbhopal.ac.in').toLowerCase();

/** Returns the canonical email or null if not an allowed institute address. */
export function normalizeInstitutionEmail(raw) {
  const email = String(raw ?? '').trim().toLowerCase();
  const parts = email.split('@');
  if (parts.length !== 2) return null;
  let [local, domain] = parts;
  if (domain !== ALLOWED_DOMAIN) return null;          // exact match: no subdomains, no suffix tricks
  local = local.split('+')[0];                          // strip +alias: one mailbox = one account
  if (!local || !/^[a-z0-9._-]+$/.test(local)) return null;
  return `${local}@${domain}`;
}
```

Why strip `+alias`: `name+1@iiitbhopal.ac.in` and `name+2@...` reach the same mailbox. Without this, one student makes unlimited accounts and defeats every per-user quota.

### Zod schemas (`auth.validation.js`)

Replace the email field in `registerSchema`, `loginSchema`, `resendVerificationSchema` and `forgotPasswordSchema`:

```js
import { z } from 'zod';
import { normalizeInstitutionEmail, ALLOWED_DOMAIN } from '../config/domain.js';

export const institutionEmail = z
  .string()
  .trim()
  .max(254)
  .transform((v) => normalizeInstitutionEmail(v))
  .refine((v) => v !== null, { message: `Use your @${ALLOWED_DOMAIN} email address.` })
  .transform((v) => /** @type {string} */ (v));

// registerSchema = z.object({ username: ..., email: institutionEmail, password: ... })
```

Apply it on login too, so the endpoint can't be used to probe arbitrary addresses.

Also enforce at the lowest layer: in `auth.service.js` `register()` and the Google find-or-create path, call `normalizeInstitutionEmail` again and throw 400 if null. Validation at the edge can be bypassed by future code; the service check cannot.

## 2. Password signup switch

`ALLOW_LOCAL_AUTH=false` → mount only `/google*`, `/refresh`, `/logout`, `/me`, and return 404 for register / login / forgot / reset / resend. Recommended if the institute mail is Google Workspace: it proves mailbox ownership without Brevo and removes the whole password attack surface.

If you keep password auth: email verification is mandatory (kit default), and Brevo mail to institute mailboxes may land in spam. Test with a real institute inbox.

## 3. Google OAuth locked to the domain

In `passport.js` verify callback, before any DB lookup:

```js
import { normalizeInstitutionEmail, ALLOWED_DOMAIN } from '../config/domain.js';

const emailObj  = profile.emails?.[0];
const email     = normalizeInstitutionEmail(emailObj?.value);
const verified  = emailObj?.verified === true || profile._json?.email_verified === true;
const hd        = profile._json?.hd;                       // present only for Workspace accounts
const needHd    = process.env.REQUIRE_GOOGLE_HD === 'true';

if (!email || !verified || (needHd && hd !== ALLOWED_DOMAIN)) {
  return done(null, false);                                // callback redirects to /login?error=google
}
// continue with kit logic using `email` (the normalized one)
```

Where the router starts the flow (`auth.route.js`), add the hint. It is a UI hint only; the check above is the real gate:

```js
passport.authenticate('google', {
  scope: ['profile', 'email'],
  hd: ALLOWED_DOMAIN,
  prompt: 'select_account',
  session: false,
})
```

Set `REQUIRE_GOOGLE_HD=true` only if the institute uses Google Workspace (`hd` is then always present). If it doesn't, leave it false and rely on the verified-email check.

New-user defaults (in the kit's create-user path, both local and Google):

```js
const mode = await settings.get('signup_mode');           // 'open' | 'approval' | 'closed'
if (mode === 'closed') throw httpError(403, 'Signups are closed.');
const status = mode === 'approval' ? 'PENDING' : 'ACTIVE';
const role = adminEmails.includes(email) ? 'ADMIN' : 'USER'; // ADMIN_EMAILS env, comma list
```

`ADMIN_EMAILS` is a bootstrap only: it promotes on account creation or login. After that, roles are managed in the admin panel. An ADMIN_EMAILS match also forces `status = ACTIVE`.

## 4. Turnstile on every unauthenticated auth endpoint

### Middleware (`server/middleware/turnstile.js`)

```js
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export function requireTurnstile(expectedAction) {
  return async (req, res, next) => {
    const token = req.body?.turnstileToken;
    if (typeof token !== 'string' || token.length === 0 || token.length > 2048) {
      return res.status(400).json({ success: false, code: 'CAPTCHA_REQUIRED', message: 'Complete the verification.' });
    }
    try {
      const form = new URLSearchParams({
        secret: process.env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: req.ip,
      });
      const r = await fetch(VERIFY_URL, { method: 'POST', body: form, signal: AbortSignal.timeout(5000) });
      const data = await r.json();

      const hostOk   = !process.env.TURNSTILE_EXPECTED_HOSTNAME || data.hostname === process.env.TURNSTILE_EXPECTED_HOSTNAME;
      const actionOk = !expectedAction || data.action === expectedAction;
      if (!data.success || !hostOk || !actionOk) {
        return res.status(403).json({ success: false, code: 'CAPTCHA_FAILED', message: 'Verification failed. Try again.' });
      }
      return next();
    } catch {
      // Fail CLOSED. If Cloudflare is unreachable, nobody gets in.
      return res.status(503).json({ success: false, code: 'CAPTCHA_UNAVAILABLE', message: 'Verification service unavailable.' });
    }
  };
}
```

Facts to rely on: tokens are single-use and expire after 300 seconds; validation must happen server-side; the secret key never goes to the browser. Cloudflare publishes dummy site/secret keys for development, so use those locally and set `TURNSTILE_EXPECTED_HOSTNAME` only in production.

### Wiring (`auth.route.js`)

```js
router.post('/register',            authLimiter, requireTurnstile('register'), controller.register);
router.post('/login',               authLimiter, requireTurnstile('login'),    controller.login);
router.post('/forgot-password',     authLimiter, requireTurnstile('forgot'),   controller.forgotPassword);
router.post('/resend-verification', authLimiter, requireTurnstile('resend'),   controller.resendVerification);
// reset-password / verify are token-gated already; /refresh, /logout, /me need no captcha.
```

Each frontend widget sets the matching `action`, and the server checks it, so a token solved for one form can't be replayed on another.

### Google flow (the redirect can't carry a token)

`GET /api/auth/google` is a browser redirect, so a script could hit it freely. Gate it with a one-time pre-check:

1. Frontend solves Turnstile (action `google`) and calls `POST /api/auth/google/prepare` with the token.
2. Server verifies via `requireTurnstile('google')`, then sets a short-lived signed cookie `g_ok` (httpOnly, sameSite lax, 2 min, random nonce stored in memory).
3. `GET /api/auth/google` requires and consumes `g_ok`; otherwise 403.

```js
const pending = new Map(); // nonce -> expiry
router.post('/google/prepare', authLimiter, requireTurnstile('google'), (req, res) => {
  const nonce = crypto.randomUUID();
  pending.set(nonce, Date.now() + 120_000);
  res.cookie('g_ok', nonce, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 120_000 });
  res.json({ success: true });
});
function requireGoogleOk(req, res, next) {
  const n = req.cookies?.g_ok;
  const exp = n && pending.get(n);
  pending.delete(n);
  res.clearCookie('g_ok');
  if (!exp || exp < Date.now()) return res.status(403).json({ success: false, code: 'CAPTCHA_REQUIRED' });
  next();
}
router.get('/google', requireGoogleOk, passport.authenticate('google', { /* options above */ }));
```

Single-process only (in-memory map). Fine for one instance; use the DB if you ever scale out.

## 5. Make access tokens session-aware (and enable instant blocking)

The kit's `authenticate` verifies the JWT and loads the user but never checks the session. So a blocked or logged-out user keeps working until the access token expires. Replace the body of `auth.middleware.js`:

```js
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';

export async function authenticate(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: 'Unauthorized.' });

  let payload;
  try { payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET); }
  catch { return res.status(401).json({ success: false, message: 'Unauthorized.' }); }

  const session = await prisma.session.findUnique({
    where: { id: payload.sessionId },
    include: { user: { select: { id: true, username: true, email: true, avatar: true, role: true, status: true, isEmailVerified: true } } },
  });

  if (!session || session.userId !== payload.userId || session.expiresAt < new Date()) {
    return res.status(401).json({ success: false, message: 'Session expired.' });
  }
  if (session.user.status === 'BLOCKED') {
    return res.status(403).json({ success: false, code: 'ACCOUNT_BLOCKED', message: 'Your access has been revoked.' });
  }
  if (session.user.status === 'PENDING') {
    return res.status(403).json({ success: false, code: 'ACCOUNT_PENDING', message: 'Awaiting admin approval.' });
  }
  req.user = session.user;
  req.sessionId = session.id;
  next();
}
```

Keep access tokens short (`JWT_ACCESS_EXPIRES_IN=15m`). Blocking a user = set `status=BLOCKED` **and** `session.deleteMany({ where: { userId } })`.

`/api/auth/me` should return `role` and `status`; if PENDING users must reach a "waiting for approval" screen, let `/me` use a variant of `authenticate` that does not 403 on PENDING.

`requireRole`:

```js
export const requireRole = (role) => (req, res, next) =>
  req.user?.role === role ? next() : res.status(403).json({ success: false, message: 'Forbidden.' });
```

Role always comes from the DB row loaded in `authenticate`, never from a token claim or request body.

## 6. Last-login tracking
In login and Google success paths: `prisma.user.update({ where:{id}, data:{ lastLoginAt: new Date() } })`. The admin Users page shows it.

## 7. Mount order (`server/index.js`)

```js
app.set('trust proxy', 1);                 // required behind the host's proxy so req.ip is correct
app.use(helmet());
app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());
app.use(originCheck);
app.use(auth.passport.initialize());
app.use('/api/auth', auth.router);
app.use('/api', apiRoutes);                // students, ai, me, human, admin
app.use(notFound);
app.use(errorHandler);                     // the kit ships these but its example doesn't mount them
```

The kit's controllers forward errors with `error.statusCode`; the mounted `errorHandler` must serialize them and hide stack traces in production.