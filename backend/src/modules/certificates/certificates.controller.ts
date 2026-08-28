import { Router } from 'express';
import crypto from 'crypto';
import { RoleName, CertificateStatus, NotificationCategory } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate, authorize, ROLE_GROUPS } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/apiError';
import { recordAudit } from '@/lib/audit';
import { assertStudentAccess, getParentStudentIds } from '@/utils/scope';
import { generateVerificationQrDataUrl } from '@/lib/qrcode';
import { generateCertificatePdf } from '@/lib/pdf';
import { generateCertificateSvg } from '@/lib/certificateSvg';
import { notify, notifyStudentParents } from '@/lib/notify';
import { computeStudentComposite, getScoringConfig } from '@/lib/scoring';

export const certificatesRouter = Router();
certificatesRouter.use(authenticate);

function generateCertificateNumber(): string {
  const year = new Date().getFullYear();
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `SI-${year}-${random}`;
}

/**
 * Eligibility (all three mandatory per UR-CRT-07/FR-CRT-06/C6.7): attendance at/above the
 * institute threshold, no open high/critical academic hold, and the course marked complete
 * (the student's current batch status is COMPLETED).
 */
async function checkCertificateEligibility(studentId: string): Promise<{ eligible: boolean; reasons: string[] }> {
  const config = await getScoringConfig();
  const reasons: string[] = [];

  const { attendancePct } = await computeStudentComposite(studentId);
  if (attendancePct < config.attendanceThreshold) {
    reasons.push(`Attendance ${attendancePct.toFixed(1)}% is below the ${config.attendanceThreshold}% threshold`);
  }

  const hold = await prisma.interventionCase.findFirst({
    where: { studentId, status: { in: ['OPEN', 'IN_PROGRESS'] }, severity: { in: ['HIGH', 'CRITICAL'] } },
  });
  if (hold) reasons.push('An open high/critical support case is on file');

  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { currentBatch: { select: { status: true } } } });
  if (student?.currentBatch?.status !== 'COMPLETED') {
    reasons.push('The course has not yet been marked complete for this student’s batch');
  }

  return { eligible: reasons.length === 0, reasons };
}

const createSchema = z.object({
  studentId: z.string(),
  courseId: z.string().optional(),
  batchId: z.string().optional(),
  title: z.string().min(1),
  completionDate: z.coerce.date(),
});

certificatesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const studentId = req.query.studentId as string | undefined;
    const status = req.query.status as CertificateStatus | undefined;
    if (studentId) await assertStudentAccess(req.auth!, studentId);

    const where: Record<string, unknown> = { ...(studentId ? { studentId } : {}), ...(status ? { status } : {}) };
    if (req.auth!.role === RoleName.STUDENT && !studentId) where.studentId = req.auth!.studentId;
    if (req.auth!.role === RoleName.PARENT && !studentId) where.studentId = { in: await getParentStudentIds(req.auth!.parentId!) };

    const items = await prisma.certificate.findMany({
      where,
      orderBy: { issueDate: 'desc' },
      include: { student: { select: { id: true, firstName: true, lastName: true, studentCode: true } }, batch: { select: { name: true } } },
    });
    res.json(items);
  }),
);

async function issueCertificate(input: {
  studentId: string;
  courseId?: string;
  batchId?: string;
  title: string;
  completionDate: Date;
  issuedById: string;
}) {
  const student = await prisma.student.findUnique({ where: { id: input.studentId } });
  if (!student) throw ApiError.notFound('Student not found');

  const certificateNumber = generateCertificateNumber();
  const qrCodeDataUrl = await generateVerificationQrDataUrl(certificateNumber);

  const certificate = await prisma.certificate.create({
    data: {
      certificateNumber,
      studentId: input.studentId,
      courseId: input.courseId,
      batchId: input.batchId,
      title: input.title,
      completionDate: input.completionDate,
      qrCodeDataUrl,
      issuedById: input.issuedById,
    },
  });

  await recordAudit({ entityType: 'Certificate', entityId: certificate.id, action: 'ISSUE', actorId: input.issuedById, newValue: { certificateNumber } });

  await notify({
    userId: student.userId,
    category: NotificationCategory.CERTIFICATE,
    title: 'Certificate issued',
    message: `Your certificate "${input.title}" has been issued (No. ${certificateNumber}).`,
  });
  await notifyStudentParents(student.id, {
    category: NotificationCategory.CERTIFICATE,
    title: 'Certificate issued',
    message: `A certificate "${input.title}" has been issued for your child.`,
  });

  return certificate;
}

certificatesRouter.post(
  '/',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    const certificate = await issueCertificate({ ...data, issuedById: req.auth!.userId });
    res.status(201).json(certificate);
  }),
);

