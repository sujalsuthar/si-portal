import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

/** Ensures absolute API URLs include the /api prefix (common deploy mistake). */
function resolveApiBaseUrl(): string {
  const raw = (import.meta.env.VITE_API_URL || '/api').trim().replace(/\/$/, '');
  if (raw === '/api' || raw.endsWith('/api')) return raw;
  if (raw.startsWith('http')) return `${raw}/api`;
  return raw;
}

const API_URL = resolveApiBaseUrl();

export const api = axios.create({ baseURL: API_URL });

/** Unauthenticated client for public pages (certificate verify) — never redirects to login. */
export const publicApi = axios.create({ baseURL: API_URL });

function getStoredTokens() {
  const raw = localStorage.getItem('samp_auth');
  return raw ? (JSON.parse(raw) as { accessToken: string; refreshToken: string; sessionId?: string }) : null;
}

function storeTokens(accessToken: string, refreshToken: string, sessionId?: string) {
  const raw = localStorage.getItem('samp_auth');
  const parsed = raw ? JSON.parse(raw) : {};
  localStorage.setItem('samp_auth', JSON.stringify({ ...parsed, accessToken, refreshToken, ...(sessionId ? { sessionId } : {}) }));
}

export function getStoredSessionId(): string | undefined {
  return getStoredTokens()?.sessionId;
}

export function clearAuthStorage() {
  localStorage.removeItem('samp_auth');
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const tokens = getStoredTokens();
  if (tokens?.accessToken) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${tokens.accessToken}`;
  }
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const tokens = getStoredTokens();
  if (!tokens?.refreshToken) return null;
  try {
    const { data } = await axios.post(`${API_URL}/auth/refresh`, { refreshToken: tokens.refreshToken });
    storeTokens(data.accessToken, data.refreshToken, data.sessionId);
    return data.accessToken as string;
  } catch {
    clearAuthStorage();
    return null;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retry && !original.url?.includes('/auth/') && !original.url?.includes('/verify/')) {
      original._retry = true;
      refreshPromise = refreshPromise ?? refreshAccessToken();
      const newToken = await refreshPromise;
      refreshPromise = null;
      if (newToken) {
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

export function apiErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(err)) {
    const payload = err.response?.data as {
      error?: {
        message?: string;
        details?: { fieldErrors?: Record<string, string[]>; formErrors?: string[] } | Array<{ path?: (string | number)[]; message?: string }>;
      };
    } | undefined;
    const message = payload?.error?.message;
    const details = payload?.error?.details;
    if (details && !Array.isArray(details) && details.fieldErrors) {
      const firstField = Object.entries(details.fieldErrors).find(([, msgs]) => msgs?.length);
      if (firstField) return `${message ?? 'Validation failed'}: ${firstField[0]} — ${firstField[1][0]}`;
      if (details.formErrors?.length) return `${message ?? 'Validation failed'}: ${details.formErrors[0]}`;
    }
    if (Array.isArray(details) && details.length > 0) {
      const first = details[0];
      const path = Array.isArray(first.path) ? first.path.join('.') : '';
      const detailMsg = first.message ?? '';
      if (path || detailMsg) return `${message ?? 'Validation failed'}: ${path ? `${path} — ` : ''}${detailMsg}`.trim();
    }
    return message ?? fallback;
  }
  return fallback;
}
