import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate, authorize, ROLE_GROUPS, AuthContext } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/apiError';
import { recordAudit } from '@/lib/audit';
import { assertBatchAccess, getParentStudentIds } from '@/utils/scope';

export const projectsRouter = Router();
projectsRouter.use(authenticate);

const createSchema = z.object({
  batchId: z.string(),
  name: z.string().min(1),
  scope: z.string().optional(),
  groupSize: z.number().int().positive(),
});

/** Every group a member of this student's group can act on the group's own record. */
async function assertGroupMember(studentId: string, groupId: string): Promise<void> {
  const membership = await prisma.projectMember.findUnique({ where: { groupId_studentId: { groupId, studentId } } });
  if (!membership) throw ApiError.forbidden('You are not a member of this group');
}

/** Close/Reopen grading is limited to Super Admin, Academic Admin, and the batch's assigned mentor Faculty. */
async function assertGradingGateAccess(auth: AuthContext, batchId: string): Promise<void> {
  if (ROLE_GROUPS.ADMIN_LIKE.includes(auth.role)) return;
  if (auth.role === RoleName.FACULTY) {
    await assertBatchAccess(auth, batchId);
    return;
  }
  throw ApiError.forbidden('Only Super Admin, Academic Admin, or the assigned mentor may open/close grading');
}

projectsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const batchId = req.query.batchId as string | undefined;
    const where: Record<string, unknown> = { ...(batchId ? { batchId } : {}) };

    if (req.auth!.role === RoleName.STUDENT) {
      where.groups = { some: { members: { some: { studentId: req.auth!.studentId } } } };
    } else if (req.auth!.role === RoleName.PARENT) {
      const studentIds = await getParentStudentIds(req.auth!.parentId!);
      where.groups = { some: { members: { some: { studentId: { in: studentIds } } } } };
    }

    const projects = await prisma.project.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { batch: { select: { id: true, name: true } }, _count: { select: { groups: true } } },
    });
    res.json(projects);
  }),
);

projectsRouter.post(
  '/',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    if (req.auth!.role === RoleName.FACULTY) {
      await assertBatchAccess(req.auth!, data.batchId);
      // 4.1: Team members are restricted to Intern Projects; Super Admin/Academic Admin may
      // still create a normal (non-intern) project for any batch.
      const internCount = await prisma.student.count({ where: { currentBatchId: data.batchId, internStatus: { not: null } } });
      if (internCount === 0) throw ApiError.badRequest('Team members can only create projects for a batch with intern students');
    }

    const project = await prisma.project.create({ data: { ...data, createdById: req.auth!.userId } });
    res.status(201).json(project);
  }),
);

projectsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        batch: true,
        groups: {
          orderBy: { sequence: 'asc' },
          include: {
            members: { include: { student: { select: { id: true, firstName: true, lastName: true, studentCode: true } } } },
            marks: true,
            leader: { select: { id: true, firstName: true, lastName: true, studentCode: true } },
            progressUpdates: { orderBy: { weekNumber: 'asc' } },
          },
        },
      },
    });
    if (!project) throw ApiError.notFound('Project not found');
    res.json(project);
  }),
);

projectsRouter.post(
  '/:id/groups',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const { repoLink, name } = z.object({ repoLink: z.string().optional(), name: z.string().optional() }).parse(req.body);
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) throw ApiError.notFound('Project not found');
    const count = await prisma.projectGroup.count({ where: { projectId: req.params.id } });
    const group = await prisma.projectGroup.create({
      data: { projectId: req.params.id, sequence: count + 1, repoLink, name: name ?? project.name },
    });
    res.status(201).json(group);
  }),
);

projectsRouter.patch(
  '/:id/groups/:groupId',
  asyncHandler(async (req, res) => {
    const { repoLink, name } = z.object({ repoLink: z.string().optional(), name: z.string().optional() }).parse(req.body);
    const isStaff = (ROLE_GROUPS.STAFF as RoleName[]).includes(req.auth!.role);
    if (!isStaff) {
      if (req.auth!.role !== RoleName.STUDENT) throw ApiError.forbidden();
      await assertGroupMember(req.auth!.studentId!, req.params.groupId);
      // Group members may update their compulsory GitHub link directly, but not rename the group.
      const group = await prisma.projectGroup.update({ where: { id: req.params.groupId }, data: { repoLink } });
      return res.json(group);
    }
    const group = await prisma.projectGroup.update({ where: { id: req.params.groupId }, data: { repoLink, name } });
    res.json(group);
  }),
);

