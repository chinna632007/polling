import { useState, useEffect, useCallback } from 'react';
import ExcelUploader from '../components/ExcelUploader';
import Toast from '../components/Toast';
import Badge from '../components/Badge';
import Spinner from '../components/Spinner';
import ConfirmModal from '../components/ConfirmModal';
import api, { getErrorMessage } from '../services/api';

export default function UploadExcel() {
  const [imported, setImported] = useState(null);
  const [notify, setNotify] = useState(null);

  // Uploaded-file history (one row per committed Excel file).
  const [uploads, setUploads] = useState([]);
  const [uploadsLoading, setUploadsLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // "Delete All Files" confirmation state.
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  const fetchUploads = useCallback(async () => {
    setUploadsLoading(true);
    try {
      const { data } = await api.get('/api/upload/history');
      setUploads(data.data || []);
    } catch (err) {
      setNotify({ message: getErrorMessage(err), type: 'error' });
    } finally {
      setUploadsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUploads();
  }, [fetchUploads]);

  const confirmDeleteUpload = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { data } = await api.delete(`/api/upload/${deleteTarget.id}`);
      setNotify({
        message: data.message || `Deleted uploaded file '${deleteTarget.fileName}'`,
        type: 'success',
        duration: 8000,
      });
      setDeleteTarget(null);
      await fetchUploads();
    } catch (err) {
      setNotify({ message: getErrorMessage(err), type: 'error', duration: 8000 });
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  /** Wipes EVERY uploaded file and all its data from the database. */
  const doDeleteAll = async () => {
    setClearing(true);
    try {
      const { data } = await api.delete('/api/upload/all');
      setNotify({
        message: data.message || 'All uploaded files and their data were deleted',
        type: 'success',
        duration: 8000,
      });
      setConfirmClear(false);
      await fetchUploads();
    } catch (err) {
      setNotify({ message: getErrorMessage(err), type: 'error', duration: 8000 });
      setConfirmClear(false);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="page">
      {notify ? <Toast {...notify} onClose={() => setNotify(null)} /> : null}

      <div className="page-head">
        <div>
          <h1 className="page-title">Excel Upload</h1>
          <p className="page-subtitle">
            Import officers and booths from Excel. Validate before importing — duplicates are
            automatically skipped.
          </p>
        </div>
      </div>

      {imported ? (
        <div className="alert alert-success">
          Last import: {imported.inserted ?? 0} inserted, {imported.skipped ?? 0} skipped
          (duplicate IDs are ignored).
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setImported(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="upload-grid">
        <ExcelUploader
          kind="officers"
          onImported={(result) => {
            setImported(result);
            fetchUploads();
          }}
        />
        <ExcelUploader
          kind="booths"
          onImported={(result) => {
            setImported(result);
            fetchUploads();
          }}
        />
      </div>

      <div className="card upload-history">
        <div className="upload-history-head">
          <h3 className="card-title">Uploaded Files</h3>
          <div className="page-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={fetchUploads}
              disabled={uploadsLoading || clearing}
            >
              ↻ Refresh
            </button>
            {uploads.length > 0 ? (
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => setConfirmClear(true)}
                disabled={clearing || deleting}
              >
                🗑 Delete All Files
              </button>
            ) : null}
          </div>
        </div>

        {uploadsLoading && uploads.length === 0 ? (
          <Spinner label="Loading upload history…" small />
        ) : uploads.length === 0 ? (
          <p className="empty-state">No files uploaded yet. Import an Excel file above.</p>
        ) : (
          <div className="table-wrap">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>File Name</th>
                  <th>Type</th>
                  <th>Inserted</th>
                  <th>Skipped</th>
                  <th>Uploaded By</th>
                  <th>Uploaded At</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {uploads.map((u) => (
                  <tr key={u.id}>
                    <td className="file-name">📄 {u.fileName}</td>
                    <td>
                      <Badge tone={u.kind === 'booths' ? 'blue' : 'purple'}>
                        {u.kind === 'booths' ? 'Booths' : 'Officers'}
                      </Badge>
                    </td>
                    <td className="mono">{u.inserted}</td>
                    <td className="mono">{u.skipped}</td>
                    <td>{u.uploadedByUsername || '—'}</td>
                    <td className="muted">
                      {u.uploadedAt ? new Date(u.uploadedAt).toLocaleString() : '—'}
                    </td>
                    <td className="col-actions">
                      <button
                        type="button"
                        className="btn btn-danger btn-xs"
                        onClick={() => setDeleteTarget(u)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete Uploaded File"
        message={
          deleteTarget
            ? `Delete uploaded file '${deleteTarget.fileName}'? This will permanently delete its ${deleteTarget.inserted} ${
                deleteTarget.kind === 'booths' ? 'booth' : 'officer'
              }(s) (plus any linked allocations and notifications) from the database. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete File"
        tone="danger"
        loading={deleting}
        onConfirm={confirmDeleteUpload}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmModal
        open={confirmClear}
        title="Delete All Uploaded Files"
        message="This will permanently delete ALL uploaded files and ALL their data from the database — every officer, booth, allocation and notification record. This cannot be undone."
        confirmLabel="Delete Everything"
        tone="danger"
        loading={clearing}
        onConfirm={doDeleteAll}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}