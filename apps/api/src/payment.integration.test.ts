import { randomUUID } from 'node:crypto';

import { formatMoney, parseMoney } from '@arus/domain';
import bcrypt from 'bcrypt';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from './app.js';
import { loadEnvironment, type Environment } from './config/env.js';
import type { PrismaClient } from './generated/prisma/client.js';
import { MembershipRole } from './generated/prisma/enums.js';
import { createDatabaseClient } from './lib/database.js';
import { PrismaAuthRepository } from './repositories/auth.repository.js';
import { PrismaPaymentRepository } from './repositories/payment.repository.js';
import { PrismaReceivablesRepository } from './repositories/receivables.repository.js';
import { AuthService } from './services/auth.service.js';
import { CollectionQueueService } from './services/collection-queue.service.js';
import { DashboardService } from './services/dashboard.service.js';
import { PaymentService } from './services/payment.service.js';
import { ReceivablesService } from './services/receivables.service.js';

const integrationDescribe = describe.runIf(
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true',
);

integrationDescribe('payment workflow with PostgreSQL', () => {
  const organizationAId = randomUUID();
  const organizationBId = randomUUID();
  const userAId = randomUUID();
  const userBId = randomUUID();
  const debtorAId = randomUUID();
  const debtorBId = randomUUID();
  const partialInvoiceId = randomUUID();
  const fullInvoiceId = randomUUID();
  const concurrentInvoiceId = randomUUID();
  const rollbackInvoiceId = randomUUID();
  const foreignInvoiceId = randomUUID();
  const promiseId = randomUUID();
  const password = `payments-${randomUUID()}`;
  const emailA = `payments-a-${randomUUID()}@integration.arus.local`;
  const emailB = `payments-b-${randomUUID()}@integration.arus.local`;
  const occurredAt = new Date('2026-07-23T03:00:00.000Z');

  let database: PrismaClient;
  let environment: Environment;
  let app: ReturnType<typeof createApp>;
  let cookieA: string;
  let cookieB: string;

  beforeAll(async () => {
    environment = loadEnvironment({
      ...process.env,
      NODE_ENV: 'test',
      SESSION_SECRET: 'payment-integration-secret-with-adequate-length',
    });
    database = createDatabaseClient(environment);
    const logger = pino({ level: 'silent' });
    const passwordHash = await bcrypt.hash(password, 12);

    await database.organization.createMany({
      data: [
        {
          id: organizationAId,
          name: 'Payment Integration A',
          timezone: 'Asia/Jakarta',
        },
        {
          id: organizationBId,
          name: 'Payment Integration B',
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
          name: 'Payment Owner A',
        },
        {
          id: userBId,
          email: emailB,
          normalizedEmail: emailB,
          passwordHash,
          name: 'Payment Operator B',
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
          code: 'PAY-A',
          normalizedCode: 'pay-a',
          name: 'Payment Debtor A',
          normalizedName: 'payment debtor a',
        },
        {
          id: debtorBId,
          organizationId: organizationBId,
          code: 'PAY-B',
          normalizedCode: 'pay-b',
          name: 'Payment Debtor B',
          normalizedName: 'payment debtor b',
        },
      ],
    });
    await database.invoice.createMany({
      data: [
        ...(
          [
            [partialInvoiceId, 'PARTIAL'],
            [fullInvoiceId, 'FULL'],
            [concurrentInvoiceId, 'CONCURRENT'],
            [rollbackInvoiceId, 'ROLLBACK'],
          ] as const
        ).map(([id, suffix]) => ({
          id,
          organizationId: organizationAId,
          debtorId: debtorAId,
          invoiceNumber: `INV-PAY-${suffix}`,
          normalizedInvoiceNumber: `inv-pay-${suffix.toLowerCase()}`,
          invoiceDate: databaseDate('2026-06-01'),
          dueDate: databaseDate('2026-06-30'),
          originalAmount: '1000000.00',
        })),
        {
          id: foreignInvoiceId,
          organizationId: organizationBId,
          debtorId: debtorBId,
          invoiceNumber: 'INV-PAY-FOREIGN',
          normalizedInvoiceNumber: 'inv-pay-foreign',
          invoiceDate: databaseDate('2026-06-01'),
          dueDate: databaseDate('2026-06-30'),
          originalAmount: '1000000.00',
        },
      ],
    });
    await database.promiseToPay.create({
      data: {
        id: promiseId,
        organizationId: organizationAId,
        invoiceId: partialInvoiceId,
        amount: '400000.00',
        promiseDate: databaseDate('2026-07-23'),
        createdById: userAId,
        createdByRole: MembershipRole.OWNER,
        operationKey: randomUUID(),
        createdAt: new Date('2026-07-20T03:00:00.000Z'),
      },
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
      paymentService: new PaymentService({
        repository: new PrismaPaymentRepository(database),
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
    await database.paymentAllocation.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await database.payment.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await database.promiseToPay.deleteMany({
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

  it('records, allocates, fulfills, audits, and replays one payment', async () => {
    const operationKey = randomUUID();
    const body = paymentBody('400000.00');
    const created = await postPayment(
      cookieA,
      partialInvoiceId,
      operationKey,
      body,
    ).expect(201);

    expect(created.headers['cache-control']).toBe('no-store');
    expect(created.body).toMatchObject({
      replayed: false,
      data: {
        debtor: { id: debtorAId, name: 'Payment Debtor A' },
        paymentDate: '2026-07-23',
        amount: '400000.00',
        payerReference: body.payerReference,
        bankReference: body.bankReference,
        isOpeningBalance: false,
        createdBy: { id: userAId, name: 'Payment Owner A' },
        allocations: [
          {
            amount: '400000.00',
            invoice: {
              id: partialInvoiceId,
              invoiceNumber: 'INV-PAY-PARTIAL',
            },
          },
        ],
      },
      invoice: {
        id: partialInvoiceId,
        allocatedAmount: '400000.00',
        outstandingAmount: '600000.00',
        state: 'PARTIALLY_PAID',
      },
      fulfilledPromiseIds: [promiseId],
    });

    const replay = await postPayment(
      cookieA,
      partialInvoiceId,
      operationKey,
      body,
    ).expect(200);
    expect(replay.body).toMatchObject({
      replayed: true,
      data: { id: created.body.data.id },
      invoice: { outstandingAmount: '600000.00' },
    });
    const conflict = await postPayment(
      cookieA,
      partialInvoiceId,
      operationKey,
      { ...body, amount: '300000.00' },
    ).expect(409);
    expect(conflict.body.error.code).toBe('PAYMENT_IDEMPOTENCY_CONFLICT');

    await expect(
      database.payment.count({
        where: { organizationId: organizationAId, operationKey },
      }),
    ).resolves.toBe(1);
    await expect(
      database.paymentAllocation.count({
        where: { invoiceId: partialInvoiceId },
      }),
    ).resolves.toBe(1);
    await expect(
      database.promiseToPay.findUnique({
        where: { id: promiseId },
        select: { finalStatus: true, fulfilledAt: true },
      }),
    ).resolves.toMatchObject({
      finalStatus: 'FULFILLED',
      fulfilledAt: occurredAt,
    });

    const paymentRequestId = created.headers['x-request-id'];
    if (typeof paymentRequestId !== 'string') {
      throw new Error('Payment response did not include a request ID');
    }
    const audits = await database.auditLog.findMany({
      where: {
        organizationId: organizationAId,
        requestId: paymentRequestId,
      },
      orderBy: { action: 'asc' },
    });
    expect(audits.map((audit) => audit.action)).toEqual([
      'PAYMENT_RECORDED',
      'PROMISE_FULFILLED',
    ]);
    expect(JSON.stringify(audits)).not.toContain(body.bankReference);

    const list = await request(app)
      .get('/api/payments?from=2026-07-23&to=2026-07-23&page=1&limit=25')
      .set('Cookie', cookieA)
      .expect(200);
    expect(list.body).toMatchObject({
      data: [{ id: created.body.data.id }],
      pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
    });
    await request(app)
      .get(`/api/payments/${created.body.data.id}`)
      .set('Cookie', cookieA)
      .expect(200);
    await request(app)
      .get(`/api/payments/${created.body.data.id}`)
      .set('Cookie', cookieB)
      .expect(404);
  });

  it('rejects invalid, excessive, foreign, and untrusted commands', async () => {
    const zero = await postPayment(
      cookieA,
      rollbackInvoiceId,
      randomUUID(),
      paymentBody('0.00'),
    ).expect(422);
    const excessive = await postPayment(
      cookieA,
      rollbackInvoiceId,
      randomUUID(),
      paymentBody('1000000.01'),
    ).expect(422);
    const future = await postPayment(cookieA, rollbackInvoiceId, randomUUID(), {
      ...paymentBody('1.00'),
      paymentDate: '2026-07-24',
    }).expect(422);
    const foreign = await postPayment(
      cookieA,
      foreignInvoiceId,
      randomUUID(),
      paymentBody('1.00'),
    ).expect(404);
    const untrusted = await request(app)
      .post(`/api/invoices/${rollbackInvoiceId}/payments`)
      .set('Origin', 'https://attacker.invalid')
      .set('Cookie', cookieA)
      .set('Idempotency-Key', randomUUID())
      .send(paymentBody('1.00'))
      .expect(403);

    expect(zero.body.error.code).toBe('INVALID_PAYMENT_AMOUNT');
    expect(excessive.body.error.code).toBe('PAYMENT_EXCEEDS_OUTSTANDING');
    expect(future.body.error.code).toBe('INVALID_PAYMENT_DATE');
    expect(foreign.body.error.code).toBe('INVOICE_NOT_FOUND');
    expect(untrusted.body.error.code).toBe('UNTRUSTED_ORIGIN');
    await expect(
      database.paymentAllocation.count({
        where: { invoiceId: rollbackInvoiceId },
      }),
    ).resolves.toBe(0);
  });

  it('serializes concurrent allocations against one outstanding balance', async () => {
    const responses = await Promise.all(
      [randomUUID(), randomUUID()].map((operationKey) =>
        postPayment(
          cookieA,
          concurrentInvoiceId,
          operationKey,
          paymentBody('600000.00'),
        ),
      ),
    );

    expect(responses.map(({ status }) => status).sort()).toEqual([201, 422]);
    const allocations = await database.paymentAllocation.findMany({
      where: { invoiceId: concurrentInvoiceId, reversedAt: null },
      select: { amount: true },
    });
    expect(allocations.map(({ amount }) => amount.toFixed(2))).toEqual([
      '600000.00',
    ]);
  });

  it('settles an invoice and refreshes every derived operational read', async () => {
    const dashboardBefore = await request(app)
      .get('/api/dashboard?asOfDate=2026-07-23')
      .set('Cookie', cookieA)
      .expect(200);
    const created = await postPayment(
      cookieA,
      fullInvoiceId,
      randomUUID(),
      paymentBody('1000000.00'),
    ).expect(201);
    expect(created.body.invoice).toMatchObject({
      state: 'PAID',
      outstandingAmount: '0.00',
    });

    const invoice = await request(app)
      .get(`/api/invoices/${fullInvoiceId}?asOfDate=2026-07-23`)
      .set('Cookie', cookieA)
      .expect(200);
    expect(invoice.body.data).toMatchObject({
      state: 'PAID',
      allocatedAmount: '1000000.00',
      outstandingAmount: '0.00',
    });

    const queue = await request(app)
      .get('/api/collection-queue?asOfDate=2026-07-23&limit=100')
      .set('Cookie', cookieA)
      .expect(200);
    expect(queue.body.data.map(recordId)).not.toContain(fullInvoiceId);
    const dashboard = await request(app)
      .get('/api/dashboard?asOfDate=2026-07-23')
      .set('Cookie', cookieA)
      .expect(200);
    expect(dashboard.body.data.summary.totalAr).toBe(
      formatMoney(
        parseMoney(dashboardBefore.body.data.summary.totalAr) - 100000000n,
      ),
    );

    const second = await postPayment(
      cookieA,
      fullInvoiceId,
      randomUUID(),
      paymentBody('1.00'),
    ).expect(409);
    expect(second.body.error.code).toBe('INVOICE_ALREADY_PAID');
  });

  it('rolls back payment and allocation when late audit persistence fails', async () => {
    const operationKey = randomUUID();
    await expect(
      new PrismaPaymentRepository(database).createInvoicePayment({
        organizationId: organizationAId,
        invoiceId: rollbackInvoiceId,
        actorId: userAId,
        operationKey,
        requestId: 'x'.repeat(129),
        occurredAt,
        paymentDate: '2026-07-23',
        amount: '100.00',
        payerReference: 'Rollback proof',
        bankReference: null,
      }),
    ).rejects.toBeInstanceOf(Error);

    await expect(
      database.payment.count({
        where: { organizationId: organizationAId, operationKey },
      }),
    ).resolves.toBe(0);
    await expect(
      database.paymentAllocation.count({
        where: { invoiceId: rollbackInvoiceId },
      }),
    ).resolves.toBe(0);
    await expect(
      database.auditLog.count({
        where: {
          organizationId: organizationAId,
          action: 'PAYMENT_RECORDED',
          metadata: { path: ['invoiceId'], equals: rollbackInvoiceId },
        },
      }),
    ).resolves.toBe(0);
  });

  function postPayment(
    cookie: string,
    invoiceId: string,
    operationKey: string,
    body: Record<string, unknown>,
  ) {
    return request(app)
      .post(`/api/invoices/${invoiceId}/payments`)
      .set('Origin', environment.APP_ORIGIN)
      .set('Cookie', cookie)
      .set('Idempotency-Key', operationKey)
      .send(body);
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

function paymentBody(amount: string): {
  amount: string;
  paymentDate: string;
  payerReference: string;
  bankReference: string;
} {
  return {
    amount,
    paymentDate: '2026-07-23',
    payerReference: 'Customer remittance advice',
    bankReference: 'BCA-240723-001',
  };
}

function databaseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function recordId(record: { id: string }): string {
  return record.id;
}
