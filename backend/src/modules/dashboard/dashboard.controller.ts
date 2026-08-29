import { Router } from 'express';
import {
  RoleName,
  StudentStatus,
  BatchStatus,
  AttendanceContext,
  AttendanceStatus,
  GradeStatus,
  TaskStatus,
  TransferStatus,
  InterventionStatus,
} from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { computeStudentComposite, getScoringConfig } from '@/lib/scoring';
import { getFacultyBatchIds, getParentStudentIds } from '@/utils/scope';
import { ApiError } from '@/utils/apiError';
import { WIDGETS, catalogForRole, defaultWidgetKeysForRole } from '@/lib/dashboardWidgets';

export const dashboardRouter = Router();
dashboardRouter.use(authenticate);

dashboardRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    switch (req.auth!.role) {
      case RoleName.SUPER_ADMIN:
      case RoleName.MANAGEMENT:
        return res.json(await managementDashboard());
      case RoleName.ACADEMIC_ADMIN:
        return res.json(await adminDashboard());
      case RoleName.FACULTY:
        return res.json(await facultyDashboard(req.auth!.facultyId!));
      case RoleName.ACCOUNTS:
        return res.json(await accountsDashboard());
      case RoleName.STUDENT:
        return res.json(await studentDashboard(req.auth!.studentId!));
      case RoleName.PARENT:
        return res.json(await parentDashboard(req.auth!.parentId!));
      default:
        throw ApiError.forbidden();
    }
  }),
);

async function managementDashboard() {
  const [activeStudents, activeBatches, attendances, grades, taskAssignments, taskSubmissions, requiringAttention, latestAwards] =
    await Promise.all([
      prisma.student.count({ where: { status: StudentStatus.ACTIVE } }),
      prisma.batch.count({ where: { status: BatchStatus.ACTIVE } }),
      prisma.attendance.findMany({ where: { context: AttendanceContext.SESSION }, take: 5000 }),
      prisma.grade.findMany({ where: { status: GradeStatus.PUBLISHED } }),
      prisma.taskAssignment.count(),
      prisma.taskSubmission.findMany(),
      prisma.interventionCase.count({ where: { status: { in: [InterventionStatus.OPEN, InterventionStatus.IN_PROGRESS] } } }),
      prisma.studentOfMonthAward.findMany({ orderBy: { period: 'desc' }, take: 2 }),
    ]);

  const avgAttendance = attendances.length
    ? (attendances.filter((a) => a.status === AttendanceStatus.PRESENT || a.status === AttendanceStatus.LATE).length / attendances.length) * 100
    : 0;
  const avgExam = grades.length ? grades.reduce((s, g) => s + g.percentage, 0) / grades.length : 0;
  const completedTasks = taskSubmissions.filter((s) => s.status === TaskStatus.EVALUATED || s.status === TaskStatus.SUBMITTED).length;

  const batches = await prisma.batch.findMany({ where: { status: BatchStatus.ACTIVE }, include: { course: true, _count: { select: { students: true } } } });

  // Current week (Sun-Sat) sessions for the dashboard calendar — days alternate Navy/Red starting
  // Sunday=Red, so the calendar and the two summary cards below it share the same color coding.
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const weekSessionRows = await prisma.session.findMany({
    where: { sessionDate: { gte: weekStart, lt: weekEnd }, status: { not: 'CANCELLED' } },
    include: { batch: { select: { id: true, name: true } } },
    orderBy: { sessionDate: 'asc' },
  });
  const weekSessions = weekSessionRows.map((s) => ({
    id: s.id,
    topic: s.topic,
    sessionDate: s.sessionDate,
    batchId: s.batch.id,
    batchName: s.batch.name,
    color: s.sessionDate.getDay() % 2 === 0 ? 'red' : 'navy',
  }));
  const navyBatches = [...new Map(weekSessions.filter((s) => s.color === 'navy').map((s) => [s.batchId, s.batchName])).entries()].map(([id, name]) => ({ id, name }));
  const redBatches = [...new Map(weekSessions.filter((s) => s.color === 'red').map((s) => [s.batchId, s.batchName])).entries()].map(([id, name]) => ({ id, name }));

  return {
    kpis: {
      activeStudents,
      activeBatches,
      averageAttendancePct: Math.round(avgAttendance * 10) / 10,
      averageExamScorePct: Math.round(avgExam * 10) / 10,
      taskCompletionPct: taskAssignments ? Math.round((completedTasks / taskAssignments) * 1000) / 10 : 0,
      studentsRequiringAttention: requiringAttention,
    },
    batches: batches.map((b) => ({ id: b.id, name: b.name, course: b.course.name, strength: b._count.students })),
    recentAwards: latestAwards,
    weekSessions,
    navyBatches,
    redBatches,
  };
}

