import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../apps/api/src/generated/prisma/client.js';

export async function cleanupCollectionCases(input: {
  promiseIds: readonly string[];
  disputeIds: readonly string[];
}): Promise<void> {
  const promiseIds = [...new Set(input.promiseIds)];
  const disputeIds = [...new Set(input.disputeIds)];
  const entityIds = [...promiseIds, ...disputeIds];
  if (entityIds.length === 0) return;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to clean up collection E2E data');
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
      await transaction.auditLog.deleteMany({
        where: { entityId: { in: entityIds } },
      });
      await transaction.promiseToPay.deleteMany({
        where: { id: { in: promiseIds } },
      });
      await transaction.dispute.deleteMany({
        where: { id: { in: disputeIds } },
      });
    });
  } finally {
    await database.$disconnect();
  }
}
