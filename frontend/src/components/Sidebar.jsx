import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { roleLabel } from '../utils/roles';

/** Single Main Admin navigation. */
const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊', end: true },
  { to: '/upload', label: 'Excel Upload', icon: '📥' },
  { to: '/officers', label: 'Officers', icon: '👤' },
  { to: '/booths', label: 'Booths', icon: '🏛️' },
  { to: '/allocation', label: 'Allocation', icon: '🔄' },
  { to: '/notifications', label: 'Notifications', icon: '✉️' },
  { to: '/reports', label: 'Reports', icon: '📄' },
];

/**
 * Responsive sidebar for the single Main Admin.
 */
export default function Sidebar({ open, onClose }) {
  const { user } = useAuth();
  const items = NAV_ITEMS;

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