async function adminDashboard() {
  const [students, parents, faculty, batches, pendingTransfers, pendingCertifications] = await Promise.all([
    prisma.student.count({ where: { status: StudentStatus.ACTIVE } }),
    prisma.parentGuardian.count(),
    prisma.faculty.count({ where: { isActive: true } }),
    prisma.batch.count({ where: { status: BatchStatus.ACTIVE } }),
    prisma.batchTransfer.findMany({ where: { status: TransferStatus.PENDING }, include: { student: { select: { firstName: true, lastName: true } }, toBatch: { select: { name: true } } } }),
    prisma.certification.count({ where: { status: 'SCHEDULED' } }),
  ]);

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const weekSessionRows = await prisma.session.findMany({
    where: { sessionDate: { gte: weekStart, lt: weekEnd }, status: { not: 'CANCELLED' } },
    include: { batch: { select: { id: true, name: true } } },
    orderBy: { sessionDate: 'asc' },
  });
  const weekSessions = weekSessionRows.map((s) => ({
    id: s.id,
    topic: s.topic,
    sessionDate: s.sessionDate,
    batchId: s.batch.id,
    batchName: s.batch.name,
    color: s.sessionDate.getDay() % 2 === 0 ? 'red' : 'navy',
  }));

  return { counts: { students, parents, faculty, batches }, pendingTransfers, pendingCertifications, weekSessions };
}

/** Finance home screen for Accounts — fee totals only (no academic ops). */
async function accountsDashboard() {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [accountCount, monthPayments, pendingReconciliation, openInstalments] = await Promise.all([
    prisma.feeAccount.count(),
    prisma.feePayment.findMany({ where: { paidAt: { gte: monthStart } }, select: { amount: true } }),
    prisma.feePayment.count({ where: { needsReconciliation: true } }),
    prisma.instalment.count({ where: { status: { not: 'PAID' } } }),
  ]);
  return {
    counts: {
      feeAccounts: accountCount,
      collectedThisMonth: monthPayments.reduce((s: number, p: { amount: number }) => s + p.amount, 0),
      pendingReconciliation,
      openInstalments,
    },
  };
}

async function facultyDashboard(facultyId: string) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const batchIds = await getFacultyBatchIds(facultyId);

  const [todaySessions, pendingEvaluations, presentationsToScore, studentConcerns] = await Promise.all([
    prisma.session.findMany({ where: { facultyId, sessionDate: { gte: todayStart, lte: todayEnd } }, include: { batch: true } }),
    prisma.taskSubmission.findMany({
      where: { status: { in: [TaskStatus.SUBMITTED, TaskStatus.LATE] }, task: { createdById: facultyId } },
      include: { task: true, student: { select: { firstName: true, lastName: true } } },
    }),
    prisma.presentation.findMany({ where: { evaluatorFacultyId: facultyId, status: 'PLANNED' }, orderBy: { scheduledDate: 'asc' }, take: 10 }),
    prisma.interventionCase.findMany({ where: { assignedFacultyId: facultyId, status: { in: [InterventionStatus.OPEN, InterventionStatus.IN_PROGRESS] } } }),
  ]);

  return {
    todaySessions,
    pendingEvaluationsCount: pendingEvaluations.length,
    pendingEvaluations: pendingEvaluations.slice(0, 10),
    upcomingPresentations: presentationsToScore,
    assignedBatchCount: batchIds.length,
    studentConcerns,
  };
}

