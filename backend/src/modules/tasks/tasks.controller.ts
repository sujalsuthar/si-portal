import { Router } from 'express';
import { RoleName, TaskStatus, NotificationCategory } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate, authorize, ROLE_GROUPS } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { getPagination, paginatedResult } from '@/utils/pagination';
import { ApiError } from '@/utils/apiError';
import { getParentStudentIds } from '@/utils/scope';
import { notify, notifyStudentParents } from '@/lib/notify';
import { uploadAttachment, publicUploadUrl } from '@/middleware/upload';
import { recordAudit } from '@/lib/audit';

export const tasksRouter = Router();
tasksRouter.use(authenticate);

const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  instructions: z.string().optional(),
  batchId: z.string().optional(),
  sessionId: z.string().optional(),
  dueDate: z.coerce.date(),
  points: z.number().int().min(0).default(0),
  gracePeriodHours: z.number().int().min(0).optional(),
  lateDeductionRate: z.number().min(0).max(1).default(0),
  studentIds: z.array(z.string()).optional(), // if omitted and batchId given, assigns to whole batch
});

function displayStatus(status: TaskStatus) {
  if (status === TaskStatus.LATE) return 'Late';
  if (status === TaskStatus.SUBMITTED || status === TaskStatus.EVALUATED) return 'Completed';
  return 'Not Submitted';
}

tasksRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const pagination = getPagination(req);
    const batchId = req.query.batchId as string | undefined;

    const where: Record<string, unknown> = { ...(batchId ? { batchId } : {}) };
    let relevantStudentIds: string[] | undefined;

    if (req.auth!.role === RoleName.STUDENT) {
      relevantStudentIds = [req.auth!.studentId!];
      where.assignments = { some: { studentId: req.auth!.studentId } };
    } else if (req.auth!.role === RoleName.PARENT) {
      relevantStudentIds = await getParentStudentIds(req.auth!.parentId!);
      where.assignments = { some: { studentId: { in: relevantStudentIds } } };
    } else if (req.auth!.role === RoleName.FACULTY) {
      where.createdById = req.auth!.userId;
    }

    const [items, total] = await Promise.all([
      prisma.task.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { dueDate: 'desc' },
        include: {
          batch: { select: { id: true, name: true } },
          _count: { select: { assignments: true, submissions: true } },
          ...(relevantStudentIds
            ? { submissions: { where: { studentId: { in: relevantStudentIds } }, select: { status: true } } }
            : {}),
        },
      }),
      prisma.task.count({ where }),
    ]);

    const withStatus = relevantStudentIds
      ? items.map((t: any) => ({ ...t, status: t.submissions?.[0] ? displayStatus(t.submissions[0].status) : 'Not Submitted' }))
      : items;
    res.json(paginatedResult(withStatus, total, pagination));
  }),
);

tasksRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: {
        batch: true,
        assignments: { include: { student: { select: { id: true, firstName: true, lastName: true, studentCode: true } } } },
        submissions: { include: { student: { select: { id: true, firstName: true, lastName: true, studentCode: true } } } },
      },
    });
    if (!task) throw ApiError.notFound('Task not found');

    // Students track completion, not the points awarded for a submission — that stays staff-only.
    if (req.auth!.role === RoleName.STUDENT) {
      task.submissions = task.submissions.map((s) => ({ ...s, pointsAwarded: null }));
    }

    res.json(task);
  }),
);

tasksRouter.post(
  '/',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const data = createTaskSchema.parse(req.body);

    let studentIds = data.studentIds ?? [];
    if (studentIds.length === 0 && data.batchId) {
      const students = await prisma.student.findMany({ where: { currentBatchId: data.batchId, status: 'ACTIVE' }, select: { id: true } });
      studentIds = students.map((s) => s.id);
    }
    if (studentIds.length === 0) throw ApiError.badRequest('Provide studentIds or a batchId with active students');

    const task = await prisma.task.create({
      data: {
        title: data.title,
        description: data.description,
        instructions: data.instructions,
        batchId: data.batchId,
        sessionId: data.sessionId,
        dueDate: data.dueDate,
        points: data.points,
        gracePeriodHours: data.gracePeriodHours,
        lateDeductionRate: data.lateDeductionRate,
        createdById: req.auth!.userId,
        assignments: { createMany: { data: studentIds.map((studentId) => ({ studentId })) } },
        submissions: {
          createMany: { data: studentIds.map((studentId) => ({ studentId, status: TaskStatus.NOT_STARTED })) },
        },
      },
      include: { assignments: true },
    });
    await recordAudit({ entityType: 'Task', entityId: task.id, action: 'CREATE', actorId: req.auth!.userId, newValue: { title: data.title, batchId: data.batchId, studentCount: studentIds.length } });

    for (const studentId of studentIds) {
      const student = await prisma.student.findUnique({ where: { id: studentId } });
      if (student) {
        await notify({
          userId: student.userId,
          category: NotificationCategory.TASK,
          title: 'New task assigned',
          message: `"${data.title}" is due ${data.dueDate.toDateString()}.`,
        });
      }
    }

    res.status(201).json(task);
  }),
);

