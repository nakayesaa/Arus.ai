import type { MembershipRole } from '../generated/prisma/enums.js';
import type { PrismaClient } from '../generated/prisma/client.js';

export interface IdentityMembership {
  id: string;
  organizationId: string;
  role: MembershipRole;
  isActive: boolean;
  createdAt: Date;
  organization: {
    id: string;
    name: string;
    timezone: string;
  };
}

export interface LoginIdentity {
  id: string;
  email: string;
  normalizedEmail: string;
  passwordHash: string | null;
  name: string;
  isActive: boolean;
  memberships: IdentityMembership[];
}

export interface StoredSession {
  id: string;
  tokenHash: string;
  userId: string;
  organizationId: string;
  role: MembershipRole;
  expiresAt: Date;
  revokedAt: Date | null;
  membership: {
    isActive: boolean;
    user: {
      id: string;
      email: string;
      name: string;
      isActive: boolean;
    };
    organization: {
      id: string;
      name: string;
      timezone: string;
    };
  };
}

export interface CreateSessionInput {
  tokenHash: string;
  userId: string;
  organizationId: string;
  role: MembershipRole;
  expiresAt: Date;
  requestId: string;
}

export interface LoginFailureAuditInput {
  organizationId: string;
  actorId: string;
  requestId: string;
  reason: 'INACTIVE_ACCOUNT' | 'INVALID_CREDENTIALS';
}

export interface AuthRepository {
  findIdentityByNormalizedEmail(
    normalizedEmail: string,
  ): Promise<LoginIdentity | null>;
  createSession(input: CreateSessionInput): Promise<string>;
  findSessionByTokenHash(tokenHash: string): Promise<StoredSession | null>;
  revokeSession(tokenHash: string, revokedAt: Date): Promise<void>;
  recordLoginFailure(input: LoginFailureAuditInput): Promise<void>;
}

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly database: PrismaClient) {}

  async findIdentityByNormalizedEmail(
    normalizedEmail: string,
  ): Promise<LoginIdentity | null> {
    return this.database.user.findUnique({
      where: { normalizedEmail },
      select: {
        id: true,
        email: true,
        normalizedEmail: true,
        passwordHash: true,
        name: true,
        isActive: true,
        memberships: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            organizationId: true,
            role: true,
            isActive: true,
            createdAt: true,
            organization: {
              select: {
                id: true,
                name: true,
                timezone: true,
              },
            },
          },
        },
      },
    });
  }

  async createSession(input: CreateSessionInput): Promise<string> {
    const [session] = await this.database.$transaction([
      this.database.session.create({
        data: {
          tokenHash: input.tokenHash,
          userId: input.userId,
          organizationId: input.organizationId,
          role: input.role,
          expiresAt: input.expiresAt,
        },
      }),
      this.database.auditLog.create({
        data: {
          organizationId: input.organizationId,
          actorId: input.userId,
          action: 'USER_LOGIN_SUCCESS',
          entityType: 'Session',
          requestId: input.requestId,
        },
      }),
    ]);

    return session.id;
  }

  async findSessionByTokenHash(
    tokenHash: string,
  ): Promise<StoredSession | null> {
    return this.database.session.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        tokenHash: true,
        userId: true,
        organizationId: true,
        role: true,
        expiresAt: true,
        revokedAt: true,
        membership: {
          select: {
            isActive: true,
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                isActive: true,
              },
            },
            organization: {
              select: {
                id: true,
                name: true,
                timezone: true,
              },
            },
          },
        },
      },
    });
  }

  async revokeSession(tokenHash: string, revokedAt: Date): Promise<void> {
    await this.database.session.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt },
    });
  }

  async recordLoginFailure(input: LoginFailureAuditInput): Promise<void> {
    await this.database.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        action: 'USER_LOGIN_FAIL',
        entityType: 'User',
        entityId: input.actorId,
        requestId: input.requestId,
        metadata: { reason: input.reason },
      },
    });
  }
}
