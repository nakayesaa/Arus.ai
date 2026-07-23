import assert from 'node:assert/strict';

import { PrismaPg } from '@prisma/adapter-pg';
import { calculateWeeklyReport, formatMoney, parseMoney } from '@arus/domain';

import { PrismaClient } from '../apps/api/src/generated/prisma/client.js';
import { businessDateInTimeZone } from '../apps/api/src/lib/business-date.js';
import { demoAsOfDate, seedOrganizations } from '../prisma/seed-data.js';

const databaseUrl = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL or DIRECT_DATABASE_URL is required');
}
if (process.env.NODE_ENV === 'production') {
  throw new Error('Demo verification is forbidden in production');
}

const database = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});
const demoOrganization = seedOrganizations[0];

try {
  const [debtors, invoices, promises, disputes, payments] = await Promise.all([
    database.debtor.count({
      where: {
        organizationId: demoOrganization.id,
        deletedAt: null,
      },
    }),
    database.invoice.findMany({
      where: {
        organizationId: demoOrganization.id,
        deletedAt: null,
      },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        dueDate: true,
        originalAmount: true,
        debtor: { select: { id: true, code: true, name: true } },
        allocations: {
          orderBy: { id: 'asc' },
          select: {
            amount: true,
            allocationDate: true,
            reversedAt: true,
          },
        },
      },
    }),
    database.promiseToPay.findMany({
      where: { organizationId: demoOrganization.id },
      orderBy: { id: 'asc' },
      select: {
        amount: true,
        promiseDate: true,
        createdAt: true,
        fulfilledAt: true,
        cancelledAt: true,
      },
    }),
    database.dispute.findMany({
      where: { organizationId: demoOrganization.id },
      orderBy: { id: 'asc' },
      select: {
        invoiceId: true,
        createdAt: true,
        resolvedAt: true,
      },
    }),
    database.payment.findMany({
      where: { organizationId: demoOrganization.id },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        amount: true,
        allocations: {
          select: {
            organizationId: true,
            invoice: {
              select: { organizationId: true },
            },
            amount: true,
          },
        },
      },
    }),
  ]);

  assert.equal(debtors, 15, 'demo tenant must contain exactly 15 debtors');
  assert.equal(
    invoices.length,
    80,
    'demo tenant must contain exactly 80 invoices',
  );
  assert.ok(payments.length >= 15, 'demo tenant must contain varied payments');
  assert.ok(promises.length >= 10, 'demo tenant must contain varied promises');
  assert.ok(disputes.length >= 6, 'demo tenant must contain varied disputes');

  for (const payment of payments) {
    assert.equal(
      payment.allocations.length,
      1,
      `payment ${payment.id} must have one traceable P0 allocation`,
    );
    const allocation = payment.allocations[0]!;
    assert.equal(allocation.organizationId, demoOrganization.id);
    assert.equal(allocation.invoice.organizationId, demoOrganization.id);
    assert.equal(
      allocation.amount.toFixed(2),
      payment.amount.toFixed(2),
      `payment ${payment.id} must reconcile to its allocation`,
    );
  }

  for (const invoice of invoices) {
    const allocated = invoice.allocations
      .filter(({ reversedAt }) => reversedAt === null)
      .reduce((sum, allocation) => {
        return sum + parseMoney(allocation.amount.toFixed(2));
      }, 0n);
    assert.ok(
      allocated <= parseMoney(invoice.originalAmount.toFixed(2)),
      `invoice ${invoice.invoiceNumber} is over-allocated`,
    );
  }

  const report = calculateWeeklyReport({
    from: shiftDate(demoAsOfDate, -6),
    to: demoAsOfDate,
    invoices: invoices.map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: databaseDate(invoice.invoiceDate),
      dueDate: databaseDate(invoice.dueDate),
      originalAmount: invoice.originalAmount.toFixed(2),
      debtor: invoice.debtor,
      allocations: invoice.allocations.map((allocation) => ({
        amount: allocation.amount.toFixed(2),
        allocationDate: databaseDate(allocation.allocationDate),
        reversalDate: allocation.reversedAt
          ? businessDateInTimeZone(
              allocation.reversedAt,
              demoOrganization.timezone,
            )
          : null,
      })),
    })),
    promises: promises.map((promise) => ({
      amount: promise.amount.toFixed(2),
      promiseDate: databaseDate(promise.promiseDate),
      createdDate: businessDateInTimeZone(
        promise.createdAt,
        demoOrganization.timezone,
      ),
      fulfilledDate: promise.fulfilledAt
        ? businessDateInTimeZone(promise.fulfilledAt, demoOrganization.timezone)
        : null,
      cancelledDate: promise.cancelledAt
        ? businessDateInTimeZone(promise.cancelledAt, demoOrganization.timezone)
        : null,
    })),
    disputes: disputes.map((dispute) => ({
      invoiceId: dispute.invoiceId,
      createdDate: businessDateInTimeZone(
        dispute.createdAt,
        demoOrganization.timezone,
      ),
      resolvedDate: dispute.resolvedAt
        ? businessDateInTimeZone(dispute.resolvedAt, demoOrganization.timezone)
        : null,
    })),
  });
  const agingTotal = report.aging.reduce(
    (sum, metric) => sum + parseMoney(metric.outstandingAmount),
    0n,
  );
  assert.equal(
    formatMoney(agingTotal),
    report.summary.totalAr,
    'aging buckets must reconcile to total AR',
  );
  assert.ok(
    parseMoney(report.collections.amount) > 0n,
    'weekly demo report must contain collection activity',
  );
  assert.ok(
    report.summary.overdueInvoiceCount > 0,
    'demo report must contain overdue exposure',
  );

  console.info(
    JSON.stringify(
      {
        status: 'ok',
        asOfDate: demoAsOfDate,
        debtors,
        invoices: invoices.length,
        payments: payments.length,
        promises: promises.length,
        disputes: disputes.length,
        weeklyReport: {
          totalAr: report.summary.totalAr,
          totalOverdue: report.summary.totalOverdue,
          collected: report.collections.amount,
          openInvoices: report.summary.openInvoiceCount,
        },
      },
      null,
      2,
    ),
  );
} finally {
  await database.$disconnect();
}

function databaseDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
