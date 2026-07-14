import pino from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';

import { MembershipRole } from '../generated/prisma/enums.js';
import type { PasswordVerifier } from '../lib/password.js';
import { hashSessionToken } from '../lib/session-token.js';
import type {
  AuthRepository,
  CreateSessionInput,
  LoginFailureAuditInput,
  LoginIdentity,
  StoredSession,
} from '../repositories/auth.repository.js';
import {
  AuthService,
  InvalidCredentialsError,
  normalizeEmail,
} from './auth.service.js';

const now = new Date('2026-07-14T04:00:00.000Z');
const token = 'a'.repeat(43);
const secret = 'test-session-secret-that-is-at-least-32-characters';

const identity: LoginIdentity = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'Owner@Demo.Arus.Local',
  normalizedEmail: 'owner@demo.arus.local',
  passwordHash: 'stored-password-hash',
  name: 'Demo Owner',
  isActive: true,
  memberships: [
    {
      id: '20000000-0000-4000-8000-000000000001',
      organizationId: '00000000-0000-4000-8000-000000000001',
      role: MembershipRole.OWNER,
      isActive: true,
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      organization: {
        id: '00000000-0000-4000-8000-000000000001',
        name: 'Demo Indonesia',
        timezone: 'Asia/Jakarta',
      },
    },
  ],
};

class FakeAuthRepository implements AuthRepository {
  identity: LoginIdentity | null = identity;
  storedSession: StoredSession | null = null;
  createdSession: CreateSessionInput | null = null;
  loginFailure: LoginFailureAuditInput | null = null;
  revoked: { tokenHash: string; revokedAt: Date } | null = null;

  async findIdentityByNormalizedEmail(
    normalizedEmail: string,
  ): Promise<LoginIdentity | null> {
    void normalizedEmail;
    return this.identity;
  }

  async createSession(input: CreateSessionInput): Promise<string> {
    this.createdSession = input;
    return '30000000-0000-4000-8000-000000000001';
  }

  async findSessionByTokenHash(
    tokenHash: string,
  ): Promise<StoredSession | null> {
    void tokenHash;
    return this.storedSession;
  }

  async revokeSession(tokenHash: string, revokedAt: Date): Promise<void> {
    this.revoked = { tokenHash, revokedAt };
  }

  async recordLoginFailure(input: LoginFailureAuditInput): Promise<void> {
    this.loginFailure = input;
  }
}

function createPasswordVerifier(valid: boolean) {
  const checkedHashes: string[] = [];
  const verifier: PasswordVerifier = {
    verify: async (_password, passwordHash) => {
      checkedHashes.push(passwordHash);
      return valid;
    },
  };

  return { verifier, checkedHashes };
}

function createService(
  repository: FakeAuthRepository,
  passwordVerifier: PasswordVerifier,
) {
  return new AuthService({
    repository,
    environment: {
      SESSION_SECRET: secret,
      SESSION_TTL_HOURS: 168,
    },
    logger: pino({ level: 'silent' }),
    passwordVerifier,
    clock: () => now,
    tokenFactory: () => token,
  });
}

describe('AuthService', () => {
  let repository: FakeAuthRepository;

  beforeEach(() => {
    repository = new FakeAuthRepository();
  });

  it('normalizes identity input consistently', () => {
    expect(normalizeEmail('  Owner@Demo.Arus.Local ')).toBe(
      'owner@demo.arus.local',
    );
  });

  it('creates an opaque hashed session for an active membership', async () => {
    const { verifier } = createPasswordVerifier(true);
    const service = createService(repository, verifier);

    const result = await service.login({
      email: ' Owner@Demo.Arus.Local ',
      password: 'correct-password',
      requestId: 'request-1',
    });

    expect(repository.createdSession).toMatchObject({
      tokenHash: hashSessionToken(token, secret),
      userId: identity.id,
      organizationId: identity.memberships[0]?.organizationId,
      role: MembershipRole.OWNER,
      requestId: 'request-1',
    });
    expect(repository.createdSession?.tokenHash).not.toBe(token);
    expect(repository.createdSession?.expiresAt.toISOString()).toBe(
      '2026-07-21T04:00:00.000Z',
    );
    expect(result.token).toBe(token);
    expect(result.context).toMatchObject({
      sessionId: '30000000-0000-4000-8000-000000000001',
      role: MembershipRole.OWNER,
      organization: { name: 'Demo Indonesia' },
    });
  });

  it('uses a dummy bcrypt hash and a generic error for unknown users', async () => {
    repository.identity = null;
    const { verifier, checkedHashes } = createPasswordVerifier(false);
    const service = createService(repository, verifier);

    await expect(
      service.login({
        email: 'missing@example.com',
        password: 'anything',
        requestId: 'request-2',
      }),
    ).rejects.toEqual(new InvalidCredentialsError());

    expect(checkedHashes).toHaveLength(1);
    expect(checkedHashes[0]).toMatch(/^\$2b\$12\$/);
    expect(repository.createdSession).toBeNull();
    expect(repository.loginFailure).toBeNull();
  });

  it('rejects and audits an inactive membership without creating a session', async () => {
    repository.identity = {
      ...identity,
      memberships: [{ ...identity.memberships[0]!, isActive: false }],
    };
    const { verifier } = createPasswordVerifier(true);
    const service = createService(repository, verifier);

    await expect(
      service.login({
        email: identity.email,
        password: 'correct-password',
        requestId: 'request-3',
      }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);

    expect(repository.createdSession).toBeNull();
    expect(repository.loginFailure).toMatchObject({
      actorId: identity.id,
      reason: 'INACTIVE_ACCOUNT',
      requestId: 'request-3',
    });
  });

  it('returns trusted context only for an active, unexpired session', async () => {
    repository.storedSession = storedSession({
      expiresAt: new Date('2026-07-15T04:00:00.000Z'),
    });
    const { verifier } = createPasswordVerifier(true);
    const service = createService(repository, verifier);

    await expect(service.authenticate(token)).resolves.toMatchObject({
      user: { id: identity.id },
      organization: { id: identity.memberships[0]?.organizationId },
      role: MembershipRole.OWNER,
    });
    expect(repository.revoked).toBeNull();
  });

  it('rejects and revokes an expired session', async () => {
    repository.storedSession = storedSession({
      expiresAt: new Date('2026-07-14T03:59:59.000Z'),
    });
    const { verifier } = createPasswordVerifier(true);
    const service = createService(repository, verifier);

    await expect(service.authenticate(token)).resolves.toBeNull();
    expect(repository.revoked).toEqual({
      tokenHash: hashSessionToken(token, secret),
      revokedAt: now,
    });
  });

  it('revokes a well-formed token on logout and ignores malformed input', async () => {
    const { verifier } = createPasswordVerifier(true);
    const service = createService(repository, verifier);

    await service.logout('malformed');
    expect(repository.revoked).toBeNull();

    await service.logout(token);
    expect(repository.revoked?.tokenHash).toBe(hashSessionToken(token, secret));
  });
});

function storedSession(overrides: Partial<StoredSession> = {}): StoredSession {
  return {
    id: '30000000-0000-4000-8000-000000000001',
    tokenHash: hashSessionToken(token, secret),
    userId: identity.id,
    organizationId: identity.memberships[0]!.organizationId,
    role: MembershipRole.OWNER,
    expiresAt: new Date('2026-07-15T04:00:00.000Z'),
    revokedAt: null,
    membership: {
      isActive: true,
      user: {
        id: identity.id,
        email: identity.email,
        name: identity.name,
        isActive: true,
      },
      organization: identity.memberships[0]!.organization,
    },
    ...overrides,
  };
}
