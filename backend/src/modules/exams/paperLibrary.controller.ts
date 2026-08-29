import { Router } from 'express';
import { ExamStatus } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate, authorize, ROLE_GROUPS } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/apiError';

export const paperLibraryRouter = Router();
paperLibraryRouter.use(authenticate, authorize(...ROLE_GROUPS.STAFF));

const PAPER_LIBRARY_TITLE = '__PAPER_LIBRARY__';

async function getOrCreatePaperLibraryExam(createdById: string) {
  let exam = await prisma.exam.findFirst({ where: { title: PAPER_LIBRARY_TITLE } });
  if (!exam) {
    const batch = await prisma.batch.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!batch) throw ApiError.badRequest('Create at least one batch before saving papers to the library');
    exam = await prisma.exam.create({
      data: { title: PAPER_LIBRARY_TITLE, batchId: batch.id, subject: 'Paper Library', createdById, status: ExamStatus.DRAFT },
    });
  }
  return exam;
}

async function recalcTotalMarks(examId: string) {
  const papers = await prisma.paper.findMany({ where: { examId }, include: { examQuestions: true } });
  for (const paper of papers) {
    const paperTotal = paper.examQuestions.reduce((s, q) => s + q.marks, 0);
    if (paperTotal !== paper.totalMarks) await prisma.paper.update({ where: { id: paper.id }, data: { totalMarks: paperTotal } });
  }
  const totalMarks = papers.reduce((s, p) => s + p.examQuestions.reduce((ps, q) => ps + q.marks, 0), 0);
  await prisma.exam.update({ where: { id: examId }, data: { totalMarks } });
  return totalMarks;
}

const libraryPaperSchema = z.object({ name: z.string().min(1), questionIds: z.array(z.string()).min(1) });

paperLibraryRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const exam = await getOrCreatePaperLibraryExam(req.auth!.userId);
    const papers = await prisma.paper.findMany({
      where: { examId: exam.id },
      orderBy: { sequence: 'asc' },
      include: { _count: { select: { examQuestions: true } } },
    });
    res.json(papers);
  }),
);

paperLibraryRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, questionIds } = libraryPaperSchema.parse(req.body);
    const exam = await getOrCreatePaperLibraryExam(req.auth!.userId);
    const count = await prisma.paper.count({ where: { examId: exam.id } });
    const paper = await prisma.paper.create({ data: { examId: exam.id, name, sequence: count + 1 } });
    for (const [index, questionId] of questionIds.entries()) {
      const question = await prisma.question.findUnique({ where: { id: questionId } });
      if (!question) throw ApiError.notFound(`Question ${questionId} not found`);
      await prisma.examQuestion.create({
        data: { paperId: paper.id, questionId, sequence: index + 1, marks: question.marks },
      });
      await prisma.question.update({ where: { id: questionId }, data: { usageCount: { increment: 1 } } });
    }
    await recalcTotalMarks(exam.id);
    res.status(201).json(paper);
  }),
);
