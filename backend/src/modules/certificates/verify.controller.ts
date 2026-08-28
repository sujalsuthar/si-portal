import { Router } from 'express';
import { prisma } from '@/lib/prisma';
import { asyncHandler } from '@/utils/asyncHandler';
import { ApiError } from '@/utils/apiError';
import { logger } from '@/lib/logger';

export const publicVerifyRouter = Router();

/**
 * Public certificate verification — no login required (business rule: must work without portal login).
 * Exposes only the minimum required fields; never leaks student contact info, internal notes, or ids.
 * Rate-limited at the app level (see app.ts's verifyLimiter); failed lookups are logged here so an
 * enumeration attempt (many misses from one source) is visible in the logs (4.0 issue log, item 12,
 * Option A).
 */
publicVerifyRouter.get(
  '/:certificateNumber',
  asyncHandler(async (req, res) => {
    const certificate = await prisma.certificate.findUnique({
      where: { certificateNumber: req.params.certificateNumber },
      include: { student: { select: { firstName: true, lastName: true } }, batch: { select: { name: true } } },
    });
    if (!certificate) {
      logger.warn('Public certificate verify miss', { certificateNumber: req.params.certificateNumber, ip: req.ip });
      throw ApiError.notFound('No certificate found with this number');
    }

    await prisma.certificate.update({ where: { id: certificate.id }, data: { verificationCount: { increment: 1 } } });

    res.json({
      certificateNumber: certificate.certificateNumber,
      studentName: `${certificate.student.firstName} ${certificate.student.lastName}`,
      title: certificate.title,
      batchName: certificate.batch?.name ?? null,
      completionDate: certificate.completionDate,
      issueDate: certificate.issueDate,
      status: certificate.status,
      revokedReason: certificate.status === 'REVOKED' ? certificate.revokedReason : undefined,
    });
  }),
);
