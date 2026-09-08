import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import api from '../services/api';
import { homeForRole, roleLabel, ROLES } from '../utils/roles';

const AuthContext = createContext(null);

const TOKEN_KEY = 'token';
const USER_KEY = 'user';

/**
 * Auth state + login/logout. The token is stored in localStorage so the
 * user stays logged in across page refreshes. The logged-in `user` object
 * (role, assignedMandal, ...) is persisted too so the UI can render the
 * correct role-based menus immediately.
 *
 * Bootstrap flow: on startup we call GET /api/auth/boot/status. If the
 * DB has zero user accounts the backend responds with bootstrapMode:true
 * and the Register page becomes reachable WITHOUT authentication so the
 * first SUPER_ADMIN account can be created.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
      // Sessions saved before the role system existed carry no `role`, which
      // would break role-based routing (infinite redirect -> white page).
      // Treat them as logged out instead.
      if (parsed && !ROLES[parsed.role]) {
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem(TOKEN_KEY);
        return null;
      }
      return parsed;
    } catch {
      localStorage.removeItem(USER_KEY);
      return null;
    }
  });

  // True when the backend reports zero users in the DB.
  const [isBootstrapMode, setBootstrapMode] = useState(false);
  const [bootstrapChecked, setBootstrapChecked] = useState(false);

  // Probe the backend once on mount (only if not already logged in).
  useEffect(() => {
    if (user) {
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
          setBootstrapMode(false);
          setBootstrapChecked(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const persist = useCallback((token, userPayload) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(userPayload));
    setUser(userPayload);
    setBootstrapMode(false);
  }, []);

  const login = useCallback(
    async (username, password) => {
      const { data } = await api.post('/api/auth/login', { username, password });
      persist(data.token, data.user);
      return data.user;
    },
    [persist]
  );

  /**
   * Called after a successful /api/auth/boot request. Persists the token
   * and user (auto-login) and exits bootstrap mode.
   */
  const bootstrap = useCallback(
    (payload) => {
      persist(payload.token, payload.user);
      return payload.user;
    },
    [persist]
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  const isAuthenticated = Boolean(user) && Boolean(localStorage.getItem(TOKEN_KEY));

  const value = {
    user,
    // Backward-compatible alias (older components read `admin`).
    admin: user,
    isAuthenticated,
    isBootstrapMode,
    bootstrapChecked,
    login,
    logout,
    bootstrap,
    // Role helpers (thrown-away object, no state updates on read).
    role: user?.role,
    roleLabel: user ? roleLabel(user.role) : '',
    homePath: user ? homeForRole(user.role) : '/',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}