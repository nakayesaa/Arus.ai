import type { Logger } from 'pino';

import type { Environment } from '../config/env.js';
import {
  AccountTokenPurpose,
  MembershipRole,
} from '../generated/prisma/enums.js';
import {
  createAccountToken,
  hashAccountToken,
  isAccountToken,
} from '../lib/account-token.js';
import type { AccountEmailSender } from '../lib/account-email.js';
import { bcryptPasswordHasher, type PasswordHasher } from '../lib/password.js';
import { createSessionToken, hashSessionToken } from '../lib/session-token.js';
import {
  LifecycleRepositoryConflictError,
  type AccountLifecycleRepository,
  type MemberRecord,
} from '../repositories/account-lifecycle.repository.js';
import type { AuthContext, LoginResult } from './auth.service.js';
import { normalizeEmail } from './auth.service.js';

export interface MemberView {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: MembershipRole;
  status: 'PENDING' | 'ACTIVE' | 'INACTIVE';
  invitedAt: string | null;
  acceptedAt: string | null;
  createdAt: string;
}

export interface AccountLifecycleServiceContract {
  listMembers(context: AuthContext): Promise<MemberView[]>;
  inviteMember(input: {
    context: AuthContext;
    email: string;
    role: MembershipRole;
    requestId: string;
  }): Promise<MemberView>;
  updateMember(input: {
    context: AuthContext;
    membershipId: string;
    role?: MembershipRole;
    isActive?: boolean;
    requestId: string;
  }): Promise<MemberView>;
  acceptInvitation(input: {
    token: string;
    name: string;
    password: string;
    requestId: string;
  }): Promise<LoginResult>;
  requestPasswordReset(input: {
    email: string;
    requestId: string;
  }): Promise<void>;
  completePasswordReset(input: {
    token: string;
    password: string;
    requestId: string;
  }): Promise<void>;
}

export class LifecycleError extends Error {
  constructor(
    readonly code:
      | 'EMAIL_IN_USE'
      | 'INVALID_TOKEN'
      | 'LAST_OWNER'
      | 'MEMBER_NOT_FOUND'
      | 'PENDING_MEMBER'
      | 'SELF_ACCESS_CHANGE'
      | 'EMAIL_DELIVERY_FAILED'
      | 'WEAK_PASSWORD',
    message: string,
  ) {
    super(message);
    this.name = 'LifecycleError';
  }
}

interface AccountLifecycleServiceOptions {
  repository: AccountLifecycleRepository;
  emailSender: AccountEmailSender;
  environment: Pick<
    Environment,
    | 'APP_ORIGIN'
    | 'SESSION_SECRET'
    | 'SESSION_TTL_HOURS'
    | 'INVITATION_TTL_HOURS'
    | 'PASSWORD_RESET_TTL_MINUTES'
  >;
  logger: Pick<Logger, 'warn'>;
  passwordHasher?: PasswordHasher;
  clock?: () => Date;
  tokenFactory?: () => string;
  sessionTokenFactory?: () => string;
}

export class AccountLifecycleService implements AccountLifecycleServiceContract {
  private readonly passwordHasher: PasswordHasher;
  private readonly clock: () => Date;
  private readonly tokenFactory: () => string;
  private readonly sessionTokenFactory: () => string;

  constructor(private readonly options: AccountLifecycleServiceOptions) {
    this.passwordHasher = options.passwordHasher ?? bcryptPasswordHasher;
    this.clock = options.clock ?? (() => new Date());
    this.tokenFactory = options.tokenFactory ?? createAccountToken;
    this.sessionTokenFactory =
      options.sessionTokenFactory ?? createSessionToken;
  }

  async listMembers(context: AuthContext): Promise<MemberView[]> {
    const records = await this.options.repository.listMembers(
      context.organization.id,
    );
    return records.map(toMemberView);
  }

  async inviteMember(input: {
    context: AuthContext;
    email: string;
    role: MembershipRole;
    requestId: string;
  }): Promise<MemberView> {
    const now = this.clock();
    const expiresAt = new Date(
      now.getTime() + this.options.environment.INVITATION_TTL_HOURS * 3_600_000,
    );
    const token = this.tokenFactory();

    try {
      const member = await this.options.repository.createInvitation({
        organizationId: input.context.organization.id,
        actorId: input.context.user.id,
        email: input.email.trim(),
        normalizedEmail: normalizeEmail(input.email),
        role: input.role,
        tokenHash: hashAccountToken(
          token,
          AccountTokenPurpose.INVITATION,
          this.options.environment.SESSION_SECRET,
        ),
        expiresAt,
        now,
        requestId: input.requestId,
      });

      try {
        await this.options.emailSender.send({
          kind: 'INVITATION',
          to: member.email,
          recipientName: 'there',
          actionUrl: actionUrl(
            this.options.environment.APP_ORIGIN,
            '/welcome',
            token,
          ),
          expiresAt,
        });
      } catch (error) {
        this.options.logger.warn(
          {
            err: error,
            actorId: input.context.user.id,
            organizationId: input.context.organization.id,
            memberId: member.id,
          },
          'Invitation created but delivery failed',
        );
        throw new LifecycleError(
          'EMAIL_DELIVERY_FAILED',
          'Invitation created, but email delivery failed. Try resending it.',
        );
      }

      return toMemberView(member);
    } catch (error) {
      throw mapRepositoryError(error);
    }
  }

