import {
  differenceInCalendarDays,
  parseBusinessDate,
} from './business-date.js';
import { DomainError } from './errors.js';
import { formatMoney, parseMoney } from './money.js';

/**
 * Payment rules calculate the only allocation result the database may persist.
 * Money is parsed as integer minor units so subtraction never uses floating point.
 * A payment must be positive, target an open balance, and never exceed outstanding.
 * Dates are compared as business dates rather than server-local timestamps.
 * These pure rules stay independent from HTTP, Prisma, WhatsApp, and UI concerns.
 */

export interface ValidatedPaymentAllocation {
  amount: string;
  outstandingBefore: string;
  outstandingAfter: string;
}

export function validatePaymentAllocation(input: {
  amount: string;
  outstandingAmount: string;
}): ValidatedPaymentAllocation {
  const amount = parseMoney(input.amount);
  const outstanding = parseMoney(input.outstandingAmount);

  if (amount <= 0n) {
    throw new DomainError(
      'PAYMENT_AMOUNT_NOT_POSITIVE',
      'Payment amount must be greater than zero',
    );
  }
  if (outstanding <= 0n) {
    throw new DomainError(
      'INVOICE_ALREADY_PAID',
      'A paid invoice cannot receive another payment',
    );
  }
  if (amount > outstanding) {
    throw new DomainError(
      'PAYMENT_EXCEEDS_OUTSTANDING',
      'Payment amount cannot exceed the current invoice outstanding amount',
    );
  }

  return {
    amount: formatMoney(amount),
    outstandingBefore: formatMoney(outstanding),
    outstandingAfter: formatMoney(outstanding - amount),
  };
}

export function validatePaymentDate(input: {
  paymentDate: string;
  asOfDate: string;
}): string {
  const paymentDate = parseBusinessDate(input.paymentDate);
  const asOfDate = parseBusinessDate(input.asOfDate);
  if (differenceInCalendarDays(paymentDate, asOfDate) > 0) {
    throw new DomainError(
      'PAYMENT_DATE_IN_FUTURE',
      'Payment date cannot be after the current business date',
    );
  }
  return paymentDate;
}
