import { ReactNode, createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import clsx from 'clsx';

const ActionMenuContext = createContext<{ close: () => void }>({ close: () => {} });

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="page-header mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-semibold text-ink max-lg:break-words md:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-muted max-lg:break-words">{subtitle}</p>}
      </div>
      {actions && (
        <div className="page-header-actions flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}

export function TabBar({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (tab: string) => void }) {
  return (
    <div className="tab-bar" role="tablist">
      {tabs.map((t) => (
        <button
          key={t}
          type="button"
          role="tab"
          aria-selected={active === t}
          onClick={() => onChange(t)}
          className={clsx('tab-bar-item', active === t && 'tab-bar-item-active')}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

type MenuCoords = { top: number; left: number; minWidth: number };

export function ActionMenu({ label = 'Actions', children, align = 'right' }: { label?: string; children: ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<MenuCoords>({ top: 0, left: 0, minWidth: 140 });

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? 180;
    const menuWidth = menuRef.current?.offsetWidth ?? 140;
    const gap = 6;
    const flipUp = rect.bottom + menuHeight + gap > window.innerHeight - 8;
    const top = flipUp ? Math.max(8, rect.top - menuHeight - gap) : rect.bottom + gap;
    const left = align === 'right'
      ? Math.min(Math.max(8, rect.right - menuWidth), window.innerWidth - menuWidth - 8)
      : Math.min(Math.max(8, rect.left), window.innerWidth - menuWidth - 8);
    setCoords({ top, left, minWidth: Math.max(rect.width, 140) });
  }, [open, align, children]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onScroll() {
      setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        {label} <span aria-hidden="true">▾</span>
      </button>
      {open && createPortal(
        <ActionMenuContext.Provider value={{ close: () => setOpen(false) }}>
          <div
            ref={menuRef}
            role="menu"
            className="dropdown-menu"
            style={{ top: coords.top, left: coords.left, minWidth: coords.minWidth }}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </div>
        </ActionMenuContext.Provider>,
        document.body,
      )}
    </>
  );
}

export function MenuItem({
  children,
  onClick,
  danger,
  to,
  target,
}: {
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  to?: string;
  target?: string;
}) {
  const { close } = useContext(ActionMenuContext);
  const className = clsx('menu-item', danger && 'menu-item-danger');
  function handleAction(fn?: () => void) {
    fn?.();
    close();
  }
  if (to) {
    if (target === '_blank') {
      return (
        <a href={to} target="_blank" rel="noopener noreferrer" className={className} role="menuitem" onClick={() => close()}>
          {children}
        </a>
      );
    }
    return (
      <Link to={to} className={className} role="menuitem" onClick={() => close()}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={className} role="menuitem" onClick={() => handleAction(onClick)}>
      {children}
    </button>
  );
}

export function StatCard({ label, value, sub, tone = 'default' }: { label: string; value: ReactNode; sub?: string; tone?: 'default' | 'warn' | 'good' | 'bad' }) {
  const toneClass = {
    default: 'text-ink',
    warn: 'text-amber-700 dark:text-amber-400',
    good: 'text-emerald-700 dark:text-emerald-400',
    bad: 'text-red-600 dark:text-red-400',
  }[tone];
  return (
    <div className="card p-4">
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p className={clsx('mt-1 text-2xl font-semibold', toneClass)}>{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-muted">{sub}</p>}
    </div>
  );
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'green' | 'red' | 'amber' | 'blue' }) {
  const toneClass = {
    slate: 'bg-surface-muted text-ink-muted',
    green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
    red: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
    blue: 'bg-brand-100 text-brand-700',
  }[tone];
  return <span className={clsx('badge', toneClass)}>{children}</span>;
}

export interface Column<T> {
  header: string;
  cell: (row: T, index: number) => ReactNode;
  className?: string;
}

export function Table<T>({ columns, rows, loading, emptyText = 'No records found', keyFn }: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  emptyText?: string;
  keyFn: (row: T) => string;
}) {
  const labeledColumns = columns.filter((c) => c.header.trim().length > 0);
  const unlabeledColumns = columns.filter((c) => !c.header.trim());

  return (
    <>
      <div className="card table-wrap hidden p-0 lg:block">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                {columns.map((c, i) => (
                  <th key={i} scope="col" className={clsx(c.className)}>
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={columns.length} className="table-empty">Loading…</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="table-empty">{emptyText}</td>
                </tr>
              ) : (
                rows.map((row, rowIndex) => (
                  <tr key={keyFn(row)}>
                    {columns.map((c, i) => (
                      <td key={i} className={clsx(c.className)}>
                        {c.cell(row, rowIndex)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3 lg:hidden">
        {loading ? (
          <div className="card p-6 text-center text-sm text-ink-muted">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="card p-6 text-center text-sm text-ink-muted">{emptyText}</div>
        ) : (
          rows.map((row, rowIndex) => (
            <div key={keyFn(row)} className="card space-y-2.5 p-4">
              {unlabeledColumns.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 border-b border-edge pb-2">
                  {unlabeledColumns.map((c, i) => (
                    <div key={`u-${i}`} className="min-w-0">{c.cell(row, rowIndex)}</div>
                  ))}
                </div>
              )}
              {labeledColumns.map((c, i) => (
                <div key={i} className="flex min-w-0 flex-col gap-0.5 border-b border-edge/60 pb-2 last:border-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-muted">{c.header}</span>
                  <div className="min-w-0 break-words text-sm text-ink sm:text-right">{c.cell(row, rowIndex)}</div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useRef(`modal-title-${Math.random().toString(36).slice(2)}`).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }
    const previouslyFocused = document.activeElement as HTMLElement | null;
    if (!wasOpenRef.current) {
      panelRef.current?.focus();
      wasOpenRef.current = true;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 p-0 lg:items-center lg:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={clsx(
          'card w-full focus:outline-none',
          wide ? 'max-w-2xl' : 'max-w-md',
          'flex max-h-[min(90vh,100dvh)] flex-col overflow-hidden rounded-b-none',
          'lg:block lg:max-h-[90vh] lg:overflow-y-auto lg:rounded-xl',
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-edge px-4 py-3.5 lg:px-5">
          <h2 id={titleId} className="min-w-0 break-words text-base font-semibold text-ink lg:break-normal">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="shrink-0 rounded-full p-1.5 text-ink-muted hover:bg-surface-muted">✕</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:overflow-visible lg:p-5">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({
  text,
  action,
}: {
  text: string;
  action?: { label: string; to?: string; onClick?: () => void };
}) {
  return (
    <div className="card p-8 text-center">
      <p className="text-sm text-ink-muted">{text}</p>
      {action && (
        <div className="mt-4 flex justify-center">
          {action.to ? (
            <Link to={action.to} className="btn-primary">
              {action.label}
            </Link>
          ) : (
            <button type="button" className="btn-primary" onClick={action.onClick}>
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function Spinner() {
  return (
    <div role="status" className="p-8 text-center text-sm text-ink-muted">
      Loading…
    </div>
  );
}
