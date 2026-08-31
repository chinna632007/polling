import { useAuth } from '../context/AuthContext';

/** Top bar with the page's brand strip, admin name and logout control. */
export default function Navbar({ onMenuClick }) {
  const { admin, logout } = useAuth();

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
            {(admin?.username || 'A').charAt(0).toUpperCase()}
          </span>
          <div className="navbar-admin-info">
            <span className="navbar-admin-name">
              {admin?.name || admin?.username || 'admin'}
            </span>
            <span className="navbar-admin-role">
              Administrator{admin?.name ? ` · ${admin.username}` : ''}
            </span>
          </div>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>
          Logout
        </button>
      </div>
    </header>
  );
}