projectsRouter.delete(
  '/:id/groups/:groupId',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    const group = await prisma.projectGroup.findUnique({ where: { id: req.params.groupId }, include: { marks: true } });
    if (!group) throw ApiError.notFound('Group not found');
    if (group.marks.length > 0 && req.query.force !== 'true') {
      throw ApiError.badRequest('This group already has marks recorded; pass force=true to delete it along with its marks');
    }
    await prisma.projectGroup.delete({ where: { id: req.params.groupId } });
    await recordAudit({ entityType: 'ProjectGroup', entityId: req.params.groupId, action: 'DELETE', actorId: req.auth!.userId, oldValue: group });
    res.status(204).end();
  }),
);

const setLeaderSchema = z.object({ studentId: z.string().optional() });

projectsRouter.post(
  '/:id/groups/:groupId/leader',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    const { studentId } = setLeaderSchema.parse(req.body);
    const members = await prisma.projectMember.findMany({ where: { groupId: req.params.groupId } });
    if (members.length === 0) throw ApiError.badRequest('This group has no members yet');

    let leaderId = studentId;
    if (!leaderId) {
      leaderId = members[Math.floor(Math.random() * members.length)].studentId;
    } else if (!members.some((m) => m.studentId === leaderId)) {
      throw ApiError.badRequest('Leader must be a member of this group');
    }

    const group = await prisma.projectGroup.update({ where: { id: req.params.groupId }, data: { leaderId } });
    res.json(group);
  }),
);

const progressSchema = z.object({ weekNumber: z.number().int().positive(), note: z.string().min(1), link: z.string().optional() });

projectsRouter.post(
  '/:id/groups/:groupId/progress',
  asyncHandler(async (req, res) => {
    const data = progressSchema.parse(req.body);
    if (req.auth!.role === RoleName.STUDENT) {
      await assertGroupMember(req.auth!.studentId!, req.params.groupId);
    } else if (!(ROLE_GROUPS.STAFF as RoleName[]).includes(req.auth!.role)) {
      throw ApiError.forbidden();
    }
    const update = await prisma.projectProgressUpdate.create({
      data: { groupId: req.params.groupId, ...data, createdById: req.auth!.userId },
    });
    res.status(201).json(update);
  }),
);

const addMemberSchema = z.object({ studentId: z.string() });

/** Enforces one group per student per project — a student may belong to different groups on different projects. */
projectsRouter.post(
  '/:id/groups/:groupId/members',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const { studentId } = addMemberSchema.parse(req.body);
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) throw ApiError.notFound('Project not found');
    if (!project.gradingOpen && !ROLE_GROUPS.ADMIN_LIKE.includes(req.auth!.role)) {
      throw ApiError.forbidden('Grading has opened for this project; ask an Admin to change group composition');
    }

    const existingMembership = await prisma.projectMember.findFirst({ where: { studentId, projectId: req.params.id } });
    if (existingMembership) throw ApiError.conflict('This student already belongs to a group in this project');

    // The @@unique([projectId, studentId]) constraint is the real guarantee against a race
    // between two concurrent adds; this check above is just a fast, friendly early rejection.
    const member = await prisma.projectMember.create({ data: { groupId: req.params.groupId, projectId: req.params.id, studentId } });
    res.status(201).json(member);
  }),
);

projectsRouter.delete(
  '/:id/groups/:groupId/members/:studentId',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    await prisma.projectMember.delete({ where: { groupId_studentId: { groupId: req.params.groupId, studentId: req.params.studentId } } });
    res.status(204).end();
  }),
);

projectsRouter.patch(
  '/:id/grading-open',
  asyncHandler(async (req, res) => {
    const { gradingOpen } = z.object({ gradingOpen: z.boolean() }).parse(req.body);
    const existing = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!existing) throw ApiError.notFound('Project not found');
    await assertGradingGateAccess(req.auth!, existing.batchId);
    const project = await prisma.project.update({ where: { id: req.params.id }, data: { gradingOpen } });
    res.json(project);
  }),
);

const markSchema = z.object({
  studentId: z.string().optional(),
  marksObtained: z.number().min(0),
  maxMarks: z.number().positive().default(100),
  criteria: z.record(z.number()).optional(),
});

projectsRouter.post(
  '/:id/groups/:groupId/marks',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const data = markSchema.parse(req.body);
    const mark = await prisma.projectMark.create({ data: { ...data, groupId: req.params.groupId, gradedById: req.auth!.userId } });
    res.status(201).json(mark);
  }),
);

/** Edits an already-recorded group mark (4.1: "grade option should be editable"). */
projectsRouter.patch(
  '/:id/groups/:groupId/marks/:markId',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const data = markSchema.partial().parse(req.body);
    const mark = await prisma.projectMark.update({
      where: { id: req.params.markId },
      data: { ...data, gradedById: req.auth!.userId, gradedAt: new Date() },
    });
    res.json(mark);
  }),
);
