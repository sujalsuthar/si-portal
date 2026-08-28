import { Router } from 'express';
import { RoleName, StudentStatus, ConsentType } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate, authorize, ROLE_GROUPS } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { getPagination, paginatedResult } from '@/utils/pagination';
import { recordAudit } from '@/lib/audit';
import { ApiError } from '@/utils/apiError';
import { createUserAccount } from '@/modules/users/account.service';
import { assertStudentAccess, getFacultyBatchIds, getParentStudentIds } from '@/utils/scope';
import { computeStudentComposite } from '@/lib/scoring';

export const studentsRouter = Router();
studentsRouter.use(authenticate);

const createStudentSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.coerce.date().optional(),
  gender: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  parentName: z.string().optional(),
  parentMobile: z.string().optional(),
  parentAltMobile: z.string().optional(),
  studentCode: z.string().min(1),
  courseId: z.string().optional(),
  currentBatchId: z.string().optional(),
  mentorFacultyId: z.string().optional(),
  joiningDate: z.coerce.date().optional(),
  parentIds: z.array(z.string()).default([]),
  // Enrolment is blocked without this (UR-DPP-02): the institute may not begin processing a
  // student's personal data before consent is captured.
  dataProcessingConsent: z.object({
    granted: z.literal(true, { errorMap: () => ({ message: 'Data processing consent must be granted to enrol a student' }) }),
    noticeVersion: z.string().min(1),
  }),
});

const updateStudentSchema = createStudentSchema
  .omit({ email: true, studentCode: true, parentIds: true, currentBatchId: true, dataProcessingConsent: true })
  .partial();

studentsRouter.get(
  '/',
  authorize(...ROLE_GROUPS.STAFF, RoleName.MANAGEMENT, RoleName.PARENT),
  asyncHandler(async (req, res) => {
    const pagination = getPagination(req);
    const search = (req.query.search as string) ?? '';
    const status = req.query.status as StudentStatus | undefined;
    const batchId = req.query.batchId as string | undefined;
    const courseId = req.query.courseId as string | undefined;
    const studentType = req.query.studentType as 'STUDENT' | 'INTERN' | undefined;

    const where: Record<string, unknown> = {
      ...(status ? { status } : {}),
      ...(batchId ? { currentBatchId: batchId } : {}),
      ...(courseId ? { courseId } : {}),
      ...(studentType ? { internStatus: studentType === 'INTERN' ? { not: null } : null } : {}),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' as const } },
              { lastName: { contains: search, mode: 'insensitive' as const } },
              { studentCode: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    if (req.auth!.role === RoleName.FACULTY) {
      const batchIds = await getFacultyBatchIds(req.auth!.facultyId!);
      where.OR = [{ currentBatchId: { in: batchIds } }, { mentorFacultyId: req.auth!.facultyId }];
      if (batchId && !batchIds.includes(batchId)) throw ApiError.forbidden('You are not assigned to this batch');
    }
    if (req.auth!.role === RoleName.PARENT) {
      const studentIds = await getParentStudentIds(req.auth!.parentId!);
      where.id = { in: studentIds };
    }

    const [items, total] = await Promise.all([
      prisma.student.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { firstName: 'asc' },
        include: {
          course: { select: { id: true, name: true } },
          currentBatch: { select: { id: true, name: true } },
          mentorFaculty: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.student.count({ where }),
    ]);

    res.json(paginatedResult(items, total, pagination));
  }),
);

studentsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    await assertStudentAccess(req.auth!, req.params.id);
    const student = await prisma.student.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { email: true, isActive: true, lastLoginAt: true } },
        course: true,
        currentBatch: { include: { course: true } },
        mentorFaculty: { select: { id: true, firstName: true, lastName: true } },
        parents: { include: { parent: { include: { user: { select: { email: true } } } } } },
      },
    });
    if (!student) throw ApiError.notFound('Student not found');
    res.json(student);
  }),
);

