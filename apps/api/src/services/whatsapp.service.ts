import type {
  ConversationMatchState,
  MediaProcessingState,
  PaymentEvidenceState,
  WhatsAppConnectionState,
  WhatsAppProvider,
} from '../generated/prisma/enums.js';
import type {
  EvidenceRecord,
  PrismaWhatsAppRepository,
  ThreadRecord,
  WhatsAppConnectionRecord,
} from '../repositories/whatsapp.repository.js';
import type { AuthContext } from './auth.service.js';
import type { EvidenceStorage } from '../whatsapp/contracts.js';
import {
  connectionPhoneNumberId,
  parseMetaWebhookPayload,
  webhookEventIdentity,
} from '../whatsapp/meta-webhook.js';

export interface WhatsAppConnectionView {
  id: string;
  provider: WhatsAppProvider;
  displayPhoneNumber: string | null;
  state: WhatsAppConnectionState;
  lastWebhookAt: string | null;
  lastHealthyAt: string | null;
  lastFailureCode: string | null;
}

export interface WhatsAppThreadView {
  id: string;
  customerNumber: string;
  customerDisplayName: string | null;
  matchState: ConversationMatchState;
  lastMessageAt: string | null;
  debtor: ThreadRecord['debtor'];
  currentInvoice: {
    id: string;
    invoiceNumber: string;
    originalAmount: string;
    dueDate: string;
  } | null;
  messages: Array<{
    id: string;
    direction: 'INBOUND' | 'OUTBOUND';
    type: 'TEXT' | 'IMAGE';
    state: ThreadRecord['messages'][number]['state'];
    body: string | null;
    occurredAt: string;
    safeFailureCode: string | null;
    media: {
      id: string;
      mime: string | null;
      byteSize: number | null;
      width: number | null;
      height: number | null;
      processingState: MediaProcessingState;
      failureCode: string | null;
      evidence: {
        id: string;
        state: PaymentEvidenceState;
        invoiceId: string | null;
      } | null;
    } | null;
  }>;
}

export interface PaymentEvidenceView {
  id: string;
  state: PaymentEvidenceState;
  createdAt: string;
  debtor: EvidenceRecord['debtor'];
  invoice: EvidenceRecord['invoice'];
  source: {
    messageId: string;
    occurredAt: string;
    threadId: string;
    customerNumber: string;
    customerDisplayName: string | null;
  };
  media: {
    id: string;
    mime: string | null;
    byteSize: number | null;
    width: number | null;
    height: number | null;
    processingState: MediaProcessingState;
  };
}

export interface WhatsAppServiceContract {
  captureVerifiedWebhook(input: {
    rawBody: Uint8Array;
    parsedBody: unknown;
    receivedAt: Date;
  }): Promise<{ replayed: boolean }>;
  getConnection(input: {
    context: AuthContext;
  }): Promise<{ data: WhatsAppConnectionView | null }>;
  updateConnectionState(input: {
    context: AuthContext;
    requestId: string;
    state: 'LIVE' | 'PAUSED';
  }): Promise<{ data: WhatsAppConnectionView }>;
  getThread(input: {
    context: AuthContext;
    debtorId: string;
    invoiceId?: string | undefined;
    limit: number;
  }): Promise<{
    data: {
      connection: WhatsAppConnectionView | null;
      thread: WhatsAppThreadView | null;
    };
  }>;
  getEvidence(input: {
    context: AuthContext;
    evidenceId: string;
  }): Promise<{ data: PaymentEvidenceView }>;
  createEvidenceView(input: {
    context: AuthContext;
    evidenceId: string;
  }): Promise<{ data: { url: string; expiresAt: string } }>;
}

export class WhatsAppService implements WhatsAppServiceContract {
  constructor(
    private readonly options: {
      repository: Pick<
        PrismaWhatsAppRepository,
        | 'captureWebhook'
        | 'getConnection'
        | 'updateConnectionState'
        | 'getThread'
        | 'getEvidence'
      >;
      storage: EvidenceStorage;
      clock?: () => Date;
    },
  ) {}

  async captureVerifiedWebhook(input: {
    rawBody: Uint8Array;
    parsedBody: unknown;
    receivedAt: Date;
  }): Promise<{ replayed: boolean }> {
    const payload = parseMetaWebhookPayload(input.parsedBody);
    return this.options.repository.captureWebhook({
      providerEventId: webhookEventIdentity(input.rawBody),
      providerPhoneNumberId: connectionPhoneNumberId(payload),
      payload,
      receivedAt: input.receivedAt,
    });
  }

  async getConnection(input: {
    context: AuthContext;
  }): Promise<{ data: WhatsAppConnectionView | null }> {
    const record = await this.options.repository.getConnection(
      input.context.organization.id,
    );
    return { data: record ? toConnectionView(record) : null };
  }

  async updateConnectionState(input: {
    context: AuthContext;
    requestId: string;
    state: 'LIVE' | 'PAUSED';
  }): Promise<{ data: WhatsAppConnectionView }> {
    const record = await this.options.repository.updateConnectionState({
      organizationId: input.context.organization.id,
      actorId: input.context.user.id,
      requestId: input.requestId,
      state: input.state,
    });
    if (!record) {
      throw new WhatsAppError(
        'CONNECTION_NOT_FOUND',
        'WhatsApp connection is not configured',
      );
    }
    return { data: toConnectionView(record) };
  }

