import { Router } from 'express';
import { RoleName, SelfAssessmentApprovalStatus } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate, authorize, ROLE_GROUPS } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { assertStudentAccess } from '@/utils/scope';
import { ApiError } from '@/utils/apiError';

export const selfAssessmentsRouter = Router();
selfAssessmentsRouter.use(authenticate);

// Redesigned per the 4.0 issue log: a student requests approval for an external topic/platform,
// rather than submitting a periodic confidence rating.
const createSchema = z.object({
  topicOrSkill: z.string().min(1),
  platform: z.string().optional(),
  link: z.string().min(1),
});

selfAssessmentsRouter.post(
  '/',
  authorize(RoleName.STUDENT),
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    const assessment = await prisma.selfAssessment.create({
      data: { ...data, periodLabel: new Date().toISOString().slice(0, 7), studentId: req.auth!.studentId! },
    });
    res.status(201).json(assessment);
  }),
);

const decideSchema = z.object({ approvalStatus: z.enum([SelfAssessmentApprovalStatus.APPROVED, SelfAssessmentApprovalStatus.REJECTED]) });

selfAssessmentsRouter.patch(
  '/:id/decision',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const { approvalStatus } = decideSchema.parse(req.body);
    const assessment = await prisma.selfAssessment.update({
      where: { id: req.params.id },
      data: { approvalStatus, decidedById: req.auth!.userId, decidedAt: new Date() },
    });
    res.json(assessment);
  }),
);

selfAssessmentsRouter.get(
  '/student/:studentId',
  asyncHandler(async (req, res) => {
    await assertStudentAccess(req.auth!, req.params.studentId);
    const items = await prisma.selfAssessment.findMany({ where: { studentId: req.params.studentId }, orderBy: { submittedAt: 'desc' } });
    res.json(items);
  }),
);

/** Compares self-perceived confidence with actual measured performance (exam average). */
selfAssessmentsRouter.get(
  '/student/:studentId/compare',
  asyncHandler(async (req, res) => {
    await assertStudentAccess(req.auth!, req.params.studentId);
    const [allAssessments, grades] = await Promise.all([
      prisma.selfAssessment.findMany({ where: { studentId: req.params.studentId }, orderBy: { submittedAt: 'asc' } }),
      prisma.grade.findMany({ where: { studentId: req.params.studentId, status: 'PUBLISHED' }, orderBy: { createdAt: 'asc' } }),
    ]);
    // Only pre-redesign records carry a confidence rating — newer Approval Request entries don't.
    const rated = allAssessments.filter((a) => a.confidenceRating !== null);
    if (rated.length === 0) throw ApiError.notFound('No self-assessments recorded yet');
    const avgConfidencePct = (rated.reduce((s, a) => s + a.confidenceRating!, 0) / rated.length / 5) * 100;
    const avgActualPct = grades.length > 0 ? grades.reduce((s, g) => s + g.percentage, 0) / grades.length : null;
    res.json({
      averageSelfConfidencePct: Math.round(avgConfidencePct * 10) / 10,
      averageActualPerformancePct: avgActualPct !== null ? Math.round(avgActualPct * 10) / 10 : null,
      gap: avgActualPct !== null ? Math.round((avgConfidencePct - avgActualPct) * 10) / 10 : null,
      series: rated.map((a) => ({ period: a.periodLabel, confidenceRating: a.confidenceRating })),
    });
  }),
);
