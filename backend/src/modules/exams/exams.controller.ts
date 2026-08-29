import { Router } from 'express';
import { ExamStatus, GradeStatus, NotificationCategory, QuestionType, RoleName } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate, authorize, ROLE_GROUPS } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { getPagination, paginatedResult } from '@/utils/pagination';
import { ApiError } from '@/utils/apiError';
import { generateExamPaperPdf } from '@/lib/pdf';
import { gradeLetterFor, round2 } from '@/modules/grades/grades.service';
import { getFacultyBatchIds, getParentStudentIds } from '@/utils/scope';
import { notify, notifyStudentParents } from '@/lib/notify';
import { recordAudit } from '@/lib/audit';

export const examsRouter = Router();
examsRouter.use(authenticate);

const examSchema = z.object({
  title: z.string().min(1),
  courseId: z.string().optional(),
  batchId: z.string(),
  subject: z.string().min(1),
  examDate: z.coerce.date().optional(),
  durationMinutes: z.number().int().positive().optional(),
  passMarks: z.number().int().min(0).optional(),
});

/** Hidden exam that stores reusable paper templates — excluded from normal exam listings. */
const PAPER_LIBRARY_TITLE = '__PAPER_LIBRARY__';

async function getOrCreatePaperLibraryExam(createdById: string) {
  let exam = await prisma.exam.findFirst({ where: { title: PAPER_LIBRARY_TITLE } });
  if (!exam) {
    const batch = await prisma.batch.findFirst({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } });
    if (!batch) throw ApiError.badRequest('No active batch exists to initialize the paper library');
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

examsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const pagination = getPagination(req, 25);
    const batchId = req.query.batchId as string | undefined;
    const status = req.query.status as ExamStatus | undefined;
    const where: Record<string, unknown> = {
      title: { not: PAPER_LIBRARY_TITLE },
      ...(batchId ? { batchId } : {}),
      ...(status ? { status } : {}),
    };

    if (!batchId && req.auth!.role === RoleName.STUDENT) {
      const student = await prisma.student.findUnique({ where: { id: req.auth!.studentId! }, select: { currentBatchId: true } });
      where.batchId = student?.currentBatchId ?? '__none__';
    } else if (!batchId && req.auth!.role === RoleName.PARENT) {
      const studentIds = await getParentStudentIds(req.auth!.parentId!);
      const students = await prisma.student.findMany({ where: { id: { in: studentIds } }, select: { currentBatchId: true } });
      where.batchId = { in: students.map((s) => s.currentBatchId).filter(Boolean) };
    } else if (!batchId && req.auth!.role === RoleName.FACULTY) {
      where.batchId = { in: await getFacultyBatchIds(req.auth!.facultyId!) };
    }

    const [items, total] = await Promise.all([
      prisma.exam.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: 'desc' },
        include: { batch: { select: { id: true, name: true } }, course: { select: { id: true, name: true } }, _count: { select: { papers: true, grades: true } } },
      }),
      prisma.exam.count({ where }),
    ]);
    res.json(paginatedResult(items, total, pagination));
  }),
);

// Fields returned for a question when it appears inside an exam — correctAnswer is deliberately
// excluded here and everywhere else in the API. It is never returned to any role, including staff
// marking long answers; automatic MCQ marking uses it server-side only, and is never surfaced.
const QUESTION_PUBLIC_FIELDS = {
  id: true,
  subject: true,
  topic: true,
  questionText: true,
  questionType: true,
  options: true,
  marks: true,
  rubric: true,
  createdAt: true,
} as const;

// ---------------------------------------------------------------------------
// Paper library — reusable papers created independently of scheduled exams.
// Must be registered before /:id so "papers" is not captured as an exam id.
// ---------------------------------------------------------------------------

