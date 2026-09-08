import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { ROLES, homeForRole } from './utils/roles';

import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';

import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import AllocationDashboard from './pages/AllocationDashboard';
import MandalDashboard from './pages/MandalDashboard';
import OfficerDashboard from './pages/OfficerDashboard';
import Officers from './pages/Officers';
import Booths from './pages/Booths';
import UploadExcel from './pages/UploadExcel';
import Allocation from './pages/Allocation';
import Notifications from './pages/Notifications';
import Reports from './pages/Reports';
import Users from './pages/Users';
import AccessDenied from './pages/AccessDenied';
import Spinner from './components/Spinner';

/**
 * Guard component: redirects unauthenticated visitors to the login page.
 * Exception: the /register route is allowed through when the backend is
 * in bootstrap mode (no users exist yet).
 */
function ProtectedRoute({ children, allowRegister = false }) {
  const { isAuthenticated, isBootstrapMode } = useAuth();
  if (isAuthenticated) return children;
  if (allowRegister && isBootstrapMode) return children;
  return <Navigate to="/login" replace />;
}

/**
 * Role-based route guard: only allows the listed roles through. If the
 * signed-in user's role isn't allowed, they are sent to an Access Denied
 * page instead of the requested URL.
 */
function RoleRoute({ roles = [], children }) {
  const { user } = useAuth();
  const allowed = roles.includes(user?.role);
  if (allowed) return children;
  return <Navigate to="/access-denied" replace />;
}

/** Redirects a signed-in user to their role's home dashboard when they open "/". */
function HomeRedirect() {
  const { user } = useAuth();
  const location = useLocation();
  const home = homeForRole(user?.role);
  // Loop guard: if we are somehow already on the target path, render the
  // dashboard instead of navigating to the same URL forever (white page).
  if (location.pathname === home) return <Dashboard />;
  return <Navigate to={home} replace />;
}

/** Shows a loading spinner while AuthProvider is probing the backend. */
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
  const { isAuthenticated, isBootstrapMode, bootstrapChecked } = useAuth();
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

      {/* /register is public ONLY in bootstrap mode (create first Super Admin).
          Once the system has users, Super Admins manage accounts via /users. */}
      <Route
        path="/register"
        element={
          isBootstrapMode ? (
            <Register />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      {/* Access denied (visible to any signed-in user) */}
      <Route
        path="/access-denied"
        element={
          <ProtectedRoute>
            <AccessDenied />
          </ProtectedRoute>
        }
      />

      {/* The whole application shell (sidebar + navbar) is signed-in only */}
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
                    {/* Role home redirects */}
                    <Route path="/" element={<HomeRedirect />} />

                    {/* SUPER_ADMIN dashboard */}
                    <Route
                      path="/admin/dashboard"
                      element={
                        <RoleRoute roles={[ROLES.SUPER_ADMIN]}>
                          <Dashboard />
                        </RoleRoute>
                      }
                    />

                    {/* ALLOCATION_OFFICER dashboard */}
                    <Route
                      path="/allocation/dashboard"
                      element={
                        <RoleRoute roles={[ROLES.SUPER_ADMIN, ROLES.ALLOCATION_OFFICER]}>
                          <AllocationDashboard />
                        </RoleRoute>
                      }
                    />

                    {/* MANDAL_OFFICER dashboard */}
                    <Route
                      path="/mandal/dashboard"
                      element={
                        <RoleRoute roles={[ROLES.MANDAL_OFFICER]}>
                          <MandalDashboard />
                        </RoleRoute>
                      }
                    />

                    {/* BOOTH_OFFICER personal dashboard */}
                    <Route
                      path="/officer/dashboard"
                      element={
                        <RoleRoute roles={[ROLES.BOOTH_OFFICER]}>
                          <OfficerDashboard />
                        </RoleRoute>
                      }
                    />

                    {/* Shared pages (role-scoped by the backend) */}
                    <Route
                      path="/officers"
                      element={
                        <RoleRoute roles={[ROLES.SUPER_ADMIN, ROLES.ALLOCATION_OFFICER, ROLES.MANDAL_OFFICER]}>
                          <Officers />
                        </RoleRoute>
                      }
                    />
                    <Route
                      path="/booths"
                      element={
                        <RoleRoute roles={[ROLES.SUPER_ADMIN, ROLES.ALLOCATION_OFFICER, ROLES.MANDAL_OFFICER]}>
                          <Booths />
                        </RoleRoute>
                      }
                    />
                    <Route
                      path="/allocation"
                      element={
                        <RoleRoute roles={[ROLES.SUPER_ADMIN, ROLES.ALLOCATION_OFFICER, ROLES.MANDAL_OFFICER]}>
                          <Allocation />
                        </RoleRoute>
                      }
                    />
                    <Route
                      path="/reports"
                      element={
                        <RoleRoute roles={[ROLES.SUPER_ADMIN, ROLES.ALLOCATION_OFFICER, ROLES.MANDAL_OFFICER]}>
                          <Reports />
                        </RoleRoute>
                      }
                    />

                    {/* SUPER_ADMIN only */}
                    <Route
                      path="/upload"
                      element={
                        <RoleRoute roles={[ROLES.SUPER_ADMIN]}>
                          <UploadExcel />
                        </RoleRoute>
                      }
                    />
                    <Route
                      path="/notifications"
                      element={
                        <RoleRoute roles={[ROLES.SUPER_ADMIN, ROLES.ALLOCATION_OFFICER]}>
                          <Notifications />
                        </RoleRoute>
                      }
                    />
                    <Route
                      path="/users"
                      element={
                        <RoleRoute roles={[ROLES.SUPER_ADMIN]}>
                          <Users />
                        </RoleRoute>
                      }
                    />

                    {/* anything else -> role home */}
                    <Route path="*" element={<HomeRedirect />} />
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