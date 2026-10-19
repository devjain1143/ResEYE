import React, { useState } from 'react';
import { api } from '../api';
import Mark from '../marks/Mark';

// Section 9.4: Student subject file - NOT a card
// Torn paper strip behind name, ledger rows with dotted leaders, CPI with glow
// Admin: redaction peel for registration data

function getTornClass(id) {
  // Pick torn variant based on hash of scholar number
  const hash = (id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const variants = ['torn', 'torn-v2', 'torn-v3', 'torn-v4'];
  return variants[hash % variants.length];
}

export default function StudentCard({ student, isAdmin = false, onTrackUpdated, onPinUpdated }) {
  const [showReg, setShowReg] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [trackMsg, setTrackMsg] = useState('');
  const [peeling, setPeeling] = useState(false);
  const [pinned, setPinned] = useState(Boolean(student.isPinned));
  const [pinLoading, setPinLoading] = useState(false);
  const [pinMsg, setPinMsg] = useState('');

  if (!student) return null;

  const handleTogglePin = async () => {
    setPinLoading(true);
    setPinMsg('');
    try {
      if (pinned) {
        await api(`/favorites/${encodeURIComponent(student.scholarNo)}`, { method: 'DELETE' });
        setPinned(false);
        setPinMsg('EJECTED FROM CH 02');
        if (onPinUpdated) onPinUpdated(student.scholarNo, false);
      } else {
        await api('/favorites', {
          method: 'POST',
          body: { scholarNo: student.scholarNo }
        });
        setPinned(true);
        setPinMsg('RETAINED IN CH 02');
        if (onPinUpdated) onPinUpdated(student.scholarNo, true);
      }
    } catch (err) {
      setPinMsg(`FAULT: ${err.message}`);
    } finally {
      setPinLoading(false);
    }
  };

  const handleTrackScholar = async () => {
    setTracking(true);
    setTrackMsg('');
    try {
      await api('/admin/special', {
        method: 'POST',
        body: { scholarNo: student.scholarNo, note: 'Tracked from student card' }
      });
      setTrackMsg('[ TRACKING ACTIVE ]');
      if (onTrackUpdated) onTrackUpdated();
    } catch (err) {
      setTrackMsg(`FAULT: ${err.message}`);
    } finally {
      setTracking(false);
    }
  };

  const handleRevealReg = () => {
    if (!showReg) {
      setPeeling(true);
      setTimeout(() => {
        setShowReg(true);
        setPeeling(false);
      }, 400);
    } else {
      setShowReg(false);
    }
  };

  const parseFailedSubjects = (res) => {
    if (!res || typeof res !== 'string') return [];
    const clean = res.replace(/\r?\n|\r/g, ' ').trim();
    const match = clean.match(/Fail\s+in\s*\((.*?)\)/i);
    if (match && match[1]) {
      return match[1].split(',').map(s => s.trim()).filter(Boolean);
    }
    if (clean.toUpperCase().includes('FAIL')) {
      return [clean];
    }
    return [];
  };

  const getStatusLabel = (res, failedSubjects = []) => {
    const r = (res || '').toUpperCase();
    if (r.includes('PASS')) return '[ PASS ]';
    if (r.includes('FAIL')) {
      const fails = failedSubjects.length > 0 ? failedSubjects : parseFailedSubjects(res);
      if (fails.length === 1) return `[ FAIL: ${fails[0]} ]`;
      if (fails.length > 1) return `[ FAIL: ${fails.length} SUBJECTS ]`;
      return '[ FAIL ]';
    }
    if (r.includes('WH') || r.includes('WITHHELD')) return '[ WH / WITHHELD ]';
    return 'NO SIGNAL';
  };

  const getStatusStyle = (res) => {
    const r = (res || '').toUpperCase();
    if (r.includes('FAIL') || r.includes('WH') || r.includes('WITHHELD')) {
      return { background: '#fff', color: '#000', padding: '0 4px', fontWeight: 'bold' };
    }
    if (r.includes('PASS')) return { color: 'var(--bone-80)' };
    return { color: 'var(--bone-35)' };
  };

  return (
    <div className="my-6 relative">
      {/* Stick figure mark */}
      <div className="absolute -left-2 -top-1" style={{ opacity: 0.6 }}>
        <Mark name="figure" />
      </div>

      {/* Torn paper strip behind name */}
      <div
        className={getTornClass(student.scholarNo)}
        style={{
          padding: '16px 24px 12px 40px',
          transform: 'rotate(-1deg)',
          marginBottom: '-8px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div className="font-terminal text-xs tracking-widest" style={{ color: 'var(--bone-35)' }}>
          SUBJECT FILE // {student.scholarNo}
        </div>
      </div>

      {/* Main content - directly on black */}
      <div className="pl-10 pr-4 py-4" style={{ position: 'relative', zIndex: 2 }}>
        {/* Name with glitch */}
        <h2
          className="glitch font-terminal font-bold tracking-wider mb-1"
          data-text={student.name}
          style={{ fontSize: '48px', lineHeight: 1.1 }}
        >
          {student.name}
        </h2>

        {/* Scholar number */}
        <div className="font-terminal text-sm tracking-wider mb-4" style={{ color: 'var(--bone-60)' }}>
          SCHOLAR NO: {student.scholarNo}
          <span className="ml-4">{student.degree || 'B.Tech'} // {student.branch || 'N/A'}</span>
        </div>

        {/* CPI with glow */}
        <div className="mb-6">
          <div className="font-terminal text-xs tracking-widest" style={{ color: 'var(--bone-35)' }}>
            CUMULATIVE PERFORMANCE INDEX
          </div>
          <div className="font-terminal font-bold cpi-glow" style={{ fontSize: '82px', lineHeight: 1 }}>
            {student.cpi !== null && student.cpi !== undefined ? Number(student.cpi).toFixed(2) : 'N/A'}
          </div>
        </div>

        {/* Operator Actions Bar */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleTogglePin}
            disabled={pinLoading}
            className={`font-mono text-xs px-3 py-1.5 border transition-all ${
              pinned
                ? 'border-white bg-white text-black font-bold'
                : 'border-white/40 hover:border-white text-white hover:bg-white/10'
            }`}
          >
            {pinLoading
              ? '[ TRANSMITTING... ]'
              : pinned
              ? '[ * PINNED IN CH 02 ]'
              : '[ + PIN TAPE TO CH 02 ]'}
          </button>

          {isAdmin && (
            <button
              onClick={handleTrackScholar}
              disabled={tracking}
              className="btn-secondary text-xs"
            >
              {tracking ? 'TRANSMITTING...' : '> TRACK THIS SUBJECT'}
            </button>
          )}

          {pinMsg && (
            <span className="font-typewriter text-xs text-white/70">
              // {pinMsg}
            </span>
          )}
          {trackMsg && (
            <span className="font-typewriter text-xs text-white/70">
              // {trackMsg}
            </span>
          )}
        </div>

        {/* Zigzag divider */}
        <div className="my-4" style={{ opacity: 0.3 }}>
          <Mark name="zigzag" />
        </div>

        {/* Semester performance ledger - section 9.4 */}
        <div className="font-terminal text-xs tracking-widest mb-3" style={{ color: 'var(--bone-35)' }} data-corruptible>
          SEMESTER PERFORMANCE LEDGER
        </div>

        <div className="space-y-1">
          {Array.from({ length: 8 }, (_, idx) => {
            const semNum = idx + 1;
            const semData = student.semesters?.find((s) => s.sem === semNum);
            const spi = semData && semData.spi !== null && semData.spi !== undefined
              ? Number(semData.spi).toFixed(2)
              : '--';
            const failedSubjects = semData ? (semData.failedSubjects || parseFailedSubjects(semData.result)) : [];
            const status = semData ? getStatusLabel(semData.result, failedSubjects) : 'NO SIGNAL';
            const statusStyle = semData ? getStatusStyle(semData.result) : { color: 'var(--bone-35)' };

            return (
              <div key={semNum} className="py-0.5">
                <div className="ledger-row font-typewriter" style={{ fontSize: '18px' }}>
                  <span className="font-terminal" style={{ width: '60px', display: 'inline-block', flexShrink: 0 }}>
                    SEM {semNum}
                  </span>
                  <span className="leader" />
                  <span className="font-terminal" style={{ width: '50px', textAlign: 'right', display: 'inline-block', flexShrink: 0 }}>
                    {spi}
                  </span>
                  <span style={{ width: '16px', display: 'inline-block', flexShrink: 0 }} />
                  <span style={statusStyle} className="text-right">{status}</span>
                </div>
                {failedSubjects.length > 0 && (
                  <div className="mt-1 ml-4 pl-3 py-1 bg-white/5 border-l-2 border-white font-mono text-xs flex flex-wrap items-center gap-1.5">
                    <span className="text-white/50 tracking-wider font-bold">FAILED CODES:</span>
                    {failedSubjects.map((sub, sIdx) => (
                      <span
                        key={sIdx}
                        className="bg-white text-black px-1.5 py-0.2 font-bold tracking-wide"
                      >
                        {sub}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Admin registration redaction block */}
        {isAdmin && student.registration && (
          <div className="mt-6">
            <div className="relative">
              {/* Redaction bar */}
              {!showReg && (
                <div
                  className="cursor-pointer group"
                  onClick={handleRevealReg}
                >
                  <div
                    className="font-terminal text-sm tracking-widest py-3 px-4 text-center"
                    style={{
                      background: peeling ? 'transparent' : '#fff',
                      color: peeling ? 'var(--bone-60)' : '#000',
                      transition: 'transform 400ms ease-out',
                      transform: peeling ? 'scaleX(0)' : 'scaleX(1)',
                      transformOrigin: 'right',
                    }}
                  >
                    ADMIN CLEARANCE ONLY -- CLICK TO REVEAL
                  </div>
                </div>
              )}

              {/* Revealed registration data */}
              {showReg && (
                <div className="font-typewriter text-sm space-y-2 mt-2 pl-4" style={{ borderLeft: '2px solid var(--bone-35)' }}>
                  <button
                    onClick={() => setShowReg(false)}
                    className="font-terminal text-xs tracking-wider mb-2 block"
                    style={{ color: 'var(--bone-35)' }}
                  >
                    [-] CONCEAL REGISTRATION INTELLIGENCE
                  </button>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <span style={{ color: 'var(--bone-35)' }}>GUARDIAN: </span>
                      <span>{student.registration.guardian || 'N/A'}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--bone-35)' }}>CATEGORY: </span>
                      <span>{student.registration.category || 'N/A'}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--bone-35)' }}>PHONE(S): </span>
                      <span>{student.registration.phones?.join(', ') || 'N/A'}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--bone-35)' }}>EMAIL(S): </span>
                      <span>{student.registration.emails?.join(', ') || 'N/A'}</span>
                    </div>
                  </div>

                  {student.registration.addresses && student.registration.addresses.length > 0 && (
                    <div className="mt-3 pt-2" style={{ borderTop: '1px solid var(--bone-15)' }}>
                      <div className="font-terminal text-xs tracking-wider mb-1" style={{ color: 'var(--bone-35)' }}>
                        RECORDED RESIDENTIAL ADDRESSES:
                      </div>
                      <ul className="space-y-1 list-none pl-0">
                        {student.registration.addresses.map((addr, aIdx) => (
                          <li key={aIdx} className="pl-2" style={{ borderLeft: '2px solid var(--bone-15)' }}>
                            {addr.text}
                            {addr.semesters && addr.semesters.length > 0 && (
                              <span className="text-xs ml-2" style={{ color: 'var(--bone-35)' }}>
                                [Sem: {addr.semesters.join(', ')}]
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
