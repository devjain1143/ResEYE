import React, { useRef, useState, useEffect } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import { api, setCaptchaHandler } from '../api';

export default function CaptchaModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [resolver, setResolver] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const widgetRef = useRef(null);

  useEffect(() => {
    setCaptchaHandler(() => {
      return new Promise((resolve) => {
        setResolver(() => resolve);
        setIsOpen(true);
      });
    });
  }, []);

  const handleVerify = async (token) => {
    if (!token) return;
    setLoading(true);
    setError('');

    try {
      await api('/human/verify', {
        method: 'POST',
        body: { turnstileToken: token },
        retry: false
      });
      setIsOpen(false);
      if (resolver) resolver();
    } catch (err) {
      setError(err.message || 'Verification failed. Try again.');
      widgetRef.current?.reset();
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4">
      <div className="w-full max-w-md border border-white/40 bg-black p-6 font-terminal text-white clip-torn">
        <div className="mb-4 flex items-center justify-between border-b border-white/20 pb-2">
          <span className="text-sm tracking-widest text-white/60">[ VERIFICATION GATE ]</span>
          <span className="text-xs text-white/40">ACTION: SEARCH</span>
        </div>

        <p className="mb-4 font-typewriter text-sm text-white/80">
          The tape archive requires proof of human operator clearance before retrieving student records.
        </p>

        {error && (
          <div className="mb-4 border border-white/60 bg-white text-black p-2 text-xs font-typewriter">
            FAULT: {error}
          </div>
        )}

        <div className="my-6 flex flex-col items-center justify-center p-4 border border-white/20 bg-white/5 text-center">
          <div className="text-xs font-mono tracking-widest text-white/80 animate-pulse">
            [ VERIFYING OPERATOR CLEARANCE IN BACKGROUND... ]
          </div>
          <div className="mt-2 text-[10px] text-white/40 font-mono">
            ARCHIVE ACCESS HANDSHAKE IN PROGRESS
          </div>
        </div>

        {/* Hidden Background Turnstile */}
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: '-9999px',
            top: '0',
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
            options={{ action: 'search', theme: 'dark' }}
            onSuccess={handleVerify}
            onError={() => setError('Verification challenge failed.')}
            onExpire={() => widgetRef.current?.reset()}
          />
        </div>

        {loading && (
          <div className="text-center text-xs text-white/60">
            TRANSMITTING CLEARANCE TOKEN...
          </div>
        )}
      </div>
    </div>
  );
}
