import crypto from 'crypto';
import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib';
import bcrypt from 'bcryptjs';
import { RoleName } from '@prisma/client';
import { getScoringConfig } from '@/lib/scoring';

const totp = new TOTP({
  issuer: 'SI Portal',
  crypto: new NobleCryptoPlugin(),
  base32: new ScureBase32Plugin(),
});

export function generateMfaSecret(): string {
  return totp.generateSecret();
}

export function mfaKeyUri(email: string, secret: string): string {
  return totp.toURI({ label: email, secret });
}

export async function verifyTotp(secret: string, token: string): Promise<boolean> {
  try {
    const result = await totp.verify(token, { secret, epochTolerance: 30 });
    return result.valid;
  } catch {
    return false;
  }
}

/** Generates plaintext one-time backup codes plus their bcrypt hashes for storage. */
export async function generateBackupCodes(count = 8): Promise<{ plain: string[]; hashes: string[] }> {
  const plain = Array.from({ length: count }, () => crypto.randomBytes(5).toString('hex').toUpperCase());
  const hashes = await Promise.all(plain.map((code) => bcrypt.hash(code, 10)));
  return { plain, hashes };
}

export async function consumeBackupCode(hashes: string[], code: string): Promise<{ matched: boolean; remaining: string[] }> {
  for (const hash of hashes) {
    // eslint-disable-next-line no-await-in-loop
    if (await bcrypt.compare(code, hash)) {
      return { matched: true, remaining: hashes.filter((h) => h !== hash) };
    }
  }
  return { matched: false, remaining: hashes };
}

/** Whether MFA setup is currently mandated for this role by the institution's configured policy. */
export async function isMfaRequiredForRole(role: RoleName): Promise<boolean> {
  const config = await getScoringConfig();
  return config.mfaRequiredRoles.includes(role);
}
