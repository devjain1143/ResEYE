import React, { useState, useEffect } from 'react';
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

      {/* Empty State */}
      {!loading && !error && pinnedList.length === 0 && (
        <div className="border border-white/20 p-12 text-center space-y-4 bg-black">
          <div className="flex justify-center opacity-40">
            <Mark name="bison" size={48} />
          </div>
          <div className="text-xl tracking-widest font-bold">
            [ OPERATOR VAULT IS CURRENTLY EMPTY ]
          </div>
          <p className="font-typewriter text-sm text-white/60 max-w-md mx-auto">
            YOU HAVE NOT MARKED ANY DOSSIERS FOR RETENTION. GO TO <strong>CH 01 DOSSIERS</strong>, SEARCH ANY SCHOLAR, AND CLICK <strong>[ + PIN TAPE ]</strong> TO SAVE THEIR COMPLETE TELEMETRY HERE FOR INSTANT ACCESS.
          </p>
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
