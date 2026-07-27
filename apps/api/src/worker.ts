import { loadEnvironment } from './config/env.js';
import { createDatabaseClient } from './lib/database.js';
import { createLogger } from './lib/logger.js';
import { PrismaWhatsAppRepository } from './repositories/whatsapp.repository.js';
import { createWhatsAppProvider } from './whatsapp/provider.js';
import { createEvidenceStorage } from './whatsapp/storage.js';
import { WhatsAppWorker } from './whatsapp/worker.js';

const environment = loadEnvironment();
const logger = createLogger(environment);
const database = createDatabaseClient(environment);
const worker = new WhatsAppWorker({
  repository: new PrismaWhatsAppRepository(database),
  provider: createWhatsAppProvider(environment),
  storage: createEvidenceStorage(environment),
  environment,
  logger,
});

let stopping = false;

async function poll(): Promise<void> {
  while (!stopping) {
    const worked = await worker.runOnce().catch((error: unknown) => {
      logger.error({ err: error }, 'WhatsApp worker poll failed');
      return false;
    });
    if (!worked) {
      await delay(environment.WHATSAPP_WORKER_POLL_MS);
    }
  }
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'WhatsApp worker shutdown requested');
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

logger.info({ workerId: worker.id }, 'WhatsApp worker started');
await poll();
await database.$disconnect();
logger.info({ workerId: worker.id }, 'WhatsApp worker stopped');

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
