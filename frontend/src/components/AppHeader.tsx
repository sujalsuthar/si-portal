import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { roleLabel } from '@/lib/roleLabels';
import { breadcrumbForPath } from '@/lib/navConfig';
import ThemeToggle from './ThemeToggle';
import NotificationBell from './NotificationBell';
import HeaderSearch from './HeaderSearch';
import { RoleName } from '@/types';

const SEARCH_ROLES: RoleName[] = ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'FACULTY'];

export default function AppHeader({ onOpenMobile }: { onOpenMobile: () => void }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  if (!user) return null;

  const showSearch = SEARCH_ROLES.includes(user.role);
  const crumbs = breadcrumbForPath(location.pathname);
  const showCrumbs = location.pathname !== '/';

  const displayName =
    user.profile && typeof user.profile === 'object' && 'firstName' in user.profile
      ? `${(user.profile as { firstName?: string }).firstName ?? ''} ${(user.profile as { lastName?: string }).lastName ?? ''}`.trim()
      : user.email.split('@')[0];

  const initials = (displayName || user.email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b border-edge bg-surface px-3 md:gap-4 md:px-6">
      <button
        type="button"
        className="min-h-[2.75rem] min-w-[2.75rem] rounded-lg p-2 hover:bg-surface-muted md:hidden"
        onClick={onOpenMobile}
        aria-label="Open menu"
      >
        ☰
      </button>

      <div className="hidden min-w-0 flex-col md:flex">
        {showCrumbs ? (
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-ink-muted">
            {crumbs.map((c, i) => (
              <span key={c.to + i} className="flex items-center gap-1">
                {i > 0 && <span aria-hidden="true">/</span>}
                {i === crumbs.length - 1 ? (
                  <span className="font-medium text-ink">{c.label}</span>
                ) : (
                  <Link to={c.to} className="hover:text-brand-ink hover:underline">
                    {c.label}
                  </Link>
                )}
              </span>
            ))}
          </nav>
        ) : (
          <span className="text-sm text-ink-muted">{roleLabel(user.role)}</span>
        )}
      </div>

      {showSearch && <HeaderSearch role={user.role} />}

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <ThemeToggle />
        <NotificationBell />

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            className="flex min-h-[2.75rem] items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-surface-muted"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-ink">
              {initials || 'U'}
            </span>
            <span className="hidden max-w-[10rem] truncate text-left sm:block">
              <span className="block truncate text-sm font-medium text-ink">{displayName || user.email}</span>
              <span className="block text-[10px] text-ink-muted">{roleLabel(user.role)}</span>
            </span>
            <span className="hidden text-ink-muted sm:inline" aria-hidden="true">
              ▾
            </span>
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 z-40 mt-1 w-56 overflow-hidden rounded-lg border border-edge bg-surface py-1 shadow-xl"
            >
              <div className="border-b border-edge px-3 py-2">
                <p className="truncate text-sm font-medium text-ink">{user.email}</p>
                <p className="text-xs text-ink-muted">{roleLabel(user.role)}</p>
              </div>
              <Link
                to="/settings"
                role="menuitem"
                className="block px-3 py-2.5 text-sm text-ink hover:bg-surface-muted"
                onClick={() => setMenuOpen(false)}
              >
                Settings & security
              </Link>
              <button
                type="button"
                role="menuitem"
                className="block w-full px-3 py-2.5 text-left text-sm text-red-600 hover:bg-surface-muted dark:text-red-400"
                onClick={() => {
                  setMenuOpen(false);
                  void logout();
                }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
