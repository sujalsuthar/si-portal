import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate, authorize } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/apiError';

export const searchRouter = Router();
searchRouter.use(authenticate);
searchRouter.use(authorize(RoleName.SUPER_ADMIN));

const querySchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const kindSchema = z.enum(['student', 'faculty', 'parent', 'staff']);

export type SearchResultKind = 'student' | 'faculty' | 'parent' | 'staff';

function ilike(q: string) {
  return { contains: q, mode: 'insensitive' as const };
}

searchRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { q, limit = 30 } = querySchema.parse(req.query);
    const perKind = Math.ceil(limit / 4);

    const [students, faculty, parents, staff] = await Promise.all([
      prisma.student.findMany({
        where: {
          OR: [
            { firstName: ilike(q) },
            { lastName: ilike(q) },
            { studentCode: ilike(q) },
            { phone: ilike(q) },
            { user: { email: ilike(q) } },
          ],
        },
        take: perKind,
        orderBy: { firstName: 'asc' },
        include: {
          user: { select: { id: true, email: true, isActive: true } },
          currentBatch: { select: { id: true, name: true } },
        },
      }),
      prisma.faculty.findMany({
        where: {
          OR: [
            { firstName: ilike(q) },
            { lastName: ilike(q) },
            { employeeCode: ilike(q) },
            { user: { email: ilike(q) } },
          ],
        },
        take: perKind,
        orderBy: { firstName: 'asc' },
        include: { user: { select: { id: true, email: true, isActive: true } } },
      }),
      prisma.parentGuardian.findMany({
        where: {
          OR: [
            { firstName: ilike(q) },
            { lastName: ilike(q) },
            { phone: ilike(q) },
            { user: { email: ilike(q) } },
          ],
        },
        take: perKind,
        orderBy: { firstName: 'asc' },
        include: {
          user: { select: { id: true, email: true, isActive: true } },
          students: { include: { student: { select: { id: true, firstName: true, lastName: true, studentCode: true } } } },
        },
      }),
      prisma.user.findMany({
        where: {
          role: { in: [RoleName.SUPER_ADMIN, RoleName.MANAGEMENT, RoleName.ACADEMIC_ADMIN, RoleName.ACCOUNTS] },
          email: ilike(q),
          student: null,
          faculty: null,
          parent: null,
        },
        take: perKind,
        orderBy: { email: 'asc' },
        select: { id: true, email: true, role: true, isActive: true, lastLoginAt: true },
      }),
    ]);

    const results = [
      ...students.map((s) => ({
        kind: 'student' as const,
        id: s.id,
        userId: s.user.id,
        name: `${s.firstName} ${s.lastName}`,
        email: s.user.email,
        subtitle: [s.studentCode, s.currentBatch?.name, s.internStatus ? 'Intern' : null].filter(Boolean).join(' · '),
        isActive: s.user.isActive,
        internStatus: s.internStatus,
      })),
      ...faculty.map((f) => ({
        kind: 'faculty' as const,
        id: f.id,
        userId: f.user.id,
        name: `${f.firstName} ${f.lastName}`,
        email: f.user.email,
        subtitle: [f.employeeCode, f.department, f.isActive ? 'Active' : 'Inactive'].filter(Boolean).join(' · '),
        isActive: f.user.isActive && f.isActive,
      })),
      ...parents.map((p) => ({
        kind: 'parent' as const,
        id: p.id,
        userId: p.user.id,
        name: `${p.firstName} ${p.lastName}`,
        email: p.user.email,
        subtitle: p.students.map((l) => `${l.student.firstName} ${l.student.lastName}`).join(', ') || 'No linked children',
        isActive: p.user.isActive,
      })),
      ...staff.map((u) => ({
        kind: 'staff' as const,
        id: u.id,
        userId: u.id,
        name: u.email.split('@')[0],
        email: u.email,
        subtitle: u.role.replace('_', ' '),
        isActive: u.isActive,
      })),
    ];

    res.json({ query: q, results });
  }),
);