const bulkSchema = z.object({
  batchId: z.string(),
  title: z.string().min(1),
  completionDate: z.coerce.date(),
});

/** Eligibility preview for a would-be bulk issue — no certificates are created. */
certificatesRouter.get(
  '/bulk/eligibility',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    const batchId = req.query.batchId as string;
    if (!batchId) throw ApiError.badRequest('batchId is required');
    const students = await prisma.student.findMany({ where: { currentBatchId: batchId, status: 'ACTIVE' } });
    const results = await Promise.all(
      students.map(async (s) => ({
        studentId: s.id,
        name: `${s.firstName} ${s.lastName}`,
        studentCode: s.studentCode,
        ...(await checkCertificateEligibility(s.id)),
      })),
    );
    res.json(results);
  }),
);

/** Bulk-issues certificates to every eligible active student in a batch; skips the rest with a reason. */
certificatesRouter.post(
  '/bulk',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    const data = bulkSchema.parse(req.body);
    const students = await prisma.student.findMany({ where: { currentBatchId: data.batchId, status: 'ACTIVE' } });
    if (students.length === 0) throw ApiError.badRequest('No active students in this batch');

    const results = [];
    for (const s of students) {
      const { eligible, reasons } = await checkCertificateEligibility(s.id);
      if (!eligible) {
        results.push({ studentId: s.id, name: `${s.firstName} ${s.lastName}`, issued: false, reasons });
        continue;
      }
      const certificate = await issueCertificate({
        studentId: s.id,
        batchId: data.batchId,
        title: data.title,
        completionDate: data.completionDate,
        issuedById: req.auth!.userId,
      });
      results.push({ studentId: s.id, name: `${s.firstName} ${s.lastName}`, issued: true, certificateNumber: certificate.certificateNumber });
    }
    res.status(201).json(results);
  }),
);

certificatesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const certificate = await prisma.certificate.findUnique({ where: { id: req.params.id }, include: { student: true, batch: true } });
    if (!certificate) throw ApiError.notFound('Certificate not found');
    await assertStudentAccess(req.auth!, certificate.studentId);
    res.json(certificate);
  }),
);

certificatesRouter.get(
  '/:id/pdf',
  asyncHandler(async (req, res) => {
    const certificate = await prisma.certificate.findUnique({ where: { id: req.params.id }, include: { student: true, batch: true } });
    if (!certificate) throw ApiError.notFound('Certificate not found');
    await assertStudentAccess(req.auth!, certificate.studentId);
    if (!certificate.qrCodeDataUrl) throw ApiError.badRequest('Certificate is missing its QR code');

    const doc = generateCertificatePdf({
      studentName: `${certificate.student.firstName} ${certificate.student.lastName}`,
      courseName: certificate.title,
      batchName: certificate.batch?.name,
      completionDate: certificate.completionDate,
      issueDate: certificate.issueDate,
      certificateNumber: certificate.certificateNumber,
      qrDataUrl: certificate.qrCodeDataUrl,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="certificate-${certificate.certificateNumber}.pdf"`);
    doc.pipe(res);
    doc.end();
  }),
);

certificatesRouter.get(
  '/:id/image',
  asyncHandler(async (req, res) => {
    const certificate = await prisma.certificate.findUnique({ where: { id: req.params.id }, include: { student: true, batch: true } });
    if (!certificate) throw ApiError.notFound('Certificate not found');
    await assertStudentAccess(req.auth!, certificate.studentId);

    const svg = generateCertificateSvg({
      studentName: `${certificate.student.firstName} ${certificate.student.lastName}`,
      courseName: certificate.title,
      batchName: certificate.batch?.name,
      completionDate: certificate.completionDate,
      issueDate: certificate.issueDate,
      certificateNumber: certificate.certificateNumber,
    });

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Content-Disposition', `attachment; filename="certificate-${certificate.certificateNumber}.svg"`);
    res.send(svg);
  }),
);

const revokeSchema = z.object({ reason: z.string().min(3) });

certificatesRouter.patch(
  '/:id/revoke',
  authorize(RoleName.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const { reason } = revokeSchema.parse(req.body);
    const certificate = await prisma.certificate.findUnique({ where: { id: req.params.id } });
    if (!certificate) throw ApiError.notFound('Certificate not found');

    const updated = await prisma.certificate.update({
      where: { id: certificate.id },
      data: { status: CertificateStatus.REVOKED, revokedReason: reason, revokedById: req.auth!.userId, revokedAt: new Date() },
    });

    await recordAudit({
      entityType: 'Certificate',
      entityId: certificate.id,
      action: 'REVOKE',
      actorId: req.auth!.userId,
      oldValue: { status: certificate.status },
      newValue: { status: CertificateStatus.REVOKED },
      reason,
    });

    res.json(updated);
  }),
);
