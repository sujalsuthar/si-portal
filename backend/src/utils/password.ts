import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

const MIN_LENGTH = 12;
const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

/**
 * A short, embedded denylist of extremely common passwords/patterns — a deliberate, offline
 * substitute for a full k-anonymity breach-database check (e.g. HaveIBeenPwned's range API), chosen
 * so password validation never depends on outbound network access being available at deploy time.
 */
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '123456789012', 'qwertyuiop12', 'letmein12345',
  'welcome12345', 'admin12345678', 'iloveyou1234', 'sunshine1234', 'princess1234',
  'password1234', 'passw0rd1234', 'changeme1234', 'changeme123!', 'p@ssw0rd1234',
]);

export function isStrongPassword(password: string): boolean {
  if (password.length < MIN_LENGTH) return false;
  if (!STRONG_PASSWORD_REGEX.test(password)) return false;
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return false;
  return true;
}

export const PASSWORD_POLICY_MESSAGE =
  `Password must be at least ${MIN_LENGTH} characters, include upper and lower case letters and a number, and not be a commonly used password.`;
