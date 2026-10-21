import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
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
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const errParam = searchParams.get('error');
    if (errParam === 'google_not_configured') {
      setError('FAULT: INSTITUTIONAL GOOGLE OAUTH IS NOT CONFIGURED.');
    } else if (errParam === 'google') {
      setError('FAULT: GOOGLE WORKSPACE AUTHENTICATION FAILED.');
    }

    api('/auth/config')
      .then((res) => {
        if (res && res.googleEnabled) {
          setGoogleEnabled(true);
        }
      })
      .catch(() => {});
  }, [searchParams]);

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
      setError(`FAULT: ${err.message || 'EMAIL OR PASSWORD IS INCORRECT.'}`);
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

          {error && (
            <div
              className="mb-4 font-typewriter text-sm py-2 px-3"
              style={{ background: '#fff', color: '#000' }}
            >
              {error}
            </div>
          )}

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

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full mt-4 glitch"
              data-corruptible="true"
              data-text={loading ? 'AUTHENTICATING...' : 'SIGN IN >>'}
            >
              {loading ? 'AUTHENTICATING...' : 'SIGN IN >>'}
            </button>
          </form>

          {/* Hidden Background Turnstiles */}
          <div
            aria-hidden="true"
            style={{
              position: 'fixed',
              left: '-9999px',
              top: '0px',
              width: '300px',
              height: '65px',
              opacity: 0,
              pointerEvents: 'none',
              zIndex: -100,
            }}
          >
            <Turnstile
              ref={widgetRef}
              siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY || '0x4AAAAAAFcO6VeDG_Psrewy'}
              options={{ action: 'login', theme: 'dark' }}
              onSuccess={(t) => {
                setToken(t);
                if (tokenResolverRef.current) tokenResolverRef.current(t);
              }}
              onExpire={() => setToken(null)}
            />
            {googleEnabled && (
              <Turnstile
                ref={googleWidgetRef}
                siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY || '0x4AAAAAAFcO6VeDG_Psrewy'}
                options={{ action: 'google', theme: 'dark' }}
                onSuccess={(t) => {
                  setGoogleToken(t);
                  if (googleTokenResolverRef.current) googleTokenResolverRef.current(t);
                }}
                onExpire={() => setGoogleToken(null)}
              />
            )}
          </div>

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
