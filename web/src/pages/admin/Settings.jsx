import React, { useState, useEffect } from 'react';
import { api } from '../../api';

export default function Settings() {
  const [settings, setSettings] = useState({
    signup_mode: 'approval',
    ai_daily_limit: 15,
    ai_burst_per_min: 5,
    lookup_daily_limit: 100,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  const fetchSettings = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api('/admin/settings');
      if (res.success && res.data) {
        setSettings({
          signup_mode: res.data.signup_mode || 'approval',
          ai_daily_limit: res.data.ai_daily_limit !== undefined ? res.data.ai_daily_limit : 15,
          ai_burst_per_min: res.data.ai_burst_per_min !== undefined ? res.data.ai_burst_per_min : 5,
          lookup_daily_limit: res.data.lookup_daily_limit !== undefined ? res.data.lookup_daily_limit : 100,
        });
      }
    } catch (err) {
      setError(err.message || 'FAILED TO LOAD SYSTEM PROTOCOLS');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setActionMsg('');
    try {
      const res = await api('/admin/settings', {
        method: 'PATCH',
        body: {
          signup_mode: settings.signup_mode,
          ai_daily_limit: parseInt(settings.ai_daily_limit, 10),
          ai_burst_per_min: parseInt(settings.ai_burst_per_min, 10),
          lookup_daily_limit: parseInt(settings.lookup_daily_limit, 10),
        },
      });
      setActionMsg(res.message || 'SYSTEM CONFIGURATION COMMITTED TO DATABASE.');
      fetchSettings();
    } catch (err) {
      setError(err.message || 'FAILED TO SAVE PROTOCOLS');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border border-white/20 p-4 bg-black">
        <h2 className="text-xl font-bold tracking-widest">[ SECURITY PROTOCOLS &amp; QUOTAS ]</h2>
        <p className="text-xs text-white/50 tracking-wider">
          GOVERN ACCESS RULES, RATE THRESHOLDS, AND ENROLLMENT MODES
        </p>
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

      {loading ? (
        <div className="py-12 text-center text-white/40 animate-pulse text-sm">
          -- SCANNING PROTOCOL REGISTERS... --
        </div>
      ) : (
        <form onSubmit={handleSave} className="border border-white/30 p-6 bg-black clip-torn space-y-6">
          {/* Signup Enrollment Mode */}
          <div className="border-b border-white/10 pb-5">
            <label className="block text-xs font-bold text-white tracking-widest mb-1">
              OPERATOR REGISTRATION ENROLLMENT POLICY
            </label>
            <p className="text-xs text-white/50 mb-3">
              Defines whether new institutional email registrations require administrator clearance.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { val: 'approval', label: 'APPROVAL REQUIRED', desc: 'New accounts held in PENDING state until admin approval.' },
                { val: 'open', label: 'OPEN REGISTRATION', desc: 'Valid institutional emails granted immediate ACTIVE access.' },
                { val: 'closed', label: 'CLOSED LOCKDOWN', desc: 'All new account registrations strictly forbidden.' },
              ].map((opt) => (
                <div
                  key={opt.val}
                  onClick={() => setSettings({ ...settings, signup_mode: opt.val })}
                  className={`border p-3 cursor-pointer transition-colors ${
                    settings.signup_mode === opt.val
                      ? 'border-white bg-white/10'
                      : 'border-white/20 hover:border-white/40'
                  }`}
                >
                  <div className="flex items-center space-x-2 text-xs font-bold font-mono">
                    <span className="text-white">
                      {settings.signup_mode === opt.val ? '[ X ]' : '[   ]'}
                    </span>
                    <span>{opt.label}</span>
                  </div>
                  <p className="text-[13px] text-white/50 font-serif mt-1">
                    {opt.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Quotas & Burst Limits */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-white/10 pb-5">
            <div>
              <label className="block text-xs font-bold text-white tracking-widest mb-1">
                AI DAILY INQUIRY QUOTA
              </label>
              <p className="text-[13px] text-white/50 mb-2">
                Maximum natural language inquiries allowed per active user per day.
              </p>
              <input
                type="number"
                min="1"
                max="500"
                value={settings.ai_daily_limit}
                onChange={(e) => setSettings({ ...settings, ai_daily_limit: e.target.value })}
                className="w-full bg-black border border-white/40 px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-white tracking-widest mb-1">
                AI BURST VELOCITY LIMIT
              </label>
              <p className="text-[13px] text-white/50 mb-2">
                Maximum AI queries allowed in a 60-second window before throttling.
              </p>
              <input
                type="number"
                min="1"
                max="60"
                value={settings.ai_burst_per_min}
                onChange={(e) => setSettings({ ...settings, ai_burst_per_min: e.target.value })}
                className="w-full bg-black border border-white/40 px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-white tracking-widest mb-1">
                STUDENT LOOKUP DAILY QUOTA
              </label>
              <p className="text-[13px] text-white/50 mb-2">
                Maximum scholar record queries permitted per user per day.
              </p>
              <input
                type="number"
                min="1"
                max="1000"
                value={settings.lookup_daily_limit}
                onChange={(e) => setSettings({ ...settings, lookup_daily_limit: e.target.value })}
                className="w-full bg-black border border-white/40 px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-white"
              />
            </div>
          </div>

          {/* Action Row */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="border border-white px-6 py-2.5 text-xs font-bold bg-white text-black hover:bg-white/80 transition-colors disabled:opacity-40"
            >
              {saving ? '[ COMMITTING PROTOCOLS... ]' : '[ COMMIT SYSTEM PROTOCOLS ]'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
