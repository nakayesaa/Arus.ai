import {
  differenceInCalendarDays,
  parseBusinessDate,
} from './business-date.js';
import { DomainError } from './errors.js';
import {
  calculateInvoiceSnapshot,
  InvoiceState,
  type InvoiceAging,
  type InvoiceAllocationValue,
} from './invoice.js';
import { parseMoney } from './money.js';

const SCORE_DENOMINATOR = 200_000_000n;

export const CollectionPromiseStatus = {
  ACTIVE: 'ACTIVE',
  DUE: 'DUE',
  BROKEN: 'BROKEN',
  FULFILLED: 'FULFILLED',
  CANCELLED: 'CANCELLED',
} as const;

export type CollectionPromiseStatus =
  (typeof CollectionPromiseStatus)[keyof typeof CollectionPromiseStatus];

export const CollectionQueueReason = {
  PROMISE_BROKEN: 'PROMISE_BROKEN',
  PROMISE_DUE: 'PROMISE_DUE',
  FOLLOW_UP_DUE: 'FOLLOW_UP_DUE',
  OVERDUE: 'OVERDUE',
  DUE_SOON_UNCONTACTED: 'DUE_SOON_UNCONTACTED',
} as const;

export type CollectionQueueReason =
  (typeof CollectionQueueReason)[keyof typeof CollectionQueueReason];

export interface CollectionQueueInvoiceInput {
  invoiceId: string;
  originalAmount: string;
  allocations: readonly InvoiceAllocationValue[];
  dueDate: string;
  asOfDate: string;
  lastContactDate: string | null;
  nextFollowUpDate: string | null;
  promiseStatus: CollectionPromiseStatus | null;
  hasOpenDispute: boolean;
}

export interface CollectionPriority {
  score: string;
  components: {
    amount: string;
    aging: string;
    stale: string;
    promise: string;
    dueSoon: string;
  };
  /** Exact internal basis used for sorting before display rounding. */
  scoreBasis: bigint;
}

export interface CollectionQueueCandidate {
  invoiceId: string;
  dueDate: string;
  eligible: boolean;
  state: InvoiceState;
  outstandingAmount: string;
  aging: InvoiceAging;
  daysSinceLastContact: number;
  reasons: CollectionQueueReason[];
  priority: CollectionPriority;
}

export function calculateCollectionQueueCandidate(
  input: CollectionQueueInvoiceInput,
): CollectionQueueCandidate {
  validatePromiseStatus(input.promiseStatus);
  parseBusinessDate(input.asOfDate);
  parseBusinessDate(input.dueDate);
  if (input.lastContactDate) parseBusinessDate(input.lastContactDate);
  if (input.nextFollowUpDate) parseBusinessDate(input.nextFollowUpDate);

  const snapshot = calculateInvoiceSnapshot({
    originalAmount: input.originalAmount,
    allocations: input.allocations,
    dueDate: input.dueDate,
    asOfDate: input.asOfDate,
  });
  const daysSinceLastContact = calculateDaysSinceLastContact(
    input.lastContactDate,
    input.asOfDate,
  );
  const overdue = snapshot.aging.daysOverdue > 0;
  const followUpDue = Boolean(
    input.nextFollowUpDate &&
    differenceInCalendarDays(input.nextFollowUpDate, input.asOfDate) <= 0,
  );
  const promiseDue = input.promiseStatus === CollectionPromiseStatus.DUE;
  const promiseBroken = input.promiseStatus === CollectionPromiseStatus.BROKEN;
  const dueSoonUncontacted =
    input.lastContactDate === null &&
    snapshot.aging.daysToDue >= 0 &&
    snapshot.aging.daysToDue <= 7;
  const reasons: CollectionQueueReason[] = [];

  if (promiseBroken) reasons.push(CollectionQueueReason.PROMISE_BROKEN);
  if (promiseDue) reasons.push(CollectionQueueReason.PROMISE_DUE);
  if (followUpDue) reasons.push(CollectionQueueReason.FOLLOW_UP_DUE);
  if (overdue) reasons.push(CollectionQueueReason.OVERDUE);
  if (dueSoonUncontacted) {
    reasons.push(CollectionQueueReason.DUE_SOON_UNCONTACTED);
  }

  const eligible =
    snapshot.state !== InvoiceState.PAID &&
    parseMoney(snapshot.outstandingAmount) > 0n &&
    !input.hasOpenDispute &&
    reasons.length > 0;
  const priority = calculatePriority({
    outstandingAmount: snapshot.outstandingAmount,
    daysOverdue: snapshot.aging.daysOverdue,
    daysSinceLastContact,
    promiseDue,
    promiseBroken,
    dueSoonUncontacted,
  });

  return {
    invoiceId: input.invoiceId,
    dueDate: input.dueDate,
    eligible,
    state: snapshot.state,
    outstandingAmount: snapshot.outstandingAmount,
    aging: snapshot.aging,
    daysSinceLastContact,
    reasons,
    priority,
  };
}

