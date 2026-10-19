import React from 'react';

// Section 7: Cave-mark line symbols
// Hand-scratched primitive marks as inline SVG strokes
// Each mark: 32px default, scales with em

const MARKS = {
  zigzag: (
    <svg viewBox="0 0 320 24" width="320" height="24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" filter="url(#scratch)" aria-hidden="true">
      <path d="M2 18 L22 4 L42 18 L62 4 L82 18 L102 4 L122 18 L142 4 L162 18 L182 4 L202 18 L222 4 L242 18 L262 4 L282 18 L302 4 L318 14"/>
    </svg>
  ),
  sun: (
    <svg viewBox="0 0 48 48" width="32" height="32" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" filter="url(#scratch)" aria-hidden="true">
      <circle cx="24" cy="24" r="8"/>
      <path d="M24 4V12 M24 36V44 M4 24H12 M36 24H44 M10 10L16 16 M32 32L38 38 M38 10L32 16 M16 32L10 38"/>
    </svg>
  ),
  figure: (
    <svg viewBox="0 0 32 56" width="20" height="36" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" filter="url(#scratch)" aria-hidden="true">
      <circle cx="16" cy="8" r="5"/><path d="M16 13V34 M16 20L4 28 M16 20L28 28 M16 34L6 52 M16 34L26 52"/>
    </svg>
  ),
  flutings: (
    <svg viewBox="0 0 40 28" width="40" height="28" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" filter="url(#scratch)" aria-hidden="true">
      <path d="M6 24 C5 16 7 8 6 3 M16 24 C15 16 17 8 16 3 M26 24 C25 16 27 8 26 3 M36 24 C35 16 37 8 36 3"/>
    </svg>
  ),
  spiral: (
    <svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" filter="url(#scratch)" aria-hidden="true">
      <path d="M16 16 C16 14 18 12 20 12 C22 12 24 14 24 16 C24 20 20 24 16 24 C10 24 6 20 6 16 C6 10 10 4 16 4 C24 4 28 10 28 16"/>
    </svg>
  ),
  eye: (
    <svg viewBox="0 0 40 24" width="40" height="24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" filter="url(#scratch)" aria-hidden="true">
      <path d="M2 12 C8 4 16 2 20 2 C24 2 32 4 38 12 C32 20 24 22 20 22 C16 22 8 20 2 12Z"/>
      <circle cx="20" cy="12" r="5"/>
    </svg>
  ),
  x: (
    <svg viewBox="0 0 28 28" width="24" height="24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" filter="url(#scratch)" aria-hidden="true">
      <path d="M4 4L24 24 M24 4L4 24"/>
    </svg>
  ),
  circle: (
    <svg viewBox="0 0 28 28" width="24" height="24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" filter="url(#scratch)" aria-hidden="true">
      <circle cx="14" cy="14" r="10"/>
    </svg>
  ),
  hand: (
    <svg viewBox="0 0 36 40" width="28" height="32" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" filter="url(#scratch)" aria-hidden="true">
      <path d="M18 40V28 M10 28L6 36 M26 28L30 36 M6 28C4 22 4 14 8 8 C12 4 24 4 28 8 C32 14 32 22 30 28Z"/>
    </svg>
  ),
  bison: (
    <svg viewBox="0 0 48 32" width="48" height="32" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" filter="url(#scratch)" aria-hidden="true">
      <path d="M8 28L8 20C8 14 12 8 20 6C24 5 30 5 34 8C38 11 40 16 40 22L40 28 M8 20C4 18 2 14 4 12 M40 20C44 18 46 14 44 12 M14 28L14 24 M34 28L34 24"/>
    </svg>
  ),
  hunters: (
    <svg viewBox="0 0 80 48" width="80" height="48" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" filter="url(#scratch)" aria-hidden="true">
      {/* Figure 1 */}
      <circle cx="12" cy="8" r="4"/><path d="M12 12V28 M12 18L2 24 M12 18L22 24 M12 28L6 44 M12 28L18 44 M22 14L30 8"/>
      {/* Figure 2 */}
      <circle cx="40" cy="8" r="4"/><path d="M40 12V28 M40 18L30 24 M40 18L50 24 M40 28L34 44 M40 28L46 44 M50 14L58 8"/>
      {/* Figure 3 */}
      <circle cx="68" cy="8" r="4"/><path d="M68 12V28 M68 18L58 24 M68 18L78 24 M68 28L62 44 M68 28L74 44"/>
    </svg>
  ),
  dots: (
    <svg viewBox="0 0 100 8" width="100" height="8" fill="#fff" aria-hidden="true">
      <circle cx="4" cy="4" r="2.5" opacity=".6"/><circle cx="18" cy="4" r="2.5" opacity=".6"/>
      <circle cx="32" cy="4" r="2.5" opacity=".6"/><circle cx="46" cy="4" r="2.5" opacity=".6"/>
      <circle cx="60" cy="4" r="2.5" opacity=".6"/><circle cx="74" cy="4" r="2.5" opacity=".6"/>
      <circle cx="88" cy="4" r="2.5" opacity=".6"/>
    </svg>
  ),
};

// SVG roughen filter - must be rendered once in the page
export function ScratchFilter() {
  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
      <filter id="scratch">
        <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="4"/>
        <feDisplacementMap in="SourceGraphic" scale="3"/>
      </filter>
    </svg>
  );
}

export default function Mark({ name, size, className = '', style = {} }) {
  const mark = MARKS[name];
  if (!mark) return null;

  const sizeStyle = size ? { width: size, height: 'auto' } : {};

  return (
    <span className={`inline-flex items-center ${className}`} style={{ ...sizeStyle, ...style }}>
      {mark}
    </span>
  );
}
