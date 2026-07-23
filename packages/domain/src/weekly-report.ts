import {
  differenceInCalendarDays,
  parseBusinessDate,
} from './business-date.js';
import {
  derivePromiseStatus,
  PromiseFinalStatus,
  PromiseStatus,
} from './collection-workflow.js';
import { DomainError } from './errors.js';
import {
  AgingBucket,
  calculateInvoiceSnapshot,
  InvoiceState,
} from './invoice.js';
import { formatMoney, parseMoney } from './money.js';

const REPORT_AGING_BUCKETS = [
  AgingBucket.CURRENT,
  AgingBucket.OVERDUE_1_7,
  AgingBucket.OVERDUE_8_30,
  AgingBucket.OVERDUE_31_60,
  AgingBucket.OVERDUE_61_90,
  AgingBucket.OVERDUE_90_PLUS,
] as const;

export interface WeeklyReportAllocationInput {
  amount: string;
  allocationDate: string;
  reversalDate: string | null;
}

export interface WeeklyReportInvoiceInput {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  originalAmount: string;
  debtor: { id: string; code: string | null; name: string };
  allocations: readonly WeeklyReportAllocationInput[];
}

export interface WeeklyReportPromiseInput {
  amount: string;
  promiseDate: string;
  createdDate: string;
  fulfilledDate: string | null;
  cancelledDate: string | null;
}

export interface WeeklyReportDisputeInput {
  invoiceId: string;
  createdDate: string;
  resolvedDate: string | null;
}

export interface WeeklyReportMetrics {
  summary: {
    totalAr: string;
    totalOverdue: string;
    overduePercent: string;
    openInvoiceCount: number;
    overdueInvoiceCount: number;
  };
  collections: {
    amount: string;
    allocationCount: number;
  };
  aging: Array<{
    bucket: AgingBucket;
    invoiceCount: number;
    outstandingAmount: string;
  }>;
  promises: {
    active: { count: number; amount: string };
    broken: { count: number; amount: string };
    keptInPeriod: { count: number; amount: string };
  };
  disputes: {
    openInvoiceCount: number;
    outstandingAmount: string;
  };
  priorityOverdue: Array<{
    id: string;
    invoiceNumber: string;
    debtor: { id: string; code: string | null; name: string };
    dueDate: string;
    daysOverdue: number;
    outstandingAmount: string;
    agingBucket: AgingBucket;
  }>;
}

export function calculateWeeklyReport(input: {
  from: string;
  to: string;
  invoices: readonly WeeklyReportInvoiceInput[];
  promises: readonly WeeklyReportPromiseInput[];
  disputes: readonly WeeklyReportDisputeInput[];
  priorityLimit?: number;
}): WeeklyReportMetrics {
  const from = parseBusinessDate(input.from);
  const to = parseBusinessDate(input.to);
  if (differenceInCalendarDays(to, from) < 0) {
    throw new DomainError(
      'INVALID_REPORT_PERIOD',
      'Report period must end on or after it starts',
    );
  }

  const priorityLimit = input.priorityLimit ?? 8;
  if (!Number.isSafeInteger(priorityLimit) || priorityLimit < 0) {
    throw new DomainError(
      'INVALID_REPORT_PRIORITY_LIMIT',
      'Report priority limit must be a non-negative safe integer',
    );
  }

  let totalAr = 0n;
  let totalOverdue = 0n;
  let collected = 0n;
  let openInvoiceCount = 0;
  let overdueInvoiceCount = 0;
  let allocationCount = 0;
  const outstandingByInvoice = new Map<string, bigint>();
  const aging = new Map<
    AgingBucket,
    { invoiceCount: number; outstandingAmount: bigint }
  >(
    REPORT_AGING_BUCKETS.map((bucket) => [
      bucket,
      { invoiceCount: 0, outstandingAmount: 0n },
    ]),
  );
  const priorityOverdue: WeeklyReportMetrics['priorityOverdue'] = [];

  for (const invoice of input.invoices) {
    if (parseBusinessDate(invoice.invoiceDate) > to) continue;
    const allocations = invoice.allocations.filter((allocation) =>
      allocationIsActiveAt(allocation, to),
    );
    const snapshot = calculateInvoiceSnapshot({
      originalAmount: invoice.originalAmount,
      allocations: allocations.map((allocation) => ({
        amount: allocation.amount,
        reversed: false,
      })),
      dueDate: invoice.dueDate,
      asOfDate: to,
    });

    for (const allocation of allocations) {
      if (
        allocation.allocationDate >= from &&
        allocation.allocationDate <= to
      ) {
        collected += parseMoney(allocation.amount);
        allocationCount += 1;
      }
    }

    if (snapshot.state === InvoiceState.PAID) {
      outstandingByInvoice.set(invoice.id, 0n);
      continue;
    }

    const outstanding = parseMoney(snapshot.outstandingAmount);
    outstandingByInvoice.set(invoice.id, outstanding);
    totalAr += outstanding;
    openInvoiceCount += 1;
    const bucket = aging.get(snapshot.aging.bucket);
    if (!bucket) {
      throw new Error('Weekly report aging bucket is unsupported');
    }
    bucket.invoiceCount += 1;
    bucket.outstandingAmount += outstanding;

    if (snapshot.aging.daysOverdue > 0) {
      totalOverdue += outstanding;
      overdueInvoiceCount += 1;
      priorityOverdue.push({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        debtor: invoice.debtor,
        dueDate: invoice.dueDate,
        daysOverdue: snapshot.aging.daysOverdue,
        outstandingAmount: snapshot.outstandingAmount,
        agingBucket: snapshot.aging.bucket,
      });
    }
  }

  const promises = calculatePromiseMetrics(input.promises, from, to);
  const disputes = calculateDisputeMetrics(
    input.disputes,
    outstandingByInvoice,
    to,
  );

  return {
    summary: {
      totalAr: formatMoney(totalAr),
      totalOverdue: formatMoney(totalOverdue),
      overduePercent: percentage(totalOverdue, totalAr),
      openInvoiceCount,
      overdueInvoiceCount,
    },
    collections: {
      amount: formatMoney(collected),
      allocationCount,
    },
    aging: REPORT_AGING_BUCKETS.map((bucket) => {
      const metric = aging.get(bucket);
      if (!metric) throw new Error('Weekly report aging bucket is unsupported');
      return {
        bucket,
        invoiceCount: metric.invoiceCount,
        outstandingAmount: formatMoney(metric.outstandingAmount),
      };
    }),
    promises,
    disputes,
    priorityOverdue: priorityOverdue
      .sort(comparePriorityExposure)
      .slice(0, priorityLimit),
  };
}