examsRouter.get(
  '/papers/library',
  authorize(...ROLE_GROUPS.STAFF),
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

const libraryPaperSchema = z.object({ name: z.string().min(1), questionIds: z.array(z.string()).min(1) });

examsRouter.post(
  '/papers/library',
  authorize(...ROLE_GROUPS.STAFF),
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

examsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const exam = await prisma.exam.findUnique({
      where: { id: req.params.id },
      include: {
        batch: true,
        course: true,
        papers: {
          orderBy: { sequence: 'asc' },
          include: { examQuestions: { orderBy: { sequence: 'asc' }, include: { question: { select: QUESTION_PUBLIC_FIELDS } } } },
        },
      },
    });
    if (!exam) throw ApiError.notFound('Exam not found');

    if (req.auth!.role === RoleName.STUDENT) {
      const student = await prisma.student.findUnique({ where: { id: req.auth!.studentId! }, select: { currentBatchId: true } });
      if (student?.currentBatchId !== exam.batchId) throw ApiError.forbidden('This exam is not assigned to your batch');
    } else if (req.auth!.role === RoleName.PARENT) {
      const studentIds = await getParentStudentIds(req.auth!.parentId!);
      const students = await prisma.student.findMany({ where: { id: { in: studentIds } }, select: { currentBatchId: true } });
      if (!students.some((s) => s.currentBatchId === exam.batchId)) throw ApiError.forbidden('This exam is not assigned to your child\'s batch');
    }

    res.json(exam);
  }),
);

const attachLibrarySchema = z.object({ libraryPaperId: z.string(), name: z.string().optional() });

examsRouter.post(
  '/:id/papers/from-library',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const { libraryPaperId, name } = attachLibrarySchema.parse(req.body);
    const [targetExam, sourcePaper] = await Promise.all([
      prisma.exam.findUnique({ where: { id: req.params.id } }),
      prisma.paper.findUnique({
        where: { id: libraryPaperId },
        include: { examQuestions: { orderBy: { sequence: 'asc' } } },
      }),
    ]);
    if (!targetExam) throw ApiError.notFound('Exam not found');
    if (!sourcePaper) throw ApiError.notFound('Library paper not found');

    const count = await prisma.paper.count({ where: { examId: targetExam.id } });
    const paper = await prisma.paper.create({
      data: { examId: targetExam.id, name: name ?? sourcePaper.name, sequence: count + 1 },
    });
    for (const eq of sourcePaper.examQuestions) {
      await prisma.examQuestion.create({
        data: { paperId: paper.id, questionId: eq.questionId, sequence: eq.sequence, marks: eq.marks },
      });
    }
    const totalMarks = await recalcTotalMarks(targetExam.id);
    res.status(201).json({ paper, totalMarks });
  }),
);

examsRouter.post(
  '/',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const data = examSchema.parse(req.body);
    const exam = await prisma.exam.create({ data: { ...data, createdById: req.auth!.userId } });
    await prisma.paper.create({ data: { examId: exam.id, name: 'Paper 1', sequence: 1 } });
    await recordAudit({ entityType: 'Exam', entityId: exam.id, action: 'CREATE', actorId: req.auth!.userId, newValue: data });
    res.status(201).json(exam);
  }),
);

examsRouter.put(
  '/:id',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const data = examSchema.partial().parse(req.body);
    const exam = await prisma.exam.update({ where: { id: req.params.id }, data });
    res.json(exam);
  }),
);

examsRouter.patch(
  '/:id/status',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const { status } = z.object({ status: z.nativeEnum(ExamStatus) }).parse(req.body);
    const exam = await prisma.exam.update({ where: { id: req.params.id }, data: { status } });
    res.json(exam);
  }),
);

// ---------------------------------------------------------------------------
// Mark sheet workflow — a teacher submits marks for admin review; only after
// Admin accepts does the exam publish to students/parents. Teachers never
// publish directly.
// ---------------------------------------------------------------------------

examsRouter.get(
  '/marksheets/pending',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (_req, res) => {
    const exams = await prisma.exam.findMany({
      where: { status: ExamStatus.GRADED },
      orderBy: { updatedAt: 'desc' },
      include: { batch: { select: { id: true, name: true } }, _count: { select: { grades: true } } },
    });
    res.json(exams);
  }),
);

