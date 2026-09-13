import Badge from './Badge';
import { compareBoothIds } from '../utils/naturalSort';

/**
 * Booths table. Scrolls horizontally on small screens.
 * onEdit / onDelete receive the booth document.
 */
export default function BoothTable({ booths = [], onEdit, onDelete, loading }) {
  if (loading) {
    return <p className="empty-state">Loading booths…</p>;
  }
  if (!booths.length) {
    return <p className="empty-state">No booths found. Upload or add one to begin.</p>;
  }

  // Role-aware: when the logged-in user may not edit/delete, hide the column entirely.
  const showActions = Boolean(onEdit) || Boolean(onDelete);

  // Defensive natural sort by Booth ID ascending (PB2 < PB10).
  const sorted = [...booths].sort((a, b) => compareBoothIds(a.boothId, b.boothId));

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Booth ID</th>
            <th>No.</th>
            <th>Booth Name</th>
            <th>Building</th>
            <th>Locality</th>
            <th>Ward</th>
            <th>Mandal</th>
            <th>Required</th>
            <th>Allocated</th>
            {showActions ? <th className="col-actions">Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {sorted.map((b) => {
            const vacant = Math.max(0, b.requiredOfficers - b.allocatedOfficerCount);
            return (
              <tr key={b._id}>
                <td>
                  <span className="mono">{b.boothId}</span>
                </td>
                <td className="mono">{b.boothNumber}</td>
                <td>{b.boothName}</td>
                <td>{b.buildingName || '—'}</td>
                <td>{b.locality || '—'}</td>
                <td>{b.ward || '—'}</td>
                <td>
                  <Badge>{b.mandal || '—'}</Badge>
                </td>
                <td className="mono">{b.requiredOfficers}</td>
                <td>
                  <Badge tone={vacant > 0 ? 'amber' : 'green'}>
                    {b.allocatedOfficerCount}/{b.requiredOfficers}
                  </Badge>
                </td>
                {showActions ? (
                  <td className="col-actions">
                    <div className="row-actions">
                      {onEdit ? (
                        <button type="button" className="btn btn-ghost btn-xs" onClick={() => onEdit(b)}>
                          Edit
                        </button>
                      ) : null}
                      {onDelete ? (
                        <button
                          type="button"
                          className="btn btn-danger btn-xs"
                          onClick={() => onDelete(b)}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}