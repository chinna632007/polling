import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homeForRole } from '../utils/roles';

/**
 * Shown when a signed-in user tries to open a page that isn't allowed for
 * their role (e.g. a Mandal Officer opening /admin/dashboard).
 */
export default function AccessDenied() {
  const { user } = useAuth();

  return (
    <div className="page" style={{ textAlign: 'center', paddingTop: 40 }}>
      <div className="card" style={{ maxWidth: 520, margin: '0 auto', padding: 40 }}>
        <div style={{ fontSize: 56 }} aria-hidden="true">
          🚫
        </div>
        <h1 className="page-title" style={{ margin: '12px 0 8px' }}>
          Access Denied
        </h1>
        <p className="page-subtitle" style={{ marginBottom: 20 }}>
          You do not have permission to access this page.
          {user?.assignedMandal ? ` Your access is limited to Mandal: ${user.assignedMandal}.` : ''}
        </p>
        <div className="page-actions" style={{ justifyContent: 'center' }}>
          <Link className="btn btn-primary" to={homeForRole(user?.role)}>
            Go to My Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}