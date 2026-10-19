import React, { useState, useEffect } from 'react';
import { api } from '../../api';

export default function Announcements() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  // Form states
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [level, setLevel] = useState('info');
  const [expiresAt, setExpiresAt] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchAnnouncements = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api('/admin/announcements');
      if (res.success && res.data) {
        setList(res.data);
      }
    } catch (err) {
      setError(err.message || 'FAILED TO RETRIEVE BROADCAST ARCHIVE');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;

    setSubmitting(true);
    setError('');
    setActionMsg('');
    try {
      await api('/admin/announcements', {
        method: 'POST',
        body: {
          title: title.trim(),
          body: body.trim(),
          level,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        },
      });
      setActionMsg('BROADCAST TRANSMITTED TO TERMINAL SCREENS.');
      setTitle('');
      setBody('');
      setExpiresAt('');
      fetchAnnouncements();
    } catch (err) {
      setError(err.message || 'FAILED TO TRANSMIT BROADCAST');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (item) => {
    try {
      await api(`/admin/announcements/${item.id}`, {
        method: 'PATCH',
        body: { active: !item.active },
      });
      setActionMsg(`BROADCAST #${item.id} ${!item.active ? 'ACTIVATED' : 'DEACTIVATED'}.`);
      fetchAnnouncements();
    } catch (err) {
      setError(err.message || 'FAILED TO UPDATE BROADCAST');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border border-white/20 p-4 bg-black">
        <h2 className="text-xl font-bold tracking-widest">[ SYSTEM BROADCASTS &amp; DIRECTIVES ]</h2>
        <p className="text-xs text-white/50 tracking-wider">
          GLOBAL NOTICES DISPLAYED ON OPERATOR TERMINAL MONITORS
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

      {/* Create Broadcast Form */}
      <div className="border border-white/30 p-5 bg-black clip-torn space-y-4">
        <div className="text-xs text-white/60 tracking-widest border-b border-white/10 pb-2">
          AUTHOR NEW TERMINAL BROADCAST
        </div>

        <form onSubmit={handleCreate} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="block text-[13px] text-white/50 mb-1">BROADCAST TITLE *</label>
              <input
                type="text"
                required
                placeholder="e.g. SEMESTER GRADE TRANSCRIPTS COMMITTED TO DISK"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-black border border-white/30 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-white font-mono"
              />
            </div>

            <div>
              <label className="block text-[13px] text-white/50 mb-1">SEVERITY LEVEL</label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="w-full bg-black border border-white/30 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-white font-mono"
              >
                <option value="info">INFO // ADVISORY</option>
                <option value="warning">WARNING // CAUTION</option>
                <option value="critical">CRITICAL // LOCKDOWN</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[13px] text-white/50 mb-1">BODY CONTENT *</label>
            <textarea
              required
              rows={3}
              placeholder="Detailed notification text rendered inside the terminal marquee..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full bg-black border border-white/30 p-2 text-xs text-white focus:outline-none focus:border-white font-mono"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
            <div>
              <label className="block text-[13px] text-white/50 mb-1">EXPIRY DATETIME (OPTIONAL)</label>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full bg-black border border-white/30 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-white font-mono"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="border border-white px-6 py-2 text-xs font-bold bg-white text-black hover:bg-white/80 disabled:opacity-40"
              >
                {submitting ? '[ TRANSMITTING... ]' : '[ + BROADCAST DIRECTIVE ]'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* List of Existing Broadcasts */}
      {loading ? (
        <div className="py-12 text-center text-white/40 animate-pulse text-sm">
          -- SCANNING BROADCAST LOGS... --
        </div>
      ) : list.length === 0 ? (
        <div className="border border-white/20 p-8 text-center text-white/40 text-xs">
          [ NO BROADCASTS ARCHIVED ]
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((item) => (
            <div
              key={item.id}
              className={`border p-4 bg-black clip-torn transition-colors ${
                item.active ? 'border-white/40' : 'border-white/10 opacity-50'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between border-b border-white/10 pb-2 mb-2 text-xs font-mono">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-white tracking-wider">
                    BROADCAST #{item.id} // [{item.level.toUpperCase()}]
                  </span>
                  <span
                    className={`px-1.5 py-0.2 border text-[12px] ${
                      item.active
                        ? 'border-white bg-white/20 text-white font-bold'
                        : 'border-white/20 text-white/40'
                    }`}
                  >
                    [{item.active ? 'TRANSMITTING' : 'SILENCED'}]
                  </span>
                </div>
                <div className="text-white/40">
                  POSTED: {item.created_at ? new Date(item.created_at).toISOString().substring(0, 10) : '--'}
                  {item.expires_at && ` | EXPIRES: ${new Date(item.expires_at).toISOString().substring(0, 10)}`}
                </div>
              </div>

              <div className="text-sm font-bold text-white mb-1 font-mono">
                {item.title}
              </div>

              <div className="text-xs text-white/80 font-serif mb-3 whitespace-pre-wrap">
                {item.body}
              </div>

              <div className="flex justify-end border-t border-white/10 pt-2 text-xs">
                <button
                  onClick={() => handleToggleActive(item)}
                  className={`border px-3 py-1 transition-colors ${
                    item.active
                      ? 'border-white/40 text-white/70 hover:border-white hover:text-white'
                      : 'border-white bg-white text-black font-bold hover:bg-white/80'
                  }`}
                >
                  [{item.active ? 'SILENCE BROADCAST' : 'REACTIVATE BROADCAST'}]
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
