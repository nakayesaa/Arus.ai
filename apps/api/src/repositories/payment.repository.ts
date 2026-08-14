import {
  calculateInvoiceFinancials,
  formatMoney,
  isPromiseFulfilled,
  parseMoney,
  validatePaymentAllocation,
} from '@arus/domain';

/**
 * Payment persistence is the single authority for invoice balance mutation.
 * Every write locks the invoice and records payment plus allocation atomically.
 * Evidence approval can join that transaction instead of chaining writes.
 * Idempotency compares the complete financial command before replaying it.
 * Promise, communication, and audit effects commit with the same payment.
 */

import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import {
  CommunicationChannel,
  type MembershipRole,
  PaymentEvidenceState,
  PromiseFinalStatus,
} from '../generated/prisma/enums.js';
import { databaseDate } from '../lib/business-date.js';
import { lockInvoice } from '../lib/invoice-lock.js';

export interface PaymentRecord {
  id: string;
  debtor: { id: string; code: string | null; name: string };
  paymentDate: string;
  amount: string;
  payerReference: string | null;
  bankReference: string | null;
  isOpeningBalance: boolean;
  createdBy: { id: string; name: string };
  allocations: Array<{
    id: string;
    amount: string;
    allocationDate: string;
    reversedAt: string | null;
    reversalReason: string | null;
    invoice: { id: string; invoiceNumber: string };
  }>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentInvoiceResult {
  id: string;
  invoiceNumber: string;
  originalAmount: string;
  allocatedAmount: string;
  outstandingAmount: string;
  state: 'OPEN' | 'PARTIALLY_PAID' | 'PAID';
}

export interface PaymentWriteResult {
  record: PaymentRecord;
  invoice: PaymentInvoiceResult;
  fulfilledPromiseIds: string[];
  replayed: boolean;
}

export interface PaymentRepository {
  listPayments(input: {
    organizationId: string;
    from?: string | undefined;
    to?: string | undefined;
    skip: number;
    take: number;
  }): Promise<{ records: PaymentRecord[]; total: number }>;
  findPayment(
    organizationId: string,
    paymentId: string,
  ): Promise<PaymentRecord | null>;
  createInvoicePayment(input: {
    organizationId: string;
    invoiceId: string;
    actorId: string;
    operationKey: string;
    requestId: string;
    occurredAt: Date;
    paymentDate: string;
    amount: string;
    payerReference: string;
    bankReference: string | null;
    evidence?: { evidenceId: string; actorRole: MembershipRole };
  }): Promise<PaymentWriteResult | null>;
}

export class PaymentRepositoryConflictError extends Error {
  constructor(readonly reason: 'IDEMPOTENCY_CONFLICT') {
    super(reason);
    this.name = 'PaymentRepositoryConflictError';
  }
}

export class PaymentRepositoryValidationError extends Error {
  constructor(
    readonly reason:
      | 'AMOUNT_EXCEEDS_OUTSTANDING'
      | 'INVOICE_ALREADY_PAID'
      | 'EVIDENCE_NOT_REVIEWABLE',
    message: string,
  ) {
    super(message);
    this.name = 'PaymentRepositoryValidationError';
  }
}

export class PrismaPaymentRepository implements PaymentRepository {
  constructor(private readonly database: PrismaClient) {}

  async listPayments(input: {
    organizationId: string;
    from?: string | undefined;
    to?: string | undefined;
    skip: number;
    take: number;
  }): Promise<{ records: PaymentRecord[]; total: number }> {
    const where = {
      organizationId: input.organizationId,
      ...(input.from || input.to
        ? {
            paymentDate: {
              ...(input.from ? { gte: toDatabaseDate(input.from) } : {}),
              ...(input.to ? { lte: toDatabaseDate(input.to) } : {}),
            },
          }
        : {}),
    };
    const [records, total] = await this.database.$transaction([
      this.database.payment.findMany({
        where,
        orderBy: [{ paymentDate: 'desc' }, { id: 'desc' }],
        skip: input.skip,
        take: input.take,
        select: paymentSelect,
      }),
      this.database.payment.count({ where }),
    ]);
    return { records: records.map(toPaymentRecord), total };
  }

  async findPayment(
    organizationId: string,
    paymentId: string,
  ): Promise<PaymentRecord | null> {
    const record = await this.database.payment.findFirst({
      where: { id: paymentId, organizationId },
      select: paymentSelect,
    });
    return record ? toPaymentRecord(record) : null;
  }

