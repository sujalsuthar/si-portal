import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate, authorize, ROLE_GROUPS } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { getPagination, paginatedResult } from '@/utils/pagination';
import { recordAudit } from '@/lib/audit';
import { ApiError } from '@/utils/apiError';

export const coursesRouter = Router();
coursesRouter.use(authenticate);

const courseSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2),
  description: z.string().optional(),
  durationWeeks: z.number().int().positive().optional(),
});

coursesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const pagination = getPagination(req, 50);
    const activeOnly = req.query.activeOnly === 'true';
    const where = activeOnly ? { isActive: true } : {};
    const [items, total] = await Promise.all([
      prisma.course.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { name: 'asc' },
        include: { _count: { select: { batches: true, students: true } } },
      }),
      prisma.course.count({ where }),
    ]);
    res.json(paginatedResult(items, total, pagination));
  }),
);

coursesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const course = await prisma.course.findUnique({
      where: { id: req.params.id },
      include: { batches: true, syllabusTopics: { orderBy: { sequence: 'asc' } }, certCatalog: true },
    });
    if (!course) throw ApiError.notFound('Course not found');
    res.json(course);
  }),
);

coursesRouter.post(
  '/',
  authorize(RoleName.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const data = courseSchema.parse(req.body);
    const course = await prisma.course.create({ data });
    await recordAudit({ entityType: 'Course', entityId: course.id, action: 'CREATE', actorId: req.auth!.userId, newValue: data });
    res.status(201).json(course);
  }),
);

coursesRouter.put(
  '/:id',
  authorize(RoleName.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const data = courseSchema.partial().parse(req.body);
    const before = await prisma.course.findUnique({ where: { id: req.params.id } });
    if (!before) throw ApiError.notFound('Course not found');
    const course = await prisma.course.update({ where: { id: req.params.id }, data });
    await recordAudit({ entityType: 'Course', entityId: course.id, action: 'UPDATE', actorId: req.auth!.userId, oldValue: before, newValue: data });
    res.json(course);
  }),
);

coursesRouter.patch(
  '/:id/archive',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    const course = await prisma.course.update({ where: { id: req.params.id }, data: { isActive: false } });
    await recordAudit({ entityType: 'Course', entityId: course.id, action: 'ARCHIVE', actorId: req.auth!.userId });
    res.json(course);
  }),
);

// Syllabus topics (used for session topic-completion tracking)
const topicSchema = z.object({ title: z.string().min(1), sequence: z.number().int(), description: z.string().optional() });

coursesRouter.post(
  '/:id/topics',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    const data = topicSchema.parse(req.body);
    const topic = await prisma.syllabusTopic.create({ data: { ...data, courseId: req.params.id } });
    res.status(201).json(topic);
  }),
);

coursesRouter.delete(
  '/topics/:topicId',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    await prisma.syllabusTopic.delete({ where: { id: req.params.topicId } });
    res.status(204).end();
  }),
);
