import pino from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  AccountTokenPurpose,
  MembershipRole,
} from '../generated/prisma/enums.js';
import { hashAccountToken } from '../lib/account-token.js';
import type { AccountEmail, AccountEmailSender } from '../lib/account-email.js';
import type { PasswordHasher } from '../lib/password.js';
import { hashSessionToken } from '../lib/session-token.js';
import type {
  AccountLifecycleRepository,
  CreateInvitationInput,
  MemberRecord,
  PasswordResetIdentity,
  UpdateMemberInput,
} from '../repositories/account-lifecycle.repository.js';
import type { AuthContext } from './auth.service.js';
import {
  AccountLifecycleService,
  LifecycleError,
} from './account-lifecycle.service.js';

const now = new Date('2026-07-15T03:00:00.000Z');
const token = 'a'.repeat(43);
const sessionToken = 'b'.repeat(43);
const secret = 'test-session-secret-that-is-at-least-32-characters';
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
const member: MemberRecord = {
  id: '20000000-0000-4000-8000-000000000002',
  userId: '10000000-0000-4000-8000-000000000002',
  email: 'operator@example.com',
  name: 'New Operator',
  role: MembershipRole.OPERATOR,
  isActive: false,
  invitedAt: now,
  acceptedAt: null,
  createdAt: now,
};

class FakeRepository implements AccountLifecycleRepository {
  members: MemberRecord[] = [member];
  invitationInput: CreateInvitationInput | null = null;
  updateInput: UpdateMemberInput | null = null;
  invitationAccepted = true;
  invitationAcceptance: {
    tokenHash: string;
    name: string;
    passwordHash: string;
    sessionTokenHash: string;
  } | null = null;
  resetIdentity: PasswordResetIdentity | null = null;
  resetCreation: { normalizedEmail: string; tokenHash: string } | null = null;
  resetCompleted = true;
  resetCompletion: { tokenHash: string; passwordHash: string } | null = null;

  async listMembers(): Promise<MemberRecord[]> {
    return this.members;
  }

  async findMember(): Promise<MemberRecord | null> {
    return this.members[0] ?? null;
  }

  async createInvitation(input: CreateInvitationInput): Promise<MemberRecord> {
    this.invitationInput = input;
    return member;
  }

  async updateMember(input: UpdateMemberInput): Promise<MemberRecord | null> {
    this.updateInput = input;
    return { ...member, ...input };
  }

  async acceptInvitation(input: {
    tokenHash: string;
    name: string;
    passwordHash: string;
    sessionTokenHash: string;
  }): Promise<{
    sessionId: string;
    user: { id: string; email: string; name: string };
    organization: { id: string; name: string; timezone: string };
    role: MembershipRole;
  } | null> {
    this.invitationAcceptance = input;
    return this.invitationAccepted
      ? {
          sessionId: '30000000-0000-4000-8000-000000000002',
          user: {
            id: member.userId,
            email: member.email,
            name: input.name,
          },
          organization: context.organization,
          role: member.role,
        }
      : null;
  }

  async createPasswordReset(input: {
    normalizedEmail: string;
    tokenHash: string;
  }): Promise<PasswordResetIdentity | null> {
    this.resetCreation = input;
    return this.resetIdentity;
  }

  async completePasswordReset(input: {
    tokenHash: string;
    passwordHash: string;
  }): Promise<boolean> {
    this.resetCompletion = input;
    return this.resetCompleted;
  }
}

class FakeEmailSender implements AccountEmailSender {
  messages: AccountEmail[] = [];
  error: Error | null = null;

  async send(message: AccountEmail): Promise<void> {
    if (this.error) {
      throw this.error;
    }
    this.messages.push(message);
  }
}

const passwordHasher: PasswordHasher = {
  hash: async (password) => `hash:${password}`,
};

