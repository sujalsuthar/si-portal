/** Minimal duration-string parser ("15m", "7d", "1h", "30s") to milliseconds. Avoids pulling in the `ms` package. */
const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

export default function ms(duration: string): number {
  const match = /^(\d+)\s*(s|m|h|d)$/.exec(duration.trim());
  if (!match) {
    const asNumber = Number(duration);
    if (!Number.isNaN(asNumber)) return asNumber;
    throw new Error(`Invalid duration string: ${duration}`);
  }
  const [, amount, unit] = match;
  return Number(amount) * UNIT_MS[unit];
}
