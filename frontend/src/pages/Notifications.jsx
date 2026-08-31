import { useEffect, useState, useCallback } from 'react';
import api, { getErrorMessage } from '../services/api';
import NotificationStatus from '../components/NotificationStatus';
import Spinner from '../components/Spinner';
import Toast from '../components/Toast';

const STATUS_FILTERS = ['', 'SEND', 'PENDING', 'DELIVERED', 'FAILED'];

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [notify, setNotify] = useState(null);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page };
      if (status) params.status = status;
      const { data } = await api.get('/api/notifications', { params });
      setNotifications(data.data);
      setPagination(data.pagination);
    } catch (err) {
      setNotify({ message: getErrorMessage(err), type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    fetchNotifications().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status]);

  return (
    <div className="page">
      {notify ? <Toast {...notify} onClose={() => setNotify(null)} /> : null}

      <div className="page-head">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-subtitle">
            SMS delivery status for every polling-duty message sent to officers
          </p>
        </div>
      </div>

      <div className="toolbar card">
        <select
          className="input"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s || 'all'} value={s}>
              {s || 'All Statuses'}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setStatus('');
            setPage(1);
          }}
        >
          Clear
        </button>
      </div>

      {loading && notifications.length === 0 ? (
        <Spinner label="Loading notifications…" />
      ) : (
        <NotificationStatus notifications={notifications} loading={false} />
      )}

      {pagination.pages > 1 && (
        <div className="pagination">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Prev
          </button>
          <span className="muted">
            Page {page} / {pagination.pages}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={page >= pagination.pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}