import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { components } from '@uniflow/api-client';
import { api, resultData, setCsrfToken } from '../../platform/api';
import { writeSessionToken } from '../../platform/session-storage';

export type User = components['schemas']['UserDto'];
type AuthContextValue = {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
};
const AuthContext = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const result = await api.GET('/api/v1/auth/session');
      if (result.response.ok && result.data) {
        setUser(result.data.user);
        setCsrfToken(result.data.csrfToken);
      } else if (result.response.status === 401) {
        setUser(null);
        setCsrfToken(undefined);
        await writeSessionToken(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh().catch(() => setLoading(false));
  }, [refresh]);
  async function login(email: string, password: string) {
    const data = resultData(await api.POST('/api/v1/auth/login', { body: { email, password } }));
    if (data.token) await writeSessionToken(data.token);
    setCsrfToken(data.csrfToken);
    setUser(data.user);
  }
  async function logout() {
    const result = await api.POST('/api/v1/auth/logout');
    if (!result.response.ok && result.response.status !== 401) resultData(result);
    await writeSessionToken(null);
    setCsrfToken(undefined);
    setUser(null);
  }
  return (
    <AuthContext.Provider value={{ user, loading, refresh, login, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('AuthProvider is missing');
  return context;
}
