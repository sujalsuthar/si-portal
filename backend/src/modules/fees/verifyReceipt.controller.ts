import { Router } from 'express';
import { prisma } from '@/lib/prisma';
import { asyncHandler } from '@/utils/asyncHandler';
import { ApiError } from '@/utils/apiError';

export const publicVerifyReceiptRouter = Router();

/** Public receipt verification — no login required. Returns validity, issue date and amount only. */
publicVerifyReceiptRouter.get(
  '/:receiptNumber',
  asyncHandler(async (req, res) => {
    const receipt = await prisma.receipt.findUnique({
      where: { receiptNumber: req.params.receiptNumber },
      include: { feePayment: true, reversal: true },
    });
    if (!receipt) throw ApiError.notFound('No receipt found with this number');

    res.json({
      receiptNumber: receipt.receiptNumber,
      valid: !receipt.reversal,
      issueDate: receipt.issuedAt,
      amount: receipt.feePayment.amount,
    });
  }),
);
