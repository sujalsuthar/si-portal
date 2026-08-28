import { RoleName, AttendanceContext, AttendanceStatus, TaskStatus, GradeStatus, InterventionStatus, BatchStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { AuthContext } from '@/middleware/auth';
import { computeStudentComposite } from '@/lib/scoring';
import { computeOutstanding } from '@/modules/fees/fees.controller';
import { getFacultyBatchIds, getParentStudentIds } from '@/utils/scope';

export type ChartType = 'line' | 'bar' | 'pie';

export interface WidgetMeta {
  key: string;
  label: string;
  chartType: ChartType;
}

interface WidgetDef extends WidgetMeta {
  roles: RoleName[];
  fetch: (auth: AuthContext) => Promise<{ data: Record<string, string | number>[]; series?: string[] }>;
}

interface Bucket {
  start: Date;
  end: Date;
  label: string;
}

function lastNMonths(n: number): Bucket[] {
  const buckets: Bucket[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    buckets.push({ start, end, label: start.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) });
  }
  return buckets;
}

function lastNWeeks(n: number): Bucket[] {
  const buckets: Bucket[] = [];
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    const end = new Date(todayStart.getTime() - i * 7 * 24 * 60 * 60 * 1000);
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    buckets.push({ start, end, label: `${start.getMonth() + 1}/${start.getDate()}` });
  }
  return buckets;
}

function nextNDays(n: number): Bucket[] {
  const buckets: Bucket[] = [];
  for (let i = 0; i < n; i++) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() + i);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    buckets.push({ start, end, label: start.toLocaleDateString('en-US', { weekday: 'short' }) });
  }
  return buckets;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ---------------------------------------------------------------------------
// Shared scope-parameterized trend helpers
// ---------------------------------------------------------------------------

async function attendancePctTrend(buckets: Bucket[], opts: { studentId?: string; batchIds?: string[] } = {}) {
  return Promise.all(
    buckets.map(async ({ start, end, label }) => {
      const records = await prisma.attendance.findMany({
        where: {
          context: AttendanceContext.SESSION,
          markedAt: { gte: start, lt: end },
          ...(opts.studentId ? { studentId: opts.studentId } : {}),
          ...(opts.batchIds ? { student: { currentBatchId: { in: opts.batchIds } } } : {}),
        },
        select: { status: true },
      });
      const pct = records.length
        ? (records.filter((r) => r.status === AttendanceStatus.PRESENT || r.status === AttendanceStatus.LATE).length / records.length) * 100
        : 0;
      return { label, value: round1(pct) };
    }),
  );
}

/** Task completion % per bucket — tasks due in the bucket, scoped to a batch list and/or a single student. */
async function taskCompletionPctTrend(buckets: Bucket[], opts: { studentId?: string; batchIds?: string[] } = {}) {
  return Promise.all(
    buckets.map(async ({ start, end, label }) => {
      const tasks = await prisma.task.findMany({
        where: { dueDate: { gte: start, lt: end }, ...(opts.batchIds ? { batchId: { in: opts.batchIds } } : {}) },
        select: { id: true },
      });
      const taskIds = tasks.map((t) => t.id);
      if (taskIds.length === 0) return { label, value: 0 };
      const assignmentWhere = { taskId: { in: taskIds }, ...(opts.studentId ? { studentId: opts.studentId } : {}) };
      const [assignments, completed] = await Promise.all([
        prisma.taskAssignment.count({ where: assignmentWhere }),
        prisma.taskSubmission.count({ where: { ...assignmentWhere, status: { in: [TaskStatus.EVALUATED, TaskStatus.SUBMITTED, TaskStatus.LATE] } } }),
      ]);
      return { label, value: assignments ? round1((completed / assignments) * 100) : 0 };
    }),
  );
}

