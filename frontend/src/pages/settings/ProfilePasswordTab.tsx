import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiErrorMessage, getStoredSessionId } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import MfaSetupFlow from '@/components/MfaSetupFlow';

export default function ProfilePasswordTab() {
  const { user, refreshMe } = useAuth();
  const sessionId = getStoredSessionId();
  const isParent = user?.role === 'PARENT';
  const { data: sessions } = useQuery({
    queryKey: ['sessions', user?.id],
    queryFn: async () => (await api.get('/auth/sessions')).data,
    enabled: !!user,
  });
  const currentSession = (sessions ?? []).find((s: any) => s.id === sessionId) ?? (sessions ?? [])[0];

  const { data: facultyContacts } = useQuery({
    queryKey: ['parent-faculty-contacts'],
    queryFn: async () => (await api.get('/parents/me/faculty-contacts')).data,
    enabled: isParent,
  });

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [settingUpMfa, setSettingUpMfa] = useState(false);
  const [disableForm, setDisableForm] = useState({ currentPassword: '', code: '' });

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirm) return toast.error('Passwords do not match');
    setSubmitting(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword, mfaCode: mfaCode || undefined });
      toast.success('Password updated');
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
      setMfaCode('');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function disableMfa() {
    try {
      await api.post('/auth/mfa/disable', disableForm);
      toast.success('Two-factor authentication disabled');
      setDisableForm({ currentPassword: '', code: '' });
      refreshMe();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <div className="grid max-w-2xl gap-6">
      {isParent ? (
        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">Contact</h2>
          <p className="mb-3 text-xs text-ink-muted">The faculty member responsible for each of your children.</p>
          <div className="space-y-2">
            {(facultyContacts ?? []).map((c: any) => (
              <div key={c.studentId} className="rounded-lg border border-edge px-3 py-2 text-sm">
                <p className="font-medium text-ink">{c.studentName}</p>
                {c.faculty ? (
                  <p className="text-xs text-ink-muted">{c.faculty.name} · {c.faculty.email}{c.faculty.phone ? ` · ${c.faculty.phone}` : ''}</p>
                ) : (
                  <p className="text-xs text-ink-muted">No faculty assigned yet</p>
                )}
              </div>
            ))}
            {facultyContacts?.length === 0 && <p className="text-sm text-ink-muted">No linked children</p>}
          </div>
        </div>
      ) : (
        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">Change Password</h2>
          <p className="mb-3 text-xs text-ink-muted">Your current password is always required to make this change{user?.mfaEnabled ? ', along with a live authentication code' : ''}.</p>
          <form onSubmit={changePassword} className="space-y-3">
            <label className="block"><span className="label">Current Password</span><input className="input" type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></label>
            <label className="block"><span className="label">New Password</span><input className="input" type="password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></label>
            <label className="block"><span className="label">Confirm New Password</span><input className="input" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
            {user?.mfaEnabled && (
              <label className="block"><span className="label">Authentication Code</span><input className="input" required value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} maxLength={8} /></label>
            )}
            <button type="submit" disabled={submitting} className="btn-primary">{submitting ? 'Saving…' : 'Update Password'}</button>
          </form>
        </div>
      )}

      <div className="card p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink">Two-Factor Authentication</h2>
        {user?.mfaEnabled ? (
          <div className="space-y-3">
            <p className="text-sm text-emerald-700 dark:text-emerald-400">Two-factor authentication is enabled on your account.</p>
            <p className="text-xs text-ink-muted">Disabling it requires your password and a current code.</p>
            <div className="grid grid-cols-2 gap-3">
              <input className="input" type="password" placeholder="Current password" value={disableForm.currentPassword} onChange={(e) => setDisableForm((f) => ({ ...f, currentPassword: e.target.value }))} />
              <input className="input" placeholder="Code" value={disableForm.code} onChange={(e) => setDisableForm((f) => ({ ...f, code: e.target.value }))} />
            </div>
            <button className="btn-danger" onClick={disableMfa}>Disable Two-Factor Authentication</button>
          </div>
        ) : settingUpMfa ? (
          <MfaSetupFlow onEnabled={() => { setSettingUpMfa(false); refreshMe(); }} />
        ) : (
          <div>
            <p className="mb-3 text-sm text-ink-muted">Add an authenticator app as a second sign-in factor.</p>
            <button className="btn-primary" onClick={() => setSettingUpMfa(true)}>Set Up Two-Factor Authentication</button>
          </div>
        )}
      </div>

      <div className="card p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink">Current Session</h2>
        <p className="mb-3 text-xs text-ink-muted">The browser session you are signed in with right now.</p>
        {currentSession ? (
          <div className="rounded-lg border border-edge px-3 py-2 text-sm text-ink-muted">
            Signed in {new Date(currentSession.createdAt).toLocaleString()} · expires {new Date(currentSession.expiresAt).toLocaleDateString()}
          </div>
        ) : (
          <p className="text-sm text-ink-muted">Session details unavailable.</p>
        )}
      </div>
    </div>
  );
}
