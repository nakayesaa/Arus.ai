import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import type {
  InvoiceImportDebtorAction,
  InvoiceImportJobStatus,
  InvoiceImportRowResult,
} from '../generated/prisma/enums.js';
import type {
  ClassifiedInvoiceImportRow,
  ImportMatchingDebtor,
  InvoiceImportDiagnostic,
  InvoiceImportReferenceData,
} from '../imports/invoice-import.types.js';

const QUERY_BATCH_SIZE = 500;
const INSERT_BATCH_SIZE = 500;

export interface InvoiceImportJobRecord {
  id: string;
  filename: string;
  fileHash: string;
  status: InvoiceImportJobStatus;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  warningRows: number;
  fileWarnings: unknown;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  committedAt: Date | null;
  cancelledAt: Date | null;
}

export interface InvoiceImportRowRecord {
  id: string;
  rowNumber: number;
  result: InvoiceImportRowResult;
  normalizedPayload: unknown;
  errors: unknown;
  warnings: unknown;
  debtorAction: InvoiceImportDebtorAction | null;
  matchedDebtorId: string | null;
  committedInvoiceId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceImportRepository {
  createPreviewJob(input: {
    organizationId: string;
    actorId: string;
    filename: string;
    fileHash: string;
  }): Promise<InvoiceImportJobRecord>;
  findReferenceData(input: {
    organizationId: string;
    normalizedCustomerCodes: readonly string[];
    normalizedCustomerNames: readonly string[];
    normalizedInvoiceNumbers: readonly string[];
  }): Promise<InvoiceImportReferenceData>;
  completePreview(input: {
    organizationId: string;
    actorId: string;
    requestId: string;
    importJobId: string;
    rows: readonly ClassifiedInvoiceImportRow[];
    fileWarnings: readonly InvoiceImportDiagnostic[];
  }): Promise<InvoiceImportJobRecord>;
  failPreview(input: {
    organizationId: string;
    actorId: string;
    requestId: string;
    importJobId: string;
    failureCode: string;
    failureMessage: string;
    fileWarnings: readonly InvoiceImportDiagnostic[];
  }): Promise<InvoiceImportJobRecord>;
  findJob(
    organizationId: string,
    importJobId: string,
  ): Promise<InvoiceImportJobRecord | null>;
  listRows(input: {
    organizationId: string;
    importJobId: string;
    result?: InvoiceImportRowResult | undefined;
    skip: number;
    take: number;
  }): Promise<{ records: InvoiceImportRowRecord[]; total: number } | null>;
}

export class InvoiceImportRepositoryStateError extends Error {
  constructor() {
    super('Invoice import job is no longer previewing');
    this.name = 'InvoiceImportRepositoryStateError';
  }
}

export class PrismaInvoiceImportRepository implements InvoiceImportRepository {
  constructor(private readonly database: PrismaClient) {}

  async createPreviewJob(input: {
    organizationId: string;
    actorId: string;
    filename: string;
    fileHash: string;
  }): Promise<InvoiceImportJobRecord> {
    return this.database.invoiceImportJob.create({
      data: {
        organizationId: input.organizationId,
        createdById: input.actorId,
        filename: input.filename,
        fileHash: input.fileHash,
      },
      select: importJobSelect,
    });
  }

  async findReferenceData(input: {
    organizationId: string;
    normalizedCustomerCodes: readonly string[];
    normalizedCustomerNames: readonly string[];
    normalizedInvoiceNumbers: readonly string[];
  }): Promise<InvoiceImportReferenceData> {
    const debtorRecords = new Map<string, ImportMatchingDebtor>();
    for (const codes of batches(
      unique(input.normalizedCustomerCodes),
      QUERY_BATCH_SIZE,
    )) {
      const records = await this.database.debtor.findMany({
        where: {
          organizationId: input.organizationId,
          deletedAt: null,
          normalizedCode: { in: codes },
        },
        orderBy: { id: 'asc' },
        select: importMatchingDebtorSelect,
      });
      for (const record of records) debtorRecords.set(record.id, record);
    }
    for (const names of batches(
      unique(input.normalizedCustomerNames),
      QUERY_BATCH_SIZE,
    )) {
      const records = await this.database.debtor.findMany({
        where: {
          organizationId: input.organizationId,
          deletedAt: null,
          normalizedName: { in: names },
        },
        orderBy: { id: 'asc' },
        select: importMatchingDebtorSelect,
      });
      for (const record of records) debtorRecords.set(record.id, record);
    }

    const existingInvoiceNumbers = new Set<string>();
    for (const invoiceNumbers of batches(
      unique(input.normalizedInvoiceNumbers),
      QUERY_BATCH_SIZE,
    )) {
      const records = await this.database.invoice.findMany({
        where: {
          organizationId: input.organizationId,
          deletedAt: null,
          normalizedInvoiceNumber: { in: invoiceNumbers },
        },
        select: { normalizedInvoiceNumber: true },
      });
      for (const record of records) {
        existingInvoiceNumbers.add(record.normalizedInvoiceNumber);
      }
    }

    return {
      debtors: [...debtorRecords.values()],
      existingInvoiceNumbers,
    };
  }