async function examAvgPctTrend(buckets: Bucket[], opts: { studentId?: string; batchIds?: string[] } = {}) {
  return Promise.all(
    buckets.map(async ({ start, end, label }) => {
      const grades = await prisma.grade.findMany({
        where: {
          status: GradeStatus.PUBLISHED,
          publishedAt: { gte: start, lt: end },
          ...(opts.studentId ? { studentId: opts.studentId } : {}),
          ...(opts.batchIds ? { exam: { batchId: { in: opts.batchIds } } } : {}),
        },
        select: { percentage: true },
      });
      const avg = grades.length ? grades.reduce((s, g) => s + g.percentage, 0) / grades.length : 0;
      return { label, value: round1(avg) };
    }),
  );
}

async function behaviourNetTrend(buckets: Bucket[], studentId: string) {
  return Promise.all(
    buckets.map(async ({ start, end, label }) => {
      const events = await prisma.behaviourEvent.findMany({
        where: { studentId, eventDate: { gte: start, lt: end }, OR: [{ type: 'POSITIVE' }, { authorizedById: { not: null } }] },
        select: { points: true },
      });
      return { label, value: events.reduce((s, e) => s + e.points, 0) };
    }),
  );
}

/** Wraps a per-child trend fetcher into the multi-series {series, data} shape the frontend expects. */
async function perChildSeries(
  parentId: string,
  fetchOne: (studentId: string) => Promise<{ label: string; value: number }[]>,
): Promise<{ data: Record<string, string | number>[]; series: string[] }> {
  const studentIds = await getParentStudentIds(parentId);
  const children = await prisma.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, firstName: true } });
  if (children.length === 0) return { data: [], series: [] };
  const perChild = await Promise.all(children.map((c) => fetchOne(c.id)));
  const data = perChild[0].map((_, i) => {
    const point: Record<string, string | number> = { label: perChild[0][i].label };
    children.forEach((c, ci) => {
      point[c.firstName] = perChild[ci][i].value;
    });
    return point;
  });
  return { data, series: children.map((c) => c.firstName) };
}

// ---------------------------------------------------------------------------
// Widget registry
// ---------------------------------------------------------------------------

const MANAGEMENT_ROLES: RoleName[] = [RoleName.SUPER_ADMIN, RoleName.MANAGEMENT];

