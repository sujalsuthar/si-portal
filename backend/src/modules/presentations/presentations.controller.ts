import { Router } from 'express';
import { RoleName, PresentationStatus, PointSource, NotificationCategory } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate, authorize, ROLE_GROUPS } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { getPagination, paginatedResult } from '@/utils/pagination';
import { ApiError } from '@/utils/apiError';
import { assertStudentAccess, getFacultyBatchIds, getParentStudentIds } from '@/utils/scope';
import { notify } from '@/lib/notify';

export const presentationsRouter = Router();
presentationsRouter.use(authenticate);

const MONTHLY_TARGET = 3; // Configurable per program in a future iteration; fixed default per spec section 6.10.

const scheduleSchema = z.object({
  studentId: z.string(),
  batchId: z.string().optional(),
  topic: z.string().min(1),
  scheduledDate: z.coerce.date(),
  durationMinutes: z.number().int().positive().optional(),
  evaluatorFacultyId: z.string().optional(),
});

presentationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const pagination = getPagination(req, 30);
    const studentId = req.query.studentId as string | undefined;
    const batchId = req.query.batchId as string | undefined;
    const status = req.query.status as PresentationStatus | undefined;
    if (studentId) await assertStudentAccess(req.auth!, studentId);

    const where: Record<string, unknown> = {
      ...(studentId ? { studentId } : {}),
      ...(batchId ? { batchId } : {}),
      ...(status ? { status } : {}),
    };
    if (req.auth!.role === RoleName.STUDENT && !studentId) where.studentId = req.auth!.studentId;
    if (req.auth!.role === RoleName.PARENT && !studentId) where.studentId = { in: await getParentStudentIds(req.auth!.parentId!) };
    if (req.auth!.role === RoleName.FACULTY && !studentId && !batchId) {
      where.batchId = { in: await getFacultyBatchIds(req.auth!.facultyId!) };
    }

    const [items, total] = await Promise.all([
      prisma.presentation.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { scheduledDate: 'desc' },
        include: { student: { select: { id: true, firstName: true, lastName: true, studentCode: true } }, evaluatorFaculty: { select: { firstName: true, lastName: true } } },
      }),
      prisma.presentation.count({ where }),
    ]);
    res.json(paginatedResult(items, total, pagination));
  }),
);

presentationsRouter.post(
  '/',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const data = scheduleSchema.parse(req.body);
    const presentation = await prisma.presentation.create({ data });

    const student = await prisma.student.findUnique({ where: { id: data.studentId } });
    if (student) {
      await notify({
        userId: student.userId,
        category: NotificationCategory.PRESENTATION,
        title: 'Presentation scheduled',
        message: `"${data.topic}" scheduled on ${data.scheduledDate.toDateString()}.`,
      });
    }
    res.status(201).json(presentation);
  }),
);

const scoreSchema = z.object({
  contentScore: z.number().int().min(0).max(10),
  communicationScore: z.number().int().min(0).max(10),
  confidenceScore: z.number().int().min(0).max(10),
  technicalScore: z.number().int().min(0).max(10),
  qnaScore: z.number().int().min(0).max(10),
  timeManagementScore: z.number().int().min(0).max(10),
  feedback: z.string().optional(),
});

presentationsRouter.patch(
  '/:id/score',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const data = scoreSchema.parse(req.body);
    const presentation = await prisma.presentation.findUnique({ where: { id: req.params.id } });
    if (!presentation) throw ApiError.notFound('Presentation not found');

    const totalScore =
      data.contentScore + data.communicationScore + data.confidenceScore + data.technicalScore + data.qnaScore + data.timeManagementScore;
    const pointsAwarded = Math.round((totalScore / 60) * 10);

    const updated = await prisma.presentation.update({
      where: { id: presentation.id },
      data: { ...data, totalScore, pointsAwarded, status: PresentationStatus.COMPLETED, evaluatorFacultyId: req.auth!.facultyId ?? presentation.evaluatorFacultyId },
    });

    await prisma.pointTransaction.create({
      data: { studentId: presentation.studentId, source: PointSource.PRESENTATION, sourceId: presentation.id, points: pointsAwarded, reason: `Presentation: ${presentation.topic}` },
    });

    res.json(updated);
  }),
);

presentationsRouter.get(
  '/student/:studentId/summary',
  asyncHandler(async (req, res) => {
    await assertStudentAccess(req.auth!, req.params.studentId);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [all, thisMonth] = await Promise.all([
      prisma.presentation.findMany({ where: { studentId: req.params.studentId }, orderBy: { scheduledDate: 'desc' } }),
      prisma.presentation.count({ where: { studentId: req.params.studentId, scheduledDate: { gte: monthStart } } }),
    ]);
    res.json({
      completed: all.filter((p) => p.status === PresentationStatus.COMPLETED).length,
      planned: all.filter((p) => p.status === PresentationStatus.PLANNED).length,
      averageScore: all.filter((p) => p.totalScore != null).length
        ? Math.round((all.reduce((s, p) => s + (p.totalScore ?? 0), 0) / all.filter((p) => p.totalScore != null).length) * 10) / 10
        : null,
      monthlyTarget: MONTHLY_TARGET,
      thisMonthCount: thisMonth,
      onTrack: thisMonth <= MONTHLY_TARGET,
      recent: all.slice(0, 10),
    });
  }),
);
