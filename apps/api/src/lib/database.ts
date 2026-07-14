import { PrismaPg } from '@prisma/adapter-pg';

import type { Environment } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

export function createDatabaseClient(environment: Environment): PrismaClient {
  const adapter = new PrismaPg({
    application_name: 'arus-api',
    connectionString: environment.DATABASE_URL,
    connectionTimeoutMillis: environment.DATABASE_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: environment.DATABASE_IDLE_TIMEOUT_MS,
    max: environment.DATABASE_POOL_MAX,
  });

  return new PrismaClient({ adapter });
}
