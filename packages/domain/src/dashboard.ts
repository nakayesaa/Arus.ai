import {
  AgingBucket,
  calculateInvoiceSnapshot,
  InvoiceState,
  type InvoiceAllocationValue,
} from './invoice.js';
import { formatMoney, parseMoney } from './money.js';

const DASHBOARD_AGING_BUCKETS = [
  AgingBucket.CURRENT,
  AgingBucket.OVERDUE_1_7,
  AgingBucket.OVERDUE_8_30,
  AgingBucket.OVERDUE_31_60,
  AgingBucket.OVERDUE_61_90,
  AgingBucket.OVERDUE_90_PLUS,
] as const;

export interface DashboardInvoiceInput {
  originalAmount: string;
  allocations: readonly InvoiceAllocationValue[];
  dueDate: string;
}

export interface DashboardAgingMetric {
  bucket: AgingBucket;
  invoiceCount: number;
  outstandingAmount: string;
}

export interface DashboardMetrics {
  totalAr: string;
  totalOverdue: string;
  overduePercent: string;
  openInvoiceCount: number;
  overdueInvoiceCount: number;
  aging: DashboardAgingMetric[];
}

export function calculateDashboardMetrics(input: {
  invoices: readonly DashboardInvoiceInput[];
  asOfDate: string;
}): DashboardMetrics {
  let totalAr = 0n;
  let totalOverdue = 0n;
  let openInvoiceCount = 0;
  let overdueInvoiceCount = 0;
  const aging = new Map<
    AgingBucket,
    { invoiceCount: number; outstandingAmount: bigint }
  >(
    DASHBOARD_AGING_BUCKETS.map((bucket) => [
      bucket,
      { invoiceCount: 0, outstandingAmount: 0n },
    ]),
  );

  for (const invoice of input.invoices) {
    const snapshot = calculateInvoiceSnapshot({
      originalAmount: invoice.originalAmount,
      allocations: invoice.allocations,
      dueDate: invoice.dueDate,
      asOfDate: input.asOfDate,
    });
    if (snapshot.state === InvoiceState.PAID) continue;

    const outstanding = parseMoney(snapshot.outstandingAmount);
    totalAr += outstanding;
    openInvoiceCount += 1;
    const bucket = aging.get(snapshot.aging.bucket);
    if (!bucket) throw new Error('Dashboard aging bucket is unsupported');
    bucket.invoiceCount += 1;
    bucket.outstandingAmount += outstanding;

    if (snapshot.aging.daysOverdue > 0) {
      totalOverdue += outstanding;
      overdueInvoiceCount += 1;
    }
  }

  return {
    totalAr: formatMoney(totalAr),
    totalOverdue: formatMoney(totalOverdue),
    overduePercent: percentage(totalOverdue, totalAr),
    openInvoiceCount,
    overdueInvoiceCount,
    aging: DASHBOARD_AGING_BUCKETS.map((bucket) => {
      const metric = aging.get(bucket);
      if (!metric) throw new Error('Dashboard aging bucket is unsupported');
      return {
        bucket,
        invoiceCount: metric.invoiceCount,
        outstandingAmount: formatMoney(metric.outstandingAmount),
      };
    }),
  };
}

function percentage(numerator: bigint, denominator: bigint): string {
  if (denominator === 0n) return '0.00';
  const hundredthPercent =
    (numerator * 10_000n + denominator / 2n) / denominator;
  const whole = hundredthPercent / 100n;
  const fraction = (hundredthPercent % 100n).toString().padStart(2, '0');
  return `${whole}.${fraction}`;
}
