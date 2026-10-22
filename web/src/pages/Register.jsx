import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Turnstile } from '@marsidev/react-turnstile';
import { api } from '../api';
import Mark from '../marks/Mark';

export default function Register() {
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState('FORM'); // 'FORM' | 'VERIFICATION_SENT'
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState(() => searchParams.get('email') || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [token, setToken] = useState(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);

  const widgetRef = useRef(null);
  const tokenResolverRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    let timer;
    if (resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!email.toLowerCase().endsWith('@iiitbhopal.ac.in')) {
      setError('FAULT: THIS ARCHIVE ONLY ACCEPTS INSTITUTE ADDRESSES.');
      return;
    }

    if (password !== confirmPassword) {
      setError('FAULT: PASSWORDS DO NOT MATCH.');
      return;
    }

    if (password.length < 8) {
      setError('FAULT: PASSWORD MUST BE AT LEAST 8 CHARACTERS.');
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

      const res = await api('/auth/register', {
        method: 'POST',
        body: { username, email, password, turnstileToken: activeToken },
        retry: false
      });

      setStep('VERIFICATION_SENT');
      setResendCooldown(30);
      setSuccessMsg(res.message || 'VERIFICATION LINK DISPATCHED TO INSTITUTION INBOX.');
    } catch (err) {
      setError(`FAULT: ${err.message || 'REGISTRATION FAILED.'}`);
      widgetRef.current?.reset();
      setToken(null);
    } finally {
      setLoading(false);
    }
  };

  const handleResendLink = async () => {
    if (resendCooldown > 0 || resendLoading) return;
    setError('');
    setSuccessMsg('');
    setResendLoading(true);

    try {
      const res = await api('/auth/resend-verification', {
        method: 'POST',
        body: { email, password },
        retry: false
      });
      setResendCooldown(30);
      setSuccessMsg(res.message || 'NEW VERIFICATION LINK TRANSMITTED.');
    } catch (err) {
      setError(`FAULT: ${err.message || 'FAILED TO RESEND VERIFICATION LINK.'}`);
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black p-6">
      <div className="max-w-sm w-full">
        <h1
          className="glitch font-terminal font-bold text-white mb-1"
          data-text={step === 'VERIFICATION_SENT' ? 'VERIFY' : 'ENROLL'}
          style={{ fontSize: '46px', letterSpacing: '.12em' }}
        >
          {step === 'VERIFICATION_SENT' ? 'VERIFY' : 'ENROLL'}
        </h1>
        <div className="font-terminal text-xs tracking-wider mb-2" style={{ color: 'var(--bone-35)' }}>
          {step === 'VERIFICATION_SENT' ? 'CHECK INSTITUTIONAL INBOX' : 'NEW OPERATOR REGISTRATION'}
        </div>

        {error && (
          <div className="mb-4 font-typewriter text-sm py-2 px-3" style={{ background: '#fff', color: '#000' }}>
            {error}
          </div>
        )}

        {successMsg && (
          <div className="mb-4 font-typewriter text-sm py-2 px-3" style={{ background: 'var(--bone-15)', color: 'var(--bone-80)' }}>
            {successMsg}
          </div>
        )}

        {step === 'FORM' ? (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="input-label">USERNAME (A-Z, 0-9, _)</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="________"
                className="input-underline"
              />
            </div>

            <div>
              <label className="input-label">INSTITUTION EMAIL</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="________@iiitbhopal.ac.in"
                className="input-underline"
              />
            </div>

            <div>
              <label className="input-label">PASSWORD (MIN 8 CHARACTERS)</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="________"
                className="input-underline"
              />
            </div>

            <div>
              <label className="input-label">CONFIRM PASSWORD</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="________"
                className="input-underline"
              />
            </div>

            <div className="flex justify-center my-2">
              <Turnstile
                ref={widgetRef}
                siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY || '0x4AAAAAAFcO6VeDG_Psrewy'}
                options={{ action: 'register', theme: 'dark', appearance: 'interaction-only' }}
                onSuccess={(t) => {
                  setToken(t);
                  if (tokenResolverRef.current) tokenResolverRef.current(t);
                }}
                onError={(err) => {
                  console.warn('[Turnstile register]', err);
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
              className="btn-primary w-full mt-2"
            >
              {loading ? 'TRANSMITTING...' : 'ENROLL CREDENTIALS >>'}
            </button>
          </form>
        ) : (
          <div className="space-y-5">
            <div className="font-typewriter text-xs text-white/80 p-4 border border-white/20 bg-white/5 space-y-3">
              <p>
                A verification link has been dispatched to:
              </p>
              <p className="font-mono text-cyan-300 text-sm font-bold break-all">
                {email}
              </p>
              <p className="text-white/70 text-xs pt-1 border-t border-white/10">
                Open your mailbox and click the verification link to activate operator clearance, then proceed to sign in.
              </p>
              <div className="border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px] text-amber-300 font-mono flex items-start space-x-2">
                <span className="select-none font-bold text-amber-400">[!]</span>
                <span>
                  <strong>NOTE:</strong> Institutional mail filters often deliver verification links into the <strong>Junk / Spam / Quarantine</strong> folder. Please check your Junk folder if the link does not appear in your primary inbox.
                </span>
              </div>

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

            <button
              type="button"
              onClick={() => navigate('/login', { state: { unverifiedEmail: email } })}
              className="btn-primary w-full"
            >
              {'PROCEED TO SIGN IN >>'}
            </button>

            <div className="mt-4 flex items-center justify-between font-terminal text-xs">
              <button
                type="button"
                disabled={resendCooldown > 0 || resendLoading}
                onClick={handleResendLink}
                className="text-white/60 hover:text-white underline disabled:opacity-40 disabled:no-underline"
              >
                {resendCooldown > 0 ? `RESEND LINK (${resendCooldown}s)` : '> RESEND VERIFICATION LINK'}
              </button>

              <button
                type="button"
                onClick={() => { setStep('FORM'); setError(''); }}
                className="text-white/40 hover:text-white"
              >
                [ EDIT DETAILS ]
              </button>
            </div>
          </div>
        )}

        <div className="mt-8 font-terminal text-xs" style={{ color: 'var(--bone-35)' }}>
          <Link
            to="/login"
            state={step === 'VERIFICATION_SENT' && email ? { unverifiedEmail: email } : undefined}
            className="btn-secondary text-xs"
            style={{ padding: '2px 0' }}
          >
            {'> ALREADY ENROLLED? ACCESS TERMINAL'}
          </Link>
        </div>

        <div className="mt-4"><Mark name="dots" /></div>
      </div>
    </div>
  );
}
