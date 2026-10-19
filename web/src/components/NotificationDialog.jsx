import React, { useState, useEffect } from 'react';
import { api } from '../api';

export default function NotificationDialog() {
  const [warning, setWarning] = useState(null);

  const checkNotifications = async () => {
    try {
      const res = await api('/me/notifications');
      if (res.data) {
        const unreadWarning = res.data.find((n) => n.kind === 'WARNING' && !n.read_at);
        if (unreadWarning) {
          setWarning(unreadWarning);
        }
      }
    } catch {}
  };

  useEffect(() => {
    checkNotifications();
    const interval = setInterval(checkNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleAcknowledge = async () => {
    if (!warning) return;
    try {
      await api(`/me/notifications/${warning.id}/read`, { method: 'POST' });
      setWarning(null);
    } catch {}
  };

  if (!warning) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/95 p-4">
      <div className="w-full max-w-lg border-2 border-white bg-black p-6 font-terminal text-white clip-torn crt-screen">
        <div className="mb-4 flex items-center justify-between border-b border-white pb-2">
          <span className="bg-white text-black px-2 py-0.5 text-sm font-bold">[ SECURITY WARNING ]</span>
          <span className="text-xs text-white/50">SYSTEM SECURITY DIRECTIVE</span>
        </div>

        <div className="my-6 font-typewriter text-sm leading-relaxed text-white/90 whitespace-pre-wrap border-l-2 border-white/60 pl-4">
          {warning.body}
        </div>

        <div className="mt-8 flex justify-end">
          <button
            onClick={handleAcknowledge}
            className="border border-white bg-white px-6 py-2 text-sm font-bold text-black hover:bg-black hover:text-white transition-colors"
          >
            I UNDERSTAND AND ACKNOWLEDGE
          </button>
        </div>
      </div>
    </div>
  );
}
