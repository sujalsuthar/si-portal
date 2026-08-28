import { Router } from 'express';
import {
  InterventionSeverity,
  InterventionStatus,
  InterventionTrigger,
  StudentStatus,
  AttendanceContext,
  AttendanceStatus,
  GradeStatus,
  TaskStatus,
  NotificationCategory,
  PointType,
} from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate, authorize, ROLE_GROUPS } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/apiError';
import { recordAudit } from '@/lib/audit';
import { getScoringConfig } from '@/lib/scoring';
import { notify, notifyStudentParents } from '@/lib/notify';

export const interventionsRouter = Router();
interventionsRouter.use(authenticate, authorize(...ROLE_GROUPS.STAFF));

const createSchema = z.object({
  studentId: z.string(),
  severity: z.nativeEnum(InterventionSeverity),
  triggerType: z.nativeEnum(InterventionTrigger),
  triggerReason: z.string().min(3),
  assignedFacultyId: z.string().optional(),
  followUpDate: z.coerce.date().optional(),
});

interventionsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const status = req.query.status as InterventionStatus | undefined;
    const severity = req.query.severity as InterventionSeverity | undefined;
    const studentId = req.query.studentId as string | undefined;
    const assignedFacultyId = req.query.assignedFacultyId as string | undefined;
    const cases = await prisma.interventionCase.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(severity ? { severity } : {}),
        ...(studentId ? { studentId } : {}),
        ...(assignedFacultyId ? { assignedFacultyId } : {}),
      },
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      include: {
        student: { select: { id: true, firstName: true, lastName: true, studentCode: true, currentBatch: { select: { name: true } } } },
        assignedFaculty: { select: { firstName: true, lastName: true } },
      },
    });
    res.json(cases);
  }),
);

interventionsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const item = await prisma.interventionCase.findUnique({
      where: { id: req.params.id },
      include: { student: true, assignedFaculty: true, notes: { orderBy: { createdAt: 'desc' } } },
    });
    if (!item) throw ApiError.notFound('Case not found');
    res.json(item);
  }),
);

interventionsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    const item = await prisma.interventionCase.create({ data });
    await recordAudit({ entityType: 'InterventionCase', entityId: item.id, action: 'CREATE', actorId: req.auth!.userId, newValue: data });
    res.status(201).json(item);
  }),
);

const updateSchema = z.object({
  status: z.nativeEnum(InterventionStatus).optional(),
  severity: z.nativeEnum(InterventionSeverity).optional(),
  assignedFacultyId: z.string().optional(),
  followUpDate: z.coerce.date().optional(),
});

interventionsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = updateSchema.parse(req.body);
    const before = await prisma.interventionCase.findUnique({ where: { id: req.params.id } });
    if (!before) throw ApiError.notFound('Case not found');
    const item = await prisma.interventionCase.update({
      where: { id: req.params.id },
      data: { ...data, resolvedAt: data.status === InterventionStatus.RESOLVED ? new Date() : before.resolvedAt },
    });
    await recordAudit({ entityType: 'InterventionCase', entityId: item.id, action: 'UPDATE', actorId: req.auth!.userId, oldValue: before, newValue: data });
    res.json(item);
  }),
);

interventionsRouter.post(
  '/:id/notes',
  asyncHandler(async (req, res) => {
    const { note } = z.object({ note: z.string().min(1) }).parse(req.body);
    const created = await prisma.interventionNote.create({ data: { caseId: req.params.id, authorId: req.auth!.userId, note } });
    res.status(201).json(created);
  }),
);

interventionsRouter.patch(
  '/:id/notify-parent',
  asyncHandler(async (req, res) => {
    const item = await prisma.interventionCase.findUnique({ where: { id: req.params.id } });
    if (!item) throw ApiError.notFound('Case not found');
    await notifyStudentParents(item.studentId, {
      category: NotificationCategory.GENERAL,
      title: 'Faculty follow-up requested',
      message: 'A faculty member would like to discuss your child\'s recent progress. Please check with the academic office.',
    });
    const updated = await prisma.interventionCase.update({ where: { id: item.id }, data: { parentNotified: true, parentNotifiedAt: new Date() } });
    res.json(updated);
  }),
);