async function studentDashboard(studentId: string) {
  const composite = await computeStudentComposite(studentId);
  const config = await getScoringConfig();

  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { currentBatchId: true } });

  const [attendances, upcomingSessions, overdueTasks, upcomingPresentations] = await Promise.all([
    prisma.attendance.findMany({ where: { studentId, context: AttendanceContext.SESSION } }),
    student?.currentBatchId
      ? prisma.session.findMany({
          where: { batchId: student.currentBatchId, sessionDate: { gte: new Date() }, status: { not: 'CANCELLED' } },
          orderBy: { sessionDate: 'asc' },
          take: 5,
        })
      : Promise.resolve([]),
    prisma.taskSubmission.findMany({
      where: { studentId, status: { in: [TaskStatus.NOT_STARTED, TaskStatus.IN_PROGRESS] }, task: { dueDate: { lt: new Date() } } },
      include: { task: true },
    }),
    prisma.presentation.findMany({ where: { studentId, status: 'PLANNED' }, orderBy: { scheduledDate: 'asc' }, take: 5 }),
  ]);

  const present = attendances.filter((a) => a.status === AttendanceStatus.PRESENT || a.status === AttendanceStatus.LATE).length;
  const attendancePct = attendances.length ? (present / attendances.length) * 100 : 0;

  return {
    composite,
    attendancePct: Math.round(attendancePct * 10) / 10,
    belowAttendanceThreshold: attendancePct < config.attendanceThreshold,
    upcomingSessions,
    overdueTasks,
    upcomingPresentations,
  };
}

async function parentDashboard(parentId: string) {
  const studentIds = await getParentStudentIds(parentId);
  const students = await prisma.student.findMany({
    where: { id: { in: studentIds } },
    include: { currentBatch: { select: { id: true, name: true } } },
  });

  const children = await Promise.all(
    students.map(async (s) => {
      const composite = await computeStudentComposite(s.id);
      const attendances = await prisma.attendance.findMany({ where: { studentId: s.id, context: AttendanceContext.SESSION } });
      const present = attendances.filter((a) => a.status === AttendanceStatus.PRESENT || a.status === AttendanceStatus.LATE).length;
      return {
        id: s.id,
        name: `${s.firstName} ${s.lastName}`,
        batch: s.currentBatch?.name ?? null,
        attendancePct: attendances.length ? Math.round((present / attendances.length) * 1000) / 10 : 0,
        composite,
      };
    }),
  );

  // Scheduled Sessions of the Week — across every linked child's current batch.
  const batchIds = [...new Set(students.map((s) => s.currentBatch?.id).filter((id): id is string => !!id))];
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const weekSessions =
    batchIds.length > 0
      ? await prisma.session.findMany({
          where: { batchId: { in: batchIds }, sessionDate: { gte: weekStart, lt: weekEnd }, status: { not: 'CANCELLED' } },
          include: { batch: { select: { name: true } } },
          orderBy: { sessionDate: 'asc' },
        })
      : [];

  return { children, weekSessions: weekSessions.map((s) => ({ id: s.id, topic: s.topic, sessionDate: s.sessionDate, batchName: s.batch.name })) };
}

