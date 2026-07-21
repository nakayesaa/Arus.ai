import { randomUUID } from 'node:crypto';

import { formatMoney, parseMoney } from '@arus/domain';

import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
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
import {
  parseCommittableInvoiceImportPayload,
  type CommittableInvoiceImportPayload,
} from '../imports/invoice-import-payload.js';

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

export interface InvoiceImportCommitSummary {
  committedInvoices: number;
  skippedRows: number;
  createdDebtors: number;
  openingPayments: number;
  openingAllocatedAmount: string;
}

export interface InvoiceImportCommitRecord {
  job: InvoiceImportJobRecord;
  reconciliation: InvoiceImportCommitSummary;
  replayed: boolean;
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
  commitReadyJob(input: {
    organizationId: string;
    actorId: string;
    requestId: string;
    importJobId: string;
  }): Promise<InvoiceImportCommitRecord | null>;
}

export class InvoiceImportRepositoryStateError extends Error {
  constructor(
    readonly reason: 'NO_VALID_ROWS' | 'NOT_PREVIEWING' | 'NOT_READY',
  ) {
    super(
      reason === 'NO_VALID_ROWS'
        ? 'Invoice import job has no valid rows to commit'
        : reason === 'NOT_READY'
          ? 'Invoice import job is not ready to commit'
          : 'Invoice import job is no longer previewing',
    );
    this.name = 'InvoiceImportRepositoryStateError';
  }
}