function allocationIsActiveAt(
  allocation: WeeklyReportAllocationInput,
  asOfDate: string,
): boolean {
  const allocationDate = parseBusinessDate(allocation.allocationDate);
  const reversalDate = allocation.reversalDate
    ? parseBusinessDate(allocation.reversalDate)
    : null;
  parseMoney(allocation.amount);
  return (
    allocationDate <= asOfDate &&
    (reversalDate === null || reversalDate > asOfDate)
  );
}

function calculatePromiseMetrics(
  promises: readonly WeeklyReportPromiseInput[],
  from: string,
  to: string,
): WeeklyReportMetrics['promises'] {
  const result = {
    active: { count: 0, amount: 0n },
    broken: { count: 0, amount: 0n },
    keptInPeriod: { count: 0, amount: 0n },
  };

  for (const promise of promises) {
    const createdDate = parseBusinessDate(promise.createdDate);
    if (createdDate > to) continue;
    const amount = parseMoney(promise.amount);
    const fulfilledDate = promise.fulfilledDate
      ? parseBusinessDate(promise.fulfilledDate)
      : null;
    const cancelledDate = promise.cancelledDate
      ? parseBusinessDate(promise.cancelledDate)
      : null;

    if (
      fulfilledDate !== null &&
      fulfilledDate >= from &&
      fulfilledDate <= to
    ) {
      result.keptInPeriod.count += 1;
      result.keptInPeriod.amount += amount;
    }

    const finalStatus =
      cancelledDate !== null && cancelledDate <= to
        ? PromiseFinalStatus.CANCELLED
        : fulfilledDate !== null && fulfilledDate <= to
          ? PromiseFinalStatus.FULFILLED
          : null;
    const status = derivePromiseStatus({
      promiseDate: promise.promiseDate,
      asOfDate: to,
      finalStatus,
    });
    if (status === PromiseStatus.ACTIVE || status === PromiseStatus.DUE) {
      result.active.count += 1;
      result.active.amount += amount;
    } else if (status === PromiseStatus.BROKEN) {
      result.broken.count += 1;
      result.broken.amount += amount;
    }
  }

  return {
    active: {
      count: result.active.count,
      amount: formatMoney(result.active.amount),
    },
    broken: {
      count: result.broken.count,
      amount: formatMoney(result.broken.amount),
    },
    keptInPeriod: {
      count: result.keptInPeriod.count,
      amount: formatMoney(result.keptInPeriod.amount),
    },
  };
}

function calculateDisputeMetrics(
  disputes: readonly WeeklyReportDisputeInput[],
  outstandingByInvoice: ReadonlyMap<string, bigint>,
  to: string,
): WeeklyReportMetrics['disputes'] {
  const openInvoiceIds = new Set<string>();
  for (const dispute of disputes) {
    const createdDate = parseBusinessDate(dispute.createdDate);
    const resolvedDate = dispute.resolvedDate
      ? parseBusinessDate(dispute.resolvedDate)
      : null;
    if (createdDate <= to && (resolvedDate === null || resolvedDate > to)) {
      openInvoiceIds.add(dispute.invoiceId);
    }
  }

  let outstandingAmount = 0n;
  let openInvoiceCount = 0;
  for (const invoiceId of openInvoiceIds) {
    const outstanding = outstandingByInvoice.get(invoiceId) ?? 0n;
    if (outstanding <= 0n) continue;
    outstandingAmount += outstanding;
    openInvoiceCount += 1;
  }
  return {
    openInvoiceCount,
    outstandingAmount: formatMoney(outstandingAmount),
  };
}

function comparePriorityExposure(
  left: WeeklyReportMetrics['priorityOverdue'][number],
  right: WeeklyReportMetrics['priorityOverdue'][number],
): number {
  const leftAmount = parseMoney(left.outstandingAmount);
  const rightAmount = parseMoney(right.outstandingAmount);
  if (leftAmount !== rightAmount) return leftAmount > rightAmount ? -1 : 1;
  const dueDateOrder = left.dueDate.localeCompare(right.dueDate);
  return dueDateOrder || left.id.localeCompare(right.id);
}

function percentage(numerator: bigint, denominator: bigint): string {
  if (denominator === 0n) return '0.00';
  const hundredthPercent =
    (numerator * 10_000n + denominator / 2n) / denominator;
  const whole = hundredthPercent / 100n;
  const fraction = (hundredthPercent % 100n).toString().padStart(2, '0');
  return `${whole}.${fraction}`;
}
