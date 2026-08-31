import { useEffect, useState } from 'react';

/**
 * Lightweight toast notification.
 * Auto-dismisses after `duration` ms.
 */
export default function Toast({ message, type = 'success', onClose, duration = 4000 }) {
  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onClose]);

  if (!message) return null;

  return (
    <div className={`toast toast-${type}`} role="alert">
      <span className="toast-icon">{type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
      <span className="toast-message">{message}</span>
      <button type="button" className="toast-close" onClick={onClose} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}

export function useToastState() {
  const [notify, setNotify] = useState(null);
  return {
    notify,
    notifySuccess: (msg) => setNotify({ message: msg, type: 'success' }),
    notifyError: (msg) => setNotify({ message: msg, type: 'error' }),
    notifyInfo: (msg) => setNotify({ message: msg, type: 'info' }),
    clear: () => setNotify(null),
  };
}