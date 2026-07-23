import { describe, expect, it, vi } from 'vitest';

import { MembershipRole } from '../generated/prisma/enums.js';
import {
  PaymentRepositoryConflictError,
  PaymentRepositoryValidationError,
  type PaymentRecord,
  type PaymentRepository,
} from '../repositories/payment.repository.js';
import type { AuthContext } from './auth.service.js';
import { PaymentError, PaymentService } from './payment.service.js';

const now = new Date('2026-07-23T03:00:00.000Z');
const context: AuthContext = {
  sessionId: '60000000-0000-4000-8000-000000000001',
  user: {
    id: '10000000-0000-4000-8000-000000000001',
    email: 'owner@demo.arus.local',
    name: 'Demo Owner',
  },
  organization: {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Demo Indonesia',
    timezone: 'Asia/Jakarta',
  },
  role: MembershipRole.OWNER,
};

describe('payment service', () => {
  it('passes canonical money, business date, and trusted actor context', async () => {
    const createInvoicePayment = vi.fn().mockResolvedValue({
      record: paymentRecord(),
      invoice: {
        id: invoiceId,
        invoiceNumber: 'INV-2026-0074',
        originalAmount: '315000000.00',
        allocatedAmount: '5000000.00',
        outstandingAmount: '310000000.00',
        state: 'PARTIALLY_PAID',
      },
      fulfilledPromiseIds: [],
      replayed: false,
    });

    const result = await testService({
      createInvoicePayment,
    }).recordInvoicePayment({
      context,
      requestId: 'request-payment-1',
      invoiceId,
      operationKey: operationKey,
      paymentDate: '2026-07-23',
      amount: '5000000',
      payerReference: 'PT Sinar Makmur transfer',
      bankReference: 'BCA-240723-01',
    });

    expect(createInvoicePayment).toHaveBeenCalledWith({
      organizationId: context.organization.id,
      invoiceId,
      actorId: context.user.id,
      operationKey,
      requestId: 'request-payment-1',
      occurredAt: now,
      paymentDate: '2026-07-23',
      amount: '5000000.00',
      payerReference: 'PT Sinar Makmur transfer',
      bankReference: 'BCA-240723-01',
    });
    expect(result).toMatchObject({
      replayed: false,
      data: { amount: '5000000.00' },
      invoice: {
        outstandingAmount: '310000000.00',
        state: 'PARTIALLY_PAID',
      },
    });
  });

  it('rejects invalid money and a future date before persistence', async () => {
    const createInvoicePayment = vi.fn();
    const service = testService({ createInvoicePayment });
    const base = {
      context,
      requestId: 'request-payment-2',
      invoiceId,
      operationKey,
      paymentDate: '2026-07-23',
      amount: '1.00',
      payerReference: 'Customer transfer',
      bankReference: null,
    };

    await expect(
      service.recordInvoicePayment({ ...base, amount: '0.00' }),
    ).rejects.toMatchObject({
      code: 'INVALID_PAYMENT_AMOUNT',
    } satisfies Partial<PaymentError>);
    await expect(
      service.recordInvoicePayment({
        ...base,
        paymentDate: '2026-07-24',
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_PAYMENT_DATE',
    } satisfies Partial<PaymentError>);
    expect(createInvoicePayment).not.toHaveBeenCalled();
  });

  it('validates list date ranges before querying', async () => {
    const listPayments = vi.fn();
    await expect(
      testService({ listPayments }).listPayments({
        context,
        from: '2026-07-24',
        to: '2026-07-23',
        page: 1,
        limit: 25,
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_DATE_RANGE',
    } satisfies Partial<PaymentError>);
    expect(listPayments).not.toHaveBeenCalled();
  });

  it('maps repository conflicts without leaking persistence details', async () => {
    const base = {
      context,
      requestId: 'request-payment-3',
      invoiceId,
      operationKey,
      paymentDate: '2026-07-23',
      amount: '1.00',
      payerReference: 'Customer transfer',
      bankReference: null,
    };

    await expect(
      testService({
        createInvoicePayment: vi
          .fn()
          .mockRejectedValue(
            new PaymentRepositoryValidationError(
              'AMOUNT_EXCEEDS_OUTSTANDING',
              'Payment exceeds outstanding',
            ),
          ),
      }).recordInvoicePayment(base),
    ).rejects.toMatchObject({
      code: 'PAYMENT_EXCEEDS_OUTSTANDING',
    } satisfies Partial<PaymentError>);
    await expect(
      testService({
        createInvoicePayment: vi
          .fn()
          .mockRejectedValue(
            new PaymentRepositoryConflictError('IDEMPOTENCY_CONFLICT'),
          ),
      }).recordInvoicePayment(base),
    ).rejects.toMatchObject({
      code: 'PAYMENT_IDEMPOTENCY_CONFLICT',
    } satisfies Partial<PaymentError>);
  });

  it('returns tenant-scoped list pagination and hides absent records', async () => {
    const record = paymentRecord();
    const listPayments = vi.fn().mockResolvedValue({
      records: [record],
      total: 1,
    });
    const service = testService({
      listPayments,
      findPayment: vi.fn().mockResolvedValue(null),
    });

    await expect(
      service.listPayments({ context, page: 2, limit: 10 }),
    ).resolves.toMatchObject({
      data: [{ id: record.id }],
      pagination: { page: 2, limit: 10, total: 1, totalPages: 1 },
    });
    expect(listPayments).toHaveBeenCalledWith({
      organizationId: context.organization.id,
      skip: 10,
      take: 10,
    });
    await expect(
      service.getPayment({ context, paymentId: record.id }),
    ).rejects.toMatchObject({
      code: 'PAYMENT_NOT_FOUND',
    } satisfies Partial<PaymentError>);
  });
});

const invoiceId = '30000000-0000-4000-8000-000000000002';
const operationKey = 'a0000000-0000-4000-8000-000000000001';

function testService(repository: Partial<PaymentRepository>): PaymentService {
  return new PaymentService({
    repository: repository as PaymentRepository,
    clock: () => now,
  });
}

function paymentRecord(): PaymentRecord {
  return {
    id: '40000000-0000-4000-8000-000000000010',
    debtor: {
      id: '20000000-0000-4000-8000-000000000002',
      code: 'CUST-002',
      name: 'PT Sinar Makmur',
    },
    paymentDate: '2026-07-23',
    amount: '5000000.00',
    payerReference: 'PT Sinar Makmur transfer',
    bankReference: 'BCA-240723-01',
    isOpeningBalance: false,
    createdBy: { id: context.user.id, name: context.user.name },
    allocations: [
      {
        id: '50000000-0000-4000-8000-000000000010',
        amount: '5000000.00',
        allocationDate: '2026-07-23',
        reversedAt: null,
        reversalReason: null,
        invoice: { id: invoiceId, invoiceNumber: 'INV-2026-0074' },
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}
