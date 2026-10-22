import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cycleDistortion, getDistortion } from '../settings/distortion';
import { api } from '../api';
import GlitchEye from './GlitchEye';

// Section 9.3: Navigation as tape OSD
// Top bar: REC CH 03 | live timestamp IST
// Below: logo + nav as plain text items, active = inverted slab with jagged edges
export default function Header({ user, onLogout, onOpenTour }) {
  const [timeStr, setTimeStr] = useState('');
  const [counter, setCounter] = useState(104);
  const [distLevel, setDistLevel] = useState(getDistortion());
  const [mobileNav, setMobileNav] = useState(false);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const location = useLocation();

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

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`px-3 py-1 tracking-wider transition-colors inline-flex items-center gap-1.5 ${
                    active
                      ? 'bg-white text-black font-bold'
                      : 'hover:text-white'
                  }`}
                  style={active ? {
                    clipPath: 'polygon(0 8%, 3% 0, 10% 5%, 100% 0, 97% 45%, 100% 60%, 97% 100%, 6% 95%, 0 100%, 2% 50%)'
                  } : { color: 'var(--bone-60)' }}
                >
                  <span>{item.label}</span>
                  {item.path === '/admin' && unreadAlerts > 0 && (
                    <span className="ml-1 px-1 bg-black text-white text-[11px] border border-white">
                      {unreadAlerts}
                    </span>
                  )}
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

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileNav(false)}
                  className={`flex items-center justify-between text-lg tracking-wider py-3 border-b ${
                    active
                      ? 'bg-white text-black font-bold px-3'
                      : 'text-white/70 hover:text-white'
                  }`}
                  style={{ borderColor: 'var(--bone-15)' }}
                >
                  <span>{item.label}</span>
                  {item.path === '/admin' && unreadAlerts > 0 && (
                    <span className="px-1.5 py-0.5 bg-red-600 text-white text-xs font-bold">
                      {unreadAlerts}
                    </span>
                  )}
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
