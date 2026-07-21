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
    const service = new DashboardService({
      repository: { listInvoiceCandidates } as unknown as ReceivablesRepository,
      clock: () => new Date('2026-07-16T03:00:00.000Z'),
    });

    const result = await service.getDashboard({ context });

    expect(listInvoiceCandidates).toHaveBeenCalledWith({
      organizationId: context.organization.id,
      take: 10_001,
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
    });
  });

  it('rejects impossible calendar dates before reading source records', async () => {
    const listInvoiceCandidates = vi.fn();
    const service = new DashboardService({
      repository: { listInvoiceCandidates } as unknown as ReceivablesRepository,
    });

    await expect(
      service.getDashboard({ context, asOfDate: '2026-02-30' }),
    ).rejects.toMatchObject({
      code: 'INVALID_AS_OF_DATE',
    } satisfies Partial<DashboardError>);
    expect(listInvoiceCandidates).not.toHaveBeenCalled();
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
