import { NavLink, Outlet } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import NotificationBell from './NotificationBell';
import ThemeToggle from './ThemeToggle';
import { RoleName } from '@/types';
import { roleLabel } from '@/lib/roleLabels';
import { STAFF, ADMIN_LIKE, FEE_ROLES, REPORTS_ROLES, CERTIFICATE_ROLES, NOT_PARENT } from '@/lib/navRoles';

interface NavItem {
  to: string;
  label: string;
  roles?: RoleName[];
}

// "People" and "Batches" are no longer separate top-level items - both now live inside the
// Performance hub (Performance → Batches, Performance → Community) per the 4.0 issue log's
// navigation restructure.
const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard' },
  { to: '/feed', label: 'Feed' },
  { to: '/sessions', label: 'Sessions', roles: STAFF },
  // Students need Exams in nav to reach Take Exam for their batch papers.
  { to: '/exams', label: 'Exams', roles: [...STAFF, 'STUDENT'] },
  { to: '/tasks', label: 'Tasks' },
  { to: '/performance', label: 'Performance', roles: NOT_PARENT },
  { to: '/interns', label: 'Interns', roles: [...STAFF, 'STUDENT'] },
  { to: '/projects', label: 'Projects', roles: NOT_PARENT },
  { to: '/fees', label: 'Fees', roles: FEE_ROLES },
  { to: '/certificates', label: 'Certificates', roles: CERTIFICATE_ROLES },
  { to: '/action-centre', label: 'Action Centre' },
  { to: '/reports', label: 'Reports', roles: REPORTS_ROLES },
  { to: '/notifications', label: 'Notifications' },
  { to: '/calendar', label: 'Calendar', roles: ['FACULTY'] },
  { to: '/search', label: 'Search', roles: ['SUPER_ADMIN'] },
  { to: '/backup', label: 'Backup', roles: ADMIN_LIKE },
  { to: '/settings', label: 'Settings' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  if (!user) return null;

  const visibleNav = NAV.filter((item) => !item.roles || item.roles.includes(user.role));

  return (
    <div className="flex min-h-screen bg-base">
      <a href="#main-content" className="skip-link">Skip to main content</a>

      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 transform bg-slate-900 text-slate-200 transition-transform md:static md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
        aria-hidden={!mobileOpen}
        aria-label="Primary navigation"
      >
        <div className="flex h-16 items-center gap-2 px-5 border-b border-slate-800">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-ink">S</div>
          <span className="font-semibold text-white text-sm leading-tight">SI Portal</span>
        </div>
        <nav className="mt-2 space-y-0.5 px-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 4rem)' }}>
          {visibleNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `block min-h-[2.75rem] rounded-lg px-3 py-2.5 text-sm font-medium transition-colors flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                  isActive ? 'bg-brand-600 text-ink' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {mobileOpen && <div className="fixed inset-0 z-20 bg-black/50 md:hidden" onClick={() => setMobileOpen(false)} aria-hidden="true" />}

      <div className="flex flex-1 flex-col min-w-0">
        <header className="card flex h-16 items-center justify-between rounded-none border-x-0 border-t-0 px-4 md:px-6">
          <button className="min-h-[2.75rem] min-w-[2.75rem] md:hidden rounded-lg p-2 hover:bg-surface-muted" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            ☰
          </button>
          <div className="hidden md:block text-sm text-ink-muted">
            {roleLabel(user.role)}
          </div>
          <div className="flex items-center gap-1 sm:gap-3">
            <ThemeToggle />
            <NotificationBell />
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-ink">{user.email}</p>
              <p className="text-xs text-ink-muted">{roleLabel(user.role)}</p>
            </div>
            <button onClick={() => logout()} className="btn-ghost text-sm">Sign out</button>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="flex-1 p-4 md:p-6 min-w-0 focus:outline-none">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
