import { Router } from 'express';
import { AwardCategory, StudentStatus, NotificationCategory } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate, authorize, ROLE_GROUPS } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/apiError';
import { computeStudentComposite } from '@/lib/scoring';
import { notify } from '@/lib/notify';

export const studentOfMonthRouter = Router();
studentOfMonthRouter.use(authenticate);

function previousPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number);
  const date = new Date(y, m - 2, 1); // m is 1-indexed; go back one month
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Institute-wide or batch-scoped leaderboard by composite score — read-only, does not publish awards. */
studentOfMonthRouter.get(
  '/leaderboard',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const batchId = req.query.batchId as string | undefined;
    const studentType = req.query.studentType as 'STUDENT' | 'INTERN' | undefined;
    const limit = Math.min(50, Number(req.query.limit ?? 10));
    const students = await prisma.student.findMany({
      where: {
        status: StudentStatus.ACTIVE,
        ...(batchId ? { currentBatchId: batchId } : {}),
        ...(studentType ? { internStatus: studentType === 'INTERN' ? { not: null } : null } : {}),
      },
      select: { id: true, firstName: true, lastName: true, studentCode: true, currentBatch: { select: { name: true } } },
    });
    const scored = await Promise.all(
      students.map(async (s) => ({ student: s, composite: (await computeStudentComposite(s.id)).composite })),
    );
    scored.sort((a, b) => b.composite - a.composite);
    res.json(scored.slice(0, limit));
  }),
);

const BATCH_OF_YEAR_MIN_SESSIONS_CONDUCTED_RATIO = 0.8;

/**
 * Read-only "Batch of the Year" ranking — average composite score across a batch's active
 * students. A batch only qualifies once at least 80% of its scheduled sessions for the year
 * have actually been conducted (COMPLETED), so a batch that barely started can't win on a
 * handful of sessions.
 */
studentOfMonthRouter.get(
  '/batch-of-year',
  authorize(...ROLE_GROUPS.STAFF),
  asyncHandler(async (req, res) => {
    const year = Number(req.query.year ?? new Date().getFullYear());
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59);

    const batches = await prisma.batch.findMany({
      where: { startDate: { lte: yearEnd }, OR: [{ endDate: null }, { endDate: { gte: yearStart } }] },
      include: {
        students: { where: { status: StudentStatus.ACTIVE }, select: { id: true } },
        sessions: { where: { sessionDate: { gte: yearStart, lte: yearEnd } }, select: { status: true } },
      },
    });

    const ranked = await Promise.all(
      batches
        .filter((b) => b.students.length > 0 && b.sessions.length > 0)
        .map(async (b) => {
          const conducted = b.sessions.filter((s) => s.status === 'COMPLETED').length;
          const conductedRatio = conducted / b.sessions.length;
          if (conductedRatio < BATCH_OF_YEAR_MIN_SESSIONS_CONDUCTED_RATIO) return null;
          const scores = await Promise.all(b.students.map((s) => computeStudentComposite(s.id)));
          const avgComposite = scores.reduce((sum, s) => sum + s.composite, 0) / scores.length;
          return {
            batchId: b.id,
            batchName: b.name,
            studentCount: b.students.length,
            sessionsConducted: conducted,
            sessionsScheduled: b.sessions.length,
            avgComposite: Math.round(avgComposite * 100) / 100,
          };
        }),
    );
    const qualified = ranked.filter((r): r is NonNullable<typeof r> => r !== null);
    qualified.sort((a, b) => b.avgComposite - a.avgComposite);
    res.json(qualified);
  }),
);

const computeSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
  batchId: z.string().optional(),
});

const SOM_MIN_ATTENDANCE_PCT = 60;

/**
 * Sorts qualifying candidates highest-first, breaking ties by attendance, then coursework
 * (taskPct), then earlier enrolment date (joiningDate) — per the qualification/tie-break rules.
 */
function rankCandidates<T extends { composite: number; attendancePct: number; taskPct: number; student: { joiningDate: Date } }>(
  candidates: T[],
): T[] {
  return [...candidates].sort((a, b) => {
    if (b.composite !== a.composite) return b.composite - a.composite;
    if (b.attendancePct !== a.attendancePct) return b.attendancePct - a.attendancePct;
    if (b.taskPct !== a.taskPct) return b.taskPct - a.taskPct;
    return a.student.joiningDate.getTime() - b.student.joiningDate.getTime();
  });
}

