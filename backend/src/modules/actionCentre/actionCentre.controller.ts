import { Router } from 'express';
import { RoleName, ActionRequestType, ActionRequestStatus, NotificationCategory } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate, authorize, ROLE_GROUPS } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/apiError';
import { recordAudit } from '@/lib/audit';
import { getFacultyBatchIds } from '@/utils/scope';
import { notify } from '@/lib/notify';
import { generateStudentDataExport, exportFilePath } from '@/lib/dataExport';
import fs from 'fs';

export const actionCentreRouter = Router();
actionCentreRouter.use(authenticate);

const DEFAULT_SLA_TARGET_HOURS = 48;

/** Target response hours for every request type, falling back to the default where unconfigured. */
async function getSlaTargetHoursByType(): Promise<Record<string, number>> {
  const configured = await prisma.requestSla.findMany();
  const byType: Record<string, number> = {};
  for (const type of Object.values(ActionRequestType)) byType[type] = DEFAULT_SLA_TARGET_HOURS;
  for (const c of configured) byType[c.type] = c.targetHours;
  return byType;
}

/** Annotates a request with its SLA target, hours open, and whether it has breached (PENDING only). */
function withSlaStatus<T extends { type: ActionRequestType; status: ActionRequestStatus; createdAt: Date; resolvedAt: Date | null }>(
  request: T,
  targetHoursByType: Record<string, number>,
) {
  const targetHours = targetHoursByType[request.type] ?? DEFAULT_SLA_TARGET_HOURS;
  const endTime = request.resolvedAt ?? new Date();
  const hoursOpen = (endTime.getTime() - request.createdAt.getTime()) / (1000 * 60 * 60);
  const slaBreached = request.status === ActionRequestStatus.PENDING && hoursOpen > targetHours;
  return { ...request, slaTargetHours: targetHours, hoursOpen: Math.round(hoursOpen * 10) / 10, slaBreached };
}

// Data Access Request and Data Erasure Request were removed from both Student and Parent Raise
// Request types per the 4.0 issue log; Behaviour Challenge was removed from Student's only.
const STUDENT_TYPES: ActionRequestType[] = [
  ActionRequestType.BATCH_TRANSFER,
  ActionRequestType.PASSWORD_RESET,
  ActionRequestType.ACADEMIC_QUERY,
  ActionRequestType.RESULT_QUERY,
  ActionRequestType.GENERAL,
  ActionRequestType.DATA_CORRECTION_REQUEST,
];
const PARENT_TYPES: ActionRequestType[] = [
  ActionRequestType.FEE_QUERY,
  ActionRequestType.ATTENDANCE_QUERY,
  ActionRequestType.GENERAL,
  ActionRequestType.DATA_CORRECTION_REQUEST,
];

const createSchema = z.object({
  type: z.nativeEnum(ActionRequestType),
  subject: z.string().min(2),
  description: z.string().min(3),
  targetStudentId: z.string().optional(),
});

actionCentreRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    const allowed = req.auth!.role === RoleName.STUDENT ? STUDENT_TYPES : req.auth!.role === RoleName.PARENT ? PARENT_TYPES : null;
    if (allowed && !allowed.includes(data.type)) throw ApiError.badRequest(`Your role cannot raise a ${data.type} request`);

    const request = await prisma.actionRequest.create({
      data: {
        requesterId: req.auth!.userId,
        type: data.type,
        subject: data.subject,
        description: data.description,
        targetStudentId: data.targetStudentId ?? req.auth!.studentId,
      },
    });
    res.status(201).json(request);
  }),
);

actionCentreRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const status = req.query.status as ActionRequestStatus | undefined;
    const type = req.query.type as ActionRequestType | undefined;
    const mine = req.query.mine === 'true';

    const where: Record<string, unknown> = { ...(status ? { status } : {}), ...(type ? { type } : {}) };

    if (mine || req.auth!.role === RoleName.STUDENT || req.auth!.role === RoleName.PARENT) {
      where.requesterId = req.auth!.userId;
    } else if (req.auth!.role === RoleName.FACULTY) {
      const batchIds = await getFacultyBatchIds(req.auth!.facultyId!);
      where.targetStudent = { currentBatchId: { in: batchIds } };
    } else if (!ROLE_GROUPS.ADMIN_LIKE.includes(req.auth!.role)) {
      throw ApiError.forbidden();
    }

    const requests = await prisma.actionRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        requester: { select: { email: true, role: true } },
        targetStudent: { select: { id: true, firstName: true, lastName: true, studentCode: true } },
      },
    });
    const targetHoursByType = await getSlaTargetHoursByType();
    res.json(requests.map((r) => withSlaStatus(r, targetHoursByType)));
  }),
);

actionCentreRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const request = await prisma.actionRequest.findUnique({
      where: { id: req.params.id },
      include: { requester: { select: { email: true, role: true } }, targetStudent: true },
    });
    if (!request) throw ApiError.notFound('Request not found');
    if (request.requesterId !== req.auth!.userId && !ROLE_GROUPS.ADMIN_LIKE.includes(req.auth!.role)) throw ApiError.forbidden();
    res.json(withSlaStatus(request, await getSlaTargetHoursByType()));
  }),
);

