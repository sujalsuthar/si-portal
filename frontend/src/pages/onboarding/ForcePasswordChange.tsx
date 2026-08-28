import { useState } from 'react';
import toast from 'react-hot-toast';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';

export default function ForcePasswordChange() {
  const { refreshMe, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirm) return toast.error('Passwords do not match');
    setSubmitting(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      toast.success('Password updated');
      await refreshMe();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-center text-xl font-bold text-ink">Set a new password</h1>
        <p className="mb-6 text-center text-sm text-ink-muted">This account was created with a temporary password. Choose a new one to continue.</p>
        <form onSubmit={onSubmit} className="card space-y-4 p-6">
          <label className="block">
            <span className="label">Current (temporary) password</span>
            <input className="input" type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">New password</span>
            <input className="input" type="password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Confirm new password</span>
            <input className="input" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          <p className="text-xs text-ink-muted">At least 8 characters, with upper and lower case letters and a number.</p>
          <button type="submit" disabled={submitting} className="btn-primary w-full">{submitting ? 'Saving…' : 'Set password'}</button>
          <button type="button" className="btn-ghost w-full text-sm" onClick={() => logout()}>Sign out</button>
        </form>
      </div>
    </div>
  );
}
