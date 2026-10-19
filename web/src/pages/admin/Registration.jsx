import React, { useState, useEffect } from 'react';
import { api } from '../../api';

export default function Registration() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const fetchStatus = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api('/admin/registration/status');
      if (res.success && res.data) {
        setStatus(res.data);
      }
    } catch (err) {
      setError(err.message || 'FAILED TO RETRIEVE ROSTER METADATA');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleReloadFromDisk = async () => {
    if (!window.confirm('CONFIRM RELOAD OF REGISTRATION ROSTER DATA FROM LOCAL DISK STORAGE?')) return;
    setUploading(true);
    setError('');
    setActionMsg('');
    try {
      const res = await api('/admin/registration/reload', { method: 'POST' });
      setActionMsg(res.message || 'ROSTER REFRESH COMPLETE.');
      fetchStatus();
    } catch (err) {
      setError(err.message || 'FAILED TO RELOAD ROSTER');
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) return;

    setUploading(true);
    setError('');
    setActionMsg('');
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await api('/admin/registration/reload', {
        method: 'POST',
        body: formData,
        isFormData: true,
      });

      setActionMsg(res.message || 'NEW ROSTER FILE LOADED INTO MEMORY.');
      setSelectedFile(null);
      fetchStatus();
    } catch (err) {
      setError(err.message || 'FAILED TO UPLOAD ROSTER');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border border-white/20 p-4 bg-black">
        <h2 className="text-xl font-bold tracking-widest">[ STUDENT ROSTER DATA REPOSITORY ]</h2>
        <p className="text-xs text-white/50 tracking-wider">
          ACADEMIC REGISTRATION LEDGER &amp; IN-MEMORY CACHE CONTROLS
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

      {/* Current Metadata Card */}
      {loading ? (
        <div className="py-12 text-center text-white/40 animate-pulse text-sm">
          -- SCANNING ROSTER CACHE IN MEMORY... --
        </div>
      ) : status ? (
        <div className="border border-white/30 p-5 bg-black clip-torn space-y-4">
          <div className="text-xs text-white/60 tracking-widest border-b border-white/10 pb-2">
            ACTIVE IN-MEMORY ROSTER METADATA
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
            <div className="border border-white/20 p-4 bg-white/5">
              <span className="text-white/40 block mb-1">RECORDED STUDENTS:</span>
              <span className="text-3xl font-bold text-white tracking-widest">
                {status.rowCount || 0}
              </span>
              <span className="text-[12px] text-white/40 block mt-1">INDEXED PROFILES</span>
            </div>

            <div className="border border-white/20 p-4 bg-white/5">
              <span className="text-white/40 block mb-1">LAST CACHE REFRESH:</span>
              <span className="text-sm font-bold text-white">
                {status.lastLoadedAt ? new Date(status.lastLoadedAt).toISOString().replace('T', ' ').substring(0, 19) : '--'}
              </span>
              <span className="text-[12px] text-white/40 block mt-1">UTC TIMESTAMP</span>
            </div>

            <div className="border border-white/20 p-4 bg-white/5">
              <span className="text-white/40 block mb-1">STORAGE TARGET:</span>
              <span className="text-xs font-bold text-white font-mono break-all">
                {status.sourceFile || 'data/registration_data.xlsx'}
              </span>
              <span className="text-[12px] text-white/40 block mt-1">LOCAL DISK PAYLOAD</span>
            </div>
          </div>

          {status.columns && (
            <div className="border border-white/20 p-3 bg-black">
              <span className="text-white/40 text-xs block mb-2 font-mono">DETECTED ROSTER SCHEMA FIELDS:</span>
              <div className="flex flex-wrap gap-2">
                {status.columns.map((col, idx) => (
                  <span key={idx} className="border border-white/30 px-2 py-0.5 text-[13px] font-mono text-white/80">
                    {col}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* Control Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Upload New Excel */}
        <div className="border border-white/30 p-5 bg-black clip-torn space-y-3">
          <div className="text-xs font-bold text-white tracking-widest border-b border-white/10 pb-2">
            [ UPLOAD REPLACEMENT ROSTER (.XLSX) ]
          </div>
          <p className="text-xs text-white/60">
            Upload an updated registration spreadsheet to instantly hot-reload in-memory student profiles and write to disk.
          </p>
          <form onSubmit={handleFileUpload} className="space-y-3">
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => setSelectedFile(e.target.files[0] || null)}
              className="w-full text-xs text-white/80 file:mr-3 file:py-1.5 file:px-3 file:border file:border-white file:text-xs file:bg-white file:text-black file:font-bold hover:file:bg-white/80 cursor-pointer"
            />
            <button
              type="submit"
              disabled={!selectedFile || uploading}
              className="w-full border border-white px-4 py-2 text-xs font-bold bg-white text-black hover:bg-white/80 disabled:opacity-30"
            >
              {uploading ? '[ COMMITTING ROSTER TO DISK... ]' : '[ INGEST & OVERWRITE ROSTER ]'}
            </button>
          </form>
        </div>

        {/* Reload Existing Disk File */}
        <div className="border border-white/30 p-5 bg-black clip-torn space-y-3 flex flex-col justify-between">
          <div>
            <div className="text-xs font-bold text-white tracking-widest border-b border-white/10 pb-2">
              [ RELOAD EXISTING DISK ROSTER ]
            </div>
            <p className="text-xs text-white/60 mt-2">
              Re-parse and reload the cached <code className="text-white">registration_data.xlsx</code> file directly
              from the server disk into memory without requiring an upload.
            </p>
          </div>
          <button
            onClick={handleReloadFromDisk}
            disabled={uploading}
            className="w-full border border-white/40 px-4 py-2 text-xs font-bold text-white hover:bg-white hover:text-black transition-colors disabled:opacity-30"
          >
            {uploading ? '[ SCANNING STORAGE... ]' : '[ FORCE MEMORY RELOAD ]'}
          </button>
        </div>
      </div>
    </div>
  );
}