/** Lists the configured (or defaulted) SLA target hours for every request type. */
actionCentreRouter.get(
  '/sla/config',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (_req, res) => {
    res.json(await getSlaTargetHoursByType());
  }),
);

const slaSchema = z.object({ targetHours: z.number().int().positive() });

/** Sets the target response time (hours) for a request type. */
actionCentreRouter.put(
  '/sla/config/:type',
  authorize(RoleName.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const type = req.params.type as ActionRequestType;
    if (!Object.values(ActionRequestType).includes(type)) throw ApiError.badRequest('Unknown request type');
    const { targetHours } = slaSchema.parse(req.body);
    const sla = await prisma.requestSla.upsert({
      where: { type },
      update: { targetHours },
      create: { type, targetHours },
    });
    await recordAudit({ entityType: 'RequestSla', entityId: sla.id, action: 'UPSERT', actorId: req.auth!.userId, newValue: { type, targetHours } });
    res.json(sla);
  }),
);

const decisionSchema = z.object({ remarks: z.string().min(3) });

actionCentreRouter.patch(
  '/:id/approve',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    const { remarks } = decisionSchema.parse(req.body);
    const request = await prisma.actionRequest.findUnique({ where: { id: req.params.id } });
    if (!request) throw ApiError.notFound('Request not found');
    if (request.status !== ActionRequestStatus.PENDING) throw ApiError.badRequest('Only pending requests can be decided');
    if (request.requesterId === req.auth!.userId) throw ApiError.forbidden('You cannot approve your own request');

    const updated = await prisma.actionRequest.update({
      where: { id: request.id },
      data: { status: ActionRequestStatus.APPROVED, approverId: req.auth!.userId, remarks, resolvedAt: new Date() },
    });
    await recordAudit({ entityType: 'ActionRequest', entityId: request.id, action: 'APPROVE', actorId: req.auth!.userId, reason: remarks });

    // Approving a data-access request automatically produces the machine-readable export it asked for.
    if (request.type === ActionRequestType.DATA_ACCESS_REQUEST && request.targetStudentId) {
      await generateStudentDataExport(request.targetStudentId, request.id, req.auth!.userId);
    }

    await notify({ userId: request.requesterId, category: NotificationCategory.GENERAL, title: 'Request approved', message: `Your ${request.type.replace(/_/g, ' ').toLowerCase()} request was approved: ${remarks}` });
    res.json(updated);
  }),
);

actionCentreRouter.patch(
  '/:id/reject',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    const { remarks } = decisionSchema.parse(req.body);
    const request = await prisma.actionRequest.findUnique({ where: { id: req.params.id } });
    if (!request) throw ApiError.notFound('Request not found');
    if (request.status !== ActionRequestStatus.PENDING) throw ApiError.badRequest('Only pending requests can be decided');
    if (request.requesterId === req.auth!.userId) throw ApiError.forbidden('You cannot decide your own request');

    const updated = await prisma.actionRequest.update({
      where: { id: request.id },
      data: { status: ActionRequestStatus.REJECTED, approverId: req.auth!.userId, remarks, resolvedAt: new Date() },
    });
    await recordAudit({ entityType: 'ActionRequest', entityId: request.id, action: 'REJECT', actorId: req.auth!.userId, reason: remarks });
    await notify({ userId: request.requesterId, category: NotificationCategory.GENERAL, title: 'Request rejected', message: `Your ${request.type.replace(/_/g, ' ').toLowerCase()} request was rejected: ${remarks}` });
    res.json(updated);
  }),
);

actionCentreRouter.patch(
  '/:id/resolve',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    const { remarks } = decisionSchema.parse(req.body);
    const request = await prisma.actionRequest.findUnique({ where: { id: req.params.id } });
    if (!request) throw ApiError.notFound('Request not found');
    if (request.requesterId === req.auth!.userId) throw ApiError.forbidden('You cannot resolve your own request');

    const updated = await prisma.actionRequest.update({
      where: { id: request.id },
      data: { status: ActionRequestStatus.RESOLVED, approverId: req.auth!.userId, remarks, resolvedAt: new Date() },
    });
    await notify({ userId: request.requesterId, category: NotificationCategory.GENERAL, title: 'Request resolved', message: remarks });
    res.json(updated);
  }),
);

/** Downloads the export generated for an approved DATA_ACCESS_REQUEST. */
actionCentreRouter.get(
  '/:id/export',
  asyncHandler(async (req, res) => {
    const request = await prisma.actionRequest.findUnique({ where: { id: req.params.id } });
    if (!request) throw ApiError.notFound('Request not found');
    if (request.requesterId !== req.auth!.userId && !ROLE_GROUPS.ADMIN_LIKE.includes(req.auth!.role)) throw ApiError.forbidden();

    const exportRecord = await prisma.dataExportRecord.findFirst({ where: { requestId: request.id }, orderBy: { createdAt: 'desc' } });
    if (!exportRecord) throw ApiError.notFound('No export has been generated for this request yet');

    const filePath = exportFilePath(exportRecord.filename);
    if (!fs.existsSync(filePath)) throw ApiError.notFound('Export file is no longer available on disk');
    res.download(filePath, exportRecord.filename);
  }),
);
