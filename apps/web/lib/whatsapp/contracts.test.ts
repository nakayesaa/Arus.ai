import { describe, expect, it } from 'vitest';

import { whatsappThreadResponseSchema } from './contracts';

/**
 * Contract tests pin the browser-visible WhatsApp shape independently of Meta.
 * Runtime parsing rejects provider payload drift before components consume it.
 * Evidence metadata remains useful for review without exposing private object keys.
 * Financial decisions use separate payment contracts and explicit commands.
 * Secret-like provider fields must never survive normalization.
 */

describe('WhatsApp browser contracts', () => {
  it('parses a provider-neutral thread without accepting raw provider data', () => {
    const result = whatsappThreadResponseSchema.parse({
      data: {
        connection: {
          id: 'a0000000-0000-4000-8000-000000000001',
          provider: 'META',
          displayPhoneNumber: '+6281190002026',
          state: 'LIVE',
          lastWebhookAt: '2026-07-23T07:46:00.000Z',
          lastHealthyAt: '2026-07-23T07:46:00.000Z',
          lastFailureCode: null,
        },
        thread: {
          id: 'b0000000-0000-4000-8000-000000000001',
          customerNumber: '+6281210000002',
          customerDisplayName: 'Rina',
          matchState: 'MATCHED',
          lastMessageAt: '2026-07-23T07:45:00.000Z',
          debtor: {
            id: '20000000-0000-4000-8000-000000000002',
            name: 'PT Cipta Pangan Indonesia',
            code: 'CUST-002',
          },
          currentInvoice: {
            id: '30000000-0000-4000-8000-000000000002',
            invoiceNumber: 'INV-2026-0074',
            originalAmount: '315000000.00',
            dueDate: '2026-07-15',
          },
          messages: [
            {
              id: 'c0000000-0000-4000-8000-000000000003',
              direction: 'INBOUND',
              type: 'IMAGE',
              state: 'READY',
              body: 'Bukti transfer.',
              occurredAt: '2026-07-23T07:45:00.000Z',
              safeFailureCode: null,
              media: {
                id: 'd0000000-0000-4000-8000-000000000001',
                mime: 'image/png',
                byteSize: 24,
                width: 2,
                height: 3,
                processingState: 'READY',
                failureCode: null,
                evidence: {
                  id: 'e0000000-0000-4000-8000-000000000001',
                  state: 'AWAITING_REVIEW',
                  invoiceId: '30000000-0000-4000-8000-000000000002',
                },
              },
            },
          ],
        },
      },
    });

    expect(result.data.thread?.messages[0]?.media?.evidence?.state).toBe(
      'AWAITING_REVIEW',
    );
    expect(JSON.stringify(result)).not.toContain('access_token');
  });
});
