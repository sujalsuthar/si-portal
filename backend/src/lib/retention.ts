import { StudentStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getScoringConfig } from '@/lib/scoring';
import { recordAudit } from '@/lib/audit';
import { logger } from '@/lib/logger';

/**
 * Anonymises archived students past the configured retention age. Off by default
 * (ScoringConfig.retentionAutoAnonymizeEnabled) so no deployment silently alters data — a Super
 * Admin must explicitly enable it after reviewing the policy in Settings.
 */
export async function runRetentionSweep(): Promise<{ scanned: number; anonymised: number }> {
  const config = await getScoringConfig();
  if (!config.retentionAutoAnonymizeEnabled) return { scanned: 0, anonymised: 0 };

  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - config.batchRetentionYears);

  const candidates = await prisma.student.findMany({
    where: { status: StudentStatus.ARCHIVED, archivedAt: { lte: cutoff } },
    include: { user: true },
  });

  let anonymised = 0;
  for (const student of candidates) {
    if (student.user.email.endsWith('@anonymised.siportal.edu')) continue; // already processed
    const placeholder = `redacted-${student.id}`;
    await prisma.$transaction([
      prisma.student.update({
        where: { id: student.id },
        data: {
          firstName: 'Redacted',
          lastName: 'Redacted',
          phone: null,
          address: null,
          emergencyContactName: null,
          emergencyContactPhone: null,
        },
      }),
      prisma.user.update({ where: { id: student.userId }, data: { email: `${placeholder}@anonymised.siportal.edu`, isActive: false } }),
    ]);
    await recordAudit({ entityType: 'Student', entityId: student.id, action: 'RETENTION_ANONYMISE', reason: `Past ${config.batchRetentionYears}-year retention window` });
    anonymised += 1;
  }

  logger.info(`Retention sweep: scanned ${candidates.length}, anonymised ${anonymised}`);
  return { scanned: candidates.length, anonymised };
}
