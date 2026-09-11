/**
 * Login.jsx
 * =========
 * Single Main Admin login. Username + password only; no registration, no
 * demo accounts, no role selection.
 */
import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homeForRole } from '../utils/roles';
import PasswordInput from '../components/PasswordInput';
import Toast from '../components/Toast';
import Spinner from '../components/Spinner';
import { getErrorMessage } from '../services/api';

export default function Login() {
  const { login, user, bootstrapChecked } = useAuth();
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
          Main Admin Login
        </p>

        {error ? (
          <Toast message={error} type="error" onClose={() => setError(null)} />
        ) : null}

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter admin username"
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

        <div className="login-demo">
          <p className="login-demo-title">Development credentials</p>
          <div className="login-demo-grid">
            <span><strong>admin</strong> / admin123</span>
          </div>
        </div>

        <p className="login-foot">
          Main Admin only · Authorized personnel only
        </p>
      </div>
    </div>
  );
}