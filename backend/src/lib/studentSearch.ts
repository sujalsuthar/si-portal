/** Builds a Prisma where fragment for student name/code search (supports "First Last"). */
export function studentSearchOrClause(search: string): Record<string, unknown> {
  const trimmed = search.trim();
  const terms = trimmed.split(/\s+/).filter(Boolean);
  if (terms.length >= 2) {
    const first = terms[0];
    const rest = terms.slice(1).join(' ');
    return {
      OR: [
        {
          AND: [
            { firstName: { contains: first, mode: 'insensitive' as const } },
            { lastName: { contains: rest, mode: 'insensitive' as const } },
          ],
        },
        { firstName: { contains: trimmed, mode: 'insensitive' as const } },
        { lastName: { contains: trimmed, mode: 'insensitive' as const } },
        { studentCode: { contains: trimmed, mode: 'insensitive' as const } },
      ],
    };
  }
  return {
    OR: [
      { firstName: { contains: trimmed, mode: 'insensitive' as const } },
      { lastName: { contains: trimmed, mode: 'insensitive' as const } },
      { studentCode: { contains: trimmed, mode: 'insensitive' as const } },
    ],
  };
}