/** Profile hub — summary + links for Super Admin user lookup. */
searchRouter.get(
  '/profile/:kind/:id',
  asyncHandler(async (req, res) => {
    const kind = kindSchema.parse(req.params.kind);
    const { id } = req.params;

    if (kind === 'student') {
      const student = await prisma.student.findUnique({
        where: { id },
        include: {
          user: { select: { id: true, email: true, isActive: true, lastLoginAt: true } },
          course: { select: { name: true } },
          currentBatch: { select: { id: true, name: true } },
          mentorFaculty: { select: { firstName: true, lastName: true } },
          parents: { include: { parent: { select: { id: true, firstName: true, lastName: true, user: { select: { email: true } } } } } },
        },
      });
      if (!student) throw ApiError.notFound('Student not found');
      return res.json({
        kind: 'student',
        id: student.id,
        userId: student.userId,
        name: `${student.firstName} ${student.lastName}`,
        email: student.user.email,
        isActive: student.user.isActive,
        status: student.status,
        internStatus: student.internStatus,
        internFrozen: student.internFrozen,
        studentCode: student.studentCode,
        phone: student.phone,
        batch: student.currentBatch,
        course: student.course,
        mentor: student.mentorFaculty,
        parents: student.parents.map((p) => p.parent),
        actions: {
          viewProfile: true,
          viewIntern: !!student.internStatus,
          promoteIntern: !student.internStatus,
          demoteIntern: student.internStatus === 'ACTIVE',
          unfreezeIntern: student.internFrozen,
          viewFees: true,
          deactivateAccount: student.user.isActive,
          activateAccount: !student.user.isActive,
        },
      });
    }

    if (kind === 'faculty') {
      const faculty = await prisma.faculty.findUnique({
        where: { id },
        include: {
          user: { select: { id: true, email: true, isActive: true, lastLoginAt: true } },
          batchAssignments: { include: { batch: { select: { id: true, name: true } } } },
        },
      });
      if (!faculty) throw ApiError.notFound('Team member not found');
      return res.json({
        kind: 'faculty',
        id: faculty.id,
        userId: faculty.userId,
        name: `${faculty.firstName} ${faculty.lastName}`,
        email: faculty.user.email,
        isActive: faculty.user.isActive && faculty.isActive,
        employeeCode: faculty.employeeCode,
        department: faculty.department,
        designation: faculty.designation,
        batches: faculty.batchAssignments.map((a) => a.batch),
        actions: {
          deactivateAccount: faculty.user.isActive,
          activateAccount: !faculty.user.isActive,
          reactivateFaculty: !faculty.isActive,
          deactivateFaculty: faculty.isActive,
        },
      });
    }

    if (kind === 'parent') {
      const parent = await prisma.parentGuardian.findUnique({
        where: { id },
        include: {
          user: { select: { id: true, email: true, isActive: true, lastLoginAt: true } },
          students: { include: { student: { select: { id: true, firstName: true, lastName: true, studentCode: true, internStatus: true, currentBatch: { select: { name: true } } } } } },
        },
      });
      if (!parent) throw ApiError.notFound('Parent not found');
      return res.json({
        kind: 'parent',
        id: parent.id,
        userId: parent.userId,
        name: `${parent.firstName} ${parent.lastName}`,
        email: parent.user.email,
        isActive: parent.user.isActive,
        phone: parent.phone,
        children: parent.students.map((l) => l.student),
        actions: {
          deactivateAccount: parent.user.isActive,
          activateAccount: !parent.user.isActive,
        },
      });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, role: true, isActive: true, lastLoginAt: true, mustChangePassword: true },
    });
    if (!user) throw ApiError.notFound('User not found');
    return res.json({
      kind: 'staff',
      id: user.id,
      userId: user.id,
      name: user.email,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      actions: {
        deactivateAccount: user.isActive,
        activateAccount: !user.isActive,
        resetPassword: true,
      },
    });
  }),
);
