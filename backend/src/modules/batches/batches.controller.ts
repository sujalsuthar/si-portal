import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { RoleName, BatchStatus, AttendanceContext, AttendanceStatus, GradeStatus, TaskStatus, BackupType, ActionRequestStatus, StudentStatus } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate, authorize, ROLE_GROUPS } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { getPagination, paginatedResult } from '@/utils/pagination';
import { recordAudit } from '@/lib/audit';
import { ApiError } from '@/utils/apiError';
import { assertBatchAccess, getFacultyBatchIds, getParentStudentIds } from '@/utils/scope';
import { getScoringConfig, computeStudentComposite } from '@/lib/scoring';
import { env } from '@/config/env';
import { computeOutstanding } from '@/modules/fees/fees.controller';

export const batchesRouter = Router();
batchesRouter.use(authenticate);

const BACKUP_DIR = path.resolve(process.cwd(), env.uploadDir, 'backups');
fs.mkdirSync(BACKUP_DIR, { recursive: true });

const batchSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  courseId: z.string(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  capacity: z.number().int().positive().optional(),
});

batchesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const pagination = getPagination(req, 50);
    const courseId = req.query.courseId as string | undefined;
    const status = req.query.status as BatchStatus | undefined;
    const where: Record<string, unknown> = {
      ...(courseId ? { courseId } : {}),
      ...(status ? { status } : {}),
    };
    if (req.auth!.role === RoleName.FACULTY) {
      where.id = { in: await getFacultyBatchIds(req.auth!.facultyId!) };
    }
    const [items, total] = await Promise.all([
      prisma.batch.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { startDate: 'desc' },
        include: { course: { select: { id: true, name: true } }, _count: { select: { students: true } } },
      }),
      prisma.batch.count({ where }),
    ]);
    res.json(paginatedResult(items, total, pagination));
  }),
);

batchesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const batch = await prisma.batch.findUnique({
      where: { id: req.params.id },
      include: {
        course: true,
        facultyAssignments: { include: { faculty: { select: { id: true, firstName: true, lastName: true } } } },
        timetableSlots: { include: { faculty: { select: { id: true, firstName: true, lastName: true } } } },
        _count: { select: { students: true } },
      },
    });
    if (!batch) throw ApiError.notFound('Batch not found');

    if (req.auth!.role === RoleName.FACULTY) {
      await assertBatchAccess(req.auth!, batch.id);
    } else if (req.auth!.role === RoleName.STUDENT) {
      const student = await prisma.student.findUnique({ where: { id: req.auth!.studentId! }, select: { currentBatchId: true } });
      if (student?.currentBatchId !== batch.id) throw ApiError.forbidden('You may only view your own batch');
    } else if (req.auth!.role === RoleName.PARENT) {
      const studentIds = await getParentStudentIds(req.auth!.parentId!);
      const linked = await prisma.student.findMany({ where: { id: { in: studentIds } }, select: { currentBatchId: true } });
      if (!linked.some((s) => s.currentBatchId === batch.id)) throw ApiError.forbidden('You may only view batches your children belong to');
    }

    const config = await getScoringConfig();
    const ageYears = (Date.now() - batch.startDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    res.json({ ...batch, eligibleForFinalBackup: ageYears >= config.batchRetentionYears });
  }),
);

/**
 * A batch past the configured retention age (default 2 years) can be archived one final time
 * before any future retention job removes its data — a full export of everything tied to the
 * batch, kept as a durable record separate from the live tables.
 */
