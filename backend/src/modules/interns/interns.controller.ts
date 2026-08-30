import { Router } from 'express';
import { RoleName, InternStatus, LeaveStatus, NotificationCategory, ConsentType } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate, authorize, ROLE_GROUPS } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/apiError';
import { recordAudit } from '@/lib/audit';
import { assertStudentAccess } from '@/utils/scope';
import { getScoringConfig } from '@/lib/scoring';
import { notify } from '@/lib/notify';
import { sendExcel } from '@/lib/excel';
import { createUserAccount } from '@/modules/users/account.service';

export const internsRouter = Router();
internsRouter.use(authenticate);

internsRouter.get(
  '/',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const status = req.query.status as InternStatus | undefined;
    const where: Record<string, unknown> = status ? { internStatus: status } : { internStatus: { not: null } };
    if (req.auth!.role === RoleName.FACULTY) where.mentorFacultyId = req.auth!.facultyId;

    const interns = await prisma.student.findMany({
      where,
      include: { mentorFaculty: { select: { id: true, firstName: true, lastName: true } }, currentBatch: { select: { name: true } } },
      orderBy: { internPromotedAt: 'desc' },
    });
    res.json(interns);
  }),
);

/** Intern report, scoped to the caller: Team/Faculty gets their own mentored interns, admin-level gets everyone. */
internsRouter.get(
  '/report.xlsx',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const where: Record<string, unknown> = { internStatus: { not: null } };
    if (req.auth!.role === RoleName.FACULTY) where.mentorFacultyId = req.auth!.facultyId;

    const interns = await prisma.student.findMany({
      where,
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

internsRouter.get(
  '/:studentId',
  asyncHandler(async (req, res) => {
    await assertStudentAccess(req.auth!, req.params.studentId);
    const student = await prisma.student.findUnique({
      where: { id: req.params.studentId },
      include: {
        mentorFaculty: { select: { id: true, firstName: true, lastName: true } },
        internMentorHistory: { orderBy: { assignedAt: 'desc' }, include: { mentor: { select: { firstName: true, lastName: true } } } },
        internStateChanges: { orderBy: { createdAt: 'desc' } },
        internLeaveRequests: { orderBy: { createdAt: 'desc' } },
        // Rating narratives are excluded here for non-staff viewers at the query level, not filtered client-side.
        ...(ROLE_GROUPS.STAFF.includes(req.auth!.role) ? { internRatings: { orderBy: { createdAt: 'desc' } } } : {}),
      },
    });
    if (!student) throw ApiError.notFound('Student not found');
    res.json(student);
  }),
);

const promoteSchema = z.object({ studentId: z.string(), mentorId: z.string(), effectiveDate: z.coerce.date().optional() });

const registerInternSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  studentCode: z.string().min(1).optional(),
  mentorId: z.string(),
  phone: z.string().optional(),
  currentBatchId: z.string().optional(),
  dataProcessingConsent: z.object({
    granted: z.literal(true, { errorMap: () => ({ message: 'Data processing consent must be granted to register an intern' }) }),
    noticeVersion: z.string().min(1),
  }),
});

/** Register someone who is not already a student as a new intern (creates account + student record). */
internsRouter.post(
  '/register',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    const data = registerInternSchema.parse(req.body);
    const studentCode = data.studentCode ?? `INT-${Date.now().toString(36).toUpperCase()}`;

    const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
    if (existingUser) throw ApiError.badRequest('A user with this email already exists');

    const existingCode = await prisma.student.findUnique({ where: { studentCode } });
    if (existingCode) throw ApiError.badRequest('Student code already in use');

    const faculty = await prisma.faculty.findUnique({ where: { id: data.mentorId } });
    if (!faculty) throw ApiError.notFound('Mentor not found');

    const result = await prisma.$transaction(async (tx) => {
      const { userId, tempPassword } = await createUserAccount(tx, data.email, RoleName.STUDENT);
      const student = await tx.student.create({
        data: {
          userId,
          studentCode,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          currentBatchId: data.currentBatchId,
          mentorFacultyId: data.mentorId,
          internStatus: InternStatus.ACTIVE,
          internPromotedAt: new Date(),
          joiningDate: new Date(),
        },
      });
      await tx.internMentorHistory.create({
        data: { studentId: student.id, mentorId: data.mentorId, assignedById: req.auth!.userId },
      });
      await tx.internStateChange.create({
        data: { studentId: student.id, fromState: null, toState: InternStatus.ACTIVE, actorId: req.auth!.userId },
      });
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

    await recordAudit({
      entityType: 'Student',
      entityId: result.student.id,
      action: 'INTERN_REGISTER',
      actorId: req.auth!.userId,
      newValue: { ...data, studentCode },
    });
    await notify({
      userId: result.student.userId,
      category: NotificationCategory.GENERAL,
      title: 'Welcome to the Intern programme',
      message: 'Your intern account has been created. Sign in with your email to get started.',
    });
    res.status(201).json(result);
  }),
);

internsRouter.post(
  '/promote',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    const data = promoteSchema.parse(req.body);
    const student = await prisma.student.findUnique({ where: { id: data.studentId } });
    if (!student) throw ApiError.notFound('Student not found');
    if (student.internStatus === InternStatus.ACTIVE) throw ApiError.badRequest('Student is already an active intern');

    const [updated] = await prisma.$transaction([
      prisma.student.update({
        where: { id: data.studentId },
        data: { internStatus: InternStatus.ACTIVE, internPromotedAt: data.effectiveDate ?? new Date(), mentorFacultyId: data.mentorId },
      }),
      prisma.internMentorHistory.create({ data: { studentId: data.studentId, mentorId: data.mentorId, assignedById: req.auth!.userId } }),
      prisma.internStateChange.create({ data: { studentId: data.studentId, fromState: student.internStatus, toState: InternStatus.ACTIVE, actorId: req.auth!.userId } }),
    ]);

    await recordAudit({ entityType: 'Student', entityId: data.studentId, action: 'INTERN_PROMOTE', actorId: req.auth!.userId, newValue: data });
    await notify({ userId: student.userId, category: NotificationCategory.GENERAL, title: 'Promoted to Intern', message: 'You have been promoted to Intern status.' });
    res.json(updated);
  }),
);

