import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import {
  DisputeStatus,
  type DisputeCategory,
  type MembershipRole,
} from '../generated/prisma/enums.js';
import { lockInvoice } from '../lib/invoice-lock.js';

export interface DisputeRecord {
  id: string;
  invoiceId: string;
  category: DisputeCategory;
  details: string;
  status: DisputeStatus;
  resolutionNote: string | null;
  createdBy: { id: string; name: string; role: MembershipRole };
  resolvedBy: { id: string; name: string; role: MembershipRole } | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DisputeWriteResult {
  record: DisputeRecord;
  replayed: boolean;
}

export interface DisputeRepository {
  createDispute(input: {
    organizationId: string;
    invoiceId: string;
    actorId: string;
    actorRole: MembershipRole;
    operationKey: string;
    requestId: string;
    occurredAt: Date;
    category: DisputeCategory;
    details: string;
  }): Promise<DisputeWriteResult | null>;
  resolveDispute(input: {
    organizationId: string;
    disputeId: string;
    actorId: string;
    actorRole: MembershipRole;
    operationKey: string;
    requestId: string;
    occurredAt: Date;
    resolutionNote: string | null;
  }): Promise<DisputeWriteResult | null>;
}

export class DisputeRepositoryConflictError extends Error {
  constructor(readonly reason: 'DISPUTE_RESOLVED' | 'IDEMPOTENCY_CONFLICT') {
    super(reason);
    this.name = 'DisputeRepositoryConflictError';
  }
}

export class PrismaDisputeRepository implements DisputeRepository {
  constructor(private readonly database: PrismaClient) {}

  async createDispute(input: {
    organizationId: string;
    invoiceId: string;
    actorId: string;
    actorRole: MembershipRole;
    operationKey: string;
    requestId: string;
    occurredAt: Date;
    category: DisputeCategory;
    details: string;
  }): Promise<DisputeWriteResult | null> {
    try {
      const record = await this.database.$transaction(
        async (transaction) => {
          await lockInvoice(transaction, input.invoiceId);
          const invoice = await transaction.invoice.findFirst({
            where: {
              id: input.invoiceId,
              organizationId: input.organizationId,
              deletedAt: null,
            },
            select: { id: true },
          });
          if (!invoice) return null;

          const dispute = await transaction.dispute.create({
            data: {
              organizationId: input.organizationId,
              invoiceId: input.invoiceId,
              category: input.category,
              details: input.details,
              createdById: input.actorId,
              createdByRole: input.actorRole,
              operationKey: input.operationKey,
              createdAt: input.occurredAt,
            },
            select: disputeSelect,
          });
          await transaction.auditLog.create({
            data: {
              organizationId: input.organizationId,
              actorId: input.actorId,
              action: 'DISPUTE_CREATED',
              entityType: 'Dispute',
              entityId: dispute.id,
              requestId: input.requestId,
              metadata: {
                invoiceId: input.invoiceId,
                category: input.category,
              },
            },
          });
          return toDisputeRecord(dispute);
        },
        { isolationLevel: 'ReadCommitted' },
      );
      return record ? { record, replayed: false } : null;
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      return this.recoverCreateReplay(input);
    }
  }

