import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';

export default function AiHistory() {
  const [data, setData] = useState({ results: [], total: 0, page: 1, totalPages: 1 });
  const [range, setRange] = useState('all');
  const [rating, setRating] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchHistory = async (p = 1, r = range, rt = rating) => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams();
      q.set('page', p);
      q.set('range', r);
      if (rt) q.set('rating', rt);

      const res = await api(`/admin/ai-history?${q.toString()}`);
      if (res.success && res.data) {
        setData(res.data);
        setPage(p);
      }
    } catch (err) {
      setError(err.message || 'FAILED TO RETRIEVE GLOBAL AI INTEL LOGS');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory(1, range, rating);
  }, [range, rating]);

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="border border-white/20 p-4 bg-black">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-3 mb-4">
          <div>
            <h2 className="text-xl font-bold tracking-widest">[ NLQ INTELLIGENCE LOG ]</h2>
            <p className="text-xs text-white/50 tracking-wider">
              NATURAL LANGUAGE QUERIES, INTENT PARSING, AND GROUND TRUTH TELEMETRY
            </p>
          </div>
          <div className="flex items-center space-x-3 text-xs">
            <span className="text-white/60">
              TOTAL RECORDED: <strong className="text-white">{data.total || 0}</strong>
            </span>
            <Link
              to="/admin/feedback"
              className="border border-white/40 px-3 py-1 bg-white text-black font-bold hover:bg-white/80"
            >
              [ TRIAGE GROUND TRUTH ]
            </Link>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center space-x-2">
            <span className="text-white/50">TIME:</span>
            {['today', 'week', 'month', 'all'].map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1 border uppercase transition-colors ${
                  range === r
                    ? 'bg-white text-black font-bold border-white'
                    : 'border-white/20 text-white/70 hover:border-white/50'
                }`}
              >
                [{r}]
              </button>
            ))}
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-white/50">EVALUATION:</span>
            {[
              { val: '', label: 'ALL' },
              { val: 'unrated', label: 'UNRATED' },
              { val: 'good', label: 'ACCURATE [GOOD]' },
              { val: 'bad', label: 'DEFECTIVE [BAD]' },
            ].map((rt) => (
              <button
                key={rt.val}
                onClick={() => setRating(rt.val)}
                className={`px-2.5 py-1 border transition-colors ${
                  rating === rt.val
                    ? 'bg-white text-black font-bold border-white'
                    : 'border-white/20 text-white/60 hover:border-white/40'
                }`}
              >
                [{rt.label}]
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="border border-white/40 p-3 bg-black text-xs text-white">
          [ ERR ] {error}
        </div>
      )}

      {/* Query Entries */}
      {loading ? (
        <div className="py-12 text-center text-white/40 animate-pulse text-sm">
          -- SCANNING INTEL TELEMETRY TAPES... --
        </div>
      ) : data.results.length === 0 ? (
        <div className="border border-white/20 p-8 text-center text-white/40 text-xs">
          [ NO NATURAL LANGUAGE QUERY TELEMETRY FOUND ]
        </div>
      ) : (
        <div className="space-y-3">
          {data.results.map((row) => (
            <div
              key={row.id}
              className="border border-white/20 p-4 bg-black/60 hover:border-white/40 transition-colors clip-torn"
            >
              <div className="flex flex-wrap items-center justify-between text-xs text-white/40 border-b border-white/10 pb-2 mb-2 font-mono">
                <div className="space-x-3">
                  <span className="text-white/80 font-bold">RECORD #{row.id}</span>
                  <span>INTENT: [{row.intent || 'UNKNOWN'}]</span>
                  {row.batch && <span>BATCH: {row.batch}</span>}
                  {row.semester && <span>SEM: {row.semester}</span>}
                </div>
                <div className="flex items-center space-x-3">
                  <span
                    className={`px-1.5 py-0.5 border text-[12px] ${
                      row.rating === 'good'
                        ? 'border-white bg-white text-black font-bold'
                        : row.rating === 'bad'
                        ? 'border-white bg-white/20 text-white'
                        : 'border-white/20 text-white/40'
                    }`}
                  >
                    [{row.rating ? row.rating.toUpperCase() : 'UNRATED'}]
                  </span>
                  <span>
                    {row.timestamp ? new Date(row.timestamp).toISOString().replace('T', ' ').substring(0, 19) : '--'}
                  </span>
                </div>
              </div>

              <div className="text-sm font-bold text-white mb-2 font-mono">
                &gt; {row.query}
              </div>

              <div className="text-xs text-white/70 font-serif bg-white/5 p-3 border-l-2 border-white/30 whitespace-pre-wrap">
                {row.response || '[ NULL TELEMETRY ]'}
              </div>

              <div className="mt-2 text-[13px] text-white/40 font-mono">
                OPERATOR: {row.web_user_id || row.user_id || 'ANONYMOUS'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {data.totalPages > 1 && (
        <div className="flex justify-between items-center border border-white/20 p-3 bg-black text-xs">
          <button
            disabled={page <= 1}
            onClick={() => fetchHistory(page - 1, range, rating)}
            className="border border-white/30 px-3 py-1 hover:border-white disabled:opacity-20"
          >
            &lt; PREV
          </button>
          <span className="text-white/60">
            PAGE {page} OF {data.totalPages}
          </span>
          <button
            disabled={page >= data.totalPages}
            onClick={() => fetchHistory(page + 1, range, rating)}
            className="border border-white/30 px-3 py-1 hover:border-white disabled:opacity-20"
          >
            NEXT &gt;
          </button>
        </div>
      )}
    </div>
  );
}