const demoteSchema = z.object({ reason: z.string().min(3) });

internsRouter.patch(
  '/:studentId/demote',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    const { reason } = demoteSchema.parse(req.body);
    const student = await prisma.student.findUnique({ where: { id: req.params.studentId } });
    if (!student) throw ApiError.notFound('Student not found');
    if (student.internStatus !== InternStatus.ACTIVE) throw ApiError.badRequest('Only an active intern can be demoted');

    const [updated] = await prisma.$transaction([
      prisma.student.update({ where: { id: req.params.studentId }, data: { internStatus: InternStatus.DEMOTED } }),
      prisma.internStateChange.create({ data: { studentId: req.params.studentId, fromState: InternStatus.ACTIVE, toState: InternStatus.DEMOTED, reason, actorId: req.auth!.userId } }),
    ]);

    await recordAudit({ entityType: 'Student', entityId: req.params.studentId, action: 'INTERN_DEMOTE', actorId: req.auth!.userId, reason });
    res.json(updated);
  }),
);

internsRouter.patch(
  '/:studentId/complete',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    const student = await prisma.student.findUnique({ where: { id: req.params.studentId } });
    if (!student || student.internStatus !== InternStatus.ACTIVE) throw ApiError.badRequest('Only an active intern can be marked complete');

    const [updated] = await prisma.$transaction([
      prisma.student.update({ where: { id: req.params.studentId }, data: { internStatus: InternStatus.COMPLETED } }),
      prisma.internStateChange.create({ data: { studentId: req.params.studentId, fromState: InternStatus.ACTIVE, toState: InternStatus.COMPLETED, actorId: req.auth!.userId } }),
    ]);
    res.json(updated);
  }),
);

