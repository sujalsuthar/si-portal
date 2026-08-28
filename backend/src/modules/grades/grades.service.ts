/** Rounds a percentage to 2 decimal places (C6.3). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Named grading bands (C6.3), not letter grades. */
export function gradeLetterFor(pct: number): string {
  if (pct >= 90) return 'Outstanding';
  if (pct >= 80) return 'Excellent';
  if (pct >= 70) return 'Very good';
  if (pct >= 60) return 'Good';
  if (pct >= 50) return 'Satisfactory';
  if (pct >= 40) return 'Pass';
  return 'Not yet passed';
}

/** Grade points corresponding to each named band, per the institute's 10-point scale. */
export function gradePointFor(pct: number): number {
  if (pct >= 90) return 10;
  if (pct >= 80) return 9;
  if (pct >= 70) return 8;
  if (pct >= 60) return 7;
  if (pct >= 50) return 6;
  if (pct >= 40) return 5;
  return 0;
}