describe('AccountLifecycleService', () => {
  let repository: FakeRepository;
  let emailSender: FakeEmailSender;
  let service: AccountLifecycleService;

  beforeEach(() => {
    repository = new FakeRepository();
    emailSender = new FakeEmailSender();
    service = new AccountLifecycleService({
      repository,
      emailSender,
      environment: {
        APP_ORIGIN: 'http://localhost:3000',
        SESSION_SECRET: secret,
        SESSION_TTL_HOURS: 168,
        INVITATION_TTL_HOURS: 72,
        PASSWORD_RESET_TTL_MINUTES: 60,
      },
      logger: pino({ level: 'silent' }),
      passwordHasher,
      clock: () => now,
      tokenFactory: () => token,
      sessionTokenFactory: () => sessionToken,
    });
  });

  it('creates a tenant-scoped invitation with only a hashed token at rest', async () => {
    const result = await service.inviteMember({
      context,
      email: ' Operator@Example.com ',
      role: MembershipRole.OPERATOR,
      requestId: 'request-1',
    });

    expect(repository.invitationInput).toMatchObject({
      organizationId: context.organization.id,
      actorId: context.user.id,
      normalizedEmail: 'operator@example.com',
      tokenHash: hashAccountToken(
        token,
        AccountTokenPurpose.INVITATION,
        secret,
      ),
    });
    expect(repository.invitationInput?.tokenHash).not.toBe(token);
    expect(emailSender.messages[0]?.actionUrl).toBe(
      `http://localhost:3000/welcome?token=${token}`,
    );
    expect(result.status).toBe('PENDING');
  });

  it('reports invitation delivery failure without losing the pending member', async () => {
    emailSender.error = new Error('provider unavailable');

    await expect(
      service.inviteMember({
        context,
        email: member.email,
        role: member.role,
        requestId: 'request-2',
      }),
    ).rejects.toMatchObject({ code: 'EMAIL_DELIVERY_FAILED' });
    expect(repository.invitationInput).not.toBeNull();
  });

  it('prevents owners from changing their own access', async () => {
    repository.members = [
      {
        ...member,
        userId: context.user.id,
        role: MembershipRole.OWNER,
        isActive: true,
        acceptedAt: now,
      },
    ];

    await expect(
      service.updateMember({
        context,
        membershipId: member.id,
        role: MembershipRole.OPERATOR,
        requestId: 'request-3',
      }),
    ).rejects.toMatchObject({ code: 'SELF_ACCESS_CHANGE' });
    expect(repository.updateInput).toBeNull();
  });

  it('enforces password length before consuming an invitation', async () => {
    await expect(
      service.acceptInvitation({
        token,
        name: 'New Operator',
        password: 'too-short',
        requestId: 'request-4',
      }),
    ).rejects.toEqual(
      new LifecycleError(
        'WEAK_PASSWORD',
        'Password must contain between 12 and 128 characters',
      ),
    );
    expect(repository.invitationAcceptance).toBeNull();
  });

  it('hashes a new password and consumes only the invitation token purpose', async () => {
    const result = await service.acceptInvitation({
      token,
      name: ' New Operator ',
      password: 'a-secure-password',
      requestId: 'request-5',
    });

    expect(repository.invitationAcceptance).toEqual({
      tokenHash: hashAccountToken(
        token,
        AccountTokenPurpose.INVITATION,
        secret,
      ),
      name: 'New Operator',
      passwordHash: 'hash:a-secure-password',
      sessionTokenHash: hashSessionToken(sessionToken, secret),
      sessionExpiresAt: new Date('2026-07-22T03:00:00.000Z'),
      now,
      requestId: 'request-5',
    });
    expect(result.token).toBe(sessionToken);
    expect(result.context.user.name).toBe('New Operator');
  });

  it('keeps password-reset requests generic for unknown identities', async () => {
    await service.requestPasswordReset({
      email: 'missing@example.com',
      requestId: 'request-6',
    });

    expect(repository.resetCreation?.normalizedEmail).toBe(
      'missing@example.com',
    );
    expect(emailSender.messages).toHaveLength(0);
  });

  it('delivers reset links and hashes replacement passwords', async () => {
    repository.resetIdentity = {
      userId: member.userId,
      organizationId: context.organization.id,
      email: member.email,
      name: member.name,
    };

    await service.requestPasswordReset({
      email: member.email,
      requestId: 'request-7',
    });
    expect(emailSender.messages[0]?.actionUrl).toBe(
      `http://localhost:3000/reset-password?token=${token}`,
    );

    await service.completePasswordReset({
      token,
      password: 'replacement-password',
      requestId: 'request-8',
    });
    expect(repository.resetCompletion).toMatchObject({
      tokenHash: hashAccountToken(
        token,
        AccountTokenPurpose.PASSWORD_RESET,
        secret,
      ),
      passwordHash: 'hash:replacement-password',
    });
  });
});
