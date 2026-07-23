import { calculateWeeklyReport, formatMoney, parseMoney } from '@arus/domain';
import { describe, expect, it } from 'vitest';

import {
  demoAsOfDate,
  seedAllocations,
  seedDebtors,
  seedDisputes,
  seedInvoices,
  seedOrganizations,
  seedPayments,
  seedPromises,
} from '../../../prisma/seed-data.js';

const demoOrganization = seedOrganizations[0];
const demoDebtors = seedDebtors.filter(
  ({ organizationId }) => organizationId === demoOrganization.id,
);
const demoInvoices = seedInvoices.filter(
  ({ organizationId }) => organizationId === demoOrganization.id,
);
const demoPayments = seedPayments.filter(
  ({ organizationId }) => organizationId === demoOrganization.id,
);
const demoAllocations = seedAllocations.filter(
  ({ organizationId }) => organizationId === demoOrganization.id,
);

describe('full demo seed', () => {
  it('contains the intended deterministic portfolio', () => {
    expect(demoDebtors).toHaveLength(15);
    expect(demoInvoices).toHaveLength(80);
    expect(new Set(demoDebtors.map(({ id }) => id))).toHaveLength(
      demoDebtors.length,
    );
    expect(new Set(demoInvoices.map(({ id }) => id))).toHaveLength(
      demoInvoices.length,
    );
    expect(demoPayments.length).toBeGreaterThanOrEqual(15);
    expect(seedPromises.length).toBeGreaterThanOrEqual(10);
    expect(seedDisputes.length).toBeGreaterThanOrEqual(6);
  });

  it('keeps every payment traceable and every invoice within its original', () => {
    for (const payment of demoPayments) {
      const allocations = demoAllocations.filter(
        ({ paymentId }) => paymentId === payment.id,
      );
      expect(allocations, payment.id).toHaveLength(1);
      expect(allocations[0]?.amount).toBe(payment.amount);
    }

    for (const invoice of demoInvoices) {
      const allocated = demoAllocations
        .filter(
          (allocation) =>
            allocation.invoiceId === invoice.id &&
            allocation.reversedAt === null,
        )
        .reduce((sum, allocation) => sum + parseMoney(allocation.amount), 0n);
      expect(
        allocated <= parseMoney(invoice.originalAmount),
        invoice.invoiceNumber,
      ).toBe(true);
    }
  });

  it('reconciles aging and collections for the default demo week', () => {
    const report = calculateWeeklyReport({
      from: shiftDate(demoAsOfDate, -6),
      to: demoAsOfDate,
      invoices: demoInvoices.map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        originalAmount: invoice.originalAmount,
        debtor: {
          id: invoice.debtorId,
          code: null,
          name: invoice.debtorId,
        },
        allocations: demoAllocations
          .filter(({ invoiceId }) => invoiceId === invoice.id)
          .map((allocation) => ({
            amount: allocation.amount,
            allocationDate: allocation.allocationDate,
            reversalDate: allocation.reversedAt?.slice(0, 10) ?? null,
          })),
      })),
      promises: seedPromises
        .filter(({ organizationId }) => organizationId === demoOrganization.id)
        .map((promise) => ({
          amount: promise.amount,
          promiseDate: promise.promiseDate,
          createdDate: promise.createdAt.slice(0, 10),
          fulfilledDate: promise.fulfilledAt?.slice(0, 10) ?? null,
          cancelledDate: promise.cancelledAt?.slice(0, 10) ?? null,
        })),
      disputes: seedDisputes
        .filter(({ organizationId }) => organizationId === demoOrganization.id)
        .map((dispute) => ({
          invoiceId: dispute.invoiceId,
          createdDate: dispute.createdAt.slice(0, 10),
          resolvedDate: dispute.resolvedAt?.slice(0, 10) ?? null,
        })),
    });
    const agingTotal = report.aging.reduce(
      (sum, metric) => sum + parseMoney(metric.outstandingAmount),
      0n,
    );

    expect(formatMoney(agingTotal)).toBe(report.summary.totalAr);
    expect(parseMoney(report.collections.amount)).toBeGreaterThan(0n);
    expect(report.summary.overdueInvoiceCount).toBeGreaterThan(0);
    expect(report.promises.active.count).toBeGreaterThan(0);
    expect(report.promises.broken.count).toBeGreaterThan(0);
    expect(report.disputes.openInvoiceCount).toBeGreaterThan(0);
  });
});

function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
