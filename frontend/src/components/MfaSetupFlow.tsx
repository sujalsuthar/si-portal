import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';
import { api, apiErrorMessage } from '@/lib/api';

/** Shared TOTP enrollment flow: generate a secret, show its QR, confirm with one code, show backup codes once. */
export default function MfaSetupFlow({ onEnabled }: { onEnabled: () => void }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.post('/auth/mfa/setup');
        setSecret(data.secret);
        setQrDataUrl(await QRCode.toDataURL(data.otpauthUrl, { margin: 1, width: 220 }));
      } catch (err) {
        toast.error(apiErrorMessage(err, 'Could not start MFA setup'));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function enable(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { data } = await api.post('/auth/mfa/enable', { code });
      setBackupCodes(data.backupCodes);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Invalid code'));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="text-sm text-ink-muted">Preparing your authenticator setup…</p>;

  if (backupCodes) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-ink">Two-factor authentication is now active.</p>
        <p className="text-sm text-ink-muted">Save these one-time backup codes somewhere safe - each can be used once if you lose access to your authenticator app.</p>
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-surface-muted p-3 font-mono text-sm">
          {backupCodes.map((c) => <span key={c}>{c}</span>)}
        </div>
        <button className="btn-primary w-full" onClick={onEnabled}>Continue</button>
      </div>
    );
  }

  return (
    <form onSubmit={enable} className="space-y-4">
      <p className="text-sm text-ink-muted">Scan this QR code with an authenticator app (Google Authenticator, Authy, 1Password, etc.), or enter the key manually.</p>
      {qrDataUrl && <img src={qrDataUrl} alt="Authenticator QR code" className="mx-auto h-44 w-44" />}
      {secret && <p className="text-center font-mono text-sm tracking-wider text-ink-muted">{secret}</p>}
      <label className="block">
        <span className="label">Enter the 6-digit code to confirm</span>
        <input className="input text-center tracking-widest" required value={code} onChange={(e) => setCode(e.target.value)} maxLength={8} autoFocus />
      </label>
      <button type="submit" disabled={submitting} className="btn-primary w-full">{submitting ? 'Verifying…' : 'Enable two-factor authentication'}</button>
    </form>
  );
}
