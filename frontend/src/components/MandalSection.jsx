import { useState } from 'react';

/**
 * Collapsible per-Mandal section.
 *
 * Every uploaded file's data is shown as its OWN section (mandals are never
 * joined together). Each section carries its own action buttons:
 *   - onAdd    -> "+ Add"    (new row pre-filled with this Mandal)
 *   - onDelete -> "Delete Mandal" (removes this Mandal's uploaded file data)
 *
 * Props:
 *   title        primary heading (usually the Mandal name)
 *   badgeLabel   small text inside the counter badge (e.g. "officers")
 *   count        number shown in the counter badge
 *   stats        optional array of { label, value } chips (e.g. Allocated 4/10)
 *   defaultOpen  whether the section starts expanded
 *   actions      extra node rendered in the header (buttons)
 *   children     the section body (usually a table)
 */
export default function MandalSection({
  title,
  badgeLabel = 'records',
  count = 0,
  stats = [],
  defaultOpen = true,
  actions = null,
  children,
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={`card mandal-section ${open ? '' : 'is-closed'}`}>
      <header className="mandal-head">
        <button
          type="button"
          className="mandal-toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span className={`mandal-chevron ${open ? 'open' : ''}`}>&#9656;</span>
          <span className="mandal-title">{title}</span>
          <span className="badge badge-navy">
            {count} {badgeLabel}
          </span>
        </button>

        {stats.length > 0 && (
          <div className="mandal-stats">
            {stats.map((s) => (
              <span key={s.label} className="mandal-stat">
                <span className="mandal-stat-label">{s.label}</span>
                <span className="mandal-stat-value">{s.value}</span>
              </span>
            ))}
          </div>
        )}

        {actions ? <div className="mandal-actions">{actions}</div> : null}
      </header>

      {open ? <div className="mandal-body">{children}</div> : null}
    </section>
  );
}
