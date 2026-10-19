import React, { useState, useEffect } from 'react';
import { api } from '../api';

export default function History() {
  const [activeTab, setActiveTab] = useState('search'); // 'search' | 'ai'
  const [data, setData] = useState({ results: [], total: 0, page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

  const fetchHistory = async (targetTab = activeTab, targetPage = 1) => {
    setLoading(true);
    setError('');
    try {
      const res = await api(`/me/history?type=${targetTab}&page=${targetPage}`);
      if (res.success && res.data) {
        setData(res.data);
        setPage(targetPage);
      }
    } catch (err) {
      setError(err.message || 'FAILED TO RETRIEVE ACCESS ARCHIVE LOGS');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory(activeTab, 1);
  }, [activeTab]);

  const formatDate = (iso) => {
    if (!iso) return '--';
    const d = new Date(iso);
    return d.toISOString().replace('T', ' ').substring(0, 19);
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Type Tabs */}
      <div className="border-b border-white/20 pb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-widest">[ USER ACCESS CHRONICLE ]</h1>
          <p className="text-xs text-white/50 tracking-wider">
            PERSONAL AUDIT TRAILS AND SEARCH LEDGER
          </p>
        </div>

        <div className="flex border border-white/30 text-xs">
          <button
            onClick={() => setActiveTab('search')}
            className={`px-4 py-1.5 transition-colors ${
              activeTab === 'search'
                ? 'bg-white text-black font-bold'
                : 'hover:bg-white/10 text-white/70'
            }`}
          >
            [ SCHOLAR SEARCH LOG ]
          </button>
          <button
            onClick={() => setActiveTab('ai')}
            className={`px-4 py-1.5 transition-colors border-l border-white/30 ${
              activeTab === 'ai'
                ? 'bg-white text-black font-bold'
                : 'hover:bg-white/10 text-white/70'
            }`}
          >
            [ AI INTEL CHAT LOG ]
          </button>
        </div>
      </div>

      {error && (
        <div className="border border-white/40 p-3 bg-black text-xs text-white/90">
          [ ERR ] {error}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-white/40 animate-pulse text-sm">
          -- SCANNING CHRONICLE TAPES... --
        </div>
      ) : activeTab === 'search' ? (
        /* SCHOLAR SEARCH LOG TABLE */
        <div>
          <div className="text-xs text-white/50 mb-2 tracking-widest">
            LOGGED DISK RECORDS: {data.total || 0} TOTAL
          </div>

          {!data.results || data.results.length === 0 ? (
            <div className="border border-white/20 p-8 text-center text-white/40 text-xs">
              [ NO SEARCH ENTRIES RECORDED FOR THIS OPERATOR ]
            </div>
          ) : (
            <div className="border border-white/30 overflow-x-auto bg-black">
              <table className="w-full text-left text-xs font-mono border-collapse">
                <thead>
                  <tr className="border-b border-white/20 bg-white/5 text-white/60">
                    <th className="p-3">TIMESTAMP</th>
                    <th className="p-3">SCHOLAR NO</th>
                    <th className="p-3">TARGET IDENTITY</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {data.results.map((row) => (
                    <tr key={row.id} className="hover:bg-white/5 transition-colors">
                      <td className="p-3 text-white/50 whitespace-nowrap">
                        {formatDate(row.timestamp)}
                      </td>
                      <td className="p-3 font-bold tracking-wider">
                        {row.scholar_no}
                      </td>
                      <td className="p-3 text-white/90 font-serif">
                        {row.student_name || '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* AI QUERY HISTORY TABLE */
        <div>
          <div className="text-xs text-white/50 mb-2 tracking-widest">
            LOGGED INTELLIGENCE QUERIES: {data.total || 0} TOTAL
          </div>

          {!data.results || data.results.length === 0 ? (
            <div className="border border-white/20 p-8 text-center text-white/40 text-xs">
              [ NO NATURAL LANGUAGE QUERIES RECORDED ]
            </div>
          ) : (
            <div className="space-y-3">
              {data.results.map((row) => (
                <div
                  key={row.id}
                  className="border border-white/20 p-4 bg-black/60 hover:border-white/40 transition-colors"
                >
                  <div className="flex flex-wrap items-center justify-between text-xs text-white/40 border-b border-white/10 pb-2 mb-2">
                    <span>RECORD ID: #{row.id}</span>
                    <span>{formatDate(row.timestamp)}</span>
                    <span>INTENT: [{row.intent || 'UNCLASSIFIED'}]</span>
                  </div>
                  <div className="text-sm font-bold text-white mb-2 tracking-wide">
                    &gt; {row.query}
                  </div>
                  <div className="text-xs text-white/70 font-serif bg-white/5 p-3 border-l-2 border-white/30 whitespace-pre-wrap">
                    {row.response || '[ NO STORED TELEMETRY PAYLOAD ]'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pagination Controls */}
      {data.totalPages > 1 && (
        <div className="flex justify-between items-center border border-white/20 p-3 bg-black text-xs">
          <button
            disabled={page <= 1}
            onClick={() => fetchHistory(activeTab, page - 1)}
            className="border border-white/30 px-3 py-1 hover:border-white disabled:opacity-20"
          >
            &lt; PREV
          </button>
          <span className="text-white/60">
            PAGE {page} OF {data.totalPages}
          </span>
          <button
            disabled={page >= data.totalPages}
            onClick={() => fetchHistory(activeTab, page + 1)}
            className="border border-white/30 px-3 py-1 hover:border-white disabled:opacity-20"
          >
            NEXT &gt;
          </button>
        </div>
      )}
    </div>
  );
}
