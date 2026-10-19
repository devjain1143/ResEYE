// Watcher component per spec section 8.6
// 1-2% chance per page view, after 20-60s idle, fades in at bottom-left
// Fades out when pointer moves. Never during form/modal/reduced distortion.
import React, { useState, useEffect, useRef } from 'react';
import { getDistortion } from '../settings/distortion';

const WATCHER_ART = `          ___
         (. .)
          |_|
         /| |\\
        / | | \\
          | |
          | |
         _| |_`;

export default function Watcher() {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    // 1-2% chance
    if (Math.random() > 0.02) return;
    if (getDistortion() !== 'normal') return;

    const delay = 20000 + Math.random() * 40000;
    timerRef.current = setTimeout(() => {
      // Don't show if a modal is open or during form entry
      if (document.querySelector('[role="dialog"]')) return;
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

      setVisible(true);
    }, delay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!visible) return;

    const handleMove = () => {
      setVisible(false);
    };

    window.addEventListener('mousemove', handleMove, { once: true });
    window.addEventListener('touchstart', handleMove, { once: true });

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('touchstart', handleMove);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <pre
      aria-hidden="true"
      className="fixed bottom-4 left-4 z-[85] font-terminal text-xs leading-none select-none pointer-events-none"
      style={{
        color: 'rgb(255 255 255 / .2)',
        animation: 'watcher-fade 2s ease-in forwards'
      }}
    >
      {WATCHER_ART}
      <style>{`
        @keyframes watcher-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </pre>
  );
}