  async updateMember(input: {
    context: AuthContext;
    membershipId: string;
    role?: MembershipRole;
    isActive?: boolean;
    requestId: string;
  }): Promise<MemberView> {
    const current = await this.options.repository.findMember(
      input.context.organization.id,
      input.membershipId,
    );
    if (!current) {
      throw new LifecycleError('MEMBER_NOT_FOUND', 'Member not found');
    }

    const changesOwnAccess =
      current.userId === input.context.user.id &&
      ((input.role !== undefined && input.role !== current.role) ||
        (input.isActive !== undefined && input.isActive !== current.isActive));
    if (changesOwnAccess) {
      throw new LifecycleError(
        'SELF_ACCESS_CHANGE',
        'You cannot change your own workspace access',
      );
    }

    try {
      const updated = await this.options.repository.updateMember({
        organizationId: input.context.organization.id,
        actorId: input.context.user.id,
        membershipId: input.membershipId,
        ...(input.role ? { role: input.role } : {}),
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        now: this.clock(),
        requestId: input.requestId,
      });
      if (!updated) {
        throw new LifecycleError('MEMBER_NOT_FOUND', 'Member not found');
      }
      return toMemberView(updated);
    } catch (error) {
      throw mapRepositoryError(error);
    }
  }

  async acceptInvitation(input: {
    token: string;
    name: string;
    password: string;
    requestId: string;
  }): Promise<LoginResult> {
    enforcePasswordPolicy(input.password);
    if (!isAccountToken(input.token)) {
      throw invalidToken();
    }
    const now = this.clock();
    const expiresAt = new Date(
      now.getTime() + this.options.environment.SESSION_TTL_HOURS * 3_600_000,
    );
    const sessionToken = this.sessionTokenFactory();
    const context = await this.options.repository.acceptInvitation({
      tokenHash: hashAccountToken(
        input.token,
        AccountTokenPurpose.INVITATION,
        this.options.environment.SESSION_SECRET,
      ),
      name: input.name.trim(),
      passwordHash: await this.passwordHasher.hash(input.password),
      sessionTokenHash: hashSessionToken(
        sessionToken,
        this.options.environment.SESSION_SECRET,
      ),
      sessionExpiresAt: expiresAt,
      now,
      requestId: input.requestId,
    });
    if (!context) {
      throw invalidToken();
    }
    return { token: sessionToken, expiresAt, context };
  }

  async requestPasswordReset(input: {
    email: string;
    requestId: string;
  }): Promise<void> {
    const now = this.clock();
    const expiresAt = new Date(
      now.getTime() +
        this.options.environment.PASSWORD_RESET_TTL_MINUTES * 60_000,
    );
    const token = this.tokenFactory();
    const identity = await this.options.repository.createPasswordReset({
      normalizedEmail: normalizeEmail(input.email),
      tokenHash: hashAccountToken(
        token,
        AccountTokenPurpose.PASSWORD_RESET,
        this.options.environment.SESSION_SECRET,
      ),
      expiresAt,
      now,
      requestId: input.requestId,
    });
    if (!identity) {
      return;
    }

    try {
      await this.options.emailSender.send({
        kind: 'PASSWORD_RESET',
        to: identity.email,
        recipientName: identity.name,
        actionUrl: actionUrl(
          this.options.environment.APP_ORIGIN,
          '/reset-password',
          token,
        ),
        expiresAt,
      });
    } catch (error) {
      // Public reset responses stay generic to avoid account enumeration.
      this.options.logger.warn(
        {
          err: error,
          actorId: identity.userId,
          organizationId: identity.organizationId,
        },
        'Password reset email delivery failed',
      );
    }
  }

  async completePasswordReset(input: {
    token: string;
    password: string;
    requestId: string;
  }): Promise<void> {
    enforcePasswordPolicy(input.password);
    if (!isAccountToken(input.token)) {
      throw invalidToken();
    }
    const completed = await this.options.repository.completePasswordReset({
      tokenHash: hashAccountToken(
        input.token,
        AccountTokenPurpose.PASSWORD_RESET,
        this.options.environment.SESSION_SECRET,
      ),
      passwordHash: await this.passwordHasher.hash(input.password),
      now: this.clock(),
      requestId: input.requestId,
    });
    if (!completed) {
      throw invalidToken();
    }
  }
}

function enforcePasswordPolicy(password: string): void {
  if (password.length < 12 || password.length > 128) {
    throw new LifecycleError(
      'WEAK_PASSWORD',
      'Password must contain between 12 and 128 characters',
    );
  }
}

function actionUrl(origin: string, pathname: string, token: string): string {
  const url = new URL(pathname, origin);
  url.searchParams.set('token', token);
  return url.toString();
}

function invalidToken(): LifecycleError {
  return new LifecycleError(
    'INVALID_TOKEN',
    'This link is invalid, expired, or has already been used',
  );
}

function toMemberView(member: MemberRecord): MemberView {
  const status =
    member.acceptedAt === null
      ? 'PENDING'
      : member.isActive
        ? 'ACTIVE'
        : 'INACTIVE';
  return {
    id: member.id,
    userId: member.userId,
    email: member.email,
    name: member.name,
    role: member.role,
    status,
    invitedAt: member.invitedAt?.toISOString() ?? null,
    acceptedAt: member.acceptedAt?.toISOString() ?? null,
    createdAt: member.createdAt.toISOString(),
  };
}

function mapRepositoryError(error: unknown): unknown {
  if (!(error instanceof LifecycleRepositoryConflictError)) {
    return error;
  }
  switch (error.reason) {
    case 'EMAIL_IN_USE':
      return new LifecycleError(
        'EMAIL_IN_USE',
        'This email already belongs to an account',
      );
    case 'LAST_OWNER':
      return new LifecycleError(
        'LAST_OWNER',
        'The workspace must keep at least one active owner',
      );
    case 'PENDING_MEMBER':
      return new LifecycleError(
        'PENDING_MEMBER',
        'Pending members must accept their invitation first',
      );
  }
}
