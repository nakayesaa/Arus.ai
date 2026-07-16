import {
  AgingBucket,
  calculateInvoiceSnapshot,
  DomainError,
  formatMoney,
  InvoiceState,
  parseBusinessDate,
  parseMoney,
  type InvoiceAging,
} from '@arus/domain';

import { businessDateInTimeZone } from '../lib/business-date.js';
import {
  ReceivablesRepositoryConflictError,
  type DebtorMutationValues,
  type DebtorRecord,
  type InvoiceCalculationRecord,
  type InvoiceDetailRecord,
  type ReceivablesRepository,
} from '../repositories/receivables.repository.js';
import type { AuthContext } from './auth.service.js';

const MAX_DERIVATION_CANDIDATES = 10_000;

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface DebtorView {
  id: string;
  code: string | null;
  name: string;
  contactName: string | null;
  phoneNumber: string | null;
  email: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceView {
  id: string;
  debtor: { id: string; code: string | null; name: string };
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  originalAmount: string;
  allocatedAmount: string;
  outstandingAmount: string;
  state: InvoiceState;
  aging: InvoiceAging;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceDetailView extends InvoiceView {
  allocations: InvoiceDetailRecord['allocationHistory'];
}

export interface DebtorDetailView extends DebtorView {
  summary: {
    invoiceCount: number;
    openInvoiceCount: number;
    totalOutstanding: string;
  };
}

export interface ReceivablesServiceContract {
  listDebtors(input: {
    context: AuthContext;
    search?: string | undefined;
    page: number;
    limit: number;
  }): Promise<{ data: DebtorView[]; pagination: Pagination }>;
  getDebtor(input: {
    context: AuthContext;
    debtorId: string;
    asOfDate?: string | undefined;
  }): Promise<{ data: DebtorDetailView; asOfDate: string }>;
  createDebtor(input: {
    context: AuthContext;
    requestId: string;
    code?: string | null | undefined;
    name: string;
    contactName?: string | null | undefined;
    phoneNumber?: string | null | undefined;
    email?: string | null | undefined;
  }): Promise<DebtorView>;
  updateDebtor(input: {
    context: AuthContext;
    requestId: string;
    debtorId: string;
    code?: string | null | undefined;
    name?: string | undefined;
    contactName?: string | null | undefined;
    phoneNumber?: string | null | undefined;
    email?: string | null | undefined;
  }): Promise<DebtorView>;
  listInvoices(input: {
    context: AuthContext;
    search?: string | undefined;
    debtorId?: string | undefined;
    state?: InvoiceState | undefined;
    agingBucket?: AgingBucket | undefined;
    asOfDate?: string | undefined;
    page: number;
    limit: number;
  }): Promise<{
    data: InvoiceView[];
    pagination: Pagination;
    asOfDate: string;
  }>;
  getInvoice(input: {
    context: AuthContext;
    invoiceId: string;
    asOfDate?: string | undefined;
  }): Promise<{ data: InvoiceDetailView; asOfDate: string }>;
}

export type ReceivablesErrorCode =
  | 'DEBTOR_CODE_IN_USE'
  | 'DEBTOR_NOT_FOUND'
  | 'INVALID_AS_OF_DATE'
  | 'INVOICE_NOT_FOUND'
  | 'QUERY_TOO_BROAD';

export class ReceivablesError extends Error {
  constructor(
    readonly code: ReceivablesErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ReceivablesError';
  }
}

interface ReceivablesServiceOptions {
  repository: ReceivablesRepository;
  clock?: () => Date;
}

export class ReceivablesService implements ReceivablesServiceContract {
  private readonly clock: () => Date;

  constructor(private readonly options: ReceivablesServiceOptions) {
    this.clock = options.clock ?? (() => new Date());
  }

  async listDebtors(input: {
    context: AuthContext;
    search?: string | undefined;
    page: number;
    limit: number;
  }): Promise<{ data: DebtorView[]; pagination: Pagination }> {
    const result = await this.options.repository.listDebtors({
      organizationId: input.context.organization.id,
      ...(normalizedSearch(input.search)
        ? { search: normalizedSearch(input.search) }
        : {}),
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    });
    return {
      data: result.records.map(toDebtorView),
      pagination: pagination(input.page, input.limit, result.total),
    };
  }

  async getDebtor(input: {
    context: AuthContext;
    debtorId: string;
    asOfDate?: string | undefined;
  }): Promise<{ data: DebtorDetailView; asOfDate: string }> {
    const asOfDate = this.resolveAsOfDate(input.context, input.asOfDate);
    const record = await this.options.repository.findDebtor(
      input.context.organization.id,
      input.debtorId,
    );
    if (!record) {
      throw new ReceivablesError('DEBTOR_NOT_FOUND', 'Debtor not found');
    }

    let totalOutstanding = 0n;
    let openInvoiceCount = 0;
    for (const invoice of record.invoices) {
      const view = toInvoiceView(invoice, asOfDate);
      totalOutstanding += parseMoney(view.outstandingAmount);
      if (view.state !== InvoiceState.PAID) openInvoiceCount += 1;
    }

    return {
      data: {
        ...toDebtorView(record),
        summary: {
          invoiceCount: record.invoices.length,
          openInvoiceCount,
          totalOutstanding: formatMoney(totalOutstanding),
        },
      },
      asOfDate,
    };
  }

  async createDebtor(input: {
    context: AuthContext;
    requestId: string;
    code?: string | null | undefined;
    name: string;
    contactName?: string | null | undefined;
    phoneNumber?: string | null | undefined;
    email?: string | null | undefined;
  }): Promise<DebtorView> {
    try {
      const record = await this.options.repository.createDebtor({
        organizationId: input.context.organization.id,
        actorId: input.context.user.id,
        requestId: input.requestId,
        values: debtorValues(input),
      });
      return toDebtorView(record);
    } catch (error) {
      throw mapRepositoryError(error);
    }
  }

  async updateDebtor(input: {
    context: AuthContext;
    requestId: string;
    debtorId: string;
    code?: string | null | undefined;
    name?: string | undefined;
    contactName?: string | null | undefined;
    phoneNumber?: string | null | undefined;
    email?: string | null | undefined;
  }): Promise<DebtorView> {
    try {
      const record = await this.options.repository.updateDebtor({
        organizationId: input.context.organization.id,
        actorId: input.context.user.id,
        requestId: input.requestId,
        debtorId: input.debtorId,
        changes: debtorChanges(input),
      });
      if (!record) {
        throw new ReceivablesError('DEBTOR_NOT_FOUND', 'Debtor not found');
      }
      return toDebtorView(record);
    } catch (error) {
      throw mapRepositoryError(error);
    }
  }

  async listInvoices(input: {
    context: AuthContext;
    search?: string | undefined;
    debtorId?: string | undefined;
    state?: InvoiceState | undefined;
    agingBucket?: AgingBucket | undefined;
    asOfDate?: string | undefined;
    page: number;
    limit: number;
  }): Promise<{
    data: InvoiceView[];
    pagination: Pagination;
    asOfDate: string;
  }> {
    const asOfDate = this.resolveAsOfDate(input.context, input.asOfDate);
    const records = await this.options.repository.listInvoiceCandidates({
      organizationId: input.context.organization.id,
      ...(normalizedSearch(input.search)
        ? { search: normalizedSearch(input.search) }
        : {}),
      ...(input.debtorId ? { debtorId: input.debtorId } : {}),
      take: MAX_DERIVATION_CANDIDATES + 1,
    });
    if (records.length > MAX_DERIVATION_CANDIDATES) {
      throw new ReceivablesError(
        'QUERY_TOO_BROAD',
        'Invoice query exceeds the pilot processing limit; add a narrower filter',
      );
    }

    const derived = records
      .map((record) => toInvoiceView(record, asOfDate))
      .filter((invoice) => !input.state || invoice.state === input.state)
      .filter(
        (invoice) =>
          !input.agingBucket || invoice.aging.bucket === input.agingBucket,
      );
    const start = (input.page - 1) * input.limit;
    return {
      data: derived.slice(start, start + input.limit),
      pagination: pagination(input.page, input.limit, derived.length),
      asOfDate,
    };
  }

  async getInvoice(input: {
    context: AuthContext;
    invoiceId: string;
    asOfDate?: string | undefined;
  }): Promise<{ data: InvoiceDetailView; asOfDate: string }> {
    const asOfDate = this.resolveAsOfDate(input.context, input.asOfDate);
    const record = await this.options.repository.findInvoice(
      input.context.organization.id,
      input.invoiceId,
    );
    if (!record) {
      throw new ReceivablesError('INVOICE_NOT_FOUND', 'Invoice not found');
    }
    return {
      data: {
        ...toInvoiceView(record, asOfDate),
        allocations: record.allocationHistory,
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
        throw new ReceivablesError(
          'INVALID_AS_OF_DATE',
          'asOfDate must be a valid YYYY-MM-DD calendar date',
        );
      }
      throw error;
    }
  }
}

function toInvoiceView(
  record: InvoiceCalculationRecord,
  asOfDate: string,
): InvoiceView {
  const snapshot = calculateInvoiceSnapshot({
    originalAmount: record.originalAmount,
    allocations: record.allocations,
    dueDate: record.dueDate,
    asOfDate,
  });
  return {
    id: record.id,
    debtor: record.debtor,
    invoiceNumber: record.invoiceNumber,
    invoiceDate: record.invoiceDate,
    dueDate: record.dueDate,
    originalAmount: snapshot.originalAmount,
    allocatedAmount: snapshot.allocatedAmount,
    outstandingAmount: snapshot.outstandingAmount,
    state: snapshot.state,
    aging: snapshot.aging,
    description: record.description,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toDebtorView(record: DebtorRecord): DebtorView {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    contactName: record.contactName,
    phoneNumber: record.phoneNumber,
    email: record.email,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function debtorValues(input: {
  code?: string | null | undefined;
  name: string;
  contactName?: string | null | undefined;
  phoneNumber?: string | null | undefined;
  email?: string | null | undefined;
}): DebtorMutationValues {
  const code = normalizeNullable(input.code);
  return {
    code,
    normalizedCode: code?.toLowerCase() ?? null,
    name: input.name.trim(),
    contactName: normalizeNullable(input.contactName),
    phoneNumber: normalizeNullable(input.phoneNumber),
    email: normalizeNullable(input.email)?.toLowerCase() ?? null,
  };
}

function debtorChanges(input: {
  code?: string | null | undefined;
  name?: string | undefined;
  contactName?: string | null | undefined;
  phoneNumber?: string | null | undefined;
  email?: string | null | undefined;
}): Partial<DebtorMutationValues> {
  const changes: Partial<DebtorMutationValues> = {};
  if (input.code !== undefined) {
    const code = normalizeNullable(input.code);
    changes.code = code;
    changes.normalizedCode = code?.toLowerCase() ?? null;
  }
  if (input.name !== undefined) changes.name = input.name.trim();
  if (input.contactName !== undefined)
    changes.contactName = normalizeNullable(input.contactName);
  if (input.phoneNumber !== undefined)
    changes.phoneNumber = normalizeNullable(input.phoneNumber);
  if (input.email !== undefined)
    changes.email = normalizeNullable(input.email)?.toLowerCase() ?? null;
  return changes;
}

function normalizeNullable(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizedSearch(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function pagination(page: number, limit: number, total: number): Pagination {
  return {
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}

function mapRepositoryError(error: unknown): unknown {
  if (
    error instanceof ReceivablesRepositoryConflictError &&
    error.reason === 'DEBTOR_CODE_IN_USE'
  ) {
    return new ReceivablesError(
      'DEBTOR_CODE_IN_USE',
      'Debtor code is already in use in this organization',
    );
  }
  return error;
}
