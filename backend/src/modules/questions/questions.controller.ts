import { Router } from 'express';
import { QuestionType } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate, authorize, ROLE_GROUPS } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { getPagination, paginatedResult } from '@/utils/pagination';
import { ApiError } from '@/utils/apiError';

export const questionsRouter = Router();
questionsRouter.use(authenticate, authorize(...ROLE_GROUPS.STAFF));

// The stored answer/model-answer is never returned by this API — to any role, in any context,
// including staff browsing the bank. It is used server-side only, by the automatic MCQ-marking path.
const QUESTION_RESPONSE_FIELDS = {
  id: true,
  courseId: true,
  subject: true,
  topic: true,
  questionText: true,
  questionType: true,
  options: true,
  marks: true,
  rubric: true,
  tags: true,
  createdById: true,
  isActive: true,
  usageCount: true,
  createdAt: true,
  updatedAt: true,
} as const;

const rubricSchema = z.array(z.object({ criterion: z.string().min(1), maxMarks: z.number().positive() }));

const questionObjectSchema = z.object({
  courseId: z.string().optional(),
  subject: z.string().optional(),
  topic: z.string().optional(),
  questionText: z.string().min(1),
  questionType: z.nativeEnum(QuestionType),
  options: z.array(z.string()).optional(),
  correctAnswer: z.string().optional(),
  marks: z.union([z.literal(1), z.literal(10)]).optional(),
  rubric: rubricSchema.optional(),
  tags: z.array(z.string()).default([]),
});

function defaultMarksFor(questionType: QuestionType) {
  return questionType === QuestionType.MCQ ? 1 : 10;
}

const questionSchema = questionObjectSchema.refine(
  (d) => d.questionType !== QuestionType.MCQ || (d.options && d.options.length >= 2 && d.correctAnswer),
  { message: 'MCQ questions require at least two options and a correct answer' },
);

questionsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const pagination = getPagination(req, 25);
    const subject = req.query.subject as string | undefined;
    const topic = req.query.topic as string | undefined;
    const questionType = req.query.questionType as QuestionType | undefined;
    const search = (req.query.search as string) ?? '';

    const where = {
      isActive: true,
      ...(subject ? { subject } : {}),
      ...(topic ? { topic } : {}),
      ...(questionType ? { questionType } : {}),
      ...(search ? { questionText: { contains: search, mode: 'insensitive' as const } } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.question.findMany({ where, skip: pagination.skip, take: pagination.take, orderBy: { createdAt: 'desc' }, select: QUESTION_RESPONSE_FIELDS }),
      prisma.question.count({ where }),
    ]);
    res.json(paginatedResult(items, total, pagination));
  }),
);

questionsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const question = await prisma.question.findUnique({ where: { id: req.params.id }, select: QUESTION_RESPONSE_FIELDS });
    if (!question) throw ApiError.notFound('Question not found');
    res.json(question);
  }),
);

questionsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = questionSchema.parse(req.body);
    const marks = data.marks ?? defaultMarksFor(data.questionType);
    const question = await prisma.question.create({ data: { ...data, marks, createdById: req.auth!.userId }, select: QUESTION_RESPONSE_FIELDS });
    res.status(201).json(question);
  }),
);

questionsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = questionObjectSchema.partial().parse(req.body);
    const question = await prisma.question.update({ where: { id: req.params.id }, data, select: QUESTION_RESPONSE_FIELDS });
    res.json(question);
  }),
);

questionsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await prisma.question.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.status(204).end();
  }),
);

questionsRouter.get(
  '/meta/subjects',
  asyncHandler(async (_req, res) => {
    const subjects = await prisma.question.findMany({ where: { isActive: true }, select: { subject: true }, distinct: ['subject'] });
    res.json(subjects.map((s) => s.subject));
  }),
);
