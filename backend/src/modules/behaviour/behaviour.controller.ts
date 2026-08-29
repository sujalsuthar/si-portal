import { Router } from 'express';
import { RoleName, BehaviourCategory, PointType, PointSource, NotificationCategory, InternStatus } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate, authorize, ROLE_GROUPS } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/apiError';
import { recordAudit } from '@/lib/audit';
import { assertStudentAccess, getFacultyBatchIds, getParentStudentIds } from '@/utils/scope';
import { notify, notifyStudentParents } from '@/lib/notify';
import { uploadEvidence, publicUploadUrl, optionalEvidenceUpload } from '@/middleware/upload';

export const behaviourRouter = Router();
behaviourRouter.use(authenticate);

const createSchema = z.object({
  studentId: z.string(),
  category: z.nativeEnum(BehaviourCategory),
  type: z.nativeEnum(PointType),
  points: z.number().int().min(-5).max(5).refine((p) => p !== 0, 'points cannot be zero'),
  reason: z.string().min(5, 'Please enter a brief reason (at least 5 characters)'),
  eventDate: z.coerce.date().optional(),
});

behaviourRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const studentId = req.query.studentId as string | undefined;
    const batchId = req.query.batchId as string | undefined;
    const category = req.query.category as BehaviourCategory | undefined;
    const type = req.query.type as PointType | undefined;
    // Students vs Interns behaviour split (4.0 issue log): null internStatus = student, otherwise intern.
    const studentType = req.query.studentType as 'STUDENT' | 'INTERN' | undefined;
    if (studentId) await assertStudentAccess(req.auth!, studentId);

    const where: Record<string, unknown> = {
      ...(studentId ? { studentId } : {}),
      ...(category ? { category } : {}),
      ...(type ? { type } : {}),
    };
    if (req.auth!.role === RoleName.STUDENT && !studentId) where.studentId = req.auth!.studentId;
    if (req.auth!.role === RoleName.PARENT && !studentId) where.studentId = { in: await getParentStudentIds(req.auth!.parentId!) };

    const studentWhere: Record<string, unknown> = {};
    if (req.auth!.role === RoleName.FACULTY && !studentId) {
      studentWhere.currentBatchId = { in: await getFacultyBatchIds(req.auth!.facultyId!) };
    }
    if (studentType === 'STUDENT') {
      studentWhere.OR = [{ internStatus: null }, { internStatus: InternStatus.DEMOTED }];
    } else if (studentType === 'INTERN') {
      studentWhere.internStatus = { in: [InternStatus.ACTIVE, InternStatus.COMPLETED] };
    }
    if (batchId) studentWhere.currentBatchId = batchId;
    if (Object.keys(studentWhere).length > 0) where.student = studentWhere;

    const events = await prisma.behaviourEvent.findMany({
      where,
      orderBy: { eventDate: 'desc' },
      take: 200,
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            studentCode: true,
            internStatus: true,
            currentBatch: { select: { id: true, name: true } },
          },
        },
      },
    });
    res.json(events);
  }),
);

behaviourRouter.post(
  '/',
  authorize(...ROLE_GROUPS.STAFF),
  optionalEvidenceUpload,
  asyncHandler(async (req, res) => {
    const data = createSchema.parse({ ...req.body, points: Number(req.body.points) });
    await assertStudentAccess(req.auth!, data.studentId);
    const points = data.type === PointType.NEGATIVE ? -Math.abs(data.points) : Math.abs(data.points);
    const isAdmin = ROLE_GROUPS.ADMIN_LIKE.includes(req.auth!.role);
    const file = req.file as Express.Multer.File | undefined;

    // Positive events and events recorded by admin/management are auto-authorized.
    // Negative events recorded by faculty require a separate admin authorization step.
    const autoAuthorize = data.type === PointType.POSITIVE || isAdmin;

    const event = await prisma.behaviourEvent.create({
      data: {
        studentId: data.studentId,
        category: data.category,
        type: data.type,
        points,
        reason: data.reason,
        eventDate: data.eventDate ?? new Date(),
        evidenceUrl: file ? publicUploadUrl('evidence', file.filename) : undefined,
        recordedById: req.auth!.userId,
        authorizedById: autoAuthorize ? req.auth!.userId : null,
      },
    });

    if (autoAuthorize) {
      await prisma.pointTransaction.create({
        data: { studentId: data.studentId, source: PointSource.BEHAVIOUR, sourceId: event.id, points, reason: data.reason },
      });
    }

    const student = await prisma.student.findUnique({ where: { id: data.studentId } });
    if (student && data.type === PointType.NEGATIVE) {
      await notifyStudentParents(student.id, {
        category: NotificationCategory.BEHAVIOUR,
        title: 'Behaviour note recorded',
        message: `A behaviour event was recorded for your child in category ${data.category}.`,
      });
    }

    res.status(201).json(event);
  }),
);

