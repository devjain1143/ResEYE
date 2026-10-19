import React, { useState } from 'react';
import { api } from '../../api';

const PRESETS = [
  {
    name: 'TOP SCORER (BATCH 2024, SEM 2)',
    json: JSON.stringify({ intent: 'TOP_SCORER', batch: '2024', semester: 2 }, null, 2),
  },
  {
    name: 'PASS PERCENTAGE (BATCH 2024, SEM 2)',
    json: JSON.stringify({ intent: 'PASS_PERCENTAGE', batch: '2024', semester: 2 }, null, 2),
  },
  {
    name: 'FAIL COUNT (BATCH 2024, SEM 2)',
    json: JSON.stringify({ intent: 'FAIL_COUNT', batch: '2024', semester: 2 }, null, 2),
  },
  {
    name: 'SGPA RANGE (BATCH 2024, SEM 2, > 8.5)',
    json: JSON.stringify({ intent: 'SGPA_RANGE', batch: '2024', semester: 2, minSpi: 8.5 }, null, 2),
  },
  {
    name: 'BATCH SUMMARY (BATCH 2024, SEM 2)',
    json: JSON.stringify({ intent: 'BATCH_SUMMARY', batch: '2024', semester: 2 }, null, 2),
  },
];

export default function NlqDebug() {
  const [inputJson, setInputJson] = useState(PRESETS[0].json);
  const [output, setOutput] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleExecute = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setOutput(null);

    try {
      let parsed;
      try {
        parsed = JSON.parse(inputJson);
      } catch (err) {
        throw new Error(`INVALID JSON SYNTAX: ${err.message}`);
      }

      const res = await api('/admin/nlq-debug', {
        method: 'POST',
        body: { json: parsed },
      });

      if (res.success && res.data) {
        setOutput(res.data);
      }
    } catch (err) {
      setError(err.message || 'NLQ DEBUG EXECUTION REJECTED');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border border-white/20 p-4 bg-black">
        <h2 className="text-xl font-bold tracking-widest">[ NLQ SIMULATION &amp; DEBUG BENCH ]</h2>
        <p className="text-xs text-white/50 tracking-wider">
          TEST INTENT VALIDATION AND POSTGRESQL DATA EXECUTOR DIRECTLY
        </p>
      </div>

      {error && (
        <div className="border border-white/40 p-3 bg-black text-xs text-white">
          [ ERR ] {error}
        </div>
      )}

      {/* Preset Quick Selectors */}
      <div className="border border-white/20 p-3 bg-black text-xs flex flex-wrap items-center gap-2">
        <span className="text-white/50">PRESET TEMPLATES:</span>
        {PRESETS.map((p, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setInputJson(p.json)}
            className="border border-white/30 px-2.5 py-1 hover:border-white hover:text-white text-white/70 font-mono text-[13px]"
          >
            [{p.name}]
          </button>
        ))}
      </div>

      {/* Editor & Output Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Input Form */}
        <form onSubmit={handleExecute} className="border border-white/30 p-5 bg-black clip-torn space-y-3">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <span className="text-xs font-bold text-white tracking-widest">
              INTENT PAYLOAD JSON
            </span>
            <span className="text-[13px] font-mono text-white/40">ZOD SCHEMA VALIDATED</span>
          </div>

          <textarea
            required
            rows={14}
            value={inputJson}
            onChange={(e) => setInputJson(e.target.value)}
            className="w-full bg-black border border-white/40 p-3 text-xs text-white font-mono focus:outline-none focus:border-white leading-relaxed"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full border border-white px-4 py-2.5 text-xs font-bold bg-white text-black hover:bg-white/80 transition-colors disabled:opacity-40"
          >
            {loading ? '[ RUNNING SIMULATION ON DATABASE... ]' : '[ EXECUTE INTENT SIMULATION ]'}
          </button>
        </form>

        {/* Output Panel */}
        <div className="border border-white/30 p-5 bg-black clip-torn space-y-3 flex flex-col">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <span className="text-xs font-bold text-white tracking-widest">
              EXECUTION TELEMETRY RESULT
            </span>
            {output && (
              <span className="text-[13px] font-mono text-white/70">
                STATUS: {output.executionResult?.success ? '[ SUCCESS ]' : '[ REJECTED ]'}
              </span>
            )}
          </div>

          <div className="flex-1 bg-white/5 border border-white/20 p-3 text-xs font-mono overflow-auto max-h-[420px] whitespace-pre-wrap">
            {output ? (
              JSON.stringify(output, null, 2)
            ) : (
              <span className="text-white/30">
                -- AWAITING INTENT SIMULATION DISPATCH --
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
