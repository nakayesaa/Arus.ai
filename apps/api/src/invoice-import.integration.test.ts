import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import bcrypt from 'bcrypt';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from './app.js';
import { loadEnvironment, type Environment } from './config/env.js';
import type { PrismaClient } from './generated/prisma/client.js';
import { MembershipRole } from './generated/prisma/enums.js';
import { createDatabaseClient } from './lib/database.js';
import { MAX_INVOICE_CSV_BYTES } from './lib/invoice-csv-upload.js';
import { PrismaAuthRepository } from './repositories/auth.repository.js';
import { PrismaInvoiceImportRepository } from './repositories/invoice-import.repository.js';
import { AuthService } from './services/auth.service.js';
import { InvoiceImportService } from './services/invoice-import.service.js';

const integrationDescribe = describe.runIf(
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true',
);
const fixtureRoot = new URL(
  '../../../tests/fixtures/imports/',
  import.meta.url,
);

integrationDescribe('invoice import preview with PostgreSQL', () => {
  const organizationAId = randomUUID();
  const organizationBId = randomUUID();
  const userAId = randomUUID();
  const userBId = randomUUID();
  const codedDebtorAId = randomUUID();
  const ambiguousDebtorAId = randomUUID();
  const secondAmbiguousDebtorAId = randomUUID();
  const debtorBId = randomUUID();
  const existingInvoiceAId = randomUUID();
  const password = `invoice-import-${randomUUID()}`;
  const emailA = `invoice-import-a-${randomUUID()}@integration.arus.local`;
  const emailB = `invoice-import-b-${randomUUID()}@integration.arus.local`;

  let database: PrismaClient;
  let environment: Environment;
  let app: ReturnType<typeof createApp>;
  let cookieA: string;
  let cookieB: string;
  let readyJobId: string;

  beforeAll(async () => {
    environment = loadEnvironment({
      ...process.env,
      NODE_ENV: 'test',
      SESSION_SECRET: 'invoice-import-integration-secret-adequate-length',
    });
    database = createDatabaseClient(environment);
    const logger = pino({ level: 'silent' });
    const passwordHash = await bcrypt.hash(password, 12);

    await database.organization.createMany({
      data: [
        {
          id: organizationAId,
          name: 'Invoice Import Integration A',
          timezone: 'Asia/Jakarta',
        },
        {
          id: organizationBId,
          name: 'Invoice Import Integration B',
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
          name: 'Invoice Import Owner A',
        },
        {
          id: userBId,
          email: emailB,
          normalizedEmail: emailB,
          passwordHash,
          name: 'Invoice Import Operator B',
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
          id: codedDebtorAId,
          organizationId: organizationAId,
          code: 'EXIST-001',
          normalizedCode: 'exist-001',
          name: 'PT Existing Debtor',
          normalizedName: 'pt existing debtor',
        },
        {
          id: ambiguousDebtorAId,
          organizationId: organizationAId,
          code: null,
          normalizedCode: null,
          name: 'PT Ambiguous',
          normalizedName: 'pt ambiguous',
        },
        {
          id: secondAmbiguousDebtorAId,
          organizationId: organizationAId,
          code: null,
          normalizedCode: null,
          name: 'PT Ambiguous',
          normalizedName: 'pt ambiguous',
        },
        {
          id: debtorBId,
          organizationId: organizationBId,
          code: 'TENANT-B-001',
          normalizedCode: 'tenant-b-001',
          name: 'PT Tenant B',
          normalizedName: 'pt tenant b',
        },
      ],
    });
    await database.invoice.create({
      data: {
        id: existingInvoiceAId,
        organizationId: organizationAId,
        debtorId: codedDebtorAId,
        invoiceNumber: 'INV-EXISTING-001',
        normalizedInvoiceNumber: 'inv-existing-001',
        invoiceDate: databaseDate('2026-06-01'),
        dueDate: databaseDate('2026-06-30'),
        originalAmount: '1000000.00',
      },
    });

    const authService = new AuthService({
      repository: new PrismaAuthRepository(database),
      environment,
      logger,
    });
    const invoiceImportService = new InvoiceImportService({
      repository: new PrismaInvoiceImportRepository(database),
      logger,
    });
    app = createApp({
      authService,
      invoiceImportService,
      environment,
      logger,
    });
    [cookieA, cookieB] = await Promise.all([login(emailA), login(emailB)]);
  }, 30_000);

  afterAll(async () => {
    if (!database) return;

    const organizations = [organizationAId, organizationBId];
    await database.invoiceImportRow.deleteMany({
      where: { organizationId: { in: organizations } },
    });
    await database.invoiceImportJob.deleteMany({
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

  it('persists a mixed READY preview without writing business records', async () => {
    const csv = mixedPreviewCsv();
    const businessCountsBefore = await businessCounts();
    const response = await uploadCsv(cookieA, csv, 'mixed-preview.csv');
    expect(response.status, JSON.stringify(response.body)).toBe(201);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data).toMatchObject({
      filename: 'mixed-preview.csv',
      fileHash: createHash('sha256').update(csv).digest('hex'),
      status: 'READY',
      counts: {
        total: 8,
        valid: 4,
        invalid: 2,
        duplicate: 2,
        warning: 1,
      },
      fileWarnings: [{ code: 'UNKNOWN_COLUMN', field: 'header' }],
      failure: null,
    });
    readyJobId = response.body.data.id as string;

    await expect(businessCounts()).resolves.toEqual(businessCountsBefore);
    const persistedRows = await database.invoiceImportRow.findMany({
      where: { importJobId: readyJobId },
      orderBy: { rowNumber: 'asc' },
    });
    expect(persistedRows).toHaveLength(8);
    expect(persistedRows.map((row) => row.result)).toEqual([
      'VALID',
      'VALID',
      'VALID',
      'INVALID',
      'DUPLICATE',
      'VALID',
      'DUPLICATE',
      'INVALID',
    ]);
    expect(persistedRows[0]).toMatchObject({
      debtorAction: 'MATCH_EXISTING',
      matchedDebtorId: codedDebtorAId,
      warnings: [expect.objectContaining({ code: 'DEBTOR_NAME_MISMATCH' })],
    });
    expect(persistedRows[2]).toMatchObject({
      debtorAction: 'WILL_CREATE',
      matchedDebtorId: null,
      normalizedPayload: expect.objectContaining({
        originalAmount: '1500000.50',
        paidAmount: '500000.25',
        calculatedOutstandingAmount: '1000000.25',
        invoiceDate: '2026-07-03',
      }),
    });
    expect(persistedRows[4]?.errors).toEqual([
      expect.objectContaining({ code: 'DUPLICATE_IN_DATABASE' }),
    ]);
    expect(persistedRows[6]?.errors).toEqual([
      expect.objectContaining({ code: 'DUPLICATE_IN_FILE' }),
    ]);
    expect(persistedRows[7]?.errors).toEqual([
      expect.objectContaining({ code: 'AMBIGUOUS_DEBTOR' }),
    ]);

    const audit = await database.auditLog.findFirstOrThrow({
      where: {
        organizationId: organizationAId,
        actorId: userAId,
        action: 'IMPORT_PREVIEWED',
        entityId: readyJobId,
      },
    });
    expect(audit.requestId).toBeTruthy();
    expect(audit.metadata).toMatchObject({
      totalRows: 8,
      validRows: 4,
      invalidRows: 2,
      duplicateRows: 2,
      warningRows: 1,
      fileWarningCount: 1,
    });
  });

  it('reads rows with stable filtering and pagination', async () => {
    const firstPage = await request(app)
      .get(`/api/imports/${readyJobId}/rows?page=1&limit=2`)
      .set('Cookie', cookieA)
      .expect(200);
    const duplicateRows = await request(app)
      .get(`/api/imports/${readyJobId}/rows?result=DUPLICATE`)
      .set('Cookie', cookieA)
      .expect(200);
    const job = await request(app)
      .get(`/api/imports/${readyJobId}`)
      .set('Cookie', cookieA)
      .expect(200);

    expect(firstPage.body.pagination).toEqual({
      page: 1,
      limit: 2,
      total: 8,
      totalPages: 4,
    });
    expect(firstPage.body.data.map(rowNumber)).toEqual([2, 3]);
    expect(duplicateRows.body.pagination.total).toBe(2);
    expect(duplicateRows.body.data.map(rowNumber)).toEqual([6, 8]);
    expect(job.body.data).toMatchObject({
      id: readyJobId,
      status: 'READY',
      counts: { total: 8, valid: 4, invalid: 2, duplicate: 2 },
    });
  });

  it('persists a FAILED job for a whole-file CSV error', async () => {
    const badCsv = await readFile(new URL('bad-quoting.csv', fixtureRoot));
    const response = await uploadCsv(cookieA, badCsv, 'bad-quoting.csv').expect(
      201,
    );

    expect(response.body.data).toMatchObject({
      status: 'FAILED',
      counts: {
        total: 0,
        valid: 0,
        invalid: 0,
        duplicate: 0,
        warning: 0,
      },
      failure: {
        code: 'MALFORMED_CSV',
        message: expect.any(String),
      },
    });
    const failedJobId = response.body.data.id as string;
    await expect(
      database.invoiceImportRow.count({
        where: { importJobId: failedJobId },
      }),
    ).resolves.toBe(0);
    await expect(
      database.auditLog.count({
        where: {
          organizationId: organizationAId,
          action: 'IMPORT_PREVIEW_FAILED',
          entityId: failedJobId,
        },
      }),
    ).resolves.toBe(1);
  });

  it('hides import jobs and rows across tenant boundaries', async () => {
    const job = await request(app)
      .get(`/api/imports/${readyJobId}`)
      .set('Cookie', cookieB)
      .expect(404);
    const rows = await request(app)
      .get(`/api/imports/${readyJobId}/rows`)
      .set('Cookie', cookieB)
      .expect(404);

    expect(job.body.error.code).toBe('IMPORT_JOB_NOT_FOUND');
    expect(rows.body.error.code).toBe('IMPORT_JOB_NOT_FOUND');
    expect(JSON.stringify([job.body, rows.body])).not.toContain(codedDebtorAId);
  });

  it('requires authentication and a trusted origin before reading uploads', async () => {
    const unauthenticated = await request(app)
      .post('/api/imports/invoices/preview')
      .set('Origin', environment.APP_ORIGIN)
      .attach('file', Buffer.from(validCsv('INV-UNAUTH-1')), {
        filename: 'unauthenticated.csv',
        contentType: 'text/csv',
      })
      .expect(401);
    const untrusted = await request(app)
      .post('/api/imports/invoices/preview')
      .set('Origin', 'https://attacker.invalid')
      .set('Cookie', cookieA)
      .attach('file', Buffer.from(validCsv('INV-ORIGIN-1')), {
        filename: 'untrusted.csv',
        contentType: 'text/csv',
      })
      .expect(403);

    expect(unauthenticated.body.error.code).toBe('UNAUTHENTICATED');
    expect(untrusted.body.error.code).toBe('UNTRUSTED_ORIGIN');
  });

  it('rejects invalid upload shape, media type, and files over 5 MB', async () => {
    const wrongMedia = await request(app)
      .post('/api/imports/invoices/preview')
      .set('Origin', environment.APP_ORIGIN)
      .set('Cookie', cookieA)
      .attach('file', Buffer.from(validCsv('INV-WRONG-MEDIA-1')), {
        filename: 'invoice.txt',
        contentType: 'text/plain',
      })
      .expect(415);
    const unexpectedField = await request(app)
      .post('/api/imports/invoices/preview')
      .set('Origin', environment.APP_ORIGIN)
      .set('Cookie', cookieA)
      .field('description', 'not accepted')
      .expect(400);
    const tooLarge = await request(app)
      .post('/api/imports/invoices/preview')
      .set('Origin', environment.APP_ORIGIN)
      .set('Cookie', cookieA)
      .attach('file', Buffer.alloc(MAX_INVOICE_CSV_BYTES + 1, 0x61), {
        filename: 'too-large.csv',
        contentType: 'text/csv',
      })
      .expect(413);

    expect(wrongMedia.body.error.code).toBe('INVALID_CSV_FILENAME');
    expect(unexpectedField.body.error.code).toBe('UNEXPECTED_MULTIPART_FIELD');
    expect(tooLarge.body.error.code).toBe('CSV_FILE_TOO_LARGE');
  });

  it('validates row-list parameters at the HTTP boundary', async () => {
    const response = await request(app)
      .get(`/api/imports/${readyJobId}/rows?result=UNKNOWN&limit=101`)
      .set('Cookie', cookieA)
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('enforces import tenant consistency and immutable ownership in PostgreSQL', async () => {
    await expect(
      database.invoiceImportJob.create({
        data: {
          organizationId: organizationBId,
          createdById: userAId,
          filename: 'cross-tenant.csv',
          fileHash: 'a'.repeat(64),
        },
      }),
    ).rejects.toBeInstanceOf(Error);

    await expect(
      database.invoiceImportRow.create({
        data: {
          organizationId: organizationBId,
          importJobId: readyJobId,
          rowNumber: 100,
          result: 'VALID',
          normalizedPayload: {},
          errors: [],
          warnings: [],
          debtorAction: 'WILL_CREATE',
        },
      }),
    ).rejects.toBeInstanceOf(Error);

    await expect(
      database.invoiceImportRow.create({
        data: {
          organizationId: organizationAId,
          importJobId: readyJobId,
          rowNumber: 101,
          result: 'VALID',
          normalizedPayload: {},
          errors: [],
          warnings: [],
          debtorAction: 'MATCH_EXISTING',
          matchedDebtorId: debtorBId,
        },
      }),
    ).rejects.toBeInstanceOf(Error);

    await expect(
      database.invoiceImportJob.update({
        where: { id: readyJobId },
        data: { organizationId: organizationBId },
      }),
    ).rejects.toBeInstanceOf(Error);
  });

  function uploadCsv(cookie: string, csv: Buffer | string, filename: string) {
    return request(app)
      .post('/api/imports/invoices/preview')
      .set('Origin', environment.APP_ORIGIN)
      .set('Cookie', cookie)
      .attach('file', Buffer.isBuffer(csv) ? csv : Buffer.from(csv), {
        filename,
        contentType: 'text/csv',
      });
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

  async function businessCounts(): Promise<{
    debtors: number;
    invoices: number;
    payments: number;
    allocations: number;
  }> {
    const [debtors, invoices, payments, allocations] = await Promise.all([
      database.debtor.count({ where: { organizationId: organizationAId } }),
      database.invoice.count({ where: { organizationId: organizationAId } }),
      database.payment.count({ where: { organizationId: organizationAId } }),
      database.paymentAllocation.count({
        where: { organizationId: organizationAId },
      }),
    ]);
    return { debtors, invoices, payments, allocations };
  }
});

function mixedPreviewCsv(): string {
  return [
    'customer_code,customer_name,invoice_number,invoice_date,due_date,original_amount,paid_amount,outstanding_amount,legacy_export_id',
    'EXIST-001,PT Renamed Debtor,INV-READY-001,2026-07-01,2026-07-31,1000000,0,1000000,1',
    ',PT Existing Debtor,INV-READY-002,2026-07-02,2026-08-01,2000000,0,2000000,2',
    'NEW-001,PT New Debtor,INV-READY-003,03/07/2026,03/08/2026,"1.500.000,50","500.000,25","1.000.000,25",3',
    ',PT Invalid Date,INV-INVALID-001,2026-07-31,2026-07-01,1000000,0,1000000,4',
    ',PT Existing Debtor,INV-EXISTING-001,2026-07-04,2026-08-04,1000000,0,1000000,5',
    ',PT File Duplicate,INV-FILE-DUP-001,2026-07-05,2026-08-05,1000000,0,1000000,6',
    ',PT File Duplicate,inv-file-dup-001,2026-07-06,2026-08-06,1000000,0,1000000,7',
    ',PT Ambiguous,INV-AMBIGUOUS-001,2026-07-07,2026-08-07,1000000,0,1000000,8',
  ].join('\n');
}

function validCsv(invoiceNumber: string): string {
  return [
    'customer_name,invoice_number,invoice_date,due_date,original_amount',
    `PT Boundary,${invoiceNumber},2026-07-01,2026-07-31,1000000`,
  ].join('\n');
}

function databaseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function rowNumber(row: { rowNumber: number }): number {
  return row.rowNumber;
}
