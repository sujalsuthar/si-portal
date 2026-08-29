import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate, ROLE_GROUPS } from '@/middleware/auth';
import { AuthContext } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/apiError';
import { assertStudentAccess, getFacultyBatchIds } from '@/utils/scope';

export const searchRouter = Router();
searchRouter.use(authenticate);

const SEARCH_ROLES: RoleName[] = [RoleName.SUPER_ADMIN, RoleName.ACADEMIC_ADMIN, RoleName.FACULTY];

const querySchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const kindSchema = z.enum(['student', 'faculty', 'parent', 'staff']);

export type SearchResultKind = 'student' | 'faculty' | 'parent' | 'staff';

function assertCanSearch(auth: AuthContext) {
  if (!SEARCH_ROLES.includes(auth.role)) {
    throw ApiError.forbidden('You do not have permission to use search');
  }
}

function ilike(q: string) {
  return { contains: q, mode: 'insensitive' as const };
}

function defaultLimit(role: RoleName) {
  return role === RoleName.FACULTY ? 20 : 30;
}

async function facultyStudentScope(auth: AuthContext) {
  if (!auth.facultyId) throw ApiError.forbidden();
  const batchIds = await getFacultyBatchIds(auth.facultyId);
  return {
    OR: [
      { currentBatchId: { in: batchIds } },
      { mentorFacultyId: auth.facultyId },
    ],
  };
}

searchRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    assertCanSearch(auth);
    const maxLimit = auth.role === RoleName.FACULTY ? 25 : 50;
    const { q } = querySchema.parse(req.query);
    const limit = Math.min(querySchema.parse(req.query).limit ?? defaultLimit(auth.role), maxLimit);

    const isFaculty = auth.role === RoleName.FACULTY;
    const isInstituteWide = auth.role === RoleName.SUPER_ADMIN || auth.role === RoleName.ACADEMIC_ADMIN;
    const kindCount = isFaculty ? 3 : 4;
    const perKind = Math.ceil(limit / kindCount);

    const studentWhere = isFaculty
      ? {
          AND: [
            await facultyStudentScope(auth),
            {
              OR: [
                { firstName: ilike(q) },
                { lastName: ilike(q) },
                { studentCode: ilike(q) },
                { phone: ilike(q) },
                { user: { email: ilike(q) } },
              ],
            },
          ],
        }
      : {
          OR: [
            { firstName: ilike(q) },
            { lastName: ilike(q) },
            { studentCode: ilike(q) },
            { phone: ilike(q) },
            { user: { email: ilike(q) } },
          ],
        };

    const facultyWhere = isFaculty
      ? {
          AND: [
            {
              batchAssignments: {
                some: {
                  batchId: {
                    in: await getFacultyBatchIds(auth.facultyId!),
                  },
                },
              },
            },
            {
              OR: [
                { firstName: ilike(q) },
                { lastName: ilike(q) },
                { employeeCode: ilike(q) },
                { user: { email: ilike(q) } },
              ],
            },
          ],
        }
      : {
          OR: [
            { firstName: ilike(q) },
            { lastName: ilike(q) },
            { employeeCode: ilike(q) },
            { user: { email: ilike(q) } },
          ],
        };

    let parentWhere: Record<string, unknown>;
    if (isFaculty) {
      const batchIds = await getFacultyBatchIds(auth.facultyId!);
      parentWhere = {
        AND: [
          {
            students: {
              some: {
                student: {
                  OR: [
                    { currentBatchId: { in: batchIds } },
                    { mentorFacultyId: auth.facultyId },
                  ],
                },
              },
            },
          },
          {
            OR: [
              { firstName: ilike(q) },
              { lastName: ilike(q) },
              { phone: ilike(q) },
              { user: { email: ilike(q) } },
            ],
          },
        ],
      };
    } else {
      parentWhere = {
        OR: [
          { firstName: ilike(q) },
          { lastName: ilike(q) },
          { phone: ilike(q) },
          { user: { email: ilike(q) } },
        ],
      };
    }

    const [students, faculty, parents, staff] = await Promise.all([
      prisma.student.findMany({
        where: studentWhere,
        take: perKind,
        orderBy: { firstName: 'asc' },
        include: {
          user: { select: { id: true, email: true, isActive: true } },
          currentBatch: { select: { id: true, name: true } },
        },
      }),
      prisma.faculty.findMany({
        where: facultyWhere,
        take: perKind,
        orderBy: { firstName: 'asc' },
        include: { user: { select: { id: true, email: true, isActive: true } } },
      }),
      prisma.parentGuardian.findMany({
        where: parentWhere,
        take: perKind,
        orderBy: { firstName: 'asc' },
        include: {
          user: { select: { id: true, email: true, isActive: true } },
          students: { include: { student: { select: { id: true, firstName: true, lastName: true, studentCode: true } } } },
        },
      }),
      isInstituteWide
        ? prisma.user.findMany({
            where: {
              email: ilike(q),
              student: null,
              faculty: null,
              parent: null,
              role:
                auth.role === RoleName.ACADEMIC_ADMIN
                  ? { in: [RoleName.MANAGEMENT, RoleName.ACADEMIC_ADMIN, RoleName.ACCOUNTS] }
                  : { in: [RoleName.SUPER_ADMIN, RoleName.MANAGEMENT, RoleName.ACADEMIC_ADMIN, RoleName.ACCOUNTS] },
            },
            take: perKind,
            orderBy: { email: 'asc' },
            select: { id: true, email: true, role: true, isActive: true, lastLoginAt: true },
          })
        : Promise.resolve([]),
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

    res.json({ query: q, results, scope: isFaculty ? 'faculty' : isInstituteWide ? 'institute' : 'limited' });
  }),
);

