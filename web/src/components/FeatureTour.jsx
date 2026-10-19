import React, { useState, useEffect, useCallback } from 'react';
import GlitchEye from './GlitchEye';

const TOUR_STEPS_BASE = [
  {
    channel: 'CH 01',
    badge: 'DOSSIER ARCHIVE & RECORD RETRIEVAL',
    title: 'ACADEMIC DOSSIER RETRIEVAL',
    tagline: 'Instant historical grades, SPI progressions, and student telemetry.',
    summary:
      'Search across all institutional student batches using either full Name or Scholar Number (e.g., 24U010001, 211112001).',
    bullets: [
      'Semester-by-Semester SPI: Complete breakdown across Semesters 1 through 8.',
      'Performance Indicators: Visual PASS, FAIL, and WITHHELD badges with detailed backlog subject lists.',
      'Telemetry Filters: Slice dossiers by Degree, Branch, Batch, CPI threshold, and academic standing.',
      'Registration Intelligence: Authorized guardian and contact directory intelligence.'
    ],
    hint: 'PRO-TIP: Entering an exact scholar number pulls up the primary surveillance scorecard automatically.'
  },
  {
    channel: 'TRANSMIT >>',
    badge: 'NATURAL LANGUAGE AI ARCHIVE',
    title: 'AI INTELLIGENCE TERMINAL',
    tagline: 'Query complex academic patterns in plain conversational English.',
    summary:
      'Type questions directly into the TRANSMIT query bar without needing complex database syntax.',
    bullets: [
      'Example Queries: "Who is the top scorer in CSE 2024?", "Pass rate of semester 3 ECE", "Students with CPI > 8.5".',
      'Multi-Provider LLM Router: Automatic failover between Groq, Gemini, NVIDIA NIM, and Mistral.',
      'Zero-Latency Cache: Frequently queried batch statistics are cached for instantaneous return.',
      'Citation Cards: Generated responses include direct references to audited archival records.'
    ],
    hint: 'PRO-TIP: Use the TRANSMIT button or press Enter to broadcast queries to the neural engine.'
  },
  {
    channel: 'CH 02',
    badge: 'PINNED SURVEILLANCE SHELF',
    title: 'PINNED TAPES & PERSISTENT MONITORING',
    tagline: 'Bookmark high-priority dossiers for zero-latency access.',
    summary:
      'Keep critical student files within arm’s reach on your personal surveillance station.',
    bullets: [
      'One-Click Pin: Click the [+ PIN TAPE] button on any dossier scorecard.',
      'CH 02 Channel: View all your bookmarked files in a unified surveillance grid.',
      'Persistent Storage: Pinned records remain securely saved across your authenticated sessions.',
      'Direct Unpinning: Clear or rotate active files anytime from the pinned deck.'
    ],
    hint: 'PRO-TIP: Switch to CH 02 PINNED TAPES in the top navigation bar to inspect your monitored deck.'
  },
  {
    channel: 'OSD TELEMETRY',
    badge: 'CRT BEAM & SCANLINE CALIBRATION',
    title: 'VHS TELEMETRY & DISPLAY CONTROLS',
    tagline: 'Customize analog distortion, tracking noise, and OSD counters.',
    summary:
      'Fine-tune the analog horror aesthetic to suit your monitor and working environment.',
    bullets: [
      'Distortion Switcher: Click the [VHS: NORM] toggle in the header to cycle through NORM, HEAVY, and CLEAN display modes.',
      'Live Telemetry Bar: Real-time Indian Standard Time (IST) timestamp and tape reel counter.',
      'Dynamic TV Eye: Interactive cursor tracking with logarithmic analog horror blinks.',
      'Dark Archive Mode: High-contrast terminal green, bone white, and amber CRT typography.'
    ],
    hint: 'PRO-TIP: Toggle to [VHS: CLEAN] if you prefer a razor-sharp, distortion-free view.'
  },
  {
    channel: 'CLEARANCE',
    badge: 'SECURITY CLEARANCE & ACCESS PROTOCOLS',
    title: 'ACCESS LIMITS & TURNSTILE GATE',
    tagline: 'Guarding institutional archive integrity against automated scraping.',
    summary:
      'Your session operates under secure surveillance clearance gates to protect confidential data.',
    bullets: [
      'Rate Throttling: Standard clearance permits 10 queries per minute sliding window.',
      'Daily AI Quota: Each operator receives a daily allocation of natural language intelligence queries.',
      'Turnstile Gate: Silent background human verification prevents scraping without disruptive puzzles.',
      'Anti-Enumeration: Sequential sweeps trigger automatic security warnings and session safeguards.'
    ],
    hint: 'PRO-TIP: If human verification is requested, the system handshakes automatically in the background.'
  }
];

