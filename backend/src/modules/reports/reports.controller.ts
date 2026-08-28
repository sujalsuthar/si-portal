import { Router } from 'express';
import { RoleName, AttendanceContext, AttendanceStatus, GradeStatus, TaskStatus, StudentStatus } from '@prisma/client';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate, authorize } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { sendExcel } from '@/lib/excel';
import { computeStudentComposite } from '@/lib/scoring';
import { ApiError } from '@/utils/apiError';

export const reportsRouter = Router();
// Faculty/Team no longer has Reports access — restricted to admin-level roles per the 4.0 issue log.
reportsRouter.use(authenticate, authorize(RoleName.SUPER_ADMIN, RoleName.ACADEMIC_ADMIN, RoleName.MANAGEMENT, RoleName.ACCOUNTS));

reportsRouter.get(
  '/students.xlsx',
  asyncHandler(async (req, res) => {
    const batchId = req.query.batchId as string | undefined;
    const students = await prisma.student.findMany({
      where: { status: StudentStatus.ACTIVE, ...(batchId ? { currentBatchId: batchId } : {}) },
      include: { course: true, currentBatch: true },
    });
    const rows = await Promise.all(
      students.map(async (s) => {
        const composite = await computeStudentComposite(s.id);
        return {
          studentCode: s.studentCode,
          name: `${s.firstName} ${s.lastName}`,
          course: s.course?.name ?? '',
          batch: s.currentBatch?.name ?? '',
          attendancePct: composite.attendancePct,
          examPct: composite.examPct,
          taskPct: composite.taskPct,
          behaviourPct: composite.behaviourPct,
          compositeScore: composite.composite,
        };
      }),
    );
    await sendExcel(
      res,
      'student-report',
      [
        { header: 'Student Code', key: 'studentCode', width: 16 },
        { header: 'Name', key: 'name', width: 24 },
        { header: 'Course', key: 'course', width: 20 },
        { header: 'Batch', key: 'batch', width: 18 },
        { header: 'Attendance %', key: 'attendancePct', width: 14 },
        { header: 'Exam %', key: 'examPct', width: 12 },
        { header: 'Task %', key: 'taskPct', width: 12 },
        { header: 'Behaviour %', key: 'behaviourPct', width: 14 },
        { header: 'Composite Score', key: 'compositeScore', width: 16 },
      ],
      rows,
    );
  }),
);

