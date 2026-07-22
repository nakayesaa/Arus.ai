import { AgingBucket, InvoiceFlag, InvoiceState } from '@arus/domain';
import { describe, expect, it } from 'vitest';

import { MembershipRole } from '../generated/prisma/enums.js';
import {
  ReceivablesRepositoryConflictError,
  type DebtorDetailRecord,
  type DebtorMutationValues,
  type DebtorRecord,
  type InvoiceCalculationRecord,
  type InvoiceDetailRecord,
  type ReceivablesRepository,
} from '../repositories/receivables.repository.js';
import type { AuthContext } from './auth.service.js';
import { ReceivablesError, ReceivablesService } from './receivables.service.js';

const now = new Date('2026-07-16T03:00:00.000Z');
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

const debtor: DebtorRecord = {
  id: '20000000-0000-4000-8000-000000000001',
  code: 'CUST-001',
  name: 'PT Sinar Abadi Retail',
  contactName: 'Andi Saputra',
  phoneNumber: '+62 812 1000 0001',
  email: 'finance@sinar-abadi.example',
  createdAt: now,
  updatedAt: now,
};

const partialInvoice = invoiceRecord({
  id: '30000000-0000-4000-8000-000000000001',
  invoiceNumber: 'INV-2026-0418',
  dueDate: '2026-05-30',
  originalAmount: '185000000.00',
  allocations: [
    { amount: '50000000.00', reversed: false },
    { amount: '25000000.00', reversed: true },
  ],
});
const paidInvoice = invoiceRecord({
  id: '30000000-0000-4000-8000-000000000002',
  invoiceNumber: 'INV-2026-0020',
  dueDate: '2026-04-16',
  originalAmount: '50000000.00',
  allocations: [{ amount: '50000000.00', reversed: false }],
});

class FakeReceivablesRepository implements ReceivablesRepository {
  invoices: InvoiceCalculationRecord[] = [partialInvoice, paidInvoice];
  debtorRecord: DebtorDetailRecord | null = {
    ...debtor,
    invoices: this.invoices,
  };
  invoiceRecord: InvoiceDetailRecord | null = {
    ...partialInvoice,
    allocationHistory: [],
    communications: [],
  };
  conflict = false;
  createdInput: {
    organizationId: string;
    actorId: string;
    requestId: string;
    values: DebtorMutationValues;
  } | null = null;
  lastInvoiceOrganizationId: string | null = null;

  async listDebtors(): Promise<{
    records: DebtorRecord[];
    total: number;
  }> {
    return { records: [debtor], total: 1 };
  }

  async findDebtor(): Promise<DebtorDetailRecord | null> {
    return this.debtorRecord;
  }

  async createDebtor(input: {
    organizationId: string;
    actorId: string;
    requestId: string;
    values: DebtorMutationValues;
  }): Promise<DebtorRecord> {
    if (this.conflict) {
      throw new ReceivablesRepositoryConflictError('DEBTOR_CODE_IN_USE');
    }
    this.createdInput = input;
    return { ...debtor, ...input.values };
  }

  async updateDebtor(): Promise<DebtorRecord | null> {
    return debtor;
  }

  async listInvoiceCandidates(input: {
    organizationId: string;
    debtorIds?: readonly string[] | undefined;
  }): Promise<InvoiceCalculationRecord[]> {
    this.lastInvoiceOrganizationId = input.organizationId;
    return input.debtorIds
      ? this.invoices.filter((invoice) =>
          input.debtorIds?.includes(invoice.debtor.id),
        )
      : this.invoices;
  }

  async listCollectionQueueCandidates(): Promise<[]> {
    return [];
  }

  async findInvoice(): Promise<InvoiceDetailRecord | null> {
    return this.invoiceRecord;
  }
}

