import crypto from 'crypto';
import { env } from '@/config/env';

/**
 * HMAC-SHA-256 over canonical receipt fields. This is a keyed integrity check the institution
 * can use to detect alteration — not a digital signature a third party could verify independently.
 * The public verification endpoint always re-derives state from the server, never trusts a value
 * embedded in a downloaded file.
 */
export function computeReceiptVerificationCode(fields: { receiptNumber: string; feePaymentId: string; amount: number; issuedAt: Date }): string {
  const canonical = `${fields.receiptNumber}|${fields.feePaymentId}|${fields.amount.toFixed(2)}|${fields.issuedAt.toISOString()}`;
  return crypto.createHmac('sha256', env.receiptHmacSecret).update(canonical).digest('hex');
}
