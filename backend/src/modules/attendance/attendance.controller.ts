import { Router } from 'express';
import { RoleName, AttendanceContext, AttendanceStatus, NotificationCategory } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate, authorize, ROLE_GROUPS } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/apiError';
import { recordAudit } from '@/lib/audit';
import { assertStudentAccess, getFacultyBatchIds, getParentStudentIds } from '@/utils/scope';
import { getScoringConfig } from '@/lib/scoring';
import { notify, notifyStudentParents } from '@/lib/notify';

export const attendanceRouter = Router();
attendanceRouter.use(authenticate);

/** True if this user already received an absence notification today — consolidates multiple same-day absences into one message. */
async function alreadyNotifiedAbsenceToday(userId: string): Promise<boolean> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const existing = await prisma.notification.findFirst({
    where: { userId, category: NotificationCategory.ATTENDANCE, title: 'Absence recorded', createdAt: { gte: startOfToday } },
  });
  return !!existing;
}

const bulkRecordSchema = z.object({
  records: z
    .array(
      z.object({
        studentId: z.string(),
        status: z.nativeEnum(AttendanceStatus),
        remarks: z.string().optional(),
      }),
    )
    .min(1),
});

/** Fast bulk mark/update for a class session — designed to take seconds, not minutes. */
attendanceRouter.post(
  '/session/:sessionId/bulk',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const { records } = bulkRecordSchema.parse(req.body);
    const session = await prisma.session.findUnique({ where: { id: req.params.sessionId } });
    if (!session) throw ApiError.notFound('Session not found');

    // Skip students whose data processing consent has been withdrawn — their attendance is not
    // recorded until fresh consent is captured (UR-DPP-04).
    const suspended = await prisma.student.findMany({
      where: { id: { in: records.map((r) => r.studentId) }, dataProcessingSuspended: true },
      select: { id: true },
    });
    const suspendedIds = new Set(suspended.map((s) => s.id));

    const results: unknown[] = [];
    const skipped = records.filter((r) => suspendedIds.has(r.studentId)).map((r) => r.studentId);
    for (const r of records.filter((r) => !suspendedIds.has(r.studentId))) {
      const existing = await prisma.attendance.findFirst({ where: { studentId: r.studentId, sessionId: session.id } });
      if (existing) {
        results.push(
          await prisma.attendance.update({
            where: { id: existing.id },
            data: { status: r.status, remarks: r.remarks, markedById: req.auth!.userId, markedAt: new Date() },
          }),
        );
      } else {
        results.push(
          await prisma.attendance.create({
            data: {
              studentId: r.studentId,
              sessionId: session.id,
              context: AttendanceContext.SESSION,
              status: r.status,
              remarks: r.remarks,
              markedById: req.auth!.userId,
            },
          }),
        );
      }
    }

    await prisma.session.update({ where: { id: session.id }, data: { status: 'COMPLETED' } });

    // Absence alerts, dispatched immediately so students/parents see them the same day — consolidated
    // to at most one message per student per day, even if they were absent from multiple sessions.
    for (const r of records.filter((x) => x.status === AttendanceStatus.ABSENT)) {
      const student = await prisma.student.findUnique({ where: { id: r.studentId } });
      if (!student) continue;
      if (await alreadyNotifiedAbsenceToday(student.userId)) continue;

      await notify({
        userId: student.userId,
        category: NotificationCategory.ATTENDANCE,
        title: 'Absence recorded',
        message: `You were marked absent today (${session.sessionDate.toDateString()}).`,
      });
      await notifyStudentParents(student.id, {
        category: NotificationCategory.ATTENDANCE,
        title: 'Absence recorded',
        message: `Your child was marked absent today (${session.sessionDate.toDateString()}).`,
      });
    }

    res.status(201).json({ results, skipped });
  }),
);

attendanceRouter.post(
  '/exam/:examId/bulk',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const { records } = bulkRecordSchema.parse(req.body);
    const exam = await prisma.exam.findUnique({ where: { id: req.params.examId } });
    if (!exam) throw ApiError.notFound('Exam not found');

    // Skip students whose data processing consent has been withdrawn (UR-DPP-04).
    const suspended = await prisma.student.findMany({
      where: { id: { in: records.map((r) => r.studentId) }, dataProcessingSuspended: true },
      select: { id: true },
    });
    const suspendedIds = new Set(suspended.map((s) => s.id));

    const results = [];
    const skipped = records.filter((r) => suspendedIds.has(r.studentId)).map((r) => r.studentId);
    for (const r of records.filter((r) => !suspendedIds.has(r.studentId))) {
      const existing = await prisma.attendance.findFirst({ where: { studentId: r.studentId, examId: exam.id } });
      if (existing) {
        results.push(
          await prisma.attendance.update({
            where: { id: existing.id },
            data: { status: r.status, remarks: r.remarks, markedById: req.auth!.userId, markedAt: new Date() },
          }),
        );
      } else {
        results.push(
          await prisma.attendance.create({
            data: {
              studentId: r.studentId,
              examId: exam.id,
              context: AttendanceContext.EXAM,
              status: r.status,
              remarks: r.remarks,
              markedById: req.auth!.userId,
            },
          }),
        );
      }
    }
    res.status(201).json({ results, skipped });
  }),
);

attendanceRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const studentId = req.query.studentId as string | undefined;
    const batchId = req.query.batchId as string | undefined;
    const sessionId = req.query.sessionId as string | undefined;
    const examId = req.query.examId as string | undefined;
    const context = req.query.context as AttendanceContext | undefined;
    const from = req.query.from ? new Date(req.query.from as string) : undefined;
    const to = req.query.to ? new Date(req.query.to as string) : undefined;

    if (studentId) await assertStudentAccess(req.auth!, studentId);

    const where: Record<string, unknown> = {
      ...(studentId ? { studentId } : {}),
      ...(sessionId ? { sessionId } : {}),
      ...(examId ? { examId } : {}),
      ...(context ? { context } : {}),
      ...(batchId ? { student: { currentBatchId: batchId } } : {}),
      ...(from || to ? { markedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    };

    if (req.auth!.role === RoleName.FACULTY && !studentId) {
      where.student = { currentBatchId: { in: await getFacultyBatchIds(req.auth!.facultyId!) } };
    } else if (req.auth!.role === RoleName.STUDENT && !studentId) {
      where.studentId = req.auth!.studentId;
    } else if (req.auth!.role === RoleName.PARENT && !studentId) {
      where.studentId = { in: await getParentStudentIds(req.auth!.parentId!) };
    }

    const records = await prisma.attendance.findMany({
      where,
      orderBy: { markedAt: 'desc' },
      take: 500,
      include: { student: { select: { id: true, firstName: true, lastName: true, studentCode: true } }, session: true, exam: true },
    });
    res.json(records);
  }),
);

/** Attendance %, threshold alert, consecutive-absence detection, and lecture/practice hour totals for one student. */
attendanceRouter.get(
  '/student/:studentId/summary',
  asyncHandler(async (req, res) => {
    await assertStudentAccess(req.auth!, req.params.studentId);
    const config = await getScoringConfig();
    const [records, approvedLeaves] = await Promise.all([
      prisma.attendance.findMany({
        where: { studentId: req.params.studentId, context: AttendanceContext.SESSION },
        orderBy: { markedAt: 'desc' },
        include: { session: { select: { sessionDate: true, sessionType: true, durationMinutes: true } } },
      }),
      prisma.leaveRecord.findMany({ where: { studentId: req.params.studentId, status: 'APPROVED' } }),
    ]);

    // An approved leave neutralises the denominator: sessions inside the leave window don't count either way.
    const onLeave = (date: Date | undefined) =>
      !!date && approvedLeaves.some((l) => date >= l.startDate && date <= l.endDate);
    const countable = records.filter((r) => !onLeave(r.session?.sessionDate));

    const present = countable.filter((r) => r.status === AttendanceStatus.PRESENT || r.status === AttendanceStatus.LATE).length;
    const pct = countable.length > 0 ? (present / countable.length) * 100 : 0;

    let consecutiveAbsences = 0;
    for (const r of countable) {
      if (r.status === AttendanceStatus.ABSENT) consecutiveAbsences += 1;
      else break;
    }

    const attendedMinutesByType = { lectureMinutes: 0, practiceMinutes: 0 };
    for (const r of countable) {
      if (r.status !== AttendanceStatus.PRESENT && r.status !== AttendanceStatus.LATE) continue;
      if (r.session?.sessionType === 'LECTURE') attendedMinutesByType.lectureMinutes += r.session.durationMinutes;
      if (r.session?.sessionType === 'PRACTICE') attendedMinutesByType.practiceMinutes += r.session.durationMinutes;
    }

    res.json({
      totalSessions: countable.length,
      presentCount: present,
      attendancePct: Math.round(pct * 10) / 10,
      belowThreshold: pct < config.attendanceThreshold,
      threshold: config.attendanceThreshold,
      consecutiveAbsences,
      consecutiveAbsenceAlert: consecutiveAbsences >= 3,
      lectureHours: Math.round((attendedMinutesByType.lectureMinutes / 60) * 10) / 10,
      practiceHours: Math.round((attendedMinutesByType.practiceMinutes / 60) * 10) / 10,
      onLeaveSessionsExcluded: records.length - countable.length,
      recent: records.slice(0, 10),
    });
  }),
);