const reassignSchema = z.object({ mentorId: z.string() });

/** "Working under" is dynamic — an intern's mentor can be reassigned at any time; every change is tracked. */
internsRouter.patch(
  '/:studentId/reassign-mentor',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    const { mentorId } = reassignSchema.parse(req.body);
    const student = await prisma.student.findUnique({ where: { id: req.params.studentId } });
    if (!student) throw ApiError.notFound('Student not found');

    await prisma.$transaction([
      prisma.internMentorHistory.updateMany({ where: { studentId: req.params.studentId, endedAt: null }, data: { endedAt: new Date() } }),
      prisma.internMentorHistory.create({ data: { studentId: req.params.studentId, mentorId, assignedById: req.auth!.userId } }),
      prisma.student.update({ where: { id: req.params.studentId }, data: { mentorFacultyId: mentorId } }),
    ]);

    await recordAudit({ entityType: 'Student', entityId: req.params.studentId, action: 'INTERN_MENTOR_REASSIGN', actorId: req.auth!.userId, oldValue: { mentorId: student.mentorFacultyId }, newValue: { mentorId } });
    res.status(204).end();
  }),
);

const ratingSchema = z.object({
  behaviourScore: z.number().min(0).max(100),
  technicalScore: z.number().min(0).max(100),
  projectScore: z.number().min(0).max(100),
  comment: z.string().optional(),
  mentorComment: z.string().optional(),
});

/** Ratings never touch academic aggregates; they can, however, trigger a work-stop when performance is low. */
internsRouter.post(
  '/:studentId/ratings',
  authorize(...ROLE_GROUPS.ADMIN_LIKE, RoleName.FACULTY),
  asyncHandler(async (req, res) => {
    const data = ratingSchema.parse(req.body);
    const student = await prisma.student.findUnique({ where: { id: req.params.studentId } });
    if (!student) throw ApiError.notFound('Student not found');
    if (student.internStatus !== InternStatus.ACTIVE) throw ApiError.badRequest('Ratings can only be recorded for an active intern');
    if (req.auth!.role === RoleName.FACULTY && student.mentorFacultyId !== req.auth!.facultyId) {
      throw ApiError.forbidden('Only the assigned mentor may rate this intern');
    }

    const rating = await prisma.internRating.create({
      data: { ...data, studentId: req.params.studentId, ratedById: req.auth!.facultyId ?? req.auth!.userId },
    });

    const config = await getScoringConfig();
    const average = (data.behaviourScore + data.technicalScore + data.projectScore) / 3;
    if (average < config.internPerformanceThreshold && !student.internFrozen) {
      await prisma.student.update({
        where: { id: student.id },
        data: { internFrozen: true, internFrozenReason: `Rating average ${average.toFixed(1)} below threshold ${config.internPerformanceThreshold}`, internFrozenAt: new Date() },
      });
      await notify({
        userId: student.userId,
        category: NotificationCategory.GENERAL,
        title: 'Internship work paused pending review',
        message: 'Your recent performance review fell below the required threshold. New task work is paused until a staff review.',
      });
    }

    await recordAudit({ entityType: 'Student', entityId: student.id, action: 'INTERN_RATING', actorId: req.auth!.userId, newValue: data });
    res.status(201).json(rating);
  }),
);

/** Un-freezes an intern's work after the staff review ("assessment") required by the threshold breach. */
internsRouter.patch(
  '/:studentId/unfreeze',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    const student = await prisma.student.update({
      where: { id: req.params.studentId },
      data: { internFrozen: false, internFrozenReason: null, internFrozenAt: null },
    });
    await recordAudit({ entityType: 'Student', entityId: student.id, action: 'INTERN_UNFREEZE', actorId: req.auth!.userId });
    res.json(student);
  }),
);

