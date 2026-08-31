import { useEffect, useState, useCallback } from 'react';
import api, { getErrorMessage } from '../services/api';
import OfficerTable from '../components/OfficerTable';
import Spinner from '../components/Spinner';
import Toast from '../components/Toast';
import ConfirmModal from '../components/ConfirmModal';

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
  const [officers, setOfficers] = useState([]);
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

  const fetchOfficers = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page };
      if (search) params.search = search;
      if (mandal) params.mandal = mandal;
      const { data } = await api.get('/api/officers', { params });
      setOfficers(data.data);
      setPagination(data.pagination);
    } catch (err) {
      setNotify({ message: getErrorMessage(err), type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [page, search, mandal]);

  useEffect(() => {
    fetchOfficers().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, mandal]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
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

  return (
    <div className="page">
      {notify ? <Toast {...notify} onClose={() => setNotify(null)} /> : null}

      <div className="page-head">
        <div>
          <h1 className="page-title">Officers</h1>
          <p className="page-subtitle">Manage election officers and their residential addresses</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          + Add Officer
        </button>
      </div>

      <div className="toolbar card">
        <input
          className="input"
          placeholder="Search ID / name / mobile / locality"
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

      {loading && officers.length === 0 ? (
        <Spinner label="Loading officers…" />
      ) : (
        <OfficerTable
          officers={officers}
          loading={false}
          onEdit={openEdit}
          onDelete={setDeleteTarget}
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
    </div>
  );
}