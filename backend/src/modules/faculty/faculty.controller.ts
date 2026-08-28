import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate, authorize, ROLE_GROUPS } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { getPagination, paginatedResult } from '@/utils/pagination';
import { recordAudit } from '@/lib/audit';
import { ApiError } from '@/utils/apiError';
import { createUserAccount } from '@/modules/users/account.service';

export const facultyRouter = Router();
facultyRouter.use(authenticate);

const createFacultySchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  employeeCode: z.string().min(1),
  phone: z.string().optional(),
  department: z.string().optional(),
  designation: z.string().optional(),
  joiningDate: z.coerce.date().optional(),
});

const updateFacultySchema = createFacultySchema
  .omit({ email: true })
  .partial();

facultyRouter.get(
  '/',
  authorize(...ROLE_GROUPS.STAFF, RoleName.MANAGEMENT),
  asyncHandler(async (req, res) => {
    const pagination = getPagination(req);
    const search = (req.query.search as string) ?? '';
    const activeOnly = req.query.activeOnly === 'true';
    const where = {
      ...(activeOnly ? { isActive: true } : {}),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' as const } },
              { lastName: { contains: search, mode: 'insensitive' as const } },
              { employeeCode: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.faculty.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { firstName: 'asc' },
        include: { user: { select: { email: true, isActive: true } }, _count: { select: { batchAssignments: true } } },
      }),
      prisma.faculty.count({ where }),
    ]);
    res.json(paginatedResult(items, total, pagination));
  }),
);

facultyRouter.get(
  '/:id',
  authorize(RoleName.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const faculty = await prisma.faculty.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { email: true, isActive: true, lastLoginAt: true } },
        batchAssignments: { include: { batch: { include: { course: true } } } },
        mentoredStudents: { select: { id: true, firstName: true, lastName: true, studentCode: true } },
      },
    });
    if (!faculty) throw ApiError.notFound('Faculty not found');
    res.json(faculty);
  }),
);

facultyRouter.post(
  '/',
  authorize(RoleName.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const data = createFacultySchema.parse(req.body);

    const result = await prisma.$transaction(async (tx) => {
      const { userId, tempPassword } = await createUserAccount(tx, data.email, RoleName.FACULTY);
      const faculty = await tx.faculty.create({
        data: {
          userId,
          employeeCode: data.employeeCode,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          department: data.department,
          designation: data.designation,
          joiningDate: data.joiningDate,
        },
      });
      return { faculty, tempPassword };
    });

    await recordAudit({ entityType: 'Faculty', entityId: result.faculty.id, action: 'CREATE', actorId: req.auth!.userId, newValue: data });
    res.status(201).json(result);
  }),
);

facultyRouter.put(
  '/:id',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    const data = updateFacultySchema.parse(req.body);
    const before = await prisma.faculty.findUnique({ where: { id: req.params.id } });
    if (!before) throw ApiError.notFound('Faculty not found');
    const faculty = await prisma.faculty.update({ where: { id: req.params.id }, data });
    await recordAudit({ entityType: 'Faculty', entityId: faculty.id, action: 'UPDATE', actorId: req.auth!.userId, oldValue: before, newValue: data });
    res.json(faculty);
  }),
);

facultyRouter.patch(
  '/:id/deactivate',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    const faculty = await prisma.faculty.update({ where: { id: req.params.id }, data: { isActive: false } });
    await prisma.user.update({ where: { id: faculty.userId }, data: { isActive: false } });
    await recordAudit({ entityType: 'Faculty', entityId: faculty.id, action: 'DEACTIVATE', actorId: req.auth!.userId });
    res.json(faculty);
  }),
);

facultyRouter.patch(
  '/:id/activate',
  authorize(RoleName.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const faculty = await prisma.faculty.update({ where: { id: req.params.id }, data: { isActive: true } });
    await prisma.user.update({ where: { id: faculty.userId }, data: { isActive: true } });
    res.json(faculty);
  }),
);
