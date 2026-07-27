import { normalizeE164PhoneNumber } from '@arus/domain';

import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import {
  ChannelMessageDirection,
  ChannelMessageState,
  ChannelMessageType,
  ConversationMatchState,
  MediaProcessingState,
  PaymentEvidenceState,
  WebhookInboxState,
  WhatsAppConnectionState,
  WhatsAppProvider,
} from '../generated/prisma/enums.js';
import type { InboundMessageEvent } from '../whatsapp/contracts.js';

export interface InboxLease {
  id: string;
  payload: unknown;
  attemptCount: number;
}

export interface IngestedInbound {
  duplicate: boolean;
  media: {
    id: string;
    providerMediaId: string;
    organizationId: string;
  } | null;
}

export interface WhatsAppConnectionRecord {
  id: string;
  provider: WhatsAppProvider;
  displayPhoneNumber: string | null;
  state: WhatsAppConnectionState;
  lastWebhookAt: Date | null;
  lastHealthyAt: Date | null;
  lastFailureCode: string | null;
}

export interface ThreadRecord {
  id: string;
  normalizedCustomerNumber: string;
  customerDisplayName: string | null;
  matchState: ConversationMatchState;
  lastMessageAt: Date | null;
  debtor: { id: string; name: string; code: string | null } | null;
  currentInvoice: {
    id: string;
    invoiceNumber: string;
    originalAmount: string;
    dueDate: Date;
  } | null;
  messages: MessageRecord[];
}

export interface MessageRecord {
  id: string;
  direction: ChannelMessageDirection;
  type: ChannelMessageType;
  state: ChannelMessageState;
  body: string | null;
  occurredAt: Date;
  safeFailureCode: string | null;
  mediaAsset: {
    id: string;
    detectedMime: string | null;
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
}

export interface EvidenceRecord {
  id: string;
  state: PaymentEvidenceState;
  createdAt: Date;
  mediaAsset: {
    id: string;
    objectKey: string | null;
    detectedMime: string | null;
    byteSize: number | null;
    width: number | null;
    height: number | null;
    processingState: MediaProcessingState;
    message: {
      id: string;
      occurredAt: Date;
      thread: {
        id: string;
        normalizedCustomerNumber: string;
        customerDisplayName: string | null;
      };
    };
  };
  debtor: { id: string; name: string } | null;
  invoice: { id: string; invoiceNumber: string } | null;
}

export class PrismaWhatsAppRepository {
  constructor(private readonly database: PrismaClient) {}

  async captureWebhook(input: {
    providerEventId: string;
    providerPhoneNumberId: string | null;
    payload: Prisma.InputJsonValue;
    receivedAt: Date;
  }): Promise<{ replayed: boolean }> {
    const connection = input.providerPhoneNumberId
      ? await this.database.whatsAppConnection.findUnique({
          where: {
            provider_providerPhoneNumberId: {
              provider: WhatsAppProvider.META,
              providerPhoneNumberId: input.providerPhoneNumberId,
            },
          },
          select: { id: true, organizationId: true },
        })
      : null;
    try {
      await this.database.$transaction([
        this.database.webhookInbox.create({
          data: {
            ...(connection
              ? {
                  organizationId: connection.organizationId,
                  connectionId: connection.id,
                }
              : {}),
            providerEventId: input.providerEventId,
            payload: input.payload,
            signatureVerifiedAt: input.receivedAt,
          },
        }),
        ...(connection
          ? [
              this.database.whatsAppConnection.update({
                where: { id: connection.id },
                data: { lastWebhookAt: input.receivedAt },
              }),
            ]
          : []),
      ]);
      return { replayed: false };
    } catch (error) {
      if (isUniqueConflict(error)) return { replayed: true };
      throw error;
    }
  }

