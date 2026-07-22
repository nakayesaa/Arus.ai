import {
  differenceInCalendarDays,
  parseBusinessDate,
} from './business-date.js';
import { DomainError } from './errors.js';
import { formatMoney, parseMoney } from './money.js';

export const PromiseStatus = {
  ACTIVE: 'ACTIVE',
  DUE: 'DUE',
  BROKEN: 'BROKEN',
  FULFILLED: 'FULFILLED',
  CANCELLED: 'CANCELLED',
} as const;

export type PromiseStatus = (typeof PromiseStatus)[keyof typeof PromiseStatus];

export const PromiseFinalStatus = {
  FULFILLED: PromiseStatus.FULFILLED,
  CANCELLED: PromiseStatus.CANCELLED,
} as const;

export type PromiseFinalStatus =
  (typeof PromiseFinalStatus)[keyof typeof PromiseFinalStatus];

export const DisputeCategory = {
  MISSING_POD: 'MISSING_POD',
  WRONG_AMOUNT: 'WRONG_AMOUNT',
  WRONG_QUANTITY: 'WRONG_QUANTITY',
  QUALITY: 'QUALITY',
  ADMINISTRATIVE: 'ADMINISTRATIVE',
  OTHER: 'OTHER',
} as const;

export type DisputeCategory =
  (typeof DisputeCategory)[keyof typeof DisputeCategory];

export const DisputeStatus = {
  OPEN: 'OPEN',
  RESOLVED: 'RESOLVED',
} as const;

export type DisputeStatus = (typeof DisputeStatus)[keyof typeof DisputeStatus];

export function derivePromiseStatus(input: {
  promiseDate: string;
  asOfDate: string;
  finalStatus: PromiseFinalStatus | null;
}): PromiseStatus {
  const promiseDate = parseBusinessDate(input.promiseDate);
  const asOfDate = parseBusinessDate(input.asOfDate);
  if (input.finalStatus) return input.finalStatus;

  const position = differenceInCalendarDays(promiseDate, asOfDate);
  if (position > 0) return PromiseStatus.ACTIVE;
  if (position === 0) return PromiseStatus.DUE;
  return PromiseStatus.BROKEN;
}

export function validatePromiseAmount(input: {
  amount: string;
  outstandingAmount: string;
}): string {
  const amount = parseMoney(input.amount);
  const outstanding = parseMoney(input.outstandingAmount);
  if (amount <= 0n) {
    throw new DomainError(
      'PROMISE_AMOUNT_NOT_POSITIVE',
      'Promise amount must be greater than zero',
    );
  }
  if (amount > outstanding) {
    throw new DomainError(
      'PROMISE_EXCEEDS_OUTSTANDING',
      'Promise amount cannot exceed the current invoice outstanding amount',
    );
  }
  return formatMoney(amount);
}

export function isPromiseFulfilled(input: {
  promiseAmount: string;
  allocatedAfterPromise: string;
}): boolean {
  const promiseAmount = parseMoney(input.promiseAmount);
  const allocated = parseMoney(input.allocatedAfterPromise);
  if (promiseAmount <= 0n) {
    throw new DomainError(
      'PROMISE_AMOUNT_NOT_POSITIVE',
      'Promise amount must be greater than zero',
    );
  }
  return allocated >= promiseAmount;
}

export function promiseAcceptsReplacement(status: PromiseStatus): boolean {
  return (
    status === PromiseStatus.BROKEN ||
    status === PromiseStatus.FULFILLED ||
    status === PromiseStatus.CANCELLED
  );
}
