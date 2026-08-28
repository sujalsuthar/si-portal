import { Router } from 'express';
import { ConsentType, RoleName } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate, ROLE_GROUPS } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/apiError';
import { assertStudentAccess } from '@/utils/scope';
import { recordAudit } from '@/lib/audit';

export const consentRouter = Router();
consentRouter.use(authenticate);

const createSchema = z.object({
  studentId: z.string(),
  consentType: z.nativeEnum(ConsentType),
  granted: z.boolean(),
  noticeVersion: z.string().min(1),
});

/** PARENTAL consent may only be captured by a parent or staff; DATA_PROCESSING may be self-recorded by the student too. */
function assertConsentActorAllowed(role: RoleName, consentType: ConsentType) {
  if (ROLE_GROUPS.ADMIN_LIKE.includes(role) || role === RoleName.FACULTY) return;
  if (consentType === ConsentType.PARENTAL && role === RoleName.PARENT) return;
  if (consentType === ConsentType.DATA_PROCESSING && role === RoleName.STUDENT) return;
  throw ApiError.forbidden('Your role cannot record this consent type');
}

consentRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    await assertStudentAccess(req.auth!, data.studentId);
    assertConsentActorAllowed(req.auth!.role, data.consentType);

    const record = await prisma.consentRecord.create({
      data: { ...data, grantedById: req.auth!.userId },
    });

    // Explicit refusal blocks further processing immediately; granting DATA_PROCESSING consent
    // (initial or renewed after a withdrawal) lifts any existing suspension.
    if (data.consentType === ConsentType.DATA_PROCESSING) {
      await prisma.student.update({ where: { id: data.studentId }, data: { dataProcessingSuspended: !data.granted } });
    }

    await recordAudit({ entityType: 'ConsentRecord', entityId: record.id, action: 'CREATE', actorId: req.auth!.userId, newValue: data });
    res.status(201).json(record);
  }),
);

consentRouter.get(
  '/:studentId',
  asyncHandler(async (req, res) => {
    await assertStudentAccess(req.auth!, req.params.studentId);
    const records = await prisma.consentRecord.findMany({
      where: { studentId: req.params.studentId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(records);
  }),
);

consentRouter.patch(
  '/:id/withdraw',
  asyncHandler(async (req, res) => {
    const record = await prisma.consentRecord.findUnique({ where: { id: req.params.id } });
    if (!record) throw ApiError.notFound('Consent record not found');
    await assertStudentAccess(req.auth!, record.studentId);
    if (record.withdrawnAt) throw ApiError.badRequest('Consent already withdrawn');

    const updated = await prisma.consentRecord.update({ where: { id: record.id }, data: { withdrawnAt: new Date() } });

    // Withdrawing DATA_PROCESSING consent must stop further processing of this student's data
    // until a fresh consent is captured.
    if (record.consentType === ConsentType.DATA_PROCESSING) {
      await prisma.student.update({ where: { id: record.studentId }, data: { dataProcessingSuspended: true } });
    }

    await recordAudit({ entityType: 'ConsentRecord', entityId: record.id, action: 'WITHDRAW', actorId: req.auth!.userId });
    res.json(updated);
  }),
);
