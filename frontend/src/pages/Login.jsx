import { useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homeForRole } from '../utils/roles';
import PasswordInput from '../components/PasswordInput';
import Toast from '../components/Toast';
import Spinner from '../components/Spinner';
import { getErrorMessage } from '../services/api';

export default function Login() {
  const { login, user, isBootstrapMode, bootstrapChecked } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Already signed in -> go to the role's home dashboard.
  if (user) {
    return <Navigate to={homeForRole(user?.role)} replace />;
  }

  // While we're probing the backend for bootstrap status, show a spinner
  // (avoids a flash of stale content / premature redirects).
  if (!bootstrapChecked) {
    return (
      <div className="login-page">
        <div className="login-card" style={{ textAlign: 'center', padding: '40px' }}>
          <Spinner label="Initializing session…" />
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const loggedUser = await login(username, password);
      navigate(homeForRole(loggedUser?.role), { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-emblem" aria-hidden="true">
          🗳️
        </div>
        <h1 className="login-title">Smart Polling Booth Officer Allocation</h1>
        <p className="login-subtitle">
          Secure role-based Officer Allocation &amp; Notification System
        </p>

        {error ? (
          <Toast message={error} type="error" onClose={() => setError(null)} />
        ) : null}

        {isBootstrapMode ? (
          <Toast
            message="No administrator account exists yet. Please create the first Super Admin account below."
            type="info"
          />
        ) : null}

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">Username or Email</label>
            <input
              id="username"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username or email"
              autoComplete="username"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <PasswordInput
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
            />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? <Spinner small label="Signing in…" /> : 'Login'}
          </button>
        </form>

        {isBootstrapMode && (
          <div className="bootstrap-cta">
            <Link to="/register" className="btn btn-secondary btn-block">
              Create First Super Admin Account
            </Link>
          </div>
        )}

        {!isBootstrapMode && (
          <div className="login-demo">
            <p className="login-demo-title">Demo accounts</p>
            <div className="login-demo-grid">
              <span><strong>admin</strong> / Admin@123 (Super Admin)</span>
              <span><strong>allocator</strong> / Allocate@123 (Allocation Officer)</span>
              <span><strong>mandal_kakinada</strong> / Mandal@123 (Kakinada)</span>
              <span><strong>mandal_rajahmundry</strong> / Mandal@123 (Rajahmundry)</span>
              <span><strong>officer001</strong> / Officer@123 (Booth Officer)</span>
            </div>
          </div>
        )}

        <p className="login-foot">
          {isBootstrapMode
            ? 'No user account exists yet. Create one to get started.'
            : 'Authorized personnel only · access is scoped to your role and assigned Mandal'}
        </p>
      </div>
    </div>
  );
}