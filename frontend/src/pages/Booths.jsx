import { useEffect, useState, useCallback } from 'react';
import api, { getErrorMessage } from '../services/api';
import BoothTable from '../components/BoothTable';
import Spinner from '../components/Spinner';
import Toast from '../components/Toast';
import ConfirmModal from '../components/ConfirmModal';

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
  const [booths, setBooths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [mandal, setMandal] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [notify, setNotify] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchBooths = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page };
      if (search) params.search = search;
      if (mandal) params.mandal = mandal;
      const { data } = await api.get('/api/booths', { params });
      setBooths(data.data);
      setPagination(data.pagination);
    } catch (err) {
      setNotify({ message: getErrorMessage(err), type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [page, search, mandal]);

  useEffect(() => {
    fetchBooths().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, mandal]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
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

  return (
    <div className="page">
      {notify ? <Toast {...notify} onClose={() => setNotify(null)} /> : null}

      <div className="page-head">
        <div>
          <h1 className="page-title">Booths</h1>
          <p className="page-subtitle">Manage polling booths and their required officer counts</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          + Add Booth
        </button>
      </div>

      <div className="toolbar card">
        <input
          className="input"
          placeholder="Search ID / name / number"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <input
          className="input"
          placeholder="Filter by Mandal"
          value={mandal}
          onChange={(e) => {
            setMandal(e.target.value);
            setPage(1);
          }}
        />
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setSearch('');
            setMandal('');
            setPage(1);
          }}
        >
          Clear
        </button>
      </div>

      {loading && booths.length === 0 ? (
        <Spinner label="Loading booths…" />
      ) : (
        <BoothTable booths={booths} loading={false} onEdit={openEdit} onDelete={setDeleteTarget} />
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
    </div>
  );
}