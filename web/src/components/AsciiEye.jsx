import React, { useState, useEffect, useRef } from 'react';

// Section 8.5: The Eye
// Follows cursor: 5 frames (center, left, right, up, down)
// Blinks every 4-9s for 120ms
// On failed login: stares center, stops blinking

const frames = {
  center:  `        _.-''''''-._\n     .-'   .-""-.   '-.\n    <     ( (@@) )     >\n     '-.   '-..-'   .-'\n        '-.______.-'`,
  left:    `        _.-''''''-._\n     .-'   .-""-.   '-.\n    <    ((@@)   )     >\n     '-.   '-..-'   .-'\n        '-.______.-'`,
  right:   `        _.-''''''-._\n     .-'   .-""-.   '-.\n    <     (   (@@))    >\n     '-.   '-..-'   .-'\n        '-.______.-'`,
  up:      `        _.-''''''-._\n     .-'   .-""-.   '-.\n    <     ( (@@) )     >\n     '-.   '-..-'   .-'\n        '-.______.-'`,
  down:    `        _.-''''''-._\n     .-'   .-""-.   '-.\n    <     ( (@@) )     >\n     '-.   '-..-'   .-'\n        '-.______.-'`,
  closed:  `        _.-''''''-._\n     .-'            '-.\n    <  ----------------  >\n     '-.            .-'\n        '-.______.-'`,
};

export default function AsciiEye({ className = '', stare = false, size = 'md' }) {
  const [frame, setFrame] = useState('center');
  const [blinking, setBlinking] = useState(false);
  const blinkTimerRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (stare) {
      setFrame('center');
      return;
    }

    const handleMouseMove = (e) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);

      if (Math.abs(dx) < 100 && Math.abs(dy) < 80) {
        setFrame('center');
      } else if (angle > -45 && angle <= 45) {
        setFrame('right');
      } else if (angle > 45 && angle <= 135) {
        setFrame('down');
      } else if (angle > -135 && angle <= -45) {
        setFrame('up');
      } else {
        setFrame('left');
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [stare]);

  // Blink schedule
  useEffect(() => {
    if (stare) return; // No blink when staring

    const scheduleBlink = () => {
      const delay = 4000 + Math.random() * 5000;
      blinkTimerRef.current = setTimeout(() => {
        setBlinking(true);
        setTimeout(() => {
          setBlinking(false);
          scheduleBlink();
        }, 120);
      }, delay);
    };

    scheduleBlink();
    return () => {
      if (blinkTimerRef.current) clearTimeout(blinkTimerRef.current);
    };
  }, [stare]);

  const sizeClass = {
    sm: 'text-[12px] sm:text-xs',
    md: 'text-xs sm:text-sm md:text-base',
    lg: 'text-sm sm:text-lg md:text-xl lg:text-2xl',
    hero: 'text-base sm:text-xl md:text-3xl lg:text-4xl',
  }[size] || 'text-xs sm:text-sm md:text-base';

  return (
    <pre
      ref={containerRef}
      aria-hidden="true"
      className={`font-terminal leading-none select-none ${sizeClass} ${className}`}
      style={{ color: 'var(--bone-80)', lineHeight: 1, letterSpacing: 0, whiteSpace: 'pre' }}
    >
      {blinking ? frames.closed : frames[frame]}
    </pre>
  );
}
