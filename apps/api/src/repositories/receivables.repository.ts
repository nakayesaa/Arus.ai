import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import type {
  CommunicationChannel,
  DisputeCategory,
  DisputeStatus,
  MembershipRole,
  PromiseFinalStatus,
} from '../generated/prisma/enums.js';
import { databaseDate } from '../lib/business-date.js';

export interface DebtorRecord {
  id: string;
  code: string | null;
  name: string;
  contactName: string | null;
  phoneNumber: string | null;
  email: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceCalculationRecord {
  id: string;
  debtor: { id: string; code: string | null; name: string };
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  originalAmount: string;
  description: string | null;
  allocations: Array<{ amount: string; reversed: boolean }>;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceDetailRecord extends InvoiceCalculationRecord {
  allocationHistory: Array<{
    id: string;
    amount: string;
    allocationDate: string;
    reversedAt: string | null;
    reversalReason: string | null;
    payment: {
      id: string;
      paymentDate: string;
      amount: string;
      payerReference: string | null;
      bankReference: string | null;
      isOpeningBalance: boolean;
    };
  }>;
  communications: Array<{
    id: string;
    occurredAt: Date;
    channel: CommunicationChannel;
    notes: string;
    nextFollowUpDate: string | null;
    actor: { id: string; name: string; role: MembershipRole };
    createdAt: Date;
    updatedAt: Date;
  }>;
  promises: Array<{
    id: string;
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
  }>;
  disputes: Array<{
    id: string;
    category: DisputeCategory;
    details: string;
    status: DisputeStatus;
    resolutionNote: string | null;
    createdBy: { id: string; name: string; role: MembershipRole };
    resolvedBy: { id: string; name: string; role: MembershipRole } | null;
    resolvedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
}

export interface CollectionQueueSourceRecord extends InvoiceCalculationRecord {
  latestCommunication: {
    occurredAt: Date;
    nextFollowUpDate: string | null;
  } | null;
  latestPromise: {
    promiseDate: string;
    finalStatus: PromiseFinalStatus | null;
    fulfilledAt: Date | null;
    cancelledAt: Date | null;
  } | null;
  hasOpenDispute: boolean;
}

export interface CollectionCaseCounts {
  brokenPromiseCount: number;
  openDisputeCount: number;
}

export type CollectionCaseKind = 'BROKEN_PROMISE' | 'OPEN_DISPUTE';

export type CollectionCaseSummaryRecord =
  | {
      id: string;
      kind: 'BROKEN_PROMISE';
      invoice: InvoiceCalculationRecord;
      amount: string;
      promiseDate: string;
      createdAt: Date;
    }
  | {
      id: string;
      kind: 'OPEN_DISPUTE';
      invoice: InvoiceCalculationRecord;
      category: DisputeCategory;
      details: string;
      createdAt: Date;
    };

export interface DebtorDetailRecord extends DebtorRecord {
  invoices: InvoiceCalculationRecord[];
}

export interface DebtorMutationValues {
  code: string | null;
  normalizedCode: string | null;
  name: string;
  normalizedName: string;
  contactName: string | null;
  phoneNumber: string | null;
  email: string | null;
}

export interface ReceivablesRepository {
  listDebtors(input: {
    organizationId: string;
    search?: string | undefined;
    skip: number;
    take: number;
  }): Promise<{ records: DebtorRecord[]; total: number }>;
  findDebtor(
    organizationId: string,
    debtorId: string,
  ): Promise<DebtorDetailRecord | null>;
  createDebtor(input: {
    organizationId: string;
    actorId: string;
    requestId: string;
    values: DebtorMutationValues;
  }): Promise<DebtorRecord>;
  updateDebtor(input: {
    organizationId: string;
    actorId: string;
    requestId: string;
    debtorId: string;
    changes: Partial<DebtorMutationValues>;
  }): Promise<DebtorRecord | null>;
  listInvoiceCandidates(input: {
    organizationId: string;
    search?: string | undefined;
    debtorId?: string | undefined;
    debtorIds?: readonly string[] | undefined;
    take: number;
  }): Promise<InvoiceCalculationRecord[]>;
  listCollectionQueueCandidates(input: {
    organizationId: string;
    workflowOccurredBefore: Date;
    take: number;
  }): Promise<CollectionQueueSourceRecord[]>;
  getCollectionCaseCounts(input: {
    organizationId: string;
    asOfDate: string;
    workflowOccurredBefore: Date;
  }): Promise<CollectionCaseCounts>;
  listCollectionCaseSummaries(input: {
    organizationId: string;
    kind: CollectionCaseKind;
    asOfDate: string;
    workflowOccurredBefore: Date;
    skip: number;
    take: number;
  }): Promise<{ records: CollectionCaseSummaryRecord[]; total: number }>;
  findInvoice(
    organizationId: string,
    invoiceId: string,
  ): Promise<InvoiceDetailRecord | null>;
}

export class ReceivablesRepositoryConflictError extends Error {
  constructor(readonly reason: 'DEBTOR_CODE_IN_USE') {
    super(reason);
    this.name = 'ReceivablesRepositoryConflictError';
  }
}

export class PrismaReceivablesRepository implements ReceivablesRepository {
  constructor(private readonly database: PrismaClient) {}

  async listDebtors(input: {
    organizationId: string;
    search?: string | undefined;
    skip: number;
    take: number;
  }): Promise<{ records: DebtorRecord[]; total: number }> {
    const where = {
      organizationId: input.organizationId,
      deletedAt: null,
      ...(input.search
        ? {
            OR: [
              {
                name: { contains: input.search, mode: 'insensitive' as const },
              },
              {
                code: { contains: input.search, mode: 'insensitive' as const },
              },
            ],
          }
        : {}),
    };
    const [records, total] = await this.database.$transaction([
      this.database.debtor.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: input.skip,
        take: input.take,
        select: debtorSelect,
      }),
      this.database.debtor.count({ where }),
    ]);

    return { records: records.map(toDebtorRecord), total };
  }

  async findDebtor(
    organizationId: string,
    debtorId: string,
  ): Promise<DebtorDetailRecord | null> {
    const record = await this.database.debtor.findFirst({
      where: { id: debtorId, organizationId, deletedAt: null },
      select: {
        ...debtorSelect,
        invoices: {
          where: { organizationId, deletedAt: null },
          orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
          select: invoiceCalculationSelect,
        },
      },
    });

    if (!record) return null;
    return {
      ...toDebtorRecord(record),
      invoices: record.invoices.map(toInvoiceCalculationRecord),
    };
  }

  async createDebtor(input: {
    organizationId: string;
    actorId: string;
    requestId: string;
    values: DebtorMutationValues;
  }): Promise<DebtorRecord> {
    try {
      const record = await this.database.$transaction(async (transaction) => {
        const debtor = await transaction.debtor.create({
          data: { organizationId: input.organizationId, ...input.values },
          select: debtorSelect,
        });
        await transaction.auditLog.create({
          data: {
            organizationId: input.organizationId,
            actorId: input.actorId,
            action: 'DEBTOR_CREATED',
            entityType: 'Debtor',
            entityId: debtor.id,
            requestId: input.requestId,
            metadata: { hasExternalCode: debtor.code !== null },
          },
        });
        return debtor;
      });
      return toDebtorRecord(record);
    } catch (error) {
      throw mapUniqueConflict(error);
    }
  }

  async updateDebtor(input: {
    organizationId: string;
    actorId: string;
    requestId: string;
    debtorId: string;
    changes: Partial<DebtorMutationValues>;
  }): Promise<DebtorRecord | null> {
    try {
      const record = await this.database.$transaction(async (transaction) => {
        const updated = await transaction.debtor.updateMany({
          where: {
            id: input.debtorId,
            organizationId: input.organizationId,
            deletedAt: null,
          },
          data: input.changes,
        });
        if (updated.count === 0) return null;

        const debtor = await transaction.debtor.findUniqueOrThrow({
          where: { id: input.debtorId },
          select: debtorSelect,
        });
        await transaction.auditLog.create({
          data: {
            organizationId: input.organizationId,
            actorId: input.actorId,
            action: 'DEBTOR_UPDATED',
            entityType: 'Debtor',
            entityId: debtor.id,
            requestId: input.requestId,
            metadata: { changedFields: Object.keys(input.changes).sort() },
          },
        });
        return debtor;
      });
      return record ? toDebtorRecord(record) : null;
    } catch (error) {
      throw mapUniqueConflict(error);
    }
  }

  async listInvoiceCandidates(input: {
    organizationId: string;
    search?: string | undefined;
    debtorId?: string | undefined;
    debtorIds?: readonly string[] | undefined;
    take: number;
  }): Promise<InvoiceCalculationRecord[]> {
    const records = await this.database.invoice.findMany({
      where: {
        organizationId: input.organizationId,
        deletedAt: null,
        ...(input.debtorId ? { debtorId: input.debtorId } : {}),
        ...(input.debtorIds ? { debtorId: { in: [...input.debtorIds] } } : {}),
        ...(input.search
          ? {
              OR: [
                {
                  invoiceNumber: {
                    contains: input.search,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  debtor: {
                    name: {
                      contains: input.search,
                      mode: 'insensitive' as const,
                    },
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
      take: input.take,
      select: invoiceCalculationSelect,
    });
    return records.map(toInvoiceCalculationRecord);
  }

  async listCollectionQueueCandidates(input: {
    organizationId: string;
    workflowOccurredBefore: Date;
    take: number;
  }): Promise<CollectionQueueSourceRecord[]> {
    const records = await this.database.invoice.findMany({
      where: {
        organizationId: input.organizationId,
        deletedAt: null,
      },
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
      take: input.take,
      select: collectionQueueInvoiceSelect(input.workflowOccurredBefore),
    });
    return records.map((record) => {
      const latestCommunication = record.communications[0];
      return {
        ...toInvoiceCalculationRecord(record),
        latestCommunication: latestCommunication
          ? {
              occurredAt: latestCommunication.occurredAt,
              nextFollowUpDate: nullableDatabaseDate(
                latestCommunication.nextFollowUpDate,
              ),
            }
          : null,
        latestPromise: record.promises[0]
          ? {
              promiseDate: databaseDate(record.promises[0].promiseDate),
              finalStatus: record.promises[0].finalStatus,
              fulfilledAt: record.promises[0].fulfilledAt,
              cancelledAt: record.promises[0].cancelledAt,
            }
          : null,
        hasOpenDispute: record.disputes.length > 0,
      };
    });
  }

  async getCollectionCaseCounts(input: {
    organizationId: string;
    asOfDate: string;
    workflowOccurredBefore: Date;
  }): Promise<CollectionCaseCounts> {
    const brokenPromises = brokenPromiseAsOfWhere(input);
    const openDisputes = openDisputeAsOfWhere(input);
    const [brokenPromiseCount, openDisputeCount] =
      await this.database.$transaction([
        this.database.promiseToPay.count({
          where: brokenPromises,
        }),
        this.database.dispute.count({
          where: openDisputes,
        }),
      ]);
    return { brokenPromiseCount, openDisputeCount };
  }

  async listCollectionCaseSummaries(input: {
    organizationId: string;
    kind: CollectionCaseKind;
    asOfDate: string;
    workflowOccurredBefore: Date;
    skip: number;
    take: number;
  }): Promise<{ records: CollectionCaseSummaryRecord[]; total: number }> {
    if (input.kind === 'BROKEN_PROMISE') {
      const where = brokenPromiseAsOfWhere(input);
      const [records, total] = await this.database.$transaction([
        this.database.promiseToPay.findMany({
          where,
          orderBy: [{ promiseDate: 'asc' }, { id: 'asc' }],
          skip: input.skip,
          take: input.take,
          select: {
            id: true,
            amount: true,
            promiseDate: true,
            createdAt: true,
            invoice: { select: invoiceCalculationSelect },
          },
        }),
        this.database.promiseToPay.count({ where }),
      ]);
      return {
        records: records.map((record) => ({
          id: record.id,
          kind: 'BROKEN_PROMISE' as const,
          invoice: toInvoiceCalculationRecord(record.invoice),
          amount: record.amount.toFixed(2),
          promiseDate: databaseDate(record.promiseDate),
          createdAt: record.createdAt,
        })),
        total,
      };
    }

    const where = openDisputeAsOfWhere(input);
    const [records, total] = await this.database.$transaction([
      this.database.dispute.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: input.skip,
        take: input.take,
        select: {
          id: true,
          category: true,
          details: true,
          createdAt: true,
          invoice: { select: invoiceCalculationSelect },
        },
      }),
      this.database.dispute.count({ where }),
    ]);
    return {
      records: records.map((record) => ({
        id: record.id,
        kind: 'OPEN_DISPUTE' as const,
        invoice: toInvoiceCalculationRecord(record.invoice),
        category: record.category,
        details: record.details,
        createdAt: record.createdAt,
      })),
      total,
    };
  }

  async findInvoice(
    organizationId: string,
    invoiceId: string,
  ): Promise<InvoiceDetailRecord | null> {
    const record = await this.database.invoice.findFirst({
      where: { id: invoiceId, organizationId, deletedAt: null },
      select: {
        ...invoiceCalculationSelect,
        allocations: {
          orderBy: [{ allocationDate: 'asc' }, { id: 'asc' }],
          select: allocationHistorySelect,
        },
        communications: {
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
          take: 10_001,
          select: invoiceCommunicationSelect,
        },
        promises: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 10_001,
          select: invoicePromiseSelect,
        },
        disputes: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 10_001,
          select: invoiceDisputeSelect,
        },
      },
    });
    if (!record) return null;

    return {
      ...toInvoiceCalculationRecord(record),
      allocationHistory: record.allocations.map((allocation) => ({
        id: allocation.id,
        amount: allocation.amount.toFixed(2),
        allocationDate: databaseDate(allocation.allocationDate),
        reversedAt: allocation.reversedAt?.toISOString() ?? null,
        reversalReason: allocation.reversalReason,
        payment: {
          id: allocation.payment.id,
          paymentDate: databaseDate(allocation.payment.paymentDate),
          amount: allocation.payment.amount.toFixed(2),
          payerReference: allocation.payment.payerReference,
          bankReference: allocation.payment.bankReference,
          isOpeningBalance: allocation.payment.isOpeningBalance,
        },
      })),
      communications: record.communications.map((communication) => ({
        id: communication.id,
        occurredAt: communication.occurredAt,
        channel: communication.channel,
        notes: communication.notes,
        nextFollowUpDate: nullableDatabaseDate(communication.nextFollowUpDate),
        actor: {
          ...communication.actor,
          role: communication.actorRole,
        },
        createdAt: communication.createdAt,
        updatedAt: communication.updatedAt,
      })),
      promises: record.promises.map((promise) => ({
        id: promise.id,
        amount: promise.amount.toFixed(2),
        promiseDate: databaseDate(promise.promiseDate),
        finalStatus: promise.finalStatus,
        fulfilledAt: promise.fulfilledAt,
        cancelledAt: promise.cancelledAt,
        cancelReason: promise.cancelReason,
        createdBy: { ...promise.createdBy, role: promise.createdByRole },
        cancelledBy:
          promise.cancelledBy && promise.cancelledByRole
            ? { ...promise.cancelledBy, role: promise.cancelledByRole }
            : null,
        createdAt: promise.createdAt,
        updatedAt: promise.updatedAt,
      })),
      disputes: record.disputes.map((dispute) => ({
        id: dispute.id,
        category: dispute.category,
        details: dispute.details,
        status: dispute.status,
        resolutionNote: dispute.resolutionNote,
        createdBy: { ...dispute.createdBy, role: dispute.createdByRole },
        resolvedBy:
          dispute.resolvedBy && dispute.resolvedByRole
            ? { ...dispute.resolvedBy, role: dispute.resolvedByRole }
            : null,
        resolvedAt: dispute.resolvedAt,
        createdAt: dispute.createdAt,
        updatedAt: dispute.updatedAt,
      })),
    };
  }
}

const debtorSelect = {
  id: true,
  code: true,
  name: true,
  contactName: true,
  phoneNumber: true,
  email: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DebtorSelect;

const allocationCalculationSelect = {
  amount: true,
  reversedAt: true,
} satisfies Prisma.PaymentAllocationSelect;

const invoiceCalculationSelect = {
  id: true,
  invoiceNumber: true,
  invoiceDate: true,
  dueDate: true,
  originalAmount: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  debtor: { select: { id: true, code: true, name: true } },
  allocations: {
    orderBy: [{ allocationDate: 'asc' }, { id: 'asc' }],
    select: allocationCalculationSelect,
  },
} satisfies Prisma.InvoiceSelect;

function collectionQueueInvoiceSelect(
  workflowOccurredBefore: Date,
): Prisma.InvoiceSelect {
  return {
    ...invoiceCalculationSelect,
    communications: {
      where: { occurredAt: { lt: workflowOccurredBefore } },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: 1,
      select: { occurredAt: true, nextFollowUpDate: true },
    },
    promises: {
      where: { createdAt: { lt: workflowOccurredBefore } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 1,
      select: {
        promiseDate: true,
        finalStatus: true,
        fulfilledAt: true,
        cancelledAt: true,
      },
    },
    disputes: {
      where: {
        createdAt: { lt: workflowOccurredBefore },
        OR: [
          { resolvedAt: null },
          { resolvedAt: { gte: workflowOccurredBefore } },
        ],
      },
      take: 1,
      select: { id: true },
    },
  } satisfies Prisma.InvoiceSelect;
}

const allocationHistorySelect = {
  id: true,
  amount: true,
  allocationDate: true,
  reversedAt: true,
  reversalReason: true,
  payment: {
    select: {
      id: true,
      paymentDate: true,
      amount: true,
      payerReference: true,
      bankReference: true,
      isOpeningBalance: true,
    },
  },
} satisfies Prisma.PaymentAllocationSelect;

const invoiceCommunicationSelect = {
  id: true,
  occurredAt: true,
  channel: true,
  notes: true,
  nextFollowUpDate: true,
  actorRole: true,
  actor: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CommunicationSelect;

const invoicePromiseSelect = {
  id: true,
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

const invoiceDisputeSelect = {
  id: true,
  category: true,
  details: true,
  status: true,
  resolutionNote: true,
  createdByRole: true,
  createdBy: { select: { id: true, name: true } },
  resolvedByRole: true,
  resolvedBy: { select: { id: true, name: true } },
  resolvedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DisputeSelect;

function toDebtorRecord(record: {
  id: string;
  code: string | null;
  name: string;
  contactName: string | null;
  phoneNumber: string | null;
  email: string | null;
  createdAt: Date;
  updatedAt: Date;
}): DebtorRecord {
  return record;
}

function toInvoiceCalculationRecord(record: {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date;
  originalAmount: { toFixed(scale: number): string };
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  debtor: { id: string; code: string | null; name: string };
  allocations: Array<{
    amount: { toFixed(scale: number): string };
    reversedAt: Date | null;
  }>;
}): InvoiceCalculationRecord {
  return {
    id: record.id,
    debtor: record.debtor,
    invoiceNumber: record.invoiceNumber,
    invoiceDate: databaseDate(record.invoiceDate),
    dueDate: databaseDate(record.dueDate),
    originalAmount: record.originalAmount.toFixed(2),
    description: record.description,
    allocations: record.allocations.map((allocation) => ({
      amount: allocation.amount.toFixed(2),
      reversed: allocation.reversedAt !== null,
    })),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function nullableDatabaseDate(value: Date | null): string | null {
  return value ? databaseDate(value) : null;
}

function toDatabaseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function brokenPromiseAsOfWhere(input: {
  organizationId: string;
  asOfDate: string;
  workflowOccurredBefore: Date;
}): Prisma.PromiseToPayWhereInput {
  return {
    organizationId: input.organizationId,
    invoice: { organizationId: input.organizationId, deletedAt: null },
    createdAt: { lt: input.workflowOccurredBefore },
    promiseDate: { lt: toDatabaseDate(input.asOfDate) },
    OR: [
      { finalStatus: null },
      { fulfilledAt: { gte: input.workflowOccurredBefore } },
      { cancelledAt: { gte: input.workflowOccurredBefore } },
    ],
  };
}

function openDisputeAsOfWhere(input: {
  organizationId: string;
  workflowOccurredBefore: Date;
}): Prisma.DisputeWhereInput {
  return {
    organizationId: input.organizationId,
    invoice: { organizationId: input.organizationId, deletedAt: null },
    createdAt: { lt: input.workflowOccurredBefore },
    OR: [
      { resolvedAt: null },
      { resolvedAt: { gte: input.workflowOccurredBefore } },
    ],
  };
}

function mapUniqueConflict(error: unknown): unknown {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  ) {
    return new ReceivablesRepositoryConflictError('DEBTOR_CODE_IN_USE');
  }
  return error;
}
