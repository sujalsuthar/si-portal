import { RoleName, Prisma } from '@prisma/client';
import { hashPassword } from '@/utils/password';
import { generateTempPassword } from '@/utils/tempPassword';
import { ApiError } from '@/utils/apiError';

/** Shared helper: creates the User row that every Student/Faculty/Parent profile hangs off. */
export async function createUserAccount(
  tx: Prisma.TransactionClient,
  email: string,
  role: RoleName,
): Promise<{ userId: string; tempPassword: string }> {
  const existing = await tx.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) throw ApiError.conflict(`An account already exists for ${email}`);

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const user = await tx.user.create({
    data: { email: email.toLowerCase(), passwordHash, role, mustChangePassword: true },
  });
  return { userId: user.id, tempPassword };
}