batchesRouter.post(
  '/:id/final-backup',
  authorize(RoleName.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const batch = await prisma.batch.findUnique({ where: { id: req.params.id }, include: { course: true } });
    if (!batch) throw ApiError.notFound('Batch not found');

    const config = await getScoringConfig();
    const ageYears = (Date.now() - batch.startDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    if (ageYears < config.batchRetentionYears) {
      throw ApiError.badRequest(`This batch is not yet past the ${config.batchRetentionYears}-year retention mark`);
    }

    const students = await prisma.student.findMany({ where: { currentBatchId: batch.id } });
    const studentIds = students.map((s) => s.id);

    const [attendances, grades, taskSubmissions, behaviourEvents, presentations, certificates, transfers] = await Promise.all([
      prisma.attendance.findMany({ where: { studentId: { in: studentIds } } }),
      prisma.grade.findMany({ where: { studentId: { in: studentIds } } }),
      prisma.taskSubmission.findMany({ where: { studentId: { in: studentIds } } }),
      prisma.behaviourEvent.findMany({ where: { studentId: { in: studentIds } } }),
      prisma.presentation.findMany({ where: { batchId: batch.id } }),
      prisma.certificate.findMany({ where: { batchId: batch.id } }),
      prisma.batchTransfer.findMany({ where: { OR: [{ fromBatchId: batch.id }, { toBatchId: batch.id }] } }),
    ]);

    const archive = { batch, course: batch.course, students, attendances, grades, taskSubmissions, behaviourEvents, presentations, certificates, transfers, exportedAt: new Date() };

    const filename = `batch-archive-${batch.code}-${new Date().toISOString().slice(0, 10)}.json`;
    const filePath = path.join(BACKUP_DIR, filename);
    const content = JSON.stringify(archive, null, 2);
    fs.writeFileSync(filePath, content);

    const record = await prisma.backupRecord.create({
      data: { filename, sizeBytes: Buffer.byteLength(content), type: BackupType.BATCH_ARCHIVE, batchId: batch.id, triggeredById: req.auth!.userId },
    });
    await recordAudit({ entityType: 'Batch', entityId: batch.id, action: 'FINAL_BACKUP', actorId: req.auth!.userId, newValue: { filename, recordCount: students.length } });

    res.status(201).json(record);
  }),
);

batchesRouter.post(
  '/',
  authorize(RoleName.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const data = batchSchema.parse(req.body);
    const batch = await prisma.batch.create({ data });
    await recordAudit({ entityType: 'Batch', entityId: batch.id, action: 'CREATE', actorId: req.auth!.userId, newValue: data });
    res.status(201).json(batch);
  }),
);

batchesRouter.put(
  '/:id',
  authorize(RoleName.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const data = batchSchema.partial().parse(req.body);
    const before = await prisma.batch.findUnique({ where: { id: req.params.id } });
    if (!before) throw ApiError.notFound('Batch not found');
    const batch = await prisma.batch.update({ where: { id: req.params.id }, data });
    await recordAudit({ entityType: 'Batch', entityId: batch.id, action: 'UPDATE', actorId: req.auth!.userId, oldValue: before, newValue: data });
    res.json(batch);
  }),
);

const archiveSchema = z.object({ overrideReason: z.string().min(3).optional() });

/**
 * Blocks archiving a batch while any of its active students carry an outstanding fee balance or
 * an open Action Centre request (UR-BAT-04). Super Admin may bypass with a documented reason.
 */
