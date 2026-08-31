/**
 * Dashboard statistic card.
 * `tone` controls the accent colour: navy | green | amber | red | purple | blue
 */
export default function StatCard({ label, value, icon = '📊', tone = 'navy', sub }) {
  return (
    <div className={`stat-card stat-${tone}`}>
      <div className="stat-top">
        <span className="stat-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="stat-value">{value ?? '—'}</span>
      </div>
      <div className="stat-label">{label}</div>
      {sub ? <div className="stat-sub">{sub}</div> : null}
    </div>
  );
}