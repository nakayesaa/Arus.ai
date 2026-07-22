import {
  derivePromiseStatus,
  DomainError,
  formatMoney,
  parseMoney,
  validatePromiseDate,
  type PromiseStatus,
} from '@arus/domain';

import { businessDateInTimeZone } from '../lib/business-date.js';
import {
  PromiseRepositoryConflictError,
  PromiseRepositoryValidationError,
  type PromiseRecord,
  type PromiseRepository,
} from '../repositories/promise.repository.js';
import type { AuthContext } from './auth.service.js';

export interface PromiseView {
  id: string;
  invoiceId: string;
  amount: string;
  promiseDate: string;
  status: PromiseStatus;
  fulfilledAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdBy: PromiseRecord['createdBy'];
  cancelledBy: PromiseRecord['cancelledBy'];
  createdAt: string;
  updatedAt: string;
}

export interface PromiseServiceContract {
  createPromise(input: {
    context: AuthContext;
    requestId: string;
    invoiceId: string;
    operationKey: string;
    amount: string;
    promiseDate: string;
  }): Promise<{ data: PromiseView; replayed: boolean }>;
  cancelPromise(input: {
    context: AuthContext;
    requestId: string;
    promiseId: string;
    operationKey: string;
    reason: string;
  }): Promise<{ data: PromiseView; replayed: boolean }>;
}

export type PromiseErrorCode =
  | 'ACTIVE_PROMISE_EXISTS'
  | 'INVOICE_NOT_FOUND'
  | 'INVALID_PROMISE_AMOUNT'
  | 'INVALID_PROMISE_DATE'
  | 'PROMISE_FINALIZED'
  | 'PROMISE_IDEMPOTENCY_CONFLICT'
  | 'PROMISE_NOT_FOUND';

export class PromiseError extends Error {
  constructor(
    readonly code: PromiseErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PromiseError';
  }
}

export class PromiseService implements PromiseServiceContract {
  private readonly clock: () => Date;

  constructor(
    private readonly options: {
      repository: PromiseRepository;
      clock?: () => Date;
    },
  ) {
    this.clock = options.clock ?? (() => new Date());
  }

  async createPromise(input: {
    context: AuthContext;
    requestId: string;
    invoiceId: string;
    operationKey: string;
    amount: string;
    promiseDate: string;
  }): Promise<{ data: PromiseView; replayed: boolean }> {
    const occurredAt = this.clock();
    const asOfDate = businessDateInTimeZone(
      occurredAt,
      input.context.organization.timezone,
    );
    const amount = positiveMoney(input.amount);
    const promiseDate = validPromiseDate(input.promiseDate, asOfDate);

    try {
      const result = await this.options.repository.createPromise({
        organizationId: input.context.organization.id,
        invoiceId: input.invoiceId,
        actorId: input.context.user.id,
        actorRole: input.context.role,
        operationKey: input.operationKey,
        requestId: input.requestId,
        occurredAt,
        asOfDate,
        amount,
        promiseDate,
      });
      if (!result) {
        throw new PromiseError('INVOICE_NOT_FOUND', 'Invoice not found');
      }
      return {
        data: toPromiseView(result.record, asOfDate),
        replayed: result.replayed,
      };
    } catch (error) {
      throw mapRepositoryError(error);
    }
  }

  async cancelPromise(input: {
    context: AuthContext;
    requestId: string;
    promiseId: string;
    operationKey: string;
    reason: string;
  }): Promise<{ data: PromiseView; replayed: boolean }> {
    const occurredAt = this.clock();
    const asOfDate = businessDateInTimeZone(
      occurredAt,
      input.context.organization.timezone,
    );
    try {
      const result = await this.options.repository.cancelPromise({
        organizationId: input.context.organization.id,
        promiseId: input.promiseId,
        actorId: input.context.user.id,
        actorRole: input.context.role,
        operationKey: input.operationKey,
        requestId: input.requestId,
        occurredAt,
        reason: input.reason,
      });
      if (!result) {
        throw new PromiseError('PROMISE_NOT_FOUND', 'Promise not found');
      }
      return {
        data: toPromiseView(result.record, asOfDate),
        replayed: result.replayed,
      };
    } catch (error) {
      throw mapRepositoryError(error);
    }
  }
}

function positiveMoney(value: string): string {
  try {
    const amount = parseMoney(value);
    if (amount <= 0n)
      throw new Error('Promise amount must be greater than zero');
    return formatMoney(amount);
  } catch (error) {
    throw new PromiseError(
      'INVALID_PROMISE_AMOUNT',
      error instanceof Error ? error.message : 'Promise amount is invalid',
    );
  }
}

function validPromiseDate(value: string, asOfDate: string): string {
  try {
    return validatePromiseDate({ promiseDate: value, asOfDate });
  } catch (error) {
    if (error instanceof DomainError) {
      throw new PromiseError('INVALID_PROMISE_DATE', error.message);
    }
    throw error;
  }
}

function toPromiseView(record: PromiseRecord, asOfDate: string): PromiseView {
  return {
    id: record.id,
    invoiceId: record.invoiceId,
    amount: record.amount,
    promiseDate: record.promiseDate,
    status: derivePromiseStatus({
      promiseDate: record.promiseDate,
      asOfDate,
      finalStatus: record.finalStatus,
    }),
    fulfilledAt: record.fulfilledAt?.toISOString() ?? null,
    cancelledAt: record.cancelledAt?.toISOString() ?? null,
    cancelReason: record.cancelReason,
    createdBy: record.createdBy,
    cancelledBy: record.cancelledBy,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function mapRepositoryError(error: unknown): unknown {
  if (error instanceof PromiseRepositoryValidationError) {
    return new PromiseError('INVALID_PROMISE_AMOUNT', error.message);
  }
  if (!(error instanceof PromiseRepositoryConflictError)) return error;
  switch (error.reason) {
    case 'ACTIVE_PROMISE_EXISTS':
      return new PromiseError(
        'ACTIVE_PROMISE_EXISTS',
        'This invoice already has an active or due promise',
      );
    case 'IDEMPOTENCY_CONFLICT':
      return new PromiseError(
        'PROMISE_IDEMPOTENCY_CONFLICT',
        'This operation key was already used for another promise action',
      );
    case 'PROMISE_FINALIZED':
      return new PromiseError(
        'PROMISE_FINALIZED',
        'This promise is already fulfilled or cancelled',
      );
  }
}
