import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ROLES, roleLabel } from '../utils/roles';

/** Navigation menu per role (sidebar auto-changes on login). */
function buildNavItems(role) {
  switch (role) {
    case ROLES.SUPER_ADMIN:
      return [
        { to: '/admin/dashboard', label: 'Dashboard', icon: '📊', end: true },
        { to: '/officers', label: 'Officers', icon: '👤' },
        { to: '/booths', label: 'Booths', icon: '🏛️' },
        { to: '/upload', label: 'Excel Upload', icon: '📥' },
        { to: '/allocation', label: 'Allocation', icon: '🔄' },
        { to: '/notifications', label: 'Notifications', icon: '✉️' },
        { to: '/reports', label: 'Reports', icon: '📄' },
        { to: '/users', label: 'Users', icon: '🛡️' },
      ];
    case ROLES.ALLOCATION_OFFICER:
      return [
        { to: '/allocation/dashboard', label: 'Dashboard', icon: '📊', end: true },
        { to: '/officers', label: 'Officers', icon: '👤' },
        { to: '/booths', label: 'Booths', icon: '🏛️' },
        { to: '/allocation', label: 'Allocation', icon: '🔄' },
        { to: '/reports', label: 'Reports', icon: '📄' },
      ];
    case ROLES.MANDAL_OFFICER:
      return [
        { to: '/mandal/dashboard', label: 'Dashboard', icon: '📊', end: true },
        { to: '/officers', label: 'Officers', icon: '👤' },
        { to: '/booths', label: 'Booths', icon: '🏛️' },
        { to: '/allocation', label: 'Allocations', icon: '🔄' },
        { to: '/reports', label: 'Reports', icon: '📄' },
      ];
    case ROLES.BOOTH_OFFICER:
      return [
        { to: '/officer/dashboard', label: 'My Duty', icon: '📊', end: true },
      ];
    default:
      return [{ to: '/', label: 'Dashboard', icon: '📊', end: true }];
  }
}

/**
 * Responsive sidebar. On mobile it is a slide-out overlay controlled by the
 * parent (`open` / `onClose`). Menu items are role-based - Mandal/Booth
 * officers never see Users/Settings.
 */
export default function Sidebar({ open, onClose }) {
  const { user } = useAuth();
  const items = buildNavItems(user?.role);

  return (
    <>
      {open ? <div className="sidebar-overlay" onClick={onClose} aria-hidden="true" /> : null}
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <div className="sidebar-head">
          <span className="sidebar-logo" aria-hidden="true">
            🗳️
          </span>
          <div>
            <h2 className="sidebar-title">Election Admin</h2>
            <p className="sidebar-sub">Officer Allocation</p>
          </div>
          <button
            type="button"
            className="sidebar-close"
            onClick={onClose}
            aria-label="Close navigation menu"
          >
            ×
          </button>
        </div>

        <nav className="sidebar-nav">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              onClick={onClose}
            >
              <span className="sidebar-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          <span className="badge badge-navy">{roleLabel(user?.role) || '—'}</span>
          <span style={{ marginTop: 6, display: 'block' }}>Smart Polling Allocation System</span>
        </div>
      </aside>
    </>
  );
}