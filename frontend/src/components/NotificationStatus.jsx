import Badge from './Badge';

/** Renders one notification row with its delivery status. */
export default function NotificationStatus({ notifications = [], loading }) {
  if (loading) {
    return <p className="empty-state">Loading notifications…</p>;
  }
  if (!notifications.length) {
    return <p className="empty-state">No notifications have been sent yet.</p>;
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Officer</th>
            <th>Mobile</th>
            <th>Status</th>
            <th>Provider</th>
            <th>Provider ID</th>
            <th>Sent At</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>
          {notifications.map((n) => (
            <tr key={n._id}>
              <td>
                <div>{n.officer?.officerName || '—'}</div>
                <div className="muted mono">{n.officer?.officerId || ''}</div>
              </td>
              <td className="mono">{n.mobileNumber}</td>
              <td>
                <Badge>{n.status}</Badge>
              </td>
              <td>{n.provider || '—'}</td>
              <td className="mono">{n.providerMessageId || '—'}</td>
              <td>{n.sentAt ? new Date(n.sentAt).toLocaleString() : '—'}</td>
              <td>
                <details className="msg-details">
                  <summary>View message</summary>
                  <pre className="msg-content">{n.message}</pre>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}