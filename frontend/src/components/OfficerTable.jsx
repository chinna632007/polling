import Badge from './Badge';

/**
 * Officers table. Scrolls horizontally on small screens.
 * onEdit / onDelete receive the officer document.
 */
export default function OfficerTable({ officers = [], onEdit, onDelete, loading }) {
  if (loading) {
    return <p className="empty-state">Loading officers…</p>;
  }
  if (!officers.length) {
    return <p className="empty-state">No officers found. Upload or add one to begin.</p>;
  }

  // Role-aware: when the logged-in user may not edit/delete, hide the column entirely.
  const showActions = Boolean(onEdit) || Boolean(onDelete);

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Officer ID</th>
            <th>Officer Name</th>
            <th>Designation</th>
            <th>Mobile</th>
            <th>Locality</th>
            <th>Ward</th>
            <th>Mandal</th>
            <th>District</th>
            <th>PIN</th>
            {showActions ? <th className="col-actions">Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {officers.map((o) => (
            <tr key={o._id}>
              <td>
                <span className="mono">{o.officerId}</span>
              </td>
              <td>{o.officerName}</td>
              <td>{o.designation}</td>
              <td className="mono">{o.mobileNumber}</td>
              <td>{o.locality || '—'}</td>
              <td>{o.ward || '—'}</td>
              <td>
                <Badge>{o.mandal || '—'}</Badge>
              </td>
              <td>{o.district || '—'}</td>
              <td className="mono">{o.pinCode || '—'}</td>
              {showActions ? (
                <td className="col-actions">
                  <div className="row-actions">
                    {onEdit ? (
                      <button type="button" className="btn btn-ghost btn-xs" onClick={() => onEdit(o)}>
                        Edit
                      </button>
                    ) : null}
                    {onDelete ? (
                      <button
                        type="button"
                        className="btn btn-danger btn-xs"
                        onClick={() => onDelete(o)}
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}