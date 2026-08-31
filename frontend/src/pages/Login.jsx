import { useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PasswordInput from '../components/PasswordInput';
import Toast from '../components/Toast';
import Spinner from '../components/Spinner';
import { getErrorMessage } from '../services/api';

export default function Login() {
  const { login, isAuthenticated, isBootstrapMode, bootstrapChecked } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
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
      await login(username, password);
      navigate('/', { replace: true });
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
          Officer Allocation &amp; Notification System
        </p>

        {error ? (
          <Toast message={error} type="error" onClose={() => setError(null)} />
        ) : null}

        {isBootstrapMode ? (
          <Toast
            message="No administrator account exists yet. Please create the first admin account below."
            type="info"
          />
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
            {loading ? <Spinner small label="Signing in…" /> : 'Sign In'}
          </button>
        </form>

        {isBootstrapMode && (
          <div className="bootstrap-cta">
            <Link to="/register" className="btn btn-secondary btn-block">
              Create First Admin Account
            </Link>
          </div>
        )}

        <p className="login-foot">
          {isBootstrapMode
            ? 'No admin account exists yet. Create one to get started.'
            : 'Authorized administrators only · new admin accounts are registered by an existing admin after sign-in'}
        </p>
      </div>
    </div>
  );
}