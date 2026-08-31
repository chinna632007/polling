import { useRef, useState, useCallback } from 'react';
import api, { getErrorMessage } from '../services/api';
import Spinner from './Spinner';
import Toast from './Toast';
import Badge from './Badge';

/** Human friendly column-hint for each template type. */
const FORMAT_HINTS = {
  officers: [
    'Officer ID',
    'Officer Name',
    'Designation',
    'Mobile Number',
    'Email',
    'House Number',
    'Street',
    'Village/Locality',
    'Ward',
    'Mandal',
    'District',
    'PIN Code',
  ],
  booths: [
    'Booth ID',
    'Booth Number',
    'Booth Name',
    'Building Name',
    'Street',
    'Village/Locality',
    'Ward',
    'Mandal',
    'District',
    'PIN Code',
    'Required Officers',
  ],
};

/**
 * Reusable Excel upload widget.
 *
 * @param kind 'officers' | 'booths'     which upload endpoint to call
 * @param onImported callback(result)    called after rows are committed
 */
export default function ExcelUploader({ kind = 'officers', onImported }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [mode, setMode] = useState('preview'); // preview | commit
  const [loading, setLoading] = useState(false);
  const [notify, setNotify] = useState(null);

  const isOfficers = kind === 'officers';
  const apiUrl = isOfficers ? '/api/upload/officers' : '/api/upload/booths';
  const title = isOfficers ? 'Upload Officers Excel' : 'Upload Booths Excel';

  const handleFile = useCallback(
    (selected) => {
      if (!selected || !selected[0]) return;
      setFile(selected[0]);
      setPreview([]);
      setTotalRows(0);
      setMode('preview');
      setNotify({ message: 'File selected – validating…', type: 'info' });

      // Step 1: validate + preview only
      const form = new FormData();
      form.append('file', selected[0]);
      setLoading(true);
      api
        .post(`${apiUrl}?mode=preview`, form, {
          // Explicit multipart header: Axios 1.x strips it in the browser and
          // lets the browser set the correct boundary. This prevents FormData
          // being serialized as JSON (which made multer report "no file").
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        .then(({ data }) => {
          if (!data.success) throw new Error(data.message || 'Validation failed');
          setPreview(data.preview || []);
          setTotalRows(data.totalRows || 0);
          setNotify({ message: data.message || 'Validation successful', type: 'success' });
        })
        .catch((error) => {
          // Surface the server's detailed validation info when available.
          const body = error?.response?.data;
          let msg = getErrorMessage(error);
          if (body?.missingColumns?.length) {
            msg = `Missing required columns: ${body.missingColumns.join(', ')}`;
          } else if (Array.isArray(body?.errors) && body.errors.length > 0) {
            const head = body.errors.slice(0, 3).join(' | ');
            msg =
              body.errors.length > 3
                ? `${head} (+${body.errors.length - 3} more)`
                : head;
          }
          setPreview([]);
          setNotify({ message: msg, type: 'error', duration: 8000 });
        })
        .finally(() => setLoading(false));
    },
    [apiUrl]
  );

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      handleFile(e.dataTransfer.files);
    },
    [handleFile]
  );

  // Step 2: commit import
  const importRows = async () => {
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    setLoading(true);
    try {
      const { data } = await api.post(`${apiUrl}?mode=commit`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (!data.success) throw new Error(data.message || 'Import failed');
      setMode('commit');
      setNotify({ message: data.message || 'Imported successfully', type: 'success' });
      if (onImported) onImported(data);
    } catch (error) {
      setNotify({ message: getErrorMessage(error), type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Templates are JWT-protected, so a plain <a href> would get a 401.
  // Download through the authenticated axios instance instead.
  const downloadTemplate = async () => {
    try {
      const response = await api.get(`/api/upload/templates/${kind}`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download =
        kind === 'officers' ? 'officers-template.xlsx' : 'booths-template.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setNotify({ message: getErrorMessage(error), type: 'error' });
    }
  };

  return (
    <div className="card">
      {notify ? <Toast {...notify} onClose={() => setNotify(null)} /> : null}

      <div className="upload-head">
        <h3 className="card-title">{title}</h3>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={downloadTemplate}
          disabled={loading}
        >
          Download Sample Template (.xlsx)
        </button>
      </div>
<div
        className={`dropzone ${dragOver ? 'dropzone-active' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          hidden
          onChange={(e) => handleFile(e.target.files)}
        />
        <span className="dropzone-icon" aria-hidden="true">
          📂
        </span>
        <p className="dropzone-text">
          <strong>Drag &amp; drop</strong> your Excel file here, or click to browse
        </p>
        <p className="dropzone-sub">Allowed formats: .xlsx, .xls, .csv (max 5 MB)</p>
        {file ? <p className="dropzone-file mono">{file.name}</p> : null}
      </div>

      <div className="format-hint">
        <h4>Required Column Format</h4>
        <div className="format-chips">
          {FORMAT_HINTS[kind].map((col) => (
            <span key={col} className="chip">
              {col}
            </span>
          ))}
        </div>
      </div>

      {loading && <Spinner label="Processing Excel…" small />}

      {!loading && preview.length > 0 && (
        <div className="preview-block">
          <div className="preview-head">
            <h4>
              Data Preview{' '}
              <span className="muted">
                ({preview.length} of {totalRows} rows)
              </span>
            </h4>
            {mode !== 'commit' ? (
              <button
                type="button"
                className="btn btn-success"
                onClick={importRows}
                disabled={loading}
              >
                Import {totalRows} rows
              </button>
            ) : (
              <Badge tone="green">Imported</Badge>
            )}
          </div>
          <div className="table-wrap">
            <table className="table table-sm">
              <thead>
                <tr>
                  {Object.keys(preview[0] || {}).map((key) => (
                    <th key={key}>{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i}>
                    {Object.keys(row).map((key) => (
                      <td key={key}>{row[key]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}