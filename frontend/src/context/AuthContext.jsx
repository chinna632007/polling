import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

const TOKEN_KEY = 'token';
const ADMIN_KEY = 'admin';

/**
 * Auth state + login/logout. The token is stored in localStorage so the
 * admin stays logged in across page refreshes.
 *
 * Bootstrap flow: on startup we call GET /api/auth/boot/status. If the
 * DB has zero admin accounts the backend responds with
 * { bootstrapMode: true } and useAuth.isBootstrapMode becomes true.
 *
 * In that case the Register page is reachable WITHOUT authentication and
 * calls POST /api/auth/boot (public) to create the first admin, which also
 * returns a signed JWT that is stored here via bootstrap().
 */
export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(ADMIN_KEY) || 'null');
    } catch {
      return null;
    }
  });

  // True when the backend reports zero admin accounts in the DB.
  const [isBootstrapMode, setBootstrapMode] = useState(false);
  const [bootstrapChecked, setBootstrapChecked] = useState(false);

  // Probe the backend once on mount (only if not already logged in) to
  // determine whether bootstrap mode is active.
  useEffect(() => {
    if (admin) {
      setBootstrapMode(false);
      setBootstrapChecked(true);
      return;
    }
    let cancelled = false;
    api
      .get('/api/auth/boot/status')
      .then(({ data }) => {
        if (!cancelled) {
          setBootstrapMode(Boolean(data?.bootstrapMode));
          setBootstrapChecked(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          // If the backend is unreachable, assume non-bootstrap so the
          // standard login flow is shown.
          setBootstrapMode(false);
          setBootstrapChecked(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [admin]);

  const login = useCallback(async (username, password) => {
    const { data } = await api.post('/api/auth/login', { username, password });
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(ADMIN_KEY, JSON.stringify(data.admin));
    setAdmin(data.admin);
    setBootstrapMode(false);
    return data.admin;
  }, []);

  /**
   * Called after a successful /api/auth/boot request. Persists the token
   * and admin to localStorage (auto-login) and exits bootstrap mode.
   */
  const bootstrap = useCallback((payload) => {
    localStorage.setItem(TOKEN_KEY, payload.token);
    localStorage.setItem(ADMIN_KEY, JSON.stringify(payload.admin));
    setAdmin(payload.admin);
    setBootstrapMode(false);
    return payload.admin;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ADMIN_KEY);
    setAdmin(null);
  }, []);

  const value = {
    admin,
    isAuthenticated: Boolean(admin) && Boolean(localStorage.getItem(TOKEN_KEY)),
    isBootstrapMode,
    bootstrapChecked,
    login,
    logout,
    bootstrap,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}