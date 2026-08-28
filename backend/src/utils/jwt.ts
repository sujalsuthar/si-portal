import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '@/config/env';
import { RoleName } from '@prisma/client';

export interface AccessTokenPayload {
  sub: string;
  role: RoleName;
  email: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwtAccessSecret, {
    expiresIn: env.jwtAccessExpiresIn,
  } as SignOptions);
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId, type: 'refresh' }, env.jwtRefreshSecret, {
    expiresIn: env.jwtRefreshExpiresIn,
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwtAccessSecret) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): { sub: string } {
  return jwt.verify(token, env.jwtRefreshSecret) as { sub: string };
}

/** Short-lived token issued after password verification, pending the second (MFA) factor. */
export function signMfaChallengeToken(userId: string): string {
  return jwt.sign({ sub: userId, type: 'mfa_challenge' }, env.jwtAccessSecret, { expiresIn: '5m' } as SignOptions);
}

export function verifyMfaChallengeToken(token: string): { sub: string } {
  const payload = jwt.verify(token, env.jwtAccessSecret) as { sub: string; type?: string };
  if (payload.type !== 'mfa_challenge') throw new Error('Invalid token type');
  return payload;
}
