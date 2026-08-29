import crypto from 'crypto';
import { RoleName } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { hashPassword, verifyPassword, isStrongPassword, PASSWORD_POLICY_MESSAGE } from '@/utils/password';
import { signAccessToken, signRefreshToken, verifyRefreshToken, signMfaChallengeToken, verifyMfaChallengeToken } from '@/utils/jwt';
import { ApiError } from '@/utils/apiError';
import { env } from '@/config/env';
import ms from '@/utils/ms';
import { verifyTotp, consumeBackupCode, isMfaRequiredForRole } from '@/lib/mfa';
import { getScoringConfig } from '@/lib/scoring';
import { recordAudit } from '@/lib/audit';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** familyId carries across rotation so reuse of an already-rotated-away token can revoke the whole lineage. */
async function issueTokenPair(userId: string, email: string, role: RoleName, familyId?: string) {
  const accessToken = signAccessToken({ sub: userId, email, role });
  const refreshToken = signRefreshToken(userId);

  const session = await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(refreshToken),
      familyId: familyId ?? crypto.randomUUID(),
      expiresAt: new Date(Date.now() + ms(env.jwtRefreshExpiresIn)),
    },
  });

  return { accessToken, refreshToken, sessionId: session.id };
}

function toUserPayload(user: {
  id: string;
  email: string;
  role: RoleName;
  mustChangePassword: boolean;
  mustSetupMfa: boolean;
  mfaEnabled: boolean;
  student?: unknown;
  faculty?: unknown;
  parent?: unknown;
}) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    mustSetupMfa: user.mustSetupMfa,
    mfaEnabled: user.mfaEnabled,
    profile: user.student ?? user.faculty ?? user.parent ?? null,
  };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { student: true, faculty: true, parent: true },
  });
  if (!user || !user.isActive) throw ApiError.unauthorized('Invalid email or password');

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    throw ApiError.unauthorized(`Account locked after repeated failed attempts. Try again in ${minutesLeft} minute(s).`);
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const config = await getScoringConfig();
    const failedLoginAttempts = user.failedLoginAttempts + 1;
    const lockedUntil =
      failedLoginAttempts >= config.loginLockoutThreshold
        ? new Date(Date.now() + config.loginLockoutMinutes * 60000)
        : null;
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: lockedUntil ? 0 : failedLoginAttempts, lockedUntil },
    });
    await recordAudit({ entityType: 'User', entityId: user.id, action: lockedUntil ? 'LOGIN_LOCKOUT' : 'LOGIN_FAILED', actorId: user.id });
    if (lockedUntil) {
      throw ApiError.unauthorized(`Too many failed attempts. Account locked for ${config.loginLockoutMinutes} minute(s).`);
    }
    throw ApiError.unauthorized('Invalid email or password');
  }

  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
  }

  if (user.mfaEnabled) {
    return { mfaRequired: true, mfaToken: signMfaChallengeToken(user.id) };
  }

  const mustSetupMfa = !user.mfaEnabled && (await isMfaRequiredForRole(user.role));
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date(), mustSetupMfa },
  });
  await recordAudit({ entityType: 'User', entityId: user.id, action: 'LOGIN', actorId: user.id });

  const tokens = await issueTokenPair(user.id, user.email, user.role);
  return { ...tokens, mfaRequired: false, user: toUserPayload({ ...updated, student: user.student, faculty: user.faculty, parent: user.parent }) };
}

export async function verifyMfaLogin(mfaToken: string, code: string) {
  let payload: { sub: string };
  try {
    payload = verifyMfaChallengeToken(mfaToken);
  } catch {
    throw ApiError.unauthorized('MFA challenge expired; please sign in again');
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { student: true, faculty: true, parent: true },
  });
  if (!user || !user.isActive || !user.mfaEnabled || !user.mfaSecret) {
    throw ApiError.unauthorized('MFA is not available for this account');
  }

  let ok = await verifyTotp(user.mfaSecret, code);
  if (!ok) {
    const { matched, remaining } = await consumeBackupCode(user.mfaBackupCodeHashes, code);
    if (matched) {
      ok = true;
      await prisma.user.update({ where: { id: user.id }, data: { mfaBackupCodeHashes: remaining } });
    }
  }
  if (!ok) throw ApiError.unauthorized('Invalid authentication code');

  const updated = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), mustSetupMfa: false } });
  await recordAudit({ entityType: 'User', entityId: user.id, action: 'LOGIN_MFA', actorId: user.id });
  const tokens = await issueTokenPair(user.id, user.email, user.role);
  return { ...tokens, mfaRequired: false, user: toUserPayload({ ...updated, student: user.student, faculty: user.faculty, parent: user.parent }) };
}

export async function refresh(refreshToken: string) {
  let payload: { sub: string };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const tokenHash = hashToken(refreshToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!stored) throw ApiError.unauthorized('Refresh token is no longer valid');

  // Reuse of a token that was already rotated away is a strong signal of a stolen/replayed token —
  // revoke every token descended from the same login so the attacker's copy stops working too.
  if (stored.revokedAt) {
    await prisma.refreshToken.updateMany({ where: { familyId: stored.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
    throw ApiError.unauthorized('This session was invalidated for security reasons; please sign in again');
  }
  if (stored.expiresAt < new Date()) throw ApiError.unauthorized('Refresh token is no longer valid');

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive) throw ApiError.unauthorized('Account is inactive');

  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
  return issueTokenPair(user.id, user.email, user.role, stored.familyId);
}

export async function logout(refreshToken: string) {
  const tokenHash = hashToken(refreshToken);
  await prisma.refreshToken.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } });
}

/** Password changes require the current password (and a live MFA code, where enabled) for every role — no exceptions. */
export async function changePassword(userId: string, currentPassword: string, newPassword: string, mfaCode?: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound('User not found');

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) throw ApiError.badRequest('Current password is incorrect');

  if (user.mfaEnabled) {
    if (!mfaCode) throw ApiError.badRequest('Authentication code is required to change your password');
    const validTotp = user.mfaSecret ? await verifyTotp(user.mfaSecret, mfaCode) : false;
    if (!validTotp) {
      const { matched } = await consumeBackupCode(user.mfaBackupCodeHashes, mfaCode);
      if (!matched) throw ApiError.badRequest('Invalid authentication code');
    }
  }

  if (!isStrongPassword(newPassword)) {
    throw ApiError.badRequest(PASSWORD_POLICY_MESSAGE);
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: false } });
  await prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

/** Active (non-revoked, unexpired) sessions for the current user — for the "log out other devices" UI. */
export async function listSessions(userId: string) {
  return prisma.refreshToken.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, createdAt: true, expiresAt: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function revokeSession(userId: string, sessionId: string) {
  const session = await prisma.refreshToken.findUnique({ where: { id: sessionId } });
  if (!session || session.userId !== userId) throw ApiError.notFound('Session not found');
  await prisma.refreshToken.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
}
