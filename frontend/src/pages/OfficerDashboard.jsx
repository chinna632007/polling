import { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Spinner from '../components/Spinner';
import Toast from '../components/Toast';
import Badge from '../components/Badge';

/**
 * Booth Officer dashboard - shows ONLY the officer's own profile, their
 * allocated booth, booth details, mandal and allocation status. This data
 * comes from /api/auth/my-dashboard so other officers' details are never
 * exposed.
 */
export default function OfficerDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/api/auth/my-dashboard')
      .then(({ data: res }) => {
        if (!cancelled) setData(res.data);
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

  if (loading) return <Spinner label="Loading your duty details…" />;

  const officer = data?.officer;
  const allocation = data?.allocation;
  const booth = data?.booth;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">My Polling Duty</h1>
          <p className="page-subtitle">
            Welcome, {officer?.officerName || user?.name || user?.username}
          </p>
        </div>
      </div>

      {error ? <Toast message={error} type="error" onClose={() => setError(null)} /> : null}

      {!officer ? (
        <div className="card">
          <h3 className="card-title">Profile Not Linked</h3>
          <p className="hint-text">
            Your account is not yet linked to an officer record. Please contact the District
            Admin to link your user account to your Officer ID.
          </p>
        </div>
      ) : null}

      {officer ? (
        <div className="stat-grid">
          <StatCardSimple label="Officer Name" value={officer.officerName} icon="👤" />
          <StatCardSimple label="Officer ID" value={officer.officerId} icon="🪪" />
          <StatCardSimple label="Designation" value={officer.designation || '—'} icon="💼" />
          <StatCardSimple label="Mobile" value={officer.mobileNumber || '—'} icon="📱" />
        </div>
      ) : null}

      {booth ? (
        <div className="card">
          <div className="upload-head">
            <h3 className="card-title">My Allocated Polling Booth</h3>
            <Badge tone={allocation?.status === 'Allocated' ? 'green' : 'amber'}>
              {allocation?.status || 'Pending Approval'}
            </Badge>
          </div>
          <div className="officer-duty-grid">
            <div className="duty-item">
              <span className="duty-label">Booth Number</span>
              <strong className="mono">{booth.boothNumber || '—'}</strong>
            </div>
            <div className="duty-item">
              <span className="duty-label">Booth Name</span>
              <strong>{booth.boothName || '—'}</strong>
            </div>
            <div className="duty-item">
              <span className="duty-label">Building</span>
              <strong>{booth.buildingName || '—'}</strong>
            </div>
            <div className="duty-item">
              <span className="duty-label">Location</span>
              <strong>{[booth.locality, booth.street].filter(Boolean).join(', ') || '—'}</strong>
            </div>
            <div className="duty-item">
              <span className="duty-label">Mandal</span>
              <strong>{booth.mandal || '—'}</strong>
            </div>
            <div className="duty-item">
              <span className="duty-label">District</span>
              <strong>{booth.district || '—'}</strong>
            </div>
            <div className="duty-item">
              <span className="duty-label">Ward</span>
              <strong>{booth.ward || '—'}</strong>
            </div>
            <div className="duty-item">
              <span className="duty-label">PIN Code</span>
              <strong className="mono">{booth.pinCode || '—'}</strong>
            </div>
          </div>
          {allocation ? (
            <p className="hint-text" style={{ marginTop: 12 }}>
              Allocation ID: <span className="mono">{allocation.allocationId}</span> · Approval:{' '}
              {allocation.adminApproved ? 'Approved' : 'Pending'}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="card">
          <h3 className="card-title">No Allocation Yet</h3>
          <p className="hint-text">
            {officer
              ? 'You have not been assigned to a polling booth yet. You will see your booth details here once the allocation is completed.'
              : 'You do not have any duty assignment.'}
          </p>
        </div>
      )}
    </div>
  );
}

/** Compact stat tile used on the personal duty page. */
function StatCardSimple({ label, value, icon }) {
  return (
    <div className="stat-card stat-navy">
      <div className="stat-top">
        <span className="stat-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="stat-value">{value ?? '—'}</span>
      </div>
      <div className="stat-label">{label}</div>
    </div>
  );
}