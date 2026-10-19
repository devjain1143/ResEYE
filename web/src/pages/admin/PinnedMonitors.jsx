import React, { useState, useEffect } from 'react';
import { api } from '../../api';
import Mark from '../../marks/Mark';

export default function PinnedMonitors() {
  const [data, setData] = useState({ results: [], total: 0, page: 1, totalPages: 1, summary: {} });
  const [specialOnly, setSpecialOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

  const fetchRecords = async (targetPage = 1, isSpecial = specialOnly, q = searchQuery) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: targetPage,
        pageSize: 25,
        specialOnly: isSpecial ? 'true' : 'false',
      });
      if (q.trim()) params.append('q', q.trim());

      const res = await api(`/admin/favorites?${params.toString()}`);
      if (res && res.success && res.data) {
        setData(res.data);
        setPage(targetPage);
      }
    } catch (err) {
      setError(err.message || 'FAILED TO RETRIEVE PIN SURVEILLANCE TELEMETRY');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords(1, specialOnly, searchQuery);
  }, [specialOnly]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchRecords(1, specialOnly, searchQuery);
  };

  const formatDate = (iso) => {
    if (!iso) return '--';
    const d = new Date(iso);
    return d.toISOString().replace('T', ' ').substring(0, 19);
  };

  const summary = data.summary || {};

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="border border-white/20 p-4 bg-black">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center space-x-2">
              <Mark name="eye" size={24} />
              <h2 className="text-xl font-bold tracking-widest text-white">
                [ PIN-SURVEILLANCE // HARVEST INTERCEPT MONITOR ]
              </h2>
            </div>
            <p className="text-xs text-white/50 tracking-wider mt-1">
              FACILITY-WIDE DOSSIER RETENTION AUDIT // TRACK OPERATORS TARGETING SPECIAL SCHOLARS
            </p>
          </div>

          <div className="flex items-center space-x-3 text-xs font-mono">
            <button
              onClick={() => fetchRecords(page, specialOnly, searchQuery)}
              className="border border-white/40 px-3 py-1 hover:bg-white hover:text-black transition-colors"
            >
              [ SYNC TELEMETRY ]
            </button>
          </div>
        </div>

        {/* Telemetry Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-white/10 font-mono text-xs">
          <div className="border border-white/20 p-2 bg-white/5">
            <div className="text-white/40 text-[12px]">TOTAL RETENTION PINS</div>
            <div className="text-xl font-bold text-white">{summary.totalPins || 0}</div>
          </div>
          <div className="border border-white/40 p-2 bg-white/10">
            <div className="text-white/40 text-[12px]">SPECIAL TARGET PINS</div>
            <div className="text-xl font-bold text-white flex items-center gap-2">
              <span>{summary.specialPins || 0}</span>
              {summary.specialPins > 0 && (
                <span className="text-[12px] px-1 bg-white text-black font-bold animate-pulse">
                  CRITICAL
                </span>
              )}
            </div>
          </div>
          <div className="border border-white/20 p-2 bg-white/5">
            <div className="text-white/40 text-[12px]">ACTIVE OPERATORS</div>
            <div className="text-xl font-bold text-white">{summary.uniqueUsers || 0}</div>
          </div>
          <div className="border border-white/20 p-2 bg-white/5">
            <div className="text-white/40 text-[12px]">UNIQUE SCHOLARS MARKED</div>
            <div className="text-xl font-bold text-white">{summary.uniqueScholars || 0}</div>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="border border-white/20 p-4 bg-black flex flex-wrap items-center justify-between gap-4">
        {/* Toggle Mode */}
        <div className="flex border border-white/30 text-xs font-mono">
          <button
            onClick={() => setSpecialOnly(false)}
            className={`px-3 py-1.5 transition-colors ${
              !specialOnly ? 'bg-white text-black font-bold' : 'hover:bg-white/10 text-white/70'
            }`}
          >
            [ ALL INTERCEPTS ({summary.totalPins || 0}) ]
          </button>
          <button
            onClick={() => setSpecialOnly(true)}
            className={`px-3 py-1.5 transition-colors flex items-center gap-2 ${
              specialOnly ? 'bg-white text-black font-bold' : 'hover:bg-white/10 text-white/70'
            }`}
          >
            <span>[ SPECIAL TARGETS ONLY ({summary.specialPins || 0}) ]</span>
            {summary.specialPins > 0 && <span className="h-1.5 w-1.5 bg-white rounded-full animate-ping" />}
          </button>
        </div>

        {/* Search Input */}
        <form onSubmit={handleSearchSubmit} className="flex items-center space-x-2 flex-1 max-w-md">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="FILTER BY OPERATOR EMAIL, SCHOLAR NO, NAME..."
            className="input-underline text-xs"
          />
          <button type="submit" className="border border-white/40 px-3 py-1 text-xs font-mono hover:bg-white hover:text-black">
            [ QUERY ]
          </button>
          {searchQuery && (
            <button
              type="button"
              onClick={() => { setSearchQuery(''); fetchRecords(1, specialOnly, ''); }}
              className="text-xs text-white/50 hover:text-white font-mono"
            >
              [ CLEAR ]
            </button>
          )}
        </form>
      </div>

      {/* Error Notice */}
      {error && (
        <div className="p-3 border border-white bg-white/10 text-white font-mono text-xs">
          FAULT: {error}
        </div>
      )}

      {/* Intercepts Table */}
      <div className="border border-white/20 bg-black overflow-x-auto">
        <table className="w-full text-left text-xs font-mono border-collapse">
          <thead>
            <tr className="border-b border-white/20 bg-white/5 text-white/60">
              <th className="p-3">INTERCEPT TIME (IST)</th>
              <th className="p-3">OPERATOR</th>
              <th className="p-3">TARGET SCHOLAR</th>
              <th className="p-3">STUDENT NAME</th>
              <th className="p-3">PROGRAM / CPI</th>
              <th className="p-3">SURVEILLANCE STATUS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="6" className="p-8 text-center text-white/50 animate-pulse">
                  [ SCANNING FACILITY RETENTION VAULTS... ]
                </td>
              </tr>
            ) : data.results.length === 0 ? (
              <tr>
                <td colSpan="6" className="p-8 text-center text-white/50">
                  NO RETENTION PIN INTERCEPTS FOUND MATCHING CRITERIA.
                </td>
              </tr>
            ) : (
              data.results.map((row) => (
                <tr
                  key={row.id}
                  className={`border-b border-white/10 hover:bg-white/5 transition-colors ${
                    row.is_special ? 'bg-white/10' : ''
                  }`}
                >
                  <td className="p-3 text-white/70 whitespace-nowrap">
                    {formatDate(row.created_at)}
                  </td>
                  <td className="p-3">
                    <div className="font-bold text-white">{row.username || 'UNKNOWN'}</div>
                    <div className="text-[12px] text-white/50">{row.email}</div>
                  </td>
                  <td className="p-3 font-bold text-white">
                    <span className="tracking-wider">{row.scholar_no}</span>
                  </td>
                  <td className="p-3 text-white/90">
                    {row.student_name || 'N/A'}
                  </td>
                  <td className="p-3 text-white/60">
                    <div>{row.degree || 'B.Tech'} // {row.specialization || 'N/A'}</div>
                    {row.cpi_final && (
                      <div className="text-[12px] text-white/80">CPI: {Number(row.cpi_final).toFixed(2)}</div>
                    )}
                  </td>
                  <td className="p-3">
                    {row.is_special ? (
                      <div className="flex flex-col gap-1">
                        <span className="inline-block bg-white text-black px-1.5 py-0.5 text-[12px] font-bold tracking-widest uppercase">
                          [ ! SPECIAL TARGET PINNED ]
                        </span>
                        {row.special_note && (
                          <span className="text-[12px] text-white/70 italic">
                            // {row.special_note}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-white/40 text-[12px]">[ STANDARD SUBJECT ]</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination Bar */}
        {!loading && data.totalPages > 1 && (
          <div className="flex justify-between items-center p-3 border-t border-white/20 text-xs font-mono">
            <button
              disabled={page <= 1}
              onClick={() => fetchRecords(page - 1)}
              className="border border-white/30 px-3 py-1 disabled:opacity-20 hover:bg-white hover:text-black"
            >
              {'<<'} PREV
            </button>
            <span className="text-white/60">
              PAGE {page} OF {data.totalPages} ({data.total} INTERCEPTS)
            </span>
            <button
              disabled={page >= data.totalPages}
              onClick={() => fetchRecords(page + 1)}
              className="border border-white/30 px-3 py-1 disabled:opacity-20 hover:bg-white hover:text-black"
            >
              NEXT {'>>'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
