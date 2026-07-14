import { randomUUID } from 'node:crypto';

import bcrypt from 'bcrypt';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from './app.js';
import { loadEnvironment, type Environment } from './config/env.js';
import { MembershipRole } from './generated/prisma/enums.js';
import type { PrismaClient } from './generated/prisma/client.js';
import type { AccountEmail, AccountEmailSender } from './lib/account-email.js';
import { createDatabaseClient } from './lib/database.js';
import { PrismaAccountLifecycleRepository } from './repositories/account-lifecycle.repository.js';
import { PrismaAuthRepository } from './repositories/auth.repository.js';
import { AccountLifecycleService } from './services/account-lifecycle.service.js';
import { AuthService } from './services/auth.service.js';

const integrationDescribe = describe.runIf(
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true',
);

class CapturingEmailSender implements AccountEmailSender {
  messages: AccountEmail[] = [];

  async send(message: AccountEmail): Promise<void> {
    this.messages.push(message);
  }

  token(kind: AccountEmail['kind']): string {
    const message = [...this.messages]
      .reverse()
      .find((candidate) => candidate.kind === kind);
    if (!message) {
      throw new Error(`Missing captured ${kind} email`);
    }
    return new URL(message.actionUrl).searchParams.get('token') ?? '';
  }
}

integrationDescribe('account lifecycle with PostgreSQL', () => {
  const organizationId = randomUUID();
  const ownerId = randomUUID();
  const operatorId = randomUUID();
  const ownerEmail = `owner-${randomUUID()}@integration.arus.local`;
  const operatorEmail = `operator-${randomUUID()}@integration.arus.local`;
  const invitedEmail = `invite-${randomUUID()}@integration.arus.local`;
  const initialPassword = `initial-${randomUUID()}`;
  const invitedPassword = `invited-${randomUUID()}`;
  const resetPassword = `reset-${randomUUID()}`;
  let database: PrismaClient;
  let environment: Environment;
  let app: ReturnType<typeof createApp>;
  let ownerCookie: string;
  let operatorCookie: string;
  let invitedCookie: string;
  let membershipId: string;
  const emailSender = new CapturingEmailSender();

  beforeAll(async () => {
    environment = loadEnvironment({ ...process.env, NODE_ENV: 'test' });
    database = createDatabaseClient(environment);
    const logger = pino({ level: 'silent' });
    const passwordHash = await bcrypt.hash(initialPassword, 12);

    await database.organization.create({
      data: {
        id: organizationId,
        name: 'Lifecycle Integration Organization',
      },
    });
    await database.user.createMany({
      data: [
        {
          id: ownerId,
          email: ownerEmail,
          normalizedEmail: ownerEmail,
          passwordHash,
          name: 'Lifecycle Owner',
        },
        {
          id: operatorId,
          email: operatorEmail,
          normalizedEmail: operatorEmail,
          passwordHash,
          name: 'Lifecycle Operator',
        },
      ],
    });
    await database.membership.createMany({
      data: [
        {
          userId: ownerId,
          organizationId,
          role: MembershipRole.OWNER,
          acceptedAt: new Date(),
        },
        {
          userId: operatorId,
          organizationId,
          role: MembershipRole.OPERATOR,
          acceptedAt: new Date(),
        },
      ],
    });

    const authService = new AuthService({
      repository: new PrismaAuthRepository(database),
      environment,
      logger,
    });
    const lifecycleService = new AccountLifecycleService({
      repository: new PrismaAccountLifecycleRepository(database),
      emailSender,
      environment,
      logger,
    });
    app = createApp({ authService, lifecycleService, environment, logger });
    ownerCookie = await login(ownerEmail, initialPassword);
    operatorCookie = await login(operatorEmail, initialPassword);
  }, 30_000);

  afterAll(async () => {
    if (!database) {
      return;
    }
    await database.accountToken.deleteMany({ where: { organizationId } });
    await database.auditLog.deleteMany({ where: { organizationId } });
    await database.session.deleteMany({ where: { organizationId } });
    const memberships = await database.membership.findMany({
      where: { organizationId },
      select: { userId: true },
    });
    await database.membership.deleteMany({ where: { organizationId } });
    await database.user.deleteMany({
      where: { id: { in: memberships.map(({ userId }) => userId) } },
    });
    await database.organization.delete({ where: { id: organizationId } });
    await database.$disconnect();
  }, 30_000);

  it('allows only owners to list and invite tenant members', async () => {
    await request(app)
      .get('/api/members')
      .set('Cookie', operatorCookie)
      .expect(403);

    const response = await request(app)
      .post('/api/members')
      .set('Origin', environment.APP_ORIGIN)
      .set('Cookie', ownerCookie)
      .send({
        email: invitedEmail,
        name: 'Invited Operator',
        role: 'OPERATOR',
      })
      .expect(201);

    membershipId = response.body.data.id;
    expect(response.body.data).toMatchObject({
      email: invitedEmail,
      role: 'OPERATOR',
      status: 'PENDING',
    });
    const invited = await database.user.findUniqueOrThrow({
      where: { normalizedEmail: invitedEmail },
    });
    expect(invited.passwordHash).toBeNull();
    const storedToken = await database.accountToken.findFirstOrThrow({
      where: { userId: invited.id },
    });
    expect(storedToken.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(storedToken.tokenHash).not.toContain(
      emailSender.token('INVITATION'),
    );
  });

  it('activates a pending member once and permits login', async () => {
    const invitationToken = emailSender.token('INVITATION');
    await request(app)
      .post('/api/auth/invitations/accept')
      .set('Origin', environment.APP_ORIGIN)
      .send({ token: invitationToken, password: invitedPassword })
      .expect(204);
    await request(app)
      .post('/api/auth/invitations/accept')
      .set('Origin', environment.APP_ORIGIN)
      .send({ token: invitationToken, password: invitedPassword })
      .expect(400);

    invitedCookie = await login(invitedEmail, invitedPassword);
    await request(app)
      .get('/api/auth/me')
      .set('Cookie', invitedCookie)
      .expect(200);
  });

  it('revokes sessions immediately after a role change', async () => {
    const response = await request(app)
      .patch(`/api/members/${membershipId}`)
      .set('Origin', environment.APP_ORIGIN)
      .set('Cookie', ownerCookie)
      .send({ role: 'OWNER' })
      .expect(200);
    expect(response.body.data.role).toBe('OWNER');
    await request(app)
      .get('/api/auth/me')
      .set('Cookie', invitedCookie)
      .expect(401);
  });

  it('uses generic reset requests and revokes every prior session on completion', async () => {
    invitedCookie = await login(invitedEmail, invitedPassword);
    const known = await request(app)
      .post('/api/auth/password-reset/request')
      .set('Origin', environment.APP_ORIGIN)
      .send({ email: invitedEmail })
      .expect(202);
    const unknown = await request(app)
      .post('/api/auth/password-reset/request')
      .set('Origin', environment.APP_ORIGIN)
      .send({ email: `missing-${randomUUID()}@example.com` })
      .expect(202);
    expect(known.body).toEqual(unknown.body);

    await request(app)
      .post('/api/auth/password-reset/complete')
      .set('Origin', environment.APP_ORIGIN)
      .send({
        token: emailSender.token('PASSWORD_RESET'),
        password: resetPassword,
      })
      .expect(204);
    await request(app)
      .get('/api/auth/me')
      .set('Cookie', invitedCookie)
      .expect(401);
    await request(app)
      .post('/api/auth/login')
      .set('Origin', environment.APP_ORIGIN)
      .send({ email: invitedEmail, password: invitedPassword })
      .expect(401);
    await login(invitedEmail, resetPassword);
  });

  async function login(email: string, password: string): Promise<string> {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Origin', environment.APP_ORIGIN)
      .send({ email, password })
      .expect(200);
    const cookie = (response.headers['set-cookie']?.[0] ?? '').split(';', 1)[0];
    if (!cookie) {
      throw new Error('Login response did not include a cookie');
    }
    return cookie;
  }
});
