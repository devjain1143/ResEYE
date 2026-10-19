import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import StudentCard from '../components/StudentCard';
import Mark from '../marks/Mark';

export default function PinnedTapes({ user }) {
  const [pinnedList, setPinnedList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchFilter, setSearchFilter] = useState('');

  const fetchPinned = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api('/favorites');
      if (res && res.success && res.data) {
        setPinnedList(res.data);
      }
    } catch (err) {
      setError(err.message || 'FAULT: FAILED TO RETRIEVE PINNED TAPES FROM VAULT.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPinned();
  }, []);

  const handleUnpin = async (scholarNo) => {
    try {
      await api(`/favorites/${encodeURIComponent(scholarNo)}`, { method: 'DELETE' });
      setPinnedList(prev => prev.filter(s => s.scholarNo !== scholarNo));
    } catch (err) {
      alert(`FAULT: ${err.message || 'COULD NOT UNPIN TAPE.'}`);
    }
  };

  const filtered = pinnedList.filter(s => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.trim().toUpperCase();
    return (s.scholarNo && s.scholarNo.toUpperCase().includes(q)) ||
           (s.name && s.name.toUpperCase().includes(q)) ||
           (s.branch && s.branch.toUpperCase().includes(q));
  });

  return (
    <div className="space-y-6">
      {/* Channel Header Banner */}
      <div className="border-b border-white/20 pb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3 mb-1">
            <Mark name="spiral" size={24} />
            <h1 className="text-2xl font-bold tracking-widest text-white">
              [ CH 02: PINNED TAPES // OPERATOR VAULT ]
            </h1>
          </div>
          <p className="text-xs text-white/50 tracking-wider">
            DIRECT ARCHIVAL REPLAY // ZERO QUERY PENALTY // STORED ON ACCOUNT
          </p>
        </div>

        <div className="flex items-center space-x-3 text-xs font-mono">
          <div className="border border-white/30 px-3 py-1 bg-white/5">
            <span className="text-white/50">VAULT REEL: </span>
            <span className="text-white font-bold">{pinnedList.length} RETAINED</span>
          </div>
          <button
            onClick={fetchPinned}
            className="border border-white/40 px-3 py-1 hover:bg-white hover:text-black transition-colors"
          >
            [ REFRESH DECK ]
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      {pinnedList.length > 0 && (
        <div className="flex items-center space-x-3 border-b border-white/10 pb-3">
          <label className="text-xs text-white/50 font-mono tracking-wider">FILTER REEL:</label>
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="FILTER BY SCHOLAR NO, NAME, BRANCH..."
            className="input-underline max-w-md text-sm"
          />
          {searchFilter && (
            <button
              onClick={() => setSearchFilter('')}
              className="text-xs font-mono text-white/60 hover:text-white"
            >
              [ CLEAR ]
            </button>
          )}
          <span className="text-xs text-white/40 ml-auto font-mono">
            SHOWING {filtered.length} OF {pinnedList.length}
          </span>
        </div>
      )}

      {/* Loading & Error States */}
      {loading && (
        <div className="py-16 text-center text-white/60 space-y-2">
          <div className="text-lg tracking-widest animate-pulse">[ READING OPERATOR VAULT TELEMETRY... ]</div>
          <div className="text-xs text-white/40 font-mono">RETRIEVING PINNED DOSSIERS FROM MAGNETIC ARCHIVE</div>
        </div>
      )}

      {error && (
        <div className="p-4 border border-white bg-white/10 text-white font-mono text-sm">
          {error}
        </div>
      )}

      {/* Empty State with Visual Tutorial */}
      {!loading && !error && pinnedList.length === 0 && (
        <div className="border-2 border-white/30 bg-black p-6 sm:p-10 space-y-8 relative overflow-hidden font-terminal">
          {/* Scanline subtle layer */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-15"
            style={{
              backgroundImage: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.4) 50%)',
              backgroundSize: '100% 3px',
            }}
          />

          {/* Heading */}
          <div className="text-center space-y-2 relative z-10">
            <div className="inline-block bg-white text-black font-bold text-xs px-2.5 py-0.5 tracking-widest uppercase">
              CH 02 // SURVEILLANCE PROTOCOL
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-widest glitch text-white" data-text="[ OPERATOR VAULT IS CURRENTLY EMPTY ]">
              [ OPERATOR VAULT IS CURRENTLY EMPTY ]
            </h2>
            <p className="font-typewriter text-xs sm:text-sm text-white/70 max-w-xl mx-auto leading-relaxed">
              No academic tapes are currently locked to your monitored shelf. Follow the operational protocol below to bookmark dossiers for instant access.
            </p>
          </div>

          {/* 3-Step Tutorial Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative z-10">
            {/* Step 1 */}
            <div className="border border-white/20 bg-white/5 p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-mono text-white/50 border-b border-white/10 pb-2">
                  <span>PHASE 01</span>
                  <span>QUERY ARCHIVE</span>
                </div>
                <div className="text-sm font-bold text-white tracking-wider">
                  1. RETRIEVE A DOSSIER
                </div>
                <p className="text-xs text-white/75 font-mono leading-relaxed">
                  Navigate to <strong className="text-white">CH 01 DOSSIERS</strong>. Search across batches using any student Name or Scholar Number (e.g. <span className="underline">24U010001</span>).
                </p>
              </div>
              <Link
                to="/search"
                className="btn-secondary text-xs text-center tracking-wider py-1.5"
              >
                OPEN CH 01 SEARCH &gt;&gt;
              </Link>
            </div>

            {/* Step 2 */}
            <div className="border border-white/20 bg-white/5 p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-mono text-white/50 border-b border-white/10 pb-2">
                  <span>PHASE 02</span>
                  <span>LOCATE TRIGGER</span>
                </div>
                <div className="text-sm font-bold text-white tracking-wider">
                  2. CLICK [+ PIN TAPE]
                </div>
                <p className="text-xs text-white/75 font-mono leading-relaxed">
                  On the retrieved academic scorecard, look at the action bar in the top-right corner and click the retention button:
                </p>
                <div className="py-2 text-center">
                  <span className="inline-block border border-white/60 bg-white/10 text-white text-xs px-3 py-1 font-mono tracking-widest select-none">
                    [ + PIN TAPE ]
                  </span>
                </div>
              </div>
              <div className="text-[11px] text-white/40 font-mono text-center">
                BUTTON LABELS SHIFT TO [ ★ PINNED ]
              </div>
            </div>

            {/* Step 3 */}
            <div className="border border-white/20 bg-white/5 p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-mono text-white/50 border-b border-white/10 pb-2">
                  <span>PHASE 03</span>
                  <span>ZERO-LATENCY ACCESS</span>
                </div>
                <div className="text-sm font-bold text-white tracking-wider">
                  3. PERSISTENT REPLAY
                </div>
                <p className="text-xs text-white/75 font-mono leading-relaxed">
                  Pinned records are saved permanently to your account across devices. Inspect SPI progressions and academic standing without quota limits.
                </p>
              </div>
              <div className="border border-white/20 bg-black/60 p-2 text-center text-xs font-mono text-white/60">
                UNPIN OR ROTATE ANYTIME
              </div>
            </div>
          </div>

          {/* Action Footer Callout */}
          <div className="border border-white/20 bg-black/70 p-4 flex flex-wrap items-center justify-between gap-4 relative z-10">
            <div className="flex items-center space-x-3 text-xs font-mono text-white/70">
              <span className="text-amber-400 font-bold text-sm">⚡</span>
              <span>
                PRO-TIP: Use the pinned tapes channel to monitor special watchlist scholars or high-priority cohorts.
              </span>
            </div>
            <Link
              to="/search"
              className="btn-primary text-xs glitch px-4 py-2"
              data-text="LAUNCH CH 01 DOSSIERS >>"
            >
              LAUNCH CH 01 DOSSIERS &gt;&gt;
            </Link>
          </div>
        </div>
      )}

      {/* No Filter Results */}
      {!loading && pinnedList.length > 0 && filtered.length === 0 && (
        <div className="border border-white/20 p-8 text-center text-white/50 font-mono text-sm">
          NO PINNED DOSSIERS MATCH PATTERN "{searchFilter}".
        </div>
      )}

      {/* Cards List */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-8">
          {filtered.map((student) => (
            <div key={student.scholarNo} className="relative group border-b border-white/10 pb-8">
              {/* Unpin quick bar */}
              <div className="flex items-center justify-between text-xs font-mono mb-2 px-2 text-white/50">
                <div className="flex items-center space-x-2">
                  <span className="inline-block h-1.5 w-1.5 bg-white" />
                  <span>PINNED TAPE RECORD</span>
                  {student.pinnedAt && (
                    <span className="text-white/40">// {new Date(student.pinnedAt).toLocaleString()} IST</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleUnpin(student.scholarNo)}
                  className="border border-white/30 px-2 py-0.5 hover:bg-white hover:text-black transition-colors"
                >
                  [ X EJECT FROM VAULT ]
                </button>
              </div>

              {/* Student Card rendering */}
              <StudentCard
                student={student}
                isAdmin={user?.role === 'ADMIN'}
                onPinUpdated={(scholarNo, isPinned) => {
                  if (!isPinned) {
                    setPinnedList(prev => prev.filter(s => s.scholarNo !== scholarNo));
                  }
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
