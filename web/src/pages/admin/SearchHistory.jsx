import React, { useState, useEffect } from 'react';
import { api } from '../../api';

export default function SearchHistory() {
  const [data, setData] = useState({ results: [], total: 0, page: 1, totalPages: 1 });
  const [range, setRange] = useState('all');
  const [userId, setUserId] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchHistory = async (p = 1, r = range, u = userId) => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams();
      q.set('page', p);
      q.set('range', r);
      if (u) q.set('userId', u.trim());

      const res = await api(`/admin/history?${q.toString()}`);
      if (res.success && res.data) {
        setData(res.data);
        setPage(p);
      }
    } catch (err) {
      setError(err.message || 'FAILED TO RETRIEVE GLOBAL SEARCH LEDGER');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory(1, range, userId);
  }, [range]);

  const handleFilterSubmit = (e) => {
    e.preventDefault();
    fetchHistory(1, range, userId);
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="border border-white/20 p-4 bg-black">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-3 mb-4">
          <div>
            <h2 className="text-xl font-bold tracking-widest">[ GLOBAL SEARCH CHRONICLE ]</h2>
            <p className="text-xs text-white/50 tracking-wider">
              ALL SCHOLAR RECORD INQUIRIES ACROSS THE FACILITY
            </p>
          </div>
          <div className="text-xs text-white/60">
            TOTAL INQUIRIES: <strong className="text-white">{data.total || 0}</strong>
          </div>
        </div>

        <form onSubmit={handleFilterSubmit} className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center space-x-2">
            <span className="text-white/50">TIME HORIZON:</span>
            {['today', 'week', 'month', 'all'].map((r) => (
              <button
                type="button"
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
            <span className="text-white/50">OPERATOR ID:</span>
            <input
              type="text"
              placeholder="FILTER BY USER ID..."
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="bg-black border border-white/30 px-3 py-1 text-xs text-white font-mono focus:outline-none focus:border-white"
            />
            <button
              type="submit"
              className="border border-white/40 px-3 py-1 hover:bg-white hover:text-black font-bold"
            >
              [ APPLY ]
            </button>
          </div>
        </form>
      </div>

      {error && (
        <div className="border border-white/40 p-3 bg-black text-xs text-white">
          [ ERR ] {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="py-12 text-center text-white/40 animate-pulse text-sm">
          -- SCANNING FACILITY SEARCH LOGS... --
        </div>
      ) : data.results.length === 0 ? (
        <div className="border border-white/20 p-8 text-center text-white/40 text-xs">
          [ NO INQUIRY RECORDS FOUND ]
        </div>
      ) : (
        <div className="border border-white/30 overflow-x-auto bg-black">
          <table className="w-full text-left text-xs font-mono border-collapse">
            <thead>
              <tr className="border-b border-white/20 bg-white/5 text-white/60">
                <th className="p-3">TIMESTAMP</th>
                <th className="p-3">SCHOLAR NUMBER</th>
                <th className="p-3">STUDENT NAME</th>
                <th className="p-3">OPERATOR / USER ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {data.results.map((row) => (
                <tr key={row.id} className="hover:bg-white/5 transition-colors">
                  <td className="p-3 text-white/50 whitespace-nowrap">
                    {row.timestamp ? new Date(row.timestamp).toISOString().replace('T', ' ').substring(0, 19) : '--'}
                  </td>
                  <td className="p-3 font-bold text-white tracking-widest">
                    {row.scholar_no}
                  </td>
                  <td className="p-3 text-white/90 font-serif">
                    {row.student_name || '--'}
                  </td>
                  <td className="p-3 text-white/50">
                    {row.web_user_id || row.user_id || 'ANONYMOUS'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {data.totalPages > 1 && (
        <div className="flex justify-between items-center border border-white/20 p-3 bg-black text-xs">
          <button
            disabled={page <= 1}
            onClick={() => fetchHistory(page - 1, range, userId)}
            className="border border-white/30 px-3 py-1 hover:border-white disabled:opacity-20"
          >
            &lt; PREV
          </button>
          <span className="text-white/60">
            PAGE {page} OF {data.totalPages}
          </span>
          <button
            disabled={page >= data.totalPages}
            onClick={() => fetchHistory(page + 1, range, userId)}
            className="border border-white/30 px-3 py-1 hover:border-white disabled:opacity-20"
          >
            NEXT &gt;
          </button>
        </div>
      )}
    </div>
  );
}
