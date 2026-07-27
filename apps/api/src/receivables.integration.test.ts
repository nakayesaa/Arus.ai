import { randomUUID } from 'node:crypto';

import bcrypt from 'bcrypt';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from './app.js';
import { loadEnvironment, type Environment } from './config/env.js';
import { MembershipRole } from './generated/prisma/enums.js';
import type { PrismaClient } from './generated/prisma/client.js';
import { createDatabaseClient } from './lib/database.js';
import { PrismaAuthRepository } from './repositories/auth.repository.js';
import { PrismaReceivablesRepository } from './repositories/receivables.repository.js';
import { AuthService } from './services/auth.service.js';
import { CollectionQueueService } from './services/collection-queue.service.js';
import { DashboardService } from './services/dashboard.service.js';
import { ReceivablesService } from './services/receivables.service.js';

const integrationDescribe = describe.runIf(
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true',
);

integrationDescribe('receivables with PostgreSQL', () => {
  const organizationAId = randomUUID();
  const organizationBId = randomUUID();
  const userAId = randomUUID();
  const userBId = randomUUID();
  const debtorAId = randomUUID();
  const debtorASecondId = randomUUID();
  const debtorBId = randomUUID();
  const partialInvoiceId = randomUUID();
  const reversedInvoiceId = randomUUID();
  const tenantBInvoiceId = randomUUID();
  const partialPaymentId = randomUUID();
  const reversedPaymentId = randomUUID();
  const password = `receivables-${randomUUID()}`;
  const emailA = `receivables-a-${randomUUID()}@integration.arus.local`;
  const emailB = `receivables-b-${randomUUID()}@integration.arus.local`;

  let database: PrismaClient;
  let environment: Environment;
  let app: ReturnType<typeof createApp>;
  let cookieA: string;
  let cookieB: string;

  beforeAll(async () => {
    environment = loadEnvironment({
      ...process.env,
      NODE_ENV: 'test',
      SESSION_SECRET: 'receivables-integration-secret-with-adequate-length',
    });
    database = createDatabaseClient(environment);
    const logger = pino({ level: 'silent' });
    const passwordHash = await bcrypt.hash(password, 12);

    await database.organization.createMany({
      data: [
        {
          id: organizationAId,
          name: 'Receivables Integration A',
          timezone: 'Asia/Jakarta',
        },
        {
          id: organizationBId,
          name: 'Receivables Integration B',
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
          name: 'Receivables Owner A',
        },
        {
          id: userBId,
          email: emailB,
          normalizedEmail: emailB,
          passwordHash,
          name: 'Receivables Owner B',
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
          code: 'AR-A-001',
          normalizedCode: 'ar-a-001',
          name: 'Alpha Retail',
          normalizedName: 'alpha retail',
        },
        {
          id: debtorASecondId,
          organizationId: organizationAId,
          code: 'AR-A-002',
          normalizedCode: 'ar-a-002',
          name: 'Beta Distribution',
          normalizedName: 'beta distribution',
        },
        {
          id: debtorBId,
          organizationId: organizationBId,
          code: 'SHARED-001',
          normalizedCode: 'shared-001',
          name: 'Tenant B Customer',
          normalizedName: 'tenant b customer',
        },
      ],
    });
    await database.invoice.createMany({
      data: [
        {
          id: partialInvoiceId,
          organizationId: organizationAId,
          debtorId: debtorAId,
          invoiceNumber: 'INV-SHARED-001',
          normalizedInvoiceNumber: 'inv-shared-001',
          invoiceDate: databaseDate('2026-04-30'),
          dueDate: databaseDate('2026-05-30'),
          originalAmount: '185000000.00',
          description: 'Partially paid fixture',
        },
        {
          id: reversedInvoiceId,
          organizationId: organizationAId,
          debtorId: debtorASecondId,
          invoiceNumber: 'INV-REVERSED-001',
          normalizedInvoiceNumber: 'inv-reversed-001',
          invoiceDate: databaseDate('2026-06-09'),
          dueDate: databaseDate('2026-07-09'),
          originalAmount: '75000000.00',
          description: 'Reversed allocation fixture',
        },
        {
          id: tenantBInvoiceId,
          organizationId: organizationBId,
          debtorId: debtorBId,
          invoiceNumber: 'INV-SHARED-001',
          normalizedInvoiceNumber: 'inv-shared-001',
          invoiceDate: databaseDate('2026-06-01'),
          dueDate: databaseDate('2026-06-30'),
          originalAmount: '10000000.00',
          description: 'Same invoice identity in another tenant',
        },
      ],
    });
    await database.payment.createMany({
      data: [
        {
          id: partialPaymentId,
          organizationId: organizationAId,
          debtorId: debtorAId,
          paymentDate: databaseDate('2026-07-10'),
          amount: '50000000.00',
          bankReference: 'INTEGRATION-PARTIAL',
          createdById: userAId,
        },
        {
          id: reversedPaymentId,
          organizationId: organizationAId,
          debtorId: debtorASecondId,
          paymentDate: databaseDate('2026-07-08'),
          amount: '10000000.00',
          bankReference: 'INTEGRATION-REVERSED',
          createdById: userAId,
        },
      ],
    });
    await database.paymentAllocation.createMany({
      data: [
        {
          organizationId: organizationAId,
          paymentId: partialPaymentId,
          invoiceId: partialInvoiceId,
          amount: '50000000.00',
          allocationDate: databaseDate('2026-07-10'),
          createdById: userAId,
        },
        {
          organizationId: organizationAId,
          paymentId: reversedPaymentId,
          invoiceId: reversedInvoiceId,
          amount: '10000000.00',
          allocationDate: databaseDate('2026-07-08'),
          createdById: userAId,
          reversedAt: new Date('2026-07-09T03:00:00.000Z'),
          reversalReason: 'Integration correction',
        },
      ],
    });

    const authService = new AuthService({
      repository: new PrismaAuthRepository(database),
      environment,
      logger,
    });
    const receivablesRepository = new PrismaReceivablesRepository(database);
    const clock = () => new Date('2026-07-16T04:00:00.000Z');
    const receivablesService = new ReceivablesService({
      repository: receivablesRepository,
      clock,
    });
    const dashboardService = new DashboardService({
      repository: receivablesRepository,
      clock,
    });
    const collectionQueueService = new CollectionQueueService({
      repository: receivablesRepository,
      clock,
    });
    app = createApp({
      authService,
      receivablesService,
      dashboardService,
      collectionQueueService,
      environment,
      logger,
    });

    [cookieA, cookieB] = await Promise.all([login(emailA), login(emailB)]);
  }, 30_000);

  afterAll(async () => {
    if (!database) return;

    const organizations = [organizationAId, organizationBId];
    await database.paymentAllocation.deleteMany({
      where: { organizationId: { in: organizations } },
    });
    await database.payment.deleteMany({
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

  it('requires authentication on collection reads', async () => {
    const debtors = await request(app).get('/api/debtors').expect(401);
    const invoices = await request(app).get('/api/invoices').expect(401);
    const dashboard = await request(app).get('/api/dashboard').expect(401);
    const queue = await request(app).get('/api/collection-queue').expect(401);

    expect(debtors.body.error.code).toBe('UNAUTHENTICATED');
    expect(invoices.body.error.code).toBe('UNAUTHENTICATED');
    expect(dashboard.body.error.code).toBe('UNAUTHENTICATED');
    expect(queue.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns a stable tenant queue with sorting before pagination', async () => {
    const firstPage = await request(app)
      .get('/api/collection-queue?asOfDate=2026-07-16&page=1&limit=1')
      .set('Cookie', cookieA)
      .expect(200);
    const secondPage = await request(app)
      .get('/api/collection-queue?asOfDate=2026-07-16&page=2&limit=1')
      .set('Cookie', cookieA)
      .expect(200);

    expect(firstPage.headers['cache-control']).toBe('no-store');
    expect(firstPage.body.pagination).toEqual({
      page: 1,
      limit: 1,
      total: 2,
      totalPages: 2,
    });
    expect(firstPage.body.meta).toEqual({ asOfDate: '2026-07-16' });
    expect(firstPage.body.data[0]).toMatchObject({
      id: partialInvoiceId,
      invoiceNumber: 'INV-SHARED-001',
      outstandingAmount: '135000000.00',
      state: 'PARTIALLY_PAID',
      aging: { daysOverdue: 47 },
      lastContactDate: null,
      nextFollowUpDate: null,
      promiseStatus: null,
      hasOpenDispute: false,
      daysSinceLastContact: 30,
      reasons: ['OVERDUE'],
      priority: {
        score: '222.20',
        components: {
          amount: '202.50',
          aging: '4.70',
          stale: '15.00',
          promise: '0.00',
          dueSoon: '0.00',
        },
      },
    });
    expect(secondPage.body.data[0]).toMatchObject({
      id: reversedInvoiceId,
      priority: { score: '128.20' },
    });
    expect(JSON.stringify([firstPage.body, secondPage.body])).not.toContain(
      tenantBInvoiceId,
    );
  });

  it('reconciles dashboard totals and aging from tenant source records', async () => {
    const response = await request(app)
      .get('/api/dashboard?asOfDate=2026-07-16')
      .set('Cookie', cookieA)
      .expect(200);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({
      data: {
        summary: {
          totalAr: '210000000.00',
          totalOverdue: '210000000.00',
          overduePercent: '100.00',
          openInvoiceCount: 2,
          overdueInvoiceCount: 2,
        },
        aging: [
          {
            bucket: 'CURRENT',
            invoiceCount: 0,
            outstandingAmount: '0.00',
          },
          {
            bucket: 'OVERDUE_1_7',
            invoiceCount: 1,
            outstandingAmount: '75000000.00',
          },
          {
            bucket: 'OVERDUE_8_30',
            invoiceCount: 0,
            outstandingAmount: '0.00',
          },
          {
            bucket: 'OVERDUE_31_60',
            invoiceCount: 1,
            outstandingAmount: '135000000.00',
          },
          {
            bucket: 'OVERDUE_61_90',
            invoiceCount: 0,
            outstandingAmount: '0.00',
          },
          {
            bucket: 'OVERDUE_90_PLUS',
            invoiceCount: 0,
            outstandingAmount: '0.00',
          },
        ],
        largestOverdue: [
          {
            id: partialInvoiceId,
            outstandingAmount: '135000000.00',
            daysOverdue: 47,
          },
          {
            id: reversedInvoiceId,
            outstandingAmount: '75000000.00',
            daysOverdue: 7,
          },
        ],
      },
      meta: { asOfDate: '2026-07-16' },
    });
    expect(JSON.stringify(response.body)).not.toContain(tenantBInvoiceId);
  });

  it('lists only session-tenant data with deterministic pagination', async () => {
    const firstPage = await request(app)
      .get('/api/debtors?page=1&limit=1')
      .set('Cookie', cookieA)
      .expect(200);
    const secondPage = await request(app)
      .get('/api/debtors?page=2&limit=1')
      .set('Cookie', cookieA)
      .expect(200);

    expect(firstPage.headers['cache-control']).toBe('no-store');
    expect(firstPage.body.pagination).toMatchObject({
      page: 1,
      limit: 1,
      total: 2,
      totalPages: 2,
    });
    expect(firstPage.body.meta.asOfDate).toBe('2026-07-16');
    expect(firstPage.body.data[0].id).toBe(debtorAId);
    expect(firstPage.body.data[0].summary).toEqual({
      invoiceCount: 1,
      openInvoiceCount: 1,
      totalOutstanding: '135000000.00',
      overdueOutstanding: '135000000.00',
    });
    expect(secondPage.body.data[0].id).toBe(debtorASecondId);
    expect(firstPage.body.data[0].id).not.toBe(secondPage.body.data[0].id);
    expect(JSON.stringify([firstPage.body, secondPage.body])).not.toContain(
      debtorBId,
    );
  });

  it('returns cross-tenant debtor and invoice identifiers as not found', async () => {
    const debtorResponse = await request(app)
      .get(`/api/debtors/${debtorBId}`)
      .set('Cookie', cookieA)
      .expect(404);
    const invoiceResponse = await request(app)
      .get(`/api/invoices/${tenantBInvoiceId}`)
      .set('Cookie', cookieA)
      .expect(404);
    const updateResponse = await request(app)
      .patch(`/api/debtors/${debtorBId}`)
      .set('Origin', environment.APP_ORIGIN)
      .set('Cookie', cookieA)
      .send({ name: 'Must not update' })
      .expect(404);

    expect(debtorResponse.body.error.code).toBe('DEBTOR_NOT_FOUND');
    expect(invoiceResponse.body.error.code).toBe('INVOICE_NOT_FOUND');
    expect(updateResponse.body.error.code).toBe('DEBTOR_NOT_FOUND');
    await expect(
      database.debtor.findUniqueOrThrow({ where: { id: debtorBId } }),
    ).resolves.toMatchObject({ name: 'Tenant B Customer' });
  });

  it('derives exact balances, state, and aging from active allocations', async () => {
    const partial = await request(app)
      .get(`/api/invoices/${partialInvoiceId}?asOfDate=2026-07-16`)
      .set('Cookie', cookieA)
      .expect(200);
    const reversed = await request(app)
      .get(`/api/invoices/${reversedInvoiceId}?asOfDate=2026-07-16`)
      .set('Cookie', cookieA)
      .expect(200);

    expect(partial.body.data).toMatchObject({
      originalAmount: '185000000.00',
      allocatedAmount: '50000000.00',
      outstandingAmount: '135000000.00',
      state: 'PARTIALLY_PAID',
      aging: {
        bucket: 'OVERDUE_31_60',
        daysToDue: -47,
        daysOverdue: 47,
        flags: ['OVERDUE'],
      },
    });
    expect(partial.body.meta.asOfDate).toBe('2026-07-16');
    expect(reversed.body.data).toMatchObject({
      allocatedAmount: '0.00',
      outstandingAmount: '75000000.00',
      state: 'OPEN',
      aging: { bucket: 'OVERDUE_1_7', daysOverdue: 7 },
    });
    expect(reversed.body.data.allocations).toHaveLength(1);
    expect(reversed.body.data.allocations[0]).toMatchObject({
      amount: '10000000.00',
      reversalReason: 'Integration correction',
    });
    expect(reversed.body.data.allocations[0].reversedAt).not.toBeNull();
  });

  it('filters derived invoice state and aging before paginating', async () => {
    const byState = await request(app)
      .get('/api/invoices?state=PARTIALLY_PAID&asOfDate=2026-07-16')
      .set('Cookie', cookieA)
      .expect(200);
    const byAging = await request(app)
      .get('/api/invoices?agingBucket=OVERDUE_1_7&asOfDate=2026-07-16')
      .set('Cookie', cookieA)
      .expect(200);

    expect(byState.body.data.map(recordId)).toEqual([partialInvoiceId]);
    expect(byState.body.pagination.total).toBe(1);
    expect(byAging.body.data.map(recordId)).toEqual([reversedInvoiceId]);
    expect(byAging.body.pagination.total).toBe(1);
    expect(JSON.stringify([byState.body, byAging.body])).not.toContain(
      tenantBInvoiceId,
    );
  });

  it('returns only nonzero balances for outstanding-only reads', async () => {
    const response = await request(app)
      .get('/api/invoices?outstandingOnly=true&asOfDate=2026-07-16')
      .set('Cookie', cookieA)
      .expect(200);

    expect(response.body.data).not.toHaveLength(0);
    expect(
      response.body.data.every(
        (invoice: { outstandingAmount: string }) =>
          invoice.outstandingAmount !== '0.00',
      ),
    ).toBe(true);
  });

  it('validates calendar dates rather than accepting regex-only dates', async () => {
    const response = await request(app)
      .get('/api/invoices?asOfDate=2026-02-30')
      .set('Cookie', cookieA)
      .expect(400);

    expect(response.body.error).toMatchObject({
      code: 'INVALID_AS_OF_DATE',
      fields: { asOfDate: expect.any(String) },
    });
    const dashboard = await request(app)
      .get('/api/dashboard?asOfDate=2026-02-30')
      .set('Cookie', cookieA)
      .expect(400);
    expect(dashboard.body.error).toMatchObject({
      code: 'INVALID_AS_OF_DATE',
      fields: { asOfDate: expect.any(String) },
    });
    const queue = await request(app)
      .get('/api/collection-queue?asOfDate=2026-02-30')
      .set('Cookie', cookieA)
      .expect(400);
    expect(queue.body.error).toMatchObject({
      code: 'INVALID_AS_OF_DATE',
      fields: { asOfDate: expect.any(String) },
    });
  });

  it('creates and updates a normalized debtor with atomic audit events', async () => {
    const created = await request(app)
      .post('/api/debtors')
      .set('Origin', environment.APP_ORIGIN)
      .set('Cookie', cookieA)
      .send({
        code: '  SHARED-001  ',
        name: '  New Tenant A Customer  ',
        email: 'COLLECTIONS@CUSTOMER.EXAMPLE',
      })
      .expect(201);

    expect(created.body.data).toMatchObject({
      code: 'SHARED-001',
      name: 'New Tenant A Customer',
      email: 'collections@customer.example',
    });
    const debtorId = created.body.data.id as string;
    const persisted = await database.debtor.findUniqueOrThrow({
      where: { id: debtorId },
    });
    expect(persisted).toMatchObject({
      organizationId: organizationAId,
      normalizedCode: 'shared-001',
    });

    const updated = await request(app)
      .patch(`/api/debtors/${debtorId}`)
      .set('Origin', environment.APP_ORIGIN)
      .set('Cookie', cookieA)
      .send({ contactName: '  Finance Team  ', phoneNumber: null })
      .expect(200);
    expect(updated.body.data).toMatchObject({
      contactName: 'Finance Team',
      phoneNumber: null,
    });

    const audits = await database.auditLog.findMany({
      where: {
        organizationId: organizationAId,
        entityType: 'Debtor',
        entityId: debtorId,
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(audits.map((audit) => audit.action)).toEqual([
      'DEBTOR_CREATED',
      'DEBTOR_UPDATED',
    ]);
    expect(audits.every((audit) => audit.actorId === userAId)).toBe(true);
    expect(audits.every((audit) => Boolean(audit.requestId))).toBe(true);
  });

  it('rejects a duplicate normalized debtor code inside one tenant', async () => {
    const response = await request(app)
      .post('/api/debtors')
      .set('Origin', environment.APP_ORIGIN)
      .set('Cookie', cookieA)
      .send({ code: 'shared-001', name: 'Duplicate Customer' })
      .expect(409);

    expect(response.body.error.code).toBe('DEBTOR_CODE_IN_USE');
    await expect(
      database.debtor.count({
        where: { organizationId: organizationAId, name: 'Duplicate Customer' },
      }),
    ).resolves.toBe(0);
  });

  it('enforces source-record constraints and tenant consistency in PostgreSQL', async () => {
    await expect(
      database.debtor.update({
        where: { id: debtorAId },
        data: { organizationId: organizationBId },
      }),
    ).rejects.toBeInstanceOf(Error);

    await expect(
      database.invoice.create({
        data: {
          organizationId: organizationAId,
          debtorId: debtorBId,
          invoiceNumber: 'CROSS-TENANT-DEBTOR',
          normalizedInvoiceNumber: 'cross-tenant-debtor',
          invoiceDate: databaseDate('2026-07-01'),
          dueDate: databaseDate('2026-07-31'),
          originalAmount: '1.00',
        },
      }),
    ).rejects.toBeInstanceOf(Error);

    await expect(
      database.invoice.create({
        data: {
          organizationId: organizationAId,
          debtorId: debtorAId,
          invoiceNumber: 'INV-SHARED-001',
          normalizedInvoiceNumber: 'inv-shared-001',
          invoiceDate: databaseDate('2026-07-01'),
          dueDate: databaseDate('2026-07-31'),
          originalAmount: '1.00',
        },
      }),
    ).rejects.toBeInstanceOf(Error);

    await expect(
      database.invoice.create({
        data: {
          organizationId: organizationAId,
          debtorId: debtorAId,
          invoiceNumber: 'INVALID-DATE-ORDER',
          normalizedInvoiceNumber: 'invalid-date-order',
          invoiceDate: databaseDate('2026-07-31'),
          dueDate: databaseDate('2026-07-01'),
          originalAmount: '1.00',
        },
      }),
    ).rejects.toBeInstanceOf(Error);

    await expect(
      database.invoice.create({
        data: {
          organizationId: organizationAId,
          debtorId: debtorAId,
          invoiceNumber: 'INVALID NORMALIZATION',
          normalizedInvoiceNumber: 'not-the-normalized-value',
          invoiceDate: databaseDate('2026-07-01'),
          dueDate: databaseDate('2026-07-31'),
          originalAmount: '1.00',
        },
      }),
    ).rejects.toBeInstanceOf(Error);

    await expect(
      database.payment.create({
        data: {
          organizationId: organizationAId,
          debtorId: debtorAId,
          paymentDate: databaseDate('2026-07-16'),
          amount: '0.00',
          createdById: userAId,
        },
      }),
    ).rejects.toBeInstanceOf(Error);

    await expect(
      database.paymentAllocation.create({
        data: {
          organizationId: organizationAId,
          paymentId: partialPaymentId,
          invoiceId: reversedInvoiceId,
          allocationDate: databaseDate('2026-07-16'),
          amount: '1.00',
          createdById: userAId,
        },
      }),
    ).rejects.toBeInstanceOf(Error);
  });

  it('keeps a second authenticated tenant isolated on collection lists', async () => {
    const response = await request(app)
      .get('/api/invoices?asOfDate=2026-07-16')
      .set('Cookie', cookieB)
      .expect(200);

    expect(response.body.data.map(recordId)).toEqual([tenantBInvoiceId]);
    expect(JSON.stringify(response.body)).not.toContain(partialInvoiceId);
    expect(JSON.stringify(response.body)).not.toContain(reversedInvoiceId);

    const dashboard = await request(app)
      .get('/api/dashboard?asOfDate=2026-07-16')
      .set('Cookie', cookieB)
      .expect(200);
    expect(dashboard.body.data.summary).toMatchObject({
      totalAr: '10000000.00',
      totalOverdue: '10000000.00',
      openInvoiceCount: 1,
    });
    expect(JSON.stringify(dashboard.body)).not.toContain(partialInvoiceId);

    const queue = await request(app)
      .get('/api/collection-queue?asOfDate=2026-07-16')
      .set('Cookie', cookieB)
      .expect(200);
    expect(queue.body.data.map(recordId)).toEqual([tenantBInvoiceId]);
    expect(JSON.stringify(queue.body)).not.toContain(partialInvoiceId);
    expect(JSON.stringify(queue.body)).not.toContain(reversedInvoiceId);
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

function recordId(record: { id: string }): string {
  return record.id;
}
