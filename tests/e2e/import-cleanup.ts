import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../apps/api/src/generated/prisma/client.js';

export async function cleanupInvoiceImportJobs(
  importJobIds: readonly string[],
): Promise<void> {
  const jobIds = [...new Set(importJobIds)];
  if (jobIds.length === 0) return;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to clean up import E2E data');
  }

  const database = new PrismaClient({
    adapter: new PrismaPg({
      application_name: 'arus-e2e-cleanup',
      connectionString,
      max: 1,
    }),
  });

  try {
    await database.$transaction(async (transaction) => {
      const rows = await transaction.invoiceImportRow.findMany({
        where: { importJobId: { in: jobIds } },
        select: {
          debtorAction: true,
          committedInvoiceId: true,
          committedInvoice: { select: { debtorId: true } },
        },
      });
      const invoiceIds = rows.flatMap((row) =>
        row.committedInvoiceId ? [row.committedInvoiceId] : [],
      );
      const createdDebtorIds = rows.flatMap((row) =>
        row.debtorAction === 'WILL_CREATE' && row.committedInvoice
          ? [row.committedInvoice.debtorId]
          : [],
      );
      const importPaymentReferences = jobIds.map((jobId) => `IMPORT:${jobId}:`);
      const payments = await transaction.payment.findMany({
        where: {
          OR: importPaymentReferences.map((reference) => ({
            bankReference: { startsWith: reference },
          })),
        },
        select: { id: true },
      });
      const paymentIds = payments.map((payment) => payment.id);

      await transaction.paymentAllocation.deleteMany({
        where: {
          OR: [
            { invoiceId: { in: invoiceIds } },
            { paymentId: { in: paymentIds } },
          ],
        },
      });
      await transaction.payment.deleteMany({
        where: { id: { in: paymentIds } },
      });
      await transaction.invoiceImportRow.deleteMany({
        where: { importJobId: { in: jobIds } },
      });
      await transaction.auditLog.deleteMany({
        where: { entityId: { in: jobIds } },
      });
      await transaction.invoiceImportJob.deleteMany({
        where: { id: { in: jobIds } },
      });
      await transaction.invoice.deleteMany({
        where: { id: { in: invoiceIds } },
      });
      await transaction.debtor.deleteMany({
        where: {
          id: { in: createdDebtorIds },
          invoices: { none: {} },
          payments: { none: {} },
          importRows: { none: {} },
        },
      });
    });
  } finally {
    await database.$disconnect();
  }
}
