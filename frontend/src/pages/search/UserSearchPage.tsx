import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader, Badge, Spinner, Modal, EmptyState } from '@/components/ui';
import { roleLabel } from '@/lib/roleLabels';
import { RoleName } from '@/types';

type SearchResult = {
  kind: 'student' | 'faculty' | 'parent' | 'staff';
  id: string;
  userId: string;
  name: string;
  email: string;
  subtitle: string;
  isActive: boolean;
  internStatus?: string | null;
};

const KIND_LABEL: Record<string, string> = {
  student: 'Student',
  faculty: 'Team',
  parent: 'Parent',
  staff: 'Staff account',
};

const SEARCH_SUBTITLE: Record<string, string> = {
  SUPER_ADMIN: 'Find any student, parent, team member, or staff account — view profiles and take actions.',
  ACADEMIC_ADMIN: 'Search institute-wide for students, parents, team, and staff accounts (Super Admin accounts hidden).',
  FACULTY: 'Search students and parents in your assigned batches, and team members you work with.',
};

export default function UserSearchPage() {
  const { user } = useAuth();
  const { kind, id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQ = searchParams.get('q') ?? '';
  const [query, setQuery] = useState(initialQ);
  const [debounced, setDebounced] = useState(initialQ);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (debounced) setSearchParams({ q: debounced }, { replace: true });
    else setSearchParams({}, { replace: true });
  }, [debounced, setSearchParams]);

  const { data, isFetching } = useQuery({
    queryKey: ['search', debounced],
    queryFn: async () => (await api.get('/search', { params: { q: debounced, limit: 40 } })).data,
    enabled: debounced.length >= 2,
  });

  const results: SearchResult[] = data?.results ?? [];

  return (
    <div>
      <PageHeader
        title="User Search"
        subtitle={SEARCH_SUBTITLE[user?.role ?? ''] ?? 'Search users in your permitted scope.'}
      />

      <div className="card p-4">
        <label className="block">
          <span className="label">Search by name, email, student code, or employee code</span>
          <input
            className="input mt-1"
            placeholder="e.g. aarav, parent.diya, FAC-001, admin@siportal.edu"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </label>
        {query.length > 0 && query.length < 2 && (
          <p className="mt-2 text-xs text-ink-muted">Type at least 2 characters to search.</p>
        )}
      </div>

      {kind && id ? (
        <div className="mt-6">
          <button type="button" className="mb-3 text-sm text-brand-ink hover:underline" onClick={() => window.history.back()}>
            ← Back to results
          </button>
          <UserHubPanel kind={kind} id={id} />
        </div>
      ) : (
        <div className="mt-6">
          {isFetching && debounced.length >= 2 && <Spinner />}
          {!isFetching && debounced.length >= 2 && results.length === 0 && (
            <EmptyState text={`No users found for "${debounced}".`} />
          )}
          {results.length > 0 && (
            <div className="card divide-y divide-edge">
              {results.map((r) => (
                <SearchResultRow key={`${r.kind}-${r.id}`} result={r} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SearchResultRow({ result }: { result: SearchResult }) {
  return (
    <Link
      to={`/search/${result.kind}/${result.id}`}
      className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-surface-muted"
    >
      <div className="min-w-0">
        <p className="font-medium text-ink truncate">
          {result.name}
          {result.internStatus && <> <Badge tone="blue">Intern</Badge></>}
        </p>
        <p className="text-xs text-ink-muted truncate">{result.email}</p>
        <p className="text-xs text-ink-muted truncate">{result.subtitle}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Badge tone="slate">{KIND_LABEL[result.kind]}</Badge>
        <Badge tone={result.isActive ? 'green' : 'red'}>{result.isActive ? 'Active' : 'Inactive'}</Badge>
      </div>
    </Link>
  );
}

/** Compact search for dashboard (Super Admin, Academic Admin, Faculty). */
export function GlobalUserSearch({ role }: { role: RoleName }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);

  const placeholder =
    role === 'FACULTY'
      ? 'Search your students, parents, or team…'
      : role === 'ACADEMIC_ADMIN'
        ? 'Search students, parents, team, staff…'
        : 'Search students, parents, team, admins…';

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data } = useQuery({
    queryKey: ['search', debounced],
    queryFn: async () => (await api.get('/search', { params: { q: debounced, limit: 8 } })).data,
    enabled: debounced.length >= 2 && open,
  });

  const results: SearchResult[] = data?.results ?? [];

  return (
    <div className="relative mb-6">
      <div className="card p-4">
        <h2 className="mb-2 text-sm font-semibold text-ink">Quick User Search</h2>
        <input
          className="input"
          placeholder={placeholder}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
        {query.length >= 2 && open && results.length > 0 && (
          <div className="absolute left-0 right-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-edge bg-surface shadow-lg">
            {results.map((r) => (
              <button
                key={`${r.kind}-${r.id}`}
                type="button"
                className="block w-full px-4 py-2.5 text-left text-sm hover:bg-surface-muted border-b border-edge last:border-0"
                onClick={() => { navigate(`/search/${r.kind}/${r.id}`); setOpen(false); setQuery(''); }}
              >
                <span className="font-medium">{r.name}</span>
                <span className="ml-2 text-xs text-ink-muted">{KIND_LABEL[r.kind]}</span>
                <span className="block text-xs text-ink-muted truncate">{r.email}</span>
              </button>
            ))}
            <Link
              to={`/search?q=${encodeURIComponent(debounced)}`}
              className="block px-4 py-2 text-center text-xs text-brand-ink hover:bg-surface-muted"
              onClick={() => setOpen(false)}
            >
              View all results →
            </Link>
          </div>
        )}
      </div>
      {open && <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />}
    </div>
  );
}

function UserHubPanel({ kind, id }: { kind: string; id: string }) {
  const queryClient = useQueryClient();
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [mentorId, setMentorId] = useState('');
  const [demoteOpen, setDemoteOpen] = useState(false);
  const [demoteReason, setDemoteReason] = useState('');

  const { data: profile, isLoading } = useQuery({
    queryKey: ['search-profile', kind, id],
    queryFn: async () => (await api.get(`/search/profile/${kind}/${id}`)).data,
  });

  const { data: facultyList } = useQuery({
    queryKey: ['faculty', 'all'],
    queryFn: async () => (await api.get('/faculty', { params: { pageSize: 100 } })).data,
    enabled: promoteOpen,
  });

  if (isLoading || !profile) return <Spinner />;

  async function toggleAccount(active: boolean) {
    try {
      await api.patch(`/users/${profile.userId}/${active ? 'activate' : 'deactivate'}`);
      toast.success(active ? 'Account activated' : 'Account deactivated');
      queryClient.invalidateQueries({ queryKey: ['search-profile', kind, id] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function resetPassword() {
    try {
      const res = await api.post(`/users/${profile.userId}/reset-password`);
      toast.success(`Temp password: ${res.data.tempPassword}`, { duration: 8000 });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function promoteIntern() {
    if (!mentorId) return toast.error('Select a mentor');
    try {
      await api.post('/interns/promote', { studentId: profile.id, mentorId });
      toast.success('Added to intern programme');
      setPromoteOpen(false);
      queryClient.invalidateQueries({ queryKey: ['search-profile', kind, id] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function demoteIntern() {
    if (!demoteReason.trim()) return toast.error('Enter a reason');
    try {
      await api.patch(`/interns/${profile.id}/demote`, { reason: demoteReason });
      toast.success('Intern demoted');
      setDemoteOpen(false);
      queryClient.invalidateQueries({ queryKey: ['search-profile', kind, id] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function unfreezeIntern() {
    try {
      await api.patch(`/interns/${profile.id}/unfreeze`);
      toast.success('Intern work resumed');
      queryClient.invalidateQueries({ queryKey: ['search-profile', kind, id] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function toggleFaculty(active: boolean) {
    try {
      await api.patch(`/faculty/${profile.id}/${active ? 'activate' : 'deactivate'}`);
      toast.success(active ? 'Team member reactivated' : 'Team member deactivated');
      queryClient.invalidateQueries({ queryKey: ['search-profile', kind, id] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">{profile.name}</h2>
            <p className="text-sm text-ink-muted">{profile.email}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge tone="slate">{KIND_LABEL[kind] ?? kind}</Badge>
              <Badge tone={profile.isActive ? 'green' : 'red'}>{profile.isActive ? 'Active' : 'Inactive'}</Badge>
              {profile.internStatus && <Badge tone="blue">{profile.internStatus}</Badge>}
              {profile.internFrozen && <Badge tone="red">Work frozen</Badge>}
              {profile.role && <Badge tone="slate">{roleLabel(profile.role)}</Badge>}
            </div>
          </div>
        </div>

        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          {profile.studentCode && <div><dt className="text-ink-muted">Student code</dt><dd>{profile.studentCode}</dd></div>}
          {profile.employeeCode && <div><dt className="text-ink-muted">Employee code</dt><dd>{profile.employeeCode}</dd></div>}
          {profile.phone && <div><dt className="text-ink-muted">Phone</dt><dd>{profile.phone}</dd></div>}
          {profile.batch && <div><dt className="text-ink-muted">Batch</dt><dd>{profile.batch.name}</dd></div>}
          {profile.course && <div><dt className="text-ink-muted">Course</dt><dd>{profile.course.name}</dd></div>}
          {profile.department && <div><dt className="text-ink-muted">Department</dt><dd>{profile.department}</dd></div>}
          {profile.mentor && <div><dt className="text-ink-muted">Mentor</dt><dd>{profile.mentor.firstName} {profile.mentor.lastName}</dd></div>}
        </dl>

        {profile.batches?.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase text-ink-muted">Assigned batches</p>
            <p className="text-sm">{profile.batches.map((b: any) => b.name).join(', ')}</p>
          </div>
        )}

        {profile.children?.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase text-ink-muted">Linked children</p>
            <ul className="mt-1 space-y-1">
              {profile.children.map((c: any) => (
                <li key={c.id}>
                  <Link to={`/search/student/${c.id}`} className="text-sm text-brand-ink hover:underline">
                    {c.firstName} {c.lastName} ({c.studentCode}) {c.internStatus ? '· Intern' : ''}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {profile.parents?.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase text-ink-muted">Linked parents</p>
            <ul className="mt-1 space-y-1">
              {profile.parents.map((p: any) => (
                <li key={p.id}>
                  <Link to={`/search/parent/${p.id}`} className="text-sm text-brand-ink hover:underline">
                    {p.firstName} {p.lastName} ({p.user.email})
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="card p-4">
        <h3 className="mb-3 text-sm font-semibold text-ink">Actions</h3>
        <div className="flex flex-wrap gap-2">
          {kind === 'student' && (
            <>
              <Link to={`/people/students/${id}`} className="btn-secondary">Full student profile</Link>
              {profile.actions?.viewIntern && <Link to={`/interns/${id}`} className="btn-secondary">Intern dashboard</Link>}
              {profile.actions?.promoteIntern && <button type="button" className="btn-primary" onClick={() => setPromoteOpen(true)}>Add to Intern</button>}
              {profile.actions?.demoteIntern && <button type="button" className="btn-danger" onClick={() => setDemoteOpen(true)}>Demote intern</button>}
              {profile.actions?.unfreezeIntern && <button type="button" className="btn-secondary" onClick={unfreezeIntern}>Unfreeze work</button>}
              <Link to="/fees" className="btn-secondary">Fees</Link>
            </>
          )}
          {kind === 'faculty' && (
            <>
              {profile.actions?.deactivateFaculty && <button type="button" className="btn-danger" onClick={() => toggleFaculty(false)}>Deactivate team member</button>}
              {profile.actions?.reactivateFaculty && <button type="button" className="btn-primary" onClick={() => toggleFaculty(true)}>Reactivate team member</button>}
            </>
          )}
          {profile.actions?.activateAccount && <button type="button" className="btn-primary" onClick={() => toggleAccount(true)}>Activate login</button>}
          {profile.actions?.deactivateAccount && <button type="button" className="btn-danger" onClick={() => toggleAccount(false)}>Deactivate login</button>}
          {profile.actions?.resetPassword && <button type="button" className="btn-secondary" onClick={resetPassword}>Reset password</button>}
        </div>
      </div>

      <Modal open={promoteOpen} onClose={() => setPromoteOpen(false)} title="Add to Intern">
        <div className="space-y-3">
          <label className="block">
            <span className="label">Task mentor</span>
            <select className="input" value={mentorId} onChange={(e) => setMentorId(e.target.value)}>
              <option value="">Select mentor…</option>
              {facultyList?.items?.map((f: any) => <option key={f.id} value={f.id}>{f.firstName} {f.lastName}</option>)}
            </select>
          </label>
          <div className="flex justify-end"><button type="button" className="btn-primary" onClick={promoteIntern}>Add to Intern</button></div>
        </div>
      </Modal>

      <Modal open={demoteOpen} onClose={() => setDemoteOpen(false)} title="Demote Intern">
        <div className="space-y-3">
          <label className="block">
            <span className="label">Reason</span>
            <textarea className="input min-h-[4rem]" value={demoteReason} onChange={(e) => setDemoteReason(e.target.value)} />
          </label>
          <div className="flex justify-end"><button type="button" className="btn-danger" onClick={demoteIntern}>Demote</button></div>
        </div>
      </Modal>
    </div>
  );
}
