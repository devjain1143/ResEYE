import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Turnstile } from '@marsidev/react-turnstile';
import { api, setAccessToken } from '../api';
import AsciiEye from '../components/AsciiEye';
import GlitchEye from '../components/GlitchEye';
import Mark from '../marks/Mark';

// Section 10.1: Sign in ("Insert tape")
// Left 2/3: giant RESEYE (96-120px) with heavy glitch, EYE art, faint background mosaic
// Right column: AUTHENTICATE heading, Google, email/password underline inputs, captcha, primary slab
export default function Login({ onAuthSuccess }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(null);
  const [googleToken, setGoogleToken] = useState(null);
  const [error, setError] = useState('');
  const [unverifiedEmail, setUnverifiedEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [stare, setStare] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState('');
  const [forgotError, setForgotError] = useState('');

  const widgetRef = useRef(null);
  const googleWidgetRef = useRef(null);
  const tokenResolverRef = useRef(null);
  const googleTokenResolverRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const errParam = searchParams.get('error');
    if (errParam === 'google_not_configured') {
      setError('FAULT: INSTITUTIONAL GOOGLE OAUTH IS NOT CONFIGURED.');
    } else if (errParam === 'google') {
      setError('FAULT: GOOGLE WORKSPACE AUTHENTICATION FAILED.');
    }

    const stateEmail = location.state?.unverifiedEmail || location.state?.email;
    const paramEmail = searchParams.get('email');
    if (
      location.state?.unverified ||
      location.state?.unverifiedEmail ||
      searchParams.get('unverified') === 'true' ||
      searchParams.get('registered') === 'true'
    ) {
      const target = stateEmail || paramEmail;
      if (target) {
        setUnverifiedEmail(target);
        setIdentifier(target);
      }
    }

    api('/auth/config')
      .then((res) => {
        if (res && res.googleEnabled) {
          setGoogleEnabled(true);
        }
      })
      .catch(() => {});
  }, [searchParams, location.state]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setStare(false);

    if (identifier.includes('@') && !identifier.toLowerCase().endsWith('@iiitbhopal.ac.in')) {
      setError('FAULT: THIS ARCHIVE ONLY ACCEPTS INSTITUTE ADDRESSES.');
      setStare(true);
      return;
    }

    setLoading(true);
    try {
      let activeToken = token;
      if (!activeToken) {
        activeToken = await new Promise((resolve) => {
          tokenResolverRef.current = resolve;
          setTimeout(() => resolve(null), 3500);
        });
      }

      const res = await api('/auth/login', {
        method: 'POST',
        body: { identifier, password, turnstileToken: activeToken },
        retry: false
      });

      setAccessToken(res.accessToken);
      onAuthSuccess(res.user);
    } catch (err) {
      if (
        err.code === 'EMAIL_NOT_VERIFIED' ||
        (err.message && (err.message.toLowerCase().includes('not verified') || err.message.toLowerCase().includes('verification mail') || err.message.toLowerCase().includes('junk')))
      ) {
        const targetEmail = err.email || err.data?.email || (identifier.includes('@') ? identifier.trim() : '');
        setUnverifiedEmail(targetEmail || identifier.trim() || 'your email');
        setError('');
      } else {
        setError(`FAULT: ${err.message || 'EMAIL OR PASSWORD IS INCORRECT.'}`);
        setUnverifiedEmail('');
      }
      setStare(true);
      widgetRef.current?.reset();
      setToken(null);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setForgotError('');
    setForgotSuccess('');

    if (!forgotEmail.toLowerCase().endsWith('@iiitbhopal.ac.in')) {
      setForgotError('FAULT: THIS ARCHIVE ONLY ACCEPTS INSTITUTE ADDRESSES.');
      return;
    }

    setForgotLoading(true);
    try {
      const res = await api('/auth/forgot-password', {
        method: 'POST',
        body: { email: forgotEmail }
      });
      setForgotSuccess(res.message || 'PASSWORD RESET LINK DISPATCHED TO INBOX.');
    } catch (err) {
      setForgotError(`FAULT: ${err.message || 'FAILED TO SEND RESET LINK.'}`);
    } finally {
      setForgotLoading(false);
    }
  };

  const handleGooglePrepare = async () => {
    setGoogleLoading(true);
    setError('');
    try {
      let activeToken = googleToken;
      if (!activeToken) {
        activeToken = await new Promise((resolve) => {
          googleTokenResolverRef.current = resolve;
          setTimeout(() => resolve(null), 3500);
        });
      }

      await api('/auth/google/prepare', {
        method: 'POST',
        body: { turnstileToken: activeToken },
        retry: false
      });
      window.location.href = '/api/auth/google';
    } catch (err) {
      setError(`FAULT: ${err.message || 'GOOGLE VERIFICATION FAILED.'}`);
      setGoogleLoading(false);
      googleWidgetRef.current?.reset();
      setGoogleToken(null);
    }
  };

  return (
    <div className="min-h-screen flex items-stretch bg-black relative overflow-hidden">
      {/* Left section: Giant logo + eye */}
      <div className="hidden lg:flex flex-col justify-center items-center w-3/5 relative px-8 xl:px-12 overflow-hidden z-10">
                {/* Giant logo */}
        <h1
          className="glitch font-terminal font-bold text-white relative z-20 shrink-0"
          data-text="ResEYE"
          style={{ fontSize: 'clamp(74px, 10vw, 122px)', letterSpacing: '.18em', lineHeight: 1 }}
        >
          ResEYE
        </h1>

        {/* Eye art */}
        <div className="relative z-0 w-full flex items-center justify-center my-4 shrink-0" style={{ height: '350px' }}>
          <GlitchEye stare={stare} />
        </div>

        {/* Static bar divider */}
        <pre
          aria-hidden="true"
          className="mt-2 font-terminal select-none relative z-20 shrink-0"
          style={{ color: 'var(--bone-35)', fontSize: '16px' }}
          data-corruptible
        >
          {'░▒▓█▓▒░░▒▓█▓▒░ ▒▓█▓▒░░▒▓█ ▓▒░░▒▓█▓▒░'}
        </pre>
      </div>

      {/* Right section: Auth form */}
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-12 lg:px-16 py-12 lg:w-2/5 relative z-20 bg-black">
        {/* Mobile logo */}
        <div className="lg:hidden mb-8 text-center">
          <h1
            className="glitch font-terminal font-bold text-white"
            data-text="ResEYE"
            style={{ fontSize: '50px', letterSpacing: '.12em' }}
          >
            ResEYE
          </h1>
          <div className="relative w-full flex items-center justify-center my-2 overflow-visible" style={{ height: '220px' }}>
            <GlitchEye stare={stare} />
          </div>
        </div>

        <div className="max-w-sm mx-auto w-full">
          <h2 className="font-terminal text-xl tracking-widest mb-1 text-white" data-corruptible>AUTHENTICATE</h2>
          <div className="font-terminal text-xs tracking-wider mb-6" style={{ color: 'var(--bone-35)' }}>
            INSERT CREDENTIALS TO ACCESS THE ARCHIVE
          </div>

          {unverifiedEmail ? (
            <div className="mb-6 p-4 border border-white/20 bg-white/5 space-y-3 font-typewriter text-xs text-white/90">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-bold text-white flex items-center gap-1.5 font-terminal tracking-wider">
                  <span className="text-amber-400 select-none">[!]</span>
                  <span>VERIFICATION PENDING</span>
                </div>
                <button
                  type="button"
                  onClick={() => setUnverifiedEmail('')}
                  className="text-white/40 hover:text-white font-terminal text-xs"
                  aria-label="Dismiss notice"
                >
                  [X]
                </button>
              </div>

              <p className="leading-relaxed text-sm">
                Verification mail has been sent to{' '}
                <strong className="text-cyan-300 font-mono break-all font-semibold">
                  {unverifiedEmail}
                </strong>
                . Please check your inbox and check your junk folder.
              </p>

              <div className="pt-2 border-t border-white/10 space-y-2">
                <p className="text-white/70 text-xs">
                  If you find an issue, contact us:
                </p>
                <div className="flex flex-wrap gap-2.5 pt-1 font-terminal">
                  <a
                    href="https://www.instagram.com/bru_fu02"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-white text-black hover:bg-neutral-200 text-sm font-bold transition-all shadow select-none"
                    style={{ textDecoration: 'none' }}
                  >
                    <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                    </svg>
                    <span>Instagram</span>
                  </a>

                  <a
                    href="https://t.me/bru_fu02"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-white text-black hover:bg-neutral-200 text-sm font-bold transition-all shadow select-none"
                    style={{ textDecoration: 'none' }}
                  >
                    <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.121l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.832.969z"/>
                    </svg>
                    <span>Telegram</span>
                  </a>
                </div>
              </div>
            </div>
          ) : error ? (
            <div
              className="mb-4 font-typewriter text-sm py-2 px-3"
              style={{ background: '#fff', color: '#000' }}
            >
              {error}
            </div>
          ) : null}

          {/* Google OAuth */}
          {googleEnabled && (
            <div className="mb-6">
              <button
                type="button"
                disabled={googleLoading}
                onClick={handleGooglePrepare}
                className="btn-secondary w-full text-sm"
              >
                {googleLoading ? 'INITIATING HANDSHAKE...' : '> CONTINUE WITH GOOGLE'}
              </button>

              {/* Zigzag OR divider */}
              <div className="flex items-center gap-3 my-4">
                <div style={{ flex: 1, opacity: 0.3 }}><Mark name="zigzag" /></div>
                <span className="font-terminal text-xs" style={{ color: 'var(--bone-35)' }}>OR</span>
                <div style={{ flex: 1, opacity: 0.3 }}><Mark name="zigzag" /></div>
              </div>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="input-label">INSTITUTION EMAIL OR USERNAME</label>
              <input
                type="text"
                required
                value={identifier}
                onChange={(e) => { setIdentifier(e.target.value); setStare(false); }}
                placeholder="________"
                className="input-underline"
                style={{ fontSize: '20px' }}
                autoComplete="username"
              />
            </div>

            <div>
              <label className="input-label">PASSWORD</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => { setPassword(e.target.value); setStare(false); }}
                placeholder="________"
                className="input-underline"
                style={{ fontSize: '20px' }}
                autoComplete="current-password"
              />
            </div>

            <div className="flex justify-center my-2">
              <Turnstile
                ref={widgetRef}
                siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY || '0x4AAAAAAFcO6VeDG_Psrewy'}
                options={{ action: 'login', theme: 'dark', appearance: 'interaction-only' }}
                onSuccess={(t) => {
                  setToken(t);
                  if (tokenResolverRef.current) tokenResolverRef.current(t);
                }}
                onError={(err) => {
                  console.warn('[Turnstile login]', err);
                }}
                onExpire={() => {
                  setToken(null);
                  widgetRef.current?.reset();
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full mt-2 glitch"
              data-corruptible="true"
              data-text={loading ? 'AUTHENTICATING...' : 'SIGN IN >>'}
            >
              {loading ? 'AUTHENTICATING...' : 'SIGN IN >>'}
            </button>
          </form>

          {googleEnabled && (
            <div className="flex justify-center my-1">
              <Turnstile
                ref={googleWidgetRef}
                siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY || '0x4AAAAAAFcO6VeDG_Psrewy'}
                options={{ action: 'google', theme: 'dark', appearance: 'interaction-only' }}
                onSuccess={(t) => {
                  setGoogleToken(t);
                  if (googleTokenResolverRef.current) googleTokenResolverRef.current(t);
                }}
                onExpire={() => {
                  setGoogleToken(null);
                  googleWidgetRef.current?.reset();
                }}
              />
            </div>
          )}

          {/* Footer links */}
          <div className="mt-8 flex justify-between items-center font-terminal text-xs" style={{ color: 'var(--bone-35)' }}>
            <Link to="/register" className="btn-secondary text-xs" style={{ padding: '2px 0' }}>
              {'> REGISTER ACCOUNT'}
            </Link>
            <button
              type="button"
              onClick={() => { setShowForgot(!showForgot); setForgotError(''); setForgotSuccess(''); }}
              className="btn-secondary text-xs"
              style={{ padding: '2px 0' }}
            >
              {'> FORGOT PASSWORD?'}
            </button>
          </div>

          {/* Inline Forgot Password Form */}
          {showForgot && (
            <div className="mt-4 p-4 border border-white/20 bg-white/5 space-y-3 font-terminal">
              <div className="flex justify-between items-center text-xs tracking-wider text-white/80">
                <span>[ RESET CLEARANCE CREDENTIALS ]</span>
                <button
                  type="button"
                  onClick={() => setShowForgot(false)}
                  className="text-white/40 hover:text-white"
                >
                  [X]
                </button>
              </div>

              {forgotError && (
                <div className="font-typewriter text-xs py-1 px-2" style={{ background: '#fff', color: '#000' }}>
                  {forgotError}
                </div>
              )}

              {forgotSuccess && (
                <div className="font-typewriter text-xs py-1 px-2" style={{ background: 'var(--bone-15)', color: 'var(--bone-80)' }}>
                  {forgotSuccess}
                </div>
              )}

              <form onSubmit={handleForgotPassword} className="space-y-3">
                <input
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="________"
                  className="input-underline text-xs"
                />
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="btn-primary w-full text-xs glitch"
                  data-corruptible="true"
                  data-text={forgotLoading ? 'TRANSMITTING...' : 'SEND RESET LINK >>'}
                >
                  {forgotLoading ? 'TRANSMITTING...' : 'SEND RESET LINK >>'}
                </button>
              </form>
            </div>
          )}

          {/* Dots row */}
          <div className="mt-4"><Mark name="dots" /></div>
        </div>
      </div>
    </div>
  );
}
