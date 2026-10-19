import React, { useEffect, useState } from 'react';
import Mark from '../marks/Mark';

// Section 10.2: Pending approval
// DOOR art centered, open-circle mark, poll for approval
const DOOR_ART = `      ______________
     |  __________  |
     | |          | |
     | |          | |
     | |        o | |
     | |          | |
     | |__________| |
     |______________|`;

const DOOR_OPEN = `      ______________
     |              |
     |              |
     |              |
     |              |
     |              |
     |              |
     |______________|`;

export default function Pending({ onLogout }) {
  const [doorOpen, setDoorOpen] = useState(false);

  // Poll for approval status
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        const data = await res.json();
        if (data?.user?.status === 'ACTIVE') {
          setDoorOpen(true);
          setTimeout(() => {
            window.location.href = '/search';
          }, 1500);
        }
      } catch {}
    };

    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black p-6 font-terminal text-white">
      {/* Door art */}
      <pre
        aria-hidden="true"
        className="text-base sm:text-lg md:text-xl mb-6 select-none"
        style={{ color: 'var(--bone-60)', lineHeight: 1, letterSpacing: 0, whiteSpace: 'pre' }}
      >
        {doorOpen ? DOOR_OPEN : DOOR_ART}
      </pre>

      {/* Open circle mark */}
      <div className="mb-4"><Mark name="circle" size={32} /></div>

      <h1
        className="glitch text-2xl sm:text-3xl tracking-wider font-bold mb-4"
        data-text="CLEARANCE PENDING"
      >
        CLEARANCE PENDING
      </h1>

      <p className="font-typewriter text-sm text-center max-w-md mb-2" style={{ color: 'var(--bone-60)' }}>
        YOUR TAPE IS WAITING TO BE WATCHED.
      </p>
      <p className="font-typewriter text-sm text-center max-w-md mb-6" style={{ color: 'var(--bone-60)' }}>
        CLEARANCE TELEMETRY AWAITING AUTHORIZATION.
      </p>

      {/* Status block */}
      <div className="font-typewriter text-xs space-y-1 mb-8 text-left" style={{ color: 'var(--bone-35)' }}>
        <div>// STATUS CODE: PENDING_CLEARANCE</div>
        <div>// ACCESS SCOPE: LOCKED</div>
        <div>// DISPATCH: IIIT BHOPAL TERMINAL</div>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={() => window.location.reload()}
          className="btn-primary text-sm"
        >
          CHECK STATUS {'>>'}
        </button>
        <button
          onClick={onLogout}
          className="btn-secondary text-sm"
        >
          {'>'} DISCONNECT
        </button>
      </div>

      <div className="mt-8"><Mark name="dots" /></div>
    </div>
  );
}
