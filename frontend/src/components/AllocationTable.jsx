import Badge from './Badge';
import { addressCompatibilityLabel, localityLine } from './addressCompatibility';

/**
 * Full allocation table used on the Allocation page.
 *
 * Columns (spec section 12):
 *   S.No / Officer ID / Name / Designation / Mobile / Mandal /
 *   Officer Locality / Booth No. / Booth Name / Building / Booth Locality /
 *   Status / Allocation Date / Actions
 */
function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

export default function AllocationTable({
  allocations = [],
  loading,
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

  const showActions = Boolean(onReallocate) || Boolean(onCancel) || Boolean(onSendNotification);

  return (
    <div className="table-wrap">
      <table className="table table-allocations">
        <thead>
          <tr>
            <th>S.No</th>
            <th>Officer ID</th>
            <th>Officer Name</th>
            <th>Designation</th>
            <th>Mobile</th>
            <th>Mandal</th>
            <th>Officer Locality</th>
            <th>Booth No.</th>
            <th>Booth Name</th>
            <th>Building</th>
            <th>Booth Locality</th>
            <th>Status</th>
            <th>Allocation Date</th>
            <th>Address Compatibility</th>
            {showActions ? <th className="col-actions">Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {allocations.map((a, index) => {
            const compatibility = addressCompatibilityLabel(a);
            const active = a.status === 'ALLOCATED';
            return (
              <tr key={a._id}>
                <td className="mono">{index + 1}</td>
                <td>
                  <span className="mono">{a.officer?.officerId || '—'}</span>
                </td>
                <td>{a.officer?.officerName || '—'}</td>
                <td>{a.officer?.designation || '—'}</td>
                <td className="mono">{a.officer?.mobileNumber || '—'}</td>
                <td>{a.mandal || a.officer?.mandal || '—'}</td>
                <td>{localityLine(a.officer)}</td>
                <td className="mono">{a.booth?.boothNumber || '—'}</td>
                <td>{a.booth?.boothName || '—'}</td>
                <td>{a.booth?.buildingName || '—'}</td>
                <td>{localityLine(a.booth)}</td>
                <td>
                  <Badge tone={active ? 'green' : a.status === 'CANCELLED' ? 'red' : 'amber'}>{a.status}</Badge>
                </td>
                <td className="mono">{formatDate(a.allocationDate || a.createdAt)}</td>
                <td>
                  <Badge tone={compatibility.tone}>
                    {compatibility.label}
                  </Badge>
                </td>
                {showActions ? (
                  <td className="col-actions">
                    <div className="row-actions row-actions-wrap">
                      {active ? (
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
                          {onSendNotification ? (
                            <button
                              type="button"
                              className="btn btn-primary btn-xs"
                              disabled={sendingIds.has(a._id)}
                              onClick={() => onSendNotification(a)}
                            >
                              {sendingIds.has(a._id) ? 'Sending…' : 'Send Notification'}
                            </button>
                          ) : null}
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
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