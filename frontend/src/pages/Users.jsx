import { useCallback, useEffect, useState } from 'react';
import api, { getErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ROLES, ROLE_LABELS } from '../utils/roles';
import Badge from '../components/Badge';
import Spinner from '../components/Spinner';
import Toast from '../components/Toast';
import ConfirmModal from '../components/ConfirmModal';
import PasswordInput from '../components/PasswordInput';

const EMPTY_FORM = {
  name: '',
  username: '',
  email: '',
  password: '',
  confirmPassword: '',
  role: ROLES.MANDAL_OFFICER,
  district: '',
  constituency: '',
  assignedMandal: '',
  assignedBooth: '',
  assignedOfficerId: '',
  status: 'active',
};

function roleTone(role) {
  if (role === ROLES.SUPER_ADMIN) return 'red';
  if (role === ROLES.ALLOCATION_OFFICER) return 'purple';
  if (role === ROLES.MANDAL_OFFICER) return 'blue';
  return 'green';
}

/**
 * Users page - SUPER ADMIN ONLY. Create/edit/deactivate user accounts with
 * roles (SUPER_ADMIN, ALLOCATION_OFFICER, MANDAL_OFFICER, BOOTH_OFFICER) and
 * jurisdiction (assignedMandal / assignedOfficerId).
 */