function profileActions(auth: AuthContext, kind: string, entity: { isActive?: boolean; user?: { isActive: boolean }; internStatus?: string | null; internFrozen?: boolean; role?: RoleName }) {
  const adminLike = ROLE_GROUPS.ADMIN_LIKE.includes(auth.role);
  const superAdmin = auth.role === RoleName.SUPER_ADMIN;
  const userActive = entity.user?.isActive ?? entity.isActive ?? true;

  if (kind === 'student') {
    return {
      viewProfile: true,
      viewIntern: !!entity.internStatus,
      promoteIntern: adminLike && !entity.internStatus,
      demoteIntern: adminLike && entity.internStatus === 'ACTIVE',
      unfreezeIntern: adminLike && !!entity.internFrozen,
      viewFees: adminLike || auth.role === RoleName.ACCOUNTS,
      deactivateAccount: adminLike && userActive,
      activateAccount: adminLike && !userActive,
      resetPassword: false,
    };
  }
  if (kind === 'faculty') {
    return {
      deactivateAccount: adminLike && userActive,
      activateAccount: adminLike && !userActive,
      reactivateFaculty: superAdmin && !(entity as { isActive?: boolean }).isActive,
      deactivateFaculty: adminLike && (entity as { isActive?: boolean }).isActive,
      resetPassword: adminLike,
    };
  }
  if (kind === 'parent') {
    return {
      deactivateAccount: adminLike && userActive,
      activateAccount: adminLike && !userActive,
      resetPassword: adminLike,
    };
  }
  return {
    deactivateAccount: superAdmin && userActive,
    activateAccount: superAdmin && !userActive,
    resetPassword: superAdmin,
  };
}

/** Profile hub — summary + links for user lookup (role-scoped). */
searchRouter.get(
  '/profile/:kind/:id',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    assertCanSearch(auth);
    const kind = kindSchema.parse(req.params.kind);
    const { id } = req.params;

    if (kind === 'staff' && auth.role === RoleName.FACULTY) {
      throw ApiError.forbidden('Staff accounts are not visible in team search');
    }

    if (kind === 'student') {
      await assertStudentAccess(auth, id);
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
        actions: profileActions(auth, 'student', { ...student, user: student.user }),
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
      if (auth.role === RoleName.FACULTY && auth.facultyId !== faculty.id) {
        const batchIds = await getFacultyBatchIds(auth.facultyId!);
        const shared = faculty.batchAssignments.some((a) => batchIds.includes(a.batchId));
        if (!shared) throw ApiError.forbidden('You may only view team members in your batches');
      }
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
        actions: profileActions(auth, 'faculty', { ...faculty, user: faculty.user }),
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
      if (auth.role === RoleName.FACULTY) {
        let allowed = false;
        for (const link of parent.students) {
          try {
            await assertStudentAccess(auth, link.student.id);
            allowed = true;
            break;
          } catch {
            /* try next linked child */
          }
        }
        if (!allowed) throw ApiError.forbidden('You may only view parents linked to your students');
      }
      return res.json({
        kind: 'parent',
        id: parent.id,
        userId: parent.userId,
        name: `${parent.firstName} ${parent.lastName}`,
        email: parent.user.email,
        isActive: parent.user.isActive,
        phone: parent.phone,
        children: parent.students.map((l) => l.student),
        actions: profileActions(auth, 'parent', { user: parent.user }),
      });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, role: true, isActive: true, lastLoginAt: true, mustChangePassword: true },
    });
    if (!user) throw ApiError.notFound('User not found');
    if (auth.role === RoleName.ACADEMIC_ADMIN && user.role === RoleName.SUPER_ADMIN) {
      throw ApiError.forbidden('Super Admin accounts are not visible');
    }
    return res.json({
      kind: 'staff',
      id: user.id,
      userId: user.id,
      name: user.email,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      actions: profileActions(auth, 'staff', { user, role: user.role }),
    });
  }),
);
