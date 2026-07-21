import type { Logger } from 'pino';
import type {
  InvoiceImportDebtorAction,
  InvoiceImportJobStatus,
  InvoiceImportRowResult,
} from '../generated/prisma/enums.js';
import { classifyInvoiceImportRows } from '../imports/invoice-import-classifier.js';
import { parseInvoiceCsv } from '../imports/invoice-csv-parser.js';
import { validateInvoiceImportRows } from '../imports/invoice-import-normalizer.js';
import {
  parseInvoiceImportDiagnostics,
  parseNormalizedInvoiceImportPayload,
} from '../imports/invoice-import-payload.js';
import {
  InvoiceImportFileError,
  type InvoiceImportDiagnostic,
  type NormalizedInvoiceImportPayload,
} from '../imports/invoice-import.types.js';
import type { InvoiceCsvUpload } from '../lib/invoice-csv-upload.js';
import type {
  InvoiceImportCommitRecord,
  InvoiceImportJobRecord,
  InvoiceImportRepository,
  InvoiceImportRowRecord,
} from '../repositories/invoice-import.repository.js';
import {
  InvoiceImportRepositoryConflictError,
  InvoiceImportRepositoryStateError,
} from '../repositories/invoice-import.repository.js';
import type { AuthContext } from './auth.service.js';

