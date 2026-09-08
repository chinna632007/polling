import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Spinner from '../components/Spinner';
import Toast from '../components/Toast';
import StatCard from '../components/StatCard';
import Badge from '../components/Badge';

/**
 * Mandal Officer dashboard - shows ONLY the data of the officer's assigned
 * Mandal (server-scoped via /api/dashboard/stats + /api/allocation/mandals).
 */
export default function MandalDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [mandals, setMandals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.get('/api/dashboard/stats'), api.get('/api/allocation/mandals')])
      .then(([statsRes, mandalRes]) => {
        if (cancelled) return;
        setStats(statsRes.data.data);
        setMandals(mandalRes.data.data || []);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <Spinner label="Loading Mandal dashboard…" />;

  const myMandal = mandals.find(
    (m) => m.mandal?.toLowerCase() === (user?.assignedMandal || '').toLowerCase()
  );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Mandal Officer Dashboard</h1>
          <p className="page-subtitle">
            Data for <strong>{user?.assignedMandal || 'your Mandal'}</strong> — only your
            assigned Mandal is shown
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn btn-primary" to="/allocation">
            View Allocations
          </Link>
          <Link className="btn btn-secondary" to="/reports">
            Download Reports
          </Link>
        </div>
      </div>

      {error ? <Toast message={error} type="error" onClose={() => setError(null)} /> : null}

      {stats ? (
        <>
          <div className="stat-grid">
            <StatCard label="Total Booths" value={stats.totalBooths} icon="🏛️" tone="blue" />
            <StatCard label="Total Officers" value={stats.totalOfficers} icon="👤" tone="navy" />
            <StatCard
              label="Allocated Officers"
              value={stats.allocatedOfficers}
              icon="✅"
              tone="green"
            />
            <StatCard
              label="Pending Allocations"
              value={stats.pendingApproval}
              icon="⏳"
              tone="amber"
            />
            <StatCard
              label="Unallocated Officers"
              value={stats.unallocatedOfficers}
              icon="⚠️"
              tone="red"
            />
          </div>

          <div className="card">
            <h3 className="card-title">Booth-wise Allocation (my Mandal)</h3>
            {myMandal ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Mandal</th>
                      <th>Officers</th>
                      <th>Booths</th>
                      <th>Allocated</th>
                      <th>Pending</th>
                      <th>Unallocated</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <Badge>{myMandal.mandal}</Badge>
                      </td>
                      <td>{myMandal.officers}</td>
                      <td>{myMandal.booths}</td>
                      <td>{myMandal.allocated}</td>
                      <td>{myMandal.pending}</td>
                      <td>{myMandal.unallocated}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty-state">
                No data found for your assigned Mandal yet. Upload officers &amp; booths for{' '}
                {user?.assignedMandal || 'your Mandal'}.
              </p>
            )}
          </div>
        </>
      ) : (
        <p className="empty-state">Unable to load dashboard statistics.</p>
      )}
    </div>
  );
}