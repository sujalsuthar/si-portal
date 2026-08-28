import { Router } from 'express';
import { RoleName, SessionStatus, SessionType } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate, authorize, ROLE_GROUPS } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { getPagination, paginatedResult } from '@/utils/pagination';
import { ApiError } from '@/utils/apiError';
import { assertBatchAccess, getFacultyBatchIds, getParentStudentIds } from '@/utils/scope';

export const sessionsRouter = Router();
sessionsRouter.use(authenticate);

const sessionSchema = z.object({
  batchId: z.string(),
  facultyId: z.string().optional(),
  topic: z.string().min(1),
  description: z.string().min(1),
  sessionDate: z.coerce.date(),
  durationMinutes: z.number().int().positive(),
  sessionType: z.nativeEnum(SessionType).optional(),
  syllabusTopicId: z.string().optional(),
});

sessionsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const pagination = getPagination(req, 30);
    const batchId = req.query.batchId as string | undefined;
    const facultyId = req.query.facultyId as string | undefined;
    const from = req.query.from ? new Date(req.query.from as string) : undefined;
    const to = req.query.to ? new Date(req.query.to as string) : undefined;

    const where: Record<string, unknown> = {
      ...(batchId ? { batchId } : {}),
      ...(facultyId ? { facultyId } : {}),
      ...(from || to ? { sessionDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    };

    if (req.auth!.role === RoleName.FACULTY) {
      where.OR = [{ facultyId: req.auth!.facultyId }, { batchId: { in: await getFacultyBatchIds(req.auth!.facultyId!) } }];
    } else if (req.auth!.role === RoleName.STUDENT) {
      const student = await prisma.student.findUnique({ where: { id: req.auth!.studentId! } });
      where.batchId = student?.currentBatchId ?? '__none__';
    } else if (req.auth!.role === RoleName.PARENT) {
      const studentIds = await getParentStudentIds(req.auth!.parentId!);
      const students = await prisma.student.findMany({ where: { id: { in: studentIds } }, select: { currentBatchId: true } });
      where.batchId = { in: students.map((s) => s.currentBatchId).filter(Boolean) };
    }

    const [items, total] = await Promise.all([
      prisma.session.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { sessionDate: 'desc' },
        include: {
          batch: { select: { id: true, name: true } },
          faculty: { select: { id: true, firstName: true, lastName: true } },
          syllabusTopic: true,
          _count: { select: { attendances: true, tasks: true } },
        },
      }),
      prisma.session.count({ where }),
    ]);
    res.json(paginatedResult(items, total, pagination));
  }),
);

sessionsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const session = await prisma.session.findUnique({
      where: { id: req.params.id },
      include: {
        batch: true,
        faculty: { select: { id: true, firstName: true, lastName: true } },
        syllabusTopic: true,
        attendances: { include: { student: { select: { id: true, firstName: true, lastName: true, studentCode: true } } } },
        tasks: true,
      },
    });
    if (!session) throw ApiError.notFound('Session not found');

    if (req.auth!.role === RoleName.FACULTY) {
      await assertBatchAccess(req.auth!, session.batchId);
    } else if (req.auth!.role === RoleName.STUDENT) {
      const student = await prisma.student.findUnique({ where: { id: req.auth!.studentId! }, select: { currentBatchId: true } });
      if (student?.currentBatchId !== session.batchId) throw ApiError.forbidden('This session is not in your batch');
    } else if (req.auth!.role === RoleName.PARENT) {
      const studentIds = await getParentStudentIds(req.auth!.parentId!);
      const linked = await prisma.student.findMany({ where: { id: { in: studentIds } }, select: { currentBatchId: true } });
      if (!linked.some((s) => s.currentBatchId === session.batchId)) throw ApiError.forbidden('This session is not for your linked children');
    }

    res.json(session);
  }),
);

sessionsRouter.post(
  '/',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const data = sessionSchema.parse(req.body);
    const facultyId = data.facultyId ?? req.auth!.facultyId;
    if (!facultyId) throw ApiError.badRequest('facultyId is required');
    if (req.auth!.role === RoleName.FACULTY) await assertBatchAccess(req.auth!, data.batchId);

    const session = await prisma.session.create({
      data: {
        batchId: data.batchId,
        facultyId,
        topic: data.topic,
        description: data.description,
        sessionDate: data.sessionDate,
        durationMinutes: data.durationMinutes,
        sessionType: data.sessionType,
        syllabusTopicId: data.syllabusTopicId,
      },
    });
    res.status(201).json(session);
  }),
);

sessionsRouter.put(
  '/:id',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const data = sessionSchema.partial().parse(req.body);
    const session = await prisma.session.update({ where: { id: req.params.id }, data });
    res.json(session);
  }),
);

sessionsRouter.post(
  '/bulk',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const { sessions } = z.object({ sessions: z.array(sessionSchema).min(1) }).parse(req.body);
    if (req.auth!.role === RoleName.FACULTY) {
      const batchIds = [...new Set(sessions.map((s) => s.batchId))];
      await Promise.all(batchIds.map((batchId) => assertBatchAccess(req.auth!, batchId)));
    }

    const created = await prisma.$transaction(
      sessions.map((data) => {
        const facultyId = data.facultyId ?? req.auth!.facultyId;
        if (!facultyId) throw ApiError.badRequest('facultyId is required');
        return prisma.session.create({
          data: {
            batchId: data.batchId,
            facultyId,
            topic: data.topic,
            description: data.description,
            sessionDate: data.sessionDate,
            durationMinutes: data.durationMinutes,
            sessionType: data.sessionType,
            syllabusTopicId: data.syllabusTopicId,
          },
        });
      }),
    );
    res.status(201).json(created);
  }),
);

sessionsRouter.patch(
  '/:id/status',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const { status, notes, resourceUrl } = z
      .object({ status: z.nativeEnum(SessionStatus), notes: z.string().optional(), resourceUrl: z.string().optional() })
      .parse(req.body);
    const session = await prisma.session.update({ where: { id: req.params.id }, data: { status, notes, resourceUrl } });
    res.json(session);
  }),
);

/** Management question: who taught what, to which batch, and when. */
sessionsRouter.get(
  '/reports/teaching-log',
  authorize(...ROLE_GROUPS.MANAGEMENT_LIKE),
  asyncHandler(async (req, res) => {
    const from = req.query.from ? new Date(req.query.from as string) : undefined;
    const to = req.query.to ? new Date(req.query.to as string) : undefined;
    const sessions = await prisma.session.findMany({
      where: { ...(from || to ? { sessionDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
      orderBy: { sessionDate: 'desc' },
      include: { batch: { select: { name: true } }, faculty: { select: { firstName: true, lastName: true } } },
    });
    res.json(
      sessions.map((s) => ({
        date: s.sessionDate,
        faculty: `${s.faculty.firstName} ${s.faculty.lastName}`,
        batch: s.batch.name,
        description: s.description,
        topic: s.topic,
        sessionType: s.sessionType,
        status: s.status,
      })),
    );
  }),
);
