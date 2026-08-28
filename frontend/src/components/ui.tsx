import { ReactNode, useEffect, useRef } from 'react';
import clsx from 'clsx';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
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
  return (
    <div className="card overflow-x-auto">
      <table className="min-w-full divide-y divide-edge text-sm">
        <thead className="bg-surface-muted">
          <tr>
            {columns.map((c, i) => (
              <th key={i} scope="col" className={clsx('px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted', c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-edge">
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-ink-muted">Loading…</td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-ink-muted">{emptyText}</td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => (
              <tr key={keyFn(row)} className="hover:bg-surface-muted/60">
                {columns.map((c, i) => (
                  <td key={i} className={clsx('px-4 py-2.5 align-middle', c.className)}>
                    {c.cell(row, rowIndex)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={clsx('card w-full max-h-[90vh] overflow-y-auto focus:outline-none', wide ? 'max-w-2xl' : 'max-w-md')}
      >
        <div className="flex items-center justify-between border-b border-edge px-5 py-3.5">
          <h2 id={titleId} className="text-base font-semibold text-ink">{title}</h2>
          <button onClick={onClose} aria-label="Close dialog" className="rounded-full p-1.5 text-ink-muted hover:bg-surface-muted">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <div className="card p-8 text-center text-sm text-ink-muted">{text}</div>;
}

export function Spinner() {
  return (
    <div role="status" className="p-8 text-center text-sm text-ink-muted">
      Loading…
    </div>
  );
}
