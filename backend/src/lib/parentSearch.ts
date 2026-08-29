import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

function ilike(term: string): Prisma.StringFilter {
  return { contains: term, mode: 'insensitive' };
}

/** Resolve student ids whose name or code matches the search term (supports multi-word queries). */
export async function findStudentIdsBySearch(term: string, scope?: Prisma.StudentWhereInput): Promise<string[]> {
  const parts = term.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return [];

  const nameMatch =
    parts.length === 1
      ? {
          OR: [
            { firstName: ilike(parts[0]) },
            { lastName: ilike(parts[0]) },
            { studentCode: ilike(parts[0]) },
          ],
        }
      : {
          AND: parts.map((part) => ({
            OR: [
              { firstName: ilike(part) },
              { lastName: ilike(part) },
              { studentCode: ilike(part) },
            ],
          })),
        };

  const where: Prisma.StudentWhereInput = scope ? { AND: [scope, nameMatch] } : nameMatch;

  const rows = await prisma.student.findMany({
    where,
    select: { id: true },
    take: 200,
  });
  return rows.map((r) => r.id);
}

/** Build a ParentGuardian where clause that matches parent name or linked student name/code. */
export async function buildParentListWhere(
  search: string,
  options?: { studentScope?: Prisma.StudentWhereInput },
): Promise<Prisma.ParentGuardianWhereInput> {
  const term = search.trim();
  if (!term) return {};

  const studentIds = await findStudentIdsBySearch(term, options?.studentScope);

  const orClauses: Prisma.ParentGuardianWhereInput[] = [
    { firstName: ilike(term) },
    { lastName: ilike(term) },
  ];

  if (studentIds.length > 0) {
    orClauses.push({ students: { some: { studentId: { in: studentIds } } } });
  }

  return { OR: orClauses };
}
