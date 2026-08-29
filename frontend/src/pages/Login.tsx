import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '@/auth/AuthContext';
import { apiErrorMessage } from '@/lib/api';

const ROLE_CHIPS = ['Student', 'Parent', 'Team', 'Admin'] as const;

export default function Login() {
  const { user, login, verifyMfaLogin } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [forgotHint, setForgotHint] = useState(false);

  const showDemoHint = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_HINT === 'true';

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const result = await login(email, password);
      if (result.mfaRequired && result.mfaToken) {
        setMfaToken(result.mfaToken);
      } else {
        navigate('/', { replace: true });
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Invalid email or password'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaToken) return;
    setSubmitting(true);
    try {
      await verifyMfaLogin(mfaToken, code);
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Invalid authentication code'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-brand-900 px-4 py-10">
      <div className="pointer-events-none absolute inset-0 opacity-30" aria-hidden="true">
        <div className="absolute -left-20 top-10 h-64 w-64 rounded-full bg-brand-300 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-brand-900 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center text-white">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/95 text-2xl font-bold text-brand-700 shadow-lg">
            S
          </div>
          <h1 className="text-3xl font-bold tracking-tight">SI Portal</h1>
          <p className="mt-2 text-sm text-brand-100">One connected system from admissions to certification.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {ROLE_CHIPS.map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-medium text-white/95"
              >
                {chip}
              </span>
            ))}
          </div>
        </div>

        {!mfaToken ? (
          <form onSubmit={handleSubmit} className="card space-y-4 p-6 shadow-xl">
            <div>
              <label className="label" htmlFor="login-email">
                Email
              </label>
              <input
                id="login-email"
                className="input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@siportal.edu"
                autoFocus
                autoComplete="username"
              />
            </div>
            <div>
              <label className="label" htmlFor="login-password">
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  className="input pr-16"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-medium text-brand-ink hover:bg-surface-muted"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
            <div className="text-center">
              <button
                type="button"
                className="text-xs font-medium text-brand-ink hover:underline"
                onClick={() => setForgotHint(true)}
              >
                Forgot password?
              </button>
            </div>
            {forgotHint && (
              <p className="rounded-lg bg-surface-muted px-3 py-2 text-center text-xs text-ink-muted">
                Ask your institute admin to reset your password. They can issue a temporary password from Settings.
              </p>
            )}
          </form>
        ) : (
          <form onSubmit={handleVerify} className="card space-y-4 p-6 shadow-xl">
            <div>
              <p className="mb-3 text-sm text-ink-muted">
                Enter the 6-digit code from your authenticator app, or a backup code.
              </p>
              <label className="label" htmlFor="mfa-code">
                Authentication code
              </label>
              <input
                id="mfa-code"
                className="input text-center text-lg tracking-widest"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="000000"
                autoFocus
                maxLength={10}
                autoComplete="one-time-code"
              />
            </div>
            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? 'Verifying…' : 'Verify'}
            </button>
            <button type="button" className="btn-ghost w-full text-sm" onClick={() => setMfaToken(null)}>
              Back to sign in
            </button>
          </form>
        )}

        <p className="mt-5 text-center text-xs text-brand-100">Need help? Contact your institute admin.</p>
        {showDemoHint && (
          <p className="mt-2 text-center text-[10px] text-brand-200/80">Demo environment — use seeded accounts from your team brief.</p>
        )}
      </div>
    </div>
  );
}
