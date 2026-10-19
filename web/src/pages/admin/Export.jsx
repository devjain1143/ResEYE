import React, { useState } from 'react';
import { api, getAccessToken } from '../../api';

const TARGETS = [
  {
    id: 'users',
    title: 'OPERATOR IDENTITIES & ROLES',
    desc: 'All registered user profiles, status, roles, block reasons, and login records.',
  },
  {
    id: 'search-history',
    title: 'SCHOLAR SEARCH LOGS',
    desc: 'Audit trail of scholar number lookups, target students, and timestamps.',
  },
  {
    id: 'ai-history',
    title: 'AI INTEL INQUIRY LEDGER',
    desc: 'Natural language questions, classified intents, responses, and user ratings.',
  },
  {
    id: 'special',
    title: 'SURVEILLANCE WATCHLIST',
    desc: 'List of all flagged scholar numbers, admin notes, and surveillance timestamps.',
  },
  {
    id: 'feedback',
    title: 'GROUND TRUTH CORRECTIONS',
    desc: 'Curated intent corrections and few-shot vector dataset additions.',
  },
];

export default function Export() {
  const [downloading, setDownloading] = useState(null);
  const [error, setError] = useState('');

  const handleDownload = async (targetId, format) => {
    setDownloading(`${targetId}-${format}`);
    setError('');
    try {
      const token = getAccessToken();
      const res = await fetch(`/api/admin/export/${targetId}?format=${format}`, {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      });

      if (!res.ok) {
        throw new Error(`EXPORT FAILED: SERVER RETURNED CODE ${res.status}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${targetId}-${Date.now()}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (err) {
      setError(err.message || 'FAILED TO DOWNLOAD DATA DUMP');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border border-white/20 p-4 bg-black">
        <h2 className="text-xl font-bold tracking-widest">[ DATA ARCHIVE EXTRACTION ]</h2>
        <p className="text-xs text-white/50 tracking-wider">
          RAW REPOSITORY DUMPS FOR OFFLINE FORENSICS &amp; AUDITING
        </p>
      </div>

      {error && (
        <div className="border border-white/40 p-3 bg-black text-xs text-white">
          [ ERR ] {error}
        </div>
      )}

      {/* Target Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {TARGETS.map((t) => (
          <div key={t.id} className="border border-white/30 p-5 bg-black clip-torn space-y-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="font-bold text-sm tracking-wider text-white">
                &gt; {t.title}
              </span>
              <span className="text-[13px] font-mono text-white/40">[{t.id}]</span>
            </div>

            <p className="text-xs text-white/60 font-serif">
              {t.desc}
            </p>

            <div className="flex items-center justify-end space-x-2 pt-2 text-xs">
              <button
                onClick={() => handleDownload(t.id, 'csv')}
                disabled={downloading === `${t.id}-csv`}
                className="border border-white/40 px-3 py-1.5 hover:bg-white hover:text-black font-bold transition-colors disabled:opacity-30"
              >
                {downloading === `${t.id}-csv` ? '[ EXTRACTING... ]' : '[ EXPORT CSV ]'}
              </button>
              <button
                onClick={() => handleDownload(t.id, 'json')}
                disabled={downloading === `${t.id}-json`}
                className="border border-white px-3 py-1.5 bg-white text-black font-bold hover:bg-white/80 transition-colors disabled:opacity-30"
              >
                {downloading === `${t.id}-json` ? '[ EXTRACTING... ]' : '[ EXPORT JSON ]'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
