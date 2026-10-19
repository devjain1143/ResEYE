import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../api';

export default function Alerts() {
  const { refreshAlerts } = useOutletContext() || {};
  const [alerts, setAlerts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('UNRESOLVED');
  const [kindFilter, setKindFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  const fetchAlerts = async (p = page, st = statusFilter, kd = kindFilter) => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams();
      q.set('page', p);
      if (st) q.set('status', st);
      if (kd) q.set('kind', kd);

      const res = await api(`/admin/alerts?${q.toString()}`);
      if (res.success && res.data) {
        setAlerts(res.data.results || []);
        setTotal(res.data.total || 0);
        setPage(res.data.page || 1);
      }
    } catch (err) {
      setError(err.message || 'FAILED TO RETRIEVE SECURITY INCIDENTS');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts(1, statusFilter, kindFilter);
  }, [statusFilter, kindFilter]);

  const handleAction = async (id, actionType) => {
    setError('');
    setActionMsg('');
    try {
      const res = await api(`/admin/alerts/${id}/${actionType}`, { method: 'POST' });
      setActionMsg(`INCIDENT #${id}: ACTION [${actionType.toUpperCase()}] EXECUTED.`);
      if (refreshAlerts) refreshAlerts();
      fetchAlerts(page, statusFilter, kindFilter);
    } catch (err) {
      setError(err.message || `FAILED TO EXECUTE ${actionType}`);
    }
  };

  const totalPages = Math.ceil(total / 20) || 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border border-white/20 p-4 bg-black">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-3 mb-4">
          <div>
            <h2 className="text-xl font-bold tracking-widest">[ SECURITY INCIDENT QUEUE ]</h2>
            <p className="text-xs text-white/50 tracking-wider">
              AUTOMATED ANOMALY DETECTION &amp; ANTI-SCRAPING SURVEILLANCE
            </p>
          </div>
          <div className="text-xs text-white/60">
            RECORDED INCIDENTS: <strong className="text-white">{total}</strong>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center space-x-2">
            <span className="text-white/50">STATE:</span>
            {['UNRESOLVED', 'RESOLVED', ''].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 border transition-colors ${
                  statusFilter === st
                    ? 'bg-white text-black font-bold border-white'
                    : 'border-white/20 text-white/70 hover:border-white/50'
                }`}
              >
                [{st || 'ALL'}]
              </button>
            ))}
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-white/50">INCIDENT TYPE:</span>
            {['', 'SPECIAL_HIT', 'SWEEP_BATCH', 'SWEEP_SEMESTER', 'ENUMERATION', 'CAPTCHA_ABUSE'].map((kd) => (
              <button
                key={kd}
                onClick={() => setKindFilter(kd)}
                className={`px-2 py-1 border transition-colors text-[13px] ${
                  kindFilter === kd
                    ? 'bg-white text-black font-bold border-white'
                    : 'border-white/20 text-white/60 hover:border-white/40'
                }`}
              >
                {kd || 'ALL-TYPES'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {actionMsg && (
        <div className="border border-white/40 p-3 bg-black text-xs text-white">
          [ OK ] {actionMsg}
        </div>
      )}

      {error && (
        <div className="border border-white/40 p-3 bg-black text-xs text-white">
          [ ERR ] {error}
        </div>
      )}

      {/* Incident List */}
      {loading ? (
        <div className="py-12 text-center text-white/40 animate-pulse text-sm">
          -- SCANNING INCIDENT LOGS... --
        </div>
      ) : alerts.length === 0 ? (
        <div className="border border-white/20 p-8 text-center text-white/40 text-xs">
          [ NO ANOMALIES DETECTED MATCHING CRITERIA ]
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((al) => (
            <div
              key={al.id}
              className={`border p-4 bg-black clip-torn transition-colors ${
                al.status === 'UNRESOLVED'
                  ? 'border-white/40 hover:border-white'
                  : 'border-white/20 opacity-60'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between border-b border-white/10 pb-2 mb-2 text-xs">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-white tracking-wider">
                    INCIDENT #{al.id} // [{al.kind}]
                  </span>
                  <span
                    className={`px-1.5 py-0.2 border text-[12px] ${
                      al.status === 'UNRESOLVED'
                        ? 'border-white bg-white/20 text-white font-bold animate-pulse'
                        : 'border-white/20 text-white/40'
                    }`}
                  >
                    [{al.status}]
                  </span>
                </div>
                <div className="text-white/40">
                  {al.timestamp ? new Date(al.timestamp).toISOString().replace('T', ' ').substring(0, 19) : '--'}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono mb-3">
                <div>
                  <span className="text-white/50">OPERATOR ID: </span>
                  <span className="text-white font-bold">{al.web_user_id || 'ANONYMOUS/UNKNOWN'}</span>
                </div>
                <div>
                  <span className="text-white/50">TARGET SCHOLAR: </span>
                  <span className="text-white font-bold">{al.scholar_no || 'BATCH_SWEEP'}</span>
                </div>
                <div className="md:col-span-2">
                  <span className="text-white/50">DETAILS: </span>
                  <span className="text-white/80 font-serif">
                    {typeof al.details === 'object' ? JSON.stringify(al.details) : al.details || '--'}
                  </span>
                </div>
              </div>

              {/* Action Directives */}
              {al.status === 'UNRESOLVED' && (
                <div className="flex justify-end items-center space-x-2 border-t border-white/10 pt-3 text-xs">
                  <button
                    onClick={() => handleAction(al.id, 'warn')}
                    className="border border-white/40 px-3 py-1 hover:border-white text-white/80"
                  >
                    [ 1-CLICK WARN ]
                  </button>
                  <button
                    onClick={() => handleAction(al.id, 'revoke')}
                    className="border border-white px-3 py-1 bg-white text-black font-bold hover:bg-white/80"
                  >
                    [ 1-CLICK REVOKE ACCESS ]
                  </button>
                  <button
                    onClick={() => handleAction(al.id, 'dismiss')}
                    className="border border-white/20 px-3 py-1 text-white/40 hover:text-white"
                  >
                    [ DISMISS ]
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center border border-white/20 p-3 bg-black text-xs">
          <button
            disabled={page <= 1}
            onClick={() => fetchAlerts(page - 1, statusFilter, kindFilter)}
            className="border border-white/30 px-3 py-1 hover:border-white disabled:opacity-20"
          >
            &lt; PREV
          </button>
          <span className="text-white/60">
            PAGE {page} OF {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => fetchAlerts(page + 1, statusFilter, kindFilter)}
            className="border border-white/30 px-3 py-1 hover:border-white disabled:opacity-20"
          >
            NEXT &gt;
          </button>
        </div>
      )}
    </div>
  );
}