/** Uses the published composite-score policy per section 16 rule 7 (Student of the Month must use a published scoring policy). */
studentOfMonthRouter.post(
  '/compute',
  authorize(...ROLE_GROUPS.MANAGEMENT_LIKE),
  asyncHandler(async (req, res) => {
    const { period, batchId } = computeSchema.parse(req.body);
    // Intern of the Month: scored only from the intern population (internStatus set), per the
    // 4.0 issue log's rename from "Student of the Month".
    const students = await prisma.student.findMany({
      where: { status: StudentStatus.ACTIVE, internStatus: { not: null }, ...(batchId ? { currentBatchId: batchId } : {}) },
    });
    if (students.length === 0) throw ApiError.badRequest('No active interns in scope');

    const scored = await Promise.all(
      students.map(async (s) => {
        const breakdown = await computeStudentComposite(s.id);
        return { student: s, composite: breakdown.composite, attendancePct: breakdown.attendancePct, taskPct: breakdown.taskPct };
      }),
    );

    // Persist every scored student's composite for this period so future periods can diff
    // against it directly, instead of only against past award winners.
    await Promise.all(
      scored.map((s) =>
        prisma.studentCompositeSnapshot.upsert({
          where: { period_studentId: { period, studentId: s.student.id } },
          update: { composite: s.composite, attendancePct: s.attendancePct, taskPct: s.taskPct, batchId: s.student.currentBatchId },
          create: {
            period,
            studentId: s.student.id,
            batchId: s.student.currentBatchId,
            composite: s.composite,
            attendancePct: s.attendancePct,
            taskPct: s.taskPct,
          },
        }),
      ),
    );

    const qualified = scored.filter((s) => s.attendancePct >= SOM_MIN_ATTENDANCE_PCT);
    if (qualified.length === 0) throw ApiError.badRequest(`No student meets the ${SOM_MIN_ATTENDANCE_PCT}% attendance floor to qualify this period`);

    const topPerformer = rankCandidates(qualified)[0];

    const prevPeriod = previousPeriod(period);
    const priorSnapshots = await prisma.studentCompositeSnapshot.findMany({ where: { period: prevPeriod, studentId: { in: qualified.map((s) => s.student.id) } } });
    const priorScoreByStudent = new Map(priorSnapshots.map((s) => [s.studentId, s.composite]));

    const improved = qualified
      .filter((s) => priorScoreByStudent.has(s.student.id))
      .map((s) => ({ ...s, delta: s.composite - (priorScoreByStudent.get(s.student.id) ?? 0) }));
    const mostImproved = improved.length > 0 ? improved.sort((a, b) => b.delta - a.delta)[0] : undefined;

    async function upsertAward(category: AwardCategory, studentId: string, score: number) {
      const existing = await prisma.studentOfMonthAward.findFirst({ where: { period, category, batchId: batchId ?? null } });
      if (existing) return prisma.studentOfMonthAward.update({ where: { id: existing.id }, data: { studentId, score } });
      return prisma.studentOfMonthAward.create({ data: { period, category, studentId, score, batchId } });
    }

    const results = [];
    results.push(await upsertAward(AwardCategory.TOP_PERFORMER, topPerformer.student.id, topPerformer.composite));

    if (mostImproved) {
      results.push(await upsertAward(AwardCategory.MOST_IMPROVED, mostImproved.student.id, mostImproved.composite));
    }

    for (const award of results) {
      const student = await prisma.student.findUnique({ where: { id: award.studentId } });
      if (student) {
        await notify({
          userId: student.userId,
          category: NotificationCategory.GENERAL,
          title: 'Recognition award',
          message: `Congratulations! You were recognized as ${award.category === AwardCategory.TOP_PERFORMER ? 'Top Performer' : 'Most Improved'} for ${period}.`,
        });
      }
    }

    res.status(201).json({ topPerformer: results[0], mostImproved: mostImproved ? results[1] : null });
  }),
);

const editAwardSchema = z.object({ studentId: z.string(), score: z.number().min(0).max(100).optional() });

/** Manual override of a computed award (4.1: "should be editable") — e.g. correcting who won. */
studentOfMonthRouter.patch(
  '/:id',
  authorize(...ROLE_GROUPS.MANAGEMENT_LIKE),
  asyncHandler(async (req, res) => {
    const data = editAwardSchema.parse(req.body);
    const award = await prisma.studentOfMonthAward.update({ where: { id: req.params.id }, data });
    res.json(award);
  }),
);

studentOfMonthRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const period = req.query.period as string | undefined;
    const batchId = req.query.batchId as string | undefined;
    const awards = await prisma.studentOfMonthAward.findMany({
      where: { ...(period ? { period } : {}), ...(batchId ? { batchId } : {}) },
      orderBy: { period: 'desc' },
      include: { student: { select: { id: true, firstName: true, lastName: true, studentCode: true, photoUrl: true } }, batch: { select: { name: true } } },
    });
    res.json(awards);
  }),
);
