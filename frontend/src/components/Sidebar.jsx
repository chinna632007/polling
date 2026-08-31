import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '📊', end: true },
  { to: '/officers', label: 'Officers', icon: '👤' },
  { to: '/booths', label: 'Booths', icon: '🏛️' },
  { to: '/upload', label: 'Excel Upload', icon: '📥' },
  { to: '/allocation', label: 'Allocation', icon: '🔄' },
  { to: '/notifications', label: 'Notifications', icon: '✉️' },
  { to: '/reports', label: 'Reports', icon: '📄' },
  { to: '/register', label: 'Register Admin', icon: '🛡️' },
];

/**
 * Responsive sidebar. On mobile it is a slide-out overlay controlled by the
 * parent (`open` / `onClose`).
 */
export default function Sidebar({ open, onClose }) {
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
          {NAV_ITEMS.map((item) => (
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

        <div className="sidebar-foot">Smart Polling Allocation System</div>
      </aside>
    </>
  );
}