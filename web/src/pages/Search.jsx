import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Turnstile } from '@marsidev/react-turnstile';
import { api } from '../api';
import StudentCard from '../components/StudentCard';
import Mark from '../marks/Mark';

// Section 10.4: Search ("Pull a tape")
// Section 10.6: AI assistant ("The archive speaks") - transcript, not chat bubbles

export default function Search({ user }) {
  const [activeTab, setActiveTab] = useState('student');

  // Student search state
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [searchResults, setSearchResults] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentLoading, setStudentLoading] = useState(false);
  const [studentError, setStudentError] = useState('');
  const [pinnedScholarNos, setPinnedScholarNos] = useState([]);

  // Post-search attribute filters
  const [filterBranch, setFilterBranch] = useState('');
  const [filterDegree, setFilterDegree] = useState('');
  const [filterBatch, setFilterBatch] = useState('');

  // Background captcha state
  const turnstileRef = useRef(null);
  const [captchaActive, setCaptchaActive] = useState(false);
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const verificationPromiseRef = useRef(null);

  const triggerBackgroundCaptcha = () => {
    if (user?.role === 'ADMIN' || captchaVerified) return;
    if (!captchaActive) {
      setCaptchaActive(true);
    }
  };

  const handleTurnstileSuccess = async (token) => {
    if (!token) return;
    try {
      const p = api('/human/verify', {
        method: 'POST',
        body: { turnstileToken: token },
        retry: false
      });
      verificationPromiseRef.current = p;
      await p;
      setCaptchaVerified(true);
    } catch {
      turnstileRef.current?.reset();
    }
  };

  // AI assistant state
  const [aiQuery, setAiQuery] = useState('');
  const [aiHistory, setAiHistory] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiQuota, setAiQuota] = useState(null);
  const [aiError, setAiError] = useState('');

  const fetchAiQuota = async () => {
    try {
      const res = await api('/ai/quota');
      if (res.data) setAiQuota(res.data);
    } catch {}
  };

  const fetchPinnedIds = async () => {
    try {
      const res = await api('/favorites/ids');
      if (res && res.data) {
        setPinnedScholarNos(res.data.map(id => id.toUpperCase()));
      }
    } catch {}
  };

  useEffect(() => {
    fetchAiQuota();
    fetchPinnedIds();
    triggerBackgroundCaptcha();
  }, [activeTab]);

  const handleStudentSearch = async (e, targetPage = 1, customFilters = null) => {
    if (e) e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;

    // Await background captcha if in-flight to prevent 428 and eliminate search lag
    if (verificationPromiseRef.current) {
      try {
        await verificationPromiseRef.current;
      } catch {}
    }

    setStudentLoading(true);
    setStudentError('');
    setSelectedStudent(null);

    const isScholar = /^\d{2}[A-Za-z0-9]+/i.test(q) && q.length >= 8;

    try {
      if (isScholar) {
        const res = await api(`/students/${q}`);
        setSelectedStudent(res.data);
      } else {
        const branchVal = customFilters ? customFilters.branch : filterBranch;
        const degreeVal = customFilters ? customFilters.degree : filterDegree;
        const batchVal = customFilters ? customFilters.batch : filterBatch;

        const params = new URLSearchParams({
          q,
          page: targetPage.toString()
        });
        if (branchVal) params.set('branch', branchVal);
        if (degreeVal) params.set('degree', degreeVal);
        if (batchVal) params.set('batch', batchVal);

        const res = await api(`/students/search?${params.toString()}`);
        if (res.data?.total === 1 && res.data?.results?.length === 1 && targetPage === 1) {
          if (res.data.studentCard) {
            setSelectedStudent(res.data.studentCard);
            setSearchResults(null);
          } else {
            const singleScholar = res.data.results[0].scholar_no;
            const fullRes = await api(`/students/${singleScholar}`);
            setSelectedStudent(fullRes.data);
            setSearchResults(null);
          }
        } else {
          setSearchResults(res.data);
          setPage(targetPage);
        }
      }
    } catch (err) {
      setStudentError(err.message || 'Lookup failed.');
    } finally {
      setStudentLoading(false);
    }
  };

  const handleResetFilters = (e) => {
    e?.preventDefault();
    setFilterBranch('');
    setFilterDegree('');
    setFilterBatch('');
    if (searchQuery.trim()) {
      handleStudentSearch(null, 1, {
        branch: '',
        degree: '',
        batch: ''
      });
    }
  };

  const handleSelectScholar = async (scholarNo) => {
    setStudentLoading(true);
    setStudentError('');
    try {
      const res = await api(`/students/${scholarNo}`);
      setSelectedStudent(res.data);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setStudentError(err.message || 'Failed to retrieve subject dossier.');
    } finally {
      setStudentLoading(false);
    }
  };

  const handleAiSubmit = async (e, predefinedQuery = null) => {
    if (e) e.preventDefault();
    const q = (predefinedQuery || aiQuery).trim();
    if (!q) return;

    // Await background captcha if in-flight
    if (verificationPromiseRef.current) {
      try {
        await verificationPromiseRef.current;
      } catch {}
    }

    setAiLoading(true);
    setAiError('');

    const userMessage = { role: 'user', content: q, timestamp: new Date().toLocaleTimeString() };
    setAiHistory((prev) => [...prev, userMessage]);
    setAiQuery('');

    try {
      const res = await api('/ai', {
        method: 'POST',
        body: { query: q }
      });

      const assistantMessage = {
        role: 'assistant',
        content: res.data?.text || 'No data generated.',
        intent: res.data?.intent,
        cached: res.data?.cached,
        timestamp: new Date().toLocaleTimeString()
      };

      setAiHistory((prev) => [...prev, assistantMessage]);
      if (res.data?.quota) setAiQuota(res.data.quota);
    } catch (err) {
      setAiError(err.message || 'AI request failed.');
      const errorMessage = {
        role: 'error',
        content: `FAULT: ${err.message || 'Processing aborted.'}`,
        timestamp: new Date().toLocaleTimeString()
      };
      setAiHistory((prev) => [...prev, errorMessage]);
    } finally {
      setAiLoading(false);
    }
  };

  const exampleQueries = [
    'who topped 2nd sem in ece-28?',
    'average CPI of cse-26',
    'how many students failed sem 1 in cse-25?',
    'top 3 cpi in it-26',
    'roster of ece-28'
  ];

  // Block-character quota meter
  const renderQuotaMeter = () => {
    if (!aiQuota) return null;
    const used = aiQuota.usedToday || 0;
    const limit = aiQuota.limit || 10;
    const filled = Math.min(10, Math.round((used / limit) * 10));
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(10 - filled);
    return (
      <span
        className="font-terminal"
        role="img"
        aria-label={`${used} of ${limit} queries used`}
      >
        {used}/{limit} {bar}
      </span>
    );
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 font-terminal text-white" style={{ maxWidth: '1100px' }}>
      {/* Tab Switcher - per section 9.13: words with scratched underline on active */}
      <div className="flex gap-6 mb-8">
        <button
          onClick={() => setActiveTab('student')}
          className={`text-lg tracking-wider pb-1 transition-colors ${
            activeTab === 'student'
              ? 'text-white font-bold'
              : 'hover:text-white'
          }`}
          style={{
            color: activeTab === 'student' ? undefined : 'var(--bone-35)',
            borderBottom: activeTab === 'student' ? '2px solid var(--bone-80)' : 'none',
          }}
        >
          PULL A TAPE
        </button>
        <button
          onClick={() => setActiveTab('ai')}
          className={`text-lg tracking-wider pb-1 transition-colors ${
            activeTab === 'ai'
              ? 'text-white font-bold'
              : 'hover:text-white'
          }`}
          style={{
            color: activeTab === 'ai' ? undefined : 'var(--bone-35)',
            borderBottom: activeTab === 'ai' ? '2px solid var(--bone-80)' : 'none',
          }}
        >
          THE ARCHIVE SPEAKS
        </button>
      </div>

      {/* ─── STUDENT LOOKUP ─── */}
      {activeTab === 'student' && (
        <div>
          {/* Search input - big underline with spiral mark */}
          <form onSubmit={(e) => handleStudentSearch(e, 1)} className="mb-8">
            <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-3">
              <div className="flex items-end gap-3 flex-1">
                <Mark name="spiral" className="mb-1 flex-shrink-0" />
                <div className="flex-1">
                  <label className="input-label">ENTER NAME OR SCHOLAR NO.</label>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      triggerBackgroundCaptcha();
                    }}
                    onFocus={triggerBackgroundCaptcha}
                    placeholder="________"
                    className="input-underline"
                    style={{ fontSize: '22px' }}
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={studentLoading || !searchQuery.trim()}
                className="btn-primary flex-shrink-0 w-full sm:w-auto"
              >
                {studentLoading ? 'PULLING TAPE...' : 'RETRIEVE >>'}
              </button>
            </div>
          </form>

          {/* Loading: tracking band */}
          {studentLoading && (
            <div className="relative h-16 mb-4">
              <div className="tracking-band" />
              <div className="font-terminal text-sm tracking-widest text-center pt-6" style={{ color: 'var(--bone-60)' }} data-corruptible>
                TRACKING...
              </div>
            </div>
          )}

          {studentError && (
            <div className="mb-4 font-typewriter text-sm py-2 px-3" style={{ background: '#fff', color: '#000' }}>
              FAULT: {studentError}
            </div>
          )}

          {/* Back button when viewing a student */}
          {selectedStudent && (
            <button
              onClick={() => { setSelectedStudent(null); }}
              className="btn-secondary text-sm mb-4"
            >
              {'<<'} REWIND
            </button>
          )}

          {/* Subject file */}
          {selectedStudent && (
            <StudentCard
              student={{
                ...selectedStudent,
                isPinned: pinnedScholarNos.includes((selectedStudent.scholarNo || '').toUpperCase())
              }}
              isAdmin={user?.role === 'ADMIN'}
              onPinUpdated={(scholarNo, isPinned) => {
                const upper = scholarNo.toUpperCase();
                setPinnedScholarNos(prev => 
                  isPinned ? [...prev, upper] : prev.filter(x => x !== upper)
                );
              }}
            />
          )}

          {/* Multiple results - ledger rows per section 9.6 */}
          {searchResults && searchResults.results && !selectedStudent && (
            <div className="mt-4">
              {/* Post-search attribute filter bar */}
              <div className="mb-4 pb-3 border-b border-white/20 font-mono text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="font-terminal text-sm tracking-wider text-white flex items-center gap-2">
                    <span>INDEX MATCHES: {searchResults.total} RECORDS</span>
                    {(filterBranch || filterDegree || filterBatch) && (
                      <span className="bg-white text-black px-1.5 py-0.2 font-bold text-xs">
                        FILTERED
                      </span>
                    )}
                  </div>
                  {(filterBranch || filterDegree || filterBatch) && (
                    <button
                      type="button"
                      onClick={handleResetFilters}
                      className="text-white/50 hover:text-white underline text-xs"
                    >
                      [ CLEAR FILTERS ]
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Course / Degree Filter */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-white/40">COURSE:</span>
                    <select
                      value={filterDegree}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFilterDegree(val);
                        handleStudentSearch(null, 1, {
                          branch: filterBranch,
                          degree: val,
                          batch: filterBatch,
                        });
                      }}
                      className="bg-black border border-white/30 text-white px-2 py-1 focus:outline-none focus:border-white font-mono"
                    >
                      <option value="">ALL COURSES</option>
                      <option value="B Tech">B.TECH</option>
                      <option value="M Tech">M.TECH</option>
                      <option value="MCA">MCA</option>
                      <option value="Ph. D.">PH.D.</option>
                    </select>
                  </div>

                  {/* Branch / Specialization Filter */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-white/40">BRANCH:</span>
                    <select
                      value={filterBranch}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFilterBranch(val);
                        handleStudentSearch(null, 1, {
                          branch: val,
                          degree: filterDegree,
                          batch: filterBatch,
                        });
                      }}
                      className="bg-black border border-white/30 text-white px-2 py-1 focus:outline-none focus:border-white font-mono"
                    >
                      <option value="">ALL BRANCHES</option>
                      <option value="Computer Science">CSE (COMPUTER SCIENCE)</option>
                      <option value="Artificial Intelligence">AI (ARTIFICIAL INTELLIGENCE)</option>
                      <option value="Information Technology">IT (INFO TECH)</option>
                      <option value="Cyber Security">CYBER SECURITY</option>
                      <option value="Cyber Physical System">CYBER PHYSICAL SYSTEM</option>
                      <option value="Electronics & Communication">ECE (ELECTRONICS &amp; COMM)</option>
                      <option value="Data Science">DATA SCIENCE</option>
                      <option value="Mathematics">MATHEMATICS &amp; COMPUTING</option>
                    </select>
                  </div>

                  {/* Batch Year Filter */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-white/40">BATCH:</span>
                    <select
                      value={filterBatch}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFilterBatch(val);
                        handleStudentSearch(null, 1, {
                          branch: filterBranch,
                          degree: filterDegree,
                          batch: val,
                        });
                      }}
                      className="bg-black border border-white/30 text-white px-2 py-1 focus:outline-none focus:border-white font-mono"
                    >
                      <option value="">ALL BATCHES</option>
                      <option value="2025">2025</option>
                      <option value="2024">2024</option>
                      <option value="2023">2023</option>
                      <option value="2022">2022</option>
                      <option value="2021">2021</option>
                      <option value="2020">2020</option>
                    </select>
                  </div>
                </div>
              </div>

              {searchResults.results.length === 0 ? (
                <div className="border border-white/20 p-6 text-center text-white/40 font-mono text-xs">
                  [ NO RECORDS MATCH CURRENT CALIBRATION ]
                </div>
              ) : (
                <div className="space-y-0">
                  {searchResults.results.map((item, idx) => {
                    const isItemPinned = pinnedScholarNos.includes((item.scholar_no || '').toUpperCase());
                    return (
                      <div
                        key={idx}
                        onClick={() => handleSelectScholar(item.scholar_no)}
                        className="py-3 cursor-pointer transition-colors hover:bg-white/5 border-b border-white/10 group px-2"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <div className="flex items-baseline gap-3">
                            <span className="font-terminal text-base tracking-wider font-bold group-hover:text-white">{item.name}</span>
                            {isItemPinned && (
                              <span className="font-mono text-[12px] px-1.5 py-0.2 bg-white text-black font-bold">
                                [ PINNED ]
                              </span>
                            )}
                            {item.isRegistrationOnly && (
                              <span className="font-mono text-[10px] px-1 bg-yellow-500/20 text-yellow-300 border border-yellow-500/40">
                                REGISTRY RECORD
                              </span>
                            )}
                          </div>
                          <div className="font-typewriter text-xs font-terminal tracking-wider text-white/60">
                            {item.scholar_no}
                          </div>
                        </div>

                        {/* Admin-only Registration Intelligence row */}
                        {user?.role === 'ADMIN' && item.registration && (
                          <div className="mt-2 text-[11px] font-mono text-white/50 group-hover:text-white/80 flex flex-wrap gap-x-4 gap-y-1">
                            {item.registration.fatherName && (
                              <span><strong className="text-white/40">FATHER:</strong> {item.registration.fatherName}</span>
                            )}
                            {item.registration.category && (
                              <span><strong className="text-white/40">CAT:</strong> {item.registration.category}</span>
                            )}
                            {item.registration.phones?.[0] && (
                              <span><strong className="text-white/40">PHONE:</strong> {item.registration.phones[0]}</span>
                            )}
                            {item.registration.emails?.[0] && (
                              <span><strong className="text-white/40">EMAIL:</strong> {item.registration.emails[0]}</span>
                            )}
                            {item.registration.addresses?.[0]?.text && (
                              <span className="truncate max-w-sm"><strong className="text-white/40">ADDR:</strong> {item.registration.addresses[0].text}</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Pagination - dot row style */}
              <div className="flex justify-between items-center mt-4 pt-3 text-xs font-terminal" style={{ borderTop: '1px solid var(--bone-15)' }}>
                <button
                  disabled={page <= 1}
                  onClick={(e) => handleStudentSearch(e, page - 1)}
                  className="btn-secondary text-xs disabled:opacity-20"
                >
                  {'<<'} PREV
                </button>
                <span style={{ color: 'var(--bone-35)' }}>
                  PAGE {page}
                </span>
                <button
                  disabled={page >= 2 || (searchResults.results.length < 10)}
                  onClick={(e) => handleStudentSearch(e, page + 1)}
                  className="btn-secondary text-xs disabled:opacity-20"
                >
                  NEXT {'>>'}
                </button>
              </div>
            </div>
          )}

          {/* Empty state per 10.9 */}
          {!studentLoading && !selectedStudent && !searchResults && searchQuery === '' && (
            <div className="text-center py-16">
              <pre aria-hidden="true" className="font-terminal text-sm inline-block" style={{ color: 'var(--bone-15)' }}>
{`         |  |  |  |
         |  |  |  |  _
        _|  |  |  |_| |
       | |  |  |  | | |
       | '--'--'--' | |
       |             /
        \\           /
         |         |
         |_________|`}
              </pre>
              <div className="font-typewriter text-sm mt-4" style={{ color: 'var(--bone-35)' }}>
                Enter a name or scholar number to pull a tape.
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── AI ASSISTANT (The archive speaks) ─── */}
      {activeTab === 'ai' && (
        <div>
          {/* Quota meter with finger flutings */}
          <div className="flex items-center justify-between mb-4 text-xs">
            <div className="flex items-center gap-2">
              <Mark name="flutings" />
              <span className="font-terminal tracking-wider" style={{ color: 'var(--bone-35)' }}>LOOKUPS</span>
            </div>
            <span className="font-terminal" style={{ color: 'var(--bone-60)' }}>
              {renderQuotaMeter()}
              {user?.role === 'ADMIN' && <span className="ml-2" style={{ color: 'var(--bone-35)' }}>(ADMIN UNRESTRICTED)</span>}
            </span>
          </div>

          {/* Example queries as secondary buttons */}
          <div className="mb-6">
            <div className="font-terminal text-xs tracking-wider mb-2" style={{ color: 'var(--bone-35)' }}>
              RECOMMENDED SIGNALS:
            </div>
            <div className="flex flex-wrap gap-2">
              {exampleQueries.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => handleAiSubmit(null, ex)}
                  className="btn-secondary text-xs"
                  style={{ padding: '2px 8px' }}
                >
                  {'>'} {ex}
                </button>
              ))}
            </div>
          </div>

          {/* Conversation as TRANSCRIPT - not chat bubbles (section 10.6) */}
          <div className="min-h-[300px] max-h-[500px] overflow-y-auto mb-6 space-y-3" style={{ borderLeft: '2px solid var(--bone-15)', paddingLeft: '16px' }}>
            {aiHistory.length === 0 ? (
              <div className="font-typewriter text-sm py-16" style={{ color: 'var(--bone-35)' }}>
                ARCHIVE READY. INQUIRE ABOUT EXAM TOPPERS, BATCH AVERAGES, PASS/FAIL COUNTS, OR ROSTERS.
              </div>
            ) : (
              aiHistory.map((msg, idx) => (
                <div key={idx} className="pb-3" style={{ borderBottom: '1px solid var(--bone-07)' }}>
                  {msg.role === 'user' ? (
                    <div className="font-typewriter text-sm" style={{ color: 'var(--bone-80)' }}>
                      <span className="font-terminal" style={{ color: 'var(--bone-60)' }}>{'> '}</span>
                      {msg.content}
                    </div>
                  ) : msg.role === 'error' ? (
                    <div className="font-typewriter text-sm" style={{ color: 'var(--bone-80)' }}>
                      {msg.content}
                    </div>
                  ) : (
                    <div className="font-typewriter text-sm leading-relaxed" style={{ color: 'var(--bone-80)', maxWidth: '70ch' }}>
                      <span className="font-terminal tracking-wider" style={{ color: 'var(--bone-60)' }}>ARCHIVE: </span>
                      {msg.cached && <span className="font-terminal text-xs mr-2" style={{ color: 'var(--bone-35)' }}>REPLAY</span>}
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  )}
                </div>
              ))
            )}
            {aiLoading && (
              <div className="relative h-8">
                <div className="tracking-band" />
                <span className="font-terminal text-xs tracking-widest" style={{ color: 'var(--bone-60)' }} data-corruptible>
                  TRACKING...
                </span>
              </div>
            )}
          </div>

          {/* AI Input */}
          <form onSubmit={(e) => handleAiSubmit(e)} className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-3">
            <div className="flex-1">
              <input
                type="text"
                value={aiQuery}
                onChange={(e) => {
                  setAiQuery(e.target.value);
                  triggerBackgroundCaptcha();
                }}
                onFocus={triggerBackgroundCaptcha}
                placeholder="________"
                className="input-underline"
                style={{ fontSize: '20px' }}
              />
            </div>
            <button
              type="submit"
              disabled={aiLoading || !aiQuery.trim()}
              className="btn-primary flex-shrink-0 w-full sm:w-auto"
            >
              {aiLoading ? 'TRACKING...' : 'TRANSMIT >>'}
            </button>
          </form>
        </div>
      )}

      {/* Background Turnstile Verification Container */}
      {captchaActive && !captchaVerified && (
        <div className="flex justify-center my-2">
          <Turnstile
            ref={turnstileRef}
            siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY || '0x4AAAAAAFcO6VeDG_Psrewy'}
            options={{ action: 'search', theme: 'dark', appearance: 'interaction-only' }}
            onSuccess={handleTurnstileSuccess}
            onError={(err) => {
              console.warn('[Turnstile] Challenge error:', err);
              turnstileRef.current?.reset();
            }}
            onExpire={() => {
              setCaptchaVerified(false);
              turnstileRef.current?.reset();
            }}
          />
        </div>
      )}
    </div>
  );
}
