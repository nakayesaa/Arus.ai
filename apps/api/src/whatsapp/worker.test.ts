import pino from 'pino';
import { describe, expect, it } from 'vitest';

import { DeterministicWhatsAppProvider } from './provider.js';
import { MemoryEvidenceStorage } from './storage.js';
import { WhatsAppWorker } from './worker.js';

const validPayload = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'waba-1',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { phone_number_id: 'phone-1' },
            contacts: [{ wa_id: '6281210000002', profile: { name: 'Rina' } }],
            messages: [
              {
                id: 'wamid.image',
                from: '6281210000002',
                timestamp: '1785146460',
                type: 'image',
                image: { id: 'media-1', mime_type: 'image/png' },
              },
            ],
          },
        },
      ],
    },
  ],
};

function repository(payload: unknown = validPayload) {
  return {
    leaseAvailable: true,
    completed: [] as string[],
    completedMedia: [] as Array<{ mediaId: string; objectKey: string }>,
    failedMedia: [] as string[],
    retries: [] as Array<{
      id: string;
      terminal: boolean;
      safeErrorCode: string;
    }>,
    ingested: 0,
    async leaseInbox() {
      if (!this.leaseAvailable) return null;
      this.leaseAvailable = false;
      return { id: 'inbox-1', payload, attemptCount: 1 };
    },
    async ingestInbound() {
      this.ingested += 1;
      return {
        duplicate: false,
        media: {
          id: 'd0000000-0000-4000-8000-000000000001',
          providerMediaId: 'media-1',
          organizationId: '00000000-0000-4000-8000-000000000001',
        },
      };
    },
    async completeMedia(input: { mediaId: string; objectKey: string }) {
      this.completedMedia.push(input);
    },
    async failMedia(input: { mediaId: string }) {
      this.failedMedia.push(input.mediaId);
    },
    async completeInbox(id: string) {
      this.completed.push(id);
    },
    async retryInbox(input: {
      id: string;
      terminal: boolean;
      safeErrorCode: string;
    }) {
      this.retries.push(input);
    },
  };
}

function worker(repo: ReturnType<typeof repository>) {
  return new WhatsAppWorker({
    repository: repo,
    provider: new DeterministicWhatsAppProvider(),
    storage: new MemoryEvidenceStorage(),
    environment: {
      WHATSAPP_EVIDENCE_MAX_BYTES: 8 * 1024 * 1024,
      WHATSAPP_WORKER_LEASE_MS: 30_000,
    },
    logger: pino({ level: 'silent' }),
    workerId: 'worker-1',
    clock: () => new Date('2026-07-23T08:00:00.000Z'),
  });
}

describe('WhatsAppWorker', () => {
  it('persists a bounded private image once before completing its inbox lease', async () => {
    const repo = repository();

    await expect(worker(repo).runOnce()).resolves.toBe(true);

    expect(repo.ingested).toBe(1);
    expect(repo.completedMedia).toHaveLength(1);
    expect(repo.completedMedia[0]?.objectKey).toMatch(
      /^00000000-0000-4000-8000-000000000001\/evidence\//u,
    );
    expect(repo.completed).toEqual(['inbox-1']);
    expect(repo.retries).toHaveLength(0);
  });

  it('marks malformed provider payloads terminal without creating messages', async () => {
    const repo = repository({ forged: true });

    await expect(worker(repo).runOnce()).resolves.toBe(true);

    expect(repo.ingested).toBe(0);
    expect(repo.completed).toHaveLength(0);
    expect(repo.retries).toEqual([
      expect.objectContaining({
        id: 'inbox-1',
        terminal: true,
        safeErrorCode: 'MALFORMED_WEBHOOK',
      }),
    ]);
  });

  it('returns idle without touching state when no lease is available', async () => {
    const repo = repository();
    repo.leaseAvailable = false;

    await expect(worker(repo).runOnce()).resolves.toBe(false);
    expect(repo.completed).toHaveLength(0);
  });
});