/** Scans active students for early-warning trigger conditions and opens/keeps cases in sync. Skips students who already have an open case for the same trigger. */
interventionsRouter.post(
  '/auto-detect',
  authorize(...ROLE_GROUPS.MANAGEMENT_LIKE),
  asyncHandler(async (req, res) => {
    const config = await getScoringConfig();
    const students = await prisma.student.findMany({ where: { status: StudentStatus.ACTIVE } });
    const created = [];

    for (const student of students) {
      const openCases = await prisma.interventionCase.findMany({
        where: { studentId: student.id, status: { in: [InterventionStatus.OPEN, InterventionStatus.IN_PROGRESS] } },
      });
      const openTriggerTypes = new Set(openCases.map((c) => c.triggerType));

      const attendances = await prisma.attendance.findMany({ where: { studentId: student.id, context: AttendanceContext.SESSION } });
      if (attendances.length >= 5 && !openTriggerTypes.has(InterventionTrigger.LOW_ATTENDANCE)) {
        const present = attendances.filter((a) => a.status === AttendanceStatus.PRESENT || a.status === AttendanceStatus.LATE).length;
        const pct = (present / attendances.length) * 100;
        if (pct < config.attendanceThreshold) {
          created.push(
            await prisma.interventionCase.create({
              data: {
                studentId: student.id,
                severity: pct < config.attendanceThreshold - 20 ? InterventionSeverity.HIGH : InterventionSeverity.MEDIUM,
                triggerType: InterventionTrigger.LOW_ATTENDANCE,
                triggerReason: `Attendance at ${pct.toFixed(1)}%, below threshold of ${config.attendanceThreshold}%`,
                assignedFacultyId: student.mentorFacultyId,
              },
            }),
          );
        }
      }

      const grades = await prisma.grade.findMany({ where: { studentId: student.id, status: GradeStatus.PUBLISHED } });
      if (grades.length >= 2 && !openTriggerTypes.has(InterventionTrigger.FAILING_GRADES)) {
        const failing = grades.filter((g) => !g.passed).length;
        if (failing / grades.length >= 0.5) {
          created.push(
            await prisma.interventionCase.create({
              data: {
                studentId: student.id,
                severity: InterventionSeverity.HIGH,
                triggerType: InterventionTrigger.FAILING_GRADES,
                triggerReason: `Failed ${failing} of ${grades.length} published exams`,
                assignedFacultyId: student.mentorFacultyId,
              },
            }),
          );
        }
      }

      const assignments = await prisma.taskAssignment.findMany({ where: { studentId: student.id } });
      if (assignments.length >= 3 && !openTriggerTypes.has(InterventionTrigger.OVERDUE_TASKS)) {
        const submissions = await prisma.taskSubmission.findMany({ where: { studentId: student.id, taskId: { in: assignments.map((a) => a.taskId) } } });
        const overdue = submissions.filter((s) => s.status === TaskStatus.NOT_STARTED || s.status === TaskStatus.IN_PROGRESS || s.status === TaskStatus.LATE).length;
        if (overdue >= 3) {
          created.push(
            await prisma.interventionCase.create({
              data: {
                studentId: student.id,
                severity: InterventionSeverity.MEDIUM,
                triggerType: InterventionTrigger.OVERDUE_TASKS,
                triggerReason: `${overdue} overdue or late tasks`,
                assignedFacultyId: student.mentorFacultyId,
              },
            }),
          );
        }
      }

      // Three or more authorized negative behaviour points within the current calendar month.
      if (!openTriggerTypes.has(InterventionTrigger.BEHAVIOUR_CONCERN)) {
        const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const negativeEvents = await prisma.behaviourEvent.findMany({
          where: { studentId: student.id, type: PointType.NEGATIVE, authorizedById: { not: null }, eventDate: { gte: monthStart } },
        });
        if (negativeEvents.length >= 3) {
          created.push(
            await prisma.interventionCase.create({
              data: {
                studentId: student.id,
                severity: negativeEvents.length >= 5 ? InterventionSeverity.HIGH : InterventionSeverity.MEDIUM,
                triggerType: InterventionTrigger.BEHAVIOUR_CONCERN,
                triggerReason: `${negativeEvents.length} negative behaviour points recorded this month`,
                assignedFacultyId: student.mentorFacultyId,
              },
            }),
          );
        }
      }
    }

    for (const c of created) {
      await recordAudit({ entityType: 'InterventionCase', entityId: c.id, action: 'AUTO_DETECT', actorId: req.auth!.userId, newValue: c });
    }

    res.status(201).json({ createdCount: created.length, cases: created });
  }),
);
