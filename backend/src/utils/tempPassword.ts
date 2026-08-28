import crypto from 'crypto';

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';

/** Generates a random password that satisfies the strong-password policy, for new-account provisioning. */
export function generateTempPassword(): string {
  const pick = (chars: string) => chars[crypto.randomInt(chars.length)];
  const required = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(DIGITS)];
  const all = UPPER + LOWER + DIGITS;
  const rest = Array.from({ length: 8 }, () => pick(all));
  return [...required, ...rest].sort(() => crypto.randomInt(3) - 1).join('');
}