examsRouter.post(
  '/:id/marksheet/submit',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const exam = await prisma.exam.findUnique({ where: { id: req.params.id } });
    if (!exam) throw ApiError.notFound('Exam not found');
    const submittable = await prisma.grade.count({ where: { examId: exam.id, status: { in: [GradeStatus.DRAFT, GradeStatus.REJECTED] } } });
    if (submittable === 0) throw ApiError.badRequest('No marks are ready to submit for this exam');

    await prisma.grade.updateMany({
      where: { examId: exam.id, status: { in: [GradeStatus.DRAFT, GradeStatus.REJECTED] } },
      data: { status: GradeStatus.PENDING_APPROVAL, rejectionReason: null },
    });
    await prisma.exam.update({ where: { id: exam.id }, data: { status: ExamStatus.GRADED } });
    await recordAudit({ entityType: 'Exam', entityId: exam.id, action: 'MARKSHEET_SUBMIT', actorId: req.auth!.userId });
    res.status(204).end();
  }),
);

examsRouter.patch(
  '/:id/marksheet/accept',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    const exam = await prisma.exam.findUnique({ where: { id: req.params.id } });
    if (!exam) throw ApiError.notFound('Exam not found');
    if (exam.status !== ExamStatus.GRADED) throw ApiError.badRequest('No mark sheet is pending review for this exam');

    const grades = await prisma.grade.findMany({
      where: { examId: exam.id, status: GradeStatus.PENDING_APPROVAL },
      include: { student: true },
    });
    await prisma.grade.updateMany({
      where: { examId: exam.id, status: GradeStatus.PENDING_APPROVAL },
      data: { status: GradeStatus.PUBLISHED, publishedAt: new Date() },
    });
    await prisma.exam.update({ where: { id: exam.id }, data: { status: ExamStatus.PUBLISHED } });
    await recordAudit({ entityType: 'Exam', entityId: exam.id, action: 'MARKSHEET_ACCEPT', actorId: req.auth!.userId, newValue: { gradesPublished: grades.length } });

    for (const g of grades) {
      await notify({
        userId: g.student.userId,
        category: NotificationCategory.GRADE,
        title: 'Grade published',
        message: `Your result for "${exam.title}" is now available: ${g.percentage.toFixed(1)}% (${g.gradeLetter}).`,
      });
      await notifyStudentParents(g.studentId, {
        category: NotificationCategory.GRADE,
        title: 'Grade published',
        message: `Your child's result for "${exam.title}" is now available.`,
      });
    }
    res.status(204).end();
  }),
);

const rejectMarksheetSchema = z.object({ reason: z.string().min(3) });

examsRouter.patch(
  '/:id/marksheet/reject',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    const { reason } = rejectMarksheetSchema.parse(req.body);
    const exam = await prisma.exam.findUnique({ where: { id: req.params.id } });
    if (!exam) throw ApiError.notFound('Exam not found');
    if (exam.status !== ExamStatus.GRADED) throw ApiError.badRequest('No mark sheet is pending review for this exam');

    await prisma.grade.updateMany({
      where: { examId: exam.id, status: GradeStatus.PENDING_APPROVAL },
      data: { status: GradeStatus.REJECTED, rejectionReason: reason },
    });
    await prisma.exam.update({ where: { id: exam.id }, data: { status: ExamStatus.REJECTED } });
    await recordAudit({ entityType: 'Exam', entityId: exam.id, action: 'MARKSHEET_REJECT', actorId: req.auth!.userId, reason });

    await notify({
      userId: exam.createdById,
      category: NotificationCategory.GRADE,
      title: 'Mark sheet rejected',
      message: `Your mark sheet for "${exam.title}" was rejected: ${reason}`,
    });
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------
// Papers — an exam may carry more than one (e.g. Theory + Practical).
// ---------------------------------------------------------------------------

const paperSchema = z.object({ name: z.string().min(1), sequence: z.number().int().positive().optional() });

examsRouter.post(
  '/:id/papers',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const { name, sequence } = paperSchema.parse(req.body);
    const count = await prisma.paper.count({ where: { examId: req.params.id } });
    const paper = await prisma.paper.create({ data: { examId: req.params.id, name, sequence: sequence ?? count + 1 } });
    res.status(201).json(paper);
  }),
);

examsRouter.put(
  '/papers/:paperId',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const data = paperSchema.partial().parse(req.body);
    const paper = await prisma.paper.update({ where: { id: req.params.paperId }, data });
    res.json(paper);
  }),
);

