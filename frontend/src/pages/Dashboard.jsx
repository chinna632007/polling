import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../services/api';
import Spinner from '../components/Spinner';
import Toast from '../components/Toast';
import StatCard from '../components/StatCard';
import Badge from '../components/Badge';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/api/dashboard/stats')
      .then(({ data }) => {
        if (!cancelled) setStats(data.data);
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

  if (loading) return <Spinner label="Loading dashboard…" />;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Election officer allocation overview</p>
        </div>
        <Link className="btn btn-primary" to="/allocation">
          Run / View Allocation
        </Link>
      </div>

      {error ? <Toast message={error} type="error" onClose={() => setError(null)} /> : null}

      {stats ? (
        <>
          <div className="stat-grid">
            <StatCard label="Total Officers" value={stats.totalOfficers} icon="👤" tone="navy" />
            <StatCard label="Total Booths" value={stats.totalBooths} icon="🏛️" tone="blue" />
            <StatCard
              label="Allocated Officers"
              value={stats.allocatedOfficers}
              icon="✅"
              tone="green"
              sub={`of ${stats.totalBoothCapacity} booth slots`}
            />
            <StatCard
              label="Unallocated Officers"
              value={stats.unallocatedOfficers}
              icon="⚠️"
              tone="red"
            />
            <StatCard
              label="Pending Approval"
              value={stats.pendingApproval}
              icon="⏳"
              tone="amber"
            />
            <StatCard
              label="Notifications Sent"
              value={stats.notificationsSent}
              icon="✉️"
              tone="purple"
            />
          </div>

          <div className="card">
            <h3 className="card-title">Mandal Summary</h3>
            {stats.byMandal.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Mandal</th>
                      <th>Officers</th>
                      <th>Allocated</th>
                      <th>Vacant Slots</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.byMandal.map((row) => (
                      <tr key={row.mandal}>
                        <td>
                          <Badge>{row.mandal}</Badge>
                        </td>
                        <td>{row.officers}</td>
                        <td>{row.allocated}</td>
                        <td>{row.vacant}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty-state">No data yet. Upload officers &amp; booths first.</p>
            )}
          </div>
        </>
      ) : (
        <p className="empty-state">Unable to load dashboard statistics.</p>
      )}
    </div>
  );
}