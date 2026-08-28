import { AttendanceStatus, AttendanceContext, GradeStatus, CertificationStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export interface CompositeBreakdown {
  attendancePct: number;
  examPct: number;
  taskPct: number;
  behaviourPct: number;
  presentationPct: number;
  certificationPct: number;
  selfAssessmentPct: number;
  projectPct: number;
  composite: number;
  weights: {
    attendanceWeight: number;
    examWeight: number;
    taskWeight: number;
    behaviourWeight: number;
    presentationWeight: number;
    certificationWeight: number;
    selfAssessmentWeight: number;
    projectWeight: number;
  };
}

export async function getScoringConfig() {
  const existing = await prisma.scoringConfig.findFirst({ orderBy: { createdAt: 'desc' } });
  if (existing) return existing;
  return prisma.scoringConfig.create({ data: { mfaRequiredRoles: [] } });
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

/**
 * Computes the configurable composite performance score for a student.
 * The composite is guidance/recognition-only per the product spec (section 8) — never used
 * for disciplinary or high-stakes academic decisions on its own.
 */
export async function computeStudentComposite(studentId: string): Promise<CompositeBreakdown> {
  const config = await getScoringConfig();

  const [attendances, grades, assignments, submissions, behaviourEvents, presentations, certifications, selfAssessments, projectGroupIds] =
    await Promise.all([
      prisma.attendance.findMany({ where: { studentId, context: AttendanceContext.SESSION } }),
      prisma.grade.findMany({ where: { studentId, status: GradeStatus.PUBLISHED } }),
      prisma.taskAssignment.findMany({ where: { studentId }, include: { task: { select: { points: true } } } }),
      prisma.taskSubmission.findMany({ where: { studentId }, select: { taskId: true, pointsAwarded: true } }),
      prisma.behaviourEvent.findMany({ where: { studentId } }),
      prisma.presentation.findMany({ where: { studentId, status: 'COMPLETED' } }),
      prisma.certification.findMany({ where: { studentId } }),
      prisma.selfAssessment.findMany({ where: { studentId } }),
      prisma.projectMember.findMany({ where: { studentId }, select: { groupId: true } }),
    ]);

  const projectMarks =
    projectGroupIds.length > 0
      ? await prisma.projectMark.findMany({
          where: {
            groupId: { in: projectGroupIds.map((g) => g.groupId) },
            OR: [{ studentId: null }, { studentId }],
          },
        })
      : [];

  // Attendance: present = 1, late = 0.5, leave/excused/absent = 0
  let attendancePct = 0;
  if (attendances.length > 0) {
    const score = attendances.reduce((sum, a) => {
      if (a.status === AttendanceStatus.PRESENT) return sum + 1;
      if (a.status === AttendanceStatus.LATE) return sum + 0.5;
      return sum;
    }, 0);
    attendancePct = clampPct((score / attendances.length) * 100);
  }

  // Exams: average published percentage
  const examPct = grades.length > 0 ? clampPct(grades.reduce((s, g) => s + g.percentage, 0) / grades.length) : 0;

  // Tasks: actual marks average — sum of pointsAwarded (0 if not yet evaluated) over sum of
  // each assigned task's max points, not a completion-state heuristic.
  let taskPct = 0;
  if (assignments.length > 0) {
    const byTask = new Map(submissions.map((s) => [s.taskId, s]));
    const totalPossible = assignments.reduce((sum, a) => sum + (a.task.points || 0), 0);
    if (totalPossible > 0) {
      const totalAwarded = assignments.reduce((sum, a) => sum + (byTask.get(a.taskId)?.pointsAwarded ?? 0), 0);
      taskPct = clampPct((totalAwarded / totalPossible) * 100);
    }
  }

  // Behaviour: baseline 70, net points scaled asymmetrically — a positive net adds 3 points of
  // index per net point, a negative net subtracts 6 per net point (misconduct weighs 2x credit).
  // Negative events created by faculty must be admin-authorized before they count.
  const behaviourPoints = behaviourEvents
    .filter((e) => e.type === 'POSITIVE' || e.authorizedById)
    .reduce((s, e) => s + e.points, 0);
  const behaviourPct = clampPct(behaviourPoints >= 0 ? 70 + behaviourPoints * 3 : 70 + behaviourPoints * 6);

  // Presentations: average totalScore assumed out of 60 (6 rubric items x 10)
  const presentationPct =
    presentations.length > 0
      ? clampPct(
          (presentations.reduce((s, p) => s + (p.totalScore ?? 0), 0) / presentations.length / 60) * 100,
        )
      : 0;

  // Certifications: share passed out of attempted (recommended+)
  const attemptedCerts = certifications.filter((c) => c.status !== CertificationStatus.RECOMMENDED);
  const certificationPct =
    attemptedCerts.length > 0
      ? clampPct((attemptedCerts.filter((c) => c.status === CertificationStatus.PASSED).length / attemptedCerts.length) * 100)
      : certifications.length > 0
        ? 0
        : 0;

  // Self assessment: average confidence rating (1-5) as %. Only pre-4.0-redesign records carry a
  // rating — newer Approval Request entries don't collect one and are excluded here, not zeroed.
  const ratedSelfAssessments = selfAssessments.filter((a) => a.confidenceRating !== null);
  const selfAssessmentPct =
    ratedSelfAssessments.length > 0
      ? clampPct((ratedSelfAssessments.reduce((s, a) => s + a.confidenceRating!, 0) / ratedSelfAssessments.length / 5) * 100)
      : 0;

  // Projects: average of (marksObtained / maxMarks) across group and individual marks received.
  const projectPct =
    projectMarks.length > 0
      ? clampPct((projectMarks.reduce((s, m) => s + m.marksObtained / m.maxMarks, 0) / projectMarks.length) * 100)
      : 0;

  const composite = clampPct(
    (attendancePct * config.attendanceWeight +
      examPct * config.examWeight +
      taskPct * config.taskWeight +
      behaviourPct * config.behaviourWeight +
      presentationPct * config.presentationWeight +
      certificationPct * config.certificationWeight +
      selfAssessmentPct * config.selfAssessmentWeight +
      projectPct * config.projectWeight) /
      100,
  );

  return {
    attendancePct,
    examPct,
    taskPct,
    behaviourPct,
    presentationPct,
    certificationPct,
    selfAssessmentPct,
    projectPct,
    composite,
    weights: {
      attendanceWeight: config.attendanceWeight,
      examWeight: config.examWeight,
      taskWeight: config.taskWeight,
      behaviourWeight: config.behaviourWeight,
      presentationWeight: config.presentationWeight,
      certificationWeight: config.certificationWeight,
      selfAssessmentWeight: config.selfAssessmentWeight,
      projectWeight: config.projectWeight,
    },
  };
}
