import { createApp } from './app.js';
import { loadEnvironment } from './config/env.js';
import { createLogger } from './lib/logger.js';

const environment = loadEnvironment();
const logger = createLogger(environment);
const app = createApp({ environment, logger });

const server = app.listen(environment.PORT, () => {
  logger.info(
    { origin: environment.API_ORIGIN, port: environment.PORT },
    'API listening',
  );
});

function shutdown(signal: NodeJS.Signals): void {
  logger.info({ signal }, 'API shutdown requested');

  server.close((error) => {
    if (error) {
      logger.error({ err: error }, 'API shutdown failed');
      process.exitCode = 1;
      return;
    }

    logger.info('API shutdown complete');
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
