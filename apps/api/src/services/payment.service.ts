import {
  differenceInCalendarDays,
  DomainError,
  formatMoney,
  parseBusinessDate,
  parseMoney,
  validatePaymentDate,
} from '@arus/domain';

import { businessDateInTimeZone } from '../lib/business-date.js';
import {
  PaymentRepositoryConflictError,
  PaymentRepositoryValidationError,
  type PaymentRecord,
  type PaymentRepository,
} from '../repositories/payment.repository.js';
import type { AuthContext } from './auth.service.js';

export interface PaymentView {
  id: string;
  debtor: PaymentRecord['debtor'];
  paymentDate: string;
  amount: string;
  payerReference: string | null;
  bankReference: string | null;
  isOpeningBalance: boolean;
  createdBy: PaymentRecord['createdBy'];
  allocations: PaymentRecord['allocations'];
  createdAt: string;
  updatedAt: string;
}

export interface PaymentServiceContract {
  listPayments(input: {
    context: AuthContext;
    from?: string | undefined;
    to?: string | undefined;
    page: number;
    limit: number;
  }): Promise<{
    data: PaymentView[];
    pagination: PaymentPagination;
  }>;
  getPayment(input: {
    context: AuthContext;
    paymentId: string;
  }): Promise<{ data: PaymentView }>;
  recordInvoicePayment(input: {
    context: AuthContext;
    requestId: string;
    invoiceId: string;
    operationKey: string;
    paymentDate: string;
    amount: string;
    payerReference: string;
    bankReference: string | null;
  }): Promise<{
    data: PaymentView;
    invoice: {
      id: string;
      invoiceNumber: string;
      originalAmount: string;
      allocatedAmount: string;
      outstandingAmount: string;
      state: 'OPEN' | 'PARTIALLY_PAID' | 'PAID';
    };
    fulfilledPromiseIds: string[];
    replayed: boolean;
  }>;
}

export interface PaymentPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export type PaymentErrorCode =
  | 'INVOICE_ALREADY_PAID'
  | 'INVOICE_NOT_FOUND'
  | 'INVALID_DATE_RANGE'
  | 'INVALID_PAYMENT_AMOUNT'
  | 'INVALID_PAYMENT_DATE'
  | 'PAYMENT_EXCEEDS_OUTSTANDING'
  | 'PAYMENT_IDEMPOTENCY_CONFLICT'
  | 'PAYMENT_NOT_FOUND';

export class PaymentError extends Error {
  constructor(
    readonly code: PaymentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}

export class PaymentService implements PaymentServiceContract {
  private readonly clock: () => Date;

  constructor(
    private readonly options: {
      repository: PaymentRepository;
      clock?: () => Date;
    },
  ) {
    this.clock = options.clock ?? (() => new Date());
  }

  async listPayments(input: {
    context: AuthContext;
    from?: string | undefined;
    to?: string | undefined;
    page: number;
    limit: number;
  }): Promise<{ data: PaymentView[]; pagination: PaymentPagination }> {
    const range = validDateRange(input.from, input.to);
    const result = await this.options.repository.listPayments({
      organizationId: input.context.organization.id,
      ...range,
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    });
    return {
      data: result.records.map(toPaymentView),
      pagination: pagination(input.page, input.limit, result.total),
    };
  }

  async getPayment(input: {
    context: AuthContext;
    paymentId: string;
  }): Promise<{ data: PaymentView }> {
    const record = await this.options.repository.findPayment(
      input.context.organization.id,
      input.paymentId,
    );
    if (!record) {
      throw new PaymentError('PAYMENT_NOT_FOUND', 'Payment not found');
    }
    return { data: toPaymentView(record) };
  }

  async recordInvoicePayment(input: {
    context: AuthContext;
    requestId: string;
    invoiceId: string;
    operationKey: string;
    paymentDate: string;
    amount: string;
    payerReference: string;
    bankReference: string | null;
  }): Promise<{
    data: PaymentView;
    invoice: {
      id: string;
      invoiceNumber: string;
      originalAmount: string;
      allocatedAmount: string;
      outstandingAmount: string;
      state: 'OPEN' | 'PARTIALLY_PAID' | 'PAID';
    };
    fulfilledPromiseIds: string[];
    replayed: boolean;
  }> {
    const occurredAt = this.clock();
    const asOfDate = businessDateInTimeZone(
      occurredAt,
      input.context.organization.timezone,
    );
    const amount = positiveMoney(input.amount);
    const paymentDate = validPaymentDate(input.paymentDate, asOfDate);

    try {
      const result = await this.options.repository.createInvoicePayment({
        organizationId: input.context.organization.id,
        invoiceId: input.invoiceId,
        actorId: input.context.user.id,
        operationKey: input.operationKey,
        requestId: input.requestId,
        occurredAt,
        paymentDate,
        amount,
        payerReference: input.payerReference,
        bankReference: input.bankReference,
      });
      if (!result) {
        throw new PaymentError('INVOICE_NOT_FOUND', 'Invoice not found');
      }
      return {
        data: toPaymentView(result.record),
        invoice: result.invoice,
        fulfilledPromiseIds: result.fulfilledPromiseIds,
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
    if (amount <= 0n) {
      throw new PaymentError(
        'INVALID_PAYMENT_AMOUNT',
        'Payment amount must be greater than zero',
      );
    }
    return formatMoney(amount);
  } catch (error) {
    if (error instanceof PaymentError) throw error;
    throw new PaymentError(
      'INVALID_PAYMENT_AMOUNT',
      error instanceof Error ? error.message : 'Payment amount is invalid',
    );
  }
}

function validPaymentDate(value: string, asOfDate: string): string {
  try {
    return validatePaymentDate({ paymentDate: value, asOfDate });
  } catch (error) {
    if (error instanceof DomainError) {
      throw new PaymentError('INVALID_PAYMENT_DATE', error.message);
    }
    throw error;
  }
}

function validDateRange(
  from: string | undefined,
  to: string | undefined,
): { from?: string; to?: string } {
  try {
    const validFrom = from ? parseBusinessDate(from) : undefined;
    const validTo = to ? parseBusinessDate(to) : undefined;
    if (
      validFrom &&
      validTo &&
      differenceInCalendarDays(validTo, validFrom) < 0
    ) {
      throw new PaymentError(
        'INVALID_DATE_RANGE',
        'Payment date range must end on or after it starts',
      );
    }
    return {
      ...(validFrom ? { from: validFrom } : {}),
      ...(validTo ? { to: validTo } : {}),
    };
  } catch (error) {
    if (error instanceof PaymentError) throw error;
    throw new PaymentError(
      'INVALID_DATE_RANGE',
      'Payment date range must use valid YYYY-MM-DD dates',
    );
  }
}

function toPaymentView(record: PaymentRecord): PaymentView {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function pagination(
  page: number,
  limit: number,
  total: number,
): PaymentPagination {
  return {
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}

function mapRepositoryError(error: unknown): unknown {
  if (error instanceof PaymentRepositoryConflictError) {
    return new PaymentError(
      'PAYMENT_IDEMPOTENCY_CONFLICT',
      'This operation key was already used for another payment',
    );
  }
  if (!(error instanceof PaymentRepositoryValidationError)) return error;
  switch (error.reason) {
    case 'AMOUNT_EXCEEDS_OUTSTANDING':
      return new PaymentError('PAYMENT_EXCEEDS_OUTSTANDING', error.message);
    case 'INVOICE_ALREADY_PAID':
      return new PaymentError('INVOICE_ALREADY_PAID', error.message);
  }
}
