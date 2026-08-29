import { Router } from 'express';
import { RoleName, StudentStatus } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate, authorize, ROLE_GROUPS } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { getPagination, paginatedResult } from '@/utils/pagination';
import { hashPassword, isStrongPassword, PASSWORD_POLICY_MESSAGE } from '@/utils/password';
import { generateTempPassword } from '@/utils/tempPassword';
import { recordAudit } from '@/lib/audit';
import { ApiError } from '@/utils/apiError';

export const usersRouter = Router();
usersRouter.use(authenticate);

usersRouter.get(
  '/',
  authorize(...ROLE_GROUPS.ADMIN_LIKE, RoleName.MANAGEMENT),
  asyncHandler(async (req, res) => {
    const pagination = getPagination(req);
    const role = req.query.role as RoleName | undefined;
    const search = (req.query.search as string) ?? '';

    const where = {
      ...(role ? { role } : {}),
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' as const } },
              { student: { OR: [{ firstName: { contains: search, mode: 'insensitive' as const } }, { lastName: { contains: search, mode: 'insensitive' as const } }] } },
              { faculty: { OR: [{ firstName: { contains: search, mode: 'insensitive' as const } }, { lastName: { contains: search, mode: 'insensitive' as const } }] } },
              { parent: { OR: [{ firstName: { contains: search, mode: 'insensitive' as const } }, { lastName: { contains: search, mode: 'insensitive' as const } }] } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
          mustChangePassword: true,
          lastLoginAt: true,
          createdAt: true,
          student: { select: { firstName: true, lastName: true } },
          faculty: { select: { firstName: true, lastName: true } },
          parent: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    res.json(paginatedResult(items, total, pagination));
  }),
);

const createAdminSchema = z.object({ email: z.string().email() });

/** Creates a plain Academic Admin account (no dedicated profile table, unlike Faculty/Student/Parent). */
usersRouter.post(
  '/admins',
  authorize(RoleName.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const { email } = createAdminSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) throw ApiError.conflict(`An account already exists for ${email}`);

    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);
    const user = await prisma.user.create({
      data: { email: email.toLowerCase(), passwordHash, role: RoleName.ACADEMIC_ADMIN, mustChangePassword: true },
    });
    await recordAudit({ entityType: 'User', entityId: user.id, action: 'CREATE', actorId: req.auth!.userId, newValue: { email: user.email, role: user.role } });
    res.status(201).json({ id: user.id, email: user.email, tempPassword });
  }),
);

usersRouter.patch(
  '/:id/activate',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.update({ where: { id: req.params.id }, data: { isActive: true } });
    if (user.role === RoleName.STUDENT) {
      await prisma.student.updateMany({ where: { userId: user.id }, data: { status: StudentStatus.ACTIVE, archivedAt: null } });
    }
    await recordAudit({ entityType: 'User', entityId: user.id, action: 'ACTIVATE', actorId: req.auth!.userId });
    res.json(user);
  }),
);

usersRouter.patch(
  '/:id/deactivate',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    if (req.params.id === req.auth!.userId) throw ApiError.badRequest('You cannot deactivate your own account');
    const user = await prisma.user.update({ where: { id: req.params.id }, data: { isActive: false } });
    if (user.role === RoleName.STUDENT) {
      await prisma.student.updateMany({ where: { userId: user.id }, data: { status: StudentStatus.INACTIVE } });
    }
    await recordAudit({ entityType: 'User', entityId: user.id, action: 'DEACTIVATE', actorId: req.auth!.userId });
    res.json(user);
  }),
);

const roleChangeSchema = z.object({ role: z.nativeEnum(RoleName) });

usersRouter.patch(
  '/:id/role',
  authorize(RoleName.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const { role } = roleChangeSchema.parse(req.body);
    const before = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!before) throw ApiError.notFound('User not found');
    const user = await prisma.user.update({ where: { id: req.params.id }, data: { role } });
    await recordAudit({
      entityType: 'User',
      entityId: user.id,
      action: 'ROLE_CHANGE',
      actorId: req.auth!.userId,
      oldValue: { role: before.role },
      newValue: { role },
    });
    res.json(user);
  }),
);

const resetPasswordSchema = z.object({ customPassword: z.string().optional() });

usersRouter.post(
  '/:id/reset-password',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    const { customPassword } = resetPasswordSchema.parse(req.body ?? {});
    if (customPassword && !isStrongPassword(customPassword)) throw ApiError.badRequest(PASSWORD_POLICY_MESSAGE);

    const tempPassword = customPassword || generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);
    const user = await prisma.user.update({
      where: { id: req.params.id },
      // A custom password was explicitly chosen by the admin, so it's usable immediately —
      // only a system-generated one forces the user to set their own on next login.
      data: { passwordHash, mustChangePassword: !customPassword },
    });
    await prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await recordAudit({ entityType: 'User', entityId: user.id, action: 'PASSWORD_RESET', actorId: req.auth!.userId });
    res.json({ tempPassword: customPassword ? undefined : tempPassword });
  }),
);
