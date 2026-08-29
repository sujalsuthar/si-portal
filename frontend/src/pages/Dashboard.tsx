import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader, StatCard, Spinner, Badge, Modal } from '@/components/ui';
import DashboardCharts from '@/components/DashboardCharts';
import OnboardingCard from '@/components/OnboardingCard';
import { RoleName } from '@/types';

type AttentionItem = { id: string; text: string; to?: string; tone?: 'default' | 'warn' | 'bad' };
type QuickAction = { label: string; to: string };

export default function Dashboard() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'me'],
    queryFn: async () => (await api.get('/dashboard/me')).data,
  });

  if (isLoading) return <Spinner />;
  if (!user) return null;

  const firstName =
    user.profile && typeof user.profile === 'object' && 'firstName' in user.profile
      ? String((user.profile as { firstName?: string }).firstName ?? '')
      : '';

  const attention = buildAttention(user.role, data, user);
  const actions = buildQuickActions(user.role, data, user);

  return (
    <div>
      {user && <OnboardingCard role={user.role} userId={user.id} />}

      <PageHeader
        title={`Welcome back${firstName ? `, ${firstName}` : ''}`}
        subtitle={roleSubtitle(user.role)}
      />

      {attention.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-semibold text-ink">Needs attention</h2>
          <div className="card divide-y divide-edge">
            {attention.slice(0, 5).map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className={item.tone === 'bad' ? 'text-red-600 dark:text-red-400' : item.tone === 'warn' ? 'text-amber-700 dark:text-amber-400' : 'text-ink'}>
                  {item.text}
                </span>
                {item.to && (
                  <Link to={item.to} className="btn-secondary shrink-0 py-1.5 text-xs">
                    Open
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {actions.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-ink">Quick actions</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {actions.map((a) => (
              <Link key={a.to + a.label} to={a.to} className="btn-secondary justify-center px-3 py-3 text-center text-sm font-semibold">
                {a.label}
              </Link>
            ))}
          </div>
        </section>
      )}

      {(user.role === 'SUPER_ADMIN' || user.role === 'MANAGEMENT') && <ManagementDashboard data={data} />}
      {user.role === 'ACADEMIC_ADMIN' && <AdminDashboard data={data} />}
      {user.role === 'ACCOUNTS' && <AccountsDashboard data={data} />}
      {user.role === 'FACULTY' && <FacultyDashboard data={data} />}
      {user.role === 'STUDENT' && <StudentDashboard data={data} />}
      {user.role === 'PARENT' && <ParentDashboard data={data} />}

      <div className="mt-8">
        <DashboardCharts />
      </div>
    </div>
  );
}

function roleSubtitle(role: RoleName) {
  switch (role) {
    case 'STUDENT':
      return 'Your classes, tasks, and progress for today.';
    case 'PARENT':
      return 'How your child is doing — attendance, progress, and fees.';
    case 'FACULTY':
      return 'Your sessions, evaluations, and assigned batches.';
    case 'ACCOUNTS':
      return 'Fees, reconciliation, and payment follow-ups.';
    case 'ACADEMIC_ADMIN':
      return 'Transfers, batches, and what needs a decision today.';
    default:
      return "Here's what needs your attention today.";
  }
}

