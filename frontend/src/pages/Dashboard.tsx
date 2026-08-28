import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader, StatCard, Spinner, Badge, EmptyState } from '@/components/ui';
import DashboardCharts from '@/components/DashboardCharts';
import { GlobalUserSearch } from '@/pages/search/UserSearchPage';

export default function Dashboard() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'me'],
    queryFn: async () => (await api.get('/dashboard/me')).data,
  });
  const { data: actionCenter } = useQuery({
    queryKey: ['dashboard', 'action-center'],
    queryFn: async () => (await api.get('/dashboard/action-center')).data,
    enabled: !!user && ['STUDENT', 'FACULTY', 'ACADEMIC_ADMIN', 'SUPER_ADMIN'].includes(user.role),
  });

  if (isLoading) return <Spinner />;

  return (
    <div>
      <PageHeader title={`Welcome back${user?.profile ? `, ${(user.profile as { firstName?: string }).firstName ?? ''}` : ''}`} subtitle="Here's what needs your attention today." />

      {(user?.role === 'SUPER_ADMIN' || user?.role === 'MANAGEMENT') && (
        <>
          {user?.role === 'SUPER_ADMIN' && <GlobalUserSearch />}
          <ManagementDashboard data={data} />
        </>
      )}
      {user?.role === 'ACADEMIC_ADMIN' && <AdminDashboard data={data} />}
      {user?.role === 'ACCOUNTS' && <AccountsDashboard data={data} />}
      {user?.role === 'FACULTY' && <FacultyDashboard data={data} />}
      {user?.role === 'STUDENT' && <StudentDashboard data={data} />}
      {user?.role === 'PARENT' && <ParentDashboard data={data} />}

      {actionCenter && <ActionCenterPanel actionCenter={actionCenter} />}

      <DashboardCharts />
    </div>
  );
}

function actionItemHref(item: Record<string, unknown>): string | null {
  if (item.sessionId) return `/sessions/${item.sessionId}`;
  if (item.taskId) return `/tasks/${item.taskId}`;
  if (item.examId) return `/exams/${item.examId}`;
  if (item.caseId) return '/performance';
  if (item.transferId) return '/';
  if (item.type === 'SELF_ASSESSMENT') return '/performance';
  if (item.type === 'EXAM') return '/exams';
  return null;
}

