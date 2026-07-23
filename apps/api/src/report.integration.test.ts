import { randomUUID } from 'node:crypto';

import bcrypt from 'bcrypt';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from './app.js';
import { loadEnvironment, type Environment } from './config/env.js';
import type { PrismaClient } from './generated/prisma/client.js';
import {
  DisputeCategory,
  MembershipRole,
} from './generated/prisma/enums.js';
import { createDatabaseClient } from './lib/database.js';
import { PrismaAuthRepository } from './repositories/auth.repository.js';
import { PrismaReportRepository } from './repositories/report.repository.js';
import { AuthService } from './services/auth.service.js';
import { ReportService } from './services/report.service.js';

const integrationDescribe = describe.runIf(
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true',
);

integrationDescribe('weekly report with PostgreSQL', () => {
  const organizationAId = randomUUID();
  const organizationBId = randomUUID();
  const userAId = randomUUID();
  const userBId = randomUUID();
  const debtorAId = randomUUID();
  const debtorBId = randomUUID();
  const invoiceAId = randomUUID();
  const invoiceBId = randomUUID();
  const paymentAId = randomUUID();
  const allocationAId = randomUUID();
  const password = `report-${randomUUID()}`;
  const emailA = `report-a-${randomUUID()}@integration.arus.local`;
  const emailB = `report-b-${randomUUID()}@integration.arus.local`;
  const generatedAt = new Date('2026-07-23T08:00:00.000Z');

  let database: PrismaClient;
  let environment: Environment;
  let app: ReturnType<typeof createApp>;
  let cookieA: string;

  beforeAll(async () => {
    environment = loadEnvironment({
      ...process.env,
      NODE_ENV: 'test',
      SESSION_SECRET: 'report-integration-secret-with-adequate-length',
    });
    database = createDatabaseClient(environment);
    const logger = pino({ level: 'silent' });
    const passwordHash = await bcrypt.hash(password, 12);

    await database.organization.createMany({
      data: [
        {
          id: organizationAId,
          name: 'Report Integration A',
          timezone: 'Asia/Jakarta',
        },
        {
          id: organizationBId,
          name: 'Report Integration B',
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
          name: 'Report Owner A',
        },
        {
          id: userBId,
          email: emailB,
          normalizedEmail: emailB,
          passwordHash,
          name: 'Report Owner B',
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
          code: 'REPORT-A',
          normalizedCode: 'report-a',
          name: 'Report Debtor A',
          normalizedName: 'report debtor a',
        },
        {
          id: debtorBId,
          organizationId: organizationBId,
          code: 'REPORT-B',
          normalizedCode: 'report-b',
          name: 'Report Debtor B',
          normalizedName: 'report debtor b',
        },
      ],
    });
    await database.invoice.createMany({
      data: [
        {
          id: invoiceAId,
          organizationId: organizationAId,
          debtorId: debtorAId,
          invoiceNumber: 'INV-REPORT-A',
          normalizedInvoiceNumber: 'inv-report-a',
          invoiceDate: databaseDate('2026-06-01'),
          dueDate: databaseDate('2026-07-10'),
          originalAmount: '1000.00',
        },
        {
          id: invoiceBId,
          organizationId: organizationBId,
          debtorId: debtorBId,
          invoiceNumber: 'INV-REPORT-B',
          normalizedInvoiceNumber: 'inv-report-b',
          invoiceDate: databaseDate('2026-06-01'),
          dueDate: databaseDate('2026-07-10'),
          originalAmount: '9000000.00',
        },
      ],
    });
    await database.payment.create({
      data: {
        id: paymentAId,
        organizationId: organizationAId,
        debtorId: debtorAId,
        paymentDate: databaseDate('2026-07-18'),
        amount: '250.00',
        payerReference: 'Report fixture',
        createdById: userAId,
      },
    });
    await database.paymentAllocation.create({
      data: {
        id: allocationAId,
        organizationId: organizationAId,
        paymentId: paymentAId,
        invoiceId: invoiceAId,
        amount: '250.00',
        allocationDate: databaseDate('2026-07-18'),
        createdById: userAId,
        reversedAt: new Date('2026-07-24T02:00:00.000Z'),
        reversalReason: 'Reversed after report cutoff',
      },
    });
    await database.promiseToPay.create({
      data: {
        organizationId: organizationAId,
        invoiceId: invoiceAId,
        amount: '300.00',
        promiseDate: databaseDate('2026-07-16'),
        createdById: userAId,
        createdByRole: MembershipRole.OWNER,
        operationKey: randomUUID(),
        createdAt: new Date('2026-07-15T03:00:00.000Z'),
      },
    });
    await database.dispute.create({
      data: {
        organizationId: organizationAId,
        invoiceId: invoiceAId,
        category: DisputeCategory.MISSING_POD,
        details: 'Synthetic report evidence request',
        createdById: userAId,
        createdByRole: MembershipRole.OWNER,
        operationKey: randomUUID(),
        createdAt: new Date('2026-07-19T03:00:00.000Z'),
      },
    });

    const authService = new AuthService({
      repository: new PrismaAuthRepository(database),
      environment,
      logger,
    });
    app = createApp({
      authService,
      reportService: new ReportService({
        repository: new PrismaReportRepository(database),
        clock: () => generatedAt,
      }),
      environment,
      logger,
    });
    const login = await request(app)
      .post('/api/auth/login')
      .set('Origin', environment.APP_ORIGIN)
      .send({ email: emailA, password })
      .expect(200);
    cookieA = (login.headers['set-cookie']?.[0] ?? '').split(';', 1)[0] ?? '';
    if (!cookieA) throw new Error('Login did not return a session cookie');
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
    await database.dispute.deleteMany({
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

  it('returns a reconciled tenant report and records its audit identity', async () => {
    const response = await request(app)
      .get('/api/reports/weekly?from=2026-07-17&to=2026-07-23')
      .set('Cookie', cookieA)
      .expect(200);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data).toMatchObject({
      period: {
        from: '2026-07-17',
        to: '2026-07-23',
        inclusiveDayCount: 7,
      },
      timeZone: 'Asia/Jakarta',
      summary: {
        totalAr: '750.00',
        totalOverdue: '750.00',
        overduePercent: '100.00',
        openInvoiceCount: 1,
        overdueInvoiceCount: 1,
      },
      collections: { amount: '250.00', allocationCount: 1 },
      promises: {
        broken: { count: 1, amount: '300.00' },
      },
      disputes: {
        openInvoiceCount: 1,
        outstandingAmount: '750.00',
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('9000000.00');

    const audit = await database.auditLog.findFirstOrThrow({
      where: {
        organizationId: organizationAId,
        action: 'REPORT_GENERATED',
        entityId: response.body.data.reportId as string,
      },
    });
    expect(audit).toMatchObject({
      actorId: userAId,
      entityType: 'WeeklyReport',
    });
    expect(audit.metadata).toMatchObject({
      from: '2026-07-17',
      to: '2026-07-23',
      sourceCounts: { invoices: 1, promises: 1, disputes: 1 },
    });
  });

  it('requires authentication and validates the inclusive period', async () => {
    await request(app)
      .get('/api/reports/weekly?from=2026-07-17&to=2026-07-23')
      .expect(401);
    const invalid = await request(app)
      .get('/api/reports/weekly?from=2026-07-24&to=2026-07-23')
      .set('Cookie', cookieA)
      .expect(400);
    expect(invalid.body.error.code).toBe('INVALID_REPORT_PERIOD');
  });
});

function databaseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
