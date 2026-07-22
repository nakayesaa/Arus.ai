import {
  calculateInvoiceFinancials,
  derivePromiseStatus,
  DomainError,
  formatMoney,
  parseMoney,
  promiseAcceptsReplacement,
  validatePromiseAmount,
} from '@arus/domain';

import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import {
  PromiseFinalStatus,
  type MembershipRole,
} from '../generated/prisma/enums.js';
import { databaseDate } from '../lib/business-date.js';
import { lockInvoice } from '../lib/invoice-lock.js';

export interface PromiseRecord {
  id: string;
  invoiceId: string;
  amount: string;
  promiseDate: string;
  finalStatus: PromiseFinalStatus | null;
  fulfilledAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  createdBy: { id: string; name: string; role: MembershipRole };
  cancelledBy: { id: string; name: string; role: MembershipRole } | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PromiseWriteResult {
  record: PromiseRecord;
  replayed: boolean;
}

export interface PromiseRepository {
  createPromise(input: {
    organizationId: string;
    invoiceId: string;
    actorId: string;
    actorRole: MembershipRole;
    operationKey: string;
    requestId: string;
    occurredAt: Date;
    asOfDate: string;
    amount: string;
    promiseDate: string;
  }): Promise<PromiseWriteResult | null>;
  cancelPromise(input: {
    organizationId: string;
    promiseId: string;
    actorId: string;
    actorRole: MembershipRole;
    operationKey: string;
    requestId: string;
    occurredAt: Date;
    reason: string;
  }): Promise<PromiseWriteResult | null>;
}

export type PromiseRepositoryConflictReason =
  'ACTIVE_PROMISE_EXISTS' | 'IDEMPOTENCY_CONFLICT' | 'PROMISE_FINALIZED';

export class PromiseRepositoryConflictError extends Error {
  constructor(readonly reason: PromiseRepositoryConflictReason) {
    super(reason);
    this.name = 'PromiseRepositoryConflictError';
  }
}

export class PromiseRepositoryValidationError extends Error {
  constructor(
    readonly reason: 'AMOUNT_EXCEEDS_OUTSTANDING' | 'INVOICE_PAID',
    message: string,
  ) {
    super(message);
    this.name = 'PromiseRepositoryValidationError';
  }
}

export class PrismaPromiseRepository implements PromiseRepository {
  constructor(private readonly database: PrismaClient) {}

