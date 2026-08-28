import { Router } from 'express';
import { RoleName, GradeStatus } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate, authorize, ROLE_GROUPS } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/apiError';
import { recordAudit } from '@/lib/audit';
import { assertStudentAccess, getParentStudentIds } from '@/utils/scope';
import { gradeLetterFor, round2 } from './grades.service';

export const gradesRouter = Router();
gradesRouter.use(authenticate);

const bulkGradeSchema = z.object({
  records: z.array(z.object({ studentId: z.string(), marksObtained: z.number().min(0), remarks: z.string().optional() })).min(1),
});

gradesRouter.post(
  '/exam/:examId/bulk',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const { records } = bulkGradeSchema.parse(req.body);
    const exam = await prisma.exam.findUnique({ where: { id: req.params.examId } });
    if (!exam) throw ApiError.notFound('Exam not found');
    if (exam.totalMarks <= 0) throw ApiError.badRequest('Add questions to the exam before entering marks');

    const passThreshold = exam.passMarks ?? Math.ceil(exam.totalMarks * 0.4);
    const results = [];
    for (const r of records) {
      if (r.marksObtained > exam.totalMarks) throw ApiError.badRequest(`Marks for ${r.studentId} exceed total marks (${exam.totalMarks})`);
      const percentage = round2((r.marksObtained / exam.totalMarks) * 100);
      const payload = {
        marksObtained: r.marksObtained,
        percentage,
        gradeLetter: gradeLetterFor(percentage),
        passed: r.marksObtained >= passThreshold,
        remarks: r.remarks,
        enteredById: req.auth!.userId,
        enteredAt: new Date(),
      };
      const existing = await prisma.grade.findFirst({ where: { examId: exam.id, studentId: r.studentId } });
      if (existing) {
        if (existing.status === GradeStatus.PUBLISHED) {
          throw ApiError.badRequest('This exam is already published; use the correction endpoint with a reason to amend a published grade');
        }
        results.push(await prisma.grade.update({ where: { id: existing.id }, data: payload }));
      } else {
        results.push(await prisma.grade.create({ data: { examId: exam.id, studentId: r.studentId, ...payload } }));
      }
    }
    res.status(201).json(results);
  }),
);

gradesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const examId = req.query.examId as string | undefined;
    const studentId = req.query.studentId as string | undefined;
    const batchId = req.query.batchId as string | undefined;

    if (studentId) await assertStudentAccess(req.auth!, studentId);

    const where: Record<string, unknown> = {
      ...(examId ? { examId } : {}),
      ...(studentId ? { studentId } : {}),
      ...(batchId ? { exam: { batchId } } : {}),
    };

    if (req.auth!.role === RoleName.STUDENT && !studentId) {
      where.studentId = req.auth!.studentId;
      where.status = GradeStatus.PUBLISHED;
    } else if (req.auth!.role === RoleName.PARENT && !studentId) {
      where.studentId = { in: await getParentStudentIds(req.auth!.parentId!) };
      where.status = GradeStatus.PUBLISHED;
    }

    const grades = await prisma.grade.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { exam: { select: { id: true, title: true, subject: true, totalMarks: true, examDate: true } }, student: { select: { id: true, firstName: true, lastName: true, studentCode: true } } },
    });
    res.json(grades);
  }),
);

/** Batch comparison / exam performance summary. */
gradesRouter.get(
  '/exam/:examId/summary',
  authorize(...ROLE_GROUPS.STAFF, RoleName.MANAGEMENT),
  asyncHandler(async (req, res) => {
    const grades = await prisma.grade.findMany({ where: { examId: req.params.examId } });
    if (grades.length === 0) return res.json({ count: 0, average: 0, highest: 0, lowest: 0, passRate: 0 });
    const percentages = grades.map((g) => g.percentage);
    res.json({
      count: grades.length,
      average: Math.round((percentages.reduce((a, b) => a + b, 0) / percentages.length) * 10) / 10,
      highest: Math.max(...percentages),
      lowest: Math.min(...percentages),
      passRate: Math.round((grades.filter((g) => g.passed).length / grades.length) * 1000) / 10,
    });
  }),
);

// Submission, admin review (accept/reject) and publishing now live under the exams
// mark-sheet workflow (`/exams/:id/marksheet/...`) — teachers never publish directly.

const correctionSchema = z.object({ marksObtained: z.number().min(0), reason: z.string().min(3) });

/**
 * Grades are never silently overwritten — every change (including on published grades) is audited.
 * Once a grade is published, only Super Admin or Academic Admin may correct it (per the 4.0 issue
 * log's "performance marks editable by Admin and Super Admin"); other staff may still correct
 * draft/pending grades entered in error before publication.
 */
gradesRouter.patch(
  '/:id',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const { marksObtained, reason } = correctionSchema.parse(req.body);
    const grade = await prisma.grade.findUnique({ where: { id: req.params.id }, include: { exam: true } });
    if (!grade) throw ApiError.notFound('Grade not found');
    if (grade.status === GradeStatus.PUBLISHED && !ROLE_GROUPS.ADMIN_LIKE.includes(req.auth!.role)) {
      throw ApiError.forbidden('Only Super Admin or Academic Admin may correct a published grade');
    }
    if (marksObtained > grade.exam.totalMarks) throw ApiError.badRequest(`Marks exceed total marks (${grade.exam.totalMarks})`);

    const percentage = round2((marksObtained / grade.exam.totalMarks) * 100);
    const passThreshold = grade.exam.passMarks ?? Math.ceil(grade.exam.totalMarks * 0.4);
    const updated = await prisma.grade.update({
      where: { id: grade.id },
      data: { marksObtained, percentage, gradeLetter: gradeLetterFor(percentage), passed: marksObtained >= passThreshold },
    });

    await recordAudit({
      entityType: 'Grade',
      entityId: grade.id,
      action: 'CORRECT',
      actorId: req.auth!.userId,
      oldValue: { marksObtained: grade.marksObtained, percentage: grade.percentage },
      newValue: { marksObtained, percentage },
      reason,
    });

    res.json(updated);
  }),
);
