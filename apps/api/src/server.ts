import { createApp } from './app.js';
import { loadEnvironment } from './config/env.js';
import { createDatabaseClient } from './lib/database.js';
import { createLogger } from './lib/logger.js';
import { PrismaAuthRepository } from './repositories/auth.repository.js';
import { AuthService } from './services/auth.service.js';

const environment = loadEnvironment();
const logger = createLogger(environment);
const database = createDatabaseClient(environment);
const authService = new AuthService({
  repository: new PrismaAuthRepository(database),
  environment,
  logger,
});
const app = createApp({ authService, environment, logger });

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