  async createPromise(input: {
    organizationId: string;
    invoiceId: string;
    actorId: string;
    actorRole: MembershipRole;
    operationKey: string;
    requestId: string;
    occurredAt: Date;
    asOfDate: string;
    amount: string;
    promiseDate: string;
  }): Promise<PromiseWriteResult | null> {
    try {
      const record = await this.database.$transaction(
        async (transaction) => {
          await lockInvoice(transaction, input.invoiceId);
          const replay = await transaction.promiseToPay.findUnique({
            where: {
              organizationId_operationKey: {
                organizationId: input.organizationId,
                operationKey: input.operationKey,
              },
            },
            select: promiseSelect,
          });
          if (replay) {
            assertCreateReplayMatches(replay, input);
            return { record: toPromiseRecord(replay), replayed: true };
          }
          const invoice = await transaction.invoice.findFirst({
            where: {
              id: input.invoiceId,
              organizationId: input.organizationId,
              deletedAt: null,
            },
            select: {
              id: true,
              originalAmount: true,
              allocations: {
                orderBy: [{ allocationDate: 'asc' }, { id: 'asc' }],
                select: { amount: true, reversedAt: true },
              },
              promises: {
                where: { organizationId: input.organizationId },
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                select: {
                  promiseDate: true,
                  finalStatus: true,
                },
              },
            },
          });
          if (!invoice) return null;

          const financials = calculateInvoiceFinancials({
            originalAmount: invoice.originalAmount.toFixed(2),
            allocations: invoice.allocations.map((allocation) => ({
              amount: allocation.amount.toFixed(2),
              reversed: allocation.reversedAt !== null,
            })),
          });
          if (parseMoney(financials.outstandingAmount) === 0n) {
            throw new PromiseRepositoryValidationError(
              'INVOICE_PAID',
              'A paid invoice cannot receive a promise',
            );
          }
          let amount: string;
          try {
            amount = validatePromiseAmount({
              amount: input.amount,
              outstandingAmount: financials.outstandingAmount,
            });
          } catch (error) {
            if (
              error instanceof DomainError &&
              error.code === 'PROMISE_EXCEEDS_OUTSTANDING'
            ) {
              throw new PromiseRepositoryValidationError(
                'AMOUNT_EXCEEDS_OUTSTANDING',
                error.message,
              );
            }
            throw error;
          }

          const blocksReplacement = invoice.promises.some((promise) => {
            const status = derivePromiseStatus({
              promiseDate: databaseDate(promise.promiseDate),
              asOfDate: input.asOfDate,
              finalStatus: promise.finalStatus,
            });
            return !promiseAcceptsReplacement(status);
          });
          if (blocksReplacement) {
            throw new PromiseRepositoryConflictError('ACTIVE_PROMISE_EXISTS');
          }

          const promise = await transaction.promiseToPay.create({
            data: {
              organizationId: input.organizationId,
              invoiceId: input.invoiceId,
              amount,
              promiseDate: toDatabaseDate(input.promiseDate),
              createdById: input.actorId,
              createdByRole: input.actorRole,
              operationKey: input.operationKey,
              createdAt: input.occurredAt,
            },
            select: promiseSelect,
          });
          await transaction.auditLog.create({
            data: {
              organizationId: input.organizationId,
              actorId: input.actorId,
              action: 'PROMISE_CREATED',
              entityType: 'PromiseToPay',
              entityId: promise.id,
              requestId: input.requestId,
              metadata: {
                invoiceId: input.invoiceId,
                amount,
                promiseDate: input.promiseDate,
              },
            },
          });
          return { record: toPromiseRecord(promise), replayed: false };
        },
        { isolationLevel: 'ReadCommitted' },
      );
      return record;
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      return this.recoverCreateReplay(input);
    }
  }

  async cancelPromise(input: {
    organizationId: string;
    promiseId: string;
    actorId: string;
    actorRole: MembershipRole;
    operationKey: string;
    requestId: string;
    occurredAt: Date;
    reason: string;
  }): Promise<PromiseWriteResult | null> {
    try {
      const result = await this.database.$transaction(
        async (transaction) => {
          const candidate = await transaction.promiseToPay.findFirst({
            where: {
              id: input.promiseId,
              organizationId: input.organizationId,
            },
            select: { invoiceId: true },
          });
          if (!candidate) return null;
          await lockInvoice(transaction, candidate.invoiceId);

          const promise = await transaction.promiseToPay.findFirst({
            where: {
              id: input.promiseId,
              organizationId: input.organizationId,
            },
            select: { ...promiseSelect, cancellationOperationKey: true },
          });
          if (!promise) return null;
          if (promise.finalStatus !== null) {
            if (
              promise.finalStatus === PromiseFinalStatus.CANCELLED &&
              promise.cancellationOperationKey === input.operationKey &&
              promise.cancelReason === input.reason &&
              promise.cancelledBy?.id === input.actorId
            ) {
              return { record: toPromiseRecord(promise), replayed: true };
            }
            throw new PromiseRepositoryConflictError('PROMISE_FINALIZED');
          }

          const cancelled = await transaction.promiseToPay.update({
            where: { id: input.promiseId },
            data: {
              finalStatus: PromiseFinalStatus.CANCELLED,
              cancelledAt: input.occurredAt,
              cancelledById: input.actorId,
              cancelledByRole: input.actorRole,
              cancelReason: input.reason,
              cancellationOperationKey: input.operationKey,
            },
            select: promiseSelect,
          });
          await transaction.auditLog.create({
            data: {
              organizationId: input.organizationId,
              actorId: input.actorId,
              action: 'PROMISE_CANCELLED',
              entityType: 'PromiseToPay',
              entityId: cancelled.id,
              requestId: input.requestId,
              metadata: { invoiceId: cancelled.invoiceId },
            },
          });
          return { record: toPromiseRecord(cancelled), replayed: false };
        },
        { isolationLevel: 'ReadCommitted' },
      );
      return result;
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      return this.recoverCancellationReplay(input);
    }
  }

