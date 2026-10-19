import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await api('/admin/stats');
      if (res.success && res.data) {
        setStats(res.data);
      }
    } catch (err) {
      setError(err.message || 'FAILED TO RETRIEVE FACILITY TELEMETRY');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="border border-white/20 p-4 bg-black">
        <h2 className="text-xl font-bold tracking-widest">[ TELEMETRY &amp; OPERATIONAL HEALTH ]</h2>
        <p className="text-xs text-white/50 tracking-wider">
          SYSTEM ACTIVITY COUNTERS AND SURVEILLANCE STATUS
        </p>
      </div>

      {error && (
        <div className="border border-white/40 p-3 bg-black text-xs text-white/90">
          [ ERR ] {error}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-white/40 animate-pulse text-sm">
          -- SCANNING TELEMETRY MATRICES... --
        </div>
      ) : stats ? (
        <div className="space-y-6">
          {/* Key Metric Tiles */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Active Users */}
            <div className="border border-white/30 p-4 bg-black">
              <div className="text-xs text-white/50 tracking-wider mb-1">AUTHORIZED OPERATORS</div>
              <div className="text-3xl font-bold tracking-widest">{stats.users?.ACTIVE || 0}</div>
              <div className="text-[13px] text-white/40 mt-2 font-mono">[ STATUS: ACTIVE ]</div>
            </div>

            {/* Pending Approvals */}
            <Link
              to="/admin/users?status=PENDING"
              className="border border-white/30 p-4 bg-black hover:border-white transition-colors block"
            >
              <div className="text-xs text-white/50 tracking-wider mb-1 flex justify-between">
                <span>PENDING APPROVAL</span>
                {stats.users?.PENDING > 0 && <span className="text-white animate-pulse">[ ! ]</span>}
              </div>
              <div className="text-3xl font-bold tracking-widest">{stats.users?.PENDING || 0}</div>
              <div className="text-[13px] text-white/70 mt-2 font-mono underline">
                &gt; REVIEW QUEUE
              </div>
            </Link>

            {/* Blocked Accounts */}
            <div className="border border-white/30 p-4 bg-black">
              <div className="text-xs text-white/50 tracking-wider mb-1">REVOKED / BLOCKED</div>
              <div className="text-3xl font-bold tracking-widest">{stats.users?.BLOCKED || 0}</div>
              <div className="text-[13px] text-white/40 mt-2 font-mono">[ STATUS: REVOKED ]</div>
            </div>

            {/* Open Alerts */}
            <Link
              to="/admin/alerts"
              className="border border-white/30 p-4 bg-black hover:border-white transition-colors block"
            >
              <div className="text-xs text-white/50 tracking-wider mb-1 flex justify-between">
                <span>SECURITY INCIDENTS</span>
                {stats.openAlerts > 0 && <span className="text-white animate-pulse">[ ACTION REQ ]</span>}
              </div>
              <div className="text-3xl font-bold tracking-widest">{stats.openAlerts || 0}</div>
              <div className="text-[13px] text-white/70 mt-2 font-mono underline">
                &gt; TRIAGE INCIDENTS
              </div>
            </Link>
          </div>

          {/* Activity Today */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-white/20 p-5 bg-black/60">
              <div className="text-xs text-white/50 tracking-widest mb-2 border-b border-white/10 pb-2">
                INDEX SEARCHES (CURRENT CYCLE)
              </div>
              <div className="text-4xl font-bold tracking-wider my-2 font-mono">
                {stats.searchesToday || 0}
              </div>
              <p className="text-xs text-white/60">
                Direct scholar inquiries and batch roster lookups executed today.
              </p>
            </div>

            <div className="border border-white/20 p-5 bg-black/60">
              <div className="text-xs text-white/50 tracking-widest mb-2 border-b border-white/10 pb-2">
                AI INTEL INQUIRIES (CURRENT CYCLE)
              </div>
              <div className="text-4xl font-bold tracking-wider my-2 font-mono">
                {stats.aiQueriesToday || 0}
              </div>
              <p className="text-xs text-white/60">
                Natural language statistical calculations processed through archive engine.
              </p>
            </div>
          </div>

          {/* Quick Command Directives */}
          <div className="border border-white/30 p-4 bg-black">
            <div className="text-xs text-white/50 tracking-widest mb-3 border-b border-white/10 pb-2">
              SURVEILLANCE DIRECTIVES &amp; SHORTCUTS
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <Link
                to="/admin/alerts"
                className="border border-white/20 p-3 hover:bg-white/10 transition-colors block"
              >
                <div className="font-bold mb-1">&gt; SECURITY INCIDENTS</div>
                <div className="text-white/50">Investigate sweep loops, scholar hits, enumeration.</div>
              </Link>
              <Link
                to="/admin/feedback"
                className="border border-white/20 p-3 hover:bg-white/10 transition-colors block"
              >
                <div className="font-bold mb-1">&gt; GROUND TRUTH CURATION</div>
                <div className="text-white/50">Triage AI queries and update vector few-shot memory.</div>
              </Link>
              <Link
                to="/admin/export"
                className="border border-white/20 p-3 hover:bg-white/10 transition-colors block"
              >
                <div className="font-bold mb-1">&gt; ARCHIVE BACKUP DUMP</div>
                <div className="text-white/50">Export student registries, query logs, or audit records.</div>
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
