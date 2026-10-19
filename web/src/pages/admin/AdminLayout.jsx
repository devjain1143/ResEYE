import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { api } from '../../api';

const ADMIN_LINKS = [
  { path: '/admin', label: '[ TELEMETRY ]', end: true },
  { path: '/admin/users', label: '[ USERS ]' },
  { path: '/admin/special', label: '[ SURVEILLANCE ]' },
  { path: '/admin/pinned-monitors', label: '[ PIN-SURVEILLANCE ]' },
  { path: '/admin/alerts', label: '[ INCIDENTS ]', hasBadge: true },
  { path: '/admin/history', label: '[ SEARCH-LOGS ]' },
  { path: '/admin/ai-history', label: '[ INTEL-LOGS ]' },
  { path: '/admin/feedback', label: '[ GROUND-TRUTH ]' },
  { path: '/admin/announcements', label: '[ BROADCASTS ]' },
  { path: '/admin/registration', label: '[ ROSTERS ]' },
  { path: '/admin/export', label: '[ ARCHIVE-DUMP ]' },
  { path: '/admin/nlq-debug', label: '[ NLQ-LAB ]' },
  { path: '/admin/settings', label: '[ PROTOCOLS ]' },
  { path: '/admin/audit', label: '[ AUDIT-TRAIL ]' },
];

export default function AdminLayout({ user }) {
  const [unreadAlerts, setUnreadAlerts] = useState(0);

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

  return (
    <div className="space-y-6">
      {/* Admin Terminal Chrome Bar */}
      <div className="border border-white/40 p-4 bg-black clip-torn">
        <div className="flex flex-wrap items-center justify-between border-b border-white/20 pb-3 gap-2">
          <div className="flex items-center space-x-3">
            <span className="font-mono text-xs bg-white text-black px-2 py-0.5 font-bold">
              ROOT // OMNISCIENT
            </span>
            <span className="text-sm tracking-widest text-white/90">
              FACILITY SURVEILLANCE &amp; ARCHIVE COMMAND
            </span>
          </div>

          <div className="flex items-center space-x-4 text-xs font-mono">
            {unreadAlerts > 0 ? (
              <span className="bg-white/20 border border-white text-white px-2 py-0.5 animate-pulse font-bold">
                [ ! ] {unreadAlerts} SECURITY INCIDENTS PENDING
              </span>
            ) : (
              <span className="text-white/40">[ PERIMETER SECURE ]</span>
            )}
            <span className="text-white/30">|</span>
            <span className="text-white/60">SYS_TIME: {new Date().toISOString().substring(11, 19)} UTC</span>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <nav className="flex flex-wrap gap-1 mt-3 text-xs overflow-x-auto pb-1">
          {ADMIN_LINKS.map((link) => (
            <NavLink
              key={link.path}
              to={link.path}
              end={link.end}
              className={({ isActive }) =>
                `px-3 py-1.5 transition-colors border whitespace-nowrap ${
                  isActive
                    ? 'bg-white text-black font-bold border-white'
                    : 'border-white/20 text-white/70 hover:border-white/60 hover:text-white'
                }`
              }
            >
              {link.label}
              {link.hasBadge && unreadAlerts > 0 && (
                <span className="ml-1.5 px-1 bg-black text-white text-[12px] border border-white">
                  {unreadAlerts}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Admin Child Route View */}
      <div className="min-h-[500px]">
        <Outlet context={{ unreadAlerts, refreshAlerts: pollAlerts }} />
      </div>
    </div>
  );
}
