import {
  differenceInCalendarDays,
  parseBusinessDate,
} from './business-date.js';
import { DomainError } from './errors.js';
import { formatMoney, parseMoney } from './money.js';

export const InvoiceState = {
  OPEN: 'OPEN',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
} as const;

export type InvoiceState = (typeof InvoiceState)[keyof typeof InvoiceState];

export const AgingBucket = {
  CURRENT: 'CURRENT',
  OVERDUE_1_7: 'OVERDUE_1_7',
  OVERDUE_8_30: 'OVERDUE_8_30',
  OVERDUE_31_60: 'OVERDUE_31_60',
  OVERDUE_61_90: 'OVERDUE_61_90',
  OVERDUE_90_PLUS: 'OVERDUE_90_PLUS',
} as const;

export type AgingBucket = (typeof AgingBucket)[keyof typeof AgingBucket];

export const InvoiceFlag = {
  DUE_SOON: 'DUE_SOON',
  DUE_TODAY: 'DUE_TODAY',
  OVERDUE: 'OVERDUE',
} as const;

export type InvoiceFlag = (typeof InvoiceFlag)[keyof typeof InvoiceFlag];

export interface InvoiceAllocationValue {
  amount: string;
  reversed: boolean;
}

export interface InvoiceFinancials {
  originalAmount: string;
  allocatedAmount: string;
  outstandingAmount: string;
  state: InvoiceState;
}

export interface InvoiceAging {
  bucket: AgingBucket;
  daysToDue: number;
  daysOverdue: number;
  flags: InvoiceFlag[];
}

export interface InvoiceSnapshot extends InvoiceFinancials {
  aging: InvoiceAging;
}

export function calculateInvoiceFinancials(input: {
  originalAmount: string;
  allocations: readonly InvoiceAllocationValue[];
}): InvoiceFinancials {
  const originalAmount = parseMoney(input.originalAmount);
  if (originalAmount <= 0n) {
    throw new DomainError(
      'ORIGINAL_AMOUNT_NOT_POSITIVE',
      'Invoice original amount must be greater than zero',
    );
  }

  let allocatedAmount = 0n;
  for (const allocation of input.allocations) {
    const amount = parseMoney(allocation.amount);
    if (amount <= 0n) {
      throw new DomainError(
        'ALLOCATION_NOT_POSITIVE',
        'Payment allocation amount must be greater than zero',
      );
    }
    if (allocation.reversed) {
      continue;
    }
    allocatedAmount += amount;
    if (allocatedAmount > originalAmount) {
      throw new DomainError(
        'OVER_ALLOCATED',
        'Payment allocations exceed invoice original amount',
      );
    }
  }

  const outstandingAmount = originalAmount - allocatedAmount;
  const state =
    outstandingAmount === 0n
      ? InvoiceState.PAID
      : allocatedAmount > 0n
        ? InvoiceState.PARTIALLY_PAID
        : InvoiceState.OPEN;

  return {
    originalAmount: formatMoney(originalAmount),
    allocatedAmount: formatMoney(allocatedAmount),
    outstandingAmount: formatMoney(outstandingAmount),
    state,
  };
}

export function calculateInvoiceAging(input: {
  dueDate: string;
  asOfDate: string;
  outstandingAmount: string;
}): InvoiceAging {
  parseBusinessDate(input.dueDate);
  parseBusinessDate(input.asOfDate);
  const outstandingAmount = parseMoney(input.outstandingAmount);
  const daysToDue = differenceInCalendarDays(input.dueDate, input.asOfDate);
  const daysOverdue = Math.max(-daysToDue, 0);
  const bucket = agingBucket(daysOverdue, daysToDue);
  const flags: InvoiceFlag[] = [];

  if (daysToDue >= 1 && daysToDue <= 7) {
    flags.push(InvoiceFlag.DUE_SOON);
  } else if (daysToDue === 0) {
    flags.push(InvoiceFlag.DUE_TODAY);
  } else if (daysToDue < 0 && outstandingAmount > 0n) {
    flags.push(InvoiceFlag.OVERDUE);
  }

  return { bucket, daysToDue, daysOverdue, flags };
}

export function calculateInvoiceSnapshot(input: {
  originalAmount: string;
  allocations: readonly InvoiceAllocationValue[];
  dueDate: string;
  asOfDate: string;
}): InvoiceSnapshot {
  const financials = calculateInvoiceFinancials(input);
  return {
    ...financials,
    aging: calculateInvoiceAging({
      dueDate: input.dueDate,
      asOfDate: input.asOfDate,
      outstandingAmount: financials.outstandingAmount,
    }),
  };
}

function agingBucket(daysOverdue: number, daysToDue: number): AgingBucket {
  if (daysToDue >= 0) return AgingBucket.CURRENT;
  if (daysOverdue <= 7) return AgingBucket.OVERDUE_1_7;
  if (daysOverdue <= 30) return AgingBucket.OVERDUE_8_30;
  if (daysOverdue <= 60) return AgingBucket.OVERDUE_31_60;
  if (daysOverdue <= 90) return AgingBucket.OVERDUE_61_90;
  return AgingBucket.OVERDUE_90_PLUS;
}
