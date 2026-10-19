// Distortion settings: LOW / NORMAL / OFF
// Stored in localStorage, applied pre-paint via data attribute

export const LEVELS = ['off', 'low', 'normal'];

export function getDistortion() {
  return localStorage.getItem('reseye-distortion') || 'normal';
}

export function setDistortion(level) {
  if (!LEVELS.includes(level)) return;
  localStorage.setItem('reseye-distortion', level);
  document.documentElement.setAttribute('data-distortion', level);
}

export function cycleDistortion() {
  const current = getDistortion();
  const idx = LEVELS.indexOf(current);
  const next = LEVELS[(idx + 1) % LEVELS.length];
  setDistortion(next);
  return next;
}

// Apply stored preference immediately (call from main.jsx before render)
export function applyDistortionPrePaint() {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (mq.matches) {
    document.documentElement.setAttribute('data-distortion', 'off');
    return;
  }

  const level = getDistortion();
  document.documentElement.setAttribute('data-distortion', level);

  // Mobile defaults to low if no preference saved
  if (!localStorage.getItem('reseye-distortion') && window.innerWidth < 768) {
    document.documentElement.setAttribute('data-distortion', 'low');
  }
}
