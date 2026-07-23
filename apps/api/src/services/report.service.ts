import { randomUUID } from 'node:crypto';

import {
  calculateWeeklyReport,
  differenceInCalendarDays,
  DomainError,
  parseBusinessDate,
  type WeeklyReportMetrics,
} from '@arus/domain';

import { businessDateInTimeZone } from '../lib/business-date.js';
import type {
  ReportRepository,
  ReportSnapshotRecord,
} from '../repositories/report.repository.js';
import type { AuthContext } from './auth.service.js';

const MAX_REPORT_DAYS = 366;
const MAX_REPORT_INVOICES = 10_000;
const MAX_REPORT_WORKFLOWS = 50_000;

export interface WeeklyReportView extends WeeklyReportMetrics {
  reportId: string;
  period: {
    from: string;
    to: string;
    inclusiveDayCount: number;
  };
  generatedAt: string;
  timeZone: string;
}

export interface ReportServiceContract {
  generateWeeklyReport(input: {
    context: AuthContext;
    requestId: string;
    from: string;
    to: string;
  }): Promise<{ data: WeeklyReportView }>;
}

export type ReportErrorCode =
  | 'INVALID_REPORT_PERIOD'
  | 'REPORT_RANGE_TOO_LONG'
  | 'REPORT_TOO_BROAD';

export class ReportError extends Error {
  constructor(
    readonly code: ReportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ReportError';
  }
}

export class ReportService implements ReportServiceContract {
  private readonly clock: () => Date;
  private readonly idFactory: () => string;

  constructor(
    private readonly options: {
      repository: ReportRepository;
      clock?: () => Date;
      idFactory?: () => string;
    },
  ) {
    this.clock = options.clock ?? (() => new Date());
    this.idFactory = options.idFactory ?? randomUUID;
  }

  async generateWeeklyReport(input: {
    context: AuthContext;
    requestId: string;
    from: string;
    to: string;
  }): Promise<{ data: WeeklyReportView }> {
    const period = validatedPeriod(input.from, input.to);
    const snapshot = await this.options.repository.readWeeklySnapshot({
      organizationId: input.context.organization.id,
      throughDate: period.to,
      invoiceTake: MAX_REPORT_INVOICES + 1,
      workflowTake: MAX_REPORT_WORKFLOWS + 1,
    });
    assertWithinProcessingLimits(snapshot);

    const generatedAt = this.clock();
    const reportId = this.idFactory();
    const metrics = calculateWeeklyReport({
      from: period.from,
      to: period.to,
      invoices: snapshot.invoices.map((invoice) => ({
        ...invoice,
        allocations: invoice.allocations.map((allocation) => ({
          amount: allocation.amount,
          allocationDate: allocation.allocationDate,
          reversalDate: allocation.reversedAt
            ? businessDateInTimeZone(
                allocation.reversedAt,
                input.context.organization.timezone,
              )
            : null,
        })),
      })),
      promises: snapshot.promises.map((promise) => ({
        amount: promise.amount,
        promiseDate: promise.promiseDate,
        createdDate: businessDateInTimeZone(
          promise.createdAt,
          input.context.organization.timezone,
        ),
        fulfilledDate: promise.fulfilledAt
          ? businessDateInTimeZone(
              promise.fulfilledAt,
              input.context.organization.timezone,
            )
          : null,
        cancelledDate: promise.cancelledAt
          ? businessDateInTimeZone(
              promise.cancelledAt,
              input.context.organization.timezone,
            )
          : null,
      })),
      disputes: snapshot.disputes.map((dispute) => ({
        invoiceId: dispute.invoiceId,
        createdDate: businessDateInTimeZone(
          dispute.createdAt,
          input.context.organization.timezone,
        ),
        resolvedDate: dispute.resolvedAt
          ? businessDateInTimeZone(
              dispute.resolvedAt,
              input.context.organization.timezone,
            )
          : null,
      })),
    });

    await this.options.repository.recordGenerated({
      organizationId: input.context.organization.id,
      actorId: input.context.user.id,
      reportId,
      requestId: input.requestId,
      from: period.from,
      to: period.to,
      generatedAt,
      sourceCounts: {
        invoices: snapshot.invoices.length,
        promises: snapshot.promises.length,
        disputes: snapshot.disputes.length,
      },
    });

    return {
      data: {
        reportId,
        period,
        generatedAt: generatedAt.toISOString(),
        timeZone: input.context.organization.timezone,
        ...metrics,
      },
    };
  }
}

function validatedPeriod(
  rawFrom: string,
  rawTo: string,
): WeeklyReportView['period'] {
  try {
    const from = parseBusinessDate(rawFrom);
    const to = parseBusinessDate(rawTo);
    const inclusiveDayCount = differenceInCalendarDays(to, from) + 1;
    if (inclusiveDayCount <= 0) {
      throw new ReportError(
        'INVALID_REPORT_PERIOD',
        'Report end date must be on or after its start date',
      );
    }
    if (inclusiveDayCount > MAX_REPORT_DAYS) {
      throw new ReportError(
        'REPORT_RANGE_TOO_LONG',
        `Report period cannot exceed ${MAX_REPORT_DAYS} days`,
      );
    }
    return { from, to, inclusiveDayCount };
  } catch (error) {
    if (error instanceof ReportError) throw error;
    if (
      error instanceof DomainError &&
      error.code === 'INVALID_BUSINESS_DATE'
    ) {
      throw new ReportError(
        'INVALID_REPORT_PERIOD',
        'Report period must use valid YYYY-MM-DD calendar dates',
      );
    }
    throw error;
  }
}

function assertWithinProcessingLimits(snapshot: ReportSnapshotRecord): void {
  if (
    snapshot.invoices.length > MAX_REPORT_INVOICES ||
    snapshot.promises.length > MAX_REPORT_WORKFLOWS ||
    snapshot.disputes.length > MAX_REPORT_WORKFLOWS
  ) {
    throw new ReportError(
      'REPORT_TOO_BROAD',
      'Report exceeds the pilot processing limit',
    );
  }
}