const editSchema = z.object({
  category: z.nativeEnum(BehaviourCategory).optional(),
  type: z.nativeEnum(PointType).optional(),
  points: z.number().int().min(-5).max(5).refine((p) => p !== 0, 'points cannot be zero').optional(),
  reason: z.string().min(5, 'Please enter a brief reason (at least 5 characters)').optional(),
});

/** Edits an already-recorded behaviour event (4.1: "should be editable"). */
behaviourRouter.patch(
  '/:id',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const data = editSchema.parse(req.body);
    const before = await prisma.behaviourEvent.findUnique({ where: { id: req.params.id } });
    if (!before) throw ApiError.notFound('Event not found');

    const points = data.points !== undefined ? (((data.type ?? before.type) === PointType.NEGATIVE) ? -Math.abs(data.points) : Math.abs(data.points)) : undefined;
    const updated = await prisma.behaviourEvent.update({ where: { id: before.id }, data: { ...data, points } });

    if (before.authorizedById) {
      await prisma.pointTransaction.updateMany({
        where: { source: PointSource.BEHAVIOUR, sourceId: before.id },
        data: { points: updated.points, reason: updated.reason },
      });
    }
    await recordAudit({ entityType: 'BehaviourEvent', entityId: before.id, action: 'UPDATE', actorId: req.auth!.userId, oldValue: before, newValue: updated });
    res.json(updated);
  }),
);

/** Controlled authorization step for negative behaviour events raised by faculty. */
behaviourRouter.patch(
  '/:id/authorize',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    const event = await prisma.behaviourEvent.findUnique({ where: { id: req.params.id } });
    if (!event) throw ApiError.notFound('Event not found');
    if (event.authorizedById) throw ApiError.badRequest('Already authorized');

    const updated = await prisma.behaviourEvent.update({ where: { id: event.id }, data: { authorizedById: req.auth!.userId } });
    await prisma.pointTransaction.create({
      data: { studentId: event.studentId, source: PointSource.BEHAVIOUR, sourceId: event.id, points: event.points, reason: event.reason },
    });
    await recordAudit({ entityType: 'BehaviourEvent', entityId: event.id, action: 'AUTHORIZE', actorId: req.auth!.userId });
    res.json(updated);
  }),
);

behaviourRouter.get(
  '/student/:studentId/monthly-summary',
  asyncHandler(async (req, res) => {
    await assertStudentAccess(req.auth!, req.params.studentId);
    const events = await prisma.behaviourEvent.findMany({
      where: { studentId: req.params.studentId, OR: [{ type: PointType.POSITIVE }, { authorizedById: { not: null } }] },
      orderBy: { eventDate: 'desc' },
    });

    const byMonth = new Map<string, { period: string; positive: number; negative: number; net: number }>();
    for (const e of events) {
      const key = `${e.eventDate.getFullYear()}-${String(e.eventDate.getMonth() + 1).padStart(2, '0')}`;
      const entry = byMonth.get(key) ?? { period: key, positive: 0, negative: 0, net: 0 };
      if (e.points >= 0) entry.positive += e.points;
      else entry.negative += e.points;
      entry.net += e.points;
      byMonth.set(key, entry);
    }

    const byCategory = new Map<string, number>();
    for (const e of events) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.points);

    res.json({
      trend: [...byMonth.values()].sort((a, b) => a.period.localeCompare(b.period)).slice(-12),
      byCategory: Object.fromEntries(byCategory),
      totalNet: events.reduce((s, e) => s + e.points, 0),
      recentEvents: events.slice(0, 20),
    });
  }),
);
