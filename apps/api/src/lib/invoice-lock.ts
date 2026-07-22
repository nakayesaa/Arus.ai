import type { Prisma } from '../generated/prisma/client.js';

/**
 * Serializes financial/workflow decisions for one invoice across services.
 * Day 9 payment allocation must use the same lock before checking balances.
 */
export async function lockInvoice(
  transaction: Prisma.TransactionClient,
  invoiceId: string,
): Promise<void> {
  await transaction.$queryRaw<Array<{ acquired: boolean }>>`
    SELECT true AS "acquired"
    FROM (
      SELECT pg_advisory_xact_lock(hashtextextended(CAST(${invoiceId} AS text), 0))
    ) AS "invoice_lock"
  `;
}
