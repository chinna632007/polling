import { useEffect, useState, useCallback, useMemo } from 'react';
import api, { getErrorMessage } from '../services/api';
import AllocationTable from '../components/AllocationTable';
import BoothWiseAllocation from '../components/BoothWiseAllocation';
import ReallocateModal from '../components/ReallocateModal';
import StatCard from '../components/StatCard';
import Spinner from '../components/Spinner';
import Toast from '../components/Toast';
import ConfirmModal from '../components/ConfirmModal';
import { docDownload } from '../services/download';
import { sortByOfficerId } from '../utils/naturalSort';

const TABS = [
  { id: 'allocated', label: 'Allocated Officers' },
  { id: 'unallocated', label: 'Unallocated Officers' },
  { id: 'boothwise', label: 'Booth-wise Allocation' },
  { id: 'history', label: 'Allocation History' },
];

function successRate(allocated, totalOfficers) {
  if (!totalOfficers) return '0.00%';
  return `${((allocated / totalOfficers) * 100).toFixed(2)}%`;
}

export default function Allocation() {
  const [loading, setLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState('Loading uploaded officers...');
  const [running, setRunning] = useState(false);
  const [runLabel, setRunLabel] = useState('');
  const [notify, setNotify] = useState(null);

  const [stats, setStats] = useState(null);
  const [officers, setOfficers] = useState([]);
  const [booths, setBooths] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [runResult, setRunResult] = useState(null);

  const [tab, setTab] = useState('allocated');
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatus, setHistoryStatus] = useState('');

  const [confirmRun, setConfirmRun] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [reallocTarget, setReallocTarget] = useState(null);
  const [sendingIds, setSendingIds] = useState(new Set());

  const allocatedList = useMemo(
    () => allocations.filter((a) => a.status === 'ALLOCATED'),
    [allocations]
  );

  // Officers with no active ALLOCATED allocation (requirement 11: never hide them).
  const unallocatedList = useMemo(() => {
    const allocatedOfficerIds = new Set(
      allocatedList.map((a) => String(a.officer?._id || a.officer))
    );
    const reasonById = new Map(
      (runResult?.unallocatedOfficers || []).map((u) => [
        String(u.officerId || u._id || u.officer?._id),
        u.reason,
      ])
    );
    return officers
      .filter((o) => !allocatedOfficerIds.has(String(o._id)))
      .map((o) => ({
        ...o,
        unallocatedReason:
          reasonById.get(String(o.officerId)) ||
          reasonById.get(String(o._id)) ||
          'No suitable booth available in the same Mandal.',
      }));
  }, [officers, allocatedList, runResult]);

  // Defensive natural sort: Officer ID ascending (OFF1 < OFF2 < OFF10).
  // The /api/officers endpoint already sorts, but this guarantees correctness
  // regardless of any future API changes.
  const sortedUnallocatedList = useMemo(
    () => sortByOfficerId(unallocatedList),
    [unallocatedList]
  );

  const allocationsByBooth = useMemo(() => {
    const map = {};
    allocatedList.forEach((a) => {
      const key = String(a.booth?._id || a.booth);
      if (!map[key]) map[key] = [];
      map[key].push(a);
    });
    // Ensure each booth's officer list is sorted ascending by Officer ID
    // (natural: OFF1 < OFF2 < OFF10) — spec requirement 12.
    Object.keys(map).forEach((key) => {
      map[key] = sortByOfficerId(map[key]);
    });
    return map;
  }, [allocatedList]);

  const historyList = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return allocations.filter((a) => {
      if (historyStatus && a.status !== historyStatus) return false;
      if (!q) return true;
      const hay = [
        a.officer?.officerId,
        a.officer?.officerName,
        a.officer?.mobileNumber,
        a.booth?.boothNumber,
        a.booth?.boothName,
        a.mandal,
        a.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [allocations, historySearch, historyStatus]);

  const totalRequiredSlots = useMemo(
    () => booths.reduce((sum, b) => sum + (b.requiredOfficers || 0), 0),
    [booths]
  );

  const fetchAll = useCallback(async (stageLabel) => {
    setLoading(true);
    setLoadingStage(stageLabel || 'Loading uploaded officers...');
    try {
      setLoadingStage('Loading uploaded officers...');
      const officersRes = await api.get('/api/officers', { params: { limit: 500 } });
      setOfficers(officersRes.data.data || []);
      setLoadingStage('Loading uploaded booths...');
      const boothsRes = await api.get('/api/booths', { params: { limit: 500 } });
      setBooths(boothsRes.data.data || []);
      setLoadingStage('Loading existing allocations...');
      const [allocRes, statsRes] = await Promise.all([
        api.get('/api/allocation', { params: { limit: 500 } }),
        api.get('/api/dashboard/stats'),
      ]);
      setAllocations(allocRes.data.data || []);
      setStats(statsRes.data.data || null);
    } catch (err) {
      setNotify({ message: getErrorMessage(err), type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll().catch(() => {});
  }, [fetchAll]);

  // POST /api/allocation/run - backend performs the REAL allocation (req. 10).
  const doRun = async () => {
    setRunning(true);
    setConfirmRun(false);
    setRunLabel('Running allocation...');
    try {
      const { data } = await api.post('/api/allocation/run');
      setRunLabel('Saving allocation results...');
      setRunResult(data.data || null);
      setNotify({
        message:
          `Allocation completed: ${data.data?.allocated ?? 0} allocated, ` +
          `${data.data?.unallocated ?? 0} unallocated, ${data.data?.skipped ?? 0} already allocated.`,
        type: 'success',
        duration: 8000,
      });
      setTab('allocated');
      await fetchAll('Refreshing allocation results...');
    } catch (err) {
      setNotify({ message: getErrorMessage(err), type: 'error', duration: 8000 });
      setRunning(false);
      return;
    } finally {
      setRunning(false);
      setRunLabel('');
    }
  };

  // POST /api/allocation/:id/cancel (requirement 17).
  const doCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await api.post(`/api/allocation/${cancelTarget._id}/cancel`);
      setNotify({
        message: `Allocation cancelled - officer ${cancelTarget.officer?.officerName || ''} is now unallocated.`,
        type: 'success',
      });
      setCancelTarget(null);
      await fetchAll('Refreshing allocation data...');
    } catch (err) {
      setNotify({ message: getErrorMessage(err), type: 'error', duration: 8000 });
      setCancelTarget(null);
    } finally {
      setCancelling(false);
    }
  };

  // POST /api/notifications/send/:allocationId (requirement H).
  const doSendNotification = async (allocation) => {
    setSendingIds((prev) => new Set(prev).add(allocation._id));
    try {
      const { data } = await api.post(`/api/notifications/send/${allocation._id}`);
      setNotify({
        message: data.message || 'Notification saved with status SENT.',
        type: 'success',
      });
    } catch (err) {
      setNotify({ message: getErrorMessage(err), type: 'error', duration: 8000 });
    } finally {
      setSendingIds((prev) => {
        const next = new Set(prev);
        next.delete(allocation._id);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="page">
        <Spinner label={loadingStage || 'Loading allocation data...'} />
      </div>
    );
  }

  return (
    <div className="page">
      {notify ? <Toast {...notify} onClose={() => setNotify(null)} /> : null}
      {running ? <Spinner label={runLabel || 'Running allocation...'} /> : null}

      <div className="page-head">
        <div>
          <h1 className="page-title">Allocation</h1>
          <p className="page-subtitle">
            Automatic booth allocation built from the uploaded Excel data
          </p>
        </div>
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-primary"
            disabled={running}
            onClick={() => setConfirmRun(true)}
          >
            {running ? 'Running...' : '... Run Automatic Allocation'}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={running}
            onClick={() => fetchAll('Refreshing allocation data...')}
          >
            ... Refresh Data
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => docDownload('/api/reports/allocation-excel')}
          >
            ... Allocated (.xlsx)
          </button>
        </div>
      </div>

      {/* Summary cards (requirement 7/14) */}
      <div className="stat-grid">
        <StatCard label="Total Officers" value={stats?.totalOfficers ?? officers.length} icon="..." tone="navy" />
        <StatCard label="Total Booths" value={stats?.totalBooths ?? booths.length} icon="..." tone="blue" />
        <StatCard label="Allocated Officers" value={allocatedList.length} icon="..." tone="green" />
        <StatCard label="Unallocated Officers" value={unallocatedList.length} icon="..." tone="red" />
        <StatCard label="Required Officer Slots" value={totalRequiredSlots} icon="..." tone="purple" />
        <StatCard
          label="Available Booth Slots"
          value={Math.max(0, totalRequiredSlots - allocatedList.length)}
          icon="..."
          tone="amber"
        />
      </div>

      {/* Run result summary (requirement 14) */}
      {runResult ? (
        <div className="card">
          <h3 className="card-title">Allocation Summary</h3>
          <div className="summary-grid">
            <div><span className="muted">Total Officers:</span> <strong>{runResult.totalOfficers ?? 0}</strong></div>
            <div><span className="muted">Successfully Allocated:</span> <strong>{runResult.allocated ?? 0}</strong></div>
            <div><span className="muted">Unallocated:</span> <strong>{runResult.unallocated ?? 0}</strong></div>
            <div><span className="muted">Already Allocated (skipped):</span> <strong>{runResult.skipped ?? 0}</strong></div>
            <div><span className="muted">Total Booths:</span> <strong>{runResult.totalBooths ?? 0}</strong></div>
            <div><span className="muted">Filled Slots:</span> <strong>{allocatedList.length}</strong></div>
            <div><span className="muted">Available Slots:</span> <strong>{Math.max(0, totalRequiredSlots - allocatedList.length)}</strong></div>
            <div><span className="muted">Cancelled Allocations:</span> <strong>{stats?.cancelledAllocations ?? 0}</strong></div>
            <div>
              <span className="muted">Success Rate:</span>{' '}
              <strong>{successRate(runResult.allocated ?? 0, runResult.totalOfficers ?? 0)}</strong>
            </div>
          </div>
        </div>
      ) : null}


      {/* Tabs */}
      <div className="tab-row">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === 'allocated' ? ` (${allocatedList.length})` : ''}
            {t.id === 'unallocated' ? ` (${unallocatedList.length})` : ''}
          </button>
        ))}
      </div>

      {tab === 'allocated' ? (
        <div className="card">
          <h3 className="card-title">Allocated Officers</h3>
          {allocatedList.length === 0 ? (
            <p className="empty-state">
              No allocations yet. Click &quot;Run Automatic Allocation&quot; to allocate the
              uploaded officers to booths.
            </p>
          ) : (
            <AllocationTable
              allocations={allocatedList}
              onReallocate={(a) => setReallocTarget(a)}
              onCancel={(a) => setCancelTarget(a)}
              onSendNotification={doSendNotification}
              sendingIds={sendingIds}
            />
          )}
        </div>
      ) : null}

      {tab === 'unallocated' ? (
        <div className="card">
          <h3 className="card-title">Unallocated Officers</h3>
          <p className="page-subtitle">
            These officers could not be allocated. They are never hidden.
          </p>
          {unallocatedList.length === 0 ? (
            <p className="empty-state">All uploaded officers are allocated.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>S.No</th>
                    <th>Officer ID</th>
                    <th>Officer Name</th>
                    <th>Designation</th>
                    <th>Mobile Number</th>
                    <th>Mandal</th>
                    <th>Officer Locality</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedUnallocatedList.map((o, idx) => (
                    <tr key={o._id}>
                      <td>{idx + 1}</td>
                      <td><span className="mono">{o.officerId}</span></td>
                      <td>{o.officerName}</td>
                      <td>{o.designation || '...'}</td>
                      <td className="mono">{o.mobileNumber || '...'}</td>
                      <td>{o.mandal || '...'}</td>
                      <td>{o.locality || '...'}</td>
                      <td><span className="inline-note">{o.unallocatedReason}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {tab === 'boothwise' ? (
        <BoothWiseAllocation booths={booths} allocationsByBooth={allocationsByBooth} />
      ) : null}


      {tab === 'history' ? (
        <div className="card">
          <div className="toolbar">
            <input
              className="input"
              placeholder="Search history..."
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
            />
            <select
              className="input"
              value={historyStatus}
              onChange={(e) => setHistoryStatus(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="ALLOCATED">ALLOCATED</option>
              <option value="CANCELLED">CANCELLED</option>
              <option value="REALLOCATED">REALLOCATED</option>
            </select>
          </div>
          {historyList.length === 0 ? (
            <p className="empty-state">No allocation history matches the filter.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>S.No</th>
                    <th>Officer ID</th>
                    <th>Officer Name</th>
                    <th>Booth No.</th>
                    <th>Booth Name</th>
                    <th>Status</th>
                    <th>Allocation Date</th>
                  </tr>
                </thead>
                <tbody>
                  {historyList.map((a, idx) => (
                    <tr key={a._id}>
                      <td>{idx + 1}</td>
                      <td><span className="mono">{a.officer?.officerId || '...'}</span></td>
                      <td>{a.officer?.officerName || '...'}</td>
                      <td className="mono">{a.booth?.boothNumber || '...'}</td>
                      <td>{a.booth?.boothName || '...'}</td>
                      <td>{a.status}</td>
                      <td>
                        {a.allocationDate
                          ? new Date(a.allocationDate).toLocaleDateString('en-GB')
                          : '...'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {/* Run confirmation */}
      <ConfirmModal
        open={confirmRun}
        title="Run Automatic Allocation"
        message="This allocates every unallocated officer to suitable booths in their own Mandal (skipping same-locality and full booths). Already allocated officers are skipped. Continue?"
        confirmLabel="Run Allocation"
        loading={running}
        onConfirm={doRun}
        onCancel={() => setConfirmRun(false)}
      />

      {/* Cancel confirmation (requirement 17) */}
      <ConfirmModal
        open={Boolean(cancelTarget)}
        title="Cancel Allocation"
        message={`Cancel the allocation of ${cancelTarget?.officer?.officerName || 'this officer'} at booth ${cancelTarget?.booth?.boothNumber || ''}? The officer becomes unallocated and the booth slot is freed. History is kept.`}
        confirmLabel="Cancel Allocation"
        tone="danger"
        loading={cancelling}
        onConfirm={doCancel}
        onCancel={() => setCancelTarget(null)}
      />

      {/* Reallocation modal (requirement 16 / G) */}
      <ReallocateModal
        allocation={reallocTarget}
        onClose={() => setReallocTarget(null)}
        onDone={fetchAll}
      />
    </div>
  );
}

