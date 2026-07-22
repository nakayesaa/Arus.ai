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
import { AuthService } from './services/auth.service.js';
import { CommunicationService } from './services/communication.service.js';

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
  const password = `communication-${randomUUID()}`;
  const emailA = `communication-a-${randomUUID()}@integration.arus.local`;
  const emailB = `communication-b-${randomUUID()}@integration.arus.local`;
  const occurredAt = new Date('2026-07-16T03:00:00.000Z');

  let database: PrismaClient;
  let environment: Environment;
  let app: ReturnType<typeof createApp>;
  let cookieA: string;

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
    app = createApp({
      authService,
      communicationService,
      environment,
      logger,
    });
    cookieA = await login(emailA);
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
