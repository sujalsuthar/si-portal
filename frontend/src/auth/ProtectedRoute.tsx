import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { RoleName } from '@/types';

export function ProtectedRoute({ roles }: { roles?: RoleName[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-500">
        Loading…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;

  const onOnboardingRoute = location.pathname.startsWith('/onboarding');
  if (!onOnboardingRoute) {
    if (user.mustChangePassword) return <Navigate to="/onboarding/password" replace />;
    if (user.mustSetupMfa) return <Navigate to="/onboarding/mfa-setup" replace />;
  }

  return <Outlet />;
}
