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
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isWideView, setIsWideView] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [currentTime, setCurrentTime] = useState('');

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

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toISOString().substring(11, 19) + ' UTC');
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const activeChannel = useMemo(() => {
    return (
      ADMIN_CHANNELS.find((c) =>
        c.end ? location.pathname === c.path : location.pathname.startsWith(c.path)
      ) || ADMIN_CHANNELS[0]
    );
  }, [location.pathname]);

  const filteredChannels = useMemo(() => {
    return ADMIN_CHANNELS.filter((ch) => {
      const matchesCategory = categoryFilter === 'ALL' || ch.section === categoryFilter;
      const matchesQuery =
        !filterQuery.trim() ||
        ch.ch.toLowerCase().includes(filterQuery.toLowerCase()) ||
        ch.label.toLowerCase().includes(filterQuery.toLowerCase()) ||
        ch.desc.toLowerCase().includes(filterQuery.toLowerCase());
      return matchesCategory && matchesQuery;
    });
  }, [categoryFilter, filterQuery]);

  return (
    <div className={`space-y-4 transition-all duration-200 ${isWideView ? 'max-w-none' : ''}`}>
      {/* Admin Terminal Chrome Bar */}
      <div className="border border-white/40 p-4 bg-black clip-torn">
        <div className="flex flex-wrap items-center justify-between border-b border-white/20 pb-3 gap-3">
          <div className="flex items-center space-x-3">
            <span className="font-mono text-xs bg-white text-black px-2 py-0.5 font-bold select-none">
              ROOT // OMNISCIENT
            </span>
            <div className="flex items-center space-x-2">
              <span className="text-sm tracking-widest text-white/90 font-bold">
                FACILITY SURVEILLANCE &amp; ARCHIVE COMMAND
              </span>
              <span className="hidden sm:inline-block opacity-70">
                <Mark name="sun" size={16} />
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
            {unreadAlerts > 0 ? (
              <span className="bg-white/20 border border-white text-white px-2 py-0.5 animate-pulse font-bold">
                [ ! ] {unreadAlerts} SECURITY INCIDENTS
              </span>
            ) : (
              <span className="text-white/40">[ PERIMETER SECURE ]</span>
            )}
            <span className="text-white/30 hidden sm:inline">|</span>
            <span className="text-white/60 font-mono">{currentTime || 'SYS_CLOCK_ACTIVE'}</span>

            {/* Quick Actions */}
            <div className="flex items-center gap-1.5 ml-2">
              <button
                type="button"
                onClick={() => setIsSidebarOpen((prev) => !prev)}
                className="px-2 py-1 border border-white/30 hover:border-white text-white/80 hover:text-white transition-colors"
                title={isSidebarOpen ? 'Collapse Side Panel' : 'Expand Side Panel'}
              >
                {isSidebarOpen ? '[ ◀ SIDE PANEL ]' : '[ ▶ SIDE PANEL ]'}
              </button>
              <button
                type="button"
                onClick={() => setIsWideView((prev) => !prev)}
                className="px-2 py-1 border border-white/30 hover:border-white text-white/80 hover:text-white transition-colors hidden md:inline-block"
                title={isWideView ? 'Compact Viewport' : 'Wide Viewport'}
              >
                {isWideView ? '[ ◱ COMPACT ]' : '[ ⛶ WIDE VIEW ]'}
              </button>
            </div>
          </div>
        </div>

        {/* Dropdown Quick Switcher Bar */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 pt-1 text-xs">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-white/50 text-[11px] font-mono uppercase shrink-0">
              CHANNEL SELECTOR:
            </span>
            <select
              value={activeChannel.path}
              onChange={(e) => navigate(e.target.value)}
              className="bg-black text-white text-xs font-mono border border-white/40 px-2.5 py-1.5 flex-1 sm:flex-none sm:min-w-[280px] focus:outline-none focus:border-white cursor-pointer hover:border-white transition-colors"
              aria-label="Direct Channel Jump"
            >
              {ADMIN_CHANNELS.map((ch) => (
                <option key={ch.path} value={ch.path} className="bg-neutral-950 text-white">
                  {ch.ch} // {ch.label} - {ch.desc} {ch.hasBadge && unreadAlerts > 0 ? `(! ${unreadAlerts})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-white/50">
            <span>FEED STATUS:</span>
            <span className="text-white font-bold bg-white/10 px-2 py-0.5 border border-white/20">
              ACTIVE // {activeChannel.ch}
            </span>
            <button
              type="button"
              onClick={pollAlerts}
              className="hover:text-white text-white/60 ml-1 underline"
              title="Re-poll alert telemetry"
            >
              [ RE-POLL ]
            </button>
          </div>
        </div>
      </div>

      {/* Main Workspace Layout with Side Panel */}
      <div className="flex flex-col lg:flex-row gap-5 items-start">
        {/* Left Side Panel */}
        {isSidebarOpen && (
          <aside className="w-full lg:w-64 xl:w-72 shrink-0 border border-white/30 bg-black/95 p-3.5 space-y-3 font-terminal">
            <div className="flex items-center justify-between border-b border-white/20 pb-2">
              <div className="flex items-center space-x-2">
                <span className="text-xs tracking-wider text-white font-bold">
                  SURVEILLANCE TABS
                </span>
                <span className="text-[10px] text-white/40">[{ADMIN_CHANNELS.length}]</span>
              </div>
              <button
                type="button"
                onClick={() => setIsSidebarOpen(false)}
                className="text-white/40 hover:text-white text-xs lg:hidden"
                aria-label="Close sidebar"
              >
                [X]
              </button>
            </div>

            {/* Quick Filter & Category Dropdown */}
            <div className="space-y-2">
              <input
                type="text"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="SEARCH CHANNELS..."
                className="w-full bg-black border border-white/25 px-2 py-1 text-xs text-white placeholder-white/30 focus:outline-none focus:border-white font-mono"
              />

              <div className="flex items-center gap-1.5 text-xs font-mono">
                <span className="text-white/40 text-[11px] shrink-0">FILTER:</span>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full bg-black text-white text-[11px] border border-white/25 px-1.5 py-1 focus:outline-none focus:border-white cursor-pointer"
                >
                  <option value="ALL">ALL CATEGORIES</option>
                  <option value="SECURITY">SECURITY &amp; THREATS</option>
                  <option value="ACCESS">ACCESS &amp; USERS</option>
                  <option value="ARCHIVE">ARCHIVES &amp; LOGS</option>
                  <option value="OPERATIONS">OPERATIONS &amp; ROSTERS</option>
                  <option value="SYSTEM">SYSTEM &amp; PROTOCOLS</option>
                  <option value="DIAGNOSTICS">DIAGNOSTICS</option>
                </select>
              </div>
            </div>

            {/* Navigation Channels List */}
            <nav className="space-y-1 max-h-[620px] overflow-y-auto pr-1 pt-1">
              {filteredChannels.length === 0 ? (
                <div className="p-3 text-center text-xs text-white/40 font-mono">
                  NO MATCHING CHANNELS
                </div>
              ) : (
                filteredChannels.map((link) => (
                  <NavLink
                    key={link.path}
                    to={link.path}
                    end={link.end}
                    className={({ isActive }) =>
                      `flex items-center justify-between px-2.5 py-2 transition-colors border text-xs ${
                        isActive
                          ? 'bg-white text-black font-bold border-white shadow'
                          : 'border-white/10 text-white/70 hover:border-white/50 hover:text-white bg-black/40'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <div className="flex flex-col min-w-0 pr-1">
                          <div className="flex items-center space-x-1.5">
                            <span className={`text-[10px] font-mono ${isActive ? 'text-black/70' : 'text-white/40'}`}>
                              {link.ch}
                            </span>
                            <span className="font-bold tracking-wider truncate">
                              {link.label}
                            </span>
                          </div>
                          <span className={`text-[10px] font-mono truncate ${isActive ? 'text-black/80' : 'text-white/40'}`}>
                            {link.desc}
                          </span>
                        </div>

                        <div className="flex items-center space-x-1 shrink-0">
                          {link.hasBadge && unreadAlerts > 0 && (
                            <span className="px-1.5 py-0.2 bg-red-600 text-white text-[11px] font-bold border border-red-400 animate-pulse">
                              {unreadAlerts}
                            </span>
                          )}
                          {isActive && (
                            <span className="text-black font-bold text-xs">◀</span>
                          )}
                        </div>
                      </>
                    )}
                  </NavLink>
                ))
              )}
            </nav>

            <div className="pt-2 border-t border-white/15 text-[11px] text-white/40 flex justify-between items-center font-mono">
              <span>CLEARANCE: LEVEL 5</span>
              <span>CH: {activeChannel.ch}</span>
            </div>
          </aside>
        )}

        {/* Right Content Area */}
        <main className="flex-1 min-w-0 w-full">
          {/* Active View Header Banner */}
          <div className="border border-white/20 px-4 py-2.5 bg-black/80 mb-4 flex flex-wrap items-center justify-between gap-2 font-terminal">
            <div className="flex items-center space-x-2">
              <span className="bg-white/10 border border-white/30 text-white px-2 py-0.5 text-xs font-mono font-bold">
                {activeChannel.ch}
              </span>
              <h2 className="text-sm font-bold tracking-widest text-white">
                {activeChannel.label} // {activeChannel.desc.toUpperCase()}
              </h2>
            </div>

            <div className="flex items-center space-x-2 text-xs font-mono text-white/50">
              <span className="hidden sm:inline">SECTION: [{activeChannel.section}]</span>
              <span>|</span>
              <span className="text-green-400">ONLINE</span>
            </div>
          </div>

          {/* Admin Child Route View */}
          <div className="min-h-[500px]">
            <Outlet context={{ unreadAlerts, refreshAlerts: pollAlerts }} />
          </div>
        </main>
      </div>
    </div>
  );
}
