import React, { useState, useEffect } from 'react';
import { api } from '../../api';

export default function SpecialScholars() {
  const [list, setList] = useState([]);
  const [pinMap, setPinMap] = useState({});
  const [expandedScholar, setExpandedScholar] = useState(null);
  const [scholarNo, setScholarNo] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  const fetchSpecial = async () => {
    setLoading(true);
    setError('');
    try {
      const [res, pinRes] = await Promise.all([
        api('/admin/special'),
        api('/admin/favorites/special-monitors').catch(() => null)
      ]);
      if (res.success && res.data) {
        setList(res.data);
      }
      if (pinRes && pinRes.success && pinRes.data) {
        const map = {};
        for (const item of pinRes.data) {
          map[item.scholar_no?.toUpperCase()] = item.harvesters || [];
        }
        setPinMap(map);
      }
    } catch (err) {
      setError(err.message || 'FAILED TO LOAD SURVEILLANCE ROSTER');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSpecial();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!scholarNo.trim()) return;

    setError('');
    setActionMsg('');
    try {
      const res = await api('/admin/special', {
        method: 'POST',
        body: { scholarNo: scholarNo.trim(), note: note.trim() },
      });
      setActionMsg(res.message || 'SCHOLAR MARKED FOR SURVEILLANCE');
      setScholarNo('');
      setNote('');
      fetchSpecial();
    } catch (err) {
      setError(err.message || 'FAILED TO ADD TO SURVEILLANCE LIST');
    }
  };

  const handleRemove = async (targetScholar) => {
    if (!window.confirm(`CONFIRM REMOVAL: CEASE SURVEILLANCE ON ${targetScholar}?`)) return;
    setError('');
    setActionMsg('');
    try {
      const res = await api(`/admin/special/${encodeURIComponent(targetScholar)}`, {
        method: 'DELETE',
      });
      setActionMsg(res.message || 'SCHOLAR UNTRACKED');
      fetchSpecial();
    } catch (err) {
      setError(err.message || 'FAILED TO CEASE SURVEILLANCE');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border border-white/20 p-4 bg-black">
        <h2 className="text-xl font-bold tracking-widest">[ SURVEILLANCE WATCHLIST ]</h2>
        <p className="text-xs text-white/50 tracking-wider">
          TARGETED SCHOLAR IDENTIFIERS MONITORED FOR SEARCH INCIDENTS
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

      {/* Add New Tracked Scholar */}
      <div className="border border-white/30 p-4 bg-black clip-torn">
        <div className="text-xs text-white/60 tracking-widest mb-3 border-b border-white/10 pb-2">
          FLAG SCHOLAR FOR SURVEILLANCE LOGGING
        </div>

        <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-[13px] text-white/50 mb-1">SCHOLAR NUMBER *</label>
            <input
              type="text"
              required
              placeholder="e.g. 24U010018"
              value={scholarNo}
              onChange={(e) => setScholarNo(e.target.value.toUpperCase())}
              className="w-full bg-black border border-white/30 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-white font-mono uppercase"
            />
          </div>

          <div>
            <label className="block text-[13px] text-white/50 mb-1">SURVEILLANCE NOTE / TAG</label>
            <input
              type="text"
              placeholder="e.g. High profile inquiry target"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full bg-black border border-white/30 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-white font-mono"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className="w-full border border-white px-4 py-2 text-xs font-bold bg-white text-black hover:bg-white/80"
            >
              [ + ENGAGE SURVEILLANCE ]
            </button>
          </div>
        </form>
      </div>

      {/* Table of Tracked Scholars */}
      {loading ? (
        <div className="py-12 text-center text-white/40 animate-pulse text-sm">
          -- SCANNING WATCHLIST LEDGER... --
        </div>
      ) : list.length === 0 ? (
        <div className="border border-white/20 p-8 text-center text-white/40 text-xs">
          [ NO SCHOLAR IDENTIFIERS ACTIVELY WATCHED ]
        </div>
      ) : (
        <div className="border border-white/30 overflow-x-auto bg-black">
          <table className="w-full text-left text-xs font-mono border-collapse">
            <thead>
              <tr className="border-b border-white/20 bg-white/5 text-white/60">
                <th className="p-3">SCHOLAR NUMBER</th>
                <th className="p-3">TAG / CLASSIFICATION</th>
                <th className="p-3">PINNED BY (OPERATORS)</th>
                <th className="p-3">ENGAGED BY</th>
                <th className="p-3">ENGAGED AT</th>
                <th className="p-3 text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {list.map((item) => {
                const harvesters = pinMap[item.scholar_no?.toUpperCase()] || [];
                const isExpanded = expandedScholar === item.scholar_no;
                return (
                  <React.Fragment key={item.scholar_no}>
                    <tr className={`hover:bg-white/5 transition-colors ${harvesters.length > 0 ? 'bg-white/5' : ''}`}>
                      <td className="p-3 font-bold text-white tracking-widest text-sm">
                        {item.scholar_no}
                      </td>
                      <td className="p-3 text-white/80 font-serif">
                        {item.note || '--'}
                      </td>
                      <td className="p-3">
                        {harvesters.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => setExpandedScholar(isExpanded ? null : item.scholar_no)}
                            className="flex items-center space-x-1.5 border border-white px-2 py-0.5 bg-white/20 text-white hover:bg-white hover:text-black font-bold text-[12px]"
                          >
                            <span className="h-1.5 w-1.5 bg-white rounded-full animate-ping mr-1" />
                            <span>{harvesters.length} OPERATOR(S) PINNED</span>
                            <span>{isExpanded ? '[-]' : '[+]'}</span>
                          </button>
                        ) : (
                          <span className="text-white/30 text-[12px]">0 PINS</span>
                        )}
                      </td>
                      <td className="p-3 text-white/40">
                        {item.added_by || 'SYS_INIT'}
                      </td>
                      <td className="p-3 text-white/40 whitespace-nowrap">
                        {item.added_at ? new Date(item.added_at).toISOString().substring(0, 19).replace('T', ' ') : '--'}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleRemove(item.scholar_no)}
                          className="border border-white/30 px-3 py-1 text-white/70 hover:border-white hover:text-white"
                        >
                          [ CEASE WATCH ]
                        </button>
                      </td>
                    </tr>
                    {isExpanded && harvesters.length > 0 && (
                      <tr className="bg-black border-b border-white/20">
                        <td colSpan="6" className="p-4 pl-8">
                          <div className="border-l-2 border-white pl-3 space-y-2">
                            <div className="text-[13px] font-bold tracking-wider text-white">
                              // INTERCEPTED HARVESTERS FOR {item.scholar_no}:
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {harvesters.map((h, hIdx) => (
                                <div key={hIdx} className="border border-white/20 p-2 bg-white/5 text-[13px]">
                                  <div className="text-white font-bold">{h.username}</div>
                                  <div className="text-white/60">{h.email}</div>
                                  <div className="text-white/40 text-[12px] mt-1">
                                    PINNED: {new Date(h.pinnedAt).toLocaleString()} IST
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
