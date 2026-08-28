import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/auth';
import { ApiError } from '@/utils/apiError';
import { prisma } from '@/lib/prisma';
import * as authService from './auth.service';
import { changePasswordSchema, loginSchema, refreshSchema } from './auth.validation';

export const authRouter = Router();

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const result = await authService.login(email, password);
    res.json(result);
  }),
);

const mfaVerifySchema = z.object({ mfaToken: z.string().min(1), code: z.string().min(6).max(8) });

authRouter.post(
  '/mfa/login-verify',
  asyncHandler(async (req, res) => {
    const { mfaToken, code } = mfaVerifySchema.parse(req.body);
    const result = await authService.verifyMfaLogin(mfaToken, code);
    res.json(result);
  }),
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    const result = await authService.refresh(refreshToken);
    res.json(result);
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    await authService.logout(refreshToken);
    res.status(204).end();
  }),
);

authRouter.post(
  '/change-password',
  authenticate,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword, mfaCode } = changePasswordSchema.parse(req.body);
    await authService.changePassword(req.auth!.userId, currentPassword, newPassword, mfaCode);
    res.status(204).end();
  }),
);

authRouter.get(
  '/sessions',
  authenticate,
  asyncHandler(async (req, res) => {
    const sessions = await authService.listSessions(req.auth!.userId);
    res.json(sessions);
  }),
);

authRouter.delete(
  '/sessions/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    await authService.revokeSession(req.auth!.userId, req.params.id);
    res.status(204).end();
  }),
);

authRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.userId },
      include: { student: true, faculty: true, parent: true },
    });
    if (!user) throw ApiError.notFound('User not found');
    res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      mustSetupMfa: user.mustSetupMfa,
      mfaEnabled: user.mfaEnabled,
      profile: user.student ?? user.faculty ?? user.parent ?? null,
    });
  }),
);
