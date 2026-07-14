import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from './app.js';
import { loadEnvironment } from './config/env.js';
import type { AuthServiceContract } from './services/auth.service.js';

const environment = loadEnvironment({
  NODE_ENV: 'test',
  APP_ORIGIN: 'http://localhost:3000',
  API_ORIGIN: 'http://localhost:4000',
  DATABASE_URL: 'postgresql://arus:test@localhost:5432/arus_test',
  SESSION_SECRET: 'test-session-secret-that-is-at-least-32-characters',
  LOG_LEVEL: 'silent',
});

const authService: AuthServiceContract = {
  login: async () => {
    throw new Error('Not used by application shell tests');
  },
  authenticate: async () => null,
  logout: async () => undefined,
};

function testApp() {
  return createApp({
    authService,
    environment,
    logger: pino({ level: 'silent' }),
  });
}

describe('API application', () => {
  it('reports API liveness', async () => {
    const response = await request(testApp()).get('/health').expect(200);

    expect(response.body).toEqual({
      status: 'ok',
      service: 'arus-api',
    });
    expect(response.headers['x-request-id']).toBeTypeOf('string');
  });

  it('propagates a safe request ID', async () => {
    const response = await request(testApp())
      .get('/health')
      .set('X-Request-ID', 'test-request-123')
      .expect(200);

    expect(response.headers['x-request-id']).toBe('test-request-123');
  });

  it('returns the stable error envelope for an unknown route', async () => {
    const response = await request(testApp()).get('/missing').expect(404);

    expect(response.body).toMatchObject({
      error: {
        code: 'NOT_FOUND',
        message: 'Resource not found',
      },
    });
    expect(response.body.error.requestId).toBe(
      response.headers['x-request-id'],
    );
  });
});
