import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { databaseDate } from '../lib/business-date.js';

export interface ReportInvoiceRecord {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  originalAmount: string;
  debtor: { id: string; code: string | null; name: string };
  allocations: Array<{
    amount: string;
    allocationDate: string;
    reversedAt: Date | null;
  }>;
}

export interface ReportPromiseRecord {
  amount: string;
  promiseDate: string;
  createdAt: Date;
  fulfilledAt: Date | null;
  cancelledAt: Date | null;
}

export interface ReportDisputeRecord {
  invoiceId: string;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface ReportSnapshotRecord {
  invoices: ReportInvoiceRecord[];
  promises: ReportPromiseRecord[];
  disputes: ReportDisputeRecord[];
}

export interface ReportRepository {
  readWeeklySnapshot(input: {
    organizationId: string;
    throughDate: string;
    invoiceTake: number;
    workflowTake: number;
  }): Promise<ReportSnapshotRecord>;
  recordGenerated(input: {
    organizationId: string;
    actorId: string;
    reportId: string;
    requestId: string;
    from: string;
    to: string;
    generatedAt: Date;
    sourceCounts: {
      invoices: number;
      promises: number;
      disputes: number;
    };
  }): Promise<void>;
}

export class PrismaReportRepository implements ReportRepository {
  constructor(private readonly database: PrismaClient) {}

  async readWeeklySnapshot(input: {
    organizationId: string;
    throughDate: string;
    invoiceTake: number;
    workflowTake: number;
  }): Promise<ReportSnapshotRecord> {
    return this.database.$transaction(
      async (transaction) => {
        const [invoices, promises, disputes] = await Promise.all([
          transaction.invoice.findMany({
            where: {
              organizationId: input.organizationId,
              deletedAt: null,
              invoiceDate: { lte: toDatabaseDate(input.throughDate) },
            },
            orderBy: [{ id: 'asc' }],
            take: input.invoiceTake,
            select: reportInvoiceSelect,
          }),
          transaction.promiseToPay.findMany({
            where: {
              organizationId: input.organizationId,
              invoice: { deletedAt: null },
            },
            orderBy: [{ id: 'asc' }],
            take: input.workflowTake,
            select: reportPromiseSelect,
          }),
          transaction.dispute.findMany({
            where: {
              organizationId: input.organizationId,
              invoice: { deletedAt: null },
            },
            orderBy: [{ id: 'asc' }],
            take: input.workflowTake,
            select: reportDisputeSelect,
          }),
        ]);
        return {
          invoices: invoices.map(toInvoiceRecord),
          promises: promises.map(toPromiseRecord),
          disputes,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async recordGenerated(input: {
    organizationId: string;
    actorId: string;
    reportId: string;
    requestId: string;
    from: string;
    to: string;
    generatedAt: Date;
    sourceCounts: {
      invoices: number;
      promises: number;
      disputes: number;
    };
  }): Promise<void> {
    await this.database.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        action: 'REPORT_GENERATED',
        entityType: 'WeeklyReport',
        entityId: input.reportId,
        requestId: input.requestId,
        createdAt: input.generatedAt,
        metadata: {
          from: input.from,
          to: input.to,
          sourceCounts: input.sourceCounts,
        },
      },
    });
  }
}

const reportInvoiceSelect = {
  id: true,
  invoiceNumber: true,
  invoiceDate: true,
  dueDate: true,
  originalAmount: true,
  debtor: { select: { id: true, code: true, name: true } },
  allocations: {
    orderBy: [{ allocationDate: 'asc' as const }, { id: 'asc' as const }],
    select: {
      amount: true,
      allocationDate: true,
      reversedAt: true,
    },
  },
} satisfies Prisma.InvoiceSelect;

const reportPromiseSelect = {
  amount: true,
  promiseDate: true,
  createdAt: true,
  fulfilledAt: true,
  cancelledAt: true,
} satisfies Prisma.PromiseToPaySelect;

const reportDisputeSelect = {
  invoiceId: true,
  createdAt: true,
  resolvedAt: true,
} satisfies Prisma.DisputeSelect;

type ReportInvoiceSelection = Prisma.InvoiceGetPayload<{
  select: typeof reportInvoiceSelect;
}>;
type ReportPromiseSelection = Prisma.PromiseToPayGetPayload<{
  select: typeof reportPromiseSelect;
}>;

function toInvoiceRecord(record: ReportInvoiceSelection): ReportInvoiceRecord {
  return {
    id: record.id,
    invoiceNumber: record.invoiceNumber,
    invoiceDate: databaseDate(record.invoiceDate),
    dueDate: databaseDate(record.dueDate),
    originalAmount: record.originalAmount.toFixed(2),
    debtor: record.debtor,
    allocations: record.allocations.map((allocation) => ({
      amount: allocation.amount.toFixed(2),
      allocationDate: databaseDate(allocation.allocationDate),
      reversedAt: allocation.reversedAt,
    })),
  };
}

function toPromiseRecord(record: ReportPromiseSelection): ReportPromiseRecord {
  return {
    amount: record.amount.toFixed(2),
    promiseDate: databaseDate(record.promiseDate),
    createdAt: record.createdAt,
    fulfilledAt: record.fulfilledAt,
    cancelledAt: record.cancelledAt,
  };
}

function toDatabaseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
