import { Router } from 'express';
import {
  RoleName,
  FeePlanType,
  InstalmentStatus,
  PaymentMode,
  RefundRequestType,
  RefundRequestStatus,
  NotificationCategory,
} from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate, authorize, ROLE_GROUPS } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/apiError';
import { recordAudit } from '@/lib/audit';
import { assertStudentAccess, getParentStudentIds } from '@/utils/scope';
import { computeReceiptVerificationCode } from '@/lib/integrity';
import { generateReceiptPdf } from '@/lib/pdf';
import { notify, notifyStudentParents } from '@/lib/notify';
import { runFeeOverdueReminders } from '@/lib/feeReminders';

export const feesRouter = Router();
feesRouter.use(authenticate);

/** Gapless per-financial-year receipt number in the format CO-R-YYYY-NNNNNN (Indian FY: April–March). */
async function nextReceiptNumber(date: Date): Promise<string> {
  const financialYear = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  const sequence = await prisma.receiptSequence.upsert({
    where: { financialYear },
    update: { lastNumber: { increment: 1 } },
    create: { financialYear, lastNumber: 1 },
  });
  return `CO-R-${financialYear}-${String(sequence.lastNumber).padStart(6, '0')}`;
}

export async function computeOutstanding(feeAccountId: string): Promise<number> {
  const account = await prisma.feeAccount.findUnique({ where: { id: feeAccountId } });
  if (!account) throw ApiError.notFound('Fee account not found');
  const [payments, refunds] = await Promise.all([
    prisma.feePayment.findMany({ where: { feeAccountId }, include: { receipt: { include: { reversal: true } } } }),
    prisma.refundRequest.findMany({ where: { feeAccountId, status: RefundRequestStatus.APPROVED } }),
  ]);
  const paidTotal = payments.filter((p) => !p.receipt?.reversal).reduce((s, p) => s + p.amount, 0);
  const writeOffTotal = refunds.filter((r) => r.type === RefundRequestType.WRITE_OFF).reduce((s, r) => s + r.amount, 0);
  const reversedTotal = payments.filter((p) => p.receipt?.reversal).reduce((s, p) => s + p.amount, 0);
  return account.totalPayable - paidTotal - writeOffTotal + reversedTotal;
}

