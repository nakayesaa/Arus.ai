import { describe, expect, it, vi } from 'vitest';

import {
  DisputeCategory,
  DisputeStatus,
  MembershipRole,
} from '../generated/prisma/enums.js';
import type {
  DisputeRecord,
  DisputeRepository,
} from '../repositories/dispute.repository.js';
import type { AuthContext } from './auth.service.js';
import { DisputeService } from './dispute.service.js';

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

describe('dispute service', () => {
  it('persists creation with only trusted identity and controlled time', async () => {
    const createDispute = vi.fn().mockResolvedValue({
      record: disputeRecord(),
      replayed: false,
    });
    const service = testService({ createDispute });

    const result = await service.createDispute({
      context,
      requestId: 'request-1',
      invoiceId: '30000000-0000-4000-8000-000000000001',
      operationKey: '83000000-0000-4000-8000-000000000001',
      category: DisputeCategory.WRONG_AMOUNT,
      details: 'Customer reported a tax mismatch.',
    });

    expect(createDispute).toHaveBeenCalledWith({
      organizationId: context.organization.id,
      invoiceId: '30000000-0000-4000-8000-000000000001',
      actorId: context.user.id,
      actorRole: context.role,
      operationKey: '83000000-0000-4000-8000-000000000001',
      requestId: 'request-1',
      occurredAt: now,
      category: DisputeCategory.WRONG_AMOUNT,
      details: 'Customer reported a tax mismatch.',
    });
    expect(result).toMatchObject({
      replayed: false,
      data: { status: DisputeStatus.OPEN },
    });
  });

  it('returns resolution evidence and replay state', async () => {
    const record = disputeRecord({
      status: DisputeStatus.RESOLVED,
      resolutionNote: 'Credit note approved.',
      resolvedBy: {
        id: context.user.id,
        name: context.user.name,
        role: context.role,
      },
      resolvedAt: now,
    });
    const resolveDispute = vi.fn().mockResolvedValue({
      record,
      replayed: true,
    });

    const result = await testService({ resolveDispute }).resolveDispute({
      context,
      requestId: 'request-2',
      disputeId: record.id,
      operationKey: '84000000-0000-4000-8000-000000000001',
      resolutionNote: 'Credit note approved.',
    });

    expect(result).toMatchObject({
      replayed: true,
      data: {
        status: DisputeStatus.RESOLVED,
        resolutionNote: 'Credit note approved.',
        resolvedBy: { role: MembershipRole.OWNER },
      },
    });
    expect(result.data.resolvedAt).toBe(now.toISOString());
  });
});

function testService(repository: Partial<DisputeRepository>): DisputeService {
  return new DisputeService({
    repository: repository as DisputeRepository,
    clock: () => now,
  });
}

function disputeRecord(overrides: Partial<DisputeRecord> = {}): DisputeRecord {
  return {
    id: '85000000-0000-4000-8000-000000000001',
    invoiceId: '30000000-0000-4000-8000-000000000001',
    category: DisputeCategory.WRONG_AMOUNT,
    details: 'Customer reported a tax mismatch.',
    status: DisputeStatus.OPEN,
    resolutionNote: null,
    createdBy: {
      id: context.user.id,
      name: context.user.name,
      role: context.role,
    },
    resolvedBy: null,
    resolvedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
