import { NotificationCategory, InstalmentStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { notify, notifyStudentParents } from '@/lib/notify';

/** True if this student already got a reminder for this instalment today — avoids re-notifying on every run. */
async function alreadyRemindedToday(userId: string, instalmentId: string): Promise<boolean> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const existing = await prisma.notification.findFirst({
    where: { userId, category: NotificationCategory.FEE, link: `instalment:${instalmentId}`, createdAt: { gte: startOfToday } },
  });
  return !!existing;
}

/** Marks past-due pending instalments OVERDUE and reminds the student and their parents once a day (UR-FEE-10/FR-FEE-12). */
export async function runFeeOverdueReminders(): Promise<{ remindedCount: number }> {
  const overdue = await prisma.instalment.findMany({
    where: { status: InstalmentStatus.PENDING, dueDate: { lt: new Date() } },
    include: { feeAccount: { include: { student: true } } },
  });

  let remindedCount = 0;
  for (const instalment of overdue) {
    await prisma.instalment.update({ where: { id: instalment.id }, data: { status: InstalmentStatus.OVERDUE } });

    const { student } = instalment.feeAccount;
    if (await alreadyRemindedToday(student.userId, instalment.id)) continue;

    const daysOverdue = Math.floor((Date.now() - instalment.dueDate.getTime()) / (1000 * 60 * 60 * 24));
    const message = `Instalment #${instalment.sequence} of ₹${instalment.amount.toFixed(2)} was due ${daysOverdue} day(s) ago. Please clear the balance to avoid a hold.`;
    await notify({ userId: student.userId, category: NotificationCategory.FEE, title: 'Fee instalment overdue', message, link: `instalment:${instalment.id}` });
    await notifyStudentParents(student.id, { category: NotificationCategory.FEE, title: 'Fee instalment overdue', message, link: `instalment:${instalment.id}` });
    remindedCount++;
  }

  return { remindedCount };
}
