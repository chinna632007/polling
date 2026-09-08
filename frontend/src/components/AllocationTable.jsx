import Badge from './Badge';
import { addressCompatibilityLabel, localityLine } from './addressCompatibility';

/**
 * Full allocation table used on the Allocation page.
 *
 * Columns: Officer ID / Name / Mobile / Officer Locality / Mandal /
 *          Booth Number / Booth Name / Booth Locality / Address Compatibility /
 *          Allocation Status / Approval Status / Actions
 *
 * Rows with a same-locality (invalid) allocation are highlighted in red.
 */
export default function AllocationTable({
  allocations = [],
  loading,
  onApprove,
  onReallocate,
  onCancel,
  onSendNotification,
  sendingIds = new Set(),
}) {
  if (loading) {
    return <p className="empty-state">Loading allocations…</p>;
  }
  if (!allocations.length) {
    return <p className="empty-state">
      No allocations found. Run the allocation algorithm to begin.
    </p>;
  }

  // Role-aware: when the user cannot manage allocations, hide the actions column.
  const showActions = Boolean(onApprove) || Boolean(onReallocate) || Boolean(onCancel) || Boolean(onSendNotification);

  return (
    <div className="table-wrap">
      <table className="table table-allocations">
        <thead>
          <tr>
            <th>Officer ID</th>
            <th>Officer Name</th>
            <th>Mobile</th>
            <th>Officer Locality</th>
            <th>Mandal</th>
            <th>Booth No.</th>
            <th>Booth Name</th>
            <th>Booth Locality</th>
            <th>Address Compatibility</th>
            <th>Status</th>
            <th>Approval</th>
            {showActions ? <th className="col-actions">Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {allocations.map((a) => {
            const compatibility = addressCompatibilityLabel(a);
            const invalid = compatibility.tone === 'red';
            const allocated =
              a.status === 'Allocated' || a.status === 'Pending Approval';
            return (
              <tr key={a._id} className={invalid ? 'row-invalid' : ''}>
                <td>
                  <span className="mono">{a.officer?.officerId || '—'}</span>
                </td>
                <td>{a.officer?.officerName || '—'}</td>
                <td className="mono">{a.officer?.mobileNumber || '—'}</td>
                <td>{localityLine(a.officer)}</td>
                <td>{a.mandal || a.officer?.mandal || '—'}</td>
                <td className="mono">{a.booth?.boothNumber || '—'}</td>
                <td>{a.booth?.boothName || '—'}</td>
                <td>{localityLine(a.booth)}</td>
                <td>
                  <Badge tone={compatibility.tone}>
                    {compatibility.label} {invalid ? '' : `(${compatibility.score}%)`}
                  </Badge>
                  {invalid ? (
                    <div className="inline-note">Address conflict – review</div>
                  ) : null}
                </td>
                <td>
                  <Badge>{a.status}</Badge>
                </td>
                <td>
                  <Badge tone={a.adminApproved ? 'green' : 'amber'}>
                    {a.adminApproved ? 'Approved' : 'Pending Approval'}
                  </Badge>
                </td>
                {showActions ? (
                  <td className="col-actions">
                    <div className="row-actions row-actions-wrap">
                      {allocated && !a.adminApproved && onApprove ? (
                        <button
                          type="button"
                          className="btn btn-success btn-xs"
                          onClick={() => onApprove(a)}
                        >
                          Approve
                        </button>
                      ) : null}
                      {allocated && (
                        <>
                          {onReallocate ? (
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs"
                              onClick={() => onReallocate(a)}
                            >
                              Reallocate
                            </button>
                          ) : null}
                          {onCancel ? (
                            <button
                              type="button"
                              className="btn btn-danger btn-xs"
                              onClick={() => onCancel(a)}
                            >
                              Cancel
                            </button>
                          ) : null}
                        </>
                      )}
                      {allocated && a.adminApproved && onSendNotification ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-xs"
                          disabled={sendingIds.has(a._id)}
                          onClick={() => onSendNotification(a)}
                        >
                          {sendingIds.has(a._id) ? 'Sending…' : 'Send Notification'}
                        </button>
                      ) : null}
                      {!allocated && <span className="muted">—</span>}
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