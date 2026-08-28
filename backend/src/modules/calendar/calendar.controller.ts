import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/apiError';
import { getFacultyBatchIds } from '@/utils/scope';

export const calendarRouter = Router();
calendarRouter.use(authenticate);

const eventSchema = z.object({
  title: z.string().min(1),
  notes: z.string().optional(),
  startAt: z.coerce.date(),
  endAt: z.coerce.date().optional(),
});

/**
 * Personal Calendar (4.0 issue log, Team/Faculty item 14) — events are always scoped to the
 * requesting user; no role may read or write another user's calendar. Assigned sessions are
 * additionally surfaced as read-only entries for Faculty (item 14's optional timetable overlay).
 */
calendarRouter.get(
  '/events',
  asyncHandler(async (req, res) => {
    const from = req.query.from ? new Date(req.query.from as string) : undefined;
    const to = req.query.to ? new Date(req.query.to as string) : undefined;
    const events = await prisma.calendarEvent.findMany({
      where: {
        userId: req.auth!.userId,
        ...(from || to ? { startAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      },
      orderBy: { startAt: 'asc' },
    });

    let readOnlyEvents: { id: string; title: string; startAt: Date; endAt: Date | null; kind: string }[] = [];
    if (req.auth!.role === RoleName.FACULTY && req.auth!.facultyId) {
      const batchIds = await getFacultyBatchIds(req.auth!.facultyId);
      const sessions = await prisma.session.findMany({
        where: {
          OR: [{ facultyId: req.auth!.facultyId }, { batchId: { in: batchIds } }],
          ...(from || to ? { sessionDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
        },
        select: { id: true, topic: true, sessionDate: true, durationMinutes: true, batch: { select: { name: true } } },
      });
      readOnlyEvents = sessions.map((s) => ({
        id: s.id,
        title: `${s.topic} (${s.batch.name})`,
        startAt: s.sessionDate,
        endAt: new Date(s.sessionDate.getTime() + s.durationMinutes * 60_000),
        kind: 'SESSION',
      }));
    }

    res.json({ events, readOnlyEvents });
  }),
);

calendarRouter.post(
  '/events',
  asyncHandler(async (req, res) => {
    const data = eventSchema.parse(req.body);
    const event = await prisma.calendarEvent.create({ data: { ...data, userId: req.auth!.userId } });
    res.status(201).json(event);
  }),
);

async function assertOwnsEvent(userId: string, eventId: string) {
  const event = await prisma.calendarEvent.findUnique({ where: { id: eventId } });
  if (!event || event.userId !== userId) throw ApiError.notFound('Calendar event not found');
  return event;
}

calendarRouter.patch(
  '/events/:id',
  asyncHandler(async (req, res) => {
    await assertOwnsEvent(req.auth!.userId, req.params.id);
    const data = eventSchema.partial().parse(req.body);
    const event = await prisma.calendarEvent.update({ where: { id: req.params.id }, data });
    res.json(event);
  }),
);

calendarRouter.delete(
  '/events/:id',
  asyncHandler(async (req, res) => {
    await assertOwnsEvent(req.auth!.userId, req.params.id);
    await prisma.calendarEvent.delete({ where: { id: req.params.id } });
    res.status(204).end();
  }),
);