studentsRouter.post(
  '/',
  authorize(RoleName.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const data = createStudentSchema.parse(req.body);

    const result = await prisma.$transaction(async (tx) => {
      const { userId, tempPassword } = await createUserAccount(tx, data.email, RoleName.STUDENT);
      const student = await tx.student.create({
        data: {
          userId,
          studentCode: data.studentCode,
          firstName: data.firstName,
          lastName: data.lastName,
          dateOfBirth: data.dateOfBirth,
          gender: data.gender,
          phone: data.phone,
          address: data.address,
          emergencyContactName: data.emergencyContactName,
          emergencyContactPhone: data.emergencyContactPhone,
          parentName: data.parentName,
          parentMobile: data.parentMobile,
          parentAltMobile: data.parentAltMobile,
          courseId: data.courseId,
          currentBatchId: data.currentBatchId,
          mentorFacultyId: data.mentorFacultyId,
          joiningDate: data.joiningDate ?? new Date(),
        },
      });
      if (data.parentIds.length > 0) {
        await tx.studentParent.createMany({
          data: data.parentIds.map((parentId) => ({ studentId: student.id, parentId })),
          skipDuplicates: true,
        });
      }
      await tx.consentRecord.create({
        data: {
          studentId: student.id,
          consentType: ConsentType.DATA_PROCESSING,
          granted: true,
          noticeVersion: data.dataProcessingConsent.noticeVersion,
          grantedById: req.auth!.userId,
        },
      });
      return { student, tempPassword };
    });

    await recordAudit({ entityType: 'Student', entityId: result.student.id, action: 'CREATE', actorId: req.auth!.userId, newValue: data });
    res.status(201).json(result);
  }),
);

studentsRouter.put(
  '/:id',
  authorize(RoleName.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const data = updateStudentSchema.parse(req.body);
    const before = await prisma.student.findUnique({ where: { id: req.params.id } });
    if (!before) throw ApiError.notFound('Student not found');
    const student = await prisma.student.update({ where: { id: req.params.id }, data });
    await recordAudit({ entityType: 'Student', entityId: student.id, action: 'UPDATE', actorId: req.auth!.userId, oldValue: before, newValue: data });
    res.json(student);
  }),
);

studentsRouter.patch(
  '/:id/status',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    const { status } = z.object({ status: z.nativeEnum(StudentStatus) }).parse(req.body);
    const before = await prisma.student.findUnique({ where: { id: req.params.id } });
    if (!before) throw ApiError.notFound('Student not found');
    const student = await prisma.student.update({
      where: { id: req.params.id },
      data: { status, archivedAt: status === StudentStatus.ARCHIVED ? new Date() : null },
    });
    if (status !== StudentStatus.ACTIVE) {
      await prisma.user.update({ where: { id: student.userId }, data: { isActive: false } });
    } else {
      await prisma.user.update({ where: { id: student.userId }, data: { isActive: true } });
    }
    await recordAudit({
      entityType: 'Student',
      entityId: student.id,
      action: 'STATUS_CHANGE',
      actorId: req.auth!.userId,
      oldValue: { status: before.status },
      newValue: { status },
    });
    res.json(student);
  }),
);