reportsRouter.get(
  '/batches.xlsx',
  asyncHandler(async (_req, res) => {
    const batches = await prisma.batch.findMany({ include: { course: true, _count: { select: { students: true } } } });
    const rows = await Promise.all(
      batches.map(async (b) => {
        const attendances = await prisma.attendance.findMany({ where: { student: { currentBatchId: b.id }, context: AttendanceContext.SESSION } });
        const grades = await prisma.grade.findMany({ where: { exam: { batchId: b.id }, status: GradeStatus.PUBLISHED } });
        const avgAttendance = attendances.length
          ? (attendances.filter((a) => a.status === AttendanceStatus.PRESENT || a.status === AttendanceStatus.LATE).length / attendances.length) * 100
          : 0;
        const avgExam = grades.length ? grades.reduce((s, g) => s + g.percentage, 0) / grades.length : 0;
        return {
          batch: b.name,
          course: b.course.name,
          strength: b._count.students,
          status: b.status,
          avgAttendancePct: Math.round(avgAttendance * 10) / 10,
          avgExamPct: Math.round(avgExam * 10) / 10,
        };
      }),
    );
    await sendExcel(
      res,
      'batch-report',
      [
        { header: 'Batch', key: 'batch', width: 20 },
        { header: 'Course', key: 'course', width: 20 },
        { header: 'Strength', key: 'strength', width: 10 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Avg Attendance %', key: 'avgAttendancePct', width: 16 },
        { header: 'Avg Exam %', key: 'avgExamPct', width: 14 },
      ],
      rows,
    );
  }),
);

reportsRouter.get(
  '/attendance.xlsx',
  asyncHandler(async (req, res) => {
    const batchId = req.query.batchId as string | undefined;
    const records = await prisma.attendance.findMany({
      where: { context: AttendanceContext.SESSION, ...(batchId ? { student: { currentBatchId: batchId } } : {}) },
      include: { student: true, session: true },
      orderBy: { markedAt: 'desc' },
      take: 5000,
    });
    await sendExcel(
      res,
      'attendance-report',
      [
        { header: 'Date', key: 'date', width: 14 },
        { header: 'Student', key: 'student', width: 24 },
        { header: 'Student Code', key: 'studentCode', width: 16 },
        { header: 'Session', key: 'subject', width: 18 },
        { header: 'Status', key: 'status', width: 12 },
      ],
      records.map((r) => ({
        date: r.markedAt.toDateString(),
        student: `${r.student.firstName} ${r.student.lastName}`,
        studentCode: r.student.studentCode,
        subject: r.session?.topic ?? '',
        status: r.status,
      })),
    );
  }),
);

reportsRouter.get(
  '/exam-performance.xlsx',
  asyncHandler(async (req, res) => {
    const examId = req.query.examId as string | undefined;
    if (!examId) throw ApiError.badRequest('examId is required');
    const grades = await prisma.grade.findMany({ where: { examId }, include: { student: true, exam: true } });
    await sendExcel(
      res,
      'exam-performance-report',
      [
        { header: 'Student', key: 'student', width: 24 },
        { header: 'Student Code', key: 'studentCode', width: 16 },
        { header: 'Marks', key: 'marks', width: 12 },
        { header: 'Percentage', key: 'percentage', width: 12 },
        { header: 'Grade', key: 'grade', width: 10 },
        { header: 'Pass/Fail', key: 'passed', width: 12 },
      ],
      grades.map((g) => ({
        student: `${g.student.firstName} ${g.student.lastName}`,
        studentCode: g.student.studentCode,
        marks: g.marksObtained,
        percentage: Math.round(g.percentage * 10) / 10,
        grade: g.gradeLetter,
        passed: g.passed ? 'Pass' : 'Fail',
      })),
    );
  }),
);

reportsRouter.get(
  '/task-completion.xlsx',
  asyncHandler(async (req, res) => {
    const batchId = req.query.batchId as string | undefined;
    const tasks = await prisma.task.findMany({ where: batchId ? { batchId } : {}, include: { submissions: true, assignments: true } });
    await sendExcel(
      res,
      'task-completion-report',
      [
        { header: 'Task', key: 'task', width: 28 },
        { header: 'Due Date', key: 'dueDate', width: 14 },
        { header: 'Assigned', key: 'assigned', width: 12 },
        { header: 'Submitted', key: 'submitted', width: 12 },
        { header: 'Evaluated', key: 'evaluated', width: 12 },
        { header: 'Late', key: 'late', width: 10 },
        { header: 'Completion %', key: 'completionPct', width: 14 },
      ],
      tasks.map((t) => {
        const submitted = t.submissions.filter((s) => s.status === TaskStatus.SUBMITTED || s.status === TaskStatus.EVALUATED).length;
        return {
          task: t.title,
          dueDate: t.dueDate.toDateString(),
          assigned: t.assignments.length,
          submitted,
          evaluated: t.submissions.filter((s) => s.status === TaskStatus.EVALUATED).length,
          late: t.submissions.filter((s) => s.status === TaskStatus.LATE).length,
          completionPct: t.assignments.length ? Math.round((submitted / t.assignments.length) * 1000) / 10 : 0,
        };
      }),
    );
  }),
);

reportsRouter.get(
  '/behaviour.xlsx',
  asyncHandler(async (req, res) => {
    const batchId = req.query.batchId as string | undefined;
    const events = await prisma.behaviourEvent.findMany({
      where: batchId ? { student: { currentBatchId: batchId } } : {},
      include: { student: true },
      orderBy: { eventDate: 'desc' },
      take: 5000,
    });
    await sendExcel(
      res,
      'behaviour-report',
      [
        { header: 'Date', key: 'date', width: 14 },
        { header: 'Student', key: 'student', width: 24 },
        { header: 'Category', key: 'category', width: 16 },
        { header: 'Type', key: 'type', width: 10 },
        { header: 'Points', key: 'points', width: 10 },
        { header: 'Reason', key: 'reason', width: 30 },
      ],
      events.map((e) => ({
        date: e.eventDate.toDateString(),
        student: `${e.student.firstName} ${e.student.lastName}`,
        category: e.category,
        type: e.type,
        points: e.points,
        reason: e.reason,
      })),
    );
  }),
);

reportsRouter.get(
  '/interns.xlsx',
  asyncHandler(async (req, res) => {
    const batchId = req.query.batchId as string | undefined;
    const interns = await prisma.student.findMany({
      where: { internStatus: { not: null }, ...(batchId ? { currentBatchId: batchId } : {}) },
      include: {
        mentorFaculty: { select: { firstName: true, lastName: true } },
        currentBatch: { select: { name: true } },
        internRatings: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { internPromotedAt: 'desc' },
    });
    await sendExcel(
      res,
      'intern-report',
      [
        { header: 'Name', key: 'name', width: 24 },
        { header: 'Student Code', key: 'studentCode', width: 16 },
        { header: 'Batch', key: 'batch', width: 18 },
        { header: 'Mentor', key: 'mentor', width: 22 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Work Status', key: 'workStatus', width: 20 },
        { header: 'Latest Rating Avg', key: 'ratingAvg', width: 16 },
      ],
      interns.map((s) => {
        const latest = s.internRatings[0];
        const ratingAvg = latest ? Math.round(((latest.behaviourScore + latest.technicalScore + latest.projectScore) / 3) * 10) / 10 : '';
        return {
          name: `${s.firstName} ${s.lastName}`,
          studentCode: s.studentCode,
          batch: s.currentBatch?.name ?? '',
          mentor: s.mentorFaculty ? `${s.mentorFaculty.firstName} ${s.mentorFaculty.lastName}` : '',
          status: s.internStatus,
          workStatus: s.internFrozen ? 'Paused — Review Pending' : 'Active',
          ratingAvg,
        };
      }),
    );
  }),
);

// Certification Report and Certificate Verification Report were removed from the Reports screen
// per the 4.0 issue log.
