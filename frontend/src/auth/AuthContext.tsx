import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { api, clearAuthStorage } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { AuthUser } from '@/types';

interface LoginResult {
  mfaRequired: boolean;
  mfaToken?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  verifyMfaLogin: (mfaToken: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function applySession(data: { accessToken: string; refreshToken: string; user: AuthUser }) {
  localStorage.setItem('samp_auth', JSON.stringify({ accessToken: data.accessToken, refreshToken: data.refreshToken }));
  return data.user;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    const raw = localStorage.getItem('samp_auth');
    if (!raw) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get<AuthUser>('/auth/me');
      setUser(data);
    } catch {
      clearAuthStorage();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    const { data } = await api.post('/auth/login', { email, password });
    if (data.mfaRequired) return { mfaRequired: true, mfaToken: data.mfaToken };
    // A previous account's cached queries (e.g. Active Sessions) must never leak into this session.
    queryClient.clear();
    setUser(applySession(data));
    return { mfaRequired: false };
  }, []);

  const verifyMfaLogin = useCallback(async (mfaToken: string, code: string) => {
    const { data } = await api.post('/auth/mfa/login-verify', { mfaToken, code });
    queryClient.clear();
    setUser(applySession(data));
  }, []);

  const logout = useCallback(async () => {
    const raw = localStorage.getItem('samp_auth');
    const refreshToken = raw ? JSON.parse(raw).refreshToken : null;
    try {
      if (refreshToken) await api.post('/auth/logout', { refreshToken });
    } catch {
      /* best-effort */
    }
    clearAuthStorage();
    queryClient.clear();
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, verifyMfaLogin, logout, refreshMe }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
