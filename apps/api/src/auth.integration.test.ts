import { randomUUID } from 'node:crypto';

import bcrypt from 'bcrypt';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from './app.js';
import { loadEnvironment, type Environment } from './config/env.js';
import { MembershipRole } from './generated/prisma/enums.js';
import type { PrismaClient } from './generated/prisma/client.js';
import { createDatabaseClient } from './lib/database.js';
import { PrismaAuthRepository } from './repositories/auth.repository.js';
import { AuthService } from './services/auth.service.js';

const integrationEnabled =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const integrationDescribe = describe.runIf(integrationEnabled);

integrationDescribe('authentication with PostgreSQL', () => {
  const organizationAId = randomUUID();
  const organizationBId = randomUUID();
  const userAId = randomUUID();
  const userBId = randomUUID();
  const password = `test-${randomUUID()}`;
  const emailA = `owner-${randomUUID()}@integration.arus.local`;
  const emailB = `operator-${randomUUID()}@integration.arus.local`;
  let database: PrismaClient;
  let environment: Environment;
  let app: ReturnType<typeof createApp>;
  let cookieA: string;
  let rawTokenA: string;

  beforeAll(async () => {
    environment = loadEnvironment({ ...process.env, NODE_ENV: 'test' });
    database = createDatabaseClient(environment);
    const logger = pino({ level: 'silent' });
    const passwordHash = await bcrypt.hash(password, 12);

    await database.organization.createMany({
      data: [
        {
          id: organizationAId,
          name: 'Integration Organization A',
          timezone: 'Asia/Jakarta',
        },
        {
          id: organizationBId,
          name: 'Integration Organization B',
          timezone: 'Asia/Jakarta',
        },
      ],
    });
    await database.user.createMany({
      data: [
        {
          id: userAId,
          email: emailA,
          normalizedEmail: emailA,
          passwordHash,
          name: 'Integration Owner A',
        },
        {
          id: userBId,
          email: emailB,
          normalizedEmail: emailB,
          passwordHash,
          name: 'Integration Operator B',
        },
      ],
    });
    await database.membership.createMany({
      data: [
        {
          userId: userAId,
          organizationId: organizationAId,
          role: MembershipRole.OWNER,
        },
        {
          userId: userBId,
          organizationId: organizationBId,
          role: MembershipRole.OPERATOR,
        },
      ],
    });

    const authService = new AuthService({
      repository: new PrismaAuthRepository(database),
      environment,
      logger,
    });
    app = createApp({ authService, environment, logger });
  }, 30_000);

  afterAll(async () => {
    if (!database) {
      return;
    }

    await database.auditLog.deleteMany({
      where: { organizationId: { in: [organizationAId, organizationBId] } },
    });
    await database.session.deleteMany({
      where: { organizationId: { in: [organizationAId, organizationBId] } },
    });
    await database.membership.deleteMany({
      where: { organizationId: { in: [organizationAId, organizationBId] } },
    });
    await database.user.deleteMany({
      where: { id: { in: [userAId, userBId] } },
    });
    await database.organization.deleteMany({
      where: { id: { in: [organizationAId, organizationBId] } },
    });
    await database.$disconnect();
  }, 30_000);

  it('creates only a hashed session scoped to the authenticated tenant', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Origin', environment.APP_ORIGIN)
      .send({ email: emailA.toUpperCase(), password })
      .expect(200);

    const setCookie = response.headers['set-cookie']?.[0] ?? '';
    cookieA = setCookie.split(';', 1)[0] ?? '';
    rawTokenA = cookieA.slice(cookieA.indexOf('=') + 1);
    const storedSession = await database.session.findFirstOrThrow({
      where: { userId: userAId, organizationId: organizationAId },
    });

    expect(cookieA).toMatch(/^arus_session=[A-Za-z0-9_-]{43}$/);
    expect(storedSession.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(storedSession.tokenHash).not.toBe(rawTokenA);
    expect(storedSession.organizationId).toBe(organizationAId);
    expect(storedSession.role).toBe(MembershipRole.OWNER);
    expect(response.body.data.organization.id).toBe(organizationAId);
    expect(response.body.data).not.toHaveProperty('sessionId');
    await expect(
      database.auditLog.count({
        where: {
          organizationId: organizationAId,
          actorId: userAId,
          action: 'USER_LOGIN_SUCCESS',
        },
      }),
    ).resolves.toBe(1);
  });

  it('derives /me tenant context from the stored session', async () => {
    const response = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookieA)
      .expect(200);

    expect(response.body.data).toMatchObject({
      user: { id: userAId, email: emailA },
      organization: { id: organizationAId },
      role: MembershipRole.OWNER,
    });
    expect(JSON.stringify(response.body)).not.toMatch(/password|tokenHash/i);
  });

  it('rejects forged tenant selection without creating another session', async () => {
    const sessionsBefore = await database.session.count({
      where: { userId: userAId },
    });

    await request(app)
      .post('/api/auth/login')
      .set('Origin', environment.APP_ORIGIN)
      .send({ email: emailA, password, organizationId: organizationBId })
      .expect(400);

    const sessionsAfter = await database.session.count({
      where: { userId: userAId },
    });
    expect(sessionsAfter).toBe(sessionsBefore);
  });

  it('does not create a session for invalid credentials and audits safely', async () => {
    const sessionsBefore = await database.session.count({
      where: { userId: userBId },
    });

    const response = await request(app)
      .post('/api/auth/login')
      .set('Origin', environment.APP_ORIGIN)
      .send({ email: emailB, password: 'wrong-password' })
      .expect(401);

    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(await database.session.count({ where: { userId: userBId } })).toBe(
      sessionsBefore,
    );
    const audit = await database.auditLog.findFirstOrThrow({
      where: {
        organizationId: organizationBId,
        actorId: userBId,
        action: 'USER_LOGIN_FAIL',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit.metadata).toEqual({ reason: 'INVALID_CREDENTIALS' });
    expect(JSON.stringify(audit)).not.toContain(password);
  });

  it('isolates an operator session to its own organization and revokes logout', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .set('Origin', environment.APP_ORIGIN)
      .send({ email: emailB, password })
      .expect(200);
    const cookieB = (login.headers['set-cookie']?.[0] ?? '').split(';', 1)[0];

    if (!cookieB) {
      throw new Error('Login response did not include a session cookie');
    }

    expect(login.body.data).toMatchObject({
      organization: { id: organizationBId },
      role: MembershipRole.OPERATOR,
    });
    expect(login.body.data.organization.id).not.toBe(organizationAId);

    await request(app)
      .post('/api/auth/logout')
      .set('Origin', environment.APP_ORIGIN)
      .set('Cookie', cookieB)
      .expect(204);
    await request(app).get('/api/auth/me').set('Cookie', cookieB).expect(401);

    const session = await database.session.findFirstOrThrow({
      where: { userId: userBId },
      orderBy: { createdAt: 'desc' },
    });
    expect(session.revokedAt).not.toBeNull();
  });

  it('invalidates an existing session after membership deactivation', async () => {
    await database.membership.update({
      where: {
        userId_organizationId: {
          userId: userAId,
          organizationId: organizationAId,
        },
      },
      data: { isActive: false },
    });

    await request(app).get('/api/auth/me').set('Cookie', cookieA).expect(401);

    const session = await database.session.findUniqueOrThrow({
      where: { tokenHash: await latestSessionTokenHash(userAId) },
    });
    expect(session.revokedAt).not.toBeNull();
  });

  async function latestSessionTokenHash(userId: string): Promise<string> {
    const session = await database.session.findFirstOrThrow({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { tokenHash: true },
    });
    return session.tokenHash;
  }
});