export interface InvoiceImportJobView {
  id: string;
  filename: string;
  fileHash: string;
  status: InvoiceImportJobStatus;
  counts: {
    total: number;
    valid: number;
    invalid: number;
    duplicate: number;
    warning: number;
  };
  fileWarnings: InvoiceImportDiagnostic[];
  failure: { code: string; message: string } | null;
  committedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceImportRowView {
  id: string;
  rowNumber: number;
  result: InvoiceImportRowResult;
  payload: NormalizedInvoiceImportPayload;
  errors: InvoiceImportDiagnostic[];
  warnings: InvoiceImportDiagnostic[];
  debtor: {
    action: InvoiceImportDebtorAction | null;
    matchedDebtorId: string | null;
  };
  committedInvoiceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceImportPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface InvoiceImportCommitView {
  job: InvoiceImportJobView;
  reconciliation: {
    committedInvoices: number;
    skippedRows: number;
    createdDebtors: number;
    openingPayments: number;
    openingAllocatedAmount: string;
  };
  replayed: boolean;
}

export interface InvoiceImportServiceContract {
  previewInvoices(input: {
    context: AuthContext;
    requestId: string;
    upload: InvoiceCsvUpload;
  }): Promise<InvoiceImportJobView>;
  getJob(input: {
    context: AuthContext;
    importJobId: string;
  }): Promise<InvoiceImportJobView>;
  listRows(input: {
    context: AuthContext;
    importJobId: string;
    result?: InvoiceImportRowResult | undefined;
    page: number;
    limit: number;
  }): Promise<{
    data: InvoiceImportRowView[];
    pagination: InvoiceImportPagination;
  }>;
  commitInvoices(input: {
    context: AuthContext;
    requestId: string;
    importJobId: string;
  }): Promise<InvoiceImportCommitView>;
}

export class InvoiceImportServiceError extends Error {
  constructor(
    readonly code:
      | 'IMPORT_COMMIT_CONFLICT'
      | 'IMPORT_JOB_NOT_FOUND'
      | 'IMPORT_JOB_NOT_READY'
      | 'IMPORT_NO_VALID_ROWS',
    message: string,
  ) {
    super(message);
    this.name = 'InvoiceImportServiceError';
  }
}

interface InvoiceImportServiceOptions {
  repository: InvoiceImportRepository;
  logger?: Pick<Logger, 'error'> | undefined;
}

export class InvoiceImportService implements InvoiceImportServiceContract {
  constructor(private readonly options: InvoiceImportServiceOptions) {}

  async previewInvoices(input: {
    context: AuthContext;
    requestId: string;
    upload: InvoiceCsvUpload;
  }): Promise<InvoiceImportJobView> {
    const organizationId = input.context.organization.id;
    const actorId = input.context.user.id;
    const job = await this.options.repository.createPreviewJob({
      organizationId,
      actorId,
      filename: input.upload.filename,
      fileHash: input.upload.fileHash,
    });

    try {
      const parsed = await parseInvoiceCsv(input.upload.buffer);
      const validatedRows = validateInvoiceImportRows(parsed.rows);
      const referenceData = await this.options.repository.findReferenceData({
        organizationId,
        normalizedCustomerCodes: present(
          validatedRows.map((row) => row.payload.normalizedCustomerCode),
        ),
        normalizedCustomerNames: present(
          validatedRows.map((row) => row.payload.normalizedCustomerName),
        ),
        normalizedInvoiceNumbers: present(
          validatedRows.map((row) => row.payload.normalizedInvoiceNumber),
        ),
      });
      const classifiedRows = classifyInvoiceImportRows(
        validatedRows,
        referenceData,
      );
      const completed = await this.options.repository.completePreview({
        organizationId,
        actorId,
        requestId: input.requestId,
        importJobId: job.id,
        rows: classifiedRows,
        fileWarnings: parsed.warnings,
      });
      return toJobView(completed);
    } catch (error) {
      if (error instanceof InvoiceImportFileError) {
        const failed = await this.options.repository.failPreview({
          organizationId,
          actorId,
          requestId: input.requestId,
          importJobId: job.id,
          failureCode: error.code,
          failureMessage: boundedFailureMessage(error.message),
          fileWarnings: error.warnings,
        });
        return toJobView(failed);
      }

      try {
        await this.options.repository.failPreview({
          organizationId,
          actorId,
          requestId: input.requestId,
          importJobId: job.id,
          failureCode: 'PREVIEW_INTERNAL_ERROR',
          failureMessage: 'Invoice import preview failed unexpectedly',
          fileWarnings: [],
        });
      } catch (failureError) {
        this.options.logger?.error(
          { err: failureError, importJobId: job.id },
          'Failed to persist invoice import preview failure',
        );
      }
      throw error;
    }
  }

  async getJob(input: {
    context: AuthContext;
    importJobId: string;
  }): Promise<InvoiceImportJobView> {
    const record = await this.options.repository.findJob(
      input.context.organization.id,
      input.importJobId,
    );
    if (!record) throw importJobNotFound();
    return toJobView(record);
  }

  async listRows(input: {
    context: AuthContext;
    importJobId: string;
    result?: InvoiceImportRowResult | undefined;
    page: number;
    limit: number;
  }): Promise<{
    data: InvoiceImportRowView[];
    pagination: InvoiceImportPagination;
  }> {
    const result = await this.options.repository.listRows({
      organizationId: input.context.organization.id,
      importJobId: input.importJobId,
      ...(input.result ? { result: input.result } : {}),
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    });
    if (!result) throw importJobNotFound();
    return {
      data: result.records.map(toRowView),
      pagination: {
        page: input.page,
        limit: input.limit,
        total: result.total,
        totalPages:
          result.total === 0 ? 0 : Math.ceil(result.total / input.limit),
      },
    };
  }

  async commitInvoices(input: {
    context: AuthContext;
    requestId: string;
    importJobId: string;
  }): Promise<InvoiceImportCommitView> {
    try {
      const record = await this.options.repository.commitReadyJob({
        organizationId: input.context.organization.id,
        actorId: input.context.user.id,
        requestId: input.requestId,
        importJobId: input.importJobId,
      });
      if (!record) throw importJobNotFound();
      return toCommitView(record);
    } catch (error) {
      if (error instanceof InvoiceImportServiceError) throw error;
      if (error instanceof InvoiceImportRepositoryStateError) {
        if (error.reason === 'NO_VALID_ROWS') {
          throw new InvoiceImportServiceError(
            'IMPORT_NO_VALID_ROWS',
            'This preview has no valid invoice rows to commit',
          );
        }
        throw new InvoiceImportServiceError(
          'IMPORT_JOB_NOT_READY',
          'Only a ready invoice import can be committed',
        );
      }
      if (error instanceof InvoiceImportRepositoryConflictError) {
        throw new InvoiceImportServiceError(
          'IMPORT_COMMIT_CONFLICT',
          'Receivable data changed after this preview. Generate a fresh preview before committing.',
        );
      }
      throw error;
    }
  }
}

function toJobView(record: InvoiceImportJobRecord): InvoiceImportJobView {
  return {
    id: record.id,
    filename: record.filename,
    fileHash: record.fileHash,
    status: record.status,
    counts: {
      total: record.totalRows,
      valid: record.validRows,
      invalid: record.invalidRows,
      duplicate: record.duplicateRows,
      warning: record.warningRows,
    },
    fileWarnings:
      record.fileWarnings === null
        ? []
        : parseInvoiceImportDiagnostics(record.fileWarnings),
    failure:
      record.failureCode && record.failureMessage
        ? { code: record.failureCode, message: record.failureMessage }
        : null,
    committedAt: record.committedAt?.toISOString() ?? null,
    cancelledAt: record.cancelledAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toRowView(record: InvoiceImportRowRecord): InvoiceImportRowView {
  return {
    id: record.id,
    rowNumber: record.rowNumber,
    result: record.result,
    payload: parseNormalizedInvoiceImportPayload(record.normalizedPayload),
    errors: parseInvoiceImportDiagnostics(record.errors),
    warnings: parseInvoiceImportDiagnostics(record.warnings),
    debtor: {
      action: record.debtorAction,
      matchedDebtorId: record.matchedDebtorId,
    },
    committedInvoiceId: record.committedInvoiceId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toCommitView(
  record: InvoiceImportCommitRecord,
): InvoiceImportCommitView {
  return {
    job: toJobView(record.job),
    reconciliation: record.reconciliation,
    replayed: record.replayed,
  };
}

function present(values: readonly (string | null)[]): string[] {
  return values.filter((value): value is string => value !== null);
}

function importJobNotFound(): InvoiceImportServiceError {
  return new InvoiceImportServiceError(
    'IMPORT_JOB_NOT_FOUND',
    'Invoice import job not found',
  );
}

function boundedFailureMessage(message: string): string {
  return Array.from(message).slice(0, 500).join('');
}
