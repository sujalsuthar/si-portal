import { Router } from 'express';
import { RoleName, NotificationCategory, StudentStatus } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate, authorize, ROLE_GROUPS } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/apiError';
import { recordAudit } from '@/lib/audit';
import { getFacultyBatchIds, getParentStudentIds } from '@/utils/scope';
import { notify, notifyStudentParents } from '@/lib/notify';
import { uploadAttachment, publicUploadUrl } from '@/middleware/upload';

export const feedRouter = Router();
feedRouter.use(authenticate);

const POSTER_ROLES = [RoleName.SUPER_ADMIN, RoleName.ACADEMIC_ADMIN, RoleName.FACULTY];

const createSchema = z.object({
  title: z.string().min(2),
  content: z.string().min(1),
  batchId: z.string().optional(),
});

/** Notifies every active student (and their parents) in scope — a specific batch, or everyone institute-wide. */
async function notifyFeedAudience(post: { id: string; title: string; batchId: string | null }) {
  const students = await prisma.student.findMany({
    where: { status: StudentStatus.ACTIVE, ...(post.batchId ? { currentBatchId: post.batchId } : {}) },
    select: { id: true, userId: true },
  });
  for (const student of students) {
    await notify({
      userId: student.userId,
      category: NotificationCategory.ANNOUNCEMENT,
      title: 'New announcement',
      message: post.title,
      link: `/feed`,
    });
    await notifyStudentParents(student.id, {
      category: NotificationCategory.ANNOUNCEMENT,
      title: 'New announcement',
      message: post.title,
      link: `/feed`,
    });
  }
}

feedRouter.post(
  '/',
  authorize(...POSTER_ROLES),
  uploadAttachment.single('attachment'),
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);

    if (req.auth!.role === RoleName.FACULTY) {
      if (!data.batchId) throw ApiError.badRequest('Team members must post to one of their assigned batches');
      const batchIds = await getFacultyBatchIds(req.auth!.facultyId!);
      if (!batchIds.includes(data.batchId)) throw ApiError.forbidden('You may only post to your assigned batches');
    }

    const file = req.file as Express.Multer.File | undefined;
    const post = await prisma.feedPost.create({
      data: {
        authorId: req.auth!.userId,
        title: data.title,
        content: data.content,
        batchId: data.batchId ?? null,
        attachmentUrl: file ? publicUploadUrl('attachments', file.filename) : undefined,
      },
    });
    await recordAudit({ entityType: 'FeedPost', entityId: post.id, action: 'CREATE', actorId: req.auth!.userId, newValue: data });

    await notifyFeedAudience({ id: post.id, title: post.title, batchId: post.batchId });

    res.status(201).json(post);
  }),
);

feedRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    let where: Record<string, unknown> = {};

    if (auth.role === RoleName.STUDENT) {
      const student = await prisma.student.findUnique({ where: { id: auth.studentId! }, select: { currentBatchId: true } });
      where = { OR: [{ batchId: null }, ...(student?.currentBatchId ? [{ batchId: student.currentBatchId }] : [])] };
    } else if (auth.role === RoleName.PARENT) {
      const studentIds = await getParentStudentIds(auth.parentId!);
      const children = await prisma.student.findMany({ where: { id: { in: studentIds } }, select: { currentBatchId: true } });
      const batchIds = [...new Set(children.map((c) => c.currentBatchId).filter((b): b is string => !!b))];
      where = { OR: [{ batchId: null }, ...(batchIds.length ? [{ batchId: { in: batchIds } }] : [])] };
    } else if (auth.role === RoleName.FACULTY) {
      const batchIds = await getFacultyBatchIds(auth.facultyId!);
      where = { OR: [{ batchId: null }, ...(batchIds.length ? [{ batchId: { in: batchIds } }] : [])] };
    }
    // Super Admin, Management, Academic Admin, Accounts see every post — no filter.

    const posts = await prisma.feedPost.findMany({
      where,
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      include: { author: { select: { email: true, role: true } }, batch: { select: { name: true } } },
      take: 100,
    });
    res.json(posts);
  }),
);

const updateSchema = z.object({ title: z.string().min(2).optional(), content: z.string().min(1).optional() });

feedRouter.patch(
  '/:id',
  authorize(...POSTER_ROLES),
  asyncHandler(async (req, res) => {
    const data = updateSchema.parse(req.body);
    const post = await prisma.feedPost.findUnique({ where: { id: req.params.id } });
    if (!post) throw ApiError.notFound('Post not found');
    if (post.authorId !== req.auth!.userId && req.auth!.role !== RoleName.SUPER_ADMIN) {
      throw ApiError.forbidden('You may only edit your own post');
    }
    const updated = await prisma.feedPost.update({ where: { id: post.id }, data });
    await recordAudit({ entityType: 'FeedPost', entityId: post.id, action: 'UPDATE', actorId: req.auth!.userId, oldValue: post, newValue: data });
    res.json(updated);
  }),
);

feedRouter.patch(
  '/:id/pin',
  authorize(RoleName.SUPER_ADMIN, RoleName.ACADEMIC_ADMIN),
  asyncHandler(async (req, res) => {
    const post = await prisma.feedPost.findUnique({ where: { id: req.params.id } });
    if (!post) throw ApiError.notFound('Post not found');
    const updated = await prisma.feedPost.update({ where: { id: post.id }, data: { pinned: !post.pinned } });
    res.json(updated);
  }),
);

feedRouter.delete(
  '/:id',
  authorize(...POSTER_ROLES),
  asyncHandler(async (req, res) => {
    const post = await prisma.feedPost.findUnique({ where: { id: req.params.id } });
    if (!post) throw ApiError.notFound('Post not found');
    if (post.authorId !== req.auth!.userId && req.auth!.role !== RoleName.SUPER_ADMIN) {
      throw ApiError.forbidden('You may only delete your own post');
    }
    await prisma.feedPost.delete({ where: { id: post.id } });
    await recordAudit({ entityType: 'FeedPost', entityId: post.id, action: 'DELETE', actorId: req.auth!.userId, oldValue: post });
    res.status(204).end();
  }),
);

/** Batches a Team/Admin user may post to — used to populate the batch selector when composing. */
feedRouter.get(
  '/postable-batches',
  authorize(...POSTER_ROLES),
  asyncHandler(async (req, res) => {
    if (ROLE_GROUPS.ADMIN_LIKE.includes(req.auth!.role)) {
      const batches = await prisma.batch.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true } });
      return res.json(batches);
    }
    const batchIds = await getFacultyBatchIds(req.auth!.facultyId!);
    const batches = await prisma.batch.findMany({ where: { id: { in: batchIds } }, select: { id: true, name: true } });
    res.json(batches);
  }),
);