/** Student 360°: the single most important screen — a coherent, chronological academic timeline. */
studentsRouter.get(
  '/:id/timeline',
  asyncHandler(async (req, res) => {
    await assertStudentAccess(req.auth!, req.params.id);
    const studentId = req.params.id;

    const [
      attendances,
      grades,
      submissions,
      behaviourEvents,
      presentations,
      certifications,
      certificates,
      transfers,
      selfAssessments,
      interventionCases,
    ] = await Promise.all([
      prisma.attendance.findMany({ where: { studentId }, orderBy: { markedAt: 'desc' }, take: 50, include: { session: true, exam: true } }),
      prisma.grade.findMany({ where: { studentId }, orderBy: { createdAt: 'desc' }, include: { exam: true } }),
      prisma.taskSubmission.findMany({ where: { studentId }, orderBy: { createdAt: 'desc' }, include: { task: true } }),
      prisma.behaviourEvent.findMany({ where: { studentId }, orderBy: { eventDate: 'desc' } }),
      prisma.presentation.findMany({ where: { studentId }, orderBy: { scheduledDate: 'desc' } }),
      prisma.certification.findMany({ where: { studentId }, orderBy: { createdAt: 'desc' } }),
      prisma.certificate.findMany({ where: { studentId }, orderBy: { issueDate: 'desc' } }),
      prisma.batchTransfer.findMany({ where: { studentId }, orderBy: { createdAt: 'desc' }, include: { fromBatch: true, toBatch: true } }),
      prisma.selfAssessment.findMany({ where: { studentId }, orderBy: { submittedAt: 'desc' } }),
      req.auth!.role === RoleName.STUDENT || req.auth!.role === RoleName.PARENT
        ? Promise.resolve([])
        : prisma.interventionCase.findMany({ where: { studentId }, orderBy: { createdAt: 'desc' } }),
    ]);

    const composite = await computeStudentComposite(studentId);

    type TimelineEvent = { type: string; date: Date; summary: string; data: unknown };
    const events: TimelineEvent[] = [
      ...attendances.map((a) => ({
        type: 'ATTENDANCE',
        date: a.markedAt,
        summary: `${a.context === 'EXAM' ? 'Exam' : 'Session'} attendance: ${a.status}`,
        data: a,
      })),
      ...grades.map((g) => ({ type: 'GRADE', date: g.createdAt, summary: `Grade for ${g.exam.title}: ${g.percentage.toFixed(1)}%`, data: g })),
      ...submissions
        .filter((s) => s.submittedAt)
        .map((s) => ({ type: 'TASK', date: s.submittedAt as Date, summary: `Submitted task: ${s.task.title}`, data: s })),
      ...behaviourEvents.map((b) => ({ type: 'BEHAVIOUR', date: b.eventDate, summary: `${b.type === 'POSITIVE' ? '+' : ''}${b.points} pts — ${b.category}`, data: b })),
      ...presentations.map((p) => ({ type: 'PRESENTATION', date: p.scheduledDate, summary: `Presentation: ${p.topic} (${p.status})`, data: p })),
      ...certifications.map((c) => ({ type: 'CERTIFICATION', date: c.createdAt, summary: `${c.name}: ${c.status}`, data: c })),
      ...certificates.map((c) => ({ type: 'CERTIFICATE', date: c.issueDate, summary: `Certificate issued: ${c.title}`, data: c })),
      ...transfers.map((t) => ({ type: 'BATCH_TRANSFER', date: t.createdAt, summary: `Batch transfer: ${t.fromBatch?.name ?? '—'} → ${t.toBatch.name} (${t.status})`, data: t })),
      ...selfAssessments.map((s) => ({ type: 'SELF_ASSESSMENT', date: s.submittedAt, summary: `Self-assessment (${s.periodLabel})`, data: s })),
    ].sort((a, b) => b.date.getTime() - a.date.getTime());

    res.json({
      composite,
      timeline: events.slice(0, 100),
      counts: {
        attendances: attendances.length,
        grades: grades.length,
        tasks: submissions.length,
        behaviourEvents: behaviourEvents.length,
        presentations: presentations.length,
        certifications: certifications.length,
        certificates: certificates.length,
      },
      interventionCases,
    });
  }),
);

/**
 * Month-by-month exam-performance trend for a year (4.1: "All month performance History for
 * yearly evaluation"). Computed on demand from published grades — no separate snapshot storage.
 */
studentsRouter.get(
  '/:id/monthly-performance',
  asyncHandler(async (req, res) => {
    await assertStudentAccess(req.auth!, req.params.id);
    const year = Number(req.query.year ?? new Date().getFullYear());
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59);

    const grades = await prisma.grade.findMany({
      where: { studentId: req.params.id, status: 'PUBLISHED', createdAt: { gte: yearStart, lte: yearEnd } },
      select: { createdAt: true, percentage: true },
    });

    const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, avgPercentage: null as number | null, examCount: 0 }));
    for (const g of grades) {
      const m = months[g.createdAt.getMonth()];
      m.examCount += 1;
      m.avgPercentage = m.avgPercentage === null ? g.percentage : m.avgPercentage + g.percentage;
    }
    for (const m of months) {
      if (m.examCount > 0) m.avgPercentage = Math.round((m.avgPercentage! / m.examCount) * 10) / 10;
    }
    res.json({ year, months });
  }),
);

studentsRouter.get(
  '/:id/composite-score',
  asyncHandler(async (req, res) => {
    await assertStudentAccess(req.auth!, req.params.id);
    const composite = await computeStudentComposite(req.params.id);
    res.json(composite);
  }),
);
