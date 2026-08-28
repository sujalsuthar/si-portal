import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '@/auth/AuthContext';
import { apiErrorMessage } from '@/lib/api';

export default function Login() {
  const { user, login, verifyMfaLogin } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState('');

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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-700 via-brand-600 to-brand-900 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center text-white">
          <h1 className="text-2xl font-bold">SI Portal</h1>
          <p className="mt-1 text-sm text-brand-100">One connected system for admissions to certification.</p>
        </div>

        {!mfaToken ? (
          <form onSubmit={handleSubmit} className="card p-6 space-y-4">
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@siportal.edu" autoFocus />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="card p-6 space-y-4">
            <div>
              <p className="mb-2 text-sm text-ink-muted">Enter the 6-digit code from your authenticator app, or a backup code.</p>
              <label className="label">Authentication code</label>
              <input className="input tracking-widest text-center text-lg" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="000000" autoFocus maxLength={10} />
            </div>
            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? 'Verifying…' : 'Verify'}
            </button>
            <button type="button" className="btn-ghost w-full text-sm" onClick={() => setMfaToken(null)}>Back to sign in</button>
          </form>
        )}

        <p className="mt-4 text-center text-xs text-brand-100">
          Demo accounts are listed in the deployment README.
        </p>
      </div>
    </div>
  );
}
