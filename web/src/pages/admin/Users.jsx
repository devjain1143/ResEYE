import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api';

export default function Users({ user: currentUser }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialStatus = searchParams.get('status') || '';

  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  // Dialog states for modal prompts
  const [selectedUser, setSelectedUser] = useState(null);
  const [dialogMode, setDialogMode] = useState(null); // 'warn' | 'block'
  const [inputReason, setInputReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchUsers = async (p = page, status = statusFilter, q = searchQuery) => {
    setLoading(true);
    setError('');
    try {
      const queryParams = new URLSearchParams();
      queryParams.set('page', p);
      if (status) queryParams.set('status', status);
      if (q) queryParams.set('q', q);

      const res = await api(`/admin/users?${queryParams.toString()}`);
      if (res.success && res.data) {
        setUsers(res.data.users || []);
        setTotal(res.data.total || 0);
        setPage(res.data.page || 1);
      }
    } catch (err) {
      setError(err.message || 'FAILED TO RETRIEVE OPERATOR LEDGER');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers(1, statusFilter, searchQuery);
  }, [statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchUsers(1, statusFilter, searchQuery);
  };

  const handleApprove = async (id) => {
    try {
      await api(`/admin/users/${id}`, {
        method: 'PATCH',
        body: { status: 'ACTIVE' },
      });
      setActionMsg(`OPERATOR APPROVED.`);
      fetchUsers(page, statusFilter, searchQuery);
    } catch (err) {
      setError(err.message || 'APPROVAL DIRECTIVE FAILED');
    }
  };

  const handleUnblock = async (id) => {
    try {
      await api(`/admin/users/${id}`, {
        method: 'PATCH',
        body: { status: 'ACTIVE' },
      });
      setActionMsg(`OPERATOR RESTORED TO ACTIVE STATUS.`);
      fetchUsers(page, statusFilter, searchQuery);
    } catch (err) {
      setError(err.message || 'UNBLOCK DIRECTIVE FAILED');
    }
  };

  const handleRoleToggle = async (targetUser) => {
    const newRole = targetUser.role === 'ADMIN' ? 'USER' : 'ADMIN';
    if (!window.confirm(`CONFIRM ROLE CHANGE: SET ${targetUser.email} TO ${newRole}?`)) {
      return;
    }
    try {
      await api(`/admin/users/${targetUser.id}`, {
        method: 'PATCH',
        body: { role: newRole },
      });
      setActionMsg(`ROLE UPDATED TO ${newRole}.`);
      fetchUsers(page, statusFilter, searchQuery);
    } catch (err) {
      setError(err.message || 'ROLE REASSIGNMENT FAILED');
    }
  };

  const handleDialogSubmit = async (e) => {
    e.preventDefault();
    if (!selectedUser || !dialogMode) return;
    setSubmitting(true);
    try {
      if (dialogMode === 'warn') {
        await api(`/admin/users/${selectedUser.id}/warn`, {
          method: 'POST',
          body: { message: inputReason },
        });
        setActionMsg(`FORMAL WARNING TRANSMITTED TO OPERATOR.`);
      } else if (dialogMode === 'block') {
        await api(`/admin/users/${selectedUser.id}`, {
          method: 'PATCH',
          body: {
            status: 'BLOCKED',
            blockedReason: inputReason || 'Security non-compliance',
          },
        });
        setActionMsg(`OPERATOR PRIVILEGES REVOKED AND SESSIONS EXPELLED.`);
      }
      setSelectedUser(null);
      setDialogMode(null);
      setInputReason('');
      fetchUsers(page, statusFilter, searchQuery);
    } catch (err) {
      setError(err.message || 'OPERATION FAILED');
    } finally {
      setSubmitting(false);
    }
  };

  const totalPages = Math.ceil(total / 20) || 1;

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="border border-white/20 p-4 bg-black">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-3 mb-4">
          <div>
            <h2 className="text-xl font-bold tracking-widest">[ OPERATOR REGISTRY ]</h2>
            <p className="text-xs text-white/50 tracking-wider">
              ACCESS AUTHORIZATION AND IDENTITY CONTROL
            </p>
          </div>

          <div className="text-xs text-white/60">
            REGISTERED IDENTITIES: <strong className="text-white">{total}</strong>
          </div>
        </div>

        {/* Filters and Search Bar */}
        <div className="flex flex-wrap items-center gap-3">
          <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2 min-w-[260px]">
            <input
              type="text"
              placeholder="SEARCH BY EMAIL OR USERNAME..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-black border border-white/30 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-white font-mono"
            />
            <button
              type="submit"
              className="border border-white/40 px-4 py-1.5 text-xs hover:bg-white hover:text-black font-bold"
            >
              [ SCAN ]
            </button>
          </form>

          {/* Status Select */}
          <div className="flex items-center space-x-2 text-xs">
            <span className="text-white/50">FILTER:</span>
            {['', 'PENDING', 'ACTIVE', 'BLOCKED'].map((st) => (
              <button
                key={st}
                onClick={() => {
                  setStatusFilter(st);
                  setSearchParams(st ? { status: st } : {});
                }}
                className={`px-3 py-1 border transition-colors ${
                  statusFilter === st
                    ? 'bg-white text-black font-bold border-white'
                    : 'border-white/20 text-white/70 hover:border-white/50'
                }`}
              >
                [{st || 'ALL'}]
              </button>
            ))}
          </div>
        </div>
      </div>

      {actionMsg && (
        <div className="border border-white/40 p-3 bg-black text-xs text-white flex justify-between">
          <span>[ OK ] {actionMsg}</span>
          <button onClick={() => setActionMsg('')} className="underline text-white/60">
            [ CLOSE ]
          </button>
        </div>
      )}

      {error && (
        <div className="border border-white/40 p-3 bg-black text-xs text-white">
          [ ERR ] {error}
        </div>
      )}

      {/* Users Table */}
      {loading ? (
        <div className="py-12 text-center text-white/40 animate-pulse text-sm">
          -- SCANNING OPERATOR MATRICES... --
        </div>
      ) : users.length === 0 ? (
        <div className="border border-white/20 p-8 text-center text-white/40 text-xs">
          [ NO IDENTITIES LOCATED MATCHING CRITERIA ]
        </div>
      ) : (
        <div className="border border-white/30 overflow-x-auto bg-black">
          <table className="w-full text-left text-xs font-mono border-collapse">
            <thead>
              <tr className="border-b border-white/20 bg-white/5 text-white/60">
                <th className="p-3">EMAIL / IDENTIFIER</th>
                <th className="p-3">ROLE</th>
                <th className="p-3">STATUS</th>
                <th className="p-3">REGISTERED</th>
                <th className="p-3">LAST SEEN</th>
                <th className="p-3 text-right">DIRECTIVES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-white/5 transition-colors">
                  <td className="p-3">
                    <div className="font-bold text-white tracking-wide">{u.email}</div>
                    <div className="text-[13px] text-white/40">{u.username || '--'}</div>
                    {u.blockedReason && (
                      <div className="text-[12px] text-white/60 mt-1 italic">
                        REASON: {u.blockedReason}
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    <span
                      className={`px-1.5 py-0.5 border text-[13px] font-bold ${
                        u.role === 'ADMIN'
                          ? 'border-white bg-white text-black'
                          : 'border-white/30 text-white/70'
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="p-3">
                    <span
                      className={`px-1.5 py-0.5 border text-[13px] ${
                        u.status === 'ACTIVE'
                          ? 'border-white/60 text-white'
                          : u.status === 'PENDING'
                          ? 'border-white bg-white/20 text-white animate-pulse'
                          : 'border-white/30 text-white/40 line-through'
                      }`}
                    >
                      [{u.status}]
                    </span>
                  </td>
                  <td className="p-3 text-white/50 whitespace-nowrap">
                    {u.createdAt ? new Date(u.createdAt).toISOString().substring(0, 10) : '--'}
                  </td>
                  <td className="p-3 text-white/50 whitespace-nowrap">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toISOString().substring(0, 10) : '--'}
                  </td>
                  <td className="p-3 text-right whitespace-nowrap space-x-1">
                    {u.status === 'PENDING' && (
                      <button
                        onClick={() => handleApprove(u.id)}
                        className="border border-white px-2 py-1 bg-white text-black font-bold hover:bg-white/80"
                      >
                        [ APPROVE ]
                      </button>
                    )}

                    {u.status === 'ACTIVE' && (
                      <>
                        <button
                          onClick={() => {
                            setSelectedUser(u);
                            setDialogMode('warn');
                            setInputReason('');
                          }}
                          className="border border-white/30 px-2 py-1 hover:border-white text-white/80"
                        >
                          [ WARN ]
                        </button>
                        <button
                          onClick={() => {
                            setSelectedUser(u);
                            setDialogMode('block');
                            setInputReason('');
                          }}
                          className="border border-white/40 px-2 py-1 hover:bg-white hover:text-black font-bold"
                        >
                          [ REVOKE ]
                        </button>
                      </>
                    )}

                    {u.status === 'BLOCKED' && (
                      <button
                        onClick={() => handleUnblock(u.id)}
                        className="border border-white/40 px-2 py-1 hover:border-white text-white"
                      >
                        [ RESTORE ]
                      </button>
                    )}

                    <button
                      onClick={() => handleRoleToggle(u)}
                      className="border border-white/20 px-2 py-1 hover:border-white/60 text-white/50 text-[12px]"
                      title="Toggle between USER and ADMIN"
                    >
                      [ ROLE: {u.role === 'ADMIN' ? 'DEMOTE' : 'PROMOTE'} ]
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center border border-white/20 p-3 bg-black text-xs">
          <button
            disabled={page <= 1}
            onClick={() => fetchUsers(page - 1, statusFilter, searchQuery)}
            className="border border-white/30 px-3 py-1 hover:border-white disabled:opacity-20"
          >
            &lt; PREV
          </button>
          <span className="text-white/60">
            PAGE {page} OF {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => fetchUsers(page + 1, statusFilter, searchQuery)}
            className="border border-white/30 px-3 py-1 hover:border-white disabled:opacity-20"
          >
            NEXT &gt;
          </button>
        </div>
      )}

      {/* Action Dialog Modal */}
      {selectedUser && dialogMode && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-black border border-white max-w-lg w-full p-6 space-y-4 clip-torn">
            <div className="border-b border-white/20 pb-2">
              <h3 className="text-base font-bold tracking-widest">
                {dialogMode === 'warn' ? '[ TRANSMIT DIRECTIVE WARNING ]' : '[ REVOKE ACCESS PRIVILEGES ]'}
              </h3>
              <p className="text-xs text-white/50 font-mono mt-1">
                TARGET: {selectedUser.email} ({selectedUser.id})
              </p>
            </div>

            <form onSubmit={handleDialogSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-white/70 mb-1 font-mono">
                  {dialogMode === 'warn'
                    ? 'SECURITY NOTICE TEXT (SENT AS DIRECT NOTIFICATION):'
                    : 'REVOCATION JUSTIFICATION (RECORDED IN AUDIT LEDGER):'}
                </label>
                <textarea
                  required
                  rows={3}
                  value={inputReason}
                  onChange={(e) => setInputReason(e.target.value)}
                  placeholder={
                    dialogMode === 'warn'
                      ? 'e.g. Excessive automated queries detected. Further scraping will terminate access.'
                      : 'e.g. Systematic data enumeration or scraping activity.'
                  }
                  className="w-full bg-black border border-white/30 p-2 text-xs text-white focus:outline-none focus:border-white font-mono"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedUser(null);
                    setDialogMode(null);
                  }}
                  className="border border-white/30 px-4 py-2 hover:border-white text-white/60"
                >
                  [ CANCEL ]
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="border border-white px-5 py-2 bg-white text-black font-bold hover:bg-white/80 disabled:opacity-40"
                >
                  {submitting ? '[ TRANSMITTING... ]' : '[ EXECUTE DIRECTIVE ]'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
