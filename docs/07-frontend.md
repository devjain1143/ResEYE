# 07 — Frontend (`web/`)

Vite + React 18 + React Router + TanStack Query + Tailwind. Built to `web/dist` and served by Express in production.

```bash
npm create vite@latest web -- --template react
cd web && npm i react-router-dom @tanstack/react-query @marsidev/react-turnstile react-markdown tailwindcss
```

Dev proxy (`web/vite.config.js`) so cookies stay same-origin in development:

```js
export default { server: { proxy: { '/api': 'http://localhost:5000' } } };
```

## Routes

| Path | Page | Guard |
|---|---|---|
| `/login` | Login (email+password+Turnstile, "Continue with Google") | public |
| `/register` | Register (only if password signup enabled) | public |
| `/auth/verify` | reads `?token=`, calls `GET /api/auth/verify` | public |
| `/auth/success` | after Google: call `/auth/refresh` → `/auth/me` → go to `/` | public |
| `/forgot-password`, `/auth/reset-password` | reset flow | public |
| `/pending` | "Awaiting admin approval" | PENDING |
| `/` | Search (student lookup + AI chat tabs) | ACTIVE |
| `/history` | own history | ACTIVE |
| `/admin/*` | admin pages (see `06-ADMIN-PANEL.md`) | ADMIN |

The kit builds verification and reset links as `<FRONTEND_URL>/auth/verify?token=…` and `…/auth/reset-password?token=…`; use those exact paths. Confirm in `src/templates/email/*`.

## Auth state

- Keep the access token **in memory only** (a module variable or React context). Never `localStorage`.
- On app load: `POST /api/auth/refresh` (cookie) → store token → `GET /api/auth/me`. If refresh fails → logged out.
- On any `401`: try refresh once, retry the request, else go to `/login`.

### API client (`web/src/api.js`)

```js
let accessToken = null;
let refreshing = null;
let onCaptchaNeeded = null;                       // set by a provider that shows the challenge modal
export const setCaptchaHandler = (fn) => { onCaptchaNeeded = fn; };

async function refresh() {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
    .then(async (r) => { if (!r.ok) throw new Error('refresh'); accessToken = (await r.json()).accessToken; })
    .finally(() => { refreshing = null; });
  return refreshing;
}

export async function api(path, { method = 'GET', body, retry = true } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(accessToken && { Authorization: `Bearer ${accessToken}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && retry) { await refresh(); return api(path, { method, body, retry: false }); }

  if (res.status === 428 && retry && onCaptchaNeeded) {          // human verification needed
    await onCaptchaNeeded();                                     // resolves after /human/verify succeeds
    return api(path, { method, body, retry: false });
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.message || 'Request failed'), { status: res.status, code: json.code, data: json });
  return json;
}
export const bootstrapAuth = () => refresh();
```

### Captcha modal handler
A `CaptchaProvider` registers `setCaptchaHandler(() => new Promise(...))`. It opens a modal with a Turnstile widget (action `search`); on success it calls `api('/human/verify', {method:'POST', body:{turnstileToken}})`, closes, and resolves the promise.

## Turnstile component usage

```jsx
import { useRef, useState } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';

export default function LoginForm() {
  const [token, setToken] = useState(null);
  const widget = useRef(null);

  async function submit(e) {
    e.preventDefault();
    try {
      await api('/auth/login', { method: 'POST', body: { email, password, turnstileToken: token } });
      // ...
    } finally {
      widget.current?.reset();     // tokens are single-use; always get a fresh one
      setToken(null);
    }
  }

  return (
    <form onSubmit={submit}>
      {/* inputs */}
      <Turnstile
        ref={widget}
        siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
        options={{ action: 'login' }}
        onSuccess={setToken}
        onExpire={() => setToken(null)}
      />
      <button disabled={!token}>Sign in</button>
    </form>
  );
}
```

Use `action: 'register' | 'login' | 'forgot' | 'resend' | 'google' | 'search'`; the server verifies the same string.

Google button: solve Turnstile (`google`) → `POST /api/auth/google/prepare` → `window.location.href = '/api/auth/google'`.

Client-side email check (UX only, the server is the authority): show an error unless the address ends with `@iiitbhopal.ac.in`.

## Main page (`/`)

- **Student tab:** one input (name or scholar number). Debounce not needed; submit-only, to protect quota. Show remaining daily lookups from `429`/response headers. Result: card with name, scholar no., degree, branch, an SPI/result table for semesters 1–8, and CPI. Multiple matches → list (max 10) with a "next page" button disabled after page 2. Admin extras: registration panel (guardian, category, phones, emails, per-semester addresses) and a "Track scholar" button.
- **AI tab:** chat-style input → `POST /api/ai`; render `text` with `react-markdown` (no `rehype-raw`, so no HTML injection), show "x/10 queries used today", show a cached badge when applicable. Example chips: "who topped 2nd sem in ece-28?", "average CPI of cse-26".
- Errors: `429 LOOKUP_QUOTA`/`RATE_LIMIT` → friendly message with retry time; `403 ACCOUNT_BLOCKED` → logged-out screen explaining access was revoked.

## App shell
- Header: user menu, notification bell (unread count from `/me/notifications`), announcement banner from `/announcements/active`.
- `WARNING` notifications show as a blocking dialog with "I understand" (marks read).
- Admin link visible only when `me.role === 'ADMIN'`.

## Admin UI notes
- A shared `<DataTable>` (server-side pagination), `<ConfirmDialog>` (typed confirmation for delete), `<RangeFilter>` for history.
- Poll alert badge every 15 s: `useQuery({ queryKey:['alerts-count'], queryFn, refetchInterval: 15000 })`.
- Format all timestamps with `Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })`.

## Frontend security checklist
- No `dangerouslySetInnerHTML`. No `rehype-raw`.
- No tokens in storage or URLs (the only URL token is the one-time email verify/reset token; remove it from history with `navigate(..., { replace: true })` after use).
- Only `VITE_`-prefixed non-secret values (Turnstile **site** key). The secret key lives on the server only.
- Set a CSP via helmet that allows `https://challenges.cloudflare.com` for `script-src`, `frame-src` and `connect-src`; test the widget loads.