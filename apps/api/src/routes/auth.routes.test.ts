import pino from 'pino';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../app.js';
import { loadEnvironment, type Environment } from '../config/env.js';
import { MembershipRole } from '../generated/prisma/enums.js';
import {
  InvalidCredentialsError,
  type AuthContext,
  type AuthServiceContract,
  type LoginInput,
  type LoginResult,
} from '../services/auth.service.js';

const token = 'a'.repeat(43);
const context: AuthContext = {
  sessionId: '30000000-0000-4000-8000-000000000001',
  user: {
    id: '10000000-0000-4000-8000-000000000001',
    email: 'owner@demo.arus.local',
    name: 'Demo Owner',
  },
  organization: {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Demo Indonesia',
    timezone: 'Asia/Jakarta',
  },
  role: MembershipRole.OWNER,
};
const loginResult: LoginResult = {
  token,
  expiresAt: new Date('2026-07-21T04:00:00.000Z'),
  context,
};

class FakeAuthService implements AuthServiceContract {
  loginResult: LoginResult | Error = loginResult;
  authenticationResult: AuthContext | null = context;
  loginCalls: LoginInput[] = [];
  logoutTokens: string[] = [];

  async login(input: LoginInput): Promise<LoginResult> {
    this.loginCalls.push(input);

    if (this.loginResult instanceof Error) {
      throw this.loginResult;
    }

    return this.loginResult;
  }

  async authenticate(authenticationToken: string): Promise<AuthContext | null> {
    void authenticationToken;
    return this.authenticationResult;
  }

  async logout(logoutToken: string): Promise<void> {
    this.logoutTokens.push(logoutToken);
  }
}

const developmentEnvironment = environment();

function environment(overrides: Partial<NodeJS.ProcessEnv> = {}): Environment {
  return loadEnvironment({
    NODE_ENV: 'test',
    APP_ORIGIN: 'http://localhost:3000',
    API_ORIGIN: 'http://localhost:4000',
    DATABASE_URL: 'postgresql://arus:test@localhost:5432/arus_test',
    SESSION_SECRET: 'test-session-secret-that-is-at-least-32-characters',
    LOG_LEVEL: 'silent',
    ...overrides,
  });
}

function testApp(
  authService: AuthServiceContract,
  testEnvironment = developmentEnvironment,
) {
  return createApp({
    authService,
    environment: testEnvironment,
    logger: pino({ level: 'silent' }),
  });
}

describe('authentication HTTP contract', () => {
  let authService: FakeAuthService;

  beforeEach(() => {
    authService = new FakeAuthService();
  });

  it('creates an HTTP-only same-site cookie without exposing its token', async () => {
    const response = await request(testApp(authService))
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({
        email: 'owner@demo.arus.local',
        password: 'demo-password',
      })
      .expect(200);

    expect(response.headers['set-cookie']?.[0]).toContain(
      `arus_session=${token}`,
    );
    expect(response.headers['set-cookie']?.[0]).toContain('HttpOnly');
    expect(response.headers['set-cookie']?.[0]).toContain('SameSite=Lax');
    expect(response.headers['set-cookie']?.[0]).not.toContain('Secure');
    expect(JSON.stringify(response.body)).not.toContain(token);
    expect(response.body).toEqual({
      data: {
        user: context.user,
        organization: context.organization,
        role: MembershipRole.OWNER,
        expiresAt: '2026-07-21T04:00:00.000Z',
      },
    });
  });

  it('returns one generic response for invalid credentials', async () => {
    authService.loginResult = new InvalidCredentialsError();

    const response = await request(testApp(authService))
      .post('/api/auth/login')
      .send({ email: 'missing@example.com', password: 'wrong' })
      .expect(401);

    expect(response.body).toMatchObject({
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      },
    });
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('rejects unexpected tenant input and untrusted browser origins', async () => {
    const app = testApp(authService);

    const validationResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'owner@demo.arus.local',
        password: 'demo-password',
        organizationId: '00000000-0000-4000-8000-000000000002',
      })
      .expect(400);
    expect(validationResponse.body.error.code).toBe('VALIDATION_ERROR');

    const originResponse = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'https://attacker.example')
      .send({
        email: 'owner@demo.arus.local',
        password: 'demo-password',
      })
      .expect(403);
    expect(originResponse.body.error.code).toBe('UNTRUSTED_ORIGIN');
    expect(authService.loginCalls).toHaveLength(0);
  });

  it('requires JSON and returns stable malformed-body errors', async () => {
    const app = testApp(authService);

    const mediaResponse = await request(app)
      .post('/api/auth/login')
      .type('form')
      .send({ email: 'owner@demo.arus.local', password: 'demo-password' })
      .expect(415);
    expect(mediaResponse.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');

    const jsonResponse = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{invalid')
      .expect(400);
    expect(jsonResponse.body.error.code).toBe('INVALID_JSON');
  });

  it('returns only safe authenticated context from /me', async () => {
    const app = testApp(authService);

    await request(app).get('/api/auth/me').expect(401);

    const response = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `arus_session=${token}`)
      .expect(200);

    expect(response.body).toEqual({
      data: {
        user: context.user,
        organization: context.organization,
        role: MembershipRole.OWNER,
      },
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /token|password|sessionId/i,
    );
  });

  it('revokes logout idempotently and clears the browser cookie', async () => {
    const response = await request(testApp(authService))
      .post('/api/auth/logout')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', `arus_session=${token}`)
      .expect(204);

    expect(authService.logoutTokens).toEqual([token]);
    expect(response.headers['set-cookie']?.[0]).toContain('arus_session=;');

    await request(testApp(authService)).post('/api/auth/logout').expect(204);
  });

  it('uses a secure __Host cookie in production', async () => {
    const productionEnvironment = environment({
      NODE_ENV: 'production',
      APP_ORIGIN: 'https://app.arus.example',
      API_ORIGIN: 'https://api.arus.example',
      SESSION_SECRET: 'production-like-test-secret-with-more-than-32-chars',
    });

    const response = await request(testApp(authService, productionEnvironment))
      .post('/api/auth/login')
      .set('Origin', 'https://app.arus.example')
      .send({
        email: 'owner@demo.arus.local',
        password: 'demo-password',
      })
      .expect(200);

    expect(response.headers['set-cookie']?.[0]).toContain(
      `__Host-arus_session=${token}`,
    );
    expect(response.headers['set-cookie']?.[0]).toContain('Secure');
    expect(response.headers['set-cookie']?.[0]).not.toContain('Domain=');
  });

  it('rate-limits repeated failed login attempts by client address', async () => {
    authService.loginResult = new InvalidCredentialsError();
    const app = testApp(
      authService,
      environment({ AUTH_LOGIN_MAX_ATTEMPTS: '2' }),
    );
    const payload = { email: 'missing@example.com', password: 'wrong' };

    await request(app).post('/api/auth/login').send(payload).expect(401);
    await request(app).post('/api/auth/login').send(payload).expect(401);
    const response = await request(app)
      .post('/api/auth/login')
      .send(payload)
      .expect(429);

    expect(response.body.error.code).toBe('RATE_LIMITED');
    expect(authService.loginCalls).toHaveLength(2);
  });
});