/** Summarised, non-narrative progress view for the intern themself. */
internsRouter.get(
  '/:studentId/development-view',
  asyncHandler(async (req, res) => {
    await assertStudentAccess(req.auth!, req.params.studentId);
    const ratings = await prisma.internRating.findMany({ where: { studentId: req.params.studentId }, orderBy: { createdAt: 'desc' } });
    if (ratings.length === 0) return res.json({ band: null, mentorComment: null, frozen: false });

    const latest = ratings[0];
    const average = (latest.behaviourScore + latest.technicalScore + latest.projectScore) / 3;
    const band = average >= 80 ? 'Exceeding Expectations' : average >= 50 ? 'Meeting Expectations' : 'Below Expectations';

    const student = await prisma.student.findUnique({ where: { id: req.params.studentId }, select: { internFrozen: true } });
    res.json({ band, mentorComment: latest.mentorComment ?? null, frozen: student?.internFrozen ?? false, ratedAt: latest.createdAt });
  }),
);

// ---------------------------------------------------------------- Leave requests

const leaveRequestSchema = z.object({ startDate: z.coerce.date(), endDate: z.coerce.date(), reason: z.string().min(3) });

internsRouter.post(
  '/:studentId/leave',
  asyncHandler(async (req, res) => {
    if (req.auth!.role === RoleName.STUDENT && req.auth!.studentId !== req.params.studentId) throw ApiError.forbidden();
    const data = leaveRequestSchema.parse(req.body);
    const request = await prisma.internLeaveRequest.create({ data: { ...data, studentId: req.params.studentId } });
    res.status(201).json(request);
  }),
);

internsRouter.get(
  '/leave/requests',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const status = req.query.status as LeaveStatus | undefined;
    const where: Record<string, unknown> = status ? { status } : {};
    if (req.auth!.role === RoleName.FACULTY) where.student = { mentorFacultyId: req.auth!.facultyId };

    const requests = await prisma.internLeaveRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { student: { select: { id: true, firstName: true, lastName: true, studentCode: true } } },
    });
    res.json(requests);
  }),
);

const leaveDecisionSchema = z.object({ remarks: z.string().optional() });

internsRouter.patch(
  '/leave/requests/:id/approve',
  authorize(...ROLE_GROUPS.ADMIN_LIKE, RoleName.FACULTY),
  asyncHandler(async (req, res) => {
    const { remarks } = leaveDecisionSchema.parse(req.body);
    const request = await prisma.internLeaveRequest.findUnique({ where: { id: req.params.id } });
    if (!request) throw ApiError.notFound('Leave request not found');
    if (request.status !== LeaveStatus.PENDING) throw ApiError.badRequest('Only pending requests can be decided');

    const updated = await prisma.internLeaveRequest.update({
      where: { id: request.id },
      data: { status: LeaveStatus.APPROVED, approverId: req.auth!.facultyId ?? null, approverRemarks: remarks, decidedAt: new Date() },
    });
    res.json(updated);
  }),
);

internsRouter.patch(
  '/leave/requests/:id/reject',
  authorize(...ROLE_GROUPS.ADMIN_LIKE, RoleName.FACULTY),
  asyncHandler(async (req, res) => {
    const { remarks } = leaveDecisionSchema.parse(req.body);
    const request = await prisma.internLeaveRequest.findUnique({ where: { id: req.params.id } });
    if (!request) throw ApiError.notFound('Leave request not found');
    if (request.status !== LeaveStatus.PENDING) throw ApiError.badRequest('Only pending requests can be decided');

    const updated = await prisma.internLeaveRequest.update({
      where: { id: request.id },
      data: { status: LeaveStatus.REJECTED, approverId: req.auth!.facultyId ?? null, approverRemarks: remarks, decidedAt: new Date() },
    });
    res.json(updated);
  }),
);
