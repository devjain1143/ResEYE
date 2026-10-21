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
            </div>

            <button
              type="button"
              onClick={() => navigate('/login')}
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
          <Link to="/login" className="btn-secondary text-xs" style={{ padding: '2px 0' }}>
            {'> ALREADY ENROLLED? ACCESS TERMINAL'}
          </Link>
        </div>

        <div className="mt-4"><Mark name="dots" /></div>
      </div>
    </div>
  );
}
