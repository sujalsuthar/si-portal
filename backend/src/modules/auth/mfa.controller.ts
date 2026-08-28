import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/auth';
import { ApiError } from '@/utils/apiError';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/utils/password';
import { generateMfaSecret, mfaKeyUri, verifyTotp, generateBackupCodes, consumeBackupCode } from '@/lib/mfa';
import { recordAudit } from '@/lib/audit';

export const mfaRouter = Router();
mfaRouter.use(authenticate);

/** Step 1: generate a pending secret and QR provisioning URI, for any of the six roles. */
mfaRouter.post(
  '/setup',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
    if (!user) throw ApiError.notFound('User not found');
    if (user.mfaEnabled) throw ApiError.badRequest('MFA is already enabled; disable it first to re-enrol');

    const secret = generateMfaSecret();
    await prisma.user.update({ where: { id: user.id }, data: { mfaSecret: secret } });

    res.json({ secret, otpauthUrl: mfaKeyUri(user.email, secret) });
  }),
);

const enableSchema = z.object({ code: z.string().min(6).max(8) });

/** Step 2: confirm the authenticator produces a valid code, then activate MFA and issue backup codes once. */
mfaRouter.post(
  '/enable',
  asyncHandler(async (req, res) => {
    const { code } = enableSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
    if (!user?.mfaSecret) throw ApiError.badRequest('Call setup first to generate a secret');
    if (!(await verifyTotp(user.mfaSecret, code))) throw ApiError.badRequest('Invalid authentication code');

    const { plain, hashes } = await generateBackupCodes();
    await prisma.user.update({
      where: { id: user.id },
      data: { mfaEnabled: true, mustSetupMfa: false, mfaEnabledAt: new Date(), mfaBackupCodeHashes: hashes },
    });
    await recordAudit({ entityType: 'User', entityId: user.id, action: 'MFA_ENABLE', actorId: user.id });

    res.json({ backupCodes: plain });
  }),
);

const disableSchema = z.object({ currentPassword: z.string().min(1), code: z.string().min(6).max(8) });

mfaRouter.post(
  '/disable',
  asyncHandler(async (req, res) => {
    const { currentPassword, code } = disableSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
    if (!user) throw ApiError.notFound('User not found');
    if (!(await verifyPassword(currentPassword, user.passwordHash))) throw ApiError.badRequest('Current password is incorrect');

    let ok = user.mfaSecret ? await verifyTotp(user.mfaSecret, code) : false;
    if (!ok) ok = (await consumeBackupCode(user.mfaBackupCodeHashes, code)).matched;
    if (!ok) throw ApiError.badRequest('Invalid authentication code');

    await prisma.user.update({
      where: { id: user.id },
      data: { mfaEnabled: false, mfaSecret: null, mfaBackupCodeHashes: [], mfaEnabledAt: null },
    });
    await recordAudit({ entityType: 'User', entityId: user.id, action: 'MFA_DISABLE', actorId: user.id });
    res.status(204).end();
  }),
);
