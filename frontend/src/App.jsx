import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';

import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Officers from './pages/Officers';
import Booths from './pages/Booths';
import UploadExcel from './pages/UploadExcel';
import Allocation from './pages/Allocation';
import Notifications from './pages/Notifications';
import Reports from './pages/Reports';

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return children;
  return <Navigate to="/login" replace />;
}

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // Close the mobile sidebar whenever the route changes.
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            {/*
              Admin dashboard layout:

              +-----------------------------------------------------+
              |  SIDEBAR (left, fixed width)  |  TOP HEADER (Navbar) |
              |                               +----------------------+
              |                               |  MAIN CONTENT        |
              |                               |  (flex: 1)           |
              +-----------------------------------------------------+
            */}
            <div className="app-layout">
              <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
              <div className="app-right">
                <Navbar onMenuClick={() => setSidebarOpen(true)} />
                <main className="app-main">
                  <Routes>
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/officers" element={<Officers />} />
                    <Route path="/booths" element={<Booths />} />
                    <Route path="/upload" element={<UploadExcel />} />
                    <Route path="/allocation" element={<Allocation />} />
                    <Route path="/notifications" element={<Notifications />} />
                    <Route path="/reports" element={<Reports />} />
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
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
