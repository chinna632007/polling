import { useState } from 'react';
import Spinner from './Spinner';
import Toast from './Toast';
import { sortByOfficerId } from '../utils/naturalSort';

/**
 * Booth-wise allocation cards (spec section 13).
 * Each booth is an expandable card with its allocated officers.
 */
export default function BoothWiseAllocation({ booths = [], allocationsByBooth = {}, loading, onRefresh }) {
  const [openId, setOpenId] = useState(null);
  const [notify, setNotify] = useState(null);

  if (loading) {
    return <Spinner label="Loading booth-wise allocation…" />;
  }
  if (!booths.length) {
    return <p className="empty-state">No booths uploaded yet.</p>;
  }

  return (
    <div className="boothwise-grid">
      {notify ? <Toast {...notify} onClose={() => setNotify(null)} /> : null}
      {booths.map((b) => {
        const key = String(b._id);
        const list = allocationsByBooth[key] || allocationsByBooth[b.boothId] || [];
        // Natural sort by Officer ID ascending (OFF1 < OFF2 < OFF10) — spec 12.7.
        const sortedList = sortByOfficerId(list, (a) => a.officer?.officerId);
        const required = b.requiredOfficers || 0;
        const allocated = sortedList.length;
        const available = Math.max(0, required - allocated);
        const open = openId === key;
        return (
          <section key={key} className="card booth-card">
            <header className="booth-head">
              <button
                type="button"
                className="mandal-toggle"
                onClick={() => setOpenId(open ? null : key)}
                aria-expanded={open}
              >
                <span className={`mandal-chevron ${open ? 'open' : ''}`}>&#9656;</span>
                <span className="mandal-title">
                  Booth {b.boothNumber} — {b.boothName}
                </span>
              </button>
              <span className={`badge badge-${available > 0 ? 'amber' : 'green'}`}>
                {allocated}/{required} allocated · {available} slot{available === 1 ? '' : 's'} free
              </span>
            </header>
            <div className="booth-meta muted">
              Building: {b.buildingName || '—'} · Locality: {b.locality || '—'}
              {b.ward ? ` · Ward ${b.ward}` : ''} · Mandal: {b.mandal || '—'}
            </div>
            {open ? (
              <div className="booth-body">
                {sortedList.length === 0 ? (
                  <p className="empty-state">No officers allocated to this booth yet.</p>
                ) : (
                  <div className="table-wrap">
                    <table className="table table-sm">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Officer Name</th>
                          <th>Officer ID</th>
                          <th>Designation</th>
                          <th>Mobile</th>
                          <th>Officer Locality</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedList.map((a, i) => (
                          <tr key={a._id}>
                            <td className="mono">{i + 1}</td>
                            <td>{a.officer?.officerName || '—'}</td>
                            <td className="mono">{a.officer?.officerId || '—'}</td>
                            <td>{a.officer?.designation || '—'}</td>
                            <td className="mono">{a.officer?.mobileNumber || '—'}</td>
                            <td>{a.officer?.locality || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {onRefresh ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRefresh()}>
                    Refresh data
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
