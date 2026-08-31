import { useEffect, useState, useCallback } from 'react';
import api, { getErrorMessage } from '../services/api';
import AllocationTable from '../components/AllocationTable';
import Spinner from '../components/Spinner';
import Toast from '../components/Toast';
import ConfirmModal from '../components/ConfirmModal';
import { docDownload } from '../services/download';

const STATUS_FILTERS = ['', 'Pending Approval', 'Allocated', 'Unallocated', 'Cancelled'];

export default function Allocation() {
  const [allocations, setAllocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [notify, setNotify] = useState(null);

  const [runResult, setRunResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [confirmRun, setConfirmRun] = useState(false);

  const [actionTarget, setActionTarget] = useState(null);
  const [actionType, setActionType] = useState(null); // approve | reallocate | cancel | sms
  const [acting, setActing] = useState(false);
  const [sendingIds, setSendingIds] = useState(new Set());

  const fetchAllocations = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page };
      if (search) params.search = search;
      if (status) params.status = status;
      const { data } = await api.get('/api/allocation', { params });
      setAllocations(data.data);
      setPagination(data.pagination);
    } catch (err) {
      setNotify({ message: getErrorMessage(err), type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    fetchAllocations().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, status]);

  // --- Run the full allocation algorithm (confirmation-gated) ----------------
  const handleRunAllocation = async () => {
    setConfirmRun(false);
    setRunning(true);
    try {
      const { data } = await api.post('/api/allocation/run');
      setRunResult(data.data);
      setNotify({ message: data.message, type: 'success' });
      await fetchAllocations();
    } catch (err) {
      setNotify({ message: getErrorMessage(err), type: 'error' });
    } finally {
      setRunning(false);
    }
  };

  // --- Generic action runner ---------------------------------------------------
  const openAction = (target, type) => {
    setActionTarget(target);
    setActionType(type);
  };

  const closeAction = () => {
    setActionTarget(null);
    setActionType(null);
  };

  const confirmAction = async () => {
    if (!actionTarget || !actionType) return;
    setActing(true);
    try {
      const id = actionTarget._id;
      let res;
      if (actionType === 'approve') {
        res = await api.post(`/api/allocation/${id}/approve`);
      } else if (actionType === 'reallocate') {
        res = await api.post(`/api/allocation/${id}/reallocate`);
      } else if (actionType === 'cancel') {
        res = await api.post(`/api/allocation/${id}/cancel`);
      } else if (actionType === 'sms') {
        setSendingIds((prev) => new Set(prev).add(id));
        res = await api.post(`/api/notifications/send/${id}`);
      }
      const message =
        res?.data?.message ||
        (actionType === 'approve'
          ? 'Allocation approved'
          : actionType === 'reallocate'
            ? 'Officer reallocated'
            : actionType === 'cancel'
              ? 'Allocation cancelled'
              : 'Notification sent');
      setNotify({ message, type: 'success' });
      closeAction();
      await fetchAllocations();
    } catch (err) {
      setNotify({ message: getErrorMessage(err), type: 'error' });
      closeAction();
    } finally {
      setActing(false);
      setSendingIds(new Set());
    }
  };

  const actionCopy = {
    approve: {
      title: 'Approve Allocation',
      message: `Approve the allocation of ${actionTarget?.officer?.officerName} to booth ${actionTarget?.booth?.boothNumber}?`,
      confirm: 'Approve',
      tone: 'success',
    },
    reallocate: {
      title: 'Reallocate Officer',
      message: `Automatically move ${actionTarget?.officer?.officerName} to the next best suitable booth in the same Mandal?`,
      confirm: 'Reallocate',
      tone: 'primary',
    },
    cancel: {
      title: 'Cancel Allocation',
      message: `Cancel the allocation of ${actionTarget?.officer?.officerName}? The booth slot will be freed for another officer.`,
      confirm: 'Cancel Allocation',
      tone: 'danger',
    },
    sms: {
      title: 'Send SMS Notification',
      message: `Send the polling-duty SMS to ${actionTarget?.officer?.officerName} (${actionTarget?.officer?.mobileNumber})?`,
      confirm: 'Send SMS',
      tone: 'primary',
    },
  }[actionType] || { title: 'Confirm', message: '', confirm: 'OK', tone: 'primary' };

  return (
    <div className="page">
      {notify ? <Toast {...notify} onClose={() => setNotify(null)} /> : null}

      <div className="page-head">
        <div>
          <h1 className="page-title">Allocation</h1>
          <p className="page-subtitle">
            Run the smart allocation algorithm, then approve / reallocate / notify officers
          </p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => docDownload('/api/reports/allocation-excel')}
          >
            Download Report
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setConfirmRun(true)}
            disabled={running}
          >
            {running ? 'Running…' : 'Run Allocation'}
          </button>
        </div>
      </div>
{runResult ? (
        <div className="alert alert-info">
          <strong>Last allocation run:</strong> {runResult.allocated} allocated,{' '}
          {runResult.unallocated} unallocated, {runResult.skipped} skipped (already allocated)
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRunResult(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="toolbar card">
        <input
          className="input"
          placeholder="Search officer / booth"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
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
            setSearch('');
            setStatus('');
            setPage(1);
          }}
        >
          Clear
        </button>
      </div>

      {loading && allocations.length === 0 ? (
        <Spinner label="Loading allocations…" />
      ) : (
        <AllocationTable
          allocations={allocations}
          loading={false}
          onApprove={(a) => openAction(a, 'approve')}
          onReallocate={(a) => openAction(a, 'reallocate')}
          onCancel={(a) => openAction(a, 'cancel')}
          onSendNotification={(a) => openAction(a, 'sms')}
          sendingIds={sendingIds}
        />
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

      <ConfirmModal
        open={confirmRun}
        title="Run Allocation Algorithm"
        message="This will evaluate every unallocated officer against every booth in their Mandal and create new allocations. Existing allocations are not overwritten. Continue?"
        confirmLabel="Run Allocation"
        loading={running}
        onConfirm={handleRunAllocation}
        onCancel={() => setConfirmRun(false)}
      />

      <ConfirmModal
        open={Boolean(actionTarget)}
        title={actionCopy.title}
        message={actionCopy.message}
        confirmLabel={actionCopy.confirm}
        tone={actionCopy.tone}
        loading={acting}
        onConfirm={confirmAction}
        onCancel={closeAction}
      />
    </div>
  );
}