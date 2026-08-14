import { createApp } from './app.js';
import { loadEnvironment } from './config/env.js';
import { createAccountEmailSender } from './lib/account-email.js';
import { createDatabaseClient } from './lib/database.js';
import { createLogger } from './lib/logger.js';
import { PrismaAuthRepository } from './repositories/auth.repository.js';
import { PrismaCommunicationRepository } from './repositories/communication.repository.js';
import { PrismaDisputeRepository } from './repositories/dispute.repository.js';
import { PrismaInvoiceImportRepository } from './repositories/invoice-import.repository.js';
import { PrismaPaymentRepository } from './repositories/payment.repository.js';
import { PrismaPromiseRepository } from './repositories/promise.repository.js';
import { PrismaAccountLifecycleRepository } from './repositories/account-lifecycle.repository.js';
import { PrismaReceivablesRepository } from './repositories/receivables.repository.js';
import { PrismaReportRepository } from './repositories/report.repository.js';
import { PrismaWhatsAppRepository } from './repositories/whatsapp.repository.js';
import { AccountLifecycleService } from './services/account-lifecycle.service.js';
import { AuthService } from './services/auth.service.js';
import { CollectionQueueService } from './services/collection-queue.service.js';
import { CommunicationService } from './services/communication.service.js';
import { DisputeService } from './services/dispute.service.js';
import { DashboardService } from './services/dashboard.service.js';
import { InvoiceImportService } from './services/invoice-import.service.js';
import { PaymentService } from './services/payment.service.js';
import { PromiseService } from './services/promise.service.js';
import { ReceivablesService } from './services/receivables.service.js';
import { ReportService } from './services/report.service.js';
import { WhatsAppService } from './services/whatsapp.service.js';
import { createEvidenceStorage } from './whatsapp/storage.js';

/**
 * The API composition root wires one modular monolith from explicit adapters.
 * Shared repositories keep payment and WhatsApp commands on the same database.
 * Secrets are loaded once and passed only to server-side infrastructure.
 * HTTP shutdown stops new work before disconnecting persistent resources.
 * Worker delivery remains a separate process with the same durable contracts.
 */

const environment = loadEnvironment();
const logger = createLogger(environment);
const database = createDatabaseClient(environment);
const authService = new AuthService({
  repository: new PrismaAuthRepository(database),
  environment,
  logger,
});
const lifecycleService = new AccountLifecycleService({
  repository: new PrismaAccountLifecycleRepository(database),
  emailSender: createAccountEmailSender(environment, logger),
  environment,
  logger,
});
const receivablesRepository = new PrismaReceivablesRepository(database);
const receivablesService = new ReceivablesService({
  repository: receivablesRepository,
});
const dashboardService = new DashboardService({
  repository: receivablesRepository,
});
const collectionQueueService = new CollectionQueueService({
  repository: receivablesRepository,
});
const communicationService = new CommunicationService({
  repository: new PrismaCommunicationRepository(database),
});
const promiseService = new PromiseService({
  repository: new PrismaPromiseRepository(database),
});
const disputeService = new DisputeService({
  repository: new PrismaDisputeRepository(database),
});
const invoiceImportService = new InvoiceImportService({
  repository: new PrismaInvoiceImportRepository(database),
  logger,
});
const paymentRepository = new PrismaPaymentRepository(database);
const paymentService = new PaymentService({ repository: paymentRepository });
const reportService = new ReportService({
  repository: new PrismaReportRepository(database),
});
const whatsappService = new WhatsAppService({
  repository: new PrismaWhatsAppRepository(database),
  storage: createEvidenceStorage(environment),
  paymentService,
});
const app = createApp({
  authService,
  lifecycleService,
  receivablesService,
  invoiceImportService,
  dashboardService,
  collectionQueueService,
  communicationService,
  promiseService,
  disputeService,
  paymentService,
  reportService,
  whatsappService,
  environment,
  logger,
});

const server = app.listen(environment.PORT, () => {
  logger.info(
    { origin: environment.API_ORIGIN, port: environment.PORT },
    'API listening',
  );
});

let shuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info({ signal }, 'API shutdown requested');

  const forceCloseTimer = setTimeout(() => {
    logger.error('API shutdown grace period exceeded; closing connections');
    process.exitCode = 1;
    server.closeAllConnections();
  }, 10_000);
  forceCloseTimer.unref();

  server.close(async (error) => {
    clearTimeout(forceCloseTimer);

    if (error) {
      logger.error({ err: error }, 'API shutdown failed');
      process.exitCode = 1;
    }

    try {
      await database.$disconnect();
    } catch (disconnectError) {
      logger.error({ err: disconnectError }, 'Database shutdown failed');
      process.exitCode = 1;
    }

    logger.info('API shutdown complete');
  });
  server.closeIdleConnections();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