batchesRouter.patch(
  '/:id/archive',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    const { overrideReason } = archiveSchema.parse(req.body ?? {});
    const students = await prisma.student.findMany({ where: { currentBatchId: req.params.id, status: StudentStatus.ACTIVE }, select: { id: true } });
    const studentIds = students.map((s) => s.id);

    const blockers: string[] = [];
    if (studentIds.length > 0) {
      const feeAccounts = await prisma.feeAccount.findMany({ where: { studentId: { in: studentIds } } });
      const outstandingCount = (await Promise.all(feeAccounts.map((fa) => computeOutstanding(fa.id)))).filter((o) => o > 0).length;
      if (outstandingCount > 0) blockers.push(`${outstandingCount} student(s) have an outstanding fee balance`);

      const openRequests = await prisma.actionRequest.count({ where: { targetStudentId: { in: studentIds }, status: ActionRequestStatus.PENDING } });
      if (openRequests > 0) blockers.push(`${openRequests} open Action Centre request(s) on students in this batch`);
    }

    if (blockers.length > 0) {
      const canOverride = req.auth!.role === RoleName.SUPER_ADMIN && !!overrideReason;
      if (!canOverride) {
        throw ApiError.badRequest(`Cannot archive: ${blockers.join('; ')}. Only Super Admin may override this, with a reason.`);
      }
    }

    const batch = await prisma.batch.update({ where: { id: req.params.id }, data: { status: BatchStatus.ARCHIVED } });
    await recordAudit({
      entityType: 'Batch',
      entityId: batch.id,
      action: 'ARCHIVE',
      actorId: req.auth!.userId,
      reason: overrideReason,
      newValue: blockers.length > 0 ? { overriddenBlockers: blockers } : undefined,
    });
    res.json(batch);
  }),
);

const assignFacultySchema = z.object({ facultyId: z.string(), subject: z.string().optional() });

batchesRouter.post(
  '/:id/faculty',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    const { facultyId, subject } = assignFacultySchema.parse(req.body);
    const assignment = await prisma.batchFacultyAssignment.create({ data: { batchId: req.params.id, facultyId, subject } });
    await recordAudit({ entityType: 'Batch', entityId: req.params.id, action: 'ASSIGN_FACULTY', actorId: req.auth!.userId, newValue: { facultyId, subject } });
    res.status(201).json(assignment);
  }),
);

batchesRouter.delete(
  '/:id/faculty/:assignmentId',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    await prisma.batchFacultyAssignment.delete({ where: { id: req.params.assignmentId } });
    await recordAudit({ entityType: 'Batch', entityId: req.params.id, action: 'UNASSIGN_FACULTY', actorId: req.auth!.userId });
    res.status(204).end();
  }),
);

const timetableSlotSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    subject: z.string().min(1),
    facultyId: z.string().optional(),
    room: z.string().optional(),
    meetingLink: z.string().url().optional(),
  })
  .refine((d) => d.dayOfWeek === 0 || !d.meetingLink, { message: 'A meeting link may only be set on the Sunday (dayOfWeek=0) slot' });

batchesRouter.post(
  '/:id/timetable',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    const data = timetableSlotSchema.parse(req.body);
    const slot = await prisma.timetableSlot.create({ data: { ...data, batchId: req.params.id } });
    res.status(201).json(slot);
  }),
);

batchesRouter.delete(
  '/timetable/:slotId',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    await prisma.timetableSlot.delete({ where: { id: req.params.slotId } });
    res.status(204).end();
  }),
);

/** Replaces the batch's entire weekly timetable in one operation instead of adding slots one at a time. */
batchesRouter.put(
  '/:id/timetable',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    const { slots } = z.object({ slots: z.array(timetableSlotSchema) }).parse(req.body);
    await prisma.timetableSlot.deleteMany({ where: { batchId: req.params.id } });
    await prisma.timetableSlot.createMany({ data: slots.map((s) => ({ ...s, batchId: req.params.id })) });
    const created = await prisma.timetableSlot.findMany({ where: { batchId: req.params.id }, orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] });
    res.status(201).json(created);
  }),
);

