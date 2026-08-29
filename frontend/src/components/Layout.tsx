import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import AppSidebar from './AppSidebar';
import AppHeader from './AppHeader';

export default function Layout() {
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  if (!user) return null;

  const studentProfileId =
    user.role === 'STUDENT' && user.profile && typeof user.profile === 'object' && 'id' in user.profile
      ? String((user.profile as { id: string }).id)
      : null;

  return (
    <div className="flex h-dvh overflow-hidden bg-base">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <AppSidebar
        role={user.role}
        studentProfileId={studentProfileId}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <AppHeader onOpenMobile={() => setMobileOpen(true)} />
        <main id="main-content" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto max-lg:overflow-x-clip focus:outline-none">
          <div className="page-content p-4 md:p-6 lg:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
