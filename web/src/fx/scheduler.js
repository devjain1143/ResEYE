// Glitch scheduler: one shared timer for all glitch elements.
// Section 8.1, 8.3, 8.4 of ui.md

let schedulerRunning = false;
let distortionLevel = 'normal'; // 'normal' | 'low' | 'off'

export function setDistortionLevel(level) {
  distortionLevel = level;
  document.documentElement.setAttribute('data-distortion', level);
  localStorage.setItem('reseye-distortion', level);
}

export function getDistortionLevel() {
  return distortionLevel;
}

export function initDistortion() {
  const saved = localStorage.getItem('reseye-distortion');
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) {
    distortionLevel = 'off';
  } else if (saved && ['normal', 'low', 'off'].includes(saved)) {
    distortionLevel = saved;
  } else {
    // Mobile defaults to low
    const isMobile = window.innerWidth < 768;
    distortionLevel = isMobile ? 'low' : 'normal';
  }
  document.documentElement.setAttribute('data-distortion', distortionLevel);
}

// ── Glitch text scheduler ──
// One timer drives all .glitch elements. Random interval 5-14s.
// On hover or error, trigger immediately.
function triggerGlitch(el) {
  if (distortionLevel === 'off') return;
  if (el.classList.contains('is-glitching')) return;
  el.classList.add('is-glitching');
  const dur = 180 + Math.random() * 140;
  setTimeout(() => el.classList.remove('is-glitching'), dur);
}

function scheduleGlitches() {
  if (schedulerRunning) return;
  schedulerRunning = true;

  const tick = () => {
    if (distortionLevel === 'off') {
      setTimeout(tick, 5000);
      return;
    }

    const multiplier = distortionLevel === 'low' ? 4 : 1;
    const els = document.querySelectorAll('.glitch');
    if (els.length > 0) {
      const el = els[Math.floor(Math.random() * els.length)];
      triggerGlitch(el);
    }

    const next = (5000 + Math.random() * 9000) * multiplier;
    setTimeout(tick, next);
  };

  tick();
}

// ── Global Button Glitch Synchronizer ──
function syncButtons() {
  const buttons = document.querySelectorAll('button, .btn-primary, .btn-secondary, .btn-destructive');
  for (const btn of buttons) {
    if (!btn.classList.contains('glitch')) {
      btn.classList.add('glitch');
    }
    if (!btn.hasAttribute('data-corruptible')) {
      btn.setAttribute('data-corruptible', 'true');
    }
    const currentText = btn.textContent?.trim();
    if (currentText && btn.getAttribute('data-text') !== currentText) {
      btn.setAttribute('data-text', currentText);
    }
  }
}

function initButtonGlitches() {
  syncButtons();

  if (typeof MutationObserver !== 'undefined' && document.body) {
    const observer = new MutationObserver(() => {
      syncButtons();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Capture hover on any button across the entire site
  document.addEventListener('mouseenter', (e) => {
    const btn = e.target?.closest && e.target.closest('button, .btn-primary, .btn-secondary, .btn-destructive');
    if (btn) {
      const text = btn.textContent?.trim();
      if (text && btn.getAttribute('data-text') !== text) {
        btn.setAttribute('data-text', text);
      }
      if (!btn.classList.contains('glitch')) {
        btn.classList.add('glitch');
      }
      if (!btn.hasAttribute('data-corruptible')) {
        btn.setAttribute('data-corruptible', 'true');
      }
      triggerGlitch(btn);
    }
  }, true);
}

// ── Text corruption scheduler ──
// Section 8.4: Occasionally replace 1-3 chars in labels with block chars
const BLOCK_CHARS = '\u2591\u2592\u2593\u2588';

function corruptText() {
  if (distortionLevel !== 'normal') return;
  if (document.hidden) return;

  const candidates = Array.from(document.querySelectorAll('[data-corruptible]')).filter(el => {
    return el.children.length === 0 && el.textContent.trim().length >= 2;
  });
  if (candidates.length === 0) return;

  const el = candidates[Math.floor(Math.random() * candidates.length)];
  const t = el.textContent;
  if (!t || t.length < 2) return;

  const i = Math.floor(Math.random() * t.length);
  if (/\s/.test(t[i])) return;

  const original = t;
  el.textContent = t.slice(0, i) + BLOCK_CHARS[Math.floor(Math.random() * 4)] + t.slice(i + 1);
  setTimeout(() => { 
    el.textContent = original; 
    if (el.hasAttribute('data-text')) {
      el.setAttribute('data-text', original);
    }
  }, 100 + Math.random() * 150);
}

function scheduleCorruption() {
  const tick = () => {
    corruptText();
    const next = 8000 + Math.random() * 12000;
    setTimeout(tick, next);
  };
  tick();
}

// ── Power flicker ──
// Section 8.3: opacity jitters 0.93-1 once every 20-40s
function scheduleFlicker() {
  const tick = () => {
    if (distortionLevel !== 'normal' || document.hidden) {
      setTimeout(tick, 20000 + Math.random() * 20000);
      return;
    }

    const app = document.getElementById('root');
    if (app) {
      app.classList.add('power-flicker');
      setTimeout(() => app.classList.remove('power-flicker'), 250);
    }

    setTimeout(tick, 20000 + Math.random() * 20000);
  };
  setTimeout(tick, 20000 + Math.random() * 20000);
}

// ── Pause on tab hidden ──
function setupVisibilityPause() {
  document.addEventListener('visibilitychange', () => {
    // Effects self-check document.hidden before acting
  });
}

// ── Init all schedulers ──
export function initSchedulers() {
  initDistortion();
  initButtonGlitches();
  scheduleGlitches();
  scheduleCorruption();
  scheduleFlicker();
  setupVisibilityPause();
}

// Expose triggerGlitch for manual use (e.g. on error)
export { triggerGlitch };
