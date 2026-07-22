import { randomUUID } from 'node:crypto';

import bcrypt from 'bcrypt';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from './app.js';
import { loadEnvironment, type Environment } from './config/env.js';
import type { PrismaClient } from './generated/prisma/client.js';
import {
  CommunicationChannel,
  MembershipRole,
} from './generated/prisma/enums.js';
import { createDatabaseClient } from './lib/database.js';
import { PrismaAuthRepository } from './repositories/auth.repository.js';
import { PrismaCommunicationRepository } from './repositories/communication.repository.js';
import { PrismaReceivablesRepository } from './repositories/receivables.repository.js';
import { AuthService } from './services/auth.service.js';
import { CollectionQueueService } from './services/collection-queue.service.js';
import { CommunicationService } from './services/communication.service.js';
import { ReceivablesService } from './services/receivables.service.js';

const integrationDescribe = describe.runIf(
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true',
);

integrationDescribe('communication workflow with PostgreSQL', () => {
  const organizationAId = randomUUID();
  const organizationBId = randomUUID();
  const userAId = randomUUID();
  const userBId = randomUUID();
  const debtorAId = randomUUID();
  const debtorBId = randomUUID();
  const invoiceAId = randomUUID();
  const invoiceBId = randomUUID();
  const queueRefreshInvoiceId = randomUUID();
  const timelineInvoiceId = randomUUID();
  const password = `communication-${randomUUID()}`;
  const emailA = `communication-a-${randomUUID()}@integration.arus.local`;
  const emailB = `communication-b-${randomUUID()}@integration.arus.local`;
  const occurredAt = new Date('2026-07-16T03:00:00.000Z');

  let database: PrismaClient;
  let environment: Environment;
  let app: ReturnType<typeof createApp>;
  let cookieA: string;
  let cookieB: string;

  beforeAll(async () => {
    environment = loadEnvironment({
      ...process.env,
      NODE_ENV: 'test',
      SESSION_SECRET: 'communication-integration-secret-with-adequate-length',
    });
    database = createDatabaseClient(environment);
    const logger = pino({ level: 'silent' });
    const passwordHash = await bcrypt.hash(password, 12);

    await database.organization.createMany({
      data: [
        {
          id: organizationAId,
          name: 'Communication Integration A',
          timezone: 'Asia/Jakarta',
        },
        {
          id: organizationBId,
          name: 'Communication Integration B',
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
          name: 'Communication Owner A',
        },
        {
          id: userBId,
          email: emailB,
          normalizedEmail: emailB,
          passwordHash,
          name: 'Communication Operator B',
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
          role: MembershipRole.OPERATOR,
        },
      ],
    });
    await database.debtor.createMany({
      data: [
        {
          id: debtorAId,
          organizationId: organizationAId,
          code: 'COMM-A',
          normalizedCode: 'comm-a',
          name: 'Communication Debtor A',
          normalizedName: 'communication debtor a',
        },
        {
          id: debtorBId,
          organizationId: organizationBId,
          code: 'COMM-B',
          normalizedCode: 'comm-b',
          name: 'Communication Debtor B',
          normalizedName: 'communication debtor b',
        },
      ],
    });
    await database.invoice.createMany({
      data: [
        {
          id: invoiceAId,
          organizationId: organizationAId,
          debtorId: debtorAId,
          invoiceNumber: 'INV-COMM-A',
          normalizedInvoiceNumber: 'inv-comm-a',
          invoiceDate: databaseDate('2026-06-01'),
          dueDate: databaseDate('2026-06-30'),
          originalAmount: '1000000.00',
        },
        {
          id: invoiceBId,
          organizationId: organizationBId,
          debtorId: debtorBId,
          invoiceNumber: 'INV-COMM-B',
          normalizedInvoiceNumber: 'inv-comm-b',
          invoiceDate: databaseDate('2026-06-01'),
          dueDate: databaseDate('2026-06-30'),
          originalAmount: '1000000.00',
        },
        {
          id: queueRefreshInvoiceId,
          organizationId: organizationAId,
          debtorId: debtorAId,
          invoiceNumber: 'INV-COMM-QUEUE',
          normalizedInvoiceNumber: 'inv-comm-queue',
          invoiceDate: databaseDate('2026-06-01'),
          dueDate: databaseDate('2026-06-30'),
          originalAmount: '1000000.00',
        },
        {
          id: timelineInvoiceId,
          organizationId: organizationAId,
          debtorId: debtorAId,
          invoiceNumber: 'INV-COMM-TIMELINE',
          normalizedInvoiceNumber: 'inv-comm-timeline',
          invoiceDate: databaseDate('2026-06-01'),
          dueDate: databaseDate('2026-06-30'),
          originalAmount: '1000000.00',
        },
      ],
    });

    const authService = new AuthService({
      repository: new PrismaAuthRepository(database),
      environment,
      logger,
    });
    const communicationService = new CommunicationService({
      repository: new PrismaCommunicationRepository(database),
      clock: () => occurredAt,
    });
    const receivablesRepository = new PrismaReceivablesRepository(database);
    const collectionQueueService = new CollectionQueueService({
      repository: receivablesRepository,
      clock: () => occurredAt,
    });
    const receivablesService = new ReceivablesService({
      repository: receivablesRepository,
      clock: () => occurredAt,
    });
    app = createApp({
      authService,
      collectionQueueService,
      communicationService,
      receivablesService,
      environment,
      logger,
    });
    [cookieA, cookieB] = await Promise.all([login(emailA), login(emailB)]);
  }, 30_000);

  afterAll(async () => {
    if (!database) return;

    const organizations = [organizationAId, organizationBId];
    await database.communication.deleteMany({
      where: { organizationId: { in: organizations } },
    });
    await database.invoice.deleteMany({
      where: { organizationId: { in: organizations } },
    });
    await database.debtor.deleteMany({
      where: { organizationId: { in: organizations } },
    });
    await database.auditLog.deleteMany({
      where: { organizationId: { in: organizations } },
    });
    await database.session.deleteMany({
      where: { organizationId: { in: organizations } },
    });
    await database.membership.deleteMany({
      where: { organizationId: { in: organizations } },
    });
    await database.user.deleteMany({
      where: { id: { in: [userAId, userBId] } },
    });
    await database.organization.deleteMany({
      where: { id: { in: organizations } },
    });
    await database.$disconnect();
  }, 30_000);

  it('persists normalized evidence and one safe audit event', async () => {
    const operationKey = randomUUID();
    const response = await postCommunication({
      cookie: cookieA,
      invoiceId: invoiceAId,
      operationKey,
      body: {
        channel: 'CALL',
        notes: '  Accounts payable confirmed review.\r\nCall again tomorrow.  ',
        nextFollowUpDate: '2026-07-17',
      },
    }).expect(201);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      data: {
        id: expect.any(String),
        invoiceId: invoiceAId,
        occurredAt: occurredAt.toISOString(),
        channel: 'CALL',
        notes: 'Accounts payable confirmed review.\nCall again tomorrow.',
        nextFollowUpDate: '2026-07-17',
        actor: {
          id: userAId,
          name: 'Communication Owner A',
          role: 'OWNER',
        },
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
      replayed: false,
    });

    const communication = await database.communication.findUniqueOrThrow({
      where: {
        organizationId_operationKey: {
          organizationId: organizationAId,
          operationKey,
        },
      },
    });
    expect(communication).toMatchObject({
      organizationId: organizationAId,
      invoiceId: invoiceAId,
      actorId: userAId,
      actorRole: MembershipRole.OWNER,
      occurredAt,
      notes: 'Accounts payable confirmed review.\nCall again tomorrow.',
    });
    const audits = await database.auditLog.findMany({
      where: {
        organizationId: organizationAId,
        entityType: 'Communication',
        entityId: communication.id,
      },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorId: userAId,
      action: 'COMMUNICATION_RECORDED',
      metadata: {
        invoiceId: invoiceAId,
        channel: 'CALL',
        hasNextFollowUp: true,
      },
    });
    expect(JSON.stringify(audits)).not.toContain('Accounts payable');
  });

  it('refreshes queue contact facts and score from persisted evidence', async () => {
    const before = await queueItem(queueRefreshInvoiceId);
    expect(before).toMatchObject({
      lastContactAt: null,
      nextFollowUpDate: null,
      daysSinceLastContact: 30,
      priority: { score: '18.10', components: { stale: '15.00' } },
    });

    await postCommunication({
      cookie: cookieA,
      invoiceId: queueRefreshInvoiceId,
      operationKey: randomUUID(),
      body: {
        channel: 'CALL',
        notes: 'Confirmed invoice is in the payment run.',
        nextFollowUpDate: '2026-07-17',
      },
    }).expect(201);

    const after = await queueItem(queueRefreshInvoiceId);
    expect(after).toMatchObject({
      lastContactAt: occurredAt.toISOString(),
      lastContactDate: '2026-07-16',
      nextFollowUpDate: '2026-07-17',
      daysSinceLastContact: 0,
      priority: { score: '3.10', components: { stale: '0.00' } },
    });
  });

  it('returns the recorded actor, time, and follow-up in invoice history', async () => {
    const notes = 'Customer confirmed the invoice reached treasury.';
    const created = await postCommunication({
      cookie: cookieA,
      invoiceId: timelineInvoiceId,
      operationKey: randomUUID(),
      body: {
        channel: 'EMAIL',
        notes,
        nextFollowUpDate: '2026-07-17',
      },
    }).expect(201);

    const response = await request(app)
      .get(`/api/invoices/${timelineInvoiceId}?asOfDate=2026-07-10`)
      .set('Cookie', cookieA)
      .expect(200);

    expect(response.body.meta).toEqual({
      asOfDate: '2026-07-10',
      workflowBusinessDate: '2026-07-16',
      timeZone: 'Asia/Jakarta',
    });
    expect(response.body.data.nextFollowUpSuggestion).toEqual({
      date: '2026-07-17',
      basis: 'STANDARD_NEXT_DAY',
    });
    expect(response.body.data.communications).toHaveLength(1);
    expect(response.body.data.communications[0]).toEqual({
      id: created.body.data.id,
      occurredAt: created.body.data.occurredAt,
      channel: 'EMAIL',
      notes,
      nextFollowUpDate: '2026-07-17',
      actor: created.body.data.actor,
      createdAt: created.body.data.createdAt,
      updatedAt: created.body.data.updatedAt,
    });
  });

  it('replays the same operation without duplicate evidence or audit', async () => {
    const operationKey = randomUUID();
    const body = {
      channel: 'EMAIL',
      notes: 'Sent invoice evidence.',
      nextFollowUpDate: null,
    };
    const first = await postCommunication({
      cookie: cookieA,
      invoiceId: invoiceAId,
      operationKey,
      body,
    }).expect(201);
    const replay = await postCommunication({
      cookie: cookieA,
      invoiceId: invoiceAId,
      operationKey,
      body,
    }).expect(200);

    expect(replay.body.data.id).toBe(first.body.data.id);
    expect(replay.body.replayed).toBe(true);
    await expect(
      database.communication.count({
        where: { organizationId: organizationAId, operationKey },
      }),
    ).resolves.toBe(1);
    await expect(
      database.auditLog.count({
        where: {
          organizationId: organizationAId,
          entityType: 'Communication',
          entityId: first.body.data.id,
        },
      }),
    ).resolves.toBe(1);
  });

  it('rejects reuse of an operation key for a different command', async () => {
    const operationKey = randomUUID();
    await postCommunication({
      cookie: cookieA,
      invoiceId: invoiceAId,
      operationKey,
      body: {
        channel: 'WHATSAPP',
        notes: 'First outcome.',
        nextFollowUpDate: '2026-07-18',
      },
    }).expect(201);
    const conflict = await postCommunication({
      cookie: cookieA,
      invoiceId: invoiceAId,
      operationKey,
      body: {
        channel: 'WHATSAPP',
        notes: 'Changed outcome.',
        nextFollowUpDate: '2026-07-18',
      },
    }).expect(409);

    expect(conflict.body.error.code).toBe('COMMUNICATION_IDEMPOTENCY_CONFLICT');
    await expect(
      database.communication.count({
        where: { organizationId: organizationAId, operationKey },
      }),
    ).resolves.toBe(1);
  });

  it('rolls back communication evidence when its audit cannot persist', async () => {
    const operationKey = randomUUID();
    const repository = new PrismaCommunicationRepository(database);

    await expect(
      repository.recordCommunication({
        organizationId: organizationAId,
        invoiceId: invoiceAId,
        actorId: userAId,
        actorRole: MembershipRole.OWNER,
        operationKey,
        requestId: 'x'.repeat(129),
        occurredAt,
        channel: CommunicationChannel.OTHER,
        notes: 'This transaction must roll back.',
        nextFollowUpDate: null,
      }),
    ).rejects.toBeInstanceOf(Error);
    await expect(
      database.communication.count({
        where: { organizationId: organizationAId, operationKey },
      }),
    ).resolves.toBe(0);
  });

  it('enforces authentication, trusted origin, JSON, and operation keys', async () => {
    const operationKey = randomUUID();
    const body = {
      channel: 'CALL',
      notes: 'Security boundary test.',
      nextFollowUpDate: null,
    };
    const unauthenticated = await request(app)
      .post(`/api/invoices/${invoiceAId}/communications`)
      .set('Origin', environment.APP_ORIGIN)
      .set('Idempotency-Key', operationKey)
      .send(body)
      .expect(401);
    const untrusted = await request(app)
      .post(`/api/invoices/${invoiceAId}/communications`)
      .set('Origin', 'https://attacker.invalid')
      .set('Cookie', cookieA)
      .set('Idempotency-Key', operationKey)
      .send(body)
      .expect(403);
    const wrongMediaType = await request(app)
      .post(`/api/invoices/${invoiceAId}/communications`)
      .set('Origin', environment.APP_ORIGIN)
      .set('Cookie', cookieA)
      .set('Idempotency-Key', operationKey)
      .set('Content-Type', 'text/plain')
      .send('not-json')
      .expect(415);
    const missingKey = await request(app)
      .post(`/api/invoices/${invoiceAId}/communications`)
      .set('Origin', environment.APP_ORIGIN)
      .set('Cookie', cookieA)
      .send(body)
      .expect(400);

    expect(unauthenticated.body.error.code).toBe('UNAUTHENTICATED');
    expect(untrusted.body.error.code).toBe('UNTRUSTED_ORIGIN');
    expect(wrongMediaType.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(missingKey.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      fields: { idempotencyKey: expect.any(String) },
    });
  });

  it('rejects forged tenant and server-owned evidence fields', async () => {
    const countBefore = await database.communication.count({
      where: { organizationId: organizationAId },
    });
    const response = await postCommunication({
      cookie: cookieA,
      invoiceId: invoiceAId,
      operationKey: randomUUID(),
      body: {
        channel: 'EMAIL',
        notes: 'Attempted forged context.',
        nextFollowUpDate: null,
        organizationId: organizationBId,
        actorId: userBId,
        actorRole: 'OPERATOR',
        occurredAt: '2020-01-01T00:00:00.000Z',
      },
    }).expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    await expect(
      database.communication.count({
        where: { organizationId: organizationAId },
      }),
    ).resolves.toBe(countBefore);
  });

  it('hides cross-tenant invoices without creating evidence or audit', async () => {
    const operationKeys = [randomUUID(), randomUUID()] as const;
    const body = {
      channel: 'OTHER',
      notes: 'Must remain tenant hidden.',
      nextFollowUpDate: null,
    };
    const fromA = await postCommunication({
      cookie: cookieA,
      invoiceId: invoiceBId,
      operationKey: operationKeys[0],
      body,
    }).expect(404);
    const fromB = await postCommunication({
      cookie: cookieB,
      invoiceId: invoiceAId,
      operationKey: operationKeys[1],
      body,
    }).expect(404);

    expect(fromA.body.error.code).toBe('INVOICE_NOT_FOUND');
    expect(fromB.body.error.code).toBe('INVOICE_NOT_FOUND');
    await expect(
      database.communication.count({
        where: { operationKey: { in: [...operationKeys] } },
      }),
    ).resolves.toBe(0);
  });

  it('rejects past schedules and directional control characters', async () => {
    const past = await postCommunication({
      cookie: cookieA,
      invoiceId: invoiceAId,
      operationKey: randomUUID(),
      body: {
        channel: 'CALL',
        notes: 'Past schedule.',
        nextFollowUpDate: '2026-07-15',
      },
    }).expect(422);
    const unsafeText = await postCommunication({
      cookie: cookieA,
      invoiceId: invoiceAId,
      operationKey: randomUUID(),
      body: {
        channel: 'CALL',
        notes: 'Invoice \u202e001',
        nextFollowUpDate: null,
      },
    }).expect(400);

    expect(past.body.error).toMatchObject({
      code: 'INVALID_NEXT_FOLLOW_UP_DATE',
      fields: { nextFollowUpDate: expect.any(String) },
    });
    expect(unsafeText.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      fields: { notes: 'Notes contain unsupported characters' },
    });
  });

  it('preserves XSS-like notes as inert text data', async () => {
    const notes = '<script>alert("collection")</script>';
    const response = await postCommunication({
      cookie: cookieA,
      invoiceId: invoiceAId,
      operationKey: randomUUID(),
      body: { channel: 'OTHER', notes, nextFollowUpDate: null },
    }).expect(201);

    expect(response.body.data.notes).toBe(notes);
    await expect(
      database.communication.findUniqueOrThrow({
        where: { id: response.body.data.id },
        select: { notes: true },
      }),
    ).resolves.toEqual({ notes });
  });

  it('enforces tenant consistency at the database boundary', async () => {
    await expect(
      database.communication.create({
        data: {
          organizationId: organizationAId,
          invoiceId: invoiceBId,
          actorId: userAId,
          actorRole: MembershipRole.OWNER,
          operationKey: randomUUID(),
          occurredAt,
          channel: CommunicationChannel.CALL,
          notes: 'Cross-tenant invoice reference.',
        },
      }),
    ).rejects.toBeInstanceOf(Error);
    await expect(
      database.communication.create({
        data: {
          organizationId: organizationAId,
          invoiceId: invoiceAId,
          actorId: userBId,
          actorRole: MembershipRole.OPERATOR,
          operationKey: randomUUID(),
          occurredAt,
          channel: CommunicationChannel.CALL,
          notes: 'Cross-tenant actor reference.',
        },
      }),
    ).rejects.toBeInstanceOf(Error);
  });

  function postCommunication(input: {
    cookie: string;
    invoiceId: string;
    operationKey: string;
    body: Record<string, unknown>;
  }) {
    return request(app)
      .post(`/api/invoices/${input.invoiceId}/communications`)
      .set('Origin', environment.APP_ORIGIN)
      .set('Cookie', input.cookie)
      .set('Idempotency-Key', input.operationKey)
      .send(input.body);
  }

  async function queueItem(
    invoiceId: string,
  ): Promise<Record<string, unknown>> {
    const response = await request(app)
      .get('/api/collection-queue?asOfDate=2026-07-16&limit=100')
      .set('Cookie', cookieA)
      .expect(200);
    const item = (response.body.data as Array<Record<string, unknown>>).find(
      (candidate) => candidate.id === invoiceId,
    );
    if (!item) throw new Error(`Queue did not include invoice ${invoiceId}`);
    return item;
  }

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
