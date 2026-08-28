import { NextFunction, Request, Response } from 'express';
import { RoleName } from '@prisma/client';
import { verifyAccessToken } from '@/utils/jwt';
import { ApiError } from '@/utils/apiError';
import { prisma } from '@/lib/prisma';

export interface AuthContext {
  userId: string;
  email: string;
  role: RoleName;
  studentId?: string;
  facultyId?: string;
  parentId?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Missing bearer token');
    }
    const token = header.slice('Bearer '.length);
    const payload = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { student: true, faculty: true, parent: true },
    });

    if (!user || !user.isActive) {
      throw ApiError.unauthorized('Account is inactive or no longer exists');
    }

    req.auth = {
      userId: user.id,
      email: user.email,
      role: user.role,
      studentId: user.student?.id,
      facultyId: user.faculty?.id,
      parentId: user.parent?.id,
    };
    next();
  } catch (err) {
    next(ApiError.unauthorized('Invalid or expired token'));
  }
}

export function authorize(...roles: RoleName[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(ApiError.unauthorized());
    if (roles.length > 0 && !roles.includes(req.auth.role)) {
      return next(ApiError.forbidden('You do not have permission to perform this action'));
    }
    next();
  };
}

export const ROLE_GROUPS = {
  ADMIN_LIKE: [RoleName.SUPER_ADMIN, RoleName.ACADEMIC_ADMIN] as RoleName[],
  MANAGEMENT_LIKE: [RoleName.SUPER_ADMIN, RoleName.MANAGEMENT, RoleName.ACADEMIC_ADMIN] as RoleName[],
  STAFF: [RoleName.SUPER_ADMIN, RoleName.MANAGEMENT, RoleName.ACADEMIC_ADMIN, RoleName.FACULTY] as RoleName[],
  // Fee section: Super Admin, Academic Admin and Accounts hold full fee authority per README SAMP 2.0 row 4.
  FEE_FULL: [RoleName.SUPER_ADMIN, RoleName.ACADEMIC_ADMIN, RoleName.ACCOUNTS] as RoleName[],
  ALL: [
    RoleName.SUPER_ADMIN,
    RoleName.MANAGEMENT,
    RoleName.ACADEMIC_ADMIN,
    RoleName.FACULTY,
    RoleName.ACCOUNTS,
    RoleName.STUDENT,
    RoleName.PARENT,
  ] as RoleName[],
};