examsRouter.delete(
  '/papers/:paperId',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const paper = await prisma.paper.findUnique({ where: { id: req.params.paperId } });
    if (!paper) throw ApiError.notFound('Paper not found');
    await prisma.paper.delete({ where: { id: paper.id } });
    await recalcTotalMarks(paper.examId);
    res.status(204).end();
  }),
);

const addQuestionSchema = z.object({ questionId: z.string(), marks: z.number().int().positive().optional() });

examsRouter.post(
  '/papers/:paperId/questions',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const { questionId, marks } = addQuestionSchema.parse(req.body);
    const [paper, question] = await Promise.all([
      prisma.paper.findUnique({ where: { id: req.params.paperId } }),
      prisma.question.findUnique({ where: { id: questionId } }),
    ]);
    if (!paper) throw ApiError.notFound('Paper not found');
    if (!question) throw ApiError.notFound('Question not found');

    const count = await prisma.examQuestion.count({ where: { paperId: paper.id } });
    const examQuestion = await prisma.examQuestion.create({
      data: { paperId: paper.id, questionId, sequence: count + 1, marks: marks ?? question.marks },
    });
    await prisma.question.update({ where: { id: questionId }, data: { usageCount: { increment: 1 } } });
    const totalMarks = await recalcTotalMarks(paper.examId);
    res.status(201).json({ examQuestion, totalMarks });
  }),
);

const reorderSchema = z.object({ order: z.array(z.object({ examQuestionId: z.string(), sequence: z.number().int(), marks: z.number().int().positive().optional() })) });

examsRouter.put(
  '/papers/:paperId/questions/reorder',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const { order } = reorderSchema.parse(req.body);
    const paper = await prisma.paper.findUnique({ where: { id: req.params.paperId } });
    if (!paper) throw ApiError.notFound('Paper not found');
    await prisma.$transaction(
      order.map((o) =>
        prisma.examQuestion.update({ where: { id: o.examQuestionId }, data: { sequence: o.sequence, ...(o.marks ? { marks: o.marks } : {}) } }),
      ),
    );
    const totalMarks = await recalcTotalMarks(paper.examId);
    res.json({ totalMarks });
  }),
);

examsRouter.delete(
  '/papers/:paperId/questions/:examQuestionId',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const paper = await prisma.paper.findUnique({ where: { id: req.params.paperId } });
    if (!paper) throw ApiError.notFound('Paper not found');
    await prisma.examQuestion.delete({ where: { id: req.params.examQuestionId } });
    const totalMarks = await recalcTotalMarks(paper.examId);
    res.json({ totalMarks });
  }),
);

/**
 * Generates the printable exam paper as a PDF (staff-only). There is no answer-key variant of this
 * action anywhere in the product — answer keys are never rendered, downloaded, or returned by any
 * route, to any role.
 */
examsRouter.get(
  '/:id/paper.pdf',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const exam = await prisma.exam.findUnique({
      where: { id: req.params.id },
      include: { batch: true, course: true, papers: { orderBy: { sequence: 'asc' }, include: { examQuestions: { orderBy: { sequence: 'asc' }, include: { question: { select: QUESTION_PUBLIC_FIELDS } } } } } },
    });
    if (!exam) throw ApiError.notFound('Exam not found');

    const questions = exam.papers.flatMap((p) => p.examQuestions);
    const doc = generateExamPaperPdf({
      title: exam.title,
      courseName: exam.course?.name,
      batchName: exam.batch.name,
      subject: exam.subject,
      examDate: exam.examDate,
      durationMinutes: exam.durationMinutes,
      totalMarks: exam.totalMarks,
      questions: questions.map((eq) => ({
        sequence: eq.sequence,
        questionText: eq.question.questionText,
        questionType: eq.question.questionType,
        marks: eq.marks,
        options: (eq.question.options as string[] | null) ?? undefined,
      })),
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${exam.title.replace(/[^a-z0-9]/gi, '_')}.pdf"`);
    doc.pipe(res);
    doc.end();
  }),
);

// ---------------------------------------------------------------------------
// Student answers — MCQ auto-marked on submission; long answers marked later against the rubric.
// ---------------------------------------------------------------------------

