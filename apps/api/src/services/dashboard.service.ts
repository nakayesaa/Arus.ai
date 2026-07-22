import {
  addCalendarDays,
  calculateDashboardMetrics,
  calculateInvoiceSnapshot,
  DomainError,
  InvoiceState,
  parseBusinessDate,
  parseMoney,
  type AgingBucket,
  type DisputeCategory,
} from '@arus/domain';

import {
  businessDateInTimeZone,
  startOfBusinessDateInTimeZone,
} from '../lib/business-date.js';
import type {
  CollectionCaseKind,
  CollectionCaseSummaryRecord,
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

interface WorkflowCaseInvoiceView {
  id: string;
  invoiceNumber: string;
  debtor: { id: string; code: string | null; name: string };
  dueDate: string;
  outstandingAmount: string;
}

export type DashboardWorkflowCaseView =
  | {
      id: string;
      kind: 'BROKEN_PROMISE';
      invoice: WorkflowCaseInvoiceView;
      createdAt: string;
      promise: { amount: string; promiseDate: string };
    }
  | {
      id: string;
      kind: 'OPEN_DISPUTE';
      invoice: WorkflowCaseInvoiceView;
      createdAt: string;
      dispute: { category: DisputeCategory; details: string };
    };

export interface DashboardWorkflowCasesView {
  data: DashboardWorkflowCaseView[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  asOfDate: string;
}

export interface DashboardServiceContract {
  getDashboard(input: {
    context: AuthContext;
    asOfDate?: string | undefined;
  }): Promise<DashboardView>;
  listWorkflowCases(input: {
    context: AuthContext;
    kind: CollectionCaseKind;
    asOfDate?: string | undefined;
    page: number;
    limit: number;
  }): Promise<DashboardWorkflowCasesView>;
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

  async listWorkflowCases(input: {
    context: AuthContext;
    kind: CollectionCaseKind;
    asOfDate?: string | undefined;
    page: number;
    limit: number;
  }): Promise<DashboardWorkflowCasesView> {
    const asOfDate = this.resolveAsOfDate(input.context, input.asOfDate);
    const workflowOccurredBefore = startOfBusinessDateInTimeZone(
      addCalendarDays(asOfDate, 1),
      input.context.organization.timezone,
    );
    const { records, total } =
      await this.options.repository.listCollectionCaseSummaries({
        organizationId: input.context.organization.id,
        kind: input.kind,
        asOfDate,
        workflowOccurredBefore,
        skip: (input.page - 1) * input.limit,
        take: input.limit,
      });

    return {
      data: records.map((record) => workflowCaseView(record, asOfDate)),
      pagination: {
        page: input.page,
        limit: input.limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / input.limit),
      },
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

function workflowCaseView(
  record: CollectionCaseSummaryRecord,
  asOfDate: string,
): DashboardWorkflowCaseView {
  const snapshot = calculateInvoiceSnapshot({
    originalAmount: record.invoice.originalAmount,
    allocations: record.invoice.allocations,
    dueDate: record.invoice.dueDate,
    asOfDate,
  });
  const invoice = {
    id: record.invoice.id,
    invoiceNumber: record.invoice.invoiceNumber,
    debtor: record.invoice.debtor,
    dueDate: record.invoice.dueDate,
    outstandingAmount: snapshot.outstandingAmount,
  };

  if (record.kind === 'BROKEN_PROMISE') {
    return {
      id: record.id,
      kind: record.kind,
      invoice,
      createdAt: record.createdAt.toISOString(),
      promise: {
        amount: record.amount,
        promiseDate: record.promiseDate,
      },
    };
  }

  return {
    id: record.id,
    kind: record.kind,
    invoice,
    createdAt: record.createdAt.toISOString(),
    dispute: { category: record.category, details: record.details },
  };
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
