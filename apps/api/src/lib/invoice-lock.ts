import type { Prisma } from '../generated/prisma/client.js';

/**
 * This transaction-scoped advisory lock serializes decisions for one invoice.
 * Every payment path acquires it before reading the balance it intends to change.
 * Competing requests wait, then recalculate against the newly committed allocation.
 * PostgreSQL releases the lock automatically on transaction commit or rollback.
 * Using the invoice UUID hash keeps all application services on one lock identity.
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
