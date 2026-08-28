import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate, authorize } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { getPagination, paginatedResult } from '@/utils/pagination';
import { computeEntryHash } from '@/lib/audit';

export const auditLogsRouter = Router();
auditLogsRouter.use(authenticate, authorize(RoleName.SUPER_ADMIN, RoleName.MANAGEMENT, RoleName.ACADEMIC_ADMIN));

auditLogsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const pagination = getPagination(req, 30, 100);
    const entityType = req.query.entityType as string | undefined;
    const entityId = req.query.entityId as string | undefined;
    const actorId = req.query.actorId as string | undefined;
    const from = req.query.from ? new Date(req.query.from as string) : undefined;
    const to = req.query.to ? new Date(req.query.to as string) : undefined;

    const where = {
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
      ...(actorId ? { actorId } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: 'desc' },
        include: { actor: { select: { email: true, role: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);
    res.json(paginatedResult(items, total, pagination));
  }),
);

/**
 * Recomputes the hash chain from the first post-migration entry onward and reports any breaks —
 * evidence that a row was altered or deleted outside the application's own (nonexistent) edit path.
 * Rows created before the chain existed are tagged 'legacy-*' and are skipped, not flagged as breaks.
 */
auditLogsRouter.get(
  '/integrity-check',
  authorize(RoleName.SUPER_ADMIN),
  asyncHandler(async (_req, res) => {
    const rows = await prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } });
    const breaks: { id: string; createdAt: Date }[] = [];
    let previousHash: string | null = null;
    let isFirstChained = true;
    let checked = 0;

    for (const row of rows) {
      if (row.entryHash.startsWith('legacy-')) continue;
      const expected = computeEntryHash(
        row.previousHash,
        { entityType: row.entityType, entityId: row.entityId, action: row.action, actorId: row.actorId ?? undefined, oldValue: row.oldValue ?? undefined, newValue: row.newValue ?? undefined, reason: row.reason ?? undefined },
        row.createdAt,
      );
      checked += 1;
      // The first chained row's previousHash is trusted as the chain's starting point (it may point
      // at a pre-chain 'legacy-*' hash); every row after that must chain from the one before it.
      const linkOk = isFirstChained || row.previousHash === previousHash;
      if (expected !== row.entryHash || !linkOk) {
        breaks.push({ id: row.id, createdAt: row.createdAt });
      }
      previousHash = row.entryHash;
      isFirstChained = false;
    }

    if (rows.length > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      await prisma.auditChainAnchor.upsert({
        where: { anchorDate: today },
        create: { anchorDate: today, lastHash: rows[rows.length - 1].entryHash, entryCount: rows.length },
        update: { lastHash: rows[rows.length - 1].entryHash, entryCount: rows.length },
      });
    }

    res.json({ totalEntries: rows.length, chainedEntriesChecked: checked, intact: breaks.length === 0, breaks });
  }),
);
