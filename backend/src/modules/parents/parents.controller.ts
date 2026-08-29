import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate, authorize, ROLE_GROUPS } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { getPagination, paginatedResult } from '@/utils/pagination';
import { recordAudit } from '@/lib/audit';
import { ApiError } from '@/utils/apiError';
import { createUserAccount } from '@/modules/users/account.service';
import { computeStudentComposite } from '@/lib/scoring';
import { buildParentListWhere } from '@/lib/parentSearch';

export const parentsRouter = Router();
parentsRouter.use(authenticate);

const createParentSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  altPhone: z.string().optional(),
  contactEmail: z.string().email().optional(),
  currentAddress: z.string().optional(),
  permanentAddress: z.string().optional(),
  occupation: z.string().optional(),
  studentIds: z.array(z.string()).default([]),
});

/** Parent Settings → Contact: the mentor/assigned faculty for each linked child. */
parentsRouter.get(
  '/me/faculty-contacts',
  authorize(RoleName.PARENT),
  asyncHandler(async (req, res) => {
    const parent = await prisma.parentGuardian.findUnique({ where: { id: req.auth!.parentId! } });
    if (!parent) throw ApiError.notFound('Parent record not found');

    const links = await prisma.studentParent.findMany({
      where: { parentId: parent.id },
      include: {
        student: {
          include: {
            mentorFaculty: { include: { user: { select: { email: true } } } },
            currentBatch: { include: { facultyAssignments: { include: { faculty: { include: { user: { select: { email: true } } } } } } } },
          },
        },
      },
    });

    const contacts = links.map((link) => {
      const faculty = link.student.mentorFaculty ?? link.student.currentBatch?.facultyAssignments[0]?.faculty ?? null;
      return {
        studentId: link.student.id,
        studentName: `${link.student.firstName} ${link.student.lastName}`,
        faculty: faculty
          ? { name: `${faculty.firstName} ${faculty.lastName}`, phone: faculty.phone }
          : null,
      };
    });

    const institution = await prisma.institutionProfile.findFirst({ orderBy: { createdAt: 'desc' } });
    const teamMembers = await prisma.faculty.findMany({
      where: { isActive: true },
      select: { firstName: true, lastName: true, phone: true },
      orderBy: { firstName: 'asc' },
    });

    res.json({
      children: contacts,
      instituteContact: institution?.contactPhone
        ? { name: institution.name, phone: institution.contactPhone }
        : null,
      teamMembers: teamMembers.map((f) => ({
        name: `${f.firstName} ${f.lastName}`,
        phone: f.phone,
      })),
    });
  }),
);

parentsRouter.get(
  '/',
  authorize(...ROLE_GROUPS.STAFF, RoleName.MANAGEMENT),
  asyncHandler(async (req, res) => {
    const pagination = getPagination(req);
    const search = (req.query.search as string) ?? '';
    const where = await buildParentListWhere(search);
    const [items, total] = await Promise.all([
      prisma.parentGuardian.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { firstName: 'asc' },
        include: {
          user: { select: { email: true, isActive: true } },
          students: { include: { student: { select: { id: true, firstName: true, lastName: true, studentCode: true } } } },
        },
      }),
      prisma.parentGuardian.count({ where }),
    ]);
    res.json(paginatedResult(items, total, pagination));
  }),
);

/**
 * Exam mark history and monthly performance history are shown here (Community → Parents) rather
 * than on the student's own profile, per the 4.0 issue log's reorganisation.
 */
parentsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const parent = await prisma.parentGuardian.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { email: true, isActive: true } },
        students: { include: { student: true } },
      },
    });
    if (!parent) throw ApiError.notFound('Parent not found');
    if (req.auth!.role === RoleName.PARENT && req.auth!.parentId !== parent.id) throw ApiError.forbidden();

    const childrenPerformance = await Promise.all(
      parent.students.map(async (link) => {
        const [composite, grades] = await Promise.all([
          computeStudentComposite(link.student.id),
          prisma.grade.findMany({
            where: { studentId: link.student.id, status: 'PUBLISHED' },
            orderBy: { publishedAt: 'desc' },
            take: 12,
            include: { exam: { select: { title: true, examDate: true, batch: { select: { id: true, name: true } } } } },
          }),
        ]);
        return {
          studentId: link.student.id,
          studentName: `${link.student.firstName} ${link.student.lastName}`,
          composite,
          examHistory: grades.map((g) => ({
            examTitle: g.exam.title,
            examDate: g.exam.examDate,
            batchId: g.exam.batch.id,
            batchName: g.exam.batch.name,
            marksObtained: g.marksObtained,
            percentage: g.percentage,
          })),
        };
      }),
    );

    res.json({ ...parent, childrenPerformance });
  }),
);

parentsRouter.post(
  '/',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    const data = createParentSchema.parse(req.body);

    const result = await prisma.$transaction(async (tx) => {
      const { userId, tempPassword } = await createUserAccount(tx, data.email, RoleName.PARENT);
      const parent = await tx.parentGuardian.create({
        data: {
          userId,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          altPhone: data.altPhone,
          contactEmail: data.contactEmail,
          currentAddress: data.currentAddress,
          permanentAddress: data.permanentAddress,
          occupation: data.occupation,
        },
      });
      if (data.studentIds.length > 0) {
        await tx.studentParent.createMany({
          data: data.studentIds.map((studentId) => ({ studentId, parentId: parent.id })),
          skipDuplicates: true,
        });
      }
      return { parent, tempPassword };
    });

    await recordAudit({ entityType: 'ParentGuardian', entityId: result.parent.id, action: 'CREATE', actorId: req.auth!.userId, newValue: data });
    res.status(201).json(result);
  }),
);

parentsRouter.put(
  '/:id',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    const data = createParentSchema.omit({ email: true, studentIds: true }).partial().parse(req.body);
    const parent = await prisma.parentGuardian.update({ where: { id: req.params.id }, data });
    res.json(parent);
  }),
);

const linkSchema = z.object({ studentId: z.string(), relationship: z.string().optional() });

parentsRouter.post(
  '/:id/link-student',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    const { studentId, relationship } = linkSchema.parse(req.body);
    const link = await prisma.studentParent.create({ data: { parentId: req.params.id, studentId, relationship } });
    await recordAudit({ entityType: 'ParentGuardian', entityId: req.params.id, action: 'LINK_STUDENT', actorId: req.auth!.userId, newValue: { studentId } });
    res.status(201).json(link);
  }),
);

parentsRouter.delete(
  '/:id/link-student/:studentId',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    await prisma.studentParent.delete({
      where: { studentId_parentId: { studentId: req.params.studentId, parentId: req.params.id } },
    });
    await recordAudit({ entityType: 'ParentGuardian', entityId: req.params.id, action: 'UNLINK_STUDENT', actorId: req.auth!.userId, oldValue: { studentId: req.params.studentId } });
    res.status(204).end();
  }),
);