  async createInvoicePayment(input: {
    organizationId: string;
    invoiceId: string;
    actorId: string;
    operationKey: string;
    requestId: string;
    occurredAt: Date;
    paymentDate: string;
    amount: string;
    payerReference: string;
    bankReference: string | null;
    evidence?: { evidenceId: string; actorRole: MembershipRole };
  }): Promise<PaymentWriteResult | null> {
    try {
      return await this.database.$transaction(
        async (transaction) => {
          await lockInvoice(transaction, input.invoiceId);

          const evidence = input.evidence
            ? await transaction.paymentEvidenceReview.findFirst({
                where: {
                  id: input.evidence.evidenceId,
                  organizationId: input.organizationId,
                },
                select: {
                  state: true,
                  invoiceId: true,
                  reviewerId: true,
                  paymentId: true,
                  operationKey: true,
                },
              })
            : null;
          if (input.evidence && !evidence) {
            throw new PaymentRepositoryValidationError(
              'EVIDENCE_NOT_REVIEWABLE',
              'Payment evidence was not found',
            );
          }

          const replay = await transaction.payment.findUnique({
            where: {
              organizationId_operationKey: {
                organizationId: input.organizationId,
                operationKey: input.operationKey,
              },
            },
            select: paymentSelect,
          });
          if (replay) {
            assertReplayMatches(replay, input);
            if (
              input.evidence &&
              (evidence?.state !== PaymentEvidenceState.ACCEPTED ||
                evidence.paymentId !== replay.id ||
                evidence.operationKey !== input.operationKey)
            ) {
              throw new PaymentRepositoryConflictError('IDEMPOTENCY_CONFLICT');
            }
            return this.replayResult(transaction, replay);
          }

          if (
            input.evidence &&
            (evidence?.state !== PaymentEvidenceState.AWAITING_REVIEW ||
              (evidence.invoiceId !== null &&
                evidence.invoiceId !== input.invoiceId))
          ) {
            throw new PaymentRepositoryValidationError(
              'EVIDENCE_NOT_REVIEWABLE',
              'Payment evidence is not awaiting review for this invoice',
            );
          }

          const invoice = await transaction.invoice.findFirst({
            where: {
              id: input.invoiceId,
              organizationId: input.organizationId,
              deletedAt: null,
            },
            select: paymentInvoiceSelect,
          });
          if (!invoice) return null;

          const financials = calculateInvoiceFinancials({
            originalAmount: invoice.originalAmount.toFixed(2),
            allocations: invoice.allocations.map((allocation) => ({
              amount: allocation.amount.toFixed(2),
              reversed: allocation.reversedAt !== null,
            })),
          });
          const allocation = validatedAllocation(
            input.amount,
            financials.outstandingAmount,
          );

          const payment = await transaction.payment.create({
            data: {
              organizationId: input.organizationId,
              debtorId: invoice.debtorId,
              paymentDate: toDatabaseDate(input.paymentDate),
              amount: allocation.amount,
              payerReference: input.payerReference,
              bankReference: input.bankReference,
              operationKey: input.operationKey,
              createdById: input.actorId,
              createdAt: input.occurredAt,
            },
            select: { id: true },
          });
          await transaction.paymentAllocation.create({
            data: {
              organizationId: input.organizationId,
              paymentId: payment.id,
              invoiceId: invoice.id,
              amount: allocation.amount,
              allocationDate: toDatabaseDate(input.paymentDate),
              createdById: input.actorId,
              createdAt: input.occurredAt,
            },
          });

          if (input.evidence) {
            await transaction.paymentEvidenceReview.update({
              where: { id: input.evidence.evidenceId },
              data: {
                debtorId: invoice.debtorId,
                invoiceId: invoice.id,
                state: PaymentEvidenceState.ACCEPTED,
                reviewerId: input.actorId,
                reviewedAt: input.occurredAt,
                rejectionReason: null,
                paymentId: payment.id,
                operationKey: input.operationKey,
              },
            });
            await transaction.communication.create({
              data: {
                organizationId: input.organizationId,
                invoiceId: input.invoiceId,
                actorId: input.actorId,
                actorRole: input.evidence.actorRole,
                operationKey: input.operationKey,
                occurredAt: input.occurredAt,
                channel: CommunicationChannel.WHATSAPP,
                notes: `WhatsApp evidence accepted; payment ${payment.id} recorded.`,
              },
            });
          }

          const fulfilledPromiseIds = promisesFulfilledByPayment({
            promises: invoice.promises,
            allocations: [
              ...invoice.allocations,
              {
                amount: decimalValue(allocation.amount),
                reversedAt: null,
                createdAt: input.occurredAt,
              },
            ],
          });
          if (fulfilledPromiseIds.length > 0) {
            const updated = await transaction.promiseToPay.updateMany({
              where: {
                id: { in: fulfilledPromiseIds },
                organizationId: input.organizationId,
                invoiceId: input.invoiceId,
                finalStatus: null,
              },
              data: {
                finalStatus: PromiseFinalStatus.FULFILLED,
                fulfilledAt: input.occurredAt,
              },
            });
            if (updated.count !== fulfilledPromiseIds.length) {
              throw new Error('Promise fulfillment changed concurrently');
            }
            await transaction.auditLog.createMany({
              data: fulfilledPromiseIds.map((promiseId) => ({
                organizationId: input.organizationId,
                actorId: input.actorId,
                action: 'PROMISE_FULFILLED',
                entityType: 'PromiseToPay',
                entityId: promiseId,
                requestId: input.requestId,
                metadata: {
                  invoiceId: input.invoiceId,
                  paymentId: payment.id,
                },
              })),
            });
          }

          await transaction.auditLog.create({
            data: {
              organizationId: input.organizationId,
              actorId: input.actorId,
              action: 'PAYMENT_RECORDED',
              entityType: 'Payment',
              entityId: payment.id,
              requestId: input.requestId,
              metadata: {
                invoiceId: input.invoiceId,
                amount: allocation.amount,
                paymentDate: input.paymentDate,
                outstandingBefore: allocation.outstandingBefore,
                outstandingAfter: allocation.outstandingAfter,
                fulfilledPromiseCount: fulfilledPromiseIds.length,
                hasBankReference: input.bankReference !== null,
                ...(input.evidence
                  ? {
                      evidenceId: input.evidence.evidenceId,
                      source: 'WHATSAPP_EVIDENCE',
                    }
                  : {}),
              },
            },
          });

          if (input.evidence) {
            await transaction.auditLog.create({
              data: {
                organizationId: input.organizationId,
                actorId: input.actorId,
                action: 'PAYMENT_EVIDENCE_ACCEPTED',
                entityType: 'PaymentEvidenceReview',
                entityId: input.evidence.evidenceId,
                requestId: input.requestId,
                metadata: {
                  paymentId: payment.id,
                  invoiceId: input.invoiceId,
                  operationKey: input.operationKey,
                },
              },
            });
          }

          const record = await transaction.payment.findUniqueOrThrow({
            where: { id: payment.id },
            select: paymentSelect,
          });
          return {
            record: toPaymentRecord(record),
            invoice: paymentInvoiceResult(invoice, [
              ...invoice.allocations,
              {
                amount: decimalValue(allocation.amount),
                reversedAt: null,
                createdAt: input.occurredAt,
              },
            ]),
            fulfilledPromiseIds,
            replayed: false,
          };
        },
        { isolationLevel: 'ReadCommitted' },
      );
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      return this.recoverReplay(input);
    }
  }