tasksRouter.put(
  '/:id',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const data = createTaskSchema.omit({ studentIds: true }).partial().parse(req.body);
    const task = await prisma.task.update({ where: { id: req.params.id }, data });
    res.json(task);
  }),
);

const submitSchema = z.object({ submissionText: z.string().optional() });

tasksRouter.post(
  '/:id/submit',
  authorize(RoleName.STUDENT),
  uploadAttachment.single('attachment'),
  asyncHandler(async (req, res) => {
    const { submissionText } = submitSchema.parse(req.body);
    const task = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!task) throw ApiError.notFound('Task not found');

    const submission = await prisma.taskSubmission.findFirst({ where: { taskId: task.id, studentId: req.auth!.studentId! } });
    if (!submission) throw ApiError.forbidden('This task is not assigned to you');

    const self = await prisma.student.findUnique({ where: { id: req.auth!.studentId! }, select: { internFrozen: true, internFrozenReason: true } });
    if (self?.internFrozen) {
      throw ApiError.forbidden(`Your internship work is paused pending review: ${self.internFrozenReason ?? 'performance below threshold'}`);
    }

    const isLate = new Date() > task.dueDate;
    const file = req.file as Express.Multer.File | undefined;

    // A resubmission overwrites the live record; preserve what was there before as history.
    if (submission.submittedAt && (submission.submissionText || submission.attachmentUrl)) {
      await prisma.taskSubmissionVersion.create({
        data: {
          submissionId: submission.id,
          submissionText: submission.submissionText,
          attachmentUrl: submission.attachmentUrl,
        },
      });
    }

    const updated = await prisma.taskSubmission.update({
      where: { id: submission.id },
      data: {
        submissionText,
        attachmentUrl: file ? publicUploadUrl('attachments', file.filename) : submission.attachmentUrl,
        submittedAt: new Date(),
        status: isLate ? TaskStatus.LATE : TaskStatus.SUBMITTED,
      },
    });
    await recordAudit({ entityType: 'TaskSubmission', entityId: submission.id, action: 'SUBMIT', actorId: req.auth!.userId, newValue: { status: updated.status } });
    res.json(updated);
  }),
);

const evaluateSchema = z.object({
  pointsAwarded: z.number().min(0),
  feedback: z.string().optional(),
});

/** Final score = max(0, raw − (whole days overdue after grace × daily deduction rate)). */
tasksRouter.patch(
  '/submissions/:submissionId/evaluate',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const { pointsAwarded: rawPoints, feedback } = evaluateSchema.parse(req.body);
    const submission = await prisma.taskSubmission.findUnique({ where: { id: req.params.submissionId }, include: { task: true, student: true } });
    if (!submission) throw ApiError.notFound('Submission not found');

    let pointsAwarded = rawPoints;
    if (submission.submittedAt && submission.task.lateDeductionRate > 0) {
      const graceMs = (submission.task.gracePeriodHours ?? 0) * 60 * 60 * 1000;
      const lateMs = submission.submittedAt.getTime() - submission.task.dueDate.getTime() - graceMs;
      if (lateMs > 0) {
        const daysLate = Math.ceil(lateMs / (24 * 60 * 60 * 1000));
        pointsAwarded = Math.max(0, rawPoints - daysLate * submission.task.lateDeductionRate);
      }
    }

    const updated = await prisma.taskSubmission.update({
      where: { id: submission.id },
      data: {
        pointsAwarded,
        feedback,
        status: TaskStatus.EVALUATED,
        evaluatedById: req.auth!.facultyId,
        evaluatedAt: new Date(),
      },
    });

    await notify({
      userId: submission.student.userId,
      category: NotificationCategory.TASK,
      title: 'Task evaluated',
      message: `"${submission.task.title}" has been evaluated: ${pointsAwarded} points.`,
    });
    await recordAudit({ entityType: 'TaskSubmission', entityId: submission.id, action: 'EVALUATE', actorId: req.auth!.userId, newValue: { pointsAwarded, feedback } });

    res.json(updated);
  }),
);

/** Task completion / late-submission dashboard for a batch. */
tasksRouter.get(
  '/reports/completion',
  authorize(...ROLE_GROUPS.STAFF, RoleName.MANAGEMENT),
  asyncHandler(async (req, res) => {
    const batchId = req.query.batchId as string | undefined;
    const where = batchId ? { batchId } : {};
    const tasks = await prisma.task.findMany({ where, include: { submissions: true, assignments: true } });

    const rows = tasks.map((t) => {
      const total = t.assignments.length;
      const evaluated = t.submissions.filter((s) => s.status === TaskStatus.EVALUATED).length;
      const submitted = t.submissions.filter((s) => s.status === TaskStatus.SUBMITTED || s.status === TaskStatus.EVALUATED).length;
      const late = t.submissions.filter((s) => s.status === TaskStatus.LATE).length;
      return {
        taskId: t.id,
        title: t.title,
        dueDate: t.dueDate,
        totalAssigned: total,
        submitted,
        evaluated,
        late,
        completionPct: total > 0 ? Math.round((submitted / total) * 1000) / 10 : 0,
      };
    });
    res.json(rows);
  }),
);