function buildAttention(role: RoleName, data: any, user: { profile?: unknown }): AttentionItem[] {
  const items: AttentionItem[] = [];
  if (role === 'STUDENT') {
    if (data?.belowAttendanceThreshold) {
      items.push({ id: 'att', text: `Attendance is below threshold (${data?.attendancePct ?? 0}%)`, to: '/performance', tone: 'warn' });
    }
    const overdue = data?.overdueTasks ?? [];
    if (overdue.length > 0) {
      items.push({
        id: 'od',
        text: `${overdue.length} overdue task${overdue.length === 1 ? '' : 's'}`,
        to: `/tasks/${overdue[0]?.task?.id ?? overdue[0]?.taskId ?? ''}`,
        tone: 'bad',
      });
    }
    const upcoming = data?.upcomingSessions ?? [];
    if (upcoming[0]) {
      items.push({
        id: 'sess',
        text: `Next session: ${upcoming[0].topic}`,
        to: `/sessions/${upcoming[0].id}`,
      });
    }
  }
  if (role === 'FACULTY') {
    if ((data?.pendingEvaluationsCount ?? 0) > 0) {
      items.push({ id: 'eval', text: `${data.pendingEvaluationsCount} pending evaluation(s)`, to: '/exams', tone: 'warn' });
    }
    if ((data?.studentConcerns?.length ?? 0) > 0) {
      items.push({ id: 'concern', text: `${data.studentConcerns.length} open concern(s)`, to: '/action-centre', tone: 'warn' });
    }
    const today = data?.todaySessions ?? [];
    if (today[0]) {
      items.push({ id: 'today', text: `Next class: ${today[0].topic} — ${today[0].batch?.name ?? ''}`, to: `/sessions/${today[0].id}` });
    }
  }
  if (role === 'ACADEMIC_ADMIN') {
    const pending = data?.pendingTransfers ?? [];
    if (pending.length > 0) {
      items.push({ id: 'tr', text: `${pending.length} pending batch transfer(s)`, tone: 'warn' });
    }
  }
  if (role === 'ACCOUNTS') {
    const c = data?.counts ?? {};
    if ((c.openInstalments ?? 0) > 0) {
      items.push({ id: 'inst', text: `${c.openInstalments} open instalment(s)`, to: '/fees', tone: 'warn' });
    }
    if ((c.pendingReconciliation ?? 0) > 0) {
      items.push({ id: 'rec', text: `${c.pendingReconciliation} need reconciliation`, to: '/fees', tone: 'warn' });
    }
  }
  if (role === 'PARENT') {
    for (const child of data?.children ?? []) {
      if (child.attendancePct != null && child.attendancePct < 75) {
        items.push({
          id: `att-${child.id}`,
          text: `${child.name}: attendance ${Number(child.attendancePct).toFixed(0)}%`,
          to: `/my/${child.id}`,
          tone: 'warn',
        });
      }
    }
  }
  if (role === 'SUPER_ADMIN' || role === 'MANAGEMENT') {
    const kpis = data?.kpis ?? {};
    if (kpis.activeStudents != null) {
      items.push({ id: 'kpi', text: `${kpis.activeStudents} active students · ${kpis.activeBatches ?? 0} batches`, to: '/batches' });
    }
  }
  void user;
  return items;
}