  async completePreview(input: {
    organizationId: string;
    actorId: string;
    requestId: string;
    importJobId: string;
    rows: readonly ClassifiedInvoiceImportRow[];
    fileWarnings: readonly InvoiceImportDiagnostic[];
  }): Promise<InvoiceImportJobRecord> {
    const counts = previewCounts(input.rows);
    return this.database.$transaction(async (transaction) => {
      const transitioned = await transaction.invoiceImportJob.updateMany({
        where: {
          id: input.importJobId,
          organizationId: input.organizationId,
          status: 'PREVIEWING',
        },
        data: {
          status: 'READY',
          ...counts,
          fileWarnings: toInputJson(input.fileWarnings),
        },
      });
      if (transitioned.count !== 1) {
        throw new InvoiceImportRepositoryStateError();
      }

      for (const rows of batches(input.rows, INSERT_BATCH_SIZE)) {
        await transaction.invoiceImportRow.createMany({
          data: rows.map((row) => ({
            organizationId: input.organizationId,
            importJobId: input.importJobId,
            rowNumber: row.rowNumber,
            result: row.result,
            normalizedPayload: toInputJson(row.payload),
            errors: toInputJson(row.errors),
            warnings: toInputJson(row.warnings),
            debtorAction: row.debtorAction,
            matchedDebtorId: row.matchedDebtorId,
          })),
        });
      }

      await transaction.auditLog.create({
        data: {
          organizationId: input.organizationId,
          actorId: input.actorId,
          action: 'IMPORT_PREVIEWED',
          entityType: 'InvoiceImportJob',
          entityId: input.importJobId,
          requestId: input.requestId,
          metadata: {
            ...counts,
            fileWarningCount: input.fileWarnings.length,
          },
        },
      });
      return transaction.invoiceImportJob.findUniqueOrThrow({
        where: { id: input.importJobId },
        select: importJobSelect,
      });
    });
  }

  async failPreview(input: {
    organizationId: string;
    actorId: string;
    requestId: string;
    importJobId: string;
    failureCode: string;
    failureMessage: string;
    fileWarnings: readonly InvoiceImportDiagnostic[];
  }): Promise<InvoiceImportJobRecord> {
    return this.database.$transaction(async (transaction) => {
      const transitioned = await transaction.invoiceImportJob.updateMany({
        where: {
          id: input.importJobId,
          organizationId: input.organizationId,
          status: 'PREVIEWING',
        },
        data: {
          status: 'FAILED',
          failureCode: input.failureCode,
          failureMessage: input.failureMessage,
          fileWarnings: toInputJson(input.fileWarnings),
        },
      });
      if (transitioned.count !== 1) {
        throw new InvoiceImportRepositoryStateError();
      }

      await transaction.auditLog.create({
        data: {
          organizationId: input.organizationId,
          actorId: input.actorId,
          action: 'IMPORT_PREVIEW_FAILED',
          entityType: 'InvoiceImportJob',
          entityId: input.importJobId,
          requestId: input.requestId,
          metadata: {
            failureCode: input.failureCode,
            fileWarningCount: input.fileWarnings.length,
          },
        },
      });
      return transaction.invoiceImportJob.findUniqueOrThrow({
        where: { id: input.importJobId },
        select: importJobSelect,
      });
    });
  }

  async findJob(
    organizationId: string,
    importJobId: string,
  ): Promise<InvoiceImportJobRecord | null> {
    return this.database.invoiceImportJob.findFirst({
      where: { id: importJobId, organizationId },
      select: importJobSelect,
    });
  }

  async listRows(input: {
    organizationId: string;
    importJobId: string;
    result?: InvoiceImportRowResult | undefined;
    skip: number;
    take: number;
  }): Promise<{ records: InvoiceImportRowRecord[]; total: number } | null> {
    const job = await this.database.invoiceImportJob.findFirst({
      where: {
        id: input.importJobId,
        organizationId: input.organizationId,
      },
      select: { id: true },
    });
    if (!job) return null;

    const where = {
      organizationId: input.organizationId,
      importJobId: input.importJobId,
      ...(input.result ? { result: input.result } : {}),
    };
    const [records, total] = await this.database.$transaction([
      this.database.invoiceImportRow.findMany({
        where,
        orderBy: [{ rowNumber: 'asc' }, { id: 'asc' }],
        skip: input.skip,
        take: input.take,
        select: importRowSelect,
      }),
      this.database.invoiceImportRow.count({ where }),
    ]);
    return { records, total };
  }
}

const importJobSelect = {
  id: true,
  filename: true,
  fileHash: true,
  status: true,
  totalRows: true,
  validRows: true,
  invalidRows: true,
  duplicateRows: true,
  warningRows: true,
  fileWarnings: true,
  failureCode: true,
  failureMessage: true,
  createdAt: true,
  updatedAt: true,
  committedAt: true,
  cancelledAt: true,
} satisfies Prisma.InvoiceImportJobSelect;

const importRowSelect = {
  id: true,
  rowNumber: true,
  result: true,
  normalizedPayload: true,
  errors: true,
  warnings: true,
  debtorAction: true,
  matchedDebtorId: true,
  committedInvoiceId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.InvoiceImportRowSelect;

const importMatchingDebtorSelect = {
  id: true,
  code: true,
  normalizedCode: true,
  name: true,
  normalizedName: true,
} satisfies Prisma.DebtorSelect;

function previewCounts(rows: readonly ClassifiedInvoiceImportRow[]): {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  warningRows: number;
} {
  let validRows = 0;
  let invalidRows = 0;
  let duplicateRows = 0;
  let warningRows = 0;
  for (const row of rows) {
    if (row.result === 'VALID') validRows += 1;
    else if (row.result === 'INVALID') invalidRows += 1;
    else duplicateRows += 1;
    if (row.warnings.length > 0) warningRows += 1;
  }
  return {
    totalRows: rows.length,
    validRows,
    invalidRows,
    duplicateRows,
    warningRows,
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function batches<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
