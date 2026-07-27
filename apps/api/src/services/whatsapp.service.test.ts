import { describe, expect, it } from 'vitest';

import {
  ConversationMatchState,
  MediaProcessingState,
  MembershipRole,
  PaymentEvidenceState,
  WhatsAppConnectionState,
  WhatsAppProvider,
} from '../generated/prisma/enums.js';
import { MemoryEvidenceStorage } from '../whatsapp/storage.js';
import type { AuthContext } from './auth.service.js';
import { WhatsAppService } from './whatsapp.service.js';

const context: AuthContext = {
  sessionId: '60000000-0000-4000-8000-000000000001',
  user: {
    id: '10000000-0000-4000-8000-000000000001',
    email: 'owner@example.com',
    name: 'Owner',
  },
  organization: {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Organization A',
    timezone: 'Asia/Jakarta',
  },
  role: MembershipRole.OWNER,
};

function repository() {
  return {
    capturedOrganizationId: null as string | null,
    async captureWebhook() {
      return { replayed: false };
    },
    async getConnection(organizationId: string) {
      this.capturedOrganizationId = organizationId;
      return {
        id: 'a0000000-0000-4000-8000-000000000001',
        provider: WhatsAppProvider.META,
        displayPhoneNumber: '+6281190002026',
        state: WhatsAppConnectionState.LIVE,
        lastWebhookAt: null,
        lastHealthyAt: null,
        lastFailureCode: null,
      };
    },
    async updateConnectionState(input: {
      organizationId: string;
      state: WhatsAppConnectionState;
    }) {
      this.capturedOrganizationId = input.organizationId;
      return {
        id: 'a0000000-0000-4000-8000-000000000001',
        provider: WhatsAppProvider.META,
        displayPhoneNumber: '+6281190002026',
        state: input.state,
        lastWebhookAt: null,
        lastHealthyAt: null,
        lastFailureCode: null,
      };
    },
    async getThread(input: { organizationId: string }) {
      this.capturedOrganizationId = input.organizationId;
      return {
        debtorExists: true,
        thread: {
          id: 'b0000000-0000-4000-8000-000000000001',
          normalizedCustomerNumber: '+6281210000002',
          customerDisplayName: 'Rina',
          matchState: ConversationMatchState.MATCHED,
          lastMessageAt: new Date('2026-07-23T07:45:00.000Z'),
          debtor: {
            id: '20000000-0000-4000-8000-000000000002',
            name: 'PT Cipta Pangan',
            code: 'CUST-002',
          },
          currentInvoice: null,
          messages: [],
        },
      };
    },
    async getEvidence(organizationId: string, evidenceId: string) {
      this.capturedOrganizationId = organizationId;
      if (evidenceId !== 'e0000000-0000-4000-8000-000000000001') return null;
      return {
        id: evidenceId,
        state: PaymentEvidenceState.AWAITING_REVIEW,
        createdAt: new Date('2026-07-23T07:45:00.000Z'),
        debtor: null,
        invoice: null,
        mediaAsset: {
          id: 'd0000000-0000-4000-8000-000000000001',
          objectKey: 'org/evidence/file.png',
          detectedMime: 'image/png',
          byteSize: 24,
          width: 2,
          height: 3,
          processingState: MediaProcessingState.READY,
          message: {
            id: 'c0000000-0000-4000-8000-000000000001',
            occurredAt: new Date('2026-07-23T07:45:00.000Z'),
            thread: {
              id: 'b0000000-0000-4000-8000-000000000001',
              normalizedCustomerNumber: '+6281210000002',
              customerDisplayName: 'Rina',
            },
          },
        },
      };
    },
  };
}

describe('WhatsAppService', () => {
  it('scopes connection and thread reads to the authenticated organization', async () => {
    const repo = repository();
    const service = new WhatsAppService({
      repository: repo,
      storage: new MemoryEvidenceStorage(),
    });

    const result = await service.getThread({
      context,
      debtorId: '20000000-0000-4000-8000-000000000002',
      limit: 50,
    });

    expect(repo.capturedOrganizationId).toBe(context.organization.id);
    expect(result.data.connection?.state).toBe('LIVE');
    expect(result.data.thread?.matchState).toBe('MATCHED');
  });

  it('never reveals evidence missing from the current organization scope', async () => {
    const service = new WhatsAppService({
      repository: repository(),
      storage: new MemoryEvidenceStorage(),
    });

    await expect(
      service.getEvidence({
        context,
        evidenceId: 'e0000000-0000-4000-8000-000000000099',
      }),
    ).rejects.toMatchObject({
      code: 'EVIDENCE_NOT_FOUND',
    });
  });

  it('audits organization-scoped live and paused transitions through the repository', async () => {
    const repo = repository();
    const service = new WhatsAppService({
      repository: repo,
      storage: new MemoryEvidenceStorage(),
    });

    const result = await service.updateConnectionState({
      context,
      requestId: 'request-1',
      state: 'PAUSED',
    });

    expect(repo.capturedOrganizationId).toBe(context.organization.id);
    expect(result.data.state).toBe('PAUSED');
  });
});
