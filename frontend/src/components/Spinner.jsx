/** Centered loading spinner. */
export default function Spinner({ label = 'Loading...', small = false }) {
  return (
    <div className={`spinner-wrap ${small ? 'spinner-wrap-sm' : ''}`}>
      <span className="spinner" aria-hidden="true" />
      {label ? <span className="spinner-label">{label}</span> : null}
    </div>
  );
}