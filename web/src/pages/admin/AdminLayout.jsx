import React, { useState, useEffect, useMemo } from 'react';
import { NavLink, Outlet, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import Mark from '../../marks/Mark';

const ADMIN_CHANNELS = [
  { path: '/admin', ch: 'CH 01', label: 'TELEMETRY', section: 'SYSTEM', end: true, desc: 'Operational Health' },
  { path: '/admin/users', ch: 'CH 02', label: 'USERS', section: 'ACCESS', desc: 'Clearance Registry' },
  { path: '/admin/special', ch: 'CH 03', label: 'SURVEILLANCE', section: 'SECURITY', desc: 'Watchlist Subjects' },
  { path: '/admin/pinned-monitors', ch: 'CH 04', label: 'PIN-SURVEILLANCE', section: 'SECURITY', desc: 'Active Monitors' },
  { path: '/admin/alerts', ch: 'CH 05', label: 'INCIDENTS', section: 'SECURITY', desc: 'Security Alert Queue', hasBadge: true },
  { path: '/admin/history', ch: 'CH 06', label: 'SEARCH-LOGS', section: 'ARCHIVE', desc: 'Operator Queries' },
  { path: '/admin/ai-history', ch: 'CH 07', label: 'INTEL-LOGS', section: 'ARCHIVE', desc: 'Neural Speech' },
  { path: '/admin/feedback', ch: 'CH 08', label: 'GROUND-TRUTH', section: 'ARCHIVE', desc: 'Subject Reports' },
  { path: '/admin/announcements', ch: 'CH 09', label: 'BROADCASTS', section: 'OPERATIONS', desc: 'OSD Dispatches' },
  { path: '/admin/registration', ch: 'CH 10', label: 'ROSTERS', section: 'OPERATIONS', desc: 'Master Datasets' },
  { path: '/admin/export', ch: 'CH 11', label: 'ARCHIVE-DUMP', section: 'OPERATIONS', desc: 'Encrypted Backups' },
  { path: '/admin/nlq-debug', ch: 'CH 12', label: 'NLQ-LAB', section: 'DIAGNOSTICS', desc: 'Intent Classifier' },
  { path: '/admin/settings', ch: 'CH 13', label: 'PROTOCOLS', section: 'SYSTEM', desc: 'Security Thresholds' },
  { path: '/admin/audit', ch: 'CH 14', label: 'AUDIT-TRAIL', section: 'SYSTEM', desc: 'Cryptographic Ledger' },
];

export default function AdminLayout({ user }) {
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();

  // Guard: Admin only
  if (!user || user.role !== 'ADMIN') {
    return <Navigate to="/search" replace />;
  }

  const pollAlerts = async () => {
    try {
      const res = await api('/admin/alerts/unread-count');
      if (res && res.count !== undefined) {
        setUnreadAlerts(res.count);
      }
    } catch {}
  };

  useEffect(() => {
    pollAlerts();
    const interval = setInterval(pollAlerts, 15000);
    return () => clearInterval(interval);
  }, []);

  const activeChannel = useMemo(() => {
    return (
      ADMIN_CHANNELS.find((c) =>
        c.end ? location.pathname === c.path : location.pathname.startsWith(c.path)
      ) || ADMIN_CHANNELS[0]
    );
  }, [location.pathname]);

  return (
    <div className="space-y-5">
      {/* Facility Header - Clean, borderless, OSD style */}
      <div className="border-b border-white/15 pb-3 flex flex-wrap items-center justify-between gap-3 font-terminal">
        <div className="flex items-center space-x-3">
          <span className="bg-white text-black text-xs px-2 py-0.5 font-bold select-none">
            ROOT // OMNISCIENT
          </span>
          <span className="text-sm tracking-widest text-white/90 font-bold">
            FACILITY SURVEILLANCE &amp; ARCHIVE COMMAND
          </span>
        </div>

        <div className="flex items-center space-x-3 text-xs font-mono">
          {unreadAlerts > 0 ? (
            <span className="text-red-400 font-bold animate-pulse">
              [ ! ] {unreadAlerts} SECURITY INCIDENTS PENDING
            </span>
          ) : (
            <span className="text-white/40">[ PERIMETER SECURE ]</span>
          )}
          <span className="text-white/20">|</span>
          <span className="text-white/50">{activeChannel.ch} // {activeChannel.label}</span>
        </div>
      </div>

      {/* Mobile Channel Switcher Dropdown (only on mobile) */}
      <div className="md:hidden font-terminal">
        <label className="block text-[11px] text-white/50 mb-1 font-mono">
          SWITCH CHANNEL:
        </label>
        <select
          value={activeChannel.path}
          onChange={(e) => navigate(e.target.value)}
          className="w-full bg-black text-white text-xs font-mono border border-white/20 px-3 py-2 focus:outline-none focus:border-white cursor-pointer"
        >
          {ADMIN_CHANNELS.map((ch) => (
            <option key={ch.path} value={ch.path} className="bg-neutral-950 text-white">
              {ch.ch} // {ch.label} {ch.hasBadge && unreadAlerts > 0 ? `(! ${unreadAlerts})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Control Room Layout: Side Panel Tabs on Left + Content View on Right */}
      <div className="flex flex-col md:flex-row gap-6 items-start">
        {/* Side Panel: Clean borderless channel list */}
        <aside className="hidden md:block w-56 shrink-0 font-terminal">
          <div className="flex items-center space-x-2 text-white/40 text-xs mb-2 pb-1 border-b border-white/10 tracking-widest">
            <Mark name="sun" size={14} />
            <span>COMMAND CHANNELS</span>
          </div>

          <nav className="space-y-0.5">
            {ADMIN_CHANNELS.map((link) => (
              <NavLink
                key={link.path}
                to={link.path}
                end={link.end}
                className={({ isActive }) =>
                  `flex items-center justify-between px-2.5 py-1.5 text-xs tracking-wider transition-colors ${
                    isActive
                      ? 'bg-white text-black font-bold'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`
                }
              >
                <span>
                  <span className="text-[11px] opacity-60 mr-1.5 font-mono">{link.ch}</span>
                  {link.label}
                </span>
                {link.hasBadge && unreadAlerts > 0 && (
                  <span className="text-[10px] px-1 font-bold bg-red-600 text-white">
                    {unreadAlerts}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* Content View */}
        <main className="flex-1 min-w-0 w-full">
          <Outlet context={{ unreadAlerts, refreshAlerts: pollAlerts }} />
        </main>
      </div>
    </div>
  );
}
