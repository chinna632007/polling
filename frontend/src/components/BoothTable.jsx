import Badge from './Badge';

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
            <th className="col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          {booths.map((b) => {
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
                <td className="col-actions">
                  <div className="row-actions">
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => onEdit(b)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-xs"
                      onClick={() => onDelete(b)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}