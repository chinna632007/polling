import { useAuth } from '../context/AuthContext';
import { roleLabel } from '../utils/roles';

/** Top bar with brand strip, Main Admin info and logout. */
export default function Navbar({ onMenuClick }) {
  const { user, logout } = useAuth();

  return (
    <header className="navbar">
      <button
        type="button"
        className="navbar-burger"
        onClick={onMenuClick}
        aria-label="Open navigation menu"
      >
        ☰
      </button>

      <div className="navbar-brand">
        <span className="navbar-title">Smart Polling Booth Officer Allocation</span>
        <span className="navbar-subtitle">Polling Officer Allocation &amp; Notification System</span>
      </div>

      <div className="navbar-right">
        <div className="navbar-admin">
          <span className="navbar-admin-avatar" aria-hidden="true">
            {(user?.username || 'A').charAt(0).toUpperCase()}
          </span>
          <div className="navbar-admin-info">
            <span className="navbar-admin-name">{user?.name || user?.username || 'Main Admin'}</span>
            <span className="navbar-admin-role">{roleLabel(user?.role)}</span>
          </div>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>
          Logout
        </button>
      </div>
    </header>
  );
}