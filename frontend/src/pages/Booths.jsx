import { useEffect, useState, useCallback } from 'react';
import api, { getErrorMessage } from '../services/api';
import BoothTable from '../components/BoothTable';
import MandalSection from '../components/MandalSection';
import Spinner from '../components/Spinner';
import Toast from '../components/Toast';
import ConfirmModal from '../components/ConfirmModal';
import { useAuth } from '../context/AuthContext';
import { canManageData, isSuperAdmin } from '../utils/roles';

const EMPTY_FORM = {
  boothId: '',
  boothNumber: '',
  boothName: '',
  buildingName: '',
  street: '',
  locality: '',
  ward: '',
  mandal: '',
  district: '',
  pinCode: '',
  requiredOfficers: 1,
};

export default function Booths() {
  const { user } = useAuth();
  const canManage = canManageData(user);
  const isAdmin = isSuperAdmin(user);

  // Booths grouped per Mandal (one section per uploaded file's Mandal).
  const [groups, setGroups] = useState([]);
  const [totalBooths, setTotalBooths] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [notify, setNotify] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // "Delete All" confirmation state (every booth on the page).
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  // "Delete Mandal" confirmation state (one section = one uploaded file).
  const [deleteMandalTarget, setDeleteMandalTarget] = useState(null);
  const [deletingMandal, setDeletingMandal] = useState(false);

  const fetchBooths = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      const { data } = await api.get('/api/booths/grouped', { params });
      setGroups(data.data || []);
      setTotalBooths(data.totalBooths || 0);
    } catch (err) {
      setNotify({ message: getErrorMessage(err), type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchBooths().catch(() => {});
  }, [fetchBooths]);

  /** Opens the Add modal, optionally pre-filling the section's Mandal. */
  const openCreate = (mandal = '') => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, mandal });
    setModalOpen(true);
  };

  const openEdit = (booth) => {
    setEditing(booth);
    setForm({
      boothId: booth.boothId,
      boothNumber: booth.boothNumber,
      boothName: booth.boothName,
      buildingName: booth.buildingName || '',
      street: booth.street || '',
      locality: booth.locality || '',
      ward: booth.ward || '',
      mandal: booth.mandal || '',
      district: booth.district || '',
      pinCode: booth.pinCode || '',
      requiredOfficers: booth.requiredOfficers,
    });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, requiredOfficers: Number(form.requiredOfficers) };
      if (editing) {
        await api.put(`/api/booths/${editing._id}`, payload);
        setNotify({ message: 'Booth updated successfully', type: 'success' });
      } else {
        await api.post('/api/booths', payload);
        setNotify({ message: 'Booth added successfully', type: 'success' });
      }
      setModalOpen(false);
      await fetchBooths();
    } catch (err) {
      setNotify({ message: getErrorMessage(err), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/api/booths/${deleteTarget._id}`);
      setNotify({ message: 'Booth deleted', type: 'success' });
      setDeleteTarget(null);
      await fetchBooths();
    } catch (err) {
      setNotify({ message: getErrorMessage(err), type: 'error' });
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  /** Wipes EVERY booth (all Mandals) plus allocations pointing at them. */
  const doDeleteAll = async () => {
    setDeletingAll(true);
    try {
      const { data } = await api.delete('/api/booths/all');
      setNotify({
        message: data.message || 'All booths and their related data were deleted',
        type: 'success',
        duration: 8000,
      });
      setConfirmDeleteAll(false);
      await fetchBooths();
    } catch (err) {
      setNotify({ message: getErrorMessage(err), type: 'error', duration: 8000 });
      setConfirmDeleteAll(false);
    } finally {
      setDeletingAll(false);
    }
  };

  /** Deletes one Mandal section only (that uploaded file's data). */
  const doDeleteMandal = async () => {
    if (!deleteMandalTarget) return;
    setDeletingMandal(true);
    try {
      const { data } = await api.delete(
        `/api/booths/all?mandal=${encodeURIComponent(deleteMandalTarget)}`
      );
      setNotify({
        message: data.message || `Deleted all booths in Mandal '${deleteMandalTarget}'`,
        type: 'success',
        duration: 8000,
      });
      setDeleteMandalTarget(null);
      await fetchBooths();
    } catch (err) {
      setNotify({ message: getErrorMessage(err), type: 'error', duration: 8000 });
      setDeleteMandalTarget(null);
    } finally {
      setDeletingMandal(false);
    }
  };

  return (
    <div className="page">
      {notify ? <Toast {...notify} onClose={() => setNotify(null)} /> : null}

      <div className="page-head">
        <div>
          <h1 className="page-title">Booths</h1>
          <p className="page-subtitle">
            {totalBooths} booth(s) in {groups.length} Mandal group(s) — each uploaded file is
            shown and managed separately
          </p>
        </div>
        <div className="page-actions">
          {isAdmin ? (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => setConfirmDeleteAll(true)}
              disabled={deletingAll || totalBooths === 0}
            >
              🗑 Delete All
            </button>
          ) : null}
          {canManage ? (
            <button type="button" className="btn btn-primary" onClick={() => openCreate()}>
              + Add Booth
            </button>
          ) : (
            <span className="badge badge-navy">View only</span>
          )}
        </div>
      </div>

      <div className="toolbar card">
        <input
          className="input"
          placeholder="Search ID / name / number"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" className="btn btn-ghost" onClick={() => setSearch('')}>
          Clear
        </button>
      </div>

      {loading && groups.length === 0 ? (
        <Spinner label="Loading booths…" />
      ) : groups.length === 0 ? (
        <p className="empty-state">
          No booths found. Upload the Excel file or add a booth to begin.
        </p>
      ) : (
        groups.map((g) => (
          <MandalSection
            key={g.mandal}
            title={g.mandal}
            badgeLabel="booths"
            count={g.total}
            stats={[
              { label: 'Allocated', value: `${g.allocatedOfficers}/${g.requiredOfficers}` },
            ]}
            actions={
              <>
                {canManage ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => openCreate(g.mandal)}
                  >
                    + Add
                  </button>
                ) : null}
                {isAdmin ? (
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => setDeleteMandalTarget(g.mandal)}
                  >
                    Delete Mandal
                  </button>
                ) : null}
              </>
            }
          >
            <BoothTable
              booths={g.booths}
              loading={false}
              onEdit={canManage ? openEdit : undefined}
              onDelete={isAdmin ? setDeleteTarget : undefined}
            />
          </MandalSection>
        ))
      )}

      {modalOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal modal-wide">
            <h3 className="modal-title">{editing ? 'Edit Booth' : 'Add Booth'}</h3>
            <form onSubmit={handleSave} className="form-grid">
              <div className="form-group">
                <label>Booth ID *</label>
                <input
                  className="input"
                  value={form.boothId}
                  onChange={(e) => setForm({ ...form, boothId: e.target.value })}
                  required
                  disabled={Boolean(editing)}
                />
              </div>
              <div className="form-group">
                <label>Booth Number *</label>
                <input
                  className="input"
                  value={form.boothNumber}
                  onChange={(e) => setForm({ ...form, boothNumber: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Booth Name *</label>
                <input
                  className="input"
                  value={form.boothName}
                  onChange={(e) => setForm({ ...form, boothName: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Building Name</label>
                <input
                  className="input"
                  value={form.buildingName}
                  onChange={(e) => setForm({ ...form, buildingName: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Street</label>
                <input
                  className="input"
                  value={form.street}
                  onChange={(e) => setForm({ ...form, street: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Village / Locality *</label>
                <input
                  className="input"
                  value={form.locality}
                  onChange={(e) => setForm({ ...form, locality: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Ward</label>
                <input
                  className="input"
                  value={form.ward}
                  onChange={(e) => setForm({ ...form, ward: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Mandal *</label>
                <input
                  className="input"
                  value={form.mandal}
                  onChange={(e) => setForm({ ...form, mandal: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>District</label>
                <input
                  className="input"
                  value={form.district}
                  onChange={(e) => setForm({ ...form, district: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>PIN Code</label>
                <input
                  className="input"
                  value={form.pinCode}
                  onChange={(e) => setForm({ ...form, pinCode: e.target.value })}
                  maxLength={6}
                />
              </div>
              <div className="form-group">
                <label>Required Officers *</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={form.requiredOfficers}
                  onChange={(e) => setForm({ ...form, requiredOfficers: e.target.value })}
                  required
                />
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-success" disabled={saving}>
                  {saving ? 'Saving…' : editing ? 'Update Booth' : 'Add Booth'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete Booth"
        message={`Delete booth '${deleteTarget?.boothName}' (${deleteTarget?.boothId})? This cannot be undone.`}
        confirmLabel="Delete"
        tone="danger"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmModal
        open={confirmDeleteAll}
        title="Delete ALL Booths"
        message="This permanently deletes every booth in every Mandal, together with any allocations pointing at them, and clears the related uploaded file records. This cannot be undone."
        confirmLabel="Delete Everything"
        tone="danger"
        loading={deletingAll}
        onConfirm={doDeleteAll}
        onCancel={() => setConfirmDeleteAll(false)}
      />

      <ConfirmModal
        open={Boolean(deleteMandalTarget)}
        title={`Delete Mandal '${deleteMandalTarget}'`}
        message={`This deletes the entire uploaded data for Mandal '${deleteMandalTarget}' (booths and any allocations pointing at them). Other Mandals are not affected. This cannot be undone.`}
        confirmLabel="Delete Mandal"
        tone="danger"
        loading={deletingMandal}
        onConfirm={doDeleteMandal}
        onCancel={() => setDeleteMandalTarget(null)}
      />
    </div>
  );
}