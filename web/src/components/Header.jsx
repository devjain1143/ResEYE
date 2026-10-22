import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cycleDistortion, getDistortion } from '../settings/distortion';
import { api } from '../api';
import GlitchEye from './GlitchEye';

const ADMIN_NAV_LINKS = [
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

// Section 9.3: Navigation as tape OSD
// Top bar: REC CH 03 | live timestamp IST
// Below: logo + nav as plain text items, active = inverted slab with jagged edges
export default function Header({ user, onLogout, onOpenTour }) {
  const [timeStr, setTimeStr] = useState('');
  const [counter, setCounter] = useState(104);
  const [distLevel, setDistLevel] = useState(getDistortion());
  const [mobileNav, setMobileNav] = useState(false);
  const [adminDropdownOpen, setAdminDropdownOpen] = useState(false);
  const [mobileAdminOpen, setMobileAdminOpen] = useState(true);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const adminDropdownRef = useRef(null);
  const location = useLocation();

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const ist = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).format(now);
      setTimeStr(ist);
    };

    updateTime();
    const timer = setInterval(updateTime, 1000);
    const counterTimer = setInterval(() => {
      setCounter((prev) => (prev + 1) % 9999);
    }, 1800);

    return () => {
      clearInterval(timer);
      clearInterval(counterTimer);
    };
  }, []);

  useEffect(() => {
    if (user?.role !== 'ADMIN') return;
    const poll = async () => {
      try {
        const res = await api('/admin/alerts/unread-count');
        if (res && res.count !== undefined) {
          setUnreadAlerts(res.count);
        }
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 15000);
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (adminDropdownRef.current && !adminDropdownRef.current.contains(e.target)) {
        setAdminDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const isActive = (path) => {
    if (path === '/search' || path === '/') return location.pathname === '/' || location.pathname === '/search';
    return location.pathname === path;
  };

  const handleDistortionToggle = () => {
    const next = cycleDistortion();
    setDistLevel(next);
  };

  const navItems = [
    { path: '/search', label: 'CH 01 DOSSIERS', shortLabel: 'DOSSIERS' },
    { path: '/pinned', label: 'CH 02 PINNED TAPES', shortLabel: 'PINNED' },
  ];

  if (user?.role === 'ADMIN') {
    navItems.push({ path: '/admin', label: 'CH 03 CONTROL ROOM', shortLabel: 'CONTROL', isPrefix: true });
  }

  return (
    <header className="bg-black font-terminal text-white relative z-[80]">
      {/* Tape OSD Top Bar */}
      <div className="flex flex-wrap items-center justify-between px-4 py-1 text-xs" style={{ color: 'var(--bone-60)' }}>
        <div className="flex items-center space-x-3">
          <span className="inline-block h-2 w-2 bg-white animate-pulse" />
          <span className="tracking-widest">REC</span>
          <span>SP 0:00:00</span>
          <span>TAPE {String(counter).padStart(5, '0')}</span>
        </div>
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={onOpenTour}
            className="hidden md:inline-block hover:text-white transition-colors tracking-widest text-[11px] border border-white/20 px-2 py-0.5 bg-white/5 glitch"
            title="Open interactive archive tour"
            data-corruptible="true"
            data-text="[ ? TOUR ]"
          >
            [ ? TOUR ]
          </button>
          <button
            type="button"
            onClick={handleDistortionToggle}
            className="hidden md:inline-block hover:text-white transition-colors tracking-widest text-[11px] border border-white/20 px-2 py-0.5 bg-white/5 glitch"
            title="Cycle VHS scanline distortion mode"
            data-corruptible="true"
            data-text={`[VHS: ${distLevel.toUpperCase()}]`}
          >
            [VHS: {distLevel.toUpperCase()}]
          </button>
          <span>{timeStr || 'LIVE'} IST</span>
        </div>
      </div>

      {/* Scratched divider line */}
      <div aria-hidden="true" style={{ height: '1px', background: 'var(--bone-15)' }} />

      {/* Main Nav Bar */}
      <div className="flex flex-wrap items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center space-x-2 hover:opacity-80 group">
          <GlitchEye size="inline" />
          <span
            className="glitch text-xl tracking-wider font-bold"
            data-text="ResEYE"
            data-corruptible
          >
            ResEYE
          </span>
          <span className="text-xs tracking-widest" style={{ color: 'var(--bone-35)' }}>// ARCHIVE</span>
        </Link>

        {/* Desktop nav */}
        {user && (
          <nav className="hidden md:flex items-center space-x-1 text-sm">
            {navItems.map(item => {
              const active = item.isPrefix
                ? location.pathname.startsWith(item.path)
                : isActive(item.path);

              if (item.isPrefix) {
                return (
                  <div
                    key={item.path}
                    ref={adminDropdownRef}
                    className="relative"
                    onMouseEnter={() => setAdminDropdownOpen(true)}
                    onMouseLeave={() => setAdminDropdownOpen(false)}
                  >
                    <div className="flex items-center">
                      <Link
                        to={item.path}
                        className={`px-3 py-1 tracking-wider transition-colors inline-flex items-center gap-1.5 ${
                          active
                            ? 'bg-white text-black font-bold'
                            : 'hover:text-white'
                        }`}
                        style={active ? {
                          clipPath: 'polygon(0 8%, 3% 0, 10% 5%, 100% 0, 97% 45%, 100% 60%, 97% 100%, 6% 95%, 0 100%, 2% 50%)'
                        } : { color: 'var(--bone-60)' }}
                        onClick={() => setAdminDropdownOpen(false)}
                      >
                        <span>{item.label}</span>
                        <span className="text-[10px] select-none opacity-70">▾</span>
                        {unreadAlerts > 0 && (
                          <span className="ml-1 px-1 bg-black text-white text-[11px] border border-white">
                            {unreadAlerts}
                          </span>
                        )}
                      </Link>
                    </div>

                    {/* Desktop Dropdown under CH 03 CONTROL ROOM */}
                    {adminDropdownOpen && (
                      <div className="absolute top-full right-0 mt-1 w-[460px] bg-black border border-white/40 p-2 shadow-2xl z-[120] font-terminal animate-in fade-in slide-in-from-top-1 duration-100">
                        <div className="text-[11px] text-white/50 px-2 py-1 border-b border-white/20 mb-2 flex justify-between items-center font-mono">
                          <span>FACILITY SURVEILLANCE &amp; ARCHIVE COMMAND</span>
                          <span className="text-white/40">[14 CHANNELS]</span>
                        </div>
                        <nav className="flex flex-wrap gap-1 text-xs">
                          {ADMIN_NAV_LINKS.map((subItem) => {
                            const isSubActive = subItem.end
                              ? location.pathname === subItem.path
                              : location.pathname.startsWith(subItem.path);
                            return (
                              <Link
                                key={subItem.path}
                                to={subItem.path}
                                onClick={() => setAdminDropdownOpen(false)}
                                className={`px-3 py-1.5 transition-colors border whitespace-nowrap ${
                                  isSubActive
                                    ? 'bg-white text-black font-bold border-white'
                                    : 'border-white/20 text-white/70 hover:border-white/60 hover:text-white'
                                }`}
                              >
                                {subItem.label}
                                {subItem.hasBadge && unreadAlerts > 0 && (
                                  <span className="ml-1.5 px-1 bg-black text-white text-[12px] border border-white">
                                    {unreadAlerts}
                                  </span>
                                )}
                              </Link>
                            );
                          })}
                        </nav>
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`px-3 py-1 tracking-wider transition-colors ${
                    active
                      ? 'bg-white text-black font-bold'
                      : 'hover:text-white'
                  }`}
                  style={active ? {
                    clipPath: 'polygon(0 8%, 3% 0, 10% 5%, 100% 0, 97% 45%, 100% 60%, 97% 100%, 6% 95%, 0 100%, 2% 50%)'
                  } : { color: 'var(--bone-60)' }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        )}

        {/* Mobile hamburger */}
        {user && (
          <button
            className="md:hidden text-white border-2 border-white/40 bg-white/10 px-3.5 py-1.5 text-lg font-bold tracking-widest hover:bg-white hover:text-black transition-colors glitch select-none"
            data-corruptible="true"
            data-text={mobileNav ? '[X]' : '[=]'}
            onClick={() => setMobileNav(!mobileNav)}
            title="Toggle navigation channels"
          >
            {mobileNav ? '[X]' : '[=]'}
          </button>
        )}

        {/* User info + logout */}
        {user && (
          <div className="hidden md:flex items-center space-x-3 text-xs">
            <div className="text-right">
              <div style={{ color: 'var(--bone-80)' }}>{user.username}</div>
              <div style={{ color: 'var(--bone-35)' }}>{user.role}</div>
            </div>
            <button
              onClick={onLogout}
              className="btn-secondary text-sm"
              style={{ padding: '4px 12px' }}
            >
              EJECT
            </button>
          </div>
        )}
      </div>

      {/* Mobile channel overlay - section 9.3 */}
      {mobileNav && user && (
        <div className="md:hidden fixed inset-0 bg-black z-[200] font-terminal p-6 pt-16 overflow-y-auto">
          <button
            className="absolute top-4 right-4 text-white text-xl"
            onClick={() => setMobileNav(false)}
          >
            [X]
          </button>
          <div className="space-y-2">
            {navItems.map(item => {
              const active = item.isPrefix
                ? location.pathname.startsWith(item.path)
                : isActive(item.path);

              if (item.isPrefix) {
                return (
                  <div key={item.path} className="border-b" style={{ borderColor: 'var(--bone-15)' }}>
                    <div className="flex items-center justify-between">
                      <Link
                        to={item.path}
                        onClick={() => setMobileNav(false)}
                        className={`block flex-1 text-lg tracking-wider py-3 ${
                          active
                            ? 'bg-white text-black font-bold px-3'
                            : 'text-white/70 hover:text-white'
                        }`}
                      >
                        {item.label}
                      </Link>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setMobileAdminOpen((prev) => !prev);
                        }}
                        className="px-4 py-3 text-sm text-white/60 hover:text-white font-mono"
                        aria-label="Toggle channels dropdown"
                      >
                        {mobileAdminOpen ? '[▲ HIDE]' : '[▼ CHANNELS]'}
                      </button>
                    </div>

                    {/* Dropdown under CH 03 CONTROL ROOM */}
                    {mobileAdminOpen && (
                      <div className="py-2.5 px-2 bg-white/5 border-t border-white/10 my-1">
                        <div className="text-[11px] text-white/50 mb-2 font-mono">
                          FACILITY SURVEILLANCE &amp; ARCHIVE COMMAND:
                        </div>
                        <nav className="flex flex-wrap gap-1 text-xs pb-1">
                          {ADMIN_NAV_LINKS.map((subItem) => {
                            const isSubActive = subItem.end
                              ? location.pathname === subItem.path
                              : location.pathname.startsWith(subItem.path);
                            return (
                              <Link
                                key={subItem.path}
                                to={subItem.path}
                                onClick={() => setMobileNav(false)}
                                className={`px-3 py-1.5 transition-colors border whitespace-nowrap ${
                                  isSubActive
                                    ? 'bg-white text-black font-bold border-white'
                                    : 'border-white/20 text-white/70 hover:border-white/60 hover:text-white'
                                }`}
                              >
                                {subItem.label}
                                {subItem.hasBadge && unreadAlerts > 0 && (
                                  <span className="ml-1.5 px-1 bg-black text-white text-[12px] border border-white">
                                    {unreadAlerts}
                                  </span>
                                )}
                              </Link>
                            );
                          })}
                        </nav>
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileNav(false)}
                  className={`block text-lg tracking-wider py-3 border-b ${
                    active
                      ? 'bg-white text-black font-bold px-3'
                      : 'text-white/70 hover:text-white'
                  }`}
                  style={{ borderColor: 'var(--bone-15)' }}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
          <div className="mt-8 text-xs space-y-3" style={{ color: 'var(--bone-35)' }}>
            <div>{user.username} // {user.role}</div>
            <div className="flex items-center space-x-2 pt-2">
              <button
                type="button"
                onClick={() => { onOpenTour(); setMobileNav(false); }}
                className="btn-secondary text-xs px-3 py-1"
              >
                [ ? TOUR ]
              </button>
              <button
                type="button"
                onClick={handleDistortionToggle}
                className="btn-secondary text-xs px-3 py-1"
              >
                [VHS: {distLevel.toUpperCase()}]
              </button>
            </div>
            <button onClick={() => { onLogout(); setMobileNav(false); }} className="mt-4 block text-white/60 hover:text-white">
              EJECT
            </button>
          </div>
        </div>
      )}

      <div aria-hidden="true" style={{ height: '1px', background: 'var(--bone-15)' }} />
    </header>
  );
}
