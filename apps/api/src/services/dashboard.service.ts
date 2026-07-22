import {
  addCalendarDays,
  calculateDashboardMetrics,
  calculateInvoiceSnapshot,
  DomainError,
  InvoiceState,
  parseBusinessDate,
  parseMoney,
  type AgingBucket,
} from '@arus/domain';

import {
  businessDateInTimeZone,
  startOfBusinessDateInTimeZone,
} from '../lib/business-date.js';
import type {
  InvoiceCalculationRecord,
  ReceivablesRepository,
} from '../repositories/receivables.repository.js';
import type { AuthContext } from './auth.service.js';

const MAX_DASHBOARD_INVOICES = 10_000;
const EXPOSURE_LIMIT = 5;

export interface DashboardView {
  summary: {
    totalAr: string;
    totalOverdue: string;
    overduePercent: string;
    openInvoiceCount: number;
    overdueInvoiceCount: number;
  };
  aging: Array<{
    bucket: AgingBucket;
    invoiceCount: number;
    outstandingAmount: string;
  }>;
  largestOverdue: Array<{
    id: string;
    invoiceNumber: string;
    debtor: { id: string; code: string | null; name: string };
    dueDate: string;
    outstandingAmount: string;
    daysOverdue: number;
    agingBucket: AgingBucket;
  }>;
  workflows: {
    brokenPromiseCount: number;
    openDisputeCount: number;
  };
  asOfDate: string;
}

export interface DashboardServiceContract {
  getDashboard(input: {
    context: AuthContext;
    asOfDate?: string | undefined;
  }): Promise<DashboardView>;
}

export class DashboardError extends Error {
  constructor(
    readonly code: 'DASHBOARD_TOO_BROAD' | 'INVALID_AS_OF_DATE',
    message: string,
  ) {
    super(message);
    this.name = 'DashboardError';
  }
}

export class DashboardService implements DashboardServiceContract {
  private readonly clock: () => Date;

  constructor(
    private readonly options: {
      repository: ReceivablesRepository;
      clock?: () => Date;
    },
  ) {
    this.clock = options.clock ?? (() => new Date());
  }

  async getDashboard(input: {
    context: AuthContext;
    asOfDate?: string | undefined;
  }): Promise<DashboardView> {
    const asOfDate = this.resolveAsOfDate(input.context, input.asOfDate);
    const workflowOccurredBefore = startOfBusinessDateInTimeZone(
      addCalendarDays(asOfDate, 1),
      input.context.organization.timezone,
    );
    const [records, workflows] = await Promise.all([
      this.options.repository.listInvoiceCandidates({
        organizationId: input.context.organization.id,
        take: MAX_DASHBOARD_INVOICES + 1,
      }),
      this.options.repository.getCollectionCaseCounts({
        organizationId: input.context.organization.id,
        asOfDate,
        workflowOccurredBefore,
      }),
    ]);
    if (records.length > MAX_DASHBOARD_INVOICES) {
      throw new DashboardError(
        'DASHBOARD_TOO_BROAD',
        'Dashboard exceeds the pilot invoice processing limit',
      );
    }

    const metrics = calculateDashboardMetrics({
      invoices: records,
      asOfDate,
    });
    return {
      summary: {
        totalAr: metrics.totalAr,
        totalOverdue: metrics.totalOverdue,
        overduePercent: metrics.overduePercent,
        openInvoiceCount: metrics.openInvoiceCount,
        overdueInvoiceCount: metrics.overdueInvoiceCount,
      },
      aging: metrics.aging,
      largestOverdue: largestOverdue(records, asOfDate),
      workflows,
      asOfDate,
    };
  }

  private resolveAsOfDate(
    context: AuthContext,
    requestedDate: string | undefined,
  ): string {
    const value =
      requestedDate ??
      businessDateInTimeZone(this.clock(), context.organization.timezone);
    try {
      return parseBusinessDate(value);
    } catch (error) {
      if (
        error instanceof DomainError &&
        error.code === 'INVALID_BUSINESS_DATE'
      ) {
        throw new DashboardError(
          'INVALID_AS_OF_DATE',
          'asOfDate must be a valid YYYY-MM-DD calendar date',
        );
      }
      throw error;
    }
  }
}

function largestOverdue(
  records: readonly InvoiceCalculationRecord[],
  asOfDate: string,
): DashboardView['largestOverdue'] {
  return records
    .map((record) => ({
      record,
      snapshot: calculateInvoiceSnapshot({
        originalAmount: record.originalAmount,
        allocations: record.allocations,
        dueDate: record.dueDate,
        asOfDate,
      }),
    }))
    .filter(
      ({ snapshot }) =>
        snapshot.state !== InvoiceState.PAID && snapshot.aging.daysOverdue > 0,
    )
    .sort((left, right) => {
      const amountOrder = compareMoneyDescending(
        left.snapshot.outstandingAmount,
        right.snapshot.outstandingAmount,
      );
      if (amountOrder !== 0) return amountOrder;
      const dueDateOrder = left.record.dueDate.localeCompare(
        right.record.dueDate,
      );
      return dueDateOrder || left.record.id.localeCompare(right.record.id);
    })
    .slice(0, EXPOSURE_LIMIT)
    .map(({ record, snapshot }) => ({
      id: record.id,
      invoiceNumber: record.invoiceNumber,
      debtor: record.debtor,
      dueDate: record.dueDate,
      outstandingAmount: snapshot.outstandingAmount,
      daysOverdue: snapshot.aging.daysOverdue,
      agingBucket: snapshot.aging.bucket,
    }));
}

function compareMoneyDescending(left: string, right: string): number {
  const leftAmount = parseMoney(left);
  const rightAmount = parseMoney(right);
  return leftAmount === rightAmount ? 0 : leftAmount > rightAmount ? -1 : 1;
}