  async leaseInbox(input: {
    workerId: string;
    now: Date;
    leaseExpiresAt: Date;
  }): Promise<InboxLease | null> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const candidate = await this.database.webhookInbox.findFirst({
        where: {
          state: { in: [WebhookInboxState.PENDING, WebhookInboxState.RETRY] },
          nextAttemptAt: { lte: input.now },
          OR: [
            { leaseExpiresAt: null },
            { leaseExpiresAt: { lte: input.now } },
          ],
        },
        orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
        select: { id: true },
      });
      if (!candidate) return null;
      const claimed = await this.database.webhookInbox.updateMany({
        where: {
          id: candidate.id,
          state: { in: [WebhookInboxState.PENDING, WebhookInboxState.RETRY] },
          OR: [
            { leaseExpiresAt: null },
            { leaseExpiresAt: { lte: input.now } },
          ],
        },
        data: {
          state: WebhookInboxState.PROCESSING,
          leaseOwner: input.workerId,
          leaseExpiresAt: input.leaseExpiresAt,
          attemptCount: { increment: 1 },
          safeErrorCode: null,
        },
      });
      if (claimed.count !== 1) continue;
      const lease = await this.database.webhookInbox.findUniqueOrThrow({
        where: { id: candidate.id },
        select: { id: true, payload: true, attemptCount: true },
      });
      return lease;
    }
    return null;
  }

  async completeInbox(id: string, processedAt: Date): Promise<void> {
    await this.database.webhookInbox.update({
      where: { id },
      data: {
        state: WebhookInboxState.COMPLETED,
        processedAt,
        leaseOwner: null,
        leaseExpiresAt: null,
        safeErrorCode: null,
      },
    });
  }

  async retryInbox(input: {
    id: string;
    nextAttemptAt: Date;
    safeErrorCode: string;
    terminal: boolean;
  }): Promise<void> {
    await this.database.webhookInbox.update({
      where: { id: input.id },
      data: {
        state: input.terminal
          ? WebhookInboxState.FAILED
          : WebhookInboxState.RETRY,
        nextAttemptAt: input.nextAttemptAt,
        leaseOwner: null,
        leaseExpiresAt: null,
        safeErrorCode: input.safeErrorCode,
      },
    });
  }

  async ingestInbound(event: InboundMessageEvent): Promise<IngestedInbound> {
    const connection = await this.database.whatsAppConnection.findUnique({
      where: {
        provider_providerPhoneNumberId: {
          provider: WhatsAppProvider.META,
          providerPhoneNumberId: event.providerPhoneNumberId,
        },
      },
      select: { id: true, organizationId: true },
    });
    if (!connection) throw new WhatsAppRepositoryError('UNKNOWN_CONNECTION');

    const existingMessage = await this.database.channelMessage.findUnique({
      where: {
        connectionId_providerMessageId: {
          connectionId: connection.id,
          providerMessageId: event.providerMessageId,
        },
      },
      select: {
        mediaAsset: {
          select: { id: true, providerMediaId: true, organizationId: true },
        },
      },
    });
    if (existingMessage) {
      return {
        duplicate: true,
        media: requiredMedia(existingMessage.mediaAsset),
      };
    }

    const debtors = await this.database.debtor.findMany({
      where: {
        organizationId: connection.organizationId,
        deletedAt: null,
        phoneNumber: { not: null },
      },
      select: { id: true, phoneNumber: true },
      take: 10_001,
    });
    if (debtors.length > 10_000) {
      throw new WhatsAppRepositoryError('MATCH_SCOPE_TOO_LARGE');
    }
    const matches = debtors.filter(({ phoneNumber }) => {
      try {
        return (
          phoneNumber !== null &&
          normalizeE164PhoneNumber(phoneNumber) === event.customerNumber
        );
      } catch {
        return false;
      }
    });
    const matchState =
      matches.length === 1
        ? ConversationMatchState.MATCHED
        : matches.length > 1
          ? ConversationMatchState.AMBIGUOUS
          : ConversationMatchState.UNMATCHED;
    const debtorId = matches.length === 1 ? matches[0]!.id : null;

    try {
      return await this.database.$transaction(async (transaction) => {
        const existingThread = await transaction.conversationThread.findUnique({
          where: {
            organizationId_normalizedCustomerNumber: {
              organizationId: connection.organizationId,
              normalizedCustomerNumber: event.customerNumber,
            },
          },
          select: {
            id: true,
            debtorId: true,
            currentInvoiceId: true,
            matchState: true,
          },
        });
        const thread = existingThread
          ? await transaction.conversationThread.update({
              where: { id: existingThread.id },
              data: threadUpdateData({
                customerName: event.customerName,
                occurredAt: event.occurredAt,
                alreadyMatched: existingThread.debtorId !== null,
                debtorId,
                matchState,
              }),
              select: {
                id: true,
                debtorId: true,
                currentInvoiceId: true,
              },
            })
          : await transaction.conversationThread.create({
              data: {
                organizationId: connection.organizationId,
                connectionId: connection.id,
                debtorId,
                normalizedCustomerNumber: event.customerNumber,
                customerDisplayName: event.customerName,
                matchState,
                lastMessageAt: event.occurredAt,
              },
              select: {
                id: true,
                debtorId: true,
                currentInvoiceId: true,
              },
            });

        const message = await transaction.channelMessage.create({
          data: {
            organizationId: connection.organizationId,
            connectionId: connection.id,
            threadId: thread.id,
            invoiceId: thread.currentInvoiceId,
            direction: ChannelMessageDirection.INBOUND,
            type:
              event.kind === 'image'
                ? ChannelMessageType.IMAGE
                : ChannelMessageType.TEXT,
            state:
              event.kind === 'image'
                ? ChannelMessageState.PROCESSING
                : ChannelMessageState.READY,
            providerMessageId: event.providerMessageId,
            body: event.kind === 'text' ? event.body : event.caption,
            occurredAt: event.occurredAt,
            ...(event.kind === 'image'
              ? {
                  mediaAsset: {
                    create: {
                      organizationId: connection.organizationId,
                      providerMediaId: event.providerMediaId,
                      evidence: {
                        create: {
                          organizationId: connection.organizationId,
                          debtorId: thread.debtorId,
                          invoiceId: thread.currentInvoiceId,
                        },
                      },
                    },
                  },
                }
              : {}),
          },
          select: {
            mediaAsset: {
              select: { id: true, providerMediaId: true, organizationId: true },
            },
          },
        });
        return {
          duplicate: false,
          media: requiredMedia(message.mediaAsset),
        };
      });
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      return { duplicate: true, media: null };
    }
  }

  async completeMedia(input: {
    mediaId: string;
    objectKey: string;
    sha256: string;
    mime: string;
    byteSize: number;
    width: number;
    height: number;
    processedAt: Date;
  }): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      const media = await transaction.mediaAsset.update({
        where: { id: input.mediaId },
        data: {
          objectKey: input.objectKey,
          sha256: input.sha256,
          detectedMime: input.mime,
          byteSize: input.byteSize,
          width: input.width,
          height: input.height,
          processingState: MediaProcessingState.READY,
          processingStartedAt: input.processedAt,
          processedAt: input.processedAt,
          failureCode: null,
        },
        select: { messageId: true },
      });
      await transaction.paymentEvidenceReview.update({
        where: { mediaAssetId: input.mediaId },
        data: { state: PaymentEvidenceState.AWAITING_REVIEW },
      });
      await transaction.channelMessage.update({
        where: { id: media.messageId },
        data: { state: ChannelMessageState.READY },
      });
    });
  }

  async failMedia(input: {
    mediaId: string;
    failureCode: string;
    processedAt: Date;
  }): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      const media = await transaction.mediaAsset.update({
        where: { id: input.mediaId },
        data: {
          processingState: MediaProcessingState.FAILED,
          failureCode: input.failureCode,
          processedAt: input.processedAt,
        },
        select: { messageId: true },
      });
      await transaction.paymentEvidenceReview.update({
        where: { mediaAssetId: input.mediaId },
        data: { state: PaymentEvidenceState.UNAVAILABLE },
      });
      await transaction.channelMessage.update({
        where: { id: media.messageId },
        data: {
          state: ChannelMessageState.FAILED,
          safeFailureCode: input.failureCode,
        },
      });
    });
  }

  async getConnection(
    organizationId: string,
  ): Promise<WhatsAppConnectionRecord | null> {
    return this.database.whatsAppConnection.findUnique({
      where: {
        organizationId_provider: {
          organizationId,
          provider: WhatsAppProvider.META,
        },
      },
      select: connectionSelect,
    });
  }

  async updateConnectionState(input: {
    organizationId: string;
    actorId: string;
    state: WhatsAppConnectionState;
    requestId: string;
  }): Promise<WhatsAppConnectionRecord | null> {
    return this.database.$transaction(async (transaction) => {
      const connection = await transaction.whatsAppConnection.findUnique({
        where: {
          organizationId_provider: {
            organizationId: input.organizationId,
            provider: WhatsAppProvider.META,
          },
        },
        select: { id: true },
      });
      if (!connection) return null;
      const updated = await transaction.whatsAppConnection.update({
        where: { id: connection.id },
        data: { state: input.state },
        select: connectionSelect,
      });
      await transaction.auditLog.create({
        data: {
          organizationId: input.organizationId,
          actorId: input.actorId,
          action: 'WHATSAPP_CONNECTION_STATE_CHANGED',
          entityType: 'WhatsAppConnection',
          entityId: connection.id,
          requestId: input.requestId,
          metadata: { state: input.state },
        },
      });
      return updated;
    });
  }

  async getThread(input: {
    organizationId: string;
    debtorId: string;
    invoiceId?: string | undefined;
    limit: number;
  }): Promise<{ debtorExists: boolean; thread: ThreadRecord | null }> {
    const debtor = await this.database.debtor.findFirst({
      where: {
        id: input.debtorId,
        organizationId: input.organizationId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!debtor) return { debtorExists: false, thread: null };
    if (input.invoiceId) {
      const invoice = await this.database.invoice.findFirst({
        where: {
          id: input.invoiceId,
          organizationId: input.organizationId,
          debtorId: input.debtorId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!invoice) return { debtorExists: false, thread: null };
    }
    const thread = await this.database.conversationThread.findFirst({
      where: {
        organizationId: input.organizationId,
        debtorId: input.debtorId,
      },
      orderBy: { lastMessageAt: 'desc' },
      select: {
        id: true,
        normalizedCustomerNumber: true,
        customerDisplayName: true,
        matchState: true,
        lastMessageAt: true,
        debtor: { select: { id: true, name: true, code: true } },
        currentInvoice: {
          select: {
            id: true,
            invoiceNumber: true,
            originalAmount: true,
            dueDate: true,
          },
        },
        messages: {
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
          take: input.limit,
          select: messageSelect,
        },
      },
    });
    return {
      debtorExists: true,
      thread: thread
        ? {
            ...thread,
            currentInvoice: thread.currentInvoice
              ? {
                  ...thread.currentInvoice,
                  originalAmount:
                    thread.currentInvoice.originalAmount.toFixed(2),
                }
              : null,
            messages: [...thread.messages].reverse(),
          }
        : null,
    };
  }

  async getEvidence(
    organizationId: string,
    evidenceId: string,
  ): Promise<EvidenceRecord | null> {
    return this.database.paymentEvidenceReview.findFirst({
      where: { id: evidenceId, organizationId },
      select: {
        id: true,
        state: true,
        createdAt: true,
        debtor: { select: { id: true, name: true } },
        invoice: { select: { id: true, invoiceNumber: true } },
        mediaAsset: {
          select: {
            id: true,
            objectKey: true,
            detectedMime: true,
            byteSize: true,
            width: true,
            height: true,
            processingState: true,
            message: {
              select: {
                id: true,
                occurredAt: true,
                thread: {
                  select: {
                    id: true,
                    normalizedCustomerNumber: true,
                    customerDisplayName: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }
}

export class WhatsAppRepositoryError extends Error {
  constructor(readonly code: 'UNKNOWN_CONNECTION' | 'MATCH_SCOPE_TOO_LARGE') {
    super(code);
    this.name = 'WhatsAppRepositoryError';
  }
}

const connectionSelect = {
  id: true,
  provider: true,
  displayPhoneNumber: true,
  state: true,
  lastWebhookAt: true,
  lastHealthyAt: true,
  lastFailureCode: true,
} satisfies Prisma.WhatsAppConnectionSelect;

const messageSelect = {
  id: true,
  direction: true,
  type: true,
  state: true,
  body: true,
  occurredAt: true,
  safeFailureCode: true,
  mediaAsset: {
    select: {
      id: true,
      detectedMime: true,
      byteSize: true,
      width: true,
      height: true,
      processingState: true,
      failureCode: true,
      evidence: { select: { id: true, state: true, invoiceId: true } },
    },
  },
} satisfies Prisma.ChannelMessageSelect;

function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

function requiredMedia(
  media: {
    id: string;
    providerMediaId: string | null;
    organizationId: string;
  } | null,
): IngestedInbound['media'] {
  return media?.providerMediaId
    ? { ...media, providerMediaId: media.providerMediaId }
    : null;
}

function threadUpdateData(input: {
  customerName: string | null;
  occurredAt: Date;
  alreadyMatched: boolean;
  debtorId: string | null;
  matchState: ConversationMatchState;
}): Prisma.ConversationThreadUncheckedUpdateInput {
  return {
    lastMessageAt: input.occurredAt,
    ...(input.customerName ? { customerDisplayName: input.customerName } : {}),
    ...(input.alreadyMatched
      ? {}
      : { debtorId: input.debtorId, matchState: input.matchState }),
  };
}