function ActionCenterPanel({ actionCenter }: { actionCenter: Record<string, unknown> }) {
  const items: Array<{ key: string; item: Record<string, unknown> }> = [];
  if (actionCenter.selfAssessmentReminder) {
    items.push({ key: 'self-assessment', item: { type: 'SELF_ASSESSMENT', label: 'Complete your monthly self-assessment' } });
  }
  for (const [group, groupItems] of Object.entries(actionCenter)) {
    if (group === 'selfAssessmentReminder' || !Array.isArray(groupItems)) continue;
    groupItems.forEach((item, i) => items.push({ key: `${group}-${i}`, item: item as Record<string, unknown> }));
  }

  return (
    <div className="mt-6">
      <h2 className="mb-3 text-sm font-semibold text-ink">Action Center</h2>
      {items.length === 0 ? (
        <EmptyState text="You're all caught up - nothing pending right now." />
      ) : (
        <div className="card divide-y divide-edge">
          {items.map(({ key, item }) => {
            const href = actionItemHref(item);
            const date = (item.date ?? item.dueDate) as string | undefined;
            const inner = (
              <>
                <span className="text-ink">{String(item.label)}</span>
                {date && <span className="text-xs text-ink-muted">{new Date(date).toDateString()}</span>}
              </>
            );
            return href ? (
              <Link key={key} to={href} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-surface-muted">
                {inner}
              </Link>
            ) : (
              <div key={key} className="flex items-center justify-between px-4 py-3 text-sm">
                {inner}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Alternates Navy Blue / Red per day of the week, starting Sunday=Red - matches the backend's coloring. */
function dayColorClasses(dayIndex: number, active: boolean) {
  const isRed = dayIndex % 2 === 0;
  if (!active) return 'bg-surface-muted text-ink-muted';
  return isRed ? 'bg-red-600 text-white dark:bg-red-700' : 'bg-blue-900 text-white dark:bg-blue-950';
}

function WeekCalendar({ weekSessions }: { weekSessions: any[] }) {
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + i);
    const sessions = (weekSessions ?? []).filter((s) => new Date(s.sessionDate).toDateString() === date.toDateString());
    return { date, dayIndex: i, sessions };
  });

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-ink">This Week</h2>
      <div className="grid grid-cols-7 gap-2">
        {days.map((d) => (
          <div key={d.dayIndex} className="min-w-0">
            <div className={`rounded-t-lg px-2 py-1.5 text-center text-xs font-semibold ${dayColorClasses(d.dayIndex, true)}`}>
              {WEEKDAY_LABELS[d.dayIndex]} {d.date.getDate()}
            </div>
            <div className="card min-h-[4.5rem] space-y-1 rounded-t-none p-1.5">
              {d.sessions.length === 0 ? (
                <p className="px-1 py-2 text-center text-[11px] text-ink-muted">-</p>
              ) : (
                d.sessions.map((s: any) => (
                  <Link key={s.id} to={`/sessions/${s.id}`} className="block truncate rounded bg-surface-muted px-1.5 py-1 text-[11px] text-ink hover:bg-brand-100" title={`${s.topic} - ${s.batchName}`}>
                    {s.batchName}
                  </Link>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ManagementDashboard({ data }: { data: any }) {
  const kpis = data?.kpis ?? {};
  return (
    <div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
        <StatCard label="Active Students" value={kpis.activeStudents ?? 0} />
        <StatCard label="Active Batches" value={kpis.activeBatches ?? 0} />
      </div>

      <div className="mt-6">
        <WeekCalendar weekSessions={data?.weekSessions ?? []} />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="card border-l-4 border-l-blue-900 p-4">
          <h3 className="mb-2 text-sm font-semibold text-ink">Navy Blue Days - Batches</h3>
          {(data?.navyBatches ?? []).length === 0 ? (
            <p className="text-xs text-ink-muted">No sessions this week</p>
          ) : (
            <div className="space-y-1">
              {data.navyBatches.map((b: any) => (
                <Link key={b.id} to={`/batches/${b.id}`} className="block text-sm text-brand-ink hover:underline">{b.name}</Link>
              ))}
            </div>
          )}
        </div>
        <div className="card border-l-4 border-l-red-600 p-4">
          <h3 className="mb-2 text-sm font-semibold text-ink">Red Days - Batches</h3>
          {(data?.redBatches ?? []).length === 0 ? (
            <p className="text-xs text-ink-muted">No sessions this week</p>
          ) : (
            <div className="space-y-1">
              {data.redBatches.map((b: any) => (
                <Link key={b.id} to={`/batches/${b.id}`} className="block text-sm text-brand-ink hover:underline">{b.name}</Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <h2 className="mb-3 mt-6 text-sm font-semibold text-ink">Batch Performance</h2>
      <div className="card divide-y divide-edge">
        {(data?.batches ?? []).map((b: any) => (
          <Link key={b.id} to={`/batches/${b.id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-surface-muted">
            <div>
              <p className="font-medium text-ink">{b.name}</p>
              <p className="text-xs text-ink-muted">{b.course}</p>
            </div>
            <Badge>{b.strength} students</Badge>
          </Link>
        ))}
      </div>
    </div>
  );
}

function AdminDashboard({ data }: { data: any }) {
  const queryClient = useQueryClient();
  const counts = data?.counts ?? {};

  async function decideTransfer(id: string, action: 'approve' | 'reject') {
    const reason = action === 'reject' ? window.prompt('Reason for rejection (optional):') ?? undefined : undefined;
    try {
      await api.patch(`/batch-transfers/${id}/${action}`, action === 'reject' ? { reason: reason || 'Rejected by admin' } : {});
      toast.success(action === 'approve' ? 'Transfer approved' : 'Transfer rejected');
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'me'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Students" value={counts.students ?? 0} />
        <StatCard label="Parents" value={counts.parents ?? 0} />
        <StatCard label="Team" value={counts.faculty ?? 0} />
        <StatCard label="Batches" value={counts.batches ?? 0} />
      </div>
      <h2 className="mb-3 mt-6 text-sm font-semibold text-ink">Pending Batch Transfers ({data?.pendingTransfers?.length ?? 0})</h2>
      <div className="card divide-y divide-edge">
        {(data?.pendingTransfers ?? []).length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-muted">No pending transfers</p>}
        {(data?.pendingTransfers ?? []).map((t: any) => (
          <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span>{t.student.firstName} {t.student.lastName} → {t.toBatch.name}</span>
            <div className="flex shrink-0 items-center gap-2 text-xs">
              <button type="button" className="text-emerald-700 dark:text-emerald-400 hover:underline" onClick={() => decideTransfer(t.id, 'approve')}>Approve</button>
              <button type="button" className="text-red-600 dark:text-red-400 hover:underline" onClick={() => decideTransfer(t.id, 'reject')}>Reject</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AccountsDashboard({ data }: { data: any }) {
  const counts = data?.counts ?? {};
  return (
    <div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Fee Accounts" value={counts.feeAccounts ?? 0} />
        <StatCard label="Collected This Month" value={counts.collectedThisMonth ?? 0} />
        <StatCard label="Open Instalments" value={counts.openInstalments ?? 0} tone={(counts.openInstalments ?? 0) > 0 ? 'warn' : 'good'} />
        <StatCard label="Need Reconciliation" value={counts.pendingReconciliation ?? 0} tone={(counts.pendingReconciliation ?? 0) > 0 ? 'warn' : 'good'} />
      </div>
      <p className="mt-4 text-sm text-ink-muted">
        Use <Link className="text-brand-ink hover:underline" to="/fees">Fees</Link> to record payments and open student fee accounts.
      </p>
    </div>
  );
}

function FacultyDashboard({ data }: { data: any }) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Today's Sessions" value={data?.todaySessions?.length ?? 0} />
        <StatCard label="Pending Evaluations" value={data?.pendingEvaluationsCount ?? 0} tone={data?.pendingEvaluationsCount > 0 ? 'warn' : 'good'} />
        <StatCard label="Assigned Batches" value={data?.assignedBatchCount ?? 0} />
        <StatCard label="Open Concerns" value={data?.studentConcerns?.length ?? 0} tone={data?.studentConcerns?.length > 0 ? 'warn' : 'good'} />
      </div>
      <h2 className="mb-3 mt-6 text-sm font-semibold text-ink">Today's Classes</h2>
      <div className="card divide-y divide-edge">
        {(data?.todaySessions ?? []).length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-muted">No sessions scheduled today</p>}
        {(data?.todaySessions ?? []).map((s: any) => (
          <Link key={s.id} to={`/sessions/${s.id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-surface-muted">
            <span>{s.topic} - {s.batch.name}</span>
            <Badge tone={s.status === 'COMPLETED' ? 'green' : 'blue'}>{s.status}</Badge>
          </Link>
        ))}
      </div>
    </div>
  );
}

function StudentDashboard({ data }: { data: any }) {
  const composite = data?.composite;
  return (
    <div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Composite Score" value={composite ? `${composite.composite.toFixed(1)}%` : '-'} />
        <StatCard label="Attendance" value={`${data?.attendancePct ?? 0}%`} tone={data?.belowAttendanceThreshold ? 'warn' : 'good'} />
        <StatCard label="Upcoming Session(s)" value={data?.upcomingSessions?.length ?? 0} />
        <StatCard label="Overdue Tasks" value={data?.overdueTasks?.length ?? 0} tone={data?.overdueTasks?.length > 0 ? 'bad' : 'good'} />
      </div>
      {composite && (
        <div className="card mt-6 grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
          <Metric label="Exams" value={composite.examPct} />
          <Metric label="Tasks" value={composite.taskPct} />
          <Metric label="Behaviour" value={composite.behaviourPct} />
          <Metric label="Presentations" value={composite.presentationPct} />
        </div>
      )}
      <h2 className="mb-3 mt-6 text-sm font-semibold text-ink">Upcoming Session(s)</h2>
      <div className="card divide-y divide-edge">
        {(data?.upcomingSessions ?? []).length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-muted">No upcoming sessions</p>}
        {(data?.upcomingSessions ?? []).map((s: any) => (
          <Link key={s.id} to={`/sessions/${s.id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-surface-muted">
            <span className="text-ink">{s.topic}</span>
            <span className="text-xs text-ink-muted">{new Date(s.sessionDate).toLocaleString()}</span>
          </Link>
        ))}
      </div>
      {(data?.overdueTasks ?? []).length > 0 && (
        <>
          <h2 className="mb-3 mt-6 text-sm font-semibold text-ink">Overdue Tasks</h2>
          <div className="card divide-y divide-edge">
            {data.overdueTasks.map((t: any) => (
              <Link key={t.id} to={`/tasks/${t.task?.id ?? t.taskId}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-surface-muted">
                <span className="text-ink">{t.task?.title ?? t.title}</span>
                <Badge tone="red">Overdue</Badge>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ParentDashboard({ data }: { data: any }) {
  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2">
        {(data?.children ?? []).map((c: any) => (
          <Link key={c.id} to={`/my/${c.id}`} className="card p-4 hover:shadow-md">
            <p className="font-semibold text-ink">{c.name}</p>
            <p className="text-xs text-ink-muted mb-3">{c.batch ?? 'No batch assigned'}</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Metric label="Attendance" value={c.attendancePct} />
              <Metric label="Composite" value={c.composite.composite} />
            </div>
          </Link>
        ))}
      </div>

      <h2 className="mb-3 mt-6 text-sm font-semibold text-ink">Scheduled Sessions of the Week</h2>
      <div className="card divide-y divide-edge">
        {(data?.weekSessions ?? []).length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-muted">No sessions scheduled this week</p>}
        {(data?.weekSessions ?? []).map((s: any) => (
          <div key={s.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="text-ink">{s.topic} - {s.batchName}</span>
            <span className="text-xs text-ink-muted">{new Date(s.sessionDate).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="text-lg font-semibold text-ink">{Number(value).toFixed(1)}%</p>
    </div>
  );
}