  async getThread(input: {
    context: AuthContext;
    debtorId: string;
    invoiceId?: string | undefined;
    limit: number;
  }): Promise<{
    data: {
      connection: WhatsAppConnectionView | null;
      thread: WhatsAppThreadView | null;
    };
  }> {
    const [connection, result] = await Promise.all([
      this.options.repository.getConnection(input.context.organization.id),
      this.options.repository.getThread({
        organizationId: input.context.organization.id,
        debtorId: input.debtorId,
        ...(input.invoiceId ? { invoiceId: input.invoiceId } : {}),
        limit: input.limit,
      }),
    ]);
    if (!result.debtorExists) {
      throw new WhatsAppError('THREAD_NOT_FOUND', 'Conversation not found');
    }
    return {
      data: {
        connection: connection ? toConnectionView(connection) : null,
        thread: result.thread ? toThreadView(result.thread) : null,
      },
    };
  }

  async getEvidence(input: {
    context: AuthContext;
    evidenceId: string;
  }): Promise<{ data: PaymentEvidenceView }> {
    const record = await this.evidenceOrThrow(
      input.context.organization.id,
      input.evidenceId,
    );
    return { data: toEvidenceView(record) };
  }

  async createEvidenceView(input: {
    context: AuthContext;
    evidenceId: string;
  }): Promise<{ data: { url: string; expiresAt: string } }> {
    const record = await this.evidenceOrThrow(
      input.context.organization.id,
      input.evidenceId,
    );
    if (
      record.mediaAsset.processingState !== 'READY' ||
      !record.mediaAsset.objectKey
    ) {
      throw new WhatsAppError(
        'EVIDENCE_NOT_READY',
        'Evidence preview is not available yet',
      );
    }
    const expiresInSeconds = 60;
    const now = this.options.clock?.() ?? new Date();
    const url = await this.options.storage.createSignedReadUrl({
      objectKey: record.mediaAsset.objectKey,
      expiresInSeconds,
    });
    return {
      data: {
        url,
        expiresAt: new Date(
          now.getTime() + expiresInSeconds * 1_000,
        ).toISOString(),
      },
    };
  }

  private async evidenceOrThrow(
    organizationId: string,
    evidenceId: string,
  ): Promise<EvidenceRecord> {
    const record = await this.options.repository.getEvidence(
      organizationId,
      evidenceId,
    );
    if (!record) {
      throw new WhatsAppError('EVIDENCE_NOT_FOUND', 'Evidence not found');
    }
    return record;
  }
}

export type WhatsAppErrorCode =
  | 'CONNECTION_NOT_FOUND'
  | 'EVIDENCE_NOT_FOUND'
  | 'EVIDENCE_NOT_READY'
  | 'THREAD_NOT_FOUND';

export class WhatsAppError extends Error {
  constructor(
    readonly code: WhatsAppErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'WhatsAppError';
  }
}

function toConnectionView(
  record: WhatsAppConnectionRecord,
): WhatsAppConnectionView {
  return {
    ...record,
    lastWebhookAt: record.lastWebhookAt?.toISOString() ?? null,
    lastHealthyAt: record.lastHealthyAt?.toISOString() ?? null,
  };
}

function toThreadView(record: ThreadRecord): WhatsAppThreadView {
  return {
    id: record.id,
    customerNumber: record.normalizedCustomerNumber,
    customerDisplayName: record.customerDisplayName,
    matchState: record.matchState,
    lastMessageAt: record.lastMessageAt?.toISOString() ?? null,
    debtor: record.debtor,
    currentInvoice: record.currentInvoice
      ? {
          ...record.currentInvoice,
          dueDate: record.currentInvoice.dueDate.toISOString().slice(0, 10),
        }
      : null,
    messages: record.messages.map((message) => ({
      id: message.id,
      direction: message.direction,
      type: message.type,
      state: message.state,
      body: message.body,
      occurredAt: message.occurredAt.toISOString(),
      safeFailureCode: message.safeFailureCode,
      media: message.mediaAsset
        ? {
            id: message.mediaAsset.id,
            mime: message.mediaAsset.detectedMime,
            byteSize: message.mediaAsset.byteSize,
            width: message.mediaAsset.width,
            height: message.mediaAsset.height,
            processingState: message.mediaAsset.processingState,
            failureCode: message.mediaAsset.failureCode,
            evidence: message.mediaAsset.evidence,
          }
        : null,
    })),
  };
}

function toEvidenceView(record: EvidenceRecord): PaymentEvidenceView {
  return {
    id: record.id,
    state: record.state,
    createdAt: record.createdAt.toISOString(),
    debtor: record.debtor,
    invoice: record.invoice,
    source: {
      messageId: record.mediaAsset.message.id,
      occurredAt: record.mediaAsset.message.occurredAt.toISOString(),
      threadId: record.mediaAsset.message.thread.id,
      customerNumber: record.mediaAsset.message.thread.normalizedCustomerNumber,
      customerDisplayName: record.mediaAsset.message.thread.customerDisplayName,
    },
    media: {
      id: record.mediaAsset.id,
      mime: record.mediaAsset.detectedMime,
      byteSize: record.mediaAsset.byteSize,
      width: record.mediaAsset.width,
      height: record.mediaAsset.height,
      processingState: record.mediaAsset.processingState,
    },
  };
}
