import React, { useState, useEffect } from 'react';
import { api } from '../api';

export default function AnnouncementBanner() {
  const [announcements, setAnnouncements] = useState([]);
  const [dismissed, setDismissed] = useState(new Set());

  useEffect(() => {
    api('/announcements/active')
      .then((res) => {
        if (res.data) setAnnouncements(res.data);
      })
      .catch(() => {});
  }, []);

  const handleDismiss = (id) => {
    setDismissed((prev) => new Set([...prev, id]));
  };

  const activeList = announcements.filter((a) => !dismissed.has(a.id));
  if (activeList.length === 0) return null;

  return (
    <div className="font-terminal text-xs">
      {activeList.map((ann) => {
        const isCritical = ann.level === 'critical';
        const isWarning = ann.level === 'warning';

        return (
          <div
            key={ann.id}
            className={`flex items-center justify-between border-b px-4 py-2 ${
              isCritical
                ? 'bg-white text-black font-bold border-black'
                : isWarning
                ? 'bg-white/20 text-white border-white/40'
                : 'bg-white/10 text-white/90 border-white/20'
            }`}
          >
            <div className="flex items-center space-x-2">
              <span>[{ann.level.toUpperCase()}]</span>
              <span className="font-bold">{ann.title}:</span>
              <span className="font-typewriter">{ann.body}</span>
            </div>

            {!isCritical && (
              <button
                onClick={() => handleDismiss(ann.id)}
                className="ml-4 hover:opacity-70 text-xs tracking-wider"
              >
                [DISMISS]
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
