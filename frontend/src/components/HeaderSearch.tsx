import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { RoleName } from '@/types';

type SearchResult = {
  kind: string;
  id: string;
  name: string;
  email: string;
};

const KIND_LABEL: Record<string, string> = {
  student: 'Student',
  faculty: 'Team',
  parent: 'Parent',
  staff: 'Staff',
};

/** Compact header search for staff roles. */
export default function HeaderSearch({ role }: { role: RoleName }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const placeholder =
    role === 'FACULTY'
      ? 'Search students, parents, team…'
      : role === 'ACADEMIC_ADMIN'
        ? 'Search people & staff…'
        : 'Search students, parents, team…';

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 280);
    return () => clearTimeout(t);
  }, [query]);

  const { data } = useQuery({
    queryKey: ['search', 'header', debounced],
    queryFn: async () => (await api.get('/search', { params: { q: debounced, limit: 8 } })).data,
    enabled: debounced.length >= 2 && open,
  });

  const results: SearchResult[] = data?.results ?? [];

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        if (!query) setExpanded(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [query]);

  return (
    <div ref={wrapRef} className="relative min-w-0 flex-1 max-w-md">
      <div className={`flex items-center gap-1 ${expanded ? 'w-full' : 'max-md:w-auto md:w-full'}`}>
        <button
          type="button"
          className="min-h-[2.5rem] min-w-[2.5rem] rounded-lg p-2 text-ink-muted hover:bg-surface-muted md:hidden"
          aria-label="Open search"
          onClick={() => setExpanded((v) => !v)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
          </svg>
        </button>
        <input
          className={`input py-1.5 text-sm ${expanded ? 'block' : 'hidden md:block'}`}
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setExpanded(true);
          }}
          aria-label="Search users"
        />
      </div>
      {query.length >= 2 && open && (
        <div className="absolute left-0 right-0 z-40 mt-1 max-h-64 overflow-y-auto rounded-lg border border-edge bg-surface shadow-xl">
          {results.length === 0 ? (
            <p className="px-3 py-3 text-xs text-ink-muted">No matches</p>
          ) : (
            results.map((r) => (
              <button
                key={`${r.kind}-${r.id}`}
                type="button"
                className="block w-full border-b border-edge px-3 py-2.5 text-left text-sm last:border-0 hover:bg-surface-muted"
                onClick={() => {
                  navigate(`/search/${r.kind}/${r.id}`);
                  setOpen(false);
                  setQuery('');
                  setExpanded(false);
                }}
              >
                <span className="font-medium text-ink">{r.name}</span>
                <span className="ml-2 text-[10px] text-ink-muted">{KIND_LABEL[r.kind] ?? r.kind}</span>
                <span className="block truncate text-xs text-ink-muted">{r.email}</span>
              </button>
            ))
          )}
          <Link
            to={`/search?q=${encodeURIComponent(debounced)}`}
            className="block px-3 py-2 text-center text-xs text-brand-ink hover:bg-surface-muted"
            onClick={() => {
              setOpen(false);
              setExpanded(false);
            }}
          >
            View all results →
          </Link>
        </div>
      )}
    </div>
  );
}
