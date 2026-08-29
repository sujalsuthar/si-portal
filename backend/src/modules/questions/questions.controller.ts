import { Router } from 'express';
import { QuestionType } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate, authorize, ROLE_GROUPS } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { getPagination, paginatedResult } from '@/utils/pagination';
import { ApiError } from '@/utils/apiError';
import { uploadExcel } from '@/middleware/upload';
import { excelField, parseExcelUpload } from '@/lib/excel';

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

function parseQuestionType(raw: string): QuestionType | null {
  const normalized = raw.trim().toUpperCase().replace(/\s+/g, '_');
  if (normalized === 'MCQ' || normalized === 'MULTIPLE_CHOICE') return QuestionType.MCQ;
  if (normalized === 'LONG_ANSWER' || normalized === 'LONGANSWER' || normalized === 'LONG') return QuestionType.LONG_ANSWER;
  return null;
}

function parseMarks(raw: string, questionType: QuestionType): number {
  const n = Number(raw);
  if (n === 1 || n === 10) return n;
  return defaultMarksFor(questionType);
}

function parseRubric(raw: string) {
  return raw
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [criterion, maxMarks] = line.split('|').map((s) => s.trim());
      return { criterion, maxMarks: Number(maxMarks) || 0 };
    })
    .filter((r) => r.criterion && r.maxMarks > 0);
}

function parseMcqOptions(row: Record<string, string>): string[] {
  const combined = excelField(row, 'options', 'option');
  if (combined) {
    return combined.split('|').map((o) => o.trim()).filter(Boolean);
  }
  const numbered: string[] = [];
  for (let i = 1; i <= 8; i++) {
    const value = excelField(row, `option${i}`, `option ${i}`, `option${String.fromCharCode(64 + i)}`);
    if (value) numbered.push(value);
  }
  return numbered;
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

/** Bulk-import questions from an Excel spreadsheet. */
questionsRouter.post(
  '/bulk-import',
  uploadExcel.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file?.buffer) throw ApiError.badRequest('Upload an Excel file (.xlsx)');

    const rows = await parseExcelUpload(req.file.buffer);
    if (rows.length === 0) throw ApiError.badRequest('The spreadsheet is empty or missing a header row');

    let created = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      const questionText = excelField(row, 'questionText', 'question text', 'question');
      const typeRaw = excelField(row, 'questionType', 'question type', 'type');
      const topic = excelField(row, 'topic', 'subject') || undefined;

      if (!questionText) {
        errors.push(`Row ${rowNum}: missing question text`);
        continue;
      }

      const questionType = parseQuestionType(typeRaw || 'MCQ');
      if (!questionType) {
        errors.push(`Row ${rowNum}: type must be MCQ or LONG_ANSWER`);
        continue;
      }

      const marks = parseMarks(excelField(row, 'marks', 'mark'), questionType);
      const options = questionType === QuestionType.MCQ ? parseMcqOptions(row) : undefined;
      const correctAnswer = excelField(row, 'correctAnswer', 'correct answer', 'answer') || undefined;
      const rubricRaw = excelField(row, 'rubric');
      const rubric = questionType === QuestionType.LONG_ANSWER && rubricRaw ? parseRubric(rubricRaw) : undefined;

      if (questionType === QuestionType.MCQ) {
        if (!options || options.length < 2) {
          errors.push(`Row ${rowNum}: MCQ needs at least 2 options (use Options column with | separators or Option1..Option4 columns)`);
          continue;
        }
        if (!correctAnswer || !options.includes(correctAnswer)) {
          errors.push(`Row ${rowNum}: correct answer must match one of the options exactly`);
          continue;
        }
      }

      try {
        await prisma.question.create({
          data: {
            questionText,
            questionType,
            marks,
            topic,
            options,
            correctAnswer: questionType === QuestionType.MCQ ? correctAnswer : undefined,
            rubric: rubric?.length ? rubric : undefined,
            createdById: req.auth!.userId,
          },
        });
        created++;
      } catch (err) {
        errors.push(`Row ${rowNum}: ${err instanceof Error ? err.message : 'Failed to import'}`);
      }
    }

    res.status(201).json({ created, errors });
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