export const WIDGETS: Record<string, WidgetDef> = {
  student_growth: {
    key: 'student_growth',
    label: 'Student growth (last 6 months)',
    chartType: 'line',
    roles: MANAGEMENT_ROLES,
    fetch: async () => ({
      data: await Promise.all(
        lastNMonths(6).map(async ({ start, end, label }) => ({ label, value: await prisma.student.count({ where: { joiningDate: { gte: start, lt: end } } }) })),
      ),
    }),
  },
  certificates_issued: {
    key: 'certificates_issued',
    label: 'Certificates issued (last 6 months)',
    chartType: 'bar',
    roles: MANAGEMENT_ROLES,
    fetch: async () => ({
      data: await Promise.all(
        lastNMonths(6).map(async ({ start, end, label }) => ({ label, value: await prisma.certificate.count({ where: { issueDate: { gte: start, lt: end } } }) })),
      ),
    }),
  },
  fee_collection_trend: {
    key: 'fee_collection_trend',
    label: 'Fee collection (last 6 months)',
    chartType: 'line',
    roles: MANAGEMENT_ROLES,
    fetch: async () => ({
      data: await Promise.all(
        lastNMonths(6).map(async ({ start, end, label }) => {
          const agg = await prisma.feePayment.aggregate({ where: { paidAt: { gte: start, lt: end } }, _sum: { amount: true } });
          return { label, value: Math.round((agg._sum.amount ?? 0) * 100) / 100 };
        }),
      ),
    }),
  },
  batch_performance: {
    key: 'batch_performance',
    label: 'Batch performance (avg. composite score)',
    chartType: 'bar',
    roles: [...MANAGEMENT_ROLES, RoleName.ACADEMIC_ADMIN],
    fetch: async () => {
      const batches = await prisma.batch.findMany({
        where: { status: BatchStatus.ACTIVE },
        include: { students: { where: { status: 'ACTIVE' }, select: { id: true } } },
      });
      const results = await Promise.all(
        batches
          .filter((b) => b.students.length > 0)
          .map(async (b) => {
            const scores = await Promise.all(b.students.map((s) => computeStudentComposite(s.id)));
            const avg = scores.reduce((sum, s) => sum + s.composite, 0) / scores.length;
            return { label: b.name, value: round1(avg) };
          }),
      );
      results.sort((a, b) => b.value - a.value);
      return { data: results };
    },
  },
  top_bottom_students: {
    key: 'top_bottom_students',
    label: 'Top & bottom performing students',
    chartType: 'bar',
    roles: MANAGEMENT_ROLES,
    fetch: async () => {
      const students = await prisma.student.findMany({ where: { status: 'ACTIVE' }, select: { id: true, firstName: true, lastName: true } });
      const scored = await Promise.all(
        students.map(async (s) => ({ label: `${s.firstName} ${s.lastName}`, value: round1((await computeStudentComposite(s.id)).composite) })),
      );
      scored.sort((a, b) => b.value - a.value);
      const picked = new Map<string, number>();
      for (const s of [...scored.slice(0, 5), ...scored.slice(-5)]) picked.set(s.label, s.value);
      return { data: Array.from(picked, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value) };
    },
  },
  faculty_activity: {
    key: 'faculty_activity',
    label: 'Faculty activity — sessions conducted (last 30 days)',
    chartType: 'bar',
    roles: MANAGEMENT_ROLES,
    fetch: async () => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const sessions = await prisma.session.findMany({ where: { status: 'COMPLETED', sessionDate: { gte: since } }, select: { facultyId: true } });
      const counts = new Map<string, number>();
      for (const s of sessions) counts.set(s.facultyId, (counts.get(s.facultyId) ?? 0) + 1);
      const facultyRows = await prisma.faculty.findMany({ where: { id: { in: [...counts.keys()] } }, select: { id: true, firstName: true, lastName: true } });
      return { data: facultyRows.map((f) => ({ label: `${f.firstName} ${f.lastName}`, value: counts.get(f.id) ?? 0 })).sort((a, b) => (b.value as number) - (a.value as number)) };
    },
  },
  institute_attendance_trend: {
    key: 'institute_attendance_trend',
    label: 'Institute-wide attendance trend',
    chartType: 'line',
    roles: MANAGEMENT_ROLES,
    fetch: async () => ({ data: await attendancePctTrend(lastNMonths(6)) }),
  },
  batch_status_breakdown: {
    key: 'batch_status_breakdown',
    label: 'Batches by status',
    chartType: 'pie',
    roles: MANAGEMENT_ROLES,
    fetch: async () => {
      const grouped = await prisma.batch.groupBy({ by: ['status'], _count: { _all: true } });
      return { data: grouped.map((g) => ({ label: g.status, value: g._count._all })) };
    },
  },
  intervention_overview: {
    key: 'intervention_overview',
    label: 'Students requiring attention, by severity',
    chartType: 'bar',
    roles: MANAGEMENT_ROLES,
    fetch: async () => {
      const grouped = await prisma.interventionCase.groupBy({
        by: ['severity'],
        where: { status: { in: [InterventionStatus.OPEN, InterventionStatus.IN_PROGRESS] } },
        _count: { _all: true },
      });
      return { data: grouped.map((g) => ({ label: g.severity, value: g._count._all })) };
    },
  },
  fee_collected_vs_outstanding: {
    key: 'fee_collected_vs_outstanding',
    label: 'Fees: collected vs outstanding',
    chartType: 'pie',
    roles: MANAGEMENT_ROLES,
    fetch: async () => {
      const accounts = await prisma.feeAccount.findMany({ select: { id: true } });
      const [collectedAgg, outstandingList] = await Promise.all([
        prisma.feePayment.aggregate({ _sum: { amount: true } }),
        Promise.all(accounts.map((a) => computeOutstanding(a.id))),
      ]);
      const outstanding = outstandingList.reduce((s, o) => s + Math.max(0, o), 0);
      return {
        data: [
          { label: 'Collected', value: Math.round((collectedAgg._sum.amount ?? 0) * 100) / 100 },
          { label: 'Outstanding', value: Math.round(outstanding * 100) / 100 },
        ],
      };
    },
  },

  // Academic Admin — narrower than Super Admin: lecture management + student activity, no fees/marketing/faculty-HR data.
  sessions_conducted_trend: {
    key: 'sessions_conducted_trend',
    label: 'Sessions conducted (last 6 weeks)',
    chartType: 'line',
    roles: [RoleName.ACADEMIC_ADMIN],
    fetch: async () => ({
      data: await Promise.all(
        lastNWeeks(6).map(async ({ start, end, label }) => ({ label, value: await prisma.session.count({ where: { status: 'COMPLETED', sessionDate: { gte: start, lt: end } } }) })),
      ),
    }),
  },
  admin_attendance_trend: {
    key: 'admin_attendance_trend',
    label: 'Student attendance trend',
    chartType: 'line',
    roles: [RoleName.ACADEMIC_ADMIN],
    fetch: async () => ({ data: await attendancePctTrend(lastNMonths(6)) }),
  },
  admin_task_completion_trend: {
    key: 'admin_task_completion_trend',
    label: 'Task completion trend',
    chartType: 'line',
    roles: [RoleName.ACADEMIC_ADMIN],
    fetch: async () => ({ data: await taskCompletionPctTrend(lastNMonths(6)) }),
  },
  upcoming_sessions: {
    key: 'upcoming_sessions',
    label: 'Sessions scheduled — next 7 days',
    chartType: 'bar',
    roles: [RoleName.ACADEMIC_ADMIN],
    fetch: async () => ({
      data: await Promise.all(
        nextNDays(7).map(async ({ start, end, label }) => ({ label, value: await prisma.session.count({ where: { sessionDate: { gte: start, lt: end }, status: { not: 'CANCELLED' } } }) })),
      ),
    }),
  },

  // Team / Faculty — scoped to their own assigned batches.
  my_sessions_trend: {
    key: 'my_sessions_trend',
    label: 'My sessions conducted (last 6 weeks)',
    chartType: 'line',
    roles: [RoleName.FACULTY],
    fetch: async (auth) => ({
      data: await Promise.all(
        lastNWeeks(6).map(async ({ start, end, label }) => ({
          label,
          value: await prisma.session.count({ where: { facultyId: auth.facultyId!, sessionDate: { gte: start, lt: end } } }),
        })),
      ),
    }),
  },
  my_batches_attendance_trend: {
    key: 'my_batches_attendance_trend',
    label: 'My batches — attendance trend',
    chartType: 'line',
    roles: [RoleName.FACULTY],
    fetch: async (auth) => ({ data: await attendancePctTrend(lastNMonths(6), { batchIds: await getFacultyBatchIds(auth.facultyId!) }) }),
  },
  my_batches_task_completion_trend: {
    key: 'my_batches_task_completion_trend',
    label: 'My batches — task completion trend',
    chartType: 'line',
    roles: [RoleName.FACULTY],
    fetch: async (auth) => ({ data: await taskCompletionPctTrend(lastNMonths(6), { batchIds: await getFacultyBatchIds(auth.facultyId!) }) }),
  },
  my_students_performance_distribution: {
    key: 'my_students_performance_distribution',
    label: 'My students — performance distribution',
    chartType: 'bar',
    roles: [RoleName.FACULTY],
    fetch: async (auth) => {
      const batchIds = await getFacultyBatchIds(auth.facultyId!);
      const students = await prisma.student.findMany({ where: { status: 'ACTIVE', currentBatchId: { in: batchIds } }, select: { id: true } });
      const scores = await Promise.all(students.map((s) => computeStudentComposite(s.id)));
      const buckets = [
        { label: '0-40', min: 0, max: 40 },
        { label: '40-60', min: 40, max: 60 },
        { label: '60-75', min: 60, max: 75 },
        { label: '75-90', min: 75, max: 90 },
        { label: '90-100', min: 90, max: 101 },
      ];
      return { data: buckets.map((b) => ({ label: b.label, value: scores.filter((s) => s.composite >= b.min && s.composite < b.max).length })) };
    },
  },

  // Parent — per child, multi-series where there's more than one.
  child_attendance_trend: {
    key: 'child_attendance_trend',
    label: "My children's attendance trend",
    chartType: 'line',
    roles: [RoleName.PARENT],
    fetch: async (auth) => perChildSeries(auth.parentId!, (studentId) => attendancePctTrend(lastNMonths(6), { studentId })),
  },
  child_task_completion_trend: {
    key: 'child_task_completion_trend',
    label: "My children's task completion trend",
    chartType: 'line',
    roles: [RoleName.PARENT],
    fetch: async (auth) => perChildSeries(auth.parentId!, (studentId) => taskCompletionPctTrend(lastNMonths(6), { studentId })),
  },
  child_exam_trend: {
    key: 'child_exam_trend',
    label: "My children's exam performance trend",
    chartType: 'line',
    roles: [RoleName.PARENT],
    fetch: async (auth) => perChildSeries(auth.parentId!, (studentId) => examAvgPctTrend(lastNMonths(6), { studentId })),
  },
  child_behaviour_trend: {
    key: 'child_behaviour_trend',
    label: "My children's behaviour points trend",
    chartType: 'line',
    roles: [RoleName.PARENT],
    fetch: async (auth) => perChildSeries(auth.parentId!, (studentId) => behaviourNetTrend(lastNMonths(6), studentId)),
  },

  // Student — self scope only.
  my_attendance_trend: {
    key: 'my_attendance_trend',
    label: 'My attendance trend',
    chartType: 'line',
    roles: [RoleName.STUDENT],
    fetch: async (auth) => ({ data: await attendancePctTrend(lastNMonths(6), { studentId: auth.studentId! }) }),
  },
  my_task_completion_trend: {
    key: 'my_task_completion_trend',
    label: 'My task completion trend',
    chartType: 'line',
    roles: [RoleName.STUDENT],
    fetch: async (auth) => ({ data: await taskCompletionPctTrend(lastNMonths(6), { studentId: auth.studentId! }) }),
  },
  my_exam_trend: {
    key: 'my_exam_trend',
    label: 'My exam performance trend',
    chartType: 'line',
    roles: [RoleName.STUDENT],
    fetch: async (auth) => ({ data: await examAvgPctTrend(lastNMonths(6), { studentId: auth.studentId! }) }),
  },
  my_composite_trend: {
    key: 'my_composite_trend',
    label: 'My composite score trend',
    chartType: 'line',
    roles: [RoleName.STUDENT],
    fetch: async (auth) => {
      const snapshots = await prisma.studentCompositeSnapshot.findMany({ where: { studentId: auth.studentId! }, orderBy: { period: 'asc' }, take: 12 });
      return { data: snapshots.map((s) => ({ label: s.period, value: round1(s.composite) })) };
    },
  },
};