function buildQuickActions(role: RoleName, data: any, user: { profile?: unknown }): QuickAction[] {
  if (role === 'STUDENT') {
    const profileId =
      user.profile && typeof user.profile === 'object' && 'id' in user.profile
        ? String((user.profile as { id: string }).id)
        : null;
    return [
      { label: 'View tasks', to: '/tasks' },
      { label: 'My performance', to: '/performance' },
      { label: 'Fees', to: '/fees' },
      { label: 'Raise request', to: '/action-centre' },
      ...(profileId ? [{ label: 'My profile', to: `/my/${profileId}` }] : []),
    ].slice(0, 4);
  }
  if (role === 'PARENT') {
    const firstChild = data?.children?.[0];
    return [
      ...(firstChild ? [{ label: 'View child', to: `/my/${firstChild.id}` }] : [{ label: 'Dashboard', to: '/' }]),
      { label: 'Fees', to: '/fees' },
      { label: 'Raise request', to: '/action-centre' },
      { label: 'Feed', to: '/feed' },
    ];
  }
  if (role === 'FACULTY') {
    const firstSession = data?.todaySessions?.[0];
    return [
      { label: "Today's sessions", to: '/sessions' },
      ...(firstSession
        ? [{ label: 'Take attendance', to: `/sessions/${firstSession.id}` }]
        : [{ label: 'Open sessions', to: '/sessions' }]),
      { label: 'Tasks', to: '/tasks' },
      { label: 'Intern projects', to: '/projects/interns' },
    ];
  }
  if (role === 'ACADEMIC_ADMIN') {
    return [
      { label: 'Sessions', to: '/sessions' },
      { label: 'Exams', to: '/exams' },
      { label: 'Students', to: '/people/students' },
      { label: 'Batches', to: '/batches' },
    ];
  }
  if (role === 'ACCOUNTS') {
    return [
      { label: 'Fees', to: '/fees' },
      { label: 'Reports', to: '/reports' },
      { label: 'Certificates', to: '/certificates' },
      { label: 'Action Centre', to: '/action-centre' },
    ];
  }
  if (role === 'SUPER_ADMIN' || role === 'MANAGEMENT') {
    return [
      { label: 'Batches', to: '/batches' },
      { label: 'Reports', to: '/reports' },
      { label: 'Settings', to: '/settings' },
      { label: 'Students', to: '/people/students' },
    ];
  }
  return [];
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayHeaderClasses(isToday: boolean) {
  return isToday
    ? 'bg-brand-600 text-ink'
    : 'bg-surface-muted text-ink';
}

function formatSessionTime(sessionDate: string) {
  return new Date(sessionDate).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function sessionLabel(s: any) {
  return `${formatSessionTime(s.sessionDate)} · ${s.batchName}${s.topic ? ` — ${s.topic}` : ''}`;
}

function WeekCalendar({ weekSessions, readOnly = false }: { weekSessions: any[]; readOnly?: boolean }) {
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + i);
    const sessions = (weekSessions ?? []).filter((s) => new Date(s.sessionDate).toDateString() === date.toDateString());
    const isToday = date.toDateString() === today.toDateString();
    return { date, dayIndex: i, sessions, isToday };
  });

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-ink">This Week</h2>
      <div className="space-y-2 lg:hidden">
        {days.map((d) => (
          <div key={d.dayIndex} className="card overflow-hidden">
            <div className={`px-3 py-2 text-xs font-semibold ${dayHeaderClasses(d.isToday)}`}>
              {WEEKDAY_LABELS[d.dayIndex]} {d.date.getDate()}
            </div>
            <div className="space-y-1 p-2">
              {d.sessions.length === 0 ? (
                <p className="px-1 py-2 text-center text-xs text-ink-muted">-</p>
              ) : (
                d.sessions.map((s: any) =>
                  readOnly ? (
                    <div key={s.id} className="block rounded bg-surface-muted px-2 py-1.5 text-xs text-ink">
                      {sessionLabel(s)}
                    </div>
                  ) : (
                    <Link key={s.id} to={`/sessions/${s.id}`} className="block rounded bg-surface-muted px-2 py-1.5 text-xs text-ink hover:bg-brand-100">
                      {sessionLabel(s)}
                    </Link>
                  ),
                )
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="hidden grid-cols-7 gap-2 lg:grid">
        {days.map((d) => (
          <div key={d.dayIndex} className="min-w-0">
            <div className={`rounded-t-lg px-2 py-1.5 text-center text-xs font-semibold ${dayHeaderClasses(d.isToday)}`}>
              {WEEKDAY_LABELS[d.dayIndex]} {d.date.getDate()}
            </div>
            <div className="card min-h-[4.5rem] space-y-1 rounded-t-none p-1.5">
              {d.sessions.length === 0 ? (
                <p className="px-1 py-2 text-center text-[11px] text-ink-muted">-</p>
              ) : (
                d.sessions.map((s: any) =>
                  readOnly ? (
                    <div key={s.id} className="block truncate rounded bg-surface-muted px-1.5 py-1 text-[11px] text-ink" title={sessionLabel(s)}>
                      {sessionLabel(s)}
                    </div>
                  ) : (
                    <Link key={s.id} to={`/sessions/${s.id}`} className="block truncate rounded bg-surface-muted px-1.5 py-1 text-[11px] text-ink hover:bg-brand-100" title={sessionLabel(s)}>
                      {sessionLabel(s)}
                    </Link>
                  ),
                )
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
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function approve(id: string) {
    setBusy(true);
    try {
      await api.patch(`/batch-transfers/${id}/approve`, {});
      toast.success('Transfer approved');
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'me'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmReject() {
    if (!rejectId) return;
    setBusy(true);
    try {
      await api.patch(`/batch-transfers/${rejectId}/reject`, { reason: rejectReason.trim() || 'Rejected by admin' });
      toast.success('Transfer rejected');
      setRejectId(null);
      setRejectReason('');
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'me'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
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

      <div className="mt-6">
        <WeekCalendar weekSessions={data?.weekSessions ?? []} />
      </div>

      <h2 className="mb-3 mt-6 text-sm font-semibold text-ink">Pending Batch Transfers ({data?.pendingTransfers?.length ?? 0})</h2>
      <div className="card divide-y divide-edge">
        {(data?.pendingTransfers ?? []).length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-muted">No pending transfers</p>}
        {(data?.pendingTransfers ?? []).map((t: any) => (
          <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm max-lg:flex-col max-lg:items-start max-lg:gap-2">
            <span className="min-w-0 break-words">
              {t.student.firstName} {t.student.lastName} → {t.toBatch.name}
            </span>
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" className="btn-primary py-1.5 text-xs" disabled={busy} onClick={() => approve(t.id)}>
                Approve
              </button>
              <button type="button" className="btn-danger py-1.5 text-xs" disabled={busy} onClick={() => { setRejectId(t.id); setRejectReason(''); }}>
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={!!rejectId} onClose={() => !busy && setRejectId(null)} title="Reject transfer">
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">Optionally add a reason for the student or requesting staff.</p>
          <label className="block">
            <span className="label">Reason (optional)</span>
            <textarea className="input" rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => setRejectId(null)}>
              Cancel
            </button>
            <button type="button" className="btn-danger" disabled={busy} onClick={confirmReject}>
              {busy ? 'Rejecting…' : 'Confirm reject'}
            </button>
          </div>
        </div>
      </Modal>
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
            <span>
              {s.topic} - {s.batch.name}
            </span>
            <Badge tone={s.status === 'COMPLETED' ? 'green' : 'blue'}>{s.status}</Badge>
          </Link>
        ))}
      </div>
    </div>
  );
}

function StudentDashboard({ data }: { data: any }) {
  const { user } = useAuth();
  const composite = data?.composite;
  const studentId = user?.profile && typeof user.profile === 'object' && 'id' in user.profile ? (user.profile as { id: string }).id : undefined;
  return (
    <div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Composite Score" value={composite ? `${composite.composite.toFixed(1)}%` : '-'} />
        <StatCard label="Attendance" value={`${data?.attendancePct ?? 0}%`} tone={data?.belowAttendanceThreshold ? 'warn' : 'good'} />
        <StatCard label="Upcoming Session(s)" value={data?.upcomingSessions?.length ?? 0} />
        <StatCard label="Overdue Tasks" value={data?.overdueTasks?.length ?? 0} tone={data?.overdueTasks?.length > 0 ? 'bad' : 'good'} />
      </div>
      {studentId && (
        <div className="mt-4">
          <Link to={`/my/${studentId}`} className="text-sm font-medium text-brand-ink hover:underline">
            View my student details →
          </Link>
        </div>
      )}
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
  const children = data?.children ?? [];
  return (
    <div className="space-y-6">
      {children.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {children.map((c: any) => (
            <Link key={c.id} to={`/my/${c.id}`} className="card p-3 hover:shadow-md">
              <p className="font-semibold text-ink">{c.name}</p>
              <p className="text-xs text-ink-muted">{c.batch ?? 'No batch assigned'}</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <Metric label="Attendance" value={c.attendancePct} />
                <Metric label="Composite" value={c.composite.composite} />
              </div>
            </Link>
          ))}
        </div>
      )}

      {children.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-ink">Monthly Performance</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {children.map((c: any) => (
              <ParentChildMonthlyChart key={c.id} studentId={c.id} studentName={c.name} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ParentChildMonthlyChart({ studentId, studentName }: { studentId: string; studentName: string }) {
  const { data } = useQuery({
    queryKey: ['student', studentId, 'monthly-performance'],
    queryFn: async () => (await api.get(`/students/${studentId}/monthly-performance`)).data,
  });
  const chartData = (data?.months ?? []).map((m: any) => ({
    month: new Date(2000, m.month - 1, 1).toLocaleString(undefined, { month: 'short' }),
    score: m.avgPercentage ?? 0,
  }));

  return (
    <div className="card p-4">
      <h3 className="mb-3 text-sm font-semibold text-ink">{studentName}</h3>
      {chartData.length === 0 ? (
        <p className="text-sm text-ink-muted">No performance data yet</p>
      ) : (
        <div style={{ height: 200 }} className="min-w-0 w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="score" name="Avg %" stroke="rgb(var(--color-brand-600))" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
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