describe('ReceivablesService', () => {
  it('derives exact invoice values and filters after domain evaluation', async () => {
    const repository = new FakeReceivablesRepository();
    const service = testService(repository);

    const result = await service.listInvoices({
      context,
      state: InvoiceState.PARTIALLY_PAID,
      agingBucket: AgingBucket.OVERDUE_31_60,
      page: 1,
      limit: 25,
    });

    expect(repository.lastInvoiceOrganizationId).toBe(context.organization.id);
    expect(result.asOfDate).toBe('2026-07-16');
    expect(result.pagination).toEqual({
      page: 1,
      limit: 25,
      total: 1,
      totalPages: 1,
    });
    expect(result.data[0]).toMatchObject({
      allocatedAmount: '50000000.00',
      outstandingAmount: '135000000.00',
      state: InvoiceState.PARTIALLY_PAID,
      aging: {
        bucket: AgingBucket.OVERDUE_31_60,
        daysOverdue: 47,
        flags: [InvoiceFlag.OVERDUE],
      },
    });
  });

  it('returns immutable communication facts with a current workflow suggestion', async () => {
    const repository = new FakeReceivablesRepository();
    repository.invoiceRecord = {
      ...repository.invoiceRecord!,
      communications: [
        {
          id: '70000000-0000-4000-8000-000000000001',
          occurredAt: new Date('2026-07-15T04:30:00.000Z'),
          channel: 'CALL',
          notes: 'Accounts payable confirmed review.',
          nextFollowUpDate: '2026-07-17',
          actor: {
            id: context.user.id,
            name: context.user.name,
            role: MembershipRole.OWNER,
          },
          createdAt: new Date('2026-07-15T04:30:00.000Z'),
          updatedAt: new Date('2026-07-15T04:30:00.000Z'),
        },
      ],
    };
    const result = await testService(repository).getInvoice({
      context,
      invoiceId: partialInvoice.id,
      asOfDate: '2026-07-10',
    });

    expect(result.asOfDate).toBe('2026-07-10');
    expect(result.workflowBusinessDate).toBe('2026-07-16');
    expect(result.data.nextFollowUpSuggestion).toEqual({
      date: '2026-07-17',
      basis: 'STANDARD_NEXT_DAY',
    });
    expect(result.data.communications[0]).toMatchObject({
      occurredAt: '2026-07-15T04:30:00.000Z',
      channel: 'CALL',
      actor: { role: 'OWNER' },
    });
  });

  it('reconciles debtor summary from invoice source records', async () => {
    const service = testService(new FakeReceivablesRepository());

    const result = await service.getDebtor({ context, debtorId: debtor.id });

    expect(result.data.summary).toEqual({
      invoiceCount: 2,
      openInvoiceCount: 1,
      totalOutstanding: '135000000.00',
      overdueOutstanding: '135000000.00',
    });
    expect(result.data.invoices).toHaveLength(2);
  });

  it('returns exact debtor list summaries for the requested business date', async () => {
    const service = testService(new FakeReceivablesRepository());

    const result = await service.listDebtors({
      context,
      asOfDate: '2026-07-16',
      page: 1,
      limit: 25,
    });

    expect(result.asOfDate).toBe('2026-07-16');
    expect(result.data).toEqual([
      expect.objectContaining({
        id: debtor.id,
        summary: {
          invoiceCount: 2,
          openInvoiceCount: 1,
          totalOutstanding: '135000000.00',
          overdueOutstanding: '135000000.00',
        },
      }),
    ]);
  });

  it('normalizes debtor identity at the service boundary', async () => {
    const repository = new FakeReceivablesRepository();
    const service = testService(repository);

    await service.createDebtor({
      context,
      requestId: 'request-1',
      code: ' Customer-99 ',
      name: ' New Debtor ',
      contactName: ' Finance Team ',
      email: 'AR@EXAMPLE.COM',
    });

    expect(repository.createdInput).toEqual({
      organizationId: context.organization.id,
      actorId: context.user.id,
      requestId: 'request-1',
      values: {
        code: 'Customer-99',
        normalizedCode: 'customer-99',
        name: 'New Debtor',
        normalizedName: 'new debtor',
        contactName: 'Finance Team',
        phoneNumber: null,
        email: 'ar@example.com',
      },
    });
  });

  it('maps tenant-scoped code conflicts without leaking another debtor', async () => {
    const repository = new FakeReceivablesRepository();
    repository.conflict = true;
    const service = testService(repository);

    await expect(
      service.createDebtor({
        context,
        requestId: 'request-2',
        code: debtor.code,
        name: debtor.name,
      }),
    ).rejects.toEqual(
      new ReceivablesError(
        'DEBTOR_CODE_IN_USE',
        'Debtor code is already in use in this organization',
      ),
    );
  });

  it('rejects impossible business dates before querying data', async () => {
    const service = testService(new FakeReceivablesRepository());

    await expect(
      service.listInvoices({
        context,
        asOfDate: '2026-02-29',
        page: 1,
        limit: 25,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_AS_OF_DATE' });
  });

  it('refuses silently truncated derived queries', async () => {
    const repository = new FakeReceivablesRepository();
    repository.invoices = Array.from({ length: 10_001 }, () => partialInvoice);
    const service = testService(repository);

    await expect(
      service.listInvoices({ context, page: 1, limit: 25 }),
    ).rejects.toMatchObject({ code: 'QUERY_TOO_BROAD' });
  });
});

function testService(repository: ReceivablesRepository): ReceivablesService {
  return new ReceivablesService({ repository, clock: () => now });
}

function invoiceRecord(input: {
  id: string;
  invoiceNumber: string;
  dueDate: string;
  originalAmount: string;
  allocations: InvoiceCalculationRecord['allocations'];
}): InvoiceCalculationRecord {
  return {
    id: input.id,
    debtor: { id: debtor.id, code: debtor.code, name: debtor.name },
    invoiceNumber: input.invoiceNumber,
    invoiceDate: '2026-04-30',
    dueDate: input.dueDate,
    originalAmount: input.originalAmount,
    description: null,
    allocations: input.allocations,
    createdAt: now,
    updatedAt: now,
  };
}