export default function Users() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notify, setNotify] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [fieldError, setFieldError] = useState('');

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/auth/users');
      setUsers(data.data || []);
    } catch (err) {
      setNotify({ message: getErrorMessage(err), type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setFieldError('');
    setModalOpen(true);
  };

  const openEdit = (u) => {
    setEditing(u);
    setForm({
      name: u.name || '',
      username: u.username,
      email: u.email || '',
      password: '',
      confirmPassword: '',
      role: u.role || ROLES.SUPER_ADMIN,
      district: u.district || '',
      constituency: u.constituency || '',
      assignedMandal: u.assignedMandal || '',
      assignedBooth: u.assignedBooth || '',
      assignedOfficerId: u.assignedOfficerId || '',
      status: u.status || 'active',
    });
    setFieldError('');
    setModalOpen(true);
  };

  const validate = () => {
    if (!form.username.trim()) return 'Username is required.';
    if (!/^[a-zA-Z0-9._-]{3,30}$/.test(form.username.trim())) {
      return 'Username must be 3-30 characters (letters, numbers, dot, underscore, hyphen only).';
    }
    if (!editing && (form.password || '').length < 8) {
      return 'Password must be at least 8 characters.';
    }
    if (form.password && form.password !== form.confirmPassword) {
      return 'Passwords do not match.';
    }
    if (form.role === ROLES.MANDAL_OFFICER && !form.assignedMandal.trim()) {
      return 'Assigned Mandal is required for a Mandal Officer.';
    }
    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const message = validate();
    if (message) {
      setFieldError(message);
      return;
    }
    setFieldError('');
    setSaving(true);
    try {
      if (editing) {
        const payload = {
          name: form.name,
          email: form.email,
          role: form.role,
          district: form.district,
          constituency: form.constituency,
          assignedMandal: form.assignedMandal,
          assignedBooth: form.assignedBooth,
          assignedOfficerId: form.assignedOfficerId,
          status: form.status,
        };
        if (form.password) {
          payload.newPassword = form.password;
          payload.confirmPassword = form.confirmPassword;
        }
        const { data } = await api.put(`/api/auth/users/${editing.id}`, payload);
        setNotify({ message: data.message || 'User updated', type: 'success' });
      } else {
        const { data } = await api.post('/api/auth/register', {
          ...form,
          username: form.username.trim(),
          email: form.email.trim(),
        });
        setNotify({
          message: data.message || `User '${data.data?.username}' created`,
          type: 'success',
          duration: 8000,
        });
      }
      setModalOpen(false);
      await loadUsers();
    } catch (err) {
      setNotify({ message: getErrorMessage(err), type: 'error', duration: 8000 });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { data } = await api.delete(`/api/auth/users/${deleteTarget.id}`);
      setNotify({ message: data.message || 'User removed', type: 'success' });
      setDeleteTarget(null);
      await loadUsers();
    } catch (err) {
      setNotify({ message: getErrorMessage(err), type: 'error', duration: 8000 });
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const setField = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  return (
    <div className="page">
      {notify ? <Toast {...notify} onClose={() => setNotify(null)} /> : null}

      <div className="page-head">
        <div>
          <h1 className="page-title">Users</h1>
          <p className="page-subtitle">
            Manage accounts, roles and Mandal assignments (Super Admin only)
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          + Add User
        </button>
      </div>
{modalOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal modal-wide">
            <h3 className="modal-title">{editing ? 'Edit User' : 'Add User'}</h3>
            <form onSubmit={handleSubmit} className="form-grid">
              <div className="form-group">
                <label>Name</label>
                <input className="input" value={form.name} onChange={setField('name')} />
              </div>
              <div className="form-group">
                <label>Username * {editing ? '(cannot be changed)' : ''}</label>
                <input
                  className="input"
                  value={form.username}
                  onChange={setField('username')}
                  disabled={Boolean(editing)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input
                  className="input"
                  type="email"
                  value={form.email}
                  onChange={setField('email')}
                  placeholder="user@example.com"
                />
              </div>
              <div className="form-group">
                <label>Role *</label>
                <select className="input" value={form.role} onChange={setField('role')}>
                  {Object.values(ROLES).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>District</label>
                <input className="input" value={form.district} onChange={setField('district')} />
              </div>
              <div className="form-group">
                <label>Constituency</label>
                <input
                  className="input"
                  value={form.constituency}
                  onChange={setField('constituency')}
                />
              </div>
              {form.role === ROLES.MANDAL_OFFICER && (
                <div className="form-group">
                  <label>Assigned Mandal * (this user sees ONLY this Mandal's data)</label>
                  <input
                    className="input"
                    value={form.assignedMandal}
                    onChange={setField('assignedMandal')}
                    placeholder="e.g. Kakinada"
                    required
                  />
                </div>
              )}
              {form.role === ROLES.BOOTH_OFFICER && (
                <>
                  <div className="form-group">
                    <label>Linked Officer ID (their own profile)</label>
                    <input
                      className="input"
                      value={form.assignedOfficerId}
                      onChange={setField('assignedOfficerId')}
                      placeholder="e.g. OFFICER001"
                    />
                  </div>
                  <div className="form-group">
                    <label>Assigned Booth (optional label)</label>
                    <input
                      className="input"
                      value={form.assignedBooth}
                      onChange={setField('assignedBooth')}
                      placeholder="e.g. Bench 1 / PK-221"
                    />
                  </div>
                </>
              )}
              <div className="form-group">
                <label>{editing ? 'New Password (leave blank to keep)' : 'Password *'}</label>
                <PasswordInput
                  id="user-password"
                  value={form.password}
                  onChange={setField('password')}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  required={!editing}
                />
              </div>
              <div className="form-group">
                <label>{editing ? 'Confirm New Password' : 'Confirm Password *'}</label>
                <PasswordInput
                  id="user-confirm"
                  value={form.confirmPassword}
                  onChange={setField('confirmPassword')}
                  placeholder="Re-enter the password"
                  autoComplete="new-password"
                  required={!editing}
                />
                {fieldError ? <div className="field-error">{fieldError}</div> : null}
              </div>
              <div className="form-group">
                <label>Status</label>
                <select className="input" value={form.status} onChange={setField('status')}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-success" disabled={saving}>
                  {saving ? 'Saving…' : editing ? 'Update User' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="toolbar card">
        <span className="muted">{users.length} user(s)</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={loadUsers} disabled={loading}>
          ↻ Refresh
        </button>
      </div>

      {loading && users.length === 0 ? (
        <Spinner label="Loading users…" />
      ) : users.length === 0 ? (
        <p className="empty-state">No users found.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Name</th>
                <th>Role</th>
                <th>Assigned Mandal</th>
                <th>Email</th>
                <th>Status</th>
                <th className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <span className="mono">{u.username}</span>{' '}
                    {u.isSelf ? <Badge tone="green">You</Badge> : null}
                  </td>
                  <td>{u.name || '—'}</td>
                  <td>
                    <Badge tone={roleTone(u.role)}>{u.roleLabel || u.role}</Badge>
                  </td>
                  <td>{u.assignedMandal ? <Badge>{u.assignedMandal}</Badge> : '—'}</td>
                  <td>{u.email || '—'}</td>
                  <td>
                    <Badge tone={u.status === 'active' ? 'green' : 'red'}>
                      {u.status === 'active' ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="col-actions">
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        onClick={() => openEdit(u)}
                      >
                        Edit
                      </button>
                      {!u.isSelf ? (
                        <button
                          type="button"
                          className="btn btn-danger btn-xs"
                          onClick={() => setDeleteTarget(u)}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete User Account"
        message={`Delete user '${deleteTarget?.username}'? The account will be signed out permanently. This cannot be undone.`}
        confirmLabel="Delete User"
        tone="danger"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}