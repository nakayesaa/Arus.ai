import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';

import { loadEnvironment, type Environment } from './config/env.js';
import { createLogger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { createHttpLogger } from './middleware/http-logger.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { healthRouter } from './routes/health.routes.js';

interface CreateAppOptions {
  environment?: Environment;
  logger?: Logger;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const environment = options.environment ?? loadEnvironment();
  const logger = options.logger ?? createLogger(environment);
  const app = express();

  app.disable('x-powered-by');
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
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
