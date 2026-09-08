import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../services/api';
import Spinner from '../components/Spinner';
import Toast from '../components/Toast';
import StatCard from '../components/StatCard';

/**
 * Allocation Officer dashboard - focuses on the allocation workflow:
 * available officers, booths, allocation progress and controls.
 */
export default function AllocationDashboard() {
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

  if (loading) return <Spinner label="Loading allocation dashboard…" />;

  const capacity = stats?.totalBoothCapacity || 0;
  const progress = capacity > 0 ? Math.round(((stats.allocatedOfficers || 0) / capacity) * 100) : 0;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Allocation Officer Dashboard</h1>
          <p className="page-subtitle">
            Available officers, booth capacity and allocation progress
          </p>
        </div>
        <Link className="btn btn-primary" to="/allocation">
          ▶ Open Allocation
        </Link>
      </div>

      {error ? <Toast message={error} type="error" onClose={() => setError(null)} /> : null}

      {stats ? (
        <>
          <div className="stat-grid">
            <StatCard label="Available Officers" value={stats.totalOfficers} icon="👤" tone="navy" />
            <StatCard label="Total Booths" value={stats.totalBooths} icon="🏛️" tone="blue" />
            <StatCard
              label="Allocated Officers"
              value={stats.allocatedOfficers}
              icon="✅"
              tone="green"
              sub={`of ${capacity} booth slots (${progress}%)`}
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
          </div>

          <div className="card">
            <h3 className="card-title">Allocation Progress</h3>
            <div className="progress-wrap">
              <div
                className="progress-bar"
                style={{ width: `${Math.min(100, progress)}%` }}
              />
            </div>
            <p className="hint-text" style={{ marginTop: 8 }}>
              {progress}% of booth slots filled. Run the allocation algorithm to assign
              remaining available officers.
            </p>
          </div>
        </>
      ) : (
        <p className="empty-state">Unable to load dashboard statistics.</p>
      )}
    </div>
  );
}