function ageingBand(dueDate: Date): 'current' | '1-30' | '31-60' | '61-90' | '90+' {
  const daysPast = Math.floor((Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
  if (daysPast <= 0) return 'current';
  if (daysPast <= 30) return '1-30';
  if (daysPast <= 60) return '31-60';
  if (daysPast <= 90) return '61-90';
  return '90+';
}

// ---------------------------------------------------------------- Fee structures (catalog)

const structureSchema = z.object({
  courseId: z.string().optional(),
  name: z.string().min(1),
  totalAmount: z.number().positive(),
  planType: z.nativeEnum(FeePlanType).default(FeePlanType.ONE_TIME),
  instalmentCount: z.number().int().positive().optional(),
});

feesRouter.get(
  '/structures',
  authorize(...ROLE_GROUPS.FEE_FULL, RoleName.MANAGEMENT),
  asyncHandler(async (_req, res) => {
    const items = await prisma.feeStructure.findMany({ orderBy: { createdAt: 'desc' }, include: { course: { select: { name: true } } } });
    res.json(items);
  }),
);

feesRouter.post(
  '/structures',
  authorize(...ROLE_GROUPS.FEE_FULL),
  asyncHandler(async (req, res) => {
    const data = structureSchema.parse(req.body);
    const structure = await prisma.feeStructure.create({ data });
    res.status(201).json(structure);
  }),
);

// ---------------------------------------------------------------- Fee accounts

const createAccountSchema = z.object({
  studentId: z.string(),
  feeStructureId: z.string().optional(),
  totalPayable: z.number().positive(),
  planType: z.nativeEnum(FeePlanType).default(FeePlanType.ONE_TIME),
  instalments: z.array(z.object({ amount: z.number().positive(), dueDate: z.coerce.date() })).optional(),
});

feesRouter.get(
  '/accounts',
  asyncHandler(async (req, res) => {
    const batchId = req.query.batchId as string | undefined;
    const courseId = req.query.courseId as string | undefined;
    const studentId = req.query.studentId as string | undefined;

    const where: Record<string, unknown> = {
      ...(studentId ? { studentId } : {}),
      ...(batchId || courseId ? { student: { ...(batchId ? { currentBatchId: batchId } : {}), ...(courseId ? { courseId } : {}) } } : {}),
    };

    if (req.auth!.role === RoleName.STUDENT) where.studentId = req.auth!.studentId;
    else if (req.auth!.role === RoleName.PARENT) where.studentId = { in: await getParentStudentIds(req.auth!.parentId!) };
    else if (!ROLE_GROUPS.FEE_FULL.includes(req.auth!.role) && req.auth!.role !== RoleName.MANAGEMENT) throw ApiError.forbidden();

    const accounts = await prisma.feeAccount.findMany({
      where,
      include: {
        student: { select: { id: true, firstName: true, lastName: true, studentCode: true, currentBatch: { select: { name: true } }, course: { select: { name: true } } } },
        instalments: true,
        payments: { orderBy: { paidAt: 'desc' }, include: { receipt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const withOutstanding = await Promise.all(
      accounts.map(async (a) => ({
        ...a,
        outstanding: await computeOutstanding(a.id),
        nextDue: a.instalments.filter((i) => i.status !== InstalmentStatus.PAID).sort((x, y) => x.dueDate.getTime() - y.dueDate.getTime())[0] ?? null,
      })),
    );
    res.json(withOutstanding);
  }),
);

feesRouter.post(
  '/accounts',
  authorize(...ROLE_GROUPS.FEE_FULL),
  asyncHandler(async (req, res) => {
    const data = createAccountSchema.parse(req.body);
    const existing = await prisma.feeAccount.findUnique({ where: { studentId: data.studentId } });
    if (existing) throw ApiError.conflict('This student already has a fee account');

    const instalments =
      data.instalments ??
      (data.planType === FeePlanType.ONE_TIME
        ? [{ amount: data.totalPayable, dueDate: new Date() }]
        : []);

    const account = await prisma.feeAccount.create({
      data: {
        studentId: data.studentId,
        feeStructureId: data.feeStructureId,
        totalPayable: data.totalPayable,
        instalments: {
          create: instalments.map((inst, i) => ({ sequence: i + 1, amount: inst.amount, dueDate: inst.dueDate })),
        },
      },
      include: { instalments: true },
    });

    await recordAudit({ entityType: 'FeeAccount', entityId: account.id, action: 'CREATE', actorId: req.auth!.userId, newValue: data });
    res.status(201).json(account);
  }),
);

feesRouter.get(
  '/accounts/:id',
  asyncHandler(async (req, res) => {
    const account = await prisma.feeAccount.findUnique({
      where: { id: req.params.id },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, studentCode: true } },
        instalments: { orderBy: { sequence: 'asc' } },
        payments: { orderBy: { paidAt: 'desc' }, include: { receipt: { include: { reversal: true } } } },
        refundRequests: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!account) throw ApiError.notFound('Fee account not found');
    await assertStudentAccess(req.auth!, account.studentId);
    res.json({ ...account, outstanding: await computeOutstanding(account.id) });
  }),
);

// ---------------------------------------------------------------- Payments & receipts

const paymentSchema = z.object({
  amount: z.number().positive(),
  mode: z.nativeEnum(PaymentMode),
  reference: z.string().optional(),
  instalmentId: z.string().optional(),
});

feesRouter.post(
  '/accounts/:id/payments',
  authorize(...ROLE_GROUPS.FEE_FULL),
  asyncHandler(async (req, res) => {
    const data = paymentSchema.parse(req.body);
    const account = await prisma.feeAccount.findUnique({ where: { id: req.params.id }, include: { student: true, instalments: { orderBy: { sequence: 'asc' } } } });
    if (!account) throw ApiError.notFound('Fee account not found');

    const targetInstalment =
      (data.instalmentId ? account.instalments.find((i) => i.id === data.instalmentId) : null) ??
      account.instalments.find((i) => i.status !== InstalmentStatus.PAID) ??
      null;

    const payment = await prisma.feePayment.create({
      data: {
        feeAccountId: account.id,
        instalmentId: targetInstalment?.id,
        amount: data.amount,
        mode: data.mode,
        reference: data.reference,
        recordedById: req.auth!.userId,
        needsReconciliation: data.mode === PaymentMode.CASH,
      },
    });

    if (targetInstalment) {
      const paidSoFar = await prisma.feePayment.aggregate({ where: { instalmentId: targetInstalment.id }, _sum: { amount: true } });
      if ((paidSoFar._sum.amount ?? 0) >= targetInstalment.amount) {
        await prisma.instalment.update({ where: { id: targetInstalment.id }, data: { status: InstalmentStatus.PAID } });
      }
    }

    const receiptNumber = await nextReceiptNumber(new Date());
    const verificationCode = computeReceiptVerificationCode({ receiptNumber, feePaymentId: payment.id, amount: data.amount, issuedAt: new Date() });
    const receipt = await prisma.receipt.create({
      data: { receiptNumber, feePaymentId: payment.id, issuedById: req.auth!.userId, verificationCode },
    });

    await recordAudit({ entityType: 'FeePayment', entityId: payment.id, action: 'RECORD', actorId: req.auth!.userId, newValue: data });

    await notify({
      userId: account.student.userId,
      category: NotificationCategory.GENERAL,
      title: 'Payment recorded',
      message: `Payment of Rs. ${data.amount.toLocaleString('en-IN')} recorded. Receipt ${receiptNumber}.`,
    });
    await notifyStudentParents(account.studentId, {
      category: NotificationCategory.GENERAL,
      title: 'Payment recorded',
      message: `A payment of Rs. ${data.amount.toLocaleString('en-IN')} was recorded. Receipt ${receiptNumber}.`,
    });

    res.status(201).json({ payment, receipt });
  }),
);

feesRouter.get(
  '/receipts/:id/pdf',
  asyncHandler(async (req, res) => {
    const receipt = await prisma.receipt.findUnique({
      where: { id: req.params.id },
      include: { feePayment: { include: { feeAccount: { include: { student: true } } } } },
    });
    if (!receipt) throw ApiError.notFound('Receipt not found');
    await assertStudentAccess(req.auth!, receipt.feePayment.feeAccount.studentId);

    const outstanding = await computeOutstanding(receipt.feePayment.feeAccountId);
    const doc = generateReceiptPdf({
      receiptNumber: receipt.receiptNumber,
      studentName: `${receipt.feePayment.feeAccount.student.firstName} ${receipt.feePayment.feeAccount.student.lastName}`,
      studentCode: receipt.feePayment.feeAccount.student.studentCode,
      amount: receipt.feePayment.amount,
      mode: receipt.feePayment.mode,
      reference: receipt.feePayment.reference,
      paidAt: receipt.feePayment.paidAt,
      issuedAt: receipt.issuedAt,
      verificationCode: receipt.verificationCode,
      balanceAfter: outstanding,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="receipt-${receipt.receiptNumber}.pdf"`);
    doc.pipe(res);
    doc.end();
  }),
);

const reverseSchema = z.object({ reason: z.string().min(3) });

feesRouter.patch(
  '/receipts/:id/reverse',
  authorize(...ROLE_GROUPS.FEE_FULL),
  asyncHandler(async (req, res) => {
    const { reason } = reverseSchema.parse(req.body);
    const receipt = await prisma.receipt.findUnique({ where: { id: req.params.id }, include: { reversal: true } });
    if (!receipt) throw ApiError.notFound('Receipt not found');
    if (receipt.reversal) throw ApiError.badRequest('This receipt has already been reversed');

    const reversal = await prisma.receiptReversal.create({
      data: { receiptId: receipt.id, reason, reversedById: req.auth!.userId },
    });
    await recordAudit({ entityType: 'Receipt', entityId: receipt.id, action: 'REVERSE', actorId: req.auth!.userId, reason });
    res.status(201).json(reversal);
  }),
);

// ---------------------------------------------------------------- Refunds & write-offs

const refundSchema = z.object({
  feeAccountId: z.string(),
  type: z.nativeEnum(RefundRequestType),
  amount: z.number().positive(),
  reason: z.string().min(3),
});

feesRouter.post(
  '/refunds',
  authorize(...ROLE_GROUPS.FEE_FULL),
  asyncHandler(async (req, res) => {
    const data = refundSchema.parse(req.body);
    // Super Admin and Academic Admin self-approve on create; Accounts-initiated requests require separate approval.
    const isFullAuthority =
      req.auth!.role === RoleName.SUPER_ADMIN || req.auth!.role === RoleName.ACADEMIC_ADMIN;

    const request = await prisma.refundRequest.create({
      data: {
        ...data,
        initiatedById: req.auth!.userId,
        status: isFullAuthority ? RefundRequestStatus.APPROVED : RefundRequestStatus.PENDING,
        approvedById: isFullAuthority ? req.auth!.userId : null,
        approvedAt: isFullAuthority ? new Date() : null,
      },
    });
    await recordAudit({ entityType: 'RefundRequest', entityId: request.id, action: 'CREATE', actorId: req.auth!.userId, newValue: data });
    res.status(201).json(request);
  }),
);

feesRouter.patch(
  '/refunds/:id/approve',
  authorize(RoleName.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const request = await prisma.refundRequest.findUnique({ where: { id: req.params.id } });
    if (!request) throw ApiError.notFound('Request not found');
    if (request.status !== RefundRequestStatus.PENDING) throw ApiError.badRequest('Only pending requests can be approved');
    if (request.initiatedById === req.auth!.userId) throw ApiError.forbidden('You cannot approve your own request');

    const updated = await prisma.refundRequest.update({
      where: { id: request.id },
      data: { status: RefundRequestStatus.APPROVED, approvedById: req.auth!.userId, approvedAt: new Date() },
    });
    await recordAudit({ entityType: 'RefundRequest', entityId: request.id, action: 'APPROVE', actorId: req.auth!.userId });
    res.json(updated);
  }),
);

feesRouter.patch(
  '/refunds/:id/reject',
  authorize(RoleName.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const request = await prisma.refundRequest.findUnique({ where: { id: req.params.id } });
    if (!request) throw ApiError.notFound('Request not found');
    if (request.status !== RefundRequestStatus.PENDING) throw ApiError.badRequest('Only pending requests can be rejected');

    const updated = await prisma.refundRequest.update({ where: { id: request.id }, data: { status: RefundRequestStatus.REJECTED, approvedById: req.auth!.userId, approvedAt: new Date() } });
    await recordAudit({ entityType: 'RefundRequest', entityId: request.id, action: 'REJECT', actorId: req.auth!.userId });
    res.json(updated);
  }),
);

// ---------------------------------------------------------------- Dashboard & reconciliation

feesRouter.get(
  '/dashboard',
  authorize(...ROLE_GROUPS.FEE_FULL, RoleName.MANAGEMENT),
  asyncHandler(async (_req, res) => {
    const [accounts, monthPayments] = await Promise.all([
      prisma.feeAccount.findMany({ include: { instalments: true } }),
      prisma.feePayment.findMany({ where: { paidAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } }),
    ]);

    const ageing: Record<string, number> = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    let totalOutstanding = 0;
    for (const a of accounts) {
      const outstanding = await computeOutstanding(a.id);
      totalOutstanding += Math.max(0, outstanding);
      const overdueInstalment = a.instalments.find((i) => i.status !== InstalmentStatus.PAID);
      if (overdueInstalment && outstanding > 0) ageing[ageingBand(overdueInstalment.dueDate)] += outstanding;
    }

    res.json({
      collectedThisMonth: monthPayments.reduce((s, p) => s + p.amount, 0),
      totalOutstanding,
      ageing,
      accountCount: accounts.length,
      cashPendingReconciliation: await prisma.feePayment.count({ where: { needsReconciliation: true } }),
    });
  }),
);

feesRouter.get(
  '/reconciliation',
  authorize(...ROLE_GROUPS.FEE_FULL),
  asyncHandler(async (_req, res) => {
    const items = await prisma.feePayment.findMany({
      where: { needsReconciliation: true },
      include: { feeAccount: { include: { student: { select: { firstName: true, lastName: true, studentCode: true } } } } },
      orderBy: { paidAt: 'desc' },
    });
    res.json(items);
  }),
);

/** On-demand run of the overdue-instalment reminder sweep (also runs daily on its own schedule). */
feesRouter.post(
  '/overdue-reminders/run',
  authorize(...ROLE_GROUPS.FEE_FULL),
  asyncHandler(async (_req, res) => {
    const result = await runFeeOverdueReminders();
    res.json(result);
  }),
);
