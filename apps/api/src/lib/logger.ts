import pino, { type Logger } from 'pino';

import type { Environment } from '../config/env.js';

export function createLogger(environment: Environment): Logger {
  return pino({
    level: environment.LOG_LEVEL,
    base: {
      service: 'arus-api',
      environment: environment.NODE_ENV,
    },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers.set-cookie',
        '*.password',
        '*.passwordHash',
        '*.sessionToken',
      ],
      censor: '[REDACTED]',
    },
  });
}
