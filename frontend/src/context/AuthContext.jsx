import { createContext, useContext, useState, useCallback } from 'react';
import api from '../services/api';
import { homeForRole, roleLabel } from '../utils/roles';

const AuthContext = createContext(null);

const TOKEN_KEY = 'token';
const USER_KEY = 'user';

/**
 * Auth state + login/logout for the single Main Admin.
 * The token is stored in localStorage so the admin stays logged in across
 * page refreshes.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch {
      localStorage.removeItem(USER_KEY);
      return null;
    }
  });

  const persist = useCallback((token, userPayload) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(userPayload));
    setUser(userPayload);
  }, []);

  const login = useCallback(
    async (username, password) => {
      const { data } = await api.post('/api/auth/login', { username, password });
      persist(data.token, data.user);
      return data.user;
    },
    [persist]
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem('admin');
    setUser(null);
  }, []);

  const isAuthenticated = Boolean(user) && Boolean(localStorage.getItem(TOKEN_KEY));

  const value = {
    user,
    // Backward-compatible alias (older components read `admin`).
    admin: user,
    isAuthenticated,
    isBootstrapMode: false,
    bootstrapChecked: true,
    login,
    logout,
    // Role helpers.
    role: user?.role,
    roleLabel: user ? roleLabel(user.role) : '',
    homePath: homeForRole(user?.role),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}