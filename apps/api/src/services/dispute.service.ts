import type {
  DisputeCategory,
  DisputeStatus,
} from '../generated/prisma/enums.js';
import {
  DisputeRepositoryConflictError,
  type DisputeRecord,
  type DisputeRepository,
} from '../repositories/dispute.repository.js';
import type { AuthContext } from './auth.service.js';

export interface DisputeView {
  id: string;
  invoiceId: string;
  category: DisputeCategory;
  details: string;
  status: DisputeStatus;
  resolutionNote: string | null;
  createdBy: DisputeRecord['createdBy'];
  resolvedBy: DisputeRecord['resolvedBy'];
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DisputeServiceContract {
  createDispute(input: {
    context: AuthContext;
    requestId: string;
    invoiceId: string;
    operationKey: string;
    category: DisputeCategory;
    details: string;
  }): Promise<{ data: DisputeView; replayed: boolean }>;
  resolveDispute(input: {
    context: AuthContext;
    requestId: string;
    disputeId: string;
    operationKey: string;
    resolutionNote: string | null;
  }): Promise<{ data: DisputeView; replayed: boolean }>;
}

export type DisputeErrorCode =
  | 'DISPUTE_IDEMPOTENCY_CONFLICT'
  | 'DISPUTE_NOT_FOUND'
  | 'DISPUTE_RESOLVED'
  | 'INVOICE_NOT_FOUND';

export class DisputeError extends Error {
  constructor(
    readonly code: DisputeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DisputeError';
  }
}

export class DisputeService implements DisputeServiceContract {
  private readonly clock: () => Date;

  constructor(
    private readonly options: {
      repository: DisputeRepository;
      clock?: () => Date;
    },
  ) {
    this.clock = options.clock ?? (() => new Date());
  }

  async createDispute(input: {
    context: AuthContext;
    requestId: string;
    invoiceId: string;
    operationKey: string;
    category: DisputeCategory;
    details: string;
  }): Promise<{ data: DisputeView; replayed: boolean }> {
    try {
      const result = await this.options.repository.createDispute({
        organizationId: input.context.organization.id,
        invoiceId: input.invoiceId,
        actorId: input.context.user.id,
        actorRole: input.context.role,
        operationKey: input.operationKey,
        requestId: input.requestId,
        occurredAt: this.clock(),
        category: input.category,
        details: input.details,
      });
      if (!result) {
        throw new DisputeError('INVOICE_NOT_FOUND', 'Invoice not found');
      }
      return { data: toDisputeView(result.record), replayed: result.replayed };
    } catch (error) {
      throw mapRepositoryError(error);
    }
  }

  async resolveDispute(input: {
    context: AuthContext;
    requestId: string;
    disputeId: string;
    operationKey: string;
    resolutionNote: string | null;
  }): Promise<{ data: DisputeView; replayed: boolean }> {
    try {
      const result = await this.options.repository.resolveDispute({
        organizationId: input.context.organization.id,
        disputeId: input.disputeId,
        actorId: input.context.user.id,
        actorRole: input.context.role,
        operationKey: input.operationKey,
        requestId: input.requestId,
        occurredAt: this.clock(),
        resolutionNote: input.resolutionNote,
      });
      if (!result) {
        throw new DisputeError('DISPUTE_NOT_FOUND', 'Dispute not found');
      }
      return { data: toDisputeView(result.record), replayed: result.replayed };
    } catch (error) {
      throw mapRepositoryError(error);
    }
  }
}

function toDisputeView(record: DisputeRecord): DisputeView {
  return {
    id: record.id,
    invoiceId: record.invoiceId,
    category: record.category,
    details: record.details,
    status: record.status,
    resolutionNote: record.resolutionNote,
    createdBy: record.createdBy,
    resolvedBy: record.resolvedBy,
    resolvedAt: record.resolvedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function mapRepositoryError(error: unknown): unknown {
  if (!(error instanceof DisputeRepositoryConflictError)) return error;
  switch (error.reason) {
    case 'DISPUTE_RESOLVED':
      return new DisputeError(
        'DISPUTE_RESOLVED',
        'This dispute is already resolved',
      );
    case 'IDEMPOTENCY_CONFLICT':
      return new DisputeError(
        'DISPUTE_IDEMPOTENCY_CONFLICT',
        'This operation key was already used for another dispute action',
      );
  }
}
