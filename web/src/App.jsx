import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { bootstrapAuth, setAccessToken, api } from './api';

import Header from './components/Header';
import TapeTexture from './components/TapeTexture';
import CaptchaModal from './components/CaptchaModal';
import NotificationDialog from './components/NotificationDialog';
import AnnouncementBanner from './components/AnnouncementBanner';
import FeatureTour from './components/FeatureTour';

import Login from './pages/Login';
import Register from './pages/Register';
import Pending from './pages/Pending';
import Search from './pages/Search';
import History from './pages/History';
import PinnedTapes from './pages/PinnedTapes';

// Administrator Command Suite - Lazy-loaded chunks (isolated from public bundle)
const AdminLayout = React.lazy(() => import('./pages/admin/AdminLayout'));
const Dashboard = React.lazy(() => import('./pages/admin/Dashboard'));
const Users = React.lazy(() => import('./pages/admin/Users'));
const SpecialScholars = React.lazy(() => import('./pages/admin/SpecialScholars'));
const PinnedMonitors = React.lazy(() => import('./pages/admin/PinnedMonitors'));
const Alerts = React.lazy(() => import('./pages/admin/Alerts'));
const SearchHistory = React.lazy(() => import('./pages/admin/SearchHistory'));
const AiHistory = React.lazy(() => import('./pages/admin/AiHistory'));
const Feedback = React.lazy(() => import('./pages/admin/Feedback'));
const Announcements = React.lazy(() => import('./pages/admin/Announcements'));
const Registration = React.lazy(() => import('./pages/admin/Registration'));
const Export = React.lazy(() => import('./pages/admin/Export'));
const NlqDebug = React.lazy(() => import('./pages/admin/NlqDebug'));
const Settings = React.lazy(() => import('./pages/admin/Settings'));
const AuditLog = React.lazy(() => import('./pages/admin/AuditLog'));

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reducedDistortion, setReducedDistortion] = useState(false);
  const [showTour, setShowTour] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    bootstrapAuth()
      .then((data) => {
        if (data && data.user) {
          setUser(data.user);
          const tourKey = `reseye_tour_done_${data.user.id}`;
          if (data.user.isFirstLogin) {
            localStorage.removeItem(tourKey);
            setShowTour(true);
          } else if (!localStorage.getItem(tourKey)) {
            setShowTour(true);
          }
        }
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleLogout = async () => {
    try {
      await api('/auth/logout', { method: 'POST', retry: false });
    } catch {}
    setAccessToken(null);
    setUser(null);
    navigate('/login');
  };

  const isVerifiedUser = user && (user.status === 'ACTIVE' || user.isEmailVerified);

  const handleAuthSuccess = (userData) => {
    setUser(userData);
    const tourKey = `reseye_tour_done_${userData.id}`;
    if (userData.isFirstLogin) {
      localStorage.removeItem(tourKey);
      setShowTour(true);
    } else if (!localStorage.getItem(tourKey)) {
      setShowTour(true);
    }
    if (userData.status === 'PENDING' && !userData.isEmailVerified) {
      navigate('/pending');
    } else {
      navigate('/search');
    }
  };

  const handleCloseTour = () => {
    setShowTour(false);
    if (user?.id) {
      localStorage.setItem(`reseye_tour_done_${user.id}`, 'true');
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black font-terminal text-white">
        <div className="text-center space-y-3">
          <div className="text-2xl font-bold tracking-widest animate-pulse">[ INITIALIZING ARCHIVE FEED ]</div>
          <div className="text-xs text-white/50 tracking-wider">ALIGNING CRT BEAM TELEMETRY...</div>
        </div>
      </div>
    );
  }

  const isPublicAuthPage = location.pathname === '/login' || location.pathname === '/register';

  return (
    <div className="min-h-screen bg-black font-terminal text-white flex flex-col relative">
      <TapeTexture reduced={reducedDistortion} />
      <CaptchaModal />
      <NotificationDialog />
      <FeatureTour isOpen={showTour && Boolean(user)} onClose={handleCloseTour} user={user} />

      {isVerifiedUser && (
        <>
          <Header
            user={user}
            onLogout={handleLogout}
            onOpenTour={() => setShowTour(true)}
            reducedDistortion={reducedDistortion}
            setReducedDistortion={setReducedDistortion}
          />
          <AnnouncementBanner />
        </>
      )}

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-6">
        <Routes>
          {/* Public Authentication Routes */}
          <Route
            path="/login"
            element={
              isVerifiedUser ? (
                <Navigate to="/search" replace />
              ) : user && user.status === 'PENDING' ? (
                <Navigate to="/pending" replace />
              ) : (
                <Login onAuthSuccess={handleAuthSuccess} />
              )
            }
          />
          <Route
            path="/register"
            element={
              isVerifiedUser ? (
                <Navigate to="/search" replace />
              ) : (
                <Register onAuthSuccess={handleAuthSuccess} />
              )
            }
          />

          {/* Pending Approval Screen */}
          <Route
            path="/pending"
            element={
              user && user.status === 'PENDING' && !user.isEmailVerified ? (
                <Pending onLogout={handleLogout} />
              ) : isVerifiedUser ? (
                <Navigate to="/search" replace />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />

          {/* User Core Pages */}
          <Route
            path="/"
            element={
              !user ? (
                <Navigate to="/login" replace />
              ) : !isVerifiedUser ? (
                <Navigate to="/pending" replace />
              ) : (
                <Navigate to="/search" replace />
              )
            }
          />
          <Route
            path="/search"
            element={
              !user ? (
                <Navigate to="/login" replace />
              ) : !isVerifiedUser ? (
                <Navigate to="/pending" replace />
              ) : (
                <Search user={user} />
              )
            }
          />
          <Route
            path="/pinned"
            element={
              !user ? (
                <Navigate to="/login" replace />
              ) : !isVerifiedUser ? (
                <Navigate to="/pending" replace />
              ) : (
                <PinnedTapes user={user} />
              )
            }
          />
          <Route
            path="/history"
            element={
              !user ? (
                <Navigate to="/login" replace />
              ) : !isVerifiedUser ? (
                <Navigate to="/pending" replace />
              ) : (
                <Navigate to="/pinned" replace />
              )
            }
          />

          {/* Administrator Command Suite */}
          <Route
            path="/admin"
            element={
              !user ? (
                <Navigate to="/login" replace />
              ) : user.status === 'PENDING' ? (
                <Navigate to="/pending" replace />
              ) : user.role !== 'ADMIN' ? (
                <Navigate to="/search" replace />
              ) : (
                <React.Suspense
                  fallback={
                    <div className="p-8 text-center font-terminal text-sm text-white/50 tracking-widest animate-pulse">
                      [ DECRYPTING PRIVILEGED INTERFACE... ]
                    </div>
                  }
                >
                  <AdminLayout user={user} />
                </React.Suspense>
              )
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="users" element={<Users user={user} />} />
            <Route path="special" element={<SpecialScholars />} />
            <Route path="pinned-monitors" element={<PinnedMonitors />} />
            <Route path="alerts" element={<Alerts />} />
            <Route path="history" element={<SearchHistory />} />
            <Route path="ai-history" element={<AiHistory />} />
            <Route path="feedback" element={<Feedback />} />
            <Route path="announcements" element={<Announcements />} />
            <Route path="registration" element={<Registration />} />
            <Route path="export" element={<Export />} />
            <Route path="nlq-debug" element={<NlqDebug />} />
            <Route path="settings" element={<Settings />} />
            <Route path="audit" element={<AuditLog />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Tape Archive Footer */}
      <footer className="border-t border-white/20 py-4 px-6 text-center text-xs text-white/40 font-mono">
        <div>ResEYE // INSTITUTIONAL ACADEMIC SURVEILLANCE &amp; ARCHIVE ENGINE</div>
        <div className="text-[12px] text-white/30 mt-1">
          CONFIDENTIAL // AUTHORIZED ACCESS ONLY // IIIT BHOPAL // 1989-1994 TELEMETRY TAPE ARCHIVE
        </div>
      </footer>
    </div>
  );
}
