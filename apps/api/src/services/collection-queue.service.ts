import {
  addCalendarDays,
  calculateCollectionQueueCandidate,
  compareCollectionQueueCandidates,
  DomainError,
  parseBusinessDate,
  type AgingBucket,
  type CollectionPromiseStatus,
  type CollectionQueueReason,
  type InvoiceState,
} from '@arus/domain';

import {
  businessDateInTimeZone,
  startOfBusinessDateInTimeZone,
} from '../lib/business-date.js';
import type {
  CollectionQueueSourceRecord,
  ReceivablesRepository,
} from '../repositories/receivables.repository.js';
import type { AuthContext } from './auth.service.js';

const MAX_QUEUE_INVOICES = 10_000;

export interface CollectionQueueItemView {
  id: string;
  invoiceNumber: string;
  debtor: { id: string; code: string | null; name: string };
  dueDate: string;
  outstandingAmount: string;
  state: InvoiceState;
  aging: {
    bucket: AgingBucket;
    daysToDue: number;
    daysOverdue: number;
  };
  lastContactAt: string | null;
  lastContactDate: string | null;
  nextFollowUpDate: string | null;
  promiseStatus: CollectionPromiseStatus | null;
  hasOpenDispute: boolean;
  daysSinceLastContact: number;
  reasons: CollectionQueueReason[];
  priority: {
    score: string;
    components: {
      amount: string;
      aging: string;
      stale: string;
      promise: string;
      dueSoon: string;
    };
  };
}

export interface CollectionQueueView {
  data: CollectionQueueItemView[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  asOfDate: string;
}

export interface CollectionQueueServiceContract {
  listQueue(input: {
    context: AuthContext;
    asOfDate?: string | undefined;
    page: number;
    limit: number;
  }): Promise<CollectionQueueView>;
}

export class CollectionQueueError extends Error {
  constructor(
    readonly code: 'INVALID_AS_OF_DATE' | 'QUEUE_TOO_BROAD',
    message: string,
  ) {
    super(message);
    this.name = 'CollectionQueueError';
  }
}

export class CollectionQueueService implements CollectionQueueServiceContract {
  private readonly clock: () => Date;

  constructor(
    private readonly options: {
      repository: ReceivablesRepository;
      clock?: () => Date;
    },
  ) {
    this.clock = options.clock ?? (() => new Date());
  }

  async listQueue(input: {
    context: AuthContext;
    asOfDate?: string | undefined;
    page: number;
    limit: number;
  }): Promise<CollectionQueueView> {
    const asOfDate = this.resolveAsOfDate(input.context, input.asOfDate);
    const records = await this.options.repository.listCollectionQueueCandidates(
      {
        organizationId: input.context.organization.id,
        communicationOccurredBefore: startOfBusinessDateInTimeZone(
          addCalendarDays(asOfDate, 1),
          input.context.organization.timezone,
        ),
        take: MAX_QUEUE_INVOICES + 1,
      },
    );
    if (records.length > MAX_QUEUE_INVOICES) {
      throw new CollectionQueueError(
        'QUEUE_TOO_BROAD',
        'Collection queue exceeds the pilot invoice processing limit',
      );
    }

    const queue = deriveQueue(
      records,
      asOfDate,
      input.context.organization.timezone,
    );
    const total = queue.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / input.limit);
    const start = (input.page - 1) * input.limit;

    return {
      data: queue.slice(start, start + input.limit),
      pagination: {
        page: input.page,
        limit: input.limit,
        total,
        totalPages,
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
        throw new CollectionQueueError(
          'INVALID_AS_OF_DATE',
          'asOfDate must be a valid YYYY-MM-DD calendar date',
        );
      }
      throw error;
    }
  }
}

function deriveQueue(
  records: readonly CollectionQueueSourceRecord[],
  asOfDate: string,
  timeZone: string,
): CollectionQueueItemView[] {
  return records
    .map((record) => {
      const lastContactDate = record.latestCommunication
        ? businessDateInTimeZone(
            record.latestCommunication.occurredAt,
            timeZone,
          )
        : null;
      return {
        record,
        lastContactDate,
        candidate: calculateCollectionQueueCandidate({
          invoiceId: record.id,
          originalAmount: record.originalAmount,
          allocations: record.allocations,
          dueDate: record.dueDate,
          asOfDate,
          lastContactDate,
          nextFollowUpDate:
            record.latestCommunication?.nextFollowUpDate ?? null,
          promiseStatus: record.promiseStatus,
          hasOpenDispute: record.hasOpenDispute,
        }),
      };
    })
    .filter(({ candidate }) => candidate.eligible)
    .sort((left, right) =>
      compareCollectionQueueCandidates(left.candidate, right.candidate),
    )
    .map(({ record, candidate, lastContactDate }) => ({
      id: record.id,
      invoiceNumber: record.invoiceNumber,
      debtor: record.debtor,
      dueDate: record.dueDate,
      outstandingAmount: candidate.outstandingAmount,
      state: candidate.state,
      aging: {
        bucket: candidate.aging.bucket,
        daysToDue: candidate.aging.daysToDue,
        daysOverdue: candidate.aging.daysOverdue,
      },
      lastContactAt:
        record.latestCommunication?.occurredAt.toISOString() ?? null,
      lastContactDate,
      nextFollowUpDate: record.latestCommunication?.nextFollowUpDate ?? null,
      promiseStatus: record.promiseStatus,
      hasOpenDispute: record.hasOpenDispute,
      daysSinceLastContact: candidate.daysSinceLastContact,
      reasons: candidate.reasons,
      priority: {
        score: candidate.priority.score,
        components: candidate.priority.components,
      },
    }));
}
