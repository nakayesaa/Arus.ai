import { describe, expect, it, vi } from 'vitest';

import type {
  ReportRepository,
  ReportSnapshotRecord,
} from '../repositories/report.repository.js';
import type { AuthContext } from './auth.service.js';
import { ReportError, ReportService } from './report.service.js';

const reportId = 'a0000000-0000-4000-8000-000000000001';
const generatedAt = new Date('2026-07-23T08:00:00.000Z');
const context: AuthContext = {
  sessionId: '70000000-0000-4000-8000-000000000001',
  user: {
    id: '10000000-0000-4000-8000-000000000001',
    email: 'owner@example.test',
    name: 'Owner',
  },
  organization: {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Example',
    timezone: 'Asia/Jakarta',
  },
  role: 'OWNER',
};

describe('ReportService', () => {
  it('builds a tenant-scoped report and audits non-sensitive generation data', async () => {
    const snapshot = reportSnapshot();
    const repository = repositoryDouble(snapshot);
    const service = new ReportService({
      repository,
      clock: () => generatedAt,
      idFactory: () => reportId,
    });

    const result = await service.generateWeeklyReport({
      context,
      requestId: 'request-report-1',
      from: '2026-07-17',
      to: '2026-07-23',
    });

    expect(repository.readWeeklySnapshot).toHaveBeenCalledWith({
      organizationId: context.organization.id,
      throughDate: '2026-07-23',
      invoiceTake: 10_001,
      workflowTake: 50_001,
    });
    expect(repository.recordGenerated).toHaveBeenCalledWith({
      organizationId: context.organization.id,
      actorId: context.user.id,
      reportId,
      requestId: 'request-report-1',
      from: '2026-07-17',
      to: '2026-07-23',
      generatedAt,
      sourceCounts: { invoices: 1, promises: 1, disputes: 1 },
    });
    expect(result.data).toMatchObject({
      reportId,
      period: {
        from: '2026-07-17',
        to: '2026-07-23',
        inclusiveDayCount: 7,
      },
      generatedAt: generatedAt.toISOString(),
      timeZone: 'Asia/Jakarta',
      summary: {
        totalAr: '750.00',
        totalOverdue: '750.00',
      },
      collections: { amount: '250.00', allocationCount: 1 },
      promises: {
        broken: { count: 1, amount: '300.00' },
      },
      disputes: {
        openInvoiceCount: 1,
        outstandingAmount: '750.00',
      },
    });
  });

  it.each([
    {
      from: '2026-07-24',
      to: '2026-07-23',
      code: 'INVALID_REPORT_PERIOD',
    },
    {
      from: '2025-01-01',
      to: '2026-07-23',
      code: 'REPORT_RANGE_TOO_LONG',
    },
    {
      from: '2026-02-30',
      to: '2026-07-23',
      code: 'INVALID_REPORT_PERIOD',
    },
  ] as const)(
    'rejects an invalid period before reading data ($code)',
    async ({ from, to, code }) => {
      const repository = repositoryDouble(reportSnapshot());
      const service = new ReportService({ repository });

      await expect(
        service.generateWeeklyReport({
          context,
          requestId: 'request-invalid',
          from,
          to,
        }),
      ).rejects.toMatchObject({ code } satisfies Partial<ReportError>);
      expect(repository.readWeeklySnapshot).not.toHaveBeenCalled();
      expect(repository.recordGenerated).not.toHaveBeenCalled();
    },
  );
});

function reportSnapshot(): ReportSnapshotRecord {
  return {
    invoices: [
      {
        id: '30000000-0000-4000-8000-000000000001',
        invoiceNumber: 'INV-001',
        invoiceDate: '2026-06-01',
        dueDate: '2026-07-15',
        originalAmount: '1000.00',
        debtor: {
          id: '20000000-0000-4000-8000-000000000001',
          code: 'CUST-001',
          name: 'PT Example',
        },
        allocations: [
          {
            amount: '250.00',
            allocationDate: '2026-07-17',
            reversedAt: null,
          },
        ],
      },
    ],
    promises: [
      {
        amount: '300.00',
        promiseDate: '2026-07-16',
        createdAt: new Date('2026-07-15T16:30:00.000Z'),
        fulfilledAt: null,
        cancelledAt: null,
      },
    ],
    disputes: [
      {
        invoiceId: '30000000-0000-4000-8000-000000000001',
        createdAt: new Date('2026-07-16T17:30:00.000Z'),
        resolvedAt: null,
      },
    ],
  };
}

function repositoryDouble(snapshot: ReportSnapshotRecord): ReportRepository {
  return {
    readWeeklySnapshot: vi.fn(async () => snapshot),
    recordGenerated: vi.fn(async () => undefined),
  };
}
