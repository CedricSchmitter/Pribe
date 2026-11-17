import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { API_PATHS, type AuthStatusDto, type LoginRequest } from '@pribe/shared';
import { api } from './api';

interface AuthValue {
  /** `null` while the first check is running. */
  authenticated: boolean | null;
  login(password: string): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

/** Admin session state shared by /admin, /host and the shell's lock icons (same password, R10). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    api<AuthStatusDto>(API_PATHS.auth.me)
      .then((s) => setAuthenticated(s.authenticated))
      .catch(() => setAuthenticated(false));
  }, []);

  const login = useCallback(async (password: string) => {
    const s = await api<AuthStatusDto>(API_PATHS.auth.login, { body: { password } satisfies LoginRequest });
    setAuthenticated(s.authenticated);
  }, []);

  const logout = useCallback(async () => {
    await api<AuthStatusDto>(API_PATHS.auth.logout, { method: 'POST', body: {} });
    setAuthenticated(false);
  }, []);

  const value = useMemo(() => ({ authenticated, login, logout }), [authenticated, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth needs <AuthProvider>');
  return ctx;
}
