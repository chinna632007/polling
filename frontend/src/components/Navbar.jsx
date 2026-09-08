import { useAuth } from '../context/AuthContext';
import { roleLabel } from '../utils/roles';

/** Top bar with the page's brand strip, user info (name, role, mandal) and logout. */
export default function Navbar({ onMenuClick }) {
  const { user, logout } = useAuth();

  const subtitle = [
    roleLabel(user?.role),
    user?.role === 'MANDAL_OFFICER' && user?.assignedMandal
      ? `Mandal: ${user.assignedMandal}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

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
            <span className="navbar-admin-name">{user?.name || user?.username || 'user'}</span>
            <span className="navbar-admin-role">{subtitle || 'Signed in'}</span>
          </div>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>
          Logout
        </button>
      </div>
    </header>
  );
}