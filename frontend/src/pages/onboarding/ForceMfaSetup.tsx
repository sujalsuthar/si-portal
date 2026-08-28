import { useAuth } from '@/auth/AuthContext';
import MfaSetupFlow from '@/components/MfaSetupFlow';

export default function ForceMfaSetup() {
  const { refreshMe, logout } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-center text-xl font-bold text-ink">Set up two-factor authentication</h1>
        <p className="mb-6 text-center text-sm text-ink-muted">This institution requires a second sign-in factor for every account before you can continue.</p>
        <div className="card p-6">
          <MfaSetupFlow onEnabled={() => refreshMe()} />
        </div>
        <button type="button" className="btn-ghost mt-3 w-full text-sm" onClick={() => logout()}>Sign out</button>
      </div>
    </div>
  );
}