/** Action Center: overdue/pending/upcoming actions, kept role-specific so the home screen stays simple. */
dashboardRouter.get(
  '/action-center',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    if (auth.role === RoleName.STUDENT) {
      const [overdueTasks, upcomingExams, pendingSelfAssessment] = await Promise.all([
        prisma.taskSubmission.findMany({
          where: { studentId: auth.studentId!, status: { in: [TaskStatus.NOT_STARTED, TaskStatus.IN_PROGRESS] }, task: { dueDate: { lt: new Date() } } },
          include: { task: true },
        }),
        prisma.exam.findMany({ where: { batch: { students: { some: { id: auth.studentId! } } }, examDate: { gte: new Date() } }, orderBy: { examDate: 'asc' }, take: 5 }),
        prisma.selfAssessment.findFirst({ where: { studentId: auth.studentId! }, orderBy: { submittedAt: 'desc' } }),
      ]);
      return res.json({
        overdueTasks: overdueTasks.map((s) => ({ type: 'TASK', label: `Submit: ${s.task.title}`, dueDate: s.task.dueDate, taskId: s.task.id })),
        upcomingExams: upcomingExams.map((e) => ({ type: 'EXAM', label: `Prepare for: ${e.title}`, date: e.examDate, examId: e.id })),
        selfAssessmentReminder: !pendingSelfAssessment || monthsSince(pendingSelfAssessment.submittedAt) >= 1,
      });
    }

    if (auth.role === RoleName.FACULTY) {
      const pending = await prisma.taskSubmission.findMany({
        where: { status: { in: [TaskStatus.SUBMITTED, TaskStatus.LATE] }, task: { createdById: auth.userId } },
        include: { task: true },
      });
      const todaySessions = await prisma.session.findMany({
        where: { facultyId: auth.facultyId!, status: 'SCHEDULED', sessionDate: { lte: new Date() } },
      });
      return res.json({
        pendingEvaluations: pending.map((s) => ({ type: 'EVALUATE', label: `Evaluate: ${s.task.title}`, submissionId: s.id, taskId: s.task.id })),
        sessionsToClose: todaySessions.map((s) => ({ type: 'SESSION', label: `Take attendance: ${s.topic}`, sessionId: s.id })),
      });
    }

    if (auth.role === RoleName.ACADEMIC_ADMIN || auth.role === RoleName.SUPER_ADMIN) {
      const [transfers, cases] = await Promise.all([
        prisma.batchTransfer.findMany({ where: { status: TransferStatus.PENDING } }),
        prisma.interventionCase.findMany({ where: { status: InterventionStatus.OPEN, severity: { in: ['HIGH', 'CRITICAL'] } } }),
      ]);
      return res.json({
        pendingTransfers: transfers.map((t) => ({ type: 'TRANSFER', label: 'Approve batch transfer', transferId: t.id })),
        criticalCases: cases.map((c) => ({ type: 'INTERVENTION', label: 'Review student requiring attention', caseId: c.id })),
      });
    }

    res.json({});
  }),
);

function monthsSince(date: Date): number {
  const now = new Date();
  return (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
}

// ---------------------------------------------------------------------------
// Customizable, role-based chart widgets (SI Portal 3.5)
// ---------------------------------------------------------------------------

/** The chart widgets this role is allowed to see, for the "Customize dashboard" picker. */
dashboardRouter.get(
  '/widgets/catalog',
  asyncHandler(async (req, res) => {
    res.json(catalogForRole(req.auth!.role));
  }),
);

/** Chart-ready data for the requested widget keys — each key is checked against the caller's role. */
dashboardRouter.get(
  '/widgets/data',
  asyncHandler(async (req, res) => {
    const keys = String(req.query.keys ?? '')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    const allowedKeys = new Set(catalogForRole(req.auth!.role).map((w) => w.key));

    const result: Record<string, { data: Record<string, string | number>[]; series?: string[] }> = {};
    for (const key of keys) {
      if (!allowedKeys.has(key) || !WIDGETS[key]) throw ApiError.forbidden(`Widget "${key}" is not available for your role`);
      result[key] = await WIDGETS[key].fetch(req.auth!);
    }
    res.json(result);
  }),
);

dashboardRouter.get(
  '/preferences',
  asyncHandler(async (req, res) => {
    const saved = await prisma.dashboardPreference.findUnique({ where: { userId: req.auth!.userId } });
    res.json({ widgetKeys: saved?.widgetKeys ?? defaultWidgetKeysForRole(req.auth!.role) });
  }),
);

const preferencesSchema = z.object({ widgetKeys: z.array(z.string()) });

dashboardRouter.put(
  '/preferences',
  asyncHandler(async (req, res) => {
    const { widgetKeys } = preferencesSchema.parse(req.body);
    const allowedKeys = new Set(catalogForRole(req.auth!.role).map((w) => w.key));
    const invalid = widgetKeys.filter((k) => !allowedKeys.has(k));
    if (invalid.length > 0) throw ApiError.badRequest(`Not available for your role: ${invalid.join(', ')}`);

    const saved = await prisma.dashboardPreference.upsert({
      where: { userId: req.auth!.userId },
      update: { widgetKeys },
      create: { userId: req.auth!.userId, widgetKeys },
    });
    res.json({ widgetKeys: saved.widgetKeys });
  }),
);