const submitAnswersSchema = z.object({
  answers: z
    .array(z.object({ questionId: z.string(), selectedOption: z.string().optional(), answerText: z.string().optional() }))
    .min(1),
});

examsRouter.post(
  '/:id/answers',
  authorize(RoleName.STUDENT),
  asyncHandler(async (req, res) => {
    const { answers } = submitAnswersSchema.parse(req.body);
    const studentId = req.auth!.studentId!;
    const results = [];
    for (const a of answers) {
      const question = await prisma.question.findUnique({ where: { id: a.questionId } });
      if (!question) throw ApiError.notFound(`Question ${a.questionId} not found`);

      const isMcq = question.questionType === QuestionType.MCQ;
      const isCorrect = isMcq ? a.selectedOption === question.correctAnswer : null;
      const examQuestion = await prisma.examQuestion.findFirst({ where: { questionId: question.id, paper: { examId: req.params.id } } });
      const marksAwarded = isMcq ? (isCorrect ? examQuestion?.marks ?? question.marks : 0) : null;

      const answer = await prisma.studentAnswer.upsert({
        where: { examId_questionId_studentId: { examId: req.params.id, questionId: question.id, studentId } },
        create: {
          examId: req.params.id,
          questionId: question.id,
          studentId,
          selectedOption: a.selectedOption,
          answerText: a.answerText,
          isCorrect,
          marksAwarded,
        },
        update: { selectedOption: a.selectedOption, answerText: a.answerText, isCorrect, marksAwarded, submittedAt: new Date() },
      });
      results.push({ id: answer.id, questionId: answer.questionId, isCorrect: answer.isCorrect });
    }
    res.status(201).json(results);
  }),
);

const gradeAnswerSchema = z.object({
  marksAwarded: z.number().min(0),
  rubricScores: z.array(z.object({ criterion: z.string(), marks: z.number().min(0) })).optional(),
});

/** Rubric-assisted marking for a long-answer StudentAnswer. */
examsRouter.patch(
  '/answers/:answerId/grade',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const { marksAwarded, rubricScores } = gradeAnswerSchema.parse(req.body);
    const answer = await prisma.studentAnswer.update({
      where: { id: req.params.answerId },
      data: { marksAwarded, rubricScores, gradedById: req.auth!.userId, gradedAt: new Date() },
    });
    res.json(answer);
  }),
);

/**
 * Combines every auto-marked MCQ answer and every rubric-marked long answer for one student into a
 * single Grade record, scaled to 100. Fails if any answer is still ungraded (marksAwarded null).
 */
examsRouter.post(
  '/:id/finalize-grade/:studentId',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const exam = await prisma.exam.findUnique({ where: { id: req.params.id } });
    if (!exam) throw ApiError.notFound('Exam not found');
    if (exam.totalMarks <= 0) throw ApiError.badRequest('Exam has no marks configured');

    const answers = await prisma.studentAnswer.findMany({ where: { examId: exam.id, studentId: req.params.studentId } });
    if (answers.length === 0) throw ApiError.badRequest('No answers submitted for this student');
    if (answers.some((a) => a.marksAwarded === null)) throw ApiError.badRequest('All long-answer responses must be graded before finalizing');

    const marksObtained = answers.reduce((s, a) => s + (a.marksAwarded ?? 0), 0);
    const percentage = round2((marksObtained / exam.totalMarks) * 100);
    const passThreshold = exam.passMarks ?? Math.ceil(exam.totalMarks * 0.4);

    const existing = await prisma.grade.findFirst({ where: { examId: exam.id, studentId: req.params.studentId } });
    if (existing?.status === 'PUBLISHED') throw ApiError.badRequest('This exam is already published for this student');

    const payload = {
      marksObtained,
      percentage,
      gradeLetter: gradeLetterFor(percentage),
      passed: marksObtained >= passThreshold,
      enteredById: req.auth!.userId,
      enteredAt: new Date(),
    };
    const grade = existing
      ? await prisma.grade.update({ where: { id: existing.id }, data: payload })
      : await prisma.grade.create({ data: { examId: exam.id, studentId: req.params.studentId, ...payload } });
    res.json(grade);
  }),
);
