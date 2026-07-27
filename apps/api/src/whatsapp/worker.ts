import { createHash, randomUUID } from 'node:crypto';

import { DomainError, retryDelayMs, validateEvidenceImage } from '@arus/domain';
import type { Logger } from 'pino';
import { ZodError } from 'zod';

import type { Environment } from '../config/env.js';
import {
  WhatsAppRepositoryError,
  type PrismaWhatsAppRepository,
} from '../repositories/whatsapp.repository.js';
import type { EvidenceStorage, WhatsAppProviderAdapter } from './contracts.js';
import { inboundMessages, parseMetaWebhookPayload } from './meta-webhook.js';
import { ProviderError } from './provider.js';
import { StorageError } from './storage.js';

export class WhatsAppWorker {
  readonly id: string;

  constructor(
    private readonly options: {
      repository: Pick<
        PrismaWhatsAppRepository,
        | 'leaseInbox'
        | 'ingestInbound'
        | 'completeMedia'
        | 'failMedia'
        | 'completeInbox'
        | 'retryInbox'
      >;
      provider: WhatsAppProviderAdapter;
      storage: EvidenceStorage;
      environment: Pick<
        Environment,
        'WHATSAPP_EVIDENCE_MAX_BYTES' | 'WHATSAPP_WORKER_LEASE_MS'
      >;
      logger: Logger;
      clock?: () => Date;
      workerId?: string;
    },
  ) {
    this.id = options.workerId ?? `wa-${randomUUID()}`;
  }

  async runOnce(): Promise<boolean> {
    const now = this.clock();
    const lease = await this.options.repository.leaseInbox({
      workerId: this.id,
      now,
      leaseExpiresAt: new Date(
        now.getTime() + this.options.environment.WHATSAPP_WORKER_LEASE_MS,
      ),
    });
    if (!lease) return false;

    let activeMedia: {
      id: string;
      providerMediaId: string;
      organizationId: string;
    } | null = null;
    try {
      const payload = parseMetaWebhookPayload(lease.payload);
      for (const event of inboundMessages(payload)) {
        const ingested = await this.options.repository.ingestInbound(event);
        activeMedia = ingested.media;
        if (activeMedia) await this.processMedia(activeMedia);
        activeMedia = null;
      }
      await this.options.repository.completeInbox(lease.id, this.clock());
    } catch (error) {
      const failure = classifyFailure(error, lease.attemptCount);
      if (activeMedia && failure.terminal) {
        await this.options.repository.failMedia({
          mediaId: activeMedia.id,
          failureCode: failure.code,
          processedAt: this.clock(),
        });
      }
      const failedAt = this.clock();
      await this.options.repository.retryInbox({
        id: lease.id,
        safeErrorCode: failure.code,
        terminal: failure.terminal,
        nextAttemptAt: new Date(
          failedAt.getTime() + retryDelayMs(lease.attemptCount),
        ),
      });
      this.options.logger.warn(
        {
          inboxId: lease.id,
          code: failure.code,
          terminal: failure.terminal,
        },
        'WhatsApp inbox processing failed',
      );
    }
    return true;
  }

  private async processMedia(media: {
    id: string;
    providerMediaId: string;
    organizationId: string;
  }): Promise<void> {
    const downloaded = await this.options.provider.downloadMedia(
      media.providerMediaId,
    );
    const validated = validateEvidenceImage(
      downloaded.bytes,
      this.options.environment.WHATSAPP_EVIDENCE_MAX_BYTES,
    );
    const declaredMime = downloaded.declaredMime?.split(';', 1)[0]?.trim();
    if (declaredMime && declaredMime !== validated.mime) {
      throw new DomainError(
        'UNSUPPORTED_IMAGE',
        'Provider media type does not match detected image bytes',
      );
    }
    const sha256 = createHash('sha256').update(downloaded.bytes).digest('hex');
    const extension = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    }[validated.mime];
    const objectKey = `${media.organizationId}/evidence/${media.id}/${sha256}.${extension}`;
    await this.options.storage.putPrivateObject({
      objectKey,
      bytes: downloaded.bytes,
      contentType: validated.mime,
    });
    await this.options.repository.completeMedia({
      mediaId: media.id,
      objectKey,
      sha256,
      mime: validated.mime,
      byteSize: validated.byteSize,
      width: validated.width,
      height: validated.height,
      processedAt: this.clock(),
    });
  }

  private clock(): Date {
    return this.options.clock?.() ?? new Date();
  }
}

function classifyFailure(
  error: unknown,
  attemptCount: number,
): { code: string; terminal: boolean } {
  if (error instanceof WhatsAppRepositoryError) {
    return { code: error.code, terminal: true };
  }
  if (error instanceof DomainError || error instanceof ZodError) {
    return {
      code: error instanceof DomainError ? error.code : 'MALFORMED_WEBHOOK',
      terminal: true,
    };
  }
  if (error instanceof ProviderError || error instanceof StorageError) {
    return { code: error.code, terminal: attemptCount >= 5 };
  }
  return { code: 'PROCESSING_FAILED', terminal: attemptCount >= 5 };
}
