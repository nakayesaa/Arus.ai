import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';

import { loadEnvironment, type Environment } from './config/env.js';
import { createLogger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { createHttpLogger } from './middleware/http-logger.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { createAccountLifecycleRouter } from './routes/account-lifecycle.routes.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createCollectionQueueRouter } from './routes/collection-queue.routes.js';
import { createCommunicationRouter } from './routes/communication.routes.js';
import { createDashboardRouter } from './routes/dashboard.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { createInvoiceImportRouter } from './routes/invoice-import.routes.js';
import { createReceivablesRouter } from './routes/receivables.routes.js';
import type { AccountLifecycleServiceContract } from './services/account-lifecycle.service.js';
import type { AuthServiceContract } from './services/auth.service.js';
import type { CollectionQueueServiceContract } from './services/collection-queue.service.js';
import type { CommunicationServiceContract } from './services/communication.service.js';
import type { DashboardServiceContract } from './services/dashboard.service.js';
import type { InvoiceImportServiceContract } from './services/invoice-import.service.js';
import type { ReceivablesServiceContract } from './services/receivables.service.js';

interface CreateAppOptions {
  authService: AuthServiceContract;
  lifecycleService?: AccountLifecycleServiceContract;
  receivablesService?: ReceivablesServiceContract;
  invoiceImportService?: InvoiceImportServiceContract;
  dashboardService?: DashboardServiceContract;
  collectionQueueService?: CollectionQueueServiceContract;
  communicationService?: CommunicationServiceContract;
  environment?: Environment;
  logger?: Logger;
}

export function createApp(options: CreateAppOptions): Express {
  const environment = options.environment ?? loadEnvironment();
  const logger = options.logger ?? createLogger(environment);
  const app = express();

  app.disable('x-powered-by');
  if (environment.TRUST_PROXY_HOPS > 0) {
    app.set('trust proxy', environment.TRUST_PROXY_HOPS);
  }
  app.use(requestIdMiddleware);
  app.use(createHttpLogger(logger));
  app.use(helmet());
  app.use(
    cors({
      credentials: true,
      origin: environment.APP_ORIGIN,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.use(healthRouter);
  app.use(
    createAuthRouter({
      authService: options.authService,
      environment,
    }),
  );
  if (options.lifecycleService) {
    app.use(
      createAccountLifecycleRouter({
        authService: options.authService,
        lifecycleService: options.lifecycleService,
        environment,
      }),
    );
  }
  if (options.receivablesService) {
    app.use(
      createReceivablesRouter({
        authService: options.authService,
        receivablesService: options.receivablesService,
        environment,
      }),
    );
  }
  if (options.dashboardService) {
    app.use(
      createDashboardRouter({
        authService: options.authService,
        dashboardService: options.dashboardService,
        environment,
      }),
    );
  }
  if (options.collectionQueueService) {
    app.use(
      createCollectionQueueRouter({
        authService: options.authService,
        collectionQueueService: options.collectionQueueService,
        environment,
      }),
    );
  }
  if (options.communicationService) {
    app.use(
      createCommunicationRouter({
        authService: options.authService,
        communicationService: options.communicationService,
        environment,
      }),
    );
  }
  if (options.invoiceImportService) {
    app.use(
      createInvoiceImportRouter({
        authService: options.authService,
        invoiceImportService: options.invoiceImportService,
        environment,
      }),
    );
  }
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
