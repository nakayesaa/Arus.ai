import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
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
      bankReference: string | null;
      isOpeningBalance: boolean;
    };
  }>;
}

export interface CollectionQueueSourceRecord extends InvoiceCalculationRecord {
  lastContactDate: string | null;
  nextFollowUpDate: string | null;
  promiseStatus: 'ACTIVE' | 'DUE' | 'BROKEN' | 'FULFILLED' | 'CANCELLED' | null;
  hasOpenDispute: boolean;
}

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
    take: number;
  }): Promise<CollectionQueueSourceRecord[]>;
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
    take: number;
  }): Promise<CollectionQueueSourceRecord[]> {
    const records = await this.listInvoiceCandidates(input);
    return records.map((record) => ({
      ...record,
      // Days 7–8 add these source events. Until then, their persisted absence is
      // represented explicitly instead of manufacturing queue activity.
      lastContactDate: null,
      nextFollowUpDate: null,
      promiseStatus: null,
      hasOpenDispute: false,
    }));
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
          bankReference: allocation.payment.bankReference,
          isOpeningBalance: allocation.payment.isOpeningBalance,
        },
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
      bankReference: true,
      isOpeningBalance: true,
    },
  },
} satisfies Prisma.PaymentAllocationSelect;

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
