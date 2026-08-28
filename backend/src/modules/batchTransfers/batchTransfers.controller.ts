import { Router } from 'express';
import { RoleName, TransferStatus, NotificationCategory } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate, authorize, ROLE_GROUPS } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { getPagination, paginatedResult } from '@/utils/pagination';
import { recordAudit } from '@/lib/audit';
import { ApiError } from '@/utils/apiError';
import { notify, notifyStudentParents } from '@/lib/notify';

export const batchTransfersRouter = Router();
batchTransfersRouter.use(authenticate);

const requestSchema = z.object({
  studentId: z.string(),
  toBatchId: z.string(),
  reason: z.string().min(3),
  effectiveDate: z.coerce.date(),
});

batchTransfersRouter.get(
  '/',
  authorize(...ROLE_GROUPS.STAFF, RoleName.MANAGEMENT),
  asyncHandler(async (req, res) => {
    const pagination = getPagination(req);
    const status = req.query.status as TransferStatus | undefined;
    const studentId = req.query.studentId as string | undefined;
    const where = { ...(status ? { status } : {}), ...(studentId ? { studentId } : {}) };
    const [items, total] = await Promise.all([
      prisma.batchTransfer.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: 'desc' },
        include: {
          student: { select: { id: true, firstName: true, lastName: true, studentCode: true } },
          fromBatch: { select: { id: true, name: true } },
          toBatch: { select: { id: true, name: true } },
        },
      }),
      prisma.batchTransfer.count({ where }),
    ]);
    res.json(paginatedResult(items, total, pagination));
  }),
);

batchTransfersRouter.post(
  '/',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const data = requestSchema.parse(req.body);
    const student = await prisma.student.findUnique({ where: { id: data.studentId } });
    if (!student) throw ApiError.notFound('Student not found');

    const transfer = await prisma.batchTransfer.create({
      data: {
        studentId: data.studentId,
        fromBatchId: student.currentBatchId,
        toBatchId: data.toBatchId,
        reason: data.reason,
        effectiveDate: data.effectiveDate,
        requestedById: req.auth!.userId,
      },
    });

    await recordAudit({ entityType: 'BatchTransfer', entityId: transfer.id, action: 'REQUEST', actorId: req.auth!.userId, newValue: data });
    res.status(201).json(transfer);
  }),
);

batchTransfersRouter.patch(
  '/:id/approve',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    const transfer = await prisma.batchTransfer.findUnique({ where: { id: req.params.id }, include: { toBatch: true, student: true } });
    if (!transfer) throw ApiError.notFound('Transfer request not found');
    if (transfer.status !== TransferStatus.PENDING) throw ApiError.badRequest('Only pending transfers can be approved');

    const [updated] = await prisma.$transaction([
      prisma.batchTransfer.update({
        where: { id: transfer.id },
        data: { status: TransferStatus.APPROVED, approvedById: req.auth!.userId, approvedAt: new Date() },
      }),
      prisma.student.update({ where: { id: transfer.studentId }, data: { currentBatchId: transfer.toBatchId } }),
    ]);

    await recordAudit({
      entityType: 'BatchTransfer',
      entityId: transfer.id,
      action: 'APPROVE',
      actorId: req.auth!.userId,
      oldValue: { batchId: transfer.fromBatchId },
      newValue: { batchId: transfer.toBatchId },
      reason: transfer.reason,
    });

    const studentUser = await prisma.user.findUnique({ where: { id: transfer.student.userId } });
    if (studentUser) {
      await notify({
        userId: studentUser.id,
        category: NotificationCategory.BATCH_TRANSFER,
        title: 'Batch transfer approved',
        message: `You have been transferred to ${transfer.toBatch.name}, effective ${transfer.effectiveDate.toDateString()}.`,
      });
    }
    await notifyStudentParents(transfer.studentId, {
      category: NotificationCategory.BATCH_TRANSFER,
      title: 'Batch transfer approved',
      message: `Your child has been transferred to ${transfer.toBatch.name}, effective ${transfer.effectiveDate.toDateString()}.`,
    });

    res.json(updated);
  }),
);

const rejectSchema = z.object({ reason: z.string().min(3).optional() });

batchTransfersRouter.patch(
  '/:id/reject',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    const { reason } = rejectSchema.parse(req.body);
    const transfer = await prisma.batchTransfer.findUnique({ where: { id: req.params.id } });
    if (!transfer) throw ApiError.notFound('Transfer request not found');
    if (transfer.status !== TransferStatus.PENDING) throw ApiError.badRequest('Only pending transfers can be rejected');

    const updated = await prisma.batchTransfer.update({
      where: { id: transfer.id },
      data: { status: TransferStatus.REJECTED, approvedById: req.auth!.userId, approvedAt: new Date() },
    });
    await recordAudit({ entityType: 'BatchTransfer', entityId: transfer.id, action: 'REJECT', actorId: req.auth!.userId, reason });
    res.json(updated);
  }),
);
