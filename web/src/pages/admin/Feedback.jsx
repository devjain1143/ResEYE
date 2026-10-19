import React, { useState, useEffect } from 'react';
import { api } from '../../api';

export default function Feedback() {
  const [currentQuery, setCurrentQuery] = useState(null);
  const [totalUnrated, setTotalUnrated] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  // Correction input state
  const [showCorrection, setShowCorrection] = useState(false);
  const [correctionInput, setCorrectionInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchNext = async () => {
    setLoading(true);
    setError('');
    setShowCorrection(false);
    setCorrectionInput('');
    try {
      const res = await api('/admin/feedback/next');
      if (res.success) {
        setCurrentQuery(res.data);
        setTotalUnrated(res.totalUnrated || 0);
      }
    } catch (err) {
      setError(err.message || 'FAILED TO RETRIEVE NEXT QUERY IN QUEUE');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNext();
  }, []);

  const handleRate = async (rating) => {
    if (!currentQuery) return;

    if (rating === 'bad' && !showCorrection) {
      setShowCorrection(true);
      return;
    }

    setSubmitting(true);
    setError('');
    setActionMsg('');
    try {
      const body = { rating };
      if (rating === 'bad' && correctionInput.trim()) {
        body.correction = correctionInput.trim();
      }

      const res = await api(`/admin/feedback/${currentQuery.id}/rate`, {
        method: 'POST',
        body,
      });

      setActionMsg(res.message || `QUERY #${currentQuery.id} EVALUATION LOGGED.`);
      fetchNext();
    } catch (err) {
      setError(err.message || 'EVALUATION REJECTION');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border border-white/20 p-4 bg-black">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-3 mb-2">
          <div>
            <h2 className="text-xl font-bold tracking-widest">[ GROUND TRUTH CURATION ]</h2>
            <p className="text-xs text-white/50 tracking-wider">
              DYNAMIC FEW-SHOT VECTOR MEMORY &amp; INTENT REINFORCEMENT
            </p>
          </div>
          <div className="text-xs text-white/60">
            UNREVIEWED IN QUEUE: <strong className="text-white">{totalUnrated}</strong>
          </div>
        </div>
        <p className="text-xs text-white/60">
          Mark AI query outputs as accurate or defective. Correcting defective intents dynamically updates
          the vector embedding memory to teach the model how to parse future queries correctly.
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

      {/* Triage Workspace */}
      {loading ? (
        <div className="py-12 text-center text-white/40 animate-pulse text-sm">
          -- LOADING NEXT PENDING QUERY... --
        </div>
      ) : !currentQuery ? (
        <div className="border border-white/20 p-12 text-center bg-black">
          <div className="text-base font-bold text-white mb-2">[ ALL QUERIES TRIAGED ]</div>
          <p className="text-xs text-white/50">
            No unrated natural language queries remain in the review queue.
          </p>
        </div>
      ) : (
        <div className="border border-white/30 p-6 bg-black clip-torn space-y-6">
          <div className="flex flex-wrap items-center justify-between border-b border-white/10 pb-3 text-xs text-white/40">
            <span>RECORD IDENTIFIER: #{currentQuery.id}</span>
            <span>
              TIMESTAMP: {currentQuery.timestamp ? new Date(currentQuery.timestamp).toISOString().replace('T', ' ').substring(0, 19) : '--'}
            </span>
            <span>OPERATOR: {currentQuery.web_user_id || currentQuery.user_id || 'ANONYMOUS'}</span>
          </div>

          {/* User Prompt */}
          <div>
            <div className="text-xs text-white/50 tracking-widest mb-1">PROMPT INQUIRY:</div>
            <div className="text-lg font-bold text-white font-mono bg-white/5 p-3 border border-white/20">
              &gt; {currentQuery.query_text}
            </div>
          </div>

          {/* Parsed Metadata */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
            <div className="border border-white/20 p-3">
              <span className="text-white/40 block mb-1">CLASSIFIED INTENT:</span>
              <span className="font-bold text-white text-sm">
                [{currentQuery.intent || 'UNKNOWN'}]
              </span>
            </div>
            <div className="border border-white/20 p-3">
              <span className="text-white/40 block mb-1">BATCH PARAM:</span>
              <span className="font-bold text-white text-sm">{currentQuery.batch || 'NONE'}</span>
            </div>
            <div className="border border-white/20 p-3">
              <span className="text-white/40 block mb-1">SEMESTER PARAM:</span>
              <span className="font-bold text-white text-sm">{currentQuery.semester || 'NONE'}</span>
            </div>
          </div>

          {/* AI Response Preview */}
          <div>
            <div className="text-xs text-white/50 tracking-widest mb-1">GENERATED SYNTHESIS:</div>
            <div className="text-xs text-white/80 font-serif bg-white/5 p-4 border border-white/20 whitespace-pre-wrap">
              {currentQuery.response || '[ NO GENERATED OUTPUT SAVED ]'}
            </div>
          </div>

          {/* Defective Correction Input Form */}
          {showCorrection && (
            <div className="border border-white/40 p-4 bg-white/5 space-y-3">
              <div className="text-xs font-bold text-white tracking-widest">
                [ PROVIDE INTENT CORRECTION ]
              </div>
              <p className="text-[13px] text-white/60">
                Enter shorthand (e.g. <code className="text-white">TOP_SCORER 2024 sem=2</code>) or valid JSON
                (e.g. <code className="text-white">{`{"intent":"TOP_SCORER","batch":"2024","semester":2}`}</code>).
              </p>
              <textarea
                rows={3}
                value={correctionInput}
                onChange={(e) => setCorrectionInput(e.target.value)}
                placeholder="TOP_SCORER 2024 sem=2"
                className="w-full bg-black border border-white/40 p-2 text-xs text-white font-mono focus:outline-none focus:border-white"
              />
              <div className="flex justify-end space-x-2 text-xs">
                <button
                  type="button"
                  onClick={() => setShowCorrection(false)}
                  className="border border-white/20 px-3 py-1 text-white/50 hover:text-white"
                >
                  [ CANCEL ]
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleRate('bad')}
                  className="border border-white px-4 py-1.5 bg-white text-black font-bold hover:bg-white/80"
                >
                  {submitting ? '[ UPDATING VECTOR DB... ]' : '[ SUBMIT CORRECTION & TRAIN ]'}
                </button>
              </div>
            </div>
          )}

          {/* Action Directives */}
          {!showCorrection && (
            <div className="flex flex-wrap items-center justify-between border-t border-white/10 pt-4 gap-3 text-xs">
              <button
                onClick={fetchNext}
                className="border border-white/20 px-4 py-2 text-white/50 hover:border-white/50 hover:text-white"
              >
                [ SKIP / NEXT RECORD ]
              </button>

              <div className="flex items-center space-x-3">
                <button
                  onClick={() => handleRate('bad')}
                  className="border border-white/40 px-5 py-2 hover:bg-white hover:text-black font-bold text-white"
                >
                  [ DEFECTIVE (BAD) ]
                </button>
                <button
                  onClick={() => handleRate('good')}
                  disabled={submitting}
                  className="border border-white px-6 py-2 bg-white text-black font-bold hover:bg-white/80"
                >
                  [ ACCURATE (GOOD) ]
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
