import { Router } from 'express';
import { RoleName, CertificationStatus, NotificationCategory } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate, authorize, ROLE_GROUPS } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/apiError';
import { assertStudentAccess, getParentStudentIds } from '@/utils/scope';
import { notify } from '@/lib/notify';
import { uploadAttachment, publicUploadUrl } from '@/middleware/upload';

export const certificationsRouter = Router();
certificationsRouter.use(authenticate);

const catalogSchema = z.object({
  courseId: z.string().optional(),
  name: z.string().min(1),
  provider: z.string().optional(),
  description: z.string().optional(),
  isRecommended: z.boolean().default(true),
});

certificationsRouter.get(
  '/catalog',
  asyncHandler(async (req, res) => {
    const courseId = req.query.courseId as string | undefined;
    const items = await prisma.certificationCatalog.findMany({ where: courseId ? { courseId } : {}, orderBy: { name: 'asc' } });
    res.json(items);
  }),
);

certificationsRouter.post(
  '/catalog',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    const data = catalogSchema.parse(req.body);
    const item = await prisma.certificationCatalog.create({ data });
    res.status(201).json(item);
  }),
);

const createSchema = z.object({
  studentId: z.string(),
  catalogId: z.string().optional(),
  name: z.string().min(1),
  provider: z.string().optional(),
  status: z.nativeEnum(CertificationStatus).default(CertificationStatus.RECOMMENDED),
  examDate: z.coerce.date().optional(),
  expiryDate: z.coerce.date().optional(),
});

certificationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const studentId = req.query.studentId as string | undefined;
    const status = req.query.status as CertificationStatus | undefined;
    if (studentId) await assertStudentAccess(req.auth!, studentId);

    const where: Record<string, unknown> = { ...(studentId ? { studentId } : {}), ...(status ? { status } : {}) };
    if (req.auth!.role === RoleName.STUDENT && !studentId) where.studentId = req.auth!.studentId;
    if (req.auth!.role === RoleName.PARENT && !studentId) where.studentId = { in: await getParentStudentIds(req.auth!.parentId!) };

    const items = await prisma.certification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { student: { select: { id: true, firstName: true, lastName: true, studentCode: true } }, catalog: true },
    });
    res.json(items);
  }),
);

certificationsRouter.post(
  '/',
  authorize(...ROLE_GROUPS.STAFF, RoleName.STUDENT),
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    if (req.auth!.role === RoleName.STUDENT) data.studentId = req.auth!.studentId!;
    const item = await prisma.certification.create({ data });
    res.status(201).json(item);
  }),
);

const updateSchema = z.object({
  status: z.nativeEnum(CertificationStatus).optional(),
  examDate: z.coerce.date().optional(),
  resultDate: z.coerce.date().optional(),
  score: z.string().optional(),
  expiryDate: z.coerce.date().optional(),
});

certificationsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = updateSchema.parse(req.body);
    const item = await prisma.certification.findUnique({ where: { id: req.params.id }, include: { student: true } });
    if (!item) throw ApiError.notFound('Certification not found');
    if (req.auth!.role === RoleName.STUDENT && item.studentId !== req.auth!.studentId) throw ApiError.forbidden();

    const updated = await prisma.certification.update({ where: { id: item.id }, data });

    if (data.status === CertificationStatus.PASSED) {
      await notify({
        userId: item.student.userId,
        category: NotificationCategory.CERTIFICATION,
        title: 'Certification passed',
        message: `Congratulations on passing ${item.name}!`,
      });
    }
    res.json(updated);
  }),
);

certificationsRouter.post(
  '/:id/upload',
  uploadAttachment.single('file'),
  asyncHandler(async (req, res) => {
    const item = await prisma.certification.findUnique({ where: { id: req.params.id } });
    if (!item) throw ApiError.notFound('Certification not found');
    if (req.auth!.role === RoleName.STUDENT && item.studentId !== req.auth!.studentId) throw ApiError.forbidden();
    const file = req.file as Express.Multer.File | undefined;
    if (!file) throw ApiError.badRequest('No file uploaded');
    const updated = await prisma.certification.update({ where: { id: item.id }, data: { certificateFileUrl: publicUploadUrl('attachments', file.filename) } });
    res.json(updated);
  }),
);

/** Certification dashboard: counts by status, for management reporting. */
certificationsRouter.get(
  '/dashboard',
  authorize(...ROLE_GROUPS.MANAGEMENT_LIKE, RoleName.FACULTY),
  asyncHandler(async (_req, res) => {
    const grouped = await prisma.certification.groupBy({ by: ['status'], _count: { status: true } });
    res.json(Object.fromEntries(grouped.map((g) => [g.status, g._count.status])));
  }),
);
