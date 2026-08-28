import { Router } from 'express';
import { NotificationCategory } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { getPagination, paginatedResult } from '@/utils/pagination';
import { ApiError } from '@/utils/apiError';

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

notificationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const pagination = getPagination(req, 20, 50);
    const unreadOnly = req.query.unreadOnly === 'true';
    const where = { userId: req.auth!.userId, ...(unreadOnly ? { isRead: false } : {}) };
    const [items, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({ where, skip: pagination.skip, take: pagination.take, orderBy: { createdAt: 'desc' } }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId: req.auth!.userId, isRead: false } }),
    ]);
    res.json({ ...paginatedResult(items, total, pagination), unreadCount });
  }),
);

notificationsRouter.patch(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const notification = await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.auth!.userId },
      data: { isRead: true },
    });
    res.json({ updated: notification.count });
  }),
);

notificationsRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({ where: { userId: req.auth!.userId, isRead: false }, data: { isRead: true } });
    res.status(204).end();
  }),
);

/** Lists the current user's channel preference for every category — defaults to both channels on where unset (FR-NOT-07). */
notificationsRouter.get(
  '/preferences',
  asyncHandler(async (req, res) => {
    const saved = await prisma.notificationPreference.findMany({ where: { userId: req.auth!.userId } });
    const byCategory = new Map(saved.map((p) => [p.category, p]));
    const preferences = Object.values(NotificationCategory).map((category) => ({
      category,
      inApp: byCategory.get(category)?.inApp ?? true,
      email: byCategory.get(category)?.email ?? true,
    }));
    res.json(preferences);
  }),
);

const preferenceSchema = z.object({ inApp: z.boolean(), email: z.boolean() });

/** Sets the current user's channel opt-in/out for one notification category. */
notificationsRouter.put(
  '/preferences/:category',
  asyncHandler(async (req, res) => {
    const category = req.params.category as NotificationCategory;
    if (!Object.values(NotificationCategory).includes(category)) throw ApiError.badRequest('Unknown notification category');
    const { inApp, email } = preferenceSchema.parse(req.body);
    const preference = await prisma.notificationPreference.upsert({
      where: { userId_category: { userId: req.auth!.userId, category } },
      update: { inApp, email },
      create: { userId: req.auth!.userId, category, inApp, email },
    });
    res.json(preference);
  }),
);