const correctionSchema = z.object({ status: z.nativeEnum(AttendanceStatus), reason: z.string().min(3) });

/** Attendance correction workflow: recent edits by staff, older edits require admin approval. Always audited. */
attendanceRouter.patch(
  '/:id/correct',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const { status, reason } = correctionSchema.parse(req.body);
    const record = await prisma.attendance.findUnique({ where: { id: req.params.id } });
    if (!record) throw ApiError.notFound('Attendance record not found');

    const config = await getScoringConfig();
    const hoursSinceMarked = (Date.now() - record.markedAt.getTime()) / (1000 * 60 * 60);
    const isStaleEdit = hoursSinceMarked > config.attendanceCorrectionWindowHours;
    if (isStaleEdit && req.auth!.role === RoleName.FACULTY) {
      throw ApiError.forbidden(`Corrections after ${config.attendanceCorrectionWindowHours}h require admin approval`);
    }

    const updated = await prisma.attendance.update({
      where: { id: record.id },
      data: {
        status,
        isCorrected: true,
        originalStatus: record.originalStatus ?? record.status,
        correctedById: req.auth!.userId,
        correctedAt: new Date(),
        correctionReason: reason,
      },
    });

    await recordAudit({
      entityType: 'Attendance',
      entityId: record.id,
      action: 'CORRECT',
      actorId: req.auth!.userId,
      oldValue: { status: record.status },
      newValue: { status },
      reason,
    });

    res.json(updated);
  }),
);

// ---------------------------------------------------------------------------
// Leave records — an approved leave neutralises the attendance-percentage denominator for its dates.
// ---------------------------------------------------------------------------

const leaveRecordSchema = z.object({
  studentId: z.string(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  reason: z.string().min(3),
});

attendanceRouter.post(
  '/leave',
  asyncHandler(async (req, res) => {
    const data = leaveRecordSchema.parse(req.body);
    await assertStudentAccess(req.auth!, data.studentId);
    const record = await prisma.leaveRecord.create({ data });
    res.status(201).json(record);
  }),
);

attendanceRouter.get(
  '/leave',
  asyncHandler(async (req, res) => {
    const studentId = req.query.studentId as string | undefined;
    if (studentId) await assertStudentAccess(req.auth!, studentId);
    const where: Record<string, unknown> = studentId ? { studentId } : {};
    if (req.auth!.role === RoleName.STUDENT && !studentId) where.studentId = req.auth!.studentId;
    if (req.auth!.role === RoleName.PARENT && !studentId) where.studentId = { in: await getParentStudentIds(req.auth!.parentId!) };
    const records = await prisma.leaveRecord.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json(records);
  }),
);

const leaveDecisionSchema = z.object({ status: z.enum(['APPROVED', 'REJECTED']) });

attendanceRouter.patch(
  '/leave/:id/decide',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const { status } = leaveDecisionSchema.parse(req.body);
    const record = await prisma.leaveRecord.update({
      where: { id: req.params.id },
      data: { status, approvedById: req.auth!.userId, approvedAt: new Date() },
    });
    res.json(record);
  }),
);

// ---------------------------------------------------------------------------
// Attendance exception queue — biometric scans that could not be matched to a student.
// ---------------------------------------------------------------------------

attendanceRouter.get(
  '/exceptions',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (_req, res) => {
    const exceptions = await prisma.attendanceExceptionRecord.findMany({ where: { resolvedAt: null }, orderBy: { scannedAt: 'desc' } });
    res.json(exceptions);
  }),
);

const logExceptionSchema = z.object({ deviceId: z.string().optional(), rawScanId: z.string().optional(), note: z.string().optional() });

/** Ingests an unmatched biometric scan for manual resolution — the software side of the exception queue. */
attendanceRouter.post(
  '/exceptions',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    const data = logExceptionSchema.parse(req.body);
    const record = await prisma.attendanceExceptionRecord.create({ data });
    res.status(201).json(record);
  }),
);

const resolveExceptionSchema = z.object({ studentId: z.string() });

attendanceRouter.patch(
  '/exceptions/:id/resolve',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    const { studentId } = resolveExceptionSchema.parse(req.body);
    const record = await prisma.attendanceExceptionRecord.update({
      where: { id: req.params.id },
      data: { resolvedById: req.auth!.userId, resolvedAt: new Date(), resolvedAsStudentId: studentId },
    });
    res.json(record);
  }),
);