export function compareCollectionQueueCandidates(
  left: CollectionQueueCandidate,
  right: CollectionQueueCandidate,
): number {
  if (left.priority.scoreBasis !== right.priority.scoreBasis) {
    return left.priority.scoreBasis > right.priority.scoreBasis ? -1 : 1;
  }
  if (left.dueDate !== right.dueDate) {
    return left.dueDate < right.dueDate ? -1 : 1;
  }

  const leftOutstanding = parseMoney(left.outstandingAmount);
  const rightOutstanding = parseMoney(right.outstandingAmount);
  if (leftOutstanding !== rightOutstanding) {
    return leftOutstanding > rightOutstanding ? -1 : 1;
  }
  if (left.invoiceId === right.invoiceId) return 0;
  return left.invoiceId < right.invoiceId ? -1 : 1;
}

function calculatePriority(input: {
  outstandingAmount: string;
  daysOverdue: number;
  daysSinceLastContact: number;
  promiseDue: boolean;
  promiseBroken: boolean;
  dueSoonUncontacted: boolean;
}): CollectionPriority {
  const amount = parseMoney(input.outstandingAmount) * 3n;
  const aging = BigInt(input.daysOverdue) * 20_000_000n;
  const stale = BigInt(Math.min(input.daysSinceLastContact, 30)) * 100_000_000n;
  const promise = input.promiseBroken
    ? 4_000_000_000n
    : input.promiseDue
      ? 2_000_000_000n
      : 0n;
  const dueSoon = input.dueSoonUncontacted ? 1_000_000_000n : 0n;
  const scoreBasis = amount + aging + stale + promise + dueSoon;

  return {
    score: formatPoints(scoreBasis),
    components: {
      amount: formatPoints(amount),
      aging: formatPoints(aging),
      stale: formatPoints(stale),
      promise: formatPoints(promise),
      dueSoon: formatPoints(dueSoon),
    },
    scoreBasis,
  };
}

function calculateDaysSinceLastContact(
  lastContactDate: string | null,
  asOfDate: string,
): number {
  if (!lastContactDate) return 30;
  const days = differenceInCalendarDays(asOfDate, lastContactDate);
  if (days < 0) {
    throw new DomainError(
      'LAST_CONTACT_IN_FUTURE',
      'Last contact date cannot be after the queue as-of date',
    );
  }
  return days;
}

function validatePromiseStatus(value: CollectionPromiseStatus | null): void {
  if (
    value !== null &&
    !Object.values(CollectionPromiseStatus).includes(value)
  ) {
    throw new DomainError(
      'INVALID_PROMISE_STATUS',
      'Promise status is not supported by the collection queue',
    );
  }
}

function formatPoints(numerator: bigint): string {
  const hundredths =
    (numerator * 100n + SCORE_DENOMINATOR / 2n) / SCORE_DENOMINATOR;
  const whole = hundredths / 100n;
  const fraction = (hundredths % 100n).toString().padStart(2, '0');
  return `${whole}.${fraction}`;
}
