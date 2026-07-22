import { randomUUID } from 'node:crypto';

import bcrypt from 'bcrypt';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from './app.js';
import { loadEnvironment, type Environment } from './config/env.js';
import type { PrismaClient } from './generated/prisma/client.js';
import { DisputeCategory, MembershipRole } from './generated/prisma/enums.js';
import { createDatabaseClient } from './lib/database.js';
import { PrismaAuthRepository } from './repositories/auth.repository.js';
import { PrismaDisputeRepository } from './repositories/dispute.repository.js';
import { PrismaPromiseRepository } from './repositories/promise.repository.js';
import { PrismaReceivablesRepository } from './repositories/receivables.repository.js';
import { AuthService } from './services/auth.service.js';
import { CollectionQueueService } from './services/collection-queue.service.js';
import { DashboardService } from './services/dashboard.service.js';
import { DisputeService } from './services/dispute.service.js';
import { PromiseService } from './services/promise.service.js';
import { ReceivablesService } from './services/receivables.service.js';

const integrationDescribe = describe.runIf(
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true',
);

integrationDescribe('collection case workflows with PostgreSQL', () => {
  const organizationAId = randomUUID();
  const organizationBId = randomUUID();
  const userAId = randomUUID();
  const userBId = randomUUID();
  const debtorAId = randomUUID();
  const debtorBId = randomUUID();
  const promiseInvoiceId = randomUUID();
  const validationInvoiceId = randomUUID();
  const concurrentInvoiceId = randomUUID();
  const disputeInvoiceId = randomUUID();
  const rollbackInvoiceId = randomUUID();
  const foreignInvoiceId = randomUUID();
  const password = `collection-cases-${randomUUID()}`;
  const emailA = `cases-a-${randomUUID()}@integration.arus.local`;
  const emailB = `cases-b-${randomUUID()}@integration.arus.local`;
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
      SESSION_SECRET: 'collection-case-integration-secret-long-enough',
    });
    database = createDatabaseClient(environment);
    const logger = pino({ level: 'silent' });
    const passwordHash = await bcrypt.hash(password, 12);

    await database.organization.createMany({
      data: [
        {
          id: organizationAId,
          name: 'Collection Case Integration A',
          timezone: 'Asia/Jakarta',
        },
        {
          id: organizationBId,
          name: 'Collection Case Integration B',
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
          name: 'Collection Owner A',
        },
        {
          id: userBId,
          email: emailB,
          normalizedEmail: emailB,
          passwordHash,
          name: 'Collection Operator B',
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
          code: 'CASE-A',
          normalizedCode: 'case-a',
          name: 'Collection Case Debtor A',
          normalizedName: 'collection case debtor a',
        },
        {
          id: debtorBId,
          organizationId: organizationBId,
          code: 'CASE-B',
          normalizedCode: 'case-b',
          name: 'Collection Case Debtor B',
          normalizedName: 'collection case debtor b',
        },
      ],
    });
    await database.invoice.createMany({
      data: [
        ...(
          [
            [promiseInvoiceId, 'PROMISE'],
            [validationInvoiceId, 'VALIDATION'],
            [concurrentInvoiceId, 'CONCURRENT'],
            [disputeInvoiceId, 'DISPUTE'],
            [rollbackInvoiceId, 'ROLLBACK'],
          ] as const
        ).map(([id, suffix]) => ({
          id,
          organizationId: organizationAId,
          debtorId: debtorAId,
          invoiceNumber: `INV-CASE-${suffix}`,
          normalizedInvoiceNumber: `inv-case-${suffix.toLowerCase()}`,
          invoiceDate: databaseDate('2026-06-01'),
          dueDate: databaseDate('2026-06-30'),
          originalAmount: '1000000.00',
        })),
        {
          id: foreignInvoiceId,
          organizationId: organizationBId,
          debtorId: debtorBId,
          invoiceNumber: 'INV-CASE-FOREIGN',
          normalizedInvoiceNumber: 'inv-case-foreign',
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
    const receivablesRepository = new PrismaReceivablesRepository(database);
    app = createApp({
      authService,
      receivablesService: new ReceivablesService({
        repository: receivablesRepository,
        clock: () => occurredAt,
      }),
      collectionQueueService: new CollectionQueueService({
        repository: receivablesRepository,
        clock: () => occurredAt,
      }),
      dashboardService: new DashboardService({
        repository: receivablesRepository,
        clock: () => occurredAt,
      }),
      promiseService: new PromiseService({
        repository: new PrismaPromiseRepository(database),
        clock: () => occurredAt,
      }),
      disputeService: new DisputeService({
        repository: new PrismaDisputeRepository(database),
        clock: () => occurredAt,
      }),
      environment,
      logger,
    });
    [cookieA, cookieB] = await Promise.all([login(emailA), login(emailB)]);
  }, 30_000);

  afterAll(async () => {
    if (!database) return;
    const organizationIds = [organizationAId, organizationBId];
    await database.dispute.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await database.promiseToPay.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await database.invoice.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await database.debtor.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await database.auditLog.deleteMany({
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

  it('creates, replays, protects, and cancels a promise with immutable evidence', async () => {
    const createKey = randomUUID();
    const body = { amount: '400000', promiseDate: '2026-07-20' };
    const created = await postPromise(
      cookieA,
      promiseInvoiceId,
      createKey,
      body,
    ).expect(201);
    expect(created.headers['cache-control']).toBe('no-store');
    expect(created.body).toMatchObject({
      replayed: false,
      data: {
        invoiceId: promiseInvoiceId,
        amount: '400000.00',
        promiseDate: '2026-07-20',
        status: 'ACTIVE',
        createdBy: { id: userAId, role: 'OWNER' },
      },
    });

    const replay = await postPromise(
      cookieA,
      promiseInvoiceId,
      createKey,
      body,
    ).expect(200);
    expect(replay.body).toMatchObject({
      replayed: true,
      data: { id: created.body.data.id },
    });
    await postPromise(cookieA, promiseInvoiceId, createKey, {
      ...body,
      amount: '300000',
    }).expect(409);
    const blocked = await postPromise(
      cookieA,
      promiseInvoiceId,
      randomUUID(),
      body,
    ).expect(409);
    expect(blocked.body.error.code).toBe('ACTIVE_PROMISE_EXISTS');

    const cancellationKey = randomUUID();
    const cancelled = await postPromiseCancellation(
      cookieA,
      created.body.data.id,
      cancellationKey,
      'Customer corrected the commitment date.',
    ).expect(200);
    expect(cancelled.body).toMatchObject({
      replayed: false,
      data: {
        status: 'CANCELLED',
        cancelReason: 'Customer corrected the commitment date.',
        cancelledBy: { id: userAId, role: 'OWNER' },
      },
    });
    const cancellationReplay = await postPromiseCancellation(
      cookieA,
      created.body.data.id,
      cancellationKey,
      'Customer corrected the commitment date.',
    ).expect(200);
    expect(cancellationReplay.body.replayed).toBe(true);
    await postPromiseCancellation(
      cookieA,
      created.body.data.id,
      randomUUID(),
      'Attempt to rewrite final evidence.',
    ).expect(409);
    await expect(
      database.promiseToPay.update({
        where: { id: created.body.data.id },
        data: { cancelReason: 'Mutated evidence' },
      }),
    ).rejects.toBeInstanceOf(Error);

    const audits = await database.auditLog.findMany({
      where: {
        organizationId: organizationAId,
        entityType: 'PromiseToPay',
        entityId: created.body.data.id,
      },
    });
    expect(audits.map((audit) => audit.action).sort()).toEqual([
      'PROMISE_CANCELLED',
      'PROMISE_CREATED',
    ]);
    expect(JSON.stringify(audits)).not.toContain('corrected the commitment');
  });

  it('validates promise dates and current outstanding before persistence', async () => {
    const overBalance = await postPromise(
      cookieA,
      validationInvoiceId,
      randomUUID(),
      { amount: '1000000.01', promiseDate: '2026-07-20' },
    ).expect(422);
    const pastDate = await postPromise(
      cookieA,
      validationInvoiceId,
      randomUUID(),
      { amount: '1.00', promiseDate: '2026-07-15' },
    ).expect(422);

    expect(overBalance.body.error).toMatchObject({
      code: 'INVALID_PROMISE_AMOUNT',
      fields: { amount: expect.any(String) },
    });
    expect(pastDate.body.error).toMatchObject({
      code: 'INVALID_PROMISE_DATE',
      fields: { promiseDate: expect.any(String) },
    });
    await expect(
      database.promiseToPay.count({
        where: { invoiceId: validationInvoiceId },
      }),
    ).resolves.toBe(0);
  });

  it('serializes competing promise creation for one invoice', async () => {
    const responses = await Promise.all(
      [randomUUID(), randomUUID()].map((operationKey) =>
        postPromise(cookieA, concurrentInvoiceId, operationKey, {
          amount: '250000.00',
          promiseDate: '2026-07-21',
        }),
      ),
    );

    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    await expect(
      database.promiseToPay.count({
        where: { invoiceId: concurrentInvoiceId },
      }),
    ).resolves.toBe(1);
  });

  it('creates and resolves a dispute with replay-safe, immutable evidence', async () => {
    const createKey = randomUUID();
    const body = {
      category: DisputeCategory.WRONG_AMOUNT,
      details: '  Customer found a tax mismatch.\r\nAwaiting credit note.  ',
    };
    const created = await postDispute(
      cookieA,
      disputeInvoiceId,
      createKey,
      body,
    ).expect(201);
    expect(created.body).toMatchObject({
      replayed: false,
      data: {
        invoiceId: disputeInvoiceId,
        category: 'WRONG_AMOUNT',
        details: 'Customer found a tax mismatch.\nAwaiting credit note.',
        status: 'OPEN',
        createdBy: { id: userAId, role: 'OWNER' },
      },
    });
    const replay = await postDispute(
      cookieA,
      disputeInvoiceId,
      createKey,
      body,
    ).expect(200);
    expect(replay.body).toMatchObject({
      replayed: true,
      data: { id: created.body.data.id },
    });

    const resolutionKey = randomUUID();
    const resolved = await postDisputeResolution(
      cookieA,
      created.body.data.id,
      resolutionKey,
      'Credit note approved and sent.',
    ).expect(200);
    expect(resolved.body).toMatchObject({
      replayed: false,
      data: {
        status: 'RESOLVED',
        resolutionNote: 'Credit note approved and sent.',
        resolvedBy: { id: userAId, role: 'OWNER' },
      },
    });
    const resolutionReplay = await postDisputeResolution(
      cookieA,
      created.body.data.id,
      resolutionKey,
      'Credit note approved and sent.',
    ).expect(200);
    expect(resolutionReplay.body.replayed).toBe(true);
    await postDisputeResolution(
      cookieA,
      created.body.data.id,
      randomUUID(),
      null,
    ).expect(409);
    await expect(
      database.dispute.update({
        where: { id: created.body.data.id },
        data: { resolutionNote: 'Mutated evidence' },
      }),
    ).rejects.toBeInstanceOf(Error);

    const audits = await database.auditLog.findMany({
      where: {
        organizationId: organizationAId,
        entityType: 'Dispute',
        entityId: created.body.data.id,
      },
    });
    expect(audits.map((audit) => audit.action).sort()).toEqual([
      'DISPUTE_CREATED',
      'DISPUTE_RESOLVED',
    ]);
    expect(JSON.stringify(audits)).not.toContain('tax mismatch');
    expect(JSON.stringify(audits)).not.toContain('Credit note approved');
  });

  it('rejects forged fields, unsafe text, untrusted origins, and cross-tenant ids', async () => {
    const forged = await postPromise(
      cookieA,
      validationInvoiceId,
      randomUUID(),
      {
        amount: '1.00',
        promiseDate: '2026-07-20',
        organizationId: organizationBId,
        createdById: userBId,
      },
    ).expect(400);
    const unsafe = await postDispute(cookieA, disputeInvoiceId, randomUUID(), {
      category: DisputeCategory.OTHER,
      details: 'Unsafe direction \u202e marker',
    }).expect(400);
    const promiseCrossTenant = await postPromise(
      cookieA,
      foreignInvoiceId,
      randomUUID(),
      { amount: '1.00', promiseDate: '2026-07-20' },
    ).expect(404);
    const disputeCrossTenant = await postDispute(
      cookieB,
      disputeInvoiceId,
      randomUUID(),
      {
        category: DisputeCategory.OTHER,
        details: 'Must stay tenant hidden.',
      },
    ).expect(404);
    const untrusted = await request(app)
      .post(`/api/invoices/${disputeInvoiceId}/disputes`)
      .set('Origin', 'https://attacker.invalid')
      .set('Cookie', cookieA)
      .set('Idempotency-Key', randomUUID())
      .send({
        category: DisputeCategory.OTHER,
        details: 'Untrusted request.',
      })
      .expect(403);

    expect(forged.body.error.code).toBe('VALIDATION_ERROR');
    expect(unsafe.body.error.code).toBe('VALIDATION_ERROR');
    expect(promiseCrossTenant.body.error.code).toBe('INVOICE_NOT_FOUND');
    expect(disputeCrossTenant.body.error.code).toBe('INVOICE_NOT_FOUND');
    expect(untrusted.body.error.code).toBe('UNTRUSTED_ORIGIN');
  });

  it('rolls back case evidence when its audit event cannot persist', async () => {
    const promiseKey = randomUUID();
    const disputeKey = randomUUID();

    await expect(
      new PrismaPromiseRepository(database).createPromise({
        organizationId: organizationAId,
        invoiceId: rollbackInvoiceId,
        actorId: userAId,
        actorRole: MembershipRole.OWNER,
        operationKey: promiseKey,
        requestId: 'x'.repeat(129),
        occurredAt,
        asOfDate: '2026-07-16',
        amount: '100.00',
        promiseDate: '2026-07-20',
      }),
    ).rejects.toBeInstanceOf(Error);
    await expect(
      new PrismaDisputeRepository(database).createDispute({
        organizationId: organizationAId,
        invoiceId: rollbackInvoiceId,
        actorId: userAId,
        actorRole: MembershipRole.OWNER,
        operationKey: disputeKey,
        requestId: 'x'.repeat(129),
        occurredAt,
        category: DisputeCategory.OTHER,
        details: 'This transaction must roll back.',
      }),
    ).rejects.toBeInstanceOf(Error);

    await expect(
      database.promiseToPay.count({ where: { operationKey: promiseKey } }),
    ).resolves.toBe(0);
    await expect(
      database.dispute.count({ where: { operationKey: disputeKey } }),
    ).resolves.toBe(0);
  });

  it('projects promises and disputes into invoice, queue, and dashboard decisions', async () => {
    await postPromise(cookieA, validationInvoiceId, randomUUID(), {
      amount: '100.00',
      promiseDate: '2026-07-16',
    }).expect(201);
    await postDispute(cookieA, rollbackInvoiceId, randomUUID(), {
      category: DisputeCategory.ADMINISTRATIVE,
      details: 'Customer needs a corrected purchase-order reference.',
    }).expect(201);

    const promisedInvoice = await request(app)
      .get(`/api/invoices/${validationInvoiceId}`)
      .set('Cookie', cookieA)
      .expect(200);
    expect(promisedInvoice.body.data.promises).toEqual([
      expect.objectContaining({
        amount: '100.00',
        promiseDate: '2026-07-16',
        status: 'DUE',
      }),
    ]);
    const disputedInvoice = await request(app)
      .get(`/api/invoices/${rollbackInvoiceId}`)
      .set('Cookie', cookieA)
      .expect(200);
    expect(disputedInvoice.body.data).toMatchObject({
      disputes: [
        {
          id: expect.any(String),
          category: 'ADMINISTRATIVE',
          details: 'Customer needs a corrected purchase-order reference.',
          status: 'OPEN',
          resolutionNote: null,
          createdBy: { id: userAId, name: 'Collection Owner A', role: 'OWNER' },
          resolvedBy: null,
          resolvedAt: null,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        },
      ],
      nextFollowUpSuggestion: { date: null, basis: 'OPEN_DISPUTE' },
    });

    const queue = await request(app)
      .get('/api/collection-queue?asOfDate=2026-07-16&limit=100')
      .set('Cookie', cookieA)
      .expect(200);
    const queueIds = queue.body.data.map((item: { id: string }) => item.id);
    expect(queueIds).toContain(validationInvoiceId);
    expect(queueIds).not.toContain(rollbackInvoiceId);
    expect(
      queue.body.data.find(
        (item: { id: string }) => item.id === validationInvoiceId,
      ),
    ).toMatchObject({
      promiseStatus: 'DUE',
      reasons: ['PROMISE_DUE', 'OVERDUE'],
    });

    const brokenPromiseId = randomUUID();
    await database.promiseToPay.create({
      data: {
        id: brokenPromiseId,
        organizationId: organizationAId,
        invoiceId: promiseInvoiceId,
        amount: '250000.00',
        promiseDate: databaseDate('2026-07-15'),
        createdById: userAId,
        createdByRole: MembershipRole.OWNER,
        operationKey: randomUUID(),
        createdAt: new Date('2026-07-10T03:00:00.000Z'),
      },
    });

    const dashboard = await request(app)
      .get('/api/dashboard?asOfDate=2026-07-16')
      .set('Cookie', cookieA)
      .expect(200);
    expect(dashboard.body.data.workflows).toEqual({
      brokenPromiseCount: 1,
      openDisputeCount: 1,
    });

    const brokenPromises = await request(app)
      .get(
        '/api/dashboard/workflow-cases?kind=BROKEN_PROMISE&asOfDate=2026-07-16&page=1&limit=10',
      )
      .set('Cookie', cookieA)
      .expect(200);
    expect(brokenPromises.body).toMatchObject({
      data: [
        {
          id: brokenPromiseId,
          kind: 'BROKEN_PROMISE',
          invoice: {
            id: promiseInvoiceId,
            invoiceNumber: 'INV-CASE-PROMISE',
            outstandingAmount: '1000000.00',
          },
          promise: { amount: '250000.00', promiseDate: '2026-07-15' },
        },
      ],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      meta: { asOfDate: '2026-07-16' },
    });

    const openDisputes = await request(app)
      .get(
        '/api/dashboard/workflow-cases?kind=OPEN_DISPUTE&asOfDate=2026-07-16&page=1&limit=10',
      )
      .set('Cookie', cookieA)
      .expect(200);
    expect(openDisputes.body).toEqual({
      data: [
        {
          id: expect.any(String),
          kind: 'OPEN_DISPUTE',
          invoice: {
            id: rollbackInvoiceId,
            invoiceNumber: 'INV-CASE-ROLLBACK',
            debtor: {
              id: debtorAId,
              code: 'CASE-A',
              name: 'Collection Case Debtor A',
            },
            dueDate: '2026-06-30',
            outstandingAmount: '1000000.00',
          },
          createdAt: expect.any(String),
          dispute: {
            category: 'ADMINISTRATIVE',
            details: 'Customer needs a corrected purchase-order reference.',
          },
        },
      ],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      meta: { asOfDate: '2026-07-16' },
    });

    const foreignCases = await request(app)
      .get(
        '/api/dashboard/workflow-cases?kind=OPEN_DISPUTE&asOfDate=2026-07-16',
      )
      .set('Cookie', cookieB)
      .expect(200);
    expect(foreignCases.body.data).toEqual([]);
    expect(foreignCases.body.pagination.total).toBe(0);
  });

  it('enforces tenant consistency below the service boundary', async () => {
    await expect(
      database.promiseToPay.create({
        data: {
          organizationId: organizationAId,
          invoiceId: foreignInvoiceId,
          amount: '1.00',
          promiseDate: databaseDate('2026-07-20'),
          createdById: userAId,
          createdByRole: MembershipRole.OWNER,
          operationKey: randomUUID(),
        },
      }),
    ).rejects.toBeInstanceOf(Error);
    await expect(
      database.dispute.create({
        data: {
          organizationId: organizationAId,
          invoiceId: foreignInvoiceId,
          category: DisputeCategory.OTHER,
          details: 'Cross-tenant invoice reference.',
          createdById: userAId,
          createdByRole: MembershipRole.OWNER,
          operationKey: randomUUID(),
        },
      }),
    ).rejects.toBeInstanceOf(Error);
  });

  function postPromise(
    cookie: string,
    invoiceId: string,
    operationKey: string,
    body: Record<string, unknown>,
  ) {
    return request(app)
      .post(`/api/invoices/${invoiceId}/promises`)
      .set('Origin', environment.APP_ORIGIN)
      .set('Cookie', cookie)
      .set('Idempotency-Key', operationKey)
      .send(body);
  }

  function postPromiseCancellation(
    cookie: string,
    promiseId: string,
    operationKey: string,
    reason: string,
  ) {
    return request(app)
      .post(`/api/promises/${promiseId}/cancel`)
      .set('Origin', environment.APP_ORIGIN)
      .set('Cookie', cookie)
      .set('Idempotency-Key', operationKey)
      .send({ reason });
  }

  function postDispute(
    cookie: string,
    invoiceId: string,
    operationKey: string,
    body: Record<string, unknown>,
  ) {
    return request(app)
      .post(`/api/invoices/${invoiceId}/disputes`)
      .set('Origin', environment.APP_ORIGIN)
      .set('Cookie', cookie)
      .set('Idempotency-Key', operationKey)
      .send(body);
  }

  function postDisputeResolution(
    cookie: string,
    disputeId: string,
    operationKey: string,
    resolutionNote: string | null,
  ) {
    return request(app)
      .post(`/api/disputes/${disputeId}/resolve`)
      .set('Origin', environment.APP_ORIGIN)
      .set('Cookie', cookie)
      .set('Idempotency-Key', operationKey)
      .send({ resolutionNote });
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