  private async recoverReplay(input: {
    organizationId: string;
    invoiceId: string;
    actorId: string;
    operationKey: string;
    paymentDate: string;
    amount: string;
    payerReference: string;
    bankReference: string | null;
  }): Promise<PaymentWriteResult> {
    const record = await this.database.payment.findFirst({
      where: {
        organizationId: input.organizationId,
        operationKey: input.operationKey,
      },
      select: paymentSelect,
    });
    if (!record) {
      throw new PaymentRepositoryConflictError('IDEMPOTENCY_CONFLICT');
    }
    assertReplayMatches(record, input);
    return this.replayResult(this.database, record);
  }

  private async replayResult(
    database: Prisma.TransactionClient | PrismaClient,
    record: PaymentSelection,
  ): Promise<PaymentWriteResult> {
    const allocation = record.allocations[0];
    if (!allocation) {
      throw new PaymentRepositoryConflictError('IDEMPOTENCY_CONFLICT');
    }
    const invoice = await database.invoice.findFirst({
      where: {
        id: allocation.invoice.id,
        organizationId: record.organizationId,
        deletedAt: null,
      },
      select: paymentInvoiceSelect,
    });
    if (!invoice) {
      throw new PaymentRepositoryConflictError('IDEMPOTENCY_CONFLICT');
    }
    return {
      record: toPaymentRecord(record),
      invoice: paymentInvoiceResult(invoice, invoice.allocations),
      fulfilledPromiseIds: invoice.promises
        .filter(
          (promise) =>
            promise.finalStatus === PromiseFinalStatus.FULFILLED &&
            promise.fulfilledAt?.getTime() === record.createdAt.getTime(),
        )
        .map((promise) => promise.id),
      replayed: true,
    };
  }
}

const paymentSelect = {
  id: true,
  organizationId: true,
  paymentDate: true,
  amount: true,
  payerReference: true,
  bankReference: true,
  operationKey: true,
  isOpeningBalance: true,
  createdBy: { select: { id: true, name: true } },
  debtor: { select: { id: true, code: true, name: true } },
  allocations: {
    orderBy: [{ allocationDate: 'asc' as const }, { id: 'asc' as const }],
    select: {
      id: true,
      amount: true,
      allocationDate: true,
      reversedAt: true,
      reversalReason: true,
      invoice: { select: { id: true, invoiceNumber: true } },
    },
  },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PaymentSelect;

type PaymentSelection = Prisma.PaymentGetPayload<{
  select: typeof paymentSelect;
}>;

const paymentInvoiceSelect = {
  id: true,
  debtorId: true,
  invoiceNumber: true,
  originalAmount: true,
  allocations: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
    select: {
      amount: true,
      reversedAt: true,
      createdAt: true,
    },
  },
  promises: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
    select: {
      id: true,
      amount: true,
      finalStatus: true,
      fulfilledAt: true,
      createdAt: true,
    },
  },
} satisfies Prisma.InvoiceSelect;

