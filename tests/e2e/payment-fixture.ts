import { randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../apps/api/src/generated/prisma/client.js';

const DEMO_ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';

export interface PaymentFixture {
  debtorId: string;
  debtorName: string;
  invoiceId: string;
  invoiceNumber: string;
  originalAmount: string;
}

export async function createPaymentFixture(): Promise<PaymentFixture> {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
  const fixture: PaymentFixture = {
    debtorId: randomUUID(),
    debtorName: `E2E Payment Customer ${suffix}`,
    invoiceId: randomUUID(),
    invoiceNumber: `E2E-PAY-${suffix.toUpperCase()}`,
    originalAmount: '12345678.00',
  };
  const database = paymentFixtureDatabase();

  try {
    await database.$transaction(async (transaction) => {
      await transaction.debtor.create({
        data: {
          id: fixture.debtorId,
          organizationId: DEMO_ORGANIZATION_ID,
          code: `E2E-PAY-${suffix}`,
          normalizedCode: `e2e-pay-${suffix}`,
          name: fixture.debtorName,
          normalizedName: fixture.debtorName.toLocaleLowerCase('en-US'),
          contactName: 'E2E Accounts Payable',
          email: `e2e-${suffix}@example.test`,
        },
      });
      await transaction.invoice.create({
        data: {
          id: fixture.invoiceId,
          organizationId: DEMO_ORGANIZATION_ID,
          debtorId: fixture.debtorId,
          invoiceNumber: fixture.invoiceNumber,
          normalizedInvoiceNumber:
            fixture.invoiceNumber.toLocaleLowerCase('en-US'),
          invoiceDate: new Date('2026-06-01T00:00:00.000Z'),
          dueDate: new Date('2026-06-30T00:00:00.000Z'),
          originalAmount: fixture.originalAmount,
          description: 'Isolated payment recording E2E fixture',
        },
      });
    });
    return fixture;
  } finally {
    await database.$disconnect();
  }
}

export async function cleanupPaymentFixture(
  fixture: PaymentFixture | undefined,
): Promise<void> {
  if (!fixture) return;
  const database = paymentFixtureDatabase();

  try {
    await database.$transaction(async (transaction) => {
      const payments = await transaction.payment.findMany({
        where: {
          allocations: { some: { invoiceId: fixture.invoiceId } },
        },
        select: { id: true },
      });
      const paymentIds = payments.map((payment) => payment.id);

      await transaction.auditLog.deleteMany({
        where: { entityId: { in: paymentIds } },
      });
      await transaction.paymentAllocation.deleteMany({
        where: { invoiceId: fixture.invoiceId },
      });
      await transaction.payment.deleteMany({
        where: { id: { in: paymentIds } },
      });
      await transaction.invoice.deleteMany({
        where: { id: fixture.invoiceId },
      });
      await transaction.debtor.deleteMany({
        where: { id: fixture.debtorId, invoices: { none: {} } },
      });
    });
  } finally {
    await database.$disconnect();
  }
}

function paymentFixtureDatabase(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for payment E2E fixtures');
  }
  return new PrismaClient({
    adapter: new PrismaPg({
      application_name: 'arus-payment-e2e-fixture',
      connectionString,
      max: 1,
    }),
  });
}
