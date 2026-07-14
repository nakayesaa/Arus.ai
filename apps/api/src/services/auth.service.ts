import type { Logger } from 'pino';

import type { Environment } from '../config/env.js';
import type { MembershipRole } from '../generated/prisma/enums.js';
import {
  createSessionToken,
  hashSessionToken,
  isSessionToken,
} from '../lib/session-token.js';
import {
  bcryptPasswordVerifier,
  type PasswordVerifier,
} from '../lib/password.js';
import type {
  AuthRepository,
  IdentityMembership,
  LoginFailureAuditInput,
  LoginIdentity,
} from '../repositories/auth.repository.js';

const DUMMY_PASSWORD_HASH =
  '$2b$12$A809ATOpH8UdYpVR0QX0uuXNfAFSGCrDRz0uHbvW5KQxXvezJW31a';

export interface AuthContext {
  sessionId: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
  organization: {
    id: string;
    name: string;
    timezone: string;
  };
  role: MembershipRole;
}

export interface LoginInput {
  email: string;
  password: string;
  requestId: string;
}

export interface LoginResult {
  token: string;
  expiresAt: Date;
  context: AuthContext;
}

export interface AuthServiceContract {
  login(input: LoginInput): Promise<LoginResult>;
  authenticate(token: string): Promise<AuthContext | null>;
  logout(token: string): Promise<void>;
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid email or password');
    this.name = 'InvalidCredentialsError';
  }
}

interface AuthServiceOptions {
  repository: AuthRepository;
  environment: Pick<Environment, 'SESSION_SECRET' | 'SESSION_TTL_HOURS'>;
  logger: Pick<Logger, 'warn'>;
  passwordVerifier?: PasswordVerifier;
  clock?: () => Date;
  tokenFactory?: () => string;
}

export class AuthService implements AuthServiceContract {
  private readonly passwordVerifier: PasswordVerifier;
  private readonly clock: () => Date;
  private readonly tokenFactory: () => string;

  constructor(private readonly options: AuthServiceOptions) {
    this.passwordVerifier = options.passwordVerifier ?? bcryptPasswordVerifier;
    this.clock = options.clock ?? (() => new Date());
    this.tokenFactory = options.tokenFactory ?? createSessionToken;
  }

  async login(input: LoginInput): Promise<LoginResult> {
    const normalizedEmail = normalizeEmail(input.email);
    const identity =
      await this.options.repository.findIdentityByNormalizedEmail(
        normalizedEmail,
      );
    const passwordValid = await this.passwordVerifier.verify(
      input.password,
      identity?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    const membership = identity?.memberships.find(
      (candidate) => candidate.isActive,
    );

    if (
      !identity ||
      !identity.passwordHash ||
      !passwordValid ||
      !identity.isActive ||
      !membership
    ) {
      await this.auditRejectedLogin(identity, membership, input.requestId);
      throw new InvalidCredentialsError();
    }

    const now = this.clock();
    const expiresAt = new Date(
      now.getTime() + this.options.environment.SESSION_TTL_HOURS * 3_600_000,
    );
    const token = this.tokenFactory();
    const tokenHash = this.hashToken(token);

    const sessionId = await this.options.repository.createSession({
      tokenHash,
      userId: identity.id,
      organizationId: membership.organizationId,
      role: membership.role,
      expiresAt,
      requestId: input.requestId,
    });

    return {
      token,
      expiresAt,
      context: toAuthContext(sessionId, identity, membership),
    };
  }

  async authenticate(token: string): Promise<AuthContext | null> {
    if (!isSessionToken(token)) {
      return null;
    }

    const tokenHash = this.hashToken(token);
    const session =
      await this.options.repository.findSessionByTokenHash(tokenHash);

    if (!session) {
      return null;
    }

    const now = this.clock();
    const inactive =
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= now.getTime() ||
      !session.membership.isActive ||
      !session.membership.user.isActive;

    if (inactive) {
      if (session.revokedAt === null) {
        await this.revokeBestEffort(tokenHash, now);
      }

      return null;
    }

    return {
      sessionId: session.id,
      user: session.membership.user,
      organization: session.membership.organization,
      role: session.role,
    };
  }

  async logout(token: string): Promise<void> {
    if (!isSessionToken(token)) {
      return;
    }

    await this.options.repository.revokeSession(
      this.hashToken(token),
      this.clock(),
    );
  }

  private hashToken(token: string): string {
    return hashSessionToken(token, this.options.environment.SESSION_SECRET);
  }

  private async auditRejectedLogin(
    identity: LoginIdentity | null,
    activeMembership: IdentityMembership | undefined,
    requestId: string,
  ): Promise<void> {
    if (!identity) {
      return;
    }

    const auditMembership = activeMembership ?? identity.memberships[0];

    if (!auditMembership) {
      return;
    }

    const audit: LoginFailureAuditInput = {
      organizationId: auditMembership.organizationId,
      actorId: identity.id,
      requestId,
      reason:
        identity.isActive && activeMembership
          ? 'INVALID_CREDENTIALS'
          : 'INACTIVE_ACCOUNT',
    };

    try {
      await this.options.repository.recordLoginFailure(audit);
    } catch (error) {
      this.options.logger.warn(
        {
          err: error,
          actorId: identity.id,
          organizationId: auditMembership.organizationId,
          requestId,
        },
        'Failed to record rejected login audit event',
      );
    }
  }

  private async revokeBestEffort(tokenHash: string, now: Date): Promise<void> {
    try {
      await this.options.repository.revokeSession(tokenHash, now);
    } catch (error) {
      this.options.logger.warn(
        { err: error },
        'Failed to persist invalid session revocation',
      );
    }
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toAuthContext(
  sessionId: string,
  identity: LoginIdentity,
  membership: IdentityMembership,
): AuthContext {
  return {
    sessionId,
    user: {
      id: identity.id,
      email: identity.email,
      name: identity.name,
    },
    organization: membership.organization,
    role: membership.role,
  };
}
