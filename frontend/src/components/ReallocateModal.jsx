import { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../services/api';
import Spinner from './Spinner';

/**
 * Reallocate modal (spec section 16).
 * Shows the current booth + officer address, then lets the admin pick one of
 * the backend-computed suitable booths. The frontend never decides the rules.
 */
export default function ReallocateModal({ allocation, onClose, onDone }) {
  const [booths, setBooths] = useState([]);
  const [officer, setOfficer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const officerId = allocation?.officer?.officerId;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!officerId) return;
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.get(
          `/api/allocation/suitable-booths/${encodeURIComponent(officerId)}`
        );
        if (cancelled) return;
        setOfficer(data.data?.officer || null);
        setBooths(data.data?.booths || []);
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [officerId]);

  if (!allocation) return null;

  const current = allocation.booth;

  const submit = async () => {
    if (!selected) {
      setError('Please select a suitable booth first.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post(`/api/allocation/${allocation._id}/reallocate`, {
        preferredBoothId: selected,
      });
      if (onDone) await onDone();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Reallocate {allocation.officer?.officerName}</h3>
        <div className="realloc-grid">
          <div className="realloc-box">
            <h4>Current booth</h4>
            <p><strong>Booth {current?.boothNumber}</strong> — {current?.boothName || '—'}</p>
            <p className="muted">{current?.buildingName || ''}{current?.locality ? ` · ${current.locality}` : ''}{current?.mandal ? ` · ${current.mandal}` : ''}</p>
          </div>
          <div className="realloc-box">
            <h4>Officer address</h4>
            <p>{officer?.officerName || allocation.officer?.officerName} ({officer?.officerId || allocation.officer?.officerId})</p>
            <p className="muted">
              {[officer?.houseNumber || allocation.officer?.houseNumber, officer?.street || allocation.officer?.street, officer?.locality || allocation.officer?.locality, officer?.ward || allocation.officer?.ward ? `Ward ${officer?.ward || allocation.officer?.ward}` : '', officer?.mandal || allocation.officer?.mandal].filter(Boolean).join(', ')}
            </p>
          </div>
        </div>

        <h4 className="modal-sub">Suitable available booths (same Mandal, different locality)</h4>
        {loading ? (
          <Spinner label="Loading suitable booths…" />
        ) : error && booths.length === 0 ? (
          <p className="empty-state">{error}</p>
        ) : booths.length === 0 ? (
          <p className="empty-state">No suitable alternative booth with free capacity.</p>
        ) : (
          <div className="table-wrap">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th></th>
                  <th>Booth No.</th>
                  <th>Booth Name</th>
                  <th>Building</th>
                  <th>Locality</th>
                  <th>Free slots</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {booths
                  .filter((b) => String(b._id) !== String(current?._id))
                  .map((b) => (
                    <tr key={b._id}>
                      <td>
                        <input
                          type="radio"
                          name="realloc-booth"
                          checked={selected === String(b._id)}
                          onChange={() => setSelected(String(b._id))}
                        />
                      </td>
                      <td className="mono">{b.boothNumber}</td>
                      <td>{b.boothName}</td>
                      <td>{b.buildingName || '—'}</td>
                      <td>{b.locality || '—'}</td>
                      <td className="mono">{b.availableSlots}</td>
                      <td className="muted">{b.reason || '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
        {error && booths.length > 0 ? <p className="field-error">{error}</p> : null}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={submit}
            disabled={saving || loading || booths.length === 0}
          >
            {saving ? 'Reallocating…' : 'Confirm reallocation'}
          </button>
        </div>
      </div>
    </div>
  );
}