const ADMIN_STEP = {
  channel: 'CH 03',
  badge: 'ADMINISTRATOR COMMAND CONTROL ROOM',
  title: 'CONTROL ROOM SUITE (ADMIN CLEARANCE)',
  tagline: 'Central surveillance oversight, telemetry logs, and security controls.',
  summary:
    'As an administrator, you possess elevated clearance to monitor the entire ResEYE infrastructure.',
  bullets: [
    'Security Alerts: Real-time triage of batch sweeps, sequential enumerations, and captcha anomalies.',
    'User Management: Authorize pending registrations, promote operators, or purge revoked credentials.',
    'AI Feedback Triage: Step through unrated natural language answers to correct model logic.',
    'System Broadcasts: Post critical announcements and export academic data dumps on demand.'
  ],
  hint: 'PRO-TIP: Access CH 03 CONTROL ROOM from the navigation bar anytime.'
};
export default function FeatureTour({ isOpen, onClose, user }) {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
    }
  }, [isOpen]);

  const steps = React.useMemo(() => {
    if (user?.role === 'ADMIN') {
      return [...TOUR_STEPS_BASE, ADMIN_STEP];
    }
    return TOUR_STEPS_BASE;
  }, [user?.role]);

  const totalSteps = steps.length;
  const step = steps[currentStep] || steps[0];

  const handleNext = useCallback(() => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      onClose();
    }
  }, [currentStep, totalSteps, onClose]);

  const handlePrev = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleNext, handlePrev, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm">
      {/* Outer CRT Monitor Container */}
      <div
        className="w-full max-w-2xl border-2 border-white/50 bg-black text-white font-terminal relative shadow-2xl flex flex-col overflow-hidden"
        style={{
          boxShadow: '0 0 40px rgba(255, 255, 255, 0.15)',
        }}
      >
        {/* CRT Scanline Overlay Effect */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 opacity-20"
          style={{
            backgroundImage:
              'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.4) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.03), rgba(0, 255, 0, 0.01), rgba(0, 0, 255, 0.03))',
            backgroundSize: '100% 3px, 6px 100%',
          }}
        />

        {/* Top Header Bar */}
        <div className="border-b border-white/30 bg-white/5 px-4 py-3 flex flex-wrap items-center justify-between gap-2 select-none relative z-20">
          <div className="flex items-center space-x-2">
            <span className="inline-block h-2.5 w-2.5 bg-red-500 rounded-full animate-ping" />
            <span className="text-xs font-bold tracking-widest text-white/90">
              OPERATOR INDUCTION PROTOCOL // {step.channel}
            </span>
          </div>

          <div className="flex items-center space-x-3 text-xs">
            <span className="tracking-wider text-white/70">
              STEP [ {String(currentStep + 1).padStart(2, '0')} / {String(totalSteps).padStart(2, '0')} ]
            </span>
            <button
              type="button"
              onClick={onClose}
              className="text-white/40 hover:text-white transition-colors"
              title="Close orientation (Esc)"
            >
              [✕]
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="h-1 w-full bg-white/10 relative z-20">
          <div
            className="h-full bg-white transition-all duration-300 ease-out"
            style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
          />
        </div>

        {/* Slide Content */}
        <div className="p-6 sm:p-8 space-y-6 relative z-20 overflow-y-auto max-h-[75vh]">
          {/* Badge & Mini Glitch Eye */}
          <div className="flex items-center justify-between border-b border-white/15 pb-4">
            <div>
              <span className="inline-block bg-white text-black font-bold text-[11px] px-2 py-0.5 tracking-widest uppercase mb-1">
                {step.badge}
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-wider glitch text-white" data-text={step.title}>
                {step.title}
              </h2>
            </div>
            <div className="hidden sm:block shrink-0">
              <GlitchEye size="inline" />
            </div>
          </div>

          {/* Tagline */}
          <p className="font-typewriter text-sm sm:text-base text-white/90 border-l-2 border-white/50 pl-3 italic">
            "{step.tagline}"
          </p>

          {/* Summary */}
          <p className="text-xs sm:text-sm text-white/75 font-mono leading-relaxed">
            {step.summary}
          </p>

          {/* Feature Bullet Points */}
          <div className="bg-white/5 border border-white/15 p-4 rounded-none space-y-2.5">
            <div className="text-[11px] tracking-widest text-white/40 uppercase font-mono">
              [ SPECIFICATION BREAKDOWN ]
            </div>
            <ul className="space-y-2 text-xs sm:text-sm text-white/85 font-mono">
              {step.bullets.map((bullet, i) => {
                const [title, ...rest] = bullet.split(': ');
                return (
                  <li key={i} className="flex items-start space-x-2">
                    <span className="text-white/40 select-none">▶</span>
                    <span>
                      {rest.length > 0 ? (
                        <>
                          <strong className="text-white underline decoration-white/30">{title}</strong>: {rest.join(': ')}
                        </>
                      ) : (
                        bullet
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Hint Footer Box */}
          <div className="border border-white/20 bg-black/60 p-2.5 text-[11px] font-mono text-white/60 flex items-center space-x-2">
            <span className="text-amber-400 font-bold select-none">⚡</span>
            <span>{step.hint}</span>
          </div>
        </div>

        {/* Footer Navigation Bar */}
        <div className="border-t border-white/30 bg-black p-4 flex flex-wrap items-center justify-between gap-3 relative z-20">
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-white/40 hover:text-white transition-colors tracking-widest"
          >
            [ SKIP ORIENTATION ]
          </button>

          {/* Step dots */}
          <div className="hidden sm:flex items-center space-x-1.5">
            {steps.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setCurrentStep(idx)}
                className={`h-2 transition-all ${
                  idx === currentStep ? 'w-6 bg-white' : 'w-2 bg-white/30 hover:bg-white/60'
                }`}
                title={`Go to step ${idx + 1}`}
              />
            ))}
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              disabled={currentStep === 0}
              onClick={handlePrev}
              className="btn-secondary text-xs disabled:opacity-30 disabled:pointer-events-none"
              style={{ padding: '6px 14px' }}
            >
              &lt;&lt; PREV
            </button>

            <button
              type="button"
              onClick={handleNext}
              className="btn-primary text-xs glitch"
              data-text={currentStep === totalSteps - 1 ? 'COMMENCE SURVEILLANCE >>' : 'NEXT >>'}
              style={{ padding: '6px 16px' }}
            >
              {currentStep === totalSteps - 1 ? 'COMMENCE SURVEILLANCE >>' : 'NEXT >>'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