  private async recoverCreateReplay(input: {
    organizationId: string;
    invoiceId: string;
    actorId: string;
    operationKey: string;
    amount: string;
    promiseDate: string;
  }): Promise<PromiseWriteResult> {
    const existing = await this.database.promiseToPay.findUnique({
      where: {
        organizationId_operationKey: {
          organizationId: input.organizationId,
          operationKey: input.operationKey,
        },
      },
      select: promiseSelect,
    });
    if (!existing) {
      throw new PromiseRepositoryConflictError('IDEMPOTENCY_CONFLICT');
    }
    assertCreateReplayMatches(existing, input);
    return { record: toPromiseRecord(existing), replayed: true };
  }

  private async recoverCancellationReplay(input: {
    organizationId: string;
    promiseId: string;
    actorId: string;
    operationKey: string;
    reason: string;
  }): Promise<PromiseWriteResult> {
    const existing = await this.database.promiseToPay.findFirst({
      where: {
        organizationId: input.organizationId,
        cancellationOperationKey: input.operationKey,
      },
      select: promiseSelect,
    });
    if (
      !existing ||
      existing.id !== input.promiseId ||
      existing.cancelledBy?.id !== input.actorId ||
      existing.cancelReason !== input.reason
    ) {
      throw new PromiseRepositoryConflictError('IDEMPOTENCY_CONFLICT');
    }
    return { record: toPromiseRecord(existing), replayed: true };
  }
}

const promiseSelect = {
  id: true,
  invoiceId: true,
  amount: true,
  promiseDate: true,
  finalStatus: true,
  fulfilledAt: true,
  cancelledAt: true,
  cancelReason: true,
  createdByRole: true,
  createdBy: { select: { id: true, name: true } },
  cancelledByRole: true,
  cancelledBy: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PromiseToPaySelect;

function toPromiseRecord(record: {
  id: string;
  invoiceId: string;
  amount: { toFixed(scale: number): string };
  promiseDate: Date;
  finalStatus: PromiseFinalStatus | null;
  fulfilledAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  createdByRole: MembershipRole;
  createdBy: { id: string; name: string };
  cancelledByRole: MembershipRole | null;
  cancelledBy: { id: string; name: string } | null;
  createdAt: Date;
  updatedAt: Date;
}): PromiseRecord {
  return {
    id: record.id,
    invoiceId: record.invoiceId,
    amount: record.amount.toFixed(2),
    promiseDate: databaseDate(record.promiseDate),
    finalStatus: record.finalStatus,
    fulfilledAt: record.fulfilledAt,
    cancelledAt: record.cancelledAt,
    cancelReason: record.cancelReason,
    createdBy: { ...record.createdBy, role: record.createdByRole },
    cancelledBy:
      record.cancelledBy && record.cancelledByRole
        ? { ...record.cancelledBy, role: record.cancelledByRole }
        : null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function assertCreateReplayMatches(
  existing: {
    invoiceId: string;
    amount: { toFixed(scale: number): string };
    promiseDate: Date;
    createdBy: { id: string };
  },
  input: {
    invoiceId: string;
    actorId: string;
    amount: string;
    promiseDate: string;
  },
): void {
  if (
    existing.invoiceId !== input.invoiceId ||
    existing.createdBy.id !== input.actorId ||
    existing.amount.toFixed(2) !== formatMoney(parseMoney(input.amount)) ||
    databaseDate(existing.promiseDate) !== input.promiseDate
  ) {
    throw new PromiseRepositoryConflictError('IDEMPOTENCY_CONFLICT');
  }
}

function toDatabaseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