/** Batch performance dashboard summary — section 10 of the spec. */
batchesRouter.get(
  '/:id/summary',
  asyncHandler(async (req, res) => {
    if (req.auth!.role === RoleName.FACULTY) await assertBatchAccess(req.auth!, req.params.id);
    const batchId = req.params.id;

    const [batch, studentCount, attendances, grades, taskAssignments, taskSubmissions, behaviourEvents, presentations, certifications] =
      await Promise.all([
        prisma.batch.findUnique({ where: { id: batchId }, include: { course: true } }),
        prisma.student.count({ where: { currentBatchId: batchId, status: 'ACTIVE' } }),
        prisma.attendance.findMany({ where: { student: { currentBatchId: batchId }, context: AttendanceContext.SESSION } }),
        prisma.grade.findMany({ where: { exam: { batchId }, status: GradeStatus.PUBLISHED } }),
        prisma.taskAssignment.findMany({ where: { student: { currentBatchId: batchId } } }),
        prisma.taskSubmission.findMany({ where: { student: { currentBatchId: batchId } } }),
        prisma.behaviourEvent.findMany({ where: { student: { currentBatchId: batchId } } }),
        prisma.presentation.findMany({ where: { batchId } }),
        prisma.certification.findMany({ where: { student: { currentBatchId: batchId } } }),
      ]);

    if (!batch) throw ApiError.notFound('Batch not found');

    const avgAttendance =
      attendances.length > 0
        ? (attendances.filter((a) => a.status === AttendanceStatus.PRESENT || a.status === AttendanceStatus.LATE).length / attendances.length) * 100
        : 0;
    const avgExamScore = grades.length > 0 ? grades.reduce((s, g) => s + g.percentage, 0) / grades.length : 0;
    const taskCompletion =
      taskAssignments.length > 0
        ? (taskSubmissions.filter((s) => s.status === TaskStatus.EVALUATED || s.status === TaskStatus.SUBMITTED).length / taskAssignments.length) * 100
        : 0;
    const behaviourAvg = 8.2; // placeholder baseline
    const behaviourPoints = behaviourEvents.reduce((s, e) => s + e.points, 0);
    const presentationCompletion =
      presentations.length > 0 ? (presentations.filter((p) => p.status === 'COMPLETED').length / presentations.length) * 100 : 0;
    const certificationProgress = {
      passed: certifications.filter((c) => c.status === 'PASSED').length,
      total: certifications.length,
    };

    res.json({
      batch,
      strength: studentCount,
      averageAttendancePct: Math.round(avgAttendance * 10) / 10,
      averageExamScorePct: Math.round(avgExamScore * 10) / 10,
      taskCompletionPct: Math.round(taskCompletion * 10) / 10,
      behaviourPointsNet: behaviourPoints,
      behaviourAvgOutOf10: behaviourAvg,
      presentationCompletionPct: Math.round(presentationCompletion * 10) / 10,
      certificationProgress,
    });
  }),
);

const bulkAddStudentsSchema = z.object({ studentIds: z.array(z.string()).min(1) });

/** Bulk-add: assigns multiple existing students to this batch in one action instead of one-by-one. */
batchesRouter.post(
  '/:id/students/bulk-add',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    const { studentIds } = bulkAddStudentsSchema.parse(req.body);
    const batch = await prisma.batch.findUnique({ where: { id: req.params.id } });
    if (!batch) throw ApiError.notFound('Batch not found');

    const { count } = await prisma.student.updateMany({ where: { id: { in: studentIds } }, data: { currentBatchId: batch.id, courseId: batch.courseId } });
    await recordAudit({ entityType: 'Batch', entityId: batch.id, action: 'BULK_ADD_STUDENTS', actorId: req.auth!.userId, newValue: { studentIds } });
    res.status(201).json({ addedCount: count });
  }),
);

/** Per-batch ranking dashboard — active students ordered by composite score, highest first. */
batchesRouter.get(
  '/:id/ranking',
  asyncHandler(async (req, res) => {
    if (req.auth!.role === RoleName.FACULTY) await assertBatchAccess(req.auth!, req.params.id);
    const students = await prisma.student.findMany({
      where: { currentBatchId: req.params.id, status: StudentStatus.ACTIVE },
      select: { id: true, firstName: true, lastName: true, studentCode: true, photoUrl: true },
    });
    const ranked = await Promise.all(
      students.map(async (s) => ({ ...s, composite: Math.round((await computeStudentComposite(s.id)).composite * 10) / 10 })),
    );
    ranked.sort((a, b) => b.composite - a.composite);
    res.json(ranked);
  }),
);