  async resolveDispute(input: {
    organizationId: string;
    disputeId: string;
    actorId: string;
    actorRole: MembershipRole;
    operationKey: string;
    requestId: string;
    occurredAt: Date;
    resolutionNote: string | null;
  }): Promise<DisputeWriteResult | null> {
    try {
      return await this.database.$transaction(
        async (transaction) => {
          const candidate = await transaction.dispute.findFirst({
            where: {
              id: input.disputeId,
              organizationId: input.organizationId,
            },
            select: { invoiceId: true },
          });
          if (!candidate) return null;
          await lockInvoice(transaction, candidate.invoiceId);

          const dispute = await transaction.dispute.findFirst({
            where: {
              id: input.disputeId,
              organizationId: input.organizationId,
            },
            select: { ...disputeSelect, resolutionOperationKey: true },
          });
          if (!dispute) return null;
          if (dispute.status === DisputeStatus.RESOLVED) {
            if (
              dispute.resolutionOperationKey === input.operationKey &&
              dispute.resolutionNote === input.resolutionNote &&
              dispute.resolvedBy?.id === input.actorId
            ) {
              return { record: toDisputeRecord(dispute), replayed: true };
            }
            throw new DisputeRepositoryConflictError('DISPUTE_RESOLVED');
          }

          const resolved = await transaction.dispute.update({
            where: { id: input.disputeId },
            data: {
              status: DisputeStatus.RESOLVED,
              resolvedById: input.actorId,
              resolvedByRole: input.actorRole,
              resolvedAt: input.occurredAt,
              resolutionNote: input.resolutionNote,
              resolutionOperationKey: input.operationKey,
            },
            select: disputeSelect,
          });
          await transaction.auditLog.create({
            data: {
              organizationId: input.organizationId,
              actorId: input.actorId,
              action: 'DISPUTE_RESOLVED',
              entityType: 'Dispute',
              entityId: resolved.id,
              requestId: input.requestId,
              metadata: { invoiceId: resolved.invoiceId },
            },
          });
          return { record: toDisputeRecord(resolved), replayed: false };
        },
        { isolationLevel: 'ReadCommitted' },
      );
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      return this.recoverResolutionReplay(input);
    }
  }

  private async recoverCreateReplay(input: {
    organizationId: string;
    invoiceId: string;
    actorId: string;
    operationKey: string;
    category: DisputeCategory;
    details: string;
  }): Promise<DisputeWriteResult> {
    const existing = await this.database.dispute.findUnique({
      where: {
        organizationId_operationKey: {
          organizationId: input.organizationId,
          operationKey: input.operationKey,
        },
      },
      select: disputeSelect,
    });
    if (
      !existing ||
      existing.invoiceId !== input.invoiceId ||
      existing.createdBy.id !== input.actorId ||
      existing.category !== input.category ||
      existing.details !== input.details
    ) {
      throw new DisputeRepositoryConflictError('IDEMPOTENCY_CONFLICT');
    }
    return { record: toDisputeRecord(existing), replayed: true };
  }

  private async recoverResolutionReplay(input: {
    organizationId: string;
    disputeId: string;
    actorId: string;
    operationKey: string;
    resolutionNote: string | null;
  }): Promise<DisputeWriteResult> {
    const existing = await this.database.dispute.findFirst({
      where: {
        organizationId: input.organizationId,
        resolutionOperationKey: input.operationKey,
      },
      select: disputeSelect,
    });
    if (
      !existing ||
      existing.id !== input.disputeId ||
      existing.resolvedBy?.id !== input.actorId ||
      existing.resolutionNote !== input.resolutionNote
    ) {
      throw new DisputeRepositoryConflictError('IDEMPOTENCY_CONFLICT');
    }
    return { record: toDisputeRecord(existing), replayed: true };
  }
}

const disputeSelect = {
  id: true,
  invoiceId: true,
  category: true,
  details: true,
  status: true,
  resolutionNote: true,
  createdByRole: true,
  createdBy: { select: { id: true, name: true } },
  resolvedByRole: true,
  resolvedBy: { select: { id: true, name: true } },
  resolvedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DisputeSelect;

function toDisputeRecord(record: {
  id: string;
  invoiceId: string;
  category: DisputeCategory;
  details: string;
  status: DisputeStatus;
  resolutionNote: string | null;
  createdByRole: MembershipRole;
  createdBy: { id: string; name: string };
  resolvedByRole: MembershipRole | null;
  resolvedBy: { id: string; name: string } | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): DisputeRecord {
  return {
    id: record.id,
    invoiceId: record.invoiceId,
    category: record.category,
    details: record.details,
    status: record.status,
    resolutionNote: record.resolutionNote,
    createdBy: { ...record.createdBy, role: record.createdByRole },
    resolvedBy:
      record.resolvedBy && record.resolvedByRole
        ? { ...record.resolvedBy, role: record.resolvedByRole }
        : null,
    resolvedAt: record.resolvedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