export function catalogForRole(role: RoleName): WidgetMeta[] {
  return Object.values(WIDGETS)
    .filter((w) => w.roles.includes(role))
    .map(({ key, label, chartType }) => ({ key, label, chartType }));
}

export function defaultWidgetKeysForRole(role: RoleName): string[] {
  // A sensible curated starting set — the user can add the rest via "Customize".
  const defaults: Partial<Record<RoleName, string[]>> = {
    SUPER_ADMIN: ['student_growth', 'batch_performance', 'fee_collection_trend', 'institute_attendance_trend', 'certificates_issued', 'intervention_overview'],
    MANAGEMENT: ['student_growth', 'batch_performance', 'fee_collection_trend', 'institute_attendance_trend', 'certificates_issued', 'intervention_overview'],
    ACADEMIC_ADMIN: ['sessions_conducted_trend', 'admin_attendance_trend', 'admin_task_completion_trend', 'batch_performance'],
    FACULTY: ['my_sessions_trend', 'my_batches_attendance_trend', 'my_batches_task_completion_trend', 'my_students_performance_distribution'],
    PARENT: ['child_attendance_trend', 'child_exam_trend', 'child_task_completion_trend'],
    STUDENT: ['my_attendance_trend', 'my_exam_trend', 'my_composite_trend'],
  };
  return defaults[role] ?? [];
}
