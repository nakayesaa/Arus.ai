import { createHmac, randomUUID } from 'node:crypto';

import bcrypt from 'bcrypt';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from './app.js';
import { loadEnvironment, type Environment } from './config/env.js';
import type { PrismaClient } from './generated/prisma/client.js';
import {
  ChannelMessageDirection,
  ChannelMessageState,
  ChannelMessageType,
  ConversationMatchState,
  MediaProcessingState,
  MembershipRole,
  PaymentEvidenceState,
  WhatsAppConnectionState,
  WhatsAppProvider,
} from './generated/prisma/enums.js';
import { createDatabaseClient } from './lib/database.js';
import { PrismaAuthRepository } from './repositories/auth.repository.js';
import { PrismaWhatsAppRepository } from './repositories/whatsapp.repository.js';
import { AuthService } from './services/auth.service.js';
import { WhatsAppService } from './services/whatsapp.service.js';
import { MemoryEvidenceStorage } from './whatsapp/storage.js';

const integrationDescribe = describe.runIf(
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true',
);

integrationDescribe('WhatsApp channel with PostgreSQL', () => {
  const organizationAId = randomUUID();
  const organizationBId = randomUUID();
  const userAId = randomUUID();
  const userBId = randomUUID();
  const debtorAId = randomUUID();
  const debtorBId = randomUUID();
  const invoiceAId = randomUUID();
  const invoiceBId = randomUUID();
  const connectionAId = randomUUID();
  const connectionBId = randomUUID();
  const threadAId = randomUUID();
  const messageAId = randomUUID();
  const mediaAId = randomUUID();
  const evidenceAId = randomUUID();
  const password = `whatsapp-${randomUUID()}`;
  const emailA = `whatsapp-a-${randomUUID()}@integration.arus.local`;
  const emailB = `whatsapp-b-${randomUUID()}@integration.arus.local`;
  const objectKey = `${organizationAId}/whatsapp/evidence.png`;
  const providerPhoneA = `phone-a-${randomUUID()}`;
  const providerPhoneB = `phone-b-${randomUUID()}`;

  let app: ReturnType<typeof createApp>;
  let cookieA: string;
  let cookieB: string;
  let database: PrismaClient;
  let environment: Environment;
  let repository: PrismaWhatsAppRepository;

  beforeAll(async () => {
    environment = loadEnvironment({
      ...process.env,
      NODE_ENV: 'test',
      SESSION_SECRET: 'whatsapp-integration-secret-with-adequate-length',
      WHATSAPP_PROVIDER_MODE: 'double',
      WHATSAPP_APP_SECRET: 'whatsapp-integration-app-secret',
      WHATSAPP_VERIFY_TOKEN: 'whatsapp-integration-verify-token',
      EVIDENCE_STORAGE_MODE: 'memory',
    });
    database = createDatabaseClient(environment);
    repository = new PrismaWhatsAppRepository(database);
    const logger = pino({ level: 'silent' });
    const passwordHash = await bcrypt.hash(password, 12);

    await database.organization.createMany({
      data: [
        {
          id: organizationAId,
          name: 'WhatsApp Integration A',
          timezone: 'Asia/Jakarta',
        },
        {
          id: organizationBId,
          name: 'WhatsApp Integration B',
          timezone: 'Asia/Jakarta',
        },
      ],
    });
    await database.user.createMany({
      data: [
        {
          id: userAId,
          email: emailA,
          normalizedEmail: emailA,
          passwordHash,
          name: 'WhatsApp Owner A',
        },
        {
          id: userBId,
          email: emailB,
          normalizedEmail: emailB,
          passwordHash,
          name: 'WhatsApp Owner B',
        },
      ],
    });
    await database.membership.createMany({
      data: [
        {
          userId: userAId,
          organizationId: organizationAId,
          role: MembershipRole.OWNER,
        },
        {
          userId: userBId,
          organizationId: organizationBId,
          role: MembershipRole.OWNER,
        },
      ],
    });
    await database.debtor.createMany({
      data: [
        {
          id: debtorAId,
          organizationId: organizationAId,
          code: 'WA-A',
          normalizedCode: 'wa-a',
          name: 'WhatsApp Debtor A',
          normalizedName: 'whatsapp debtor a',
          phoneNumber: '+6281210000101',
        },
        {
          id: debtorBId,
          organizationId: organizationBId,
          code: 'WA-B',
          normalizedCode: 'wa-b',
          name: 'WhatsApp Debtor B',
          normalizedName: 'whatsapp debtor b',
          phoneNumber: '+6281210000102',
        },
      ],
    });
    await database.invoice.createMany({
      data: [
        {
          id: invoiceAId,
          organizationId: organizationAId,
          debtorId: debtorAId,
          invoiceNumber: 'INV-WA-A',
          normalizedInvoiceNumber: 'inv-wa-a',
          invoiceDate: databaseDate('2026-07-01'),
          dueDate: databaseDate('2026-07-20'),
          originalAmount: '315000000.00',
        },
        {
          id: invoiceBId,
          organizationId: organizationBId,
          debtorId: debtorBId,
          invoiceNumber: 'INV-WA-B',
          normalizedInvoiceNumber: 'inv-wa-b',
          invoiceDate: databaseDate('2026-07-01'),
          dueDate: databaseDate('2026-07-20'),
          originalAmount: '5000000.00',
        },
      ],
    });
    await database.whatsAppConnection.createMany({
      data: [
        {
          id: connectionAId,
          organizationId: organizationAId,
          provider: WhatsAppProvider.META,
          providerPhoneNumberId: providerPhoneA,
          displayPhoneNumber: '+6281190000101',
          state: WhatsAppConnectionState.LIVE,
        },
        {
          id: connectionBId,
          organizationId: organizationBId,
          provider: WhatsAppProvider.META,
          providerPhoneNumberId: providerPhoneB,
          displayPhoneNumber: '+6281190000102',
          state: WhatsAppConnectionState.LIVE,
        },
      ],
    });
    await database.conversationThread.create({
      data: {
        id: threadAId,
        organizationId: organizationAId,
        connectionId: connectionAId,
        debtorId: debtorAId,
        currentInvoiceId: invoiceAId,
        normalizedCustomerNumber: '+6281210000101',
        customerDisplayName: 'Accounts Payable A',
        matchState: ConversationMatchState.MATCHED,
        lastMessageAt: new Date('2026-07-27T08:00:00.000Z'),
      },
    });
    await database.channelMessage.create({
      data: {
        id: messageAId,
        organizationId: organizationAId,
        connectionId: connectionAId,
        threadId: threadAId,
        invoiceId: invoiceAId,
        direction: ChannelMessageDirection.INBOUND,
        type: ChannelMessageType.IMAGE,
        state: ChannelMessageState.READY,
        providerMessageId: `wamid.${randomUUID()}`,
        body: 'Payment evidence',
        occurredAt: new Date('2026-07-27T08:00:00.000Z'),
        mediaAsset: {
          create: {
            id: mediaAId,
            organizationId: organizationAId,
            providerMediaId: `media-${randomUUID()}`,
            objectKey,
            sha256: '0'.repeat(64),
            detectedMime: 'image/png',
            byteSize: 68,
            width: 1,
            height: 1,
            processingState: MediaProcessingState.READY,
            processedAt: new Date('2026-07-27T08:00:01.000Z'),
            evidence: {
              create: {
                id: evidenceAId,
                organizationId: organizationAId,
                debtorId: debtorAId,
                invoiceId: invoiceAId,
                state: PaymentEvidenceState.AWAITING_REVIEW,
              },
            },
          },
        },
      },
    });

    const storage = new MemoryEvidenceStorage();
    await storage.putPrivateObject({
      objectKey,
      bytes: Buffer.from('private-evidence'),
    });
    const authService = new AuthService({
      repository: new PrismaAuthRepository(database),
      environment,
      logger,
    });
    app = createApp({
      authService,
      whatsappService: new WhatsAppService({ repository, storage }),
      environment,
      logger,
    });
    [cookieA, cookieB] = await Promise.all([login(emailA), login(emailB)]);
  }, 30_000);

  afterAll(async () => {
    if (!database) return;
    const organizationIds = [organizationAId, organizationBId];
    await database.messageOutbox.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await database.paymentEvidenceReview.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await database.mediaAsset.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await database.channelMessage.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await database.conversationThread.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await database.webhookInbox.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await database.whatsAppConnection.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await database.auditLog.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await database.invoice.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await database.debtor.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await database.session.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await database.membership.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await database.user.deleteMany({
      where: { id: { in: [userAId, userBId] } },
    });
    await database.organization.deleteMany({
      where: { id: { in: organizationIds } },
    });
    await database.$disconnect();
  }, 30_000);

  it('returns only the authenticated tenant conversation', async () => {
    const own = await request(app)
      .get(`/api/debtors/${debtorAId}/whatsapp-thread?invoiceId=${invoiceAId}`)
      .set('Cookie', cookieA)
      .expect(200);
    expect(own.headers['cache-control']).toBe('no-store');
    expect(own.body.data.thread).toMatchObject({
      id: threadAId,
      debtor: { id: debtorAId },
      currentInvoice: { id: invoiceAId },
      messages: [
        {
          id: messageAId,
          media: { evidence: { id: evidenceAId } },
        },
      ],
    });

    await request(app)
      .get(`/api/debtors/${debtorAId}/whatsapp-thread`)
      .set('Cookie', cookieB)
      .expect(404);
  });

  it('authorizes short-lived private evidence views per tenant', async () => {
    const own = await request(app)
      .post(`/api/payment-evidence/${evidenceAId}/view`)
      .set('Origin', environment.APP_ORIGIN)
      .set('Cookie', cookieA)
      .send({})
      .expect(200);
    expect(own.body.data.url).toMatch(/^memory:\/\/private\//u);
    expect(new Date(own.body.data.expiresAt).getTime()).toBeGreaterThan(
      Date.now(),
    );

    await request(app)
      .post(`/api/payment-evidence/${evidenceAId}/view`)
      .set('Origin', environment.APP_ORIGIN)
      .set('Cookie', cookieB)
      .send({})
      .expect(404);
  });

  it('captures duplicate signed webhook deliveries exactly once', async () => {
    const rawBody = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba-integration',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { phone_number_id: providerPhoneA },
                messages: [],
              },
            },
          ],
        },
      ],
    });
    const signature = createHmac('sha256', environment.WHATSAPP_APP_SECRET!)
      .update(rawBody)
      .digest('hex');

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await request(app)
        .post('/api/webhooks/whatsapp')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature-256', `sha256=${signature}`)
        .send(rawBody)
        .expect(200, { received: true });
    }

    const rows = await database.webhookInbox.findMany({
      where: { organizationId: organizationAId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      connectionId: connectionAId,
      attemptCount: 0,
    });
  });

  it('leases an inbox delivery to only one worker at a time', async () => {
    const now = new Date(Date.now() + 1_000);
    const leases = await Promise.all([
      repository.leaseInbox({
        workerId: 'integration-worker-a',
        now,
        leaseExpiresAt: new Date(now.getTime() + 30_000),
      }),
      repository.leaseInbox({
        workerId: 'integration-worker-b',
        now,
        leaseExpiresAt: new Date(now.getTime() + 30_000),
      }),
    ]);
    expect(leases.filter(Boolean)).toHaveLength(1);
    expect(leases.find(Boolean)?.attemptCount).toBe(1);
  });

  it('updates only the owner tenant connection and audits the action', async () => {
    await request(app)
      .patch('/api/whatsapp/connection/state')
      .set('Origin', environment.APP_ORIGIN)
      .set('Cookie', cookieA)
      .send({ state: 'PAUSED' })
      .expect(200);

    await expect(
      database.whatsAppConnection.findUniqueOrThrow({
        where: { id: connectionAId },
        select: { state: true },
      }),
    ).resolves.toEqual({ state: WhatsAppConnectionState.PAUSED });
    await expect(
      database.whatsAppConnection.findUniqueOrThrow({
        where: { id: connectionBId },
        select: { state: true },
      }),
    ).resolves.toEqual({ state: WhatsAppConnectionState.LIVE });
    await expect(
      database.auditLog.count({
        where: {
          organizationId: organizationAId,
          action: 'WHATSAPP_CONNECTION_STATE_CHANGED',
          entityId: connectionAId,
        },
      }),
    ).resolves.toBe(1);
  });

  async function login(email: string): Promise<string> {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Origin', environment.APP_ORIGIN)
      .send({ email, password })
      .expect(200);
    const cookie = (response.headers['set-cookie']?.[0] ?? '').split(';', 1)[0];
    if (!cookie) throw new Error('Login did not return a session cookie');
    return cookie;
  }
});

function databaseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