export class InvoiceImportRepositoryConflictError extends Error {
  constructor() {
    super('Invoice import source records changed after preview');
    this.name = 'InvoiceImportRepositoryConflictError';
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
        throw new InvoiceImportRepositoryStateError('NOT_PREVIEWING');
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
        throw new InvoiceImportRepositoryStateError('NOT_PREVIEWING');
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

  async commitReadyJob(input: {
    organizationId: string;
    actorId: string;
    requestId: string;
    importJobId: string;
  }): Promise<InvoiceImportCommitRecord | null> {
    try {
      return await this.database.$transaction(
        async (transaction) => {
          const locked = await transaction.$queryRaw<
            Array<{ status: InvoiceImportJobStatus }>
          >(Prisma.sql`
            SELECT "status"
            FROM "InvoiceImportJob"
            WHERE "id" = ${input.importJobId}::uuid
              AND "organizationId" = ${input.organizationId}::uuid
            FOR UPDATE
          `);
          const status = locked[0]?.status;
          if (!status) return null;

          if (status === 'COMMITTED') {
            return {
              job: await findJobOrThrow(transaction, input.importJobId),
              reconciliation: await committedSummary(
                transaction,
                input.organizationId,
                input.importJobId,
              ),
              replayed: true,
            };
          }
          if (status !== 'READY') {
            throw new InvoiceImportRepositoryStateError('NOT_READY');
          }

          const job = await findJobOrThrow(transaction, input.importJobId);
          const rows = await transaction.invoiceImportRow.findMany({
            where: {
              organizationId: input.organizationId,
              importJobId: input.importJobId,
              result: 'VALID',
            },
            orderBy: [{ rowNumber: 'asc' }, { id: 'asc' }],
            select: commitRowSelect,
          });
          if (rows.length !== job.validRows) throw commitConflict();
          if (rows.length === 0) {
            throw new InvoiceImportRepositoryStateError('NO_VALID_ROWS');
          }

          const preparedRows = rows.map((row) => ({
            ...row,
            payload: parseCommittableInvoiceImportPayload(
              row.normalizedPayload,
            ),
          }));
          const resolution = await resolveCommitDebtors(
            transaction,
            input.organizationId,
            preparedRows,
          );

          await createManyInBatches(resolution.createdDebtors, (data) =>
            transaction.debtor.createMany({ data }),
          );

          const postings = preparedRows.map((row) => {
            const debtorId = resolution.debtorIdByRow.get(row.id);
            if (!debtorId) throw commitConflict();
            const invoiceId = randomUUID();
            const paidAmount = parseMoney(row.payload.paidAmount);
            return {
              row,
              debtorId,
              invoiceId,
              invoice: {
                id: invoiceId,
                organizationId: input.organizationId,
                debtorId,
                invoiceNumber: row.payload.invoiceNumber,
                normalizedInvoiceNumber: row.payload.normalizedInvoiceNumber,
                invoiceDate: toDatabaseDate(row.payload.invoiceDate),
                dueDate: toDatabaseDate(row.payload.dueDate),
                originalAmount: row.payload.originalAmount,
                description: row.payload.notes,
              },
              opening:
                paidAmount > 0n
                  ? openingPosting({
                      actorId: input.actorId,
                      organizationId: input.organizationId,
                      importJobId: input.importJobId,
                      invoiceId,
                      debtorId,
                      rowNumber: row.rowNumber,
                      amount: row.payload.paidAmount,
                      date: row.payload.invoiceDate,
                    })
                  : null,
            };
          });

          await createManyInBatches(
            postings.map((posting) => posting.invoice),
            (data) => transaction.invoice.createMany({ data }),
          );
          const openings = postings.flatMap((posting) =>
            posting.opening ? [posting.opening] : [],
          );
          await createManyInBatches(
            openings.map((opening) => opening.payment),
            (data) => transaction.payment.createMany({ data }),
          );
          await createManyInBatches(
            openings.map((opening) => opening.allocation),
            (data) => transaction.paymentAllocation.createMany({ data }),
          );

          for (const postingBatch of batches(postings, INSERT_BATCH_SIZE)) {
            const values = postingBatch.map(
              (posting) =>
                Prisma.sql`(${posting.row.id}::uuid, ${posting.invoiceId}::uuid)`,
            );
            const updated = await transaction.$executeRaw(Prisma.sql`
              UPDATE "InvoiceImportRow" AS row
              SET "result" = 'COMMITTED'::"InvoiceImportRowResult",
                  "committedInvoiceId" = committed."invoiceId",
                  "updatedAt" = CURRENT_TIMESTAMP
              FROM (VALUES ${Prisma.join(values)}) AS committed("rowId", "invoiceId")
              WHERE row."id" = committed."rowId"
                AND row."organizationId" = ${input.organizationId}::uuid
                AND row."importJobId" = ${input.importJobId}::uuid
                AND row."result" = 'VALID'::"InvoiceImportRowResult"
            `);
            if (updated !== postingBatch.length) throw commitConflict();
          }

          const committedAt = new Date();
          const transitioned = await transaction.invoiceImportJob.updateMany({
            where: {
              id: input.importJobId,
              organizationId: input.organizationId,
              status: 'READY',
            },
            data: { status: 'COMMITTED', committedAt },
          });
          if (transitioned.count !== 1) {
            throw new InvoiceImportRepositoryStateError('NOT_READY');
          }

          const openingAllocatedAmount = formatMoney(
            postings.reduce(
              (total, posting) =>
                posting.opening
                  ? total + parseMoney(posting.row.payload.paidAmount)
                  : total,
              0n,
            ),
          );
          const reconciliation = {
            committedInvoices: postings.length,
            skippedRows: job.totalRows - postings.length,
            createdDebtors: resolution.createdDebtors.length,
            openingPayments: openings.length,
            openingAllocatedAmount,
          };
          await transaction.auditLog.create({
            data: {
              organizationId: input.organizationId,
              actorId: input.actorId,
              action: 'IMPORT_COMMITTED',
              entityType: 'InvoiceImportJob',
              entityId: input.importJobId,
              requestId: input.requestId,
              metadata: reconciliation,
            },
          });

          return {
            job: await findJobOrThrow(transaction, input.importJobId),
            reconciliation,
            replayed: false,
          };
        },
        { timeout: 60_000 },
      );
    } catch (error) {
      throw mapCommitConflict(error);
    }
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

const commitRowSelect = {
  id: true,
  rowNumber: true,
  normalizedPayload: true,
  debtorAction: true,
  matchedDebtorId: true,
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

interface PreparedCommitRow {
  id: string;
  rowNumber: number;
  debtorAction: InvoiceImportDebtorAction | null;
  matchedDebtorId: string | null;
  payload: CommittableInvoiceImportPayload;
}

async function resolveCommitDebtors(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  rows: readonly PreparedCommitRow[],
): Promise<{
  debtorIdByRow: Map<string, string>;
  createdDebtors: Prisma.DebtorCreateManyInput[];
}> {
  const debtorIdByRow = new Map<string, string>();
  const matchedIds = unique(
    rows.flatMap((row) =>
      row.debtorAction === 'MATCH_EXISTING' && row.matchedDebtorId
        ? [row.matchedDebtorId]
        : [],
    ),
  );
  const matchedDebtors = await transaction.debtor.findMany({
    where: {
      id: { in: matchedIds },
      organizationId,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (matchedDebtors.length !== matchedIds.length) throw commitConflict();
  const availableMatchedIds = new Set(
    matchedDebtors.map((debtor) => debtor.id),
  );

  const creationGroups = new Map<string, PreparedCommitRow[]>();
  for (const row of rows) {
    if (row.debtorAction === 'MATCH_EXISTING') {
      if (
        !row.matchedDebtorId ||
        !availableMatchedIds.has(row.matchedDebtorId)
      ) {
        throw commitConflict();
      }
      debtorIdByRow.set(row.id, row.matchedDebtorId);
      continue;
    }
    if (row.debtorAction !== 'WILL_CREATE') throw commitConflict();

    const key = debtorCreationKey(row.payload);
    const group = creationGroups.get(key);
    if (group) group.push(row);
    else creationGroups.set(key, [row]);
  }

  const codeKeys = unique(
    [...creationGroups.values()].flatMap((group) => {
      const code = group[0]?.payload.normalizedCustomerCode;
      return code ? [code] : [];
    }),
  );
  const nameKeys = unique(
    [...creationGroups.values()].flatMap((group) => {
      const first = group[0];
      return first && !first.payload.normalizedCustomerCode
        ? [first.payload.normalizedCustomerName]
        : [];
    }),
  );
  if (codeKeys.length > 0 || nameKeys.length > 0) {
    const nowExisting = await transaction.debtor.count({
      where: {
        organizationId,
        deletedAt: null,
        OR: [
          ...(codeKeys.length > 0
            ? [{ normalizedCode: { in: codeKeys } }]
            : []),
          ...(nameKeys.length > 0
            ? [{ normalizedName: { in: nameKeys } }]
            : []),
        ],
      },
    });
    if (nowExisting > 0) throw commitConflict();
  }

  const createdDebtors: Prisma.DebtorCreateManyInput[] = [];
  for (const group of creationGroups.values()) {
    const first = group[0];
    if (!first) continue;
    if (
      group.some(
        (row) =>
          row.payload.normalizedCustomerName !==
          first.payload.normalizedCustomerName,
      )
    ) {
      throw commitConflict();
    }

    const debtorId = randomUUID();
    createdDebtors.push({
      id: debtorId,
      organizationId,
      code: first.payload.customerCode,
      normalizedCode: first.payload.normalizedCustomerCode,
      name: first.payload.customerName,
      normalizedName: first.payload.normalizedCustomerName,
      contactName: first.payload.contactName,
      phoneNumber: first.payload.phoneNumber,
      email: first.payload.email,
    });
    for (const row of group) debtorIdByRow.set(row.id, debtorId);
  }

  return { debtorIdByRow, createdDebtors };
}

function debtorCreationKey(payload: CommittableInvoiceImportPayload): string {
  return payload.normalizedCustomerCode
    ? `code:${payload.normalizedCustomerCode}`
    : `name:${payload.normalizedCustomerName}`;
}

function openingPosting(input: {
  organizationId: string;
  actorId: string;
  importJobId: string;
  invoiceId: string;
  debtorId: string;
  rowNumber: number;
  amount: string;
  date: string;
}): {
  payment: Prisma.PaymentCreateManyInput;
  allocation: Prisma.PaymentAllocationCreateManyInput;
} {
  const paymentId = randomUUID();
  return {
    payment: {
      id: paymentId,
      organizationId: input.organizationId,
      debtorId: input.debtorId,
      paymentDate: toDatabaseDate(input.date),
      amount: input.amount,
      bankReference: `IMPORT:${input.importJobId}:${input.rowNumber}`,
      isOpeningBalance: true,
      createdById: input.actorId,
    },
    allocation: {
      id: randomUUID(),
      organizationId: input.organizationId,
      paymentId,
      invoiceId: input.invoiceId,
      amount: input.amount,
      allocationDate: toDatabaseDate(input.date),
      createdById: input.actorId,
    },
  };
}

async function committedSummary(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  importJobId: string,
): Promise<InvoiceImportCommitSummary> {
  const [job, rows] = await Promise.all([
    findJobOrThrow(transaction, importJobId),
    transaction.invoiceImportRow.findMany({
      where: { organizationId, importJobId, result: 'COMMITTED' },
      select: {
        normalizedPayload: true,
        debtorAction: true,
        committedInvoice: { select: { debtorId: true } },
      },
    }),
  ]);
  const createdDebtors = new Set<string>();
  let openingPayments = 0;
  let openingAllocatedAmount = 0n;
  for (const row of rows) {
    const payload = parseCommittableInvoiceImportPayload(row.normalizedPayload);
    if (row.debtorAction === 'WILL_CREATE' && row.committedInvoice) {
      createdDebtors.add(row.committedInvoice.debtorId);
    }
    const paidAmount = parseMoney(payload.paidAmount);
    if (paidAmount > 0n) {
      openingPayments += 1;
      openingAllocatedAmount += paidAmount;
    }
  }
  return {
    committedInvoices: rows.length,
    skippedRows: job.totalRows - rows.length,
    createdDebtors: createdDebtors.size,
    openingPayments,
    openingAllocatedAmount: formatMoney(openingAllocatedAmount),
  };
}

function findJobOrThrow(
  transaction: Prisma.TransactionClient,
  importJobId: string,
): Promise<InvoiceImportJobRecord> {
  return transaction.invoiceImportJob.findUniqueOrThrow({
    where: { id: importJobId },
    select: importJobSelect,
  });
}

async function createManyInBatches<T>(
  values: readonly T[],
  create: (data: T[]) => Promise<{ count: number }>,
): Promise<void> {
  for (const batch of batches(values, INSERT_BATCH_SIZE)) {
    const result = await create(batch);
    if (result.count !== batch.length) throw commitConflict();
  }
}

function toDatabaseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function commitConflict(): InvoiceImportRepositoryConflictError {
  return new InvoiceImportRepositoryConflictError();
}

function mapCommitConflict(error: unknown): unknown {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  ) {
    return commitConflict();
  }
  return error;
}
