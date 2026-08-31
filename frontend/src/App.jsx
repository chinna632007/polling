import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';

import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';

import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Officers from './pages/Officers';
import Booths from './pages/Booths';
import UploadExcel from './pages/UploadExcel';
import Allocation from './pages/Allocation';
import Notifications from './pages/Notifications';
import Reports from './pages/Reports';
import Spinner from './components/Spinner';

/**
 * Guard component: redirects unauthenticated visitors to the login page.
 * Exception: the /register route is allowed through when the backend is
 * in bootstrap mode (no admin accounts exist yet), so the first admin can
 * be created without a token.
 */
function ProtectedRoute({ children, allowRegister = false }) {
  const { isAuthenticated, isBootstrapMode } = useAuth();
  if (isAuthenticated) return children;
  if (allowRegister && isBootstrapMode) return children;
  return <Navigate to="/login" replace />;
}

/**
 * Shows a loading spinner while AuthProvider is probing the backend for
 * bootstrap status on initial load (prevents a stale redirect flash).
 */
function AppLoading() {
  return (
    <div className="login-page">
      <div className="login-card" style={{ textAlign: 'center', padding: '40px' }}>
        <Spinner label="Initializing session…" />
      </div>
    </div>
  );
}

export default function App() {
  const { isAuthenticated, bootstrapChecked } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // Close the mobile sidebar when navigating
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  if (!bootstrapChecked && !isAuthenticated) {
    return <AppLoading />;
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* /register is public ONLY in bootstrap mode; otherwise protected */}
      <Route
        path="/register"
        element={
          <ProtectedRoute allowRegister={true}>
            <Register />
          </ProtectedRoute>
        }
      />

      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <div className="app-shell">
              <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
              <div className="app-main">
                <Navbar onMenuClick={() => setSidebarOpen(true)} />
                <main className="app-content">
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/officers" element={<Officers />} />
                    <Route path="/booths" element={<Booths />} />
                    <Route path="/upload" element={<UploadExcel />} />
                    <Route path="/allocation" element={<Allocation />} />
                    <Route path="/notifications" element={<Notifications />} />
                    <Route path="/reports" element={<Reports />} />
                    <Route
                      path="*"
                      element={
                        <Navigate
                          to={isAuthenticated ? '/' : '/login'}
                          replace
                        />
                      }
                    />
                  </Routes>
                </main>
                <footer className="app-footer">
                  Smart Polling Booth Officer Allocation &amp; Notification System
                </footer>
              </div>
            </div>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}