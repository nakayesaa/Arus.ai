import { describe, expect, it } from 'vitest';

import { loadEnvironment } from './env.js';

const validEnvironment = {
  NODE_ENV: 'test',
  APP_ORIGIN: 'http://localhost:3000',
  API_ORIGIN: 'http://localhost:4000',
  DATABASE_URL: 'postgresql://arus:test@localhost:5432/arus_test',
  SESSION_SECRET: 'test-session-secret-that-is-at-least-32-characters',
} satisfies NodeJS.ProcessEnv;

describe('environment configuration', () => {
  it('loads bounded authentication and database defaults', () => {
    const environment = loadEnvironment(validEnvironment);

    expect(environment.DATABASE_POOL_MAX).toBe(10);
    expect(environment.SESSION_TTL_HOURS).toBe(168);
    expect(environment.AUTH_LOGIN_MAX_ATTEMPTS).toBe(10);
    expect(environment.TRUST_PROXY_HOPS).toBe(0);
  });

  it('rejects a non-PostgreSQL database URL', () => {
    expect(() =>
      loadEnvironment({
        ...validEnvironment,
        DATABASE_URL: 'https://database.example.com',
      }),
    ).toThrow('Invalid environment configuration: DATABASE_URL');
  });

  it('rejects example secrets and insecure origins in production', () => {
    expect(() =>
      loadEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        SESSION_SECRET: 'replace-with-at-least-32-random-characters',
      }),
    ).toThrow('Invalid environment configuration: SESSION_SECRET, APP_ORIGIN');
  });
});
