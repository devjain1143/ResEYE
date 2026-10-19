import React, { useState, useEffect } from 'react';
import { api } from '../../api';

export default function AuditLog() {
  const [data, setData] = useState({ logs: [], total: 0, page: 1, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchLogs = async (p = 1) => {
    setLoading(true);
    setError('');
    try {
      const res = await api(`/admin/audit?page=${p}&pageSize=30`);
      if (res.success && res.data) {
        setData(res.data);
        setPage(p);
      }
    } catch (err) {
      setError(err.message || 'FAILED TO RETRIEVE AUDIT TRAIL');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(1);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border border-white/20 p-4 bg-black">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-3 mb-2">
          <div>
            <h2 className="text-xl font-bold tracking-widest">[ SURVEILLANCE &amp; ADMIN AUDIT TRAIL ]</h2>
            <p className="text-xs text-white/50 tracking-wider">
              TAMPER-EVIDENT CHRONICLE OF ALL ADMINISTRATIVE DIRECTIVES
            </p>
          </div>
          <div className="text-xs text-white/60">
            TOTAL ACTIONS RECORDED: <strong className="text-white">{data.total || 0}</strong>
          </div>
        </div>
      </div>

      {error && (
        <div className="border border-white/40 p-3 bg-black text-xs text-white">
          [ ERR ] {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="py-12 text-center text-white/40 animate-pulse text-sm">
          -- SCANNING AUDIT REGISTERS... --
        </div>
      ) : data.logs.length === 0 ? (
        <div className="border border-white/20 p-8 text-center text-white/40 text-xs">
          [ AUDIT TRAIL LEDGER IS EMPTY ]
        </div>
      ) : (
        <div className="border border-white/30 overflow-x-auto bg-black">
          <table className="w-full text-left text-xs font-mono border-collapse">
            <thead>
              <tr className="border-b border-white/20 bg-white/5 text-white/60">
                <th className="p-3">TIMESTAMP</th>
                <th className="p-3">DIRECTIVE ACTION</th>
                <th className="p-3">EXECUTOR</th>
                <th className="p-3">TARGET ENTITY</th>
                <th className="p-3">TELEMETRY PAYLOAD</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {data.logs.map((log) => (
                <tr key={log.id} className="hover:bg-white/5 transition-colors">
                  <td className="p-3 text-white/50 whitespace-nowrap">
                    {log.timestamp ? new Date(log.timestamp).toISOString().replace('T', ' ').substring(0, 19) : '--'}
                  </td>
                  <td className="p-3 font-bold text-white tracking-wider">
                    [{log.action}]
                  </td>
                  <td className="p-3 text-white/60 font-mono">
                    {log.admin_user_id || 'SYSTEM'}
                  </td>
                  <td className="p-3 text-white/80 font-mono">
                    {log.target_id || '--'}
                  </td>
                  <td className="p-3 text-[13px] text-white/60 font-mono max-w-xs truncate">
                    {typeof log.details === 'object' ? JSON.stringify(log.details) : log.details || '--'}
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
            onClick={() => fetchLogs(page - 1)}
            className="border border-white/30 px-3 py-1 hover:border-white disabled:opacity-20"
          >
            &lt; PREV
          </button>
          <span className="text-white/60">
            PAGE {page} OF {data.totalPages}
          </span>
          <button
            disabled={page >= data.totalPages}
            onClick={() => fetchLogs(page + 1)}
            className="border border-white/30 px-3 py-1 hover:border-white disabled:opacity-20"
          >
            NEXT &gt;
          </button>
        </div>
      )}
    </div>
  );
}
