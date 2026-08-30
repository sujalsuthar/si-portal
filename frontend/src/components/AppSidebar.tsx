import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { RoleName } from '@/types';
import { getNavGroupsForRole } from '@/lib/navConfig';
import { NavIcon } from './NavIcon';

function storageKey(role: RoleName) {
  return `si_nav_collapsed_${role}`;
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `group flex min-h-[2.5rem] items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
    isActive
      ? 'border-l-2 border-brand-300 bg-brand-700/80 pl-[calc(0.625rem-2px)] text-white dark:border-brand-500 dark:bg-slate-800/90'
      : 'border-l-2 border-transparent text-brand-100 hover:bg-brand-700/50 hover:text-white dark:text-slate-300 dark:hover:bg-slate-800/60'
  }`;

export default function AppSidebar({
  role,
  studentProfileId,
  mobileOpen,
  onCloseMobile,
}: {
  role: RoleName;
  studentProfileId?: string | null;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const groups = useMemo(() => getNavGroupsForRole(role, studentProfileId), [role, studentProfileId]);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(storageKey(role));
      if (raw) return JSON.parse(raw) as Record<string, boolean>;
    } catch {
      /* ignore */
    }
    const defaults: Record<string, boolean> = {};
    for (const g of groups) {
      if (g.defaultCollapsed) defaults[g.id] = true;
    }
    return defaults;
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(role), JSON.stringify(collapsed));
    } catch {
      /* ignore */
    }
  }, [collapsed, role]);

  function toggleGroup(id: string) {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <>
      <aside
        className={`app-sidebar fixed inset-y-0 left-0 z-30 flex w-64 shrink-0 flex-col transition-transform max-lg:max-w-[85vw] md:static md:max-w-none md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
        aria-hidden={!mobileOpen}
        aria-label="Primary navigation"
      >
        <div className="app-sidebar-header flex h-16 shrink-0 items-center gap-2 px-5 max-lg:justify-between">
          <Link
            to="/"
            onClick={onCloseMobile}
            className="flex min-w-0 items-center gap-2 rounded-lg transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white shadow-sm dark:bg-brand-600 dark:text-ink">
              S
            </div>
            <span className="truncate text-sm font-semibold leading-tight">SI Portal</span>
          </Link>
          <button
            type="button"
            className="app-sidebar-close min-h-[2.75rem] min-w-[2.75rem] rounded-lg p-2 md:hidden"
            onClick={onCloseMobile}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        <nav className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3" aria-label="Main">
          {groups.map((group) => {
            const isCollapsed = !!collapsed[group.id];
            const showToggle = groups.length > 1 && group.items.length > 1;
            const pinSettingsFooter = groups.length > 1;
            const renderItems = pinSettingsFooter
              ? group.items.filter((i) => i.to !== '/settings')
              : group.items;
            if (renderItems.length === 0) return null;
            return (
              <div key={group.id}>
                <div className="mb-1 flex items-center justify-between px-2">
                  <p className="app-sidebar-group-label text-[10px] font-semibold uppercase tracking-wider">{group.label}</p>
                  {showToggle && renderItems.length > 1 && (
                    <button
                      type="button"
                      className="app-sidebar-toggle rounded p-0.5"
                      aria-expanded={!isCollapsed}
                      aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${group.label}`}
                      onClick={() => toggleGroup(group.id)}
                    >
                      <span className="text-xs" aria-hidden="true">{isCollapsed ? '▸' : '▾'}</span>
                    </button>
                  )}
                </div>
                {!isCollapsed && (
                  <div className="space-y-0.5">
                    {renderItems.map((item) => (
                      <NavLink
                        key={item.to + item.label}
                        to={item.to}
                        end={item.end ?? false}
                        onClick={onCloseMobile}
                        className={navLinkClass}
                      >
                        <span className="shrink-0 opacity-80">
                          <NavIcon id={item.icon} />
                        </span>
                        <span className="truncate">{item.label}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        {groups.length > 1 && (
          <div className="app-sidebar-footer shrink-0 p-3">
            <NavLink to="/settings" onClick={onCloseMobile} className={navLinkClass}>
              <span className="shrink-0 opacity-80">
                <NavIcon id="settings" />
              </span>
              Settings
            </NavLink>
          </div>
        )}
      </aside>
      {mobileOpen && <div className="fixed inset-0 z-20 bg-black/50 md:hidden" onClick={onCloseMobile} aria-hidden="true" />}
    </>
  );
}
