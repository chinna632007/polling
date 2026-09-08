import { useEffect, useState, useCallback } from 'react';
import api, { getErrorMessage } from '../services/api';
import OfficerTable from '../components/OfficerTable';
import MandalSection from '../components/MandalSection';
import Spinner from '../components/Spinner';
import Toast from '../components/Toast';
import ConfirmModal from '../components/ConfirmModal';
import { useAuth } from '../context/AuthContext';
import { canManageData, isSuperAdmin } from '../utils/roles';

const EMPTY_FORM = {
  officerId: '',
  officerName: '',
  designation: '',
  mobileNumber: '',
  email: '',
  houseNumber: '',
  street: '',
  locality: '',
  ward: '',
  mandal: '',
  district: '',
  pinCode: '',
};

export default function Officers() {
  const { user } = useAuth();
  const canManage = canManageData(user);
  const isAdmin = isSuperAdmin(user);

  // Officers grouped per Mandal (one section per uploaded file's Mandal).
  const [groups, setGroups] = useState([]);
  const [totalOfficers, setTotalOfficers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [notify, setNotify] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // "Delete All" confirmation state (every officer on the page).
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  // "Delete Mandal" confirmation state (one section = one uploaded file).
  const [deleteMandalTarget, setDeleteMandalTarget] = useState(null);
  const [deletingMandal, setDeletingMandal] = useState(false);

  const fetchOfficers = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      const { data } = await api.get('/api/officers/grouped', { params });
      setGroups(data.data || []);
      setTotalOfficers(data.totalOfficers || 0);
    } catch (err) {
      setNotify({ message: getErrorMessage(err), type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchOfficers().catch(() => {});
  }, [fetchOfficers]);

  /** Opens the Add modal, optionally pre-filling the section's Mandal. */
  const openCreate = (mandal = '') => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, mandal });
    setModalOpen(true);
  };

  const openEdit = (officer) => {
    setEditing(officer);
    setForm({
      officerId: officer.officerId,
      officerName: officer.officerName,
      designation: officer.designation,
      mobileNumber: officer.mobileNumber,
      email: officer.email || '',
      houseNumber: officer.houseNumber || '',
      street: officer.street || '',
      locality: officer.locality || '',
      ward: officer.ward || '',
      mandal: officer.mandal || '',
      district: officer.district || '',
      pinCode: officer.pinCode || '',
    });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, email: form.email || undefined };
      if (editing) {
        await api.put(`/api/officers/${editing._id}`, payload);
        setNotify({ message: 'Officer updated successfully', type: 'success' });
      } else {
        await api.post('/api/officers', payload);
        setNotify({ message: 'Officer added successfully', type: 'success' });
      }
      setModalOpen(false);
      await fetchOfficers();
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
      await api.delete(`/api/officers/${deleteTarget._id}`);
      setNotify({ message: 'Officer deleted', type: 'success' });
      setDeleteTarget(null);
      await fetchOfficers();
    } catch (err) {
      setNotify({ message: getErrorMessage(err), type: 'error' });
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  /** Wipes EVERY officer (all Mandals) plus their allocations/notifications. */
  const doDeleteAll = async () => {
    setDeletingAll(true);
    try {
      const { data } = await api.delete('/api/officers/all');
      setNotify({
        message: data.message || 'All officers and their related data were deleted',
        type: 'success',
        duration: 8000,
      });
      setConfirmDeleteAll(false);
      await fetchOfficers();
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
        `/api/officers/all?mandal=${encodeURIComponent(deleteMandalTarget)}`
      );
      setNotify({
        message: data.message || `Deleted all officers in Mandal '${deleteMandalTarget}'`,
        type: 'success',
        duration: 8000,
      });
      setDeleteMandalTarget(null);
      await fetchOfficers();
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
          <h1 className="page-title">Officers</h1>
          <p className="page-subtitle">
            {totalOfficers} officer(s) in {groups.length} Mandal group(s) — each uploaded file is
            shown and managed separately
          </p>
        </div>
        <div className="page-actions">
          {isAdmin ? (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => setConfirmDeleteAll(true)}
              disabled={deletingAll || totalOfficers === 0}
            >
              🗑 Delete All
            </button>
          ) : null}
          {canManage ? (
            <button type="button" className="btn btn-primary" onClick={() => openCreate()}>
              + Add Officer
            </button>
          ) : (
            <span className="badge badge-navy">View only</span>
          )}
        </div>
      </div>

      <div className="toolbar card">
        <input
          className="input"
          placeholder="Search ID / name / mobile / locality"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" className="btn btn-ghost" onClick={() => setSearch('')}>
          Clear
        </button>
      </div>

      {loading && groups.length === 0 ? (
        <Spinner label="Loading officers…" />
      ) : groups.length === 0 ? (
        <p className="empty-state">
          No officers found. Upload the Excel file or add an officer to begin.
        </p>
      ) : (
        groups.map((g) => (
          <MandalSection
            key={g.mandal}
            title={g.mandal}
            badgeLabel="officers"
            count={g.total}
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
            <OfficerTable
              officers={g.officers}
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
            <h3 className="modal-title">{editing ? 'Edit Officer' : 'Add Officer'}</h3>
            <form onSubmit={handleSave} className="form-grid">
              <div className="form-group">
                <label>Officer ID *</label>
                <input
                  className="input"
                  value={form.officerId}
                  onChange={(e) => setForm({ ...form, officerId: e.target.value })}
                  required
                  disabled={Boolean(editing)}
                />
              </div>
              <div className="form-group">
                <label>Officer Name *</label>
                <input
                  className="input"
                  value={form.officerName}
                  onChange={(e) => setForm({ ...form, officerName: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Designation *</label>
                <input
                  className="input"
                  value={form.designation}
                  onChange={(e) => setForm({ ...form, designation: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Mobile Number *</label>
                <input
                  className="input"
                  value={form.mobileNumber}
                  onChange={(e) => setForm({ ...form, mobileNumber: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input
                  className="input"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>House Number</label>
                <input
                  className="input"
                  value={form.houseNumber}
                  onChange={(e) => setForm({ ...form, houseNumber: e.target.value })}
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
              <div className="form-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-success" disabled={saving}>
                  {saving ? 'Saving…' : editing ? 'Update Officer' : 'Add Officer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete Officer"
        message={`Delete officer '${deleteTarget?.officerName}' (${deleteTarget?.officerId})? This cannot be undone.`}
        confirmLabel="Delete"
        tone="danger"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmModal
        open={confirmDeleteAll}
        title="Delete ALL Officers"
        message="This permanently deletes every officer in every Mandal, together with all of their allocations and notifications, and clears the related uploaded file records. This cannot be undone."
        confirmLabel="Delete Everything"
        tone="danger"
        loading={deletingAll}
        onConfirm={doDeleteAll}
        onCancel={() => setConfirmDeleteAll(false)}
      />

      <ConfirmModal
        open={Boolean(deleteMandalTarget)}
        title={`Delete Mandal '${deleteMandalTarget}'`}
        message={`This deletes the entire uploaded data for Mandal '${deleteMandalTarget}' (officers, their allocations and notifications). Other Mandals are not affected. This cannot be undone.`}
        confirmLabel="Delete Mandal"
        tone="danger"
        loading={deletingMandal}
        onConfirm={doDeleteMandal}
        onCancel={() => setDeleteMandalTarget(null)}
      />
    </div>
  );
}