type PaymentInvoiceSelection = Prisma.InvoiceGetPayload<{
  select: typeof paymentInvoiceSelect;
}>;

interface FinancialAllocationSelection {
  amount: { toFixed(scale: number): string };
  reversedAt: Date | null;
  createdAt: Date;
}

function toPaymentRecord(record: PaymentSelection): PaymentRecord {
  return {
    id: record.id,
    debtor: record.debtor,
    paymentDate: databaseDate(record.paymentDate),
    amount: record.amount.toFixed(2),
    payerReference: record.payerReference,
    bankReference: record.bankReference,
    isOpeningBalance: record.isOpeningBalance,
    createdBy: record.createdBy,
    allocations: record.allocations.map((allocation) => ({
      id: allocation.id,
      amount: allocation.amount.toFixed(2),
      allocationDate: databaseDate(allocation.allocationDate),
      reversedAt: allocation.reversedAt?.toISOString() ?? null,
      reversalReason: allocation.reversalReason,
      invoice: allocation.invoice,
    })),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function paymentInvoiceResult(
  invoice: PaymentInvoiceSelection,
  allocations: readonly FinancialAllocationSelection[],
): PaymentInvoiceResult {
  const financials = calculateInvoiceFinancials({
    originalAmount: invoice.originalAmount.toFixed(2),
    allocations: allocations.map((allocation) => ({
      amount: allocation.amount.toFixed(2),
      reversed: allocation.reversedAt !== null,
    })),
  });
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    ...financials,
  };
}

function validatedAllocation(
  amount: string,
  outstandingAmount: string,
): ReturnType<typeof validatePaymentAllocation> {
  try {
    return validatePaymentAllocation({ amount, outstandingAmount });
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'PAYMENT_EXCEEDS_OUTSTANDING'
    ) {
      throw new PaymentRepositoryValidationError(
        'AMOUNT_EXCEEDS_OUTSTANDING',
        error instanceof Error ? error.message : 'Payment exceeds outstanding',
      );
    }
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'INVOICE_ALREADY_PAID'
    ) {
      throw new PaymentRepositoryValidationError(
        'INVOICE_ALREADY_PAID',
        error instanceof Error ? error.message : 'Invoice is already paid',
      );
    }
    throw error;
  }
}

function promisesFulfilledByPayment(input: {
  promises: PaymentInvoiceSelection['promises'];
  allocations: readonly FinancialAllocationSelection[];
}): string[] {
  return input.promises
    .filter((promise) => promise.finalStatus === null)
    .filter((promise) => {
      const allocatedAfterPromise = input.allocations.reduce(
        (total, allocation) =>
          allocation.reversedAt === null &&
          allocation.createdAt >= promise.createdAt
            ? total + parseMoney(allocation.amount.toFixed(2))
            : total,
        0n,
      );
      return isPromiseFulfilled({
        promiseAmount: promise.amount.toFixed(2),
        allocatedAfterPromise: formatMoney(allocatedAfterPromise),
      });
    })
    .map((promise) => promise.id);
}

function assertReplayMatches(
  record: PaymentSelection,
  input: {
    invoiceId: string;
    actorId: string;
    amount: string;
    paymentDate: string;
    payerReference: string;
    bankReference: string | null;
  },
): void {
  const allocation = record.allocations[0];
  if (
    record.isOpeningBalance ||
    record.allocations.length !== 1 ||
    !allocation ||
    allocation.invoice.id !== input.invoiceId ||
    record.createdBy.id !== input.actorId ||
    record.amount.toFixed(2) !== formatMoney(parseMoney(input.amount)) ||
    allocation.amount.toFixed(2) !== formatMoney(parseMoney(input.amount)) ||
    databaseDate(record.paymentDate) !== input.paymentDate ||
    record.payerReference !== input.payerReference ||
    record.bankReference !== input.bankReference
  ) {
    throw new PaymentRepositoryConflictError('IDEMPOTENCY_CONFLICT');
  }
}

function toDatabaseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function decimalValue(value: string): {
  toFixed(scale: number): string;
} {
  return {
    toFixed: () => value,
  };
}

function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
