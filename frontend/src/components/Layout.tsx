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

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard' },
  { to: '/feed', label: 'Feed' },
  { to: '/sessions', label: 'Sessions', roles: STAFF },
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
  { to: '/search', label: 'Search', roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'FACULTY'] },
  { to: '/backup', label: 'Backup', roles: ADMIN_LIKE },
  { to: '/settings', label: 'Settings' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  if (!user) return null;

  const visibleNav = NAV.filter((item) => !item.roles || item.roles.includes(user.role));

  return (
    <div className="flex h-dvh overflow-hidden bg-base">
      <a href="#main-content" className="skip-link">Skip to main content</a>

      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-64 max-w-[85vw] shrink-0 flex-col bg-slate-900 text-slate-200 transition-transform md:static md:max-w-none md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
        aria-hidden={!mobileOpen}
        aria-label="Primary navigation"
      >
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-800 px-5">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-ink">S</div>
            <span className="truncate text-sm font-semibold leading-tight text-white">SI Portal</span>
          </div>
          <button
            type="button"
            className="min-h-[2.75rem] min-w-[2.75rem] rounded-lg p-2 text-slate-300 hover:bg-slate-800 hover:text-white md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>
        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 py-2" aria-label="Main">
          {visibleNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex min-h-[2.75rem] items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
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

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-edge bg-surface px-3 sm:px-4 md:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <button
              type="button"
              className="min-h-[2.75rem] min-w-[2.75rem] shrink-0 rounded-lg p-2 hover:bg-surface-muted md:hidden"
              onClick={() => setMobileOpen((open) => !open)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? '✕' : '☰'}
            </button>
            <div className="min-w-0 truncate text-sm text-ink-muted md:block">
              <span className="md:hidden">{roleLabel(user.role)}</span>
              <span className="hidden md:inline">{roleLabel(user.role)}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-3">
            <ThemeToggle />
            <NotificationBell />
            <div className="hidden min-w-0 text-right sm:block">
              <p className="truncate text-sm font-medium text-ink">{user.email}</p>
              <p className="text-xs text-ink-muted">{roleLabel(user.role)}</p>
            </div>
            <button type="button" onClick={() => logout()} className="btn-ghost whitespace-nowrap text-sm">Sign out</button>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto overflow-x-clip focus:outline-none">
          <div className="page-content p-4 md:p-6 lg:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
