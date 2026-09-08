import { useEffect, useState, useCallback } from 'react';
import api, { getErrorMessage } from '../services/api';
import AllocationTable from '../components/AllocationTable';
import MandalSection from '../components/MandalSection';
import Spinner from '../components/Spinner';
import Toast from '../components/Toast';
import ConfirmModal from '../components/ConfirmModal';
import { docDownload } from '../services/download';
import { useAuth } from '../context/AuthContext';
import { canManageData, isSuperAdmin } from '../utils/roles';

const STATUS_FILTERS = ['', 'Pending Approval', 'Allocated', 'Unallocated', 'Cancelled'];

export default function Allocation() {
  const { user } = useAuth();
  const canManage = canManageData(user);
  const isAdmin = isSuperAdmin(user);

  // Per-Mandal overview returned by /api/allocation/mandals.
  const [mandals, setMandals] = useState([]);
  // Map { mandalName: allocationRows[] } - each Mandal gets its OWN table.
  const [allocationsByMandal, setAllocationsByMandal] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [notify, setNotify] = useState(null);

  const [runResult, setRunResult] = useState(null);
  const [runningMandal, setRunningMandal] = useState(null); // mandal name or 'ALL'
  // Which run to confirm: { mandal: null } = all mandals.
  const [confirmRun, setConfirmRun] = useState(null);

  const [actionTarget, setActionTarget] = useState(null);
  const [actionType, setActionType] = useState(null); // approve | reallocate | cancel | sms
  const [acting, setActing] = useState(false);
  const [sendingIds, setSendingIds] = useState(new Set());

  // Delete-all / delete-mandal confirmation state.
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [deleteMandalTarget, setDeleteMandalTarget] = useState(null);
  const [deletingMandal, setDeletingMandal] = useState(false);

  /**
   * Loads EVERY Mandal's allocations separately (never joined together).
   * Each Mandal gets its own table on the page.
   */
  const fetchAllocations = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 500 };
      if (search) params.search = search;
      if (status) params.status = status;

      const { data: mandalData } = await api.get('/api/allocation/mandals');
      const names = (mandalData.data || []).map((m) => m.mandal);

      const results = await Promise.all(
        names.map((name) =>
          api
            .get('/api/allocation', { params: { ...params, mandal: name } })
            .then((res) => [name, res.data.data || []])
            .catch(() => [name, []])
        )
      );
      setMandals(mandalData.data || []);
      setAllocationsByMandal(Object.fromEntries(results));
    } catch (err) {
      setNotify({ message: getErrorMessage(err), type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    fetchAllocations().catch(() => {});
  }, [fetchAllocations]);

  // --- Run the allocation algorithm for ONE mandal or ALL (confirm-gated) ----
  const handleRunAllocation = async () => {
    const mandal = confirmRun?.mandal ?? null;
    setConfirmRun(null);
    setRunningMandal(mandal || 'ALL');
    try {
      const config = mandal ? { params: { mandal } } : undefined;
      const { data } = await api.post('/api/allocation/run', null, config);
      setRunResult(data.data);
      setNotify({ message: data.message, type: 'success', duration: 8000 });
      await fetchAllocations();
    } catch (err) {
      setNotify({ message: getErrorMessage(err), type: 'error', duration: 8000 });
    } finally {
      setRunningMandal(null);
    }
  };

  // --- Delete every allocation / one Mandal's allocations --------------------
  const doDeleteAllAllocations = async () => {
    setDeletingAll(true);
    try {
      const { data } = await api.delete('/api/allocation/all');
      setNotify({ message: data.message || 'All allocations deleted', type: 'success', duration: 8000 });
      setConfirmDeleteAll(false);
      await fetchAllocations();
    } catch (err) {
      setNotify({ message: getErrorMessage(err), type: 'error', duration: 8000 });
      setConfirmDeleteAll(false);
    } finally {
      setDeletingAll(false);
    }
  };

  const doDeleteMandalAllocations = async () => {
    if (!deleteMandalTarget) return;
    setDeletingMandal(true);
    try {
      const { data } = await api.delete(
        `/api/allocation/mandal/${encodeURIComponent(deleteMandalTarget)}`
      );
      setNotify({
        message: data.message || `Deleted allocations in Mandal '${deleteMandalTarget}'`,
        type: 'success',
        duration: 8000,
      });
      setDeleteMandalTarget(null);
      await fetchAllocations();
    } catch (err) {
      setNotify({ message: getErrorMessage(err), type: 'error', duration: 8000 });
      setDeleteMandalTarget(null);
    } finally {
      setDeletingMandal(false);
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
            Run the smart allocation algorithm per Mandal, then approve / reallocate / notify
            officers — every Mandal is handled separately
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
          {isAdmin ? (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => setConfirmDeleteAll(true)}
              disabled={deletingAll || mandals.every((m) => m.total === 0)}
            >
              🗑 Delete All Allocations
            </button>
          ) : null}
          {canManage ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setConfirmRun({ mandal: null })}
              disabled={runningMandal !== null}
            >
              {runningMandal === 'ALL' ? 'Running…' : '▶ Run Allocation (All)'}
            </button>
          ) : null}
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
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
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
          }}
        >
          Clear
        </button>
      </div>

      {loading && mandals.length === 0 ? (
        <Spinner label="Loading allocations…" />
      ) : mandals.length === 0 ? (
        <p className="empty-state">
          No allocations found. Upload officers &amp; booths, then run the allocation algorithm.
        </p>
      ) : (
        /* ONE independent section per Mandal - they are never joined together. */
        mandals.map((m) => (
          <MandalSection
            key={m.mandal}
            title={m.mandal}
            badgeLabel="allocations"
            count={m.total}
            stats={[
              { label: 'Allocated', value: m.allocated, tone: 'green' },
              { label: 'Pending', value: m.pending, tone: 'amber' },
              { label: 'Unallocated', value: m.unallocated, tone: 'red' },
            ]}
            actions={
              <>{canManage ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={runningMandal !== null}
                  onClick={() => setConfirmRun({ mandal: m.mandal })}
                >
                  {runningMandal === m.mandal ? 'Running…' : '▶ Run Allocation'}
                </button>
              ) : null}
              {isAdmin ? (
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  disabled={m.total === 0}
                  onClick={() => setDeleteMandalTarget(m.mandal)}
                >
                  Delete Mandal
                </button>
              ) : null}
              </>
            }
          >
            <AllocationTable
              allocations={allocationsByMandal[m.mandal] || []}
              loading={false}
              onApprove={canManage ? (a) => openAction(a, 'approve') : undefined}
              onReallocate={canManage ? (a) => openAction(a, 'reallocate') : undefined}
              onCancel={canManage ? (a) => openAction(a, 'cancel') : undefined}
              onSendNotification={canManage ? (a) => openAction(a, 'sms') : undefined}
              sendingIds={sendingIds}
            />
          </MandalSection>
        ))
      )}

      <ConfirmModal
        open={Boolean(confirmRun)}
        title={
          confirmRun?.mandal
            ? `Run Allocation — ${confirmRun.mandal}`
            : 'Run Allocation — All Mandals'
        }
        message={
          confirmRun?.mandal
            ? `This evaluates every unallocated officer in Mandal '${confirmRun.mandal}' against every booth in the same Mandal and creates new allocations. Existing allocations are not overwritten. Continue?`
            : 'This evaluates every unallocated officer (all Mandals) against the booths of their own Mandal and creates new allocations. Each Mandal is processed strictly separately. Existing allocations are not overwritten. Continue?'
        }
        confirmLabel="Run Allocation"
        tone="primary"
        loading={runningMandal !== null}
        onConfirm={handleRunAllocation}
        onCancel={() => setConfirmRun(null)}
      />

      <ConfirmModal
        open={confirmDeleteAll}
        title="Delete ALL Allocations"
        message="This permanently deletes every allocation record in every Mandal and resyncs all booth counters. Officers and booths themselves are NOT deleted. This cannot be undone."
        confirmLabel="Delete Everything"
        tone="danger"
        loading={deletingAll}
        onConfirm={doDeleteAllAllocations}
        onCancel={() => setConfirmDeleteAll(false)}
      />

      <ConfirmModal
        open={Boolean(deleteMandalTarget)}
        title={`Delete Allocations — ${deleteMandalTarget}`}
        message={`This deletes every allocation of Mandal '${deleteMandalTarget}' only and resyncs its booth counters. Other Mandals are not affected. This cannot be undone.`}
        confirmLabel="Delete Mandal Allocations"
        tone="danger"
        loading={deletingMandal}
        onConfirm={doDeleteMandalAllocations}
        onCancel={() => setDeleteMandalTarget(null)}
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