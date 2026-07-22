import { MembershipRole } from '../generated/prisma/enums.js';
import type {
  InvoiceCalculationRecord,
  ReceivablesRepository,
} from '../repositories/receivables.repository.js';
import type { AuthContext } from './auth.service.js';
import { DashboardError, DashboardService } from './dashboard.service.js';
import { describe, expect, it, vi } from 'vitest';

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

describe('dashboard service', () => {
  it('scopes source reads and returns exact largest overdue exposure', async () => {
    const listInvoiceCandidates = vi.fn().mockResolvedValue([
      invoice({
        id: '30000000-0000-4000-8000-000000000001',
        invoiceNumber: 'INV-PARTIAL',
        dueDate: '2026-05-30',
        originalAmount: '185000000.00',
        allocations: [{ amount: '50000000.00', reversed: false }],
      }),
      invoice({
        id: '30000000-0000-4000-8000-000000000002',
        invoiceNumber: 'INV-LARGEST',
        dueDate: '2026-07-15',
        originalAmount: '315000000.00',
      }),
    ]);
    const getCollectionCaseCounts = vi.fn().mockResolvedValue({
      brokenPromiseCount: 3,
      openDisputeCount: 2,
    });
    const service = new DashboardService({
      repository: {
        listInvoiceCandidates,
        getCollectionCaseCounts,
      } as unknown as ReceivablesRepository,
      clock: () => new Date('2026-07-16T03:00:00.000Z'),
    });

    const result = await service.getDashboard({ context });

    expect(listInvoiceCandidates).toHaveBeenCalledWith({
      organizationId: context.organization.id,
      take: 10_001,
    });
    expect(getCollectionCaseCounts).toHaveBeenCalledWith({
      organizationId: context.organization.id,
      asOfDate: '2026-07-16',
      workflowOccurredBefore: new Date('2026-07-16T17:00:00.000Z'),
    });
    expect(result).toMatchObject({
      asOfDate: '2026-07-16',
      summary: {
        totalAr: '450000000.00',
        totalOverdue: '450000000.00',
        overduePercent: '100.00',
        openInvoiceCount: 2,
        overdueInvoiceCount: 2,
      },
      largestOverdue: [
        {
          invoiceNumber: 'INV-LARGEST',
          outstandingAmount: '315000000.00',
          daysOverdue: 1,
        },
        {
          invoiceNumber: 'INV-PARTIAL',
          outstandingAmount: '135000000.00',
          daysOverdue: 47,
        },
      ],
      workflows: {
        brokenPromiseCount: 3,
        openDisputeCount: 2,
      },
    });
  });

  it('rejects impossible calendar dates before reading source records', async () => {
    const listInvoiceCandidates = vi.fn();
    const getCollectionCaseCounts = vi.fn();
    const service = new DashboardService({
      repository: {
        listInvoiceCandidates,
        getCollectionCaseCounts,
      } as unknown as ReceivablesRepository,
    });

    await expect(
      service.getDashboard({ context, asOfDate: '2026-02-30' }),
    ).rejects.toMatchObject({
      code: 'INVALID_AS_OF_DATE',
    } satisfies Partial<DashboardError>);
    expect(listInvoiceCandidates).not.toHaveBeenCalled();
    expect(getCollectionCaseCounts).not.toHaveBeenCalled();
  });

  it('returns paginated workflow cases with exact invoice exposure', async () => {
    const listCollectionCaseSummaries = vi.fn().mockResolvedValue({
      records: [
        {
          id: '90000000-0000-4000-8000-000000000001',
          kind: 'OPEN_DISPUTE',
          invoice: invoice({
            id: '30000000-0000-4000-8000-000000000005',
            invoiceNumber: 'INV-DISPUTED',
            dueDate: '2026-07-09',
            originalAmount: '75000000.00',
            allocations: [{ amount: '10000000.00', reversed: true }],
          }),
          category: 'WRONG_AMOUNT',
          details: 'Customer requested allocation reconciliation.',
          createdAt: new Date('2026-07-12T03:00:00.000Z'),
        },
      ],
      total: 12,
    });
    const service = new DashboardService({
      repository: {
        listCollectionCaseSummaries,
      } as unknown as ReceivablesRepository,
      clock: () => new Date('2026-07-16T03:00:00.000Z'),
    });

    const result = await service.listWorkflowCases({
      context,
      kind: 'OPEN_DISPUTE',
      page: 2,
      limit: 10,
    });

    expect(listCollectionCaseSummaries).toHaveBeenCalledWith({
      organizationId: context.organization.id,
      kind: 'OPEN_DISPUTE',
      asOfDate: '2026-07-16',
      workflowOccurredBefore: new Date('2026-07-16T17:00:00.000Z'),
      skip: 10,
      take: 10,
    });
    expect(result).toEqual({
      data: [
        {
          id: '90000000-0000-4000-8000-000000000001',
          kind: 'OPEN_DISPUTE',
          invoice: {
            id: '30000000-0000-4000-8000-000000000005',
            invoiceNumber: 'INV-DISPUTED',
            debtor: {
              id: '20000000-0000-4000-8000-000000000001',
              code: 'CUST-001',
              name: 'PT Sinar Abadi Retail',
            },
            dueDate: '2026-07-09',
            outstandingAmount: '75000000.00',
          },
          createdAt: '2026-07-12T03:00:00.000Z',
          dispute: {
            category: 'WRONG_AMOUNT',
            details: 'Customer requested allocation reconciliation.',
          },
        },
      ],
      pagination: { page: 2, limit: 10, total: 12, totalPages: 2 },
      asOfDate: '2026-07-16',
    });
  });
});

function invoice(input: {
  id: string;
  invoiceNumber: string;
  dueDate: string;
  originalAmount: string;
  allocations?: Array<{ amount: string; reversed: boolean }>;
}): InvoiceCalculationRecord {
  return {
    id: input.id,
    debtor: {
      id: '20000000-0000-4000-8000-000000000001',
      code: 'CUST-001',
      name: 'PT Sinar Abadi Retail',
    },
    invoiceNumber: input.invoiceNumber,
    invoiceDate: '2026-04-30',
    dueDate: input.dueDate,
    originalAmount: input.originalAmount,
    description: null,
    allocations: input.allocations ?? [],
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
  };
}
