import {
  AccountTokenPurpose,
  MembershipRole,
} from '../generated/prisma/enums.js';
import type { PrismaClient } from '../generated/prisma/client.js';

export interface MemberRecord {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: MembershipRole;
  isActive: boolean;
  invitedAt: Date | null;
  acceptedAt: Date | null;
  createdAt: Date;
}

export interface CreateInvitationInput {
  organizationId: string;
  actorId: string;
  email: string;
  normalizedEmail: string;
  role: MembershipRole;
  tokenHash: string;
  expiresAt: Date;
  now: Date;
  requestId: string;
}

export interface AcceptedInvitationSession {
  sessionId: string;
  user: { id: string; email: string; name: string };
  organization: { id: string; name: string; timezone: string };
  role: MembershipRole;
}

export interface UpdateMemberInput {
  organizationId: string;
  actorId: string;
  membershipId: string;
  role?: MembershipRole;
  isActive?: boolean;
  now: Date;
  requestId: string;
}

export interface PasswordResetIdentity {
  userId: string;
  organizationId: string;
  email: string;
  name: string;
}

export type RepositoryLifecycleConflict =
  'EMAIL_IN_USE' | 'LAST_OWNER' | 'PENDING_MEMBER';

export class LifecycleRepositoryConflictError extends Error {
  constructor(readonly reason: RepositoryLifecycleConflict) {
    super(reason);
    this.name = 'LifecycleRepositoryConflictError';
  }
}

export interface AccountLifecycleRepository {
  listMembers(organizationId: string): Promise<MemberRecord[]>;
  findMember(
    organizationId: string,
    membershipId: string,
  ): Promise<MemberRecord | null>;
  createInvitation(input: CreateInvitationInput): Promise<MemberRecord>;
  updateMember(input: UpdateMemberInput): Promise<MemberRecord | null>;
  acceptInvitation(input: {
    tokenHash: string;
    name: string;
    passwordHash: string;
    sessionTokenHash: string;
    sessionExpiresAt: Date;
    now: Date;
    requestId: string;
  }): Promise<AcceptedInvitationSession | null>;
  createPasswordReset(input: {
    normalizedEmail: string;
    tokenHash: string;
    expiresAt: Date;
    now: Date;
    requestId: string;
  }): Promise<PasswordResetIdentity | null>;
  completePasswordReset(input: {
    tokenHash: string;
    passwordHash: string;
    now: Date;
    requestId: string;
  }): Promise<boolean>;
}

export class PrismaAccountLifecycleRepository implements AccountLifecycleRepository {
  constructor(private readonly database: PrismaClient) {}

  async listMembers(organizationId: string): Promise<MemberRecord[]> {
    const records = await this.database.membership.findMany({
      where: { organizationId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: memberSelect,
    });
    return records.map(toMemberRecord);
  }

  async findMember(
    organizationId: string,
    membershipId: string,
  ): Promise<MemberRecord | null> {
    const record = await this.database.membership.findFirst({
      where: { id: membershipId, organizationId },
      select: memberSelect,
    });
    return record ? toMemberRecord(record) : null;
  }

  async createInvitation(input: CreateInvitationInput): Promise<MemberRecord> {
    try {
      return await this.database.$transaction(
        async (transaction) => {
          const existingUser = await transaction.user.findUnique({
            where: { normalizedEmail: input.normalizedEmail },
            include: { memberships: true },
          });

          let userId: string;
          let membershipId: string;
          let action = 'MEMBER_INVITED';

          if (existingUser) {
            const membership = existingUser.memberships.find(
              (candidate) => candidate.organizationId === input.organizationId,
            );

            if (!membership || membership.acceptedAt !== null) {
              throw new LifecycleRepositoryConflictError('EMAIL_IN_USE');
            }

            userId = existingUser.id;
            membershipId = membership.id;
            action = 'MEMBER_INVITATION_RESENT';
            await transaction.user.update({
              where: { id: userId },
              data: { email: input.email },
            });
            await transaction.membership.update({
              where: { id: membershipId },
              data: {
                role: input.role,
                invitedAt: input.now,
                isActive: false,
              },
            });
          } else {
            const user = await transaction.user.create({
              data: {
                email: input.email,
                normalizedEmail: input.normalizedEmail,
                passwordHash: null,
                name: provisionalName(input.email),
                isActive: false,
              },
            });
            const membership = await transaction.membership.create({
              data: {
                userId: user.id,
                organizationId: input.organizationId,
                role: input.role,
                isActive: false,
                invitedAt: input.now,
              },
            });
            userId = user.id;
            membershipId = membership.id;
          }

          await transaction.accountToken.updateMany({
            where: {
              userId,
              organizationId: input.organizationId,
              purpose: AccountTokenPurpose.INVITATION,
              consumedAt: null,
            },
            data: { consumedAt: input.now },
          });
          await transaction.accountToken.create({
            data: {
              tokenHash: input.tokenHash,
              purpose: AccountTokenPurpose.INVITATION,
              userId,
              organizationId: input.organizationId,
              expiresAt: input.expiresAt,
            },
          });
          await transaction.auditLog.create({
            data: {
              organizationId: input.organizationId,
              actorId: input.actorId,
              action,
              entityType: 'Membership',
              entityId: membershipId,
              requestId: input.requestId,
              metadata: { role: input.role },
            },
          });

          const member = await transaction.membership.findUniqueOrThrow({
            where: { id: membershipId },
            select: memberSelect,
          });
          return toMemberRecord(member);
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new LifecycleRepositoryConflictError('EMAIL_IN_USE');
      }
      throw error;
    }
  }

  async updateMember(input: UpdateMemberInput): Promise<MemberRecord | null> {
    return this.database.$transaction(
      async (transaction) => {
        const current = await transaction.membership.findFirst({
          where: {
            id: input.membershipId,
            organizationId: input.organizationId,
          },
          select: memberSelect,
        });
        if (!current) {
          return null;
        }
        if (input.isActive === true && current.acceptedAt === null) {
          throw new LifecycleRepositoryConflictError('PENDING_MEMBER');
        }

        const removesOwner =
          current.role === MembershipRole.OWNER &&
          current.isActive &&
          (input.role === MembershipRole.OPERATOR || input.isActive === false);
        if (removesOwner) {
          const activeOwners = await transaction.membership.count({
            where: {
              organizationId: input.organizationId,
              role: MembershipRole.OWNER,
              isActive: true,
              acceptedAt: { not: null },
            },
          });
          if (activeOwners <= 1) {
            throw new LifecycleRepositoryConflictError('LAST_OWNER');
          }
        }

        const updated = await transaction.membership.update({
          where: { id: current.id },
          data: {
            ...(input.role ? { role: input.role } : {}),
            ...(input.isActive === undefined
              ? {}
              : { isActive: input.isActive }),
          },
          select: memberSelect,
        });

        const accessChanged =
          updated.role !== current.role ||
          updated.isActive !== current.isActive;
        if (accessChanged) {
          await transaction.session.updateMany({
            where: {
              userId: current.userId,
              organizationId: input.organizationId,
              revokedAt: null,
            },
            data: { revokedAt: input.now },
          });
        }
        await transaction.auditLog.create({
          data: {
            organizationId: input.organizationId,
            actorId: input.actorId,
            action: 'MEMBER_ACCESS_UPDATED',
            entityType: 'Membership',
            entityId: current.id,
            requestId: input.requestId,
            metadata: {
              previousRole: current.role,
              role: updated.role,
              previousActive: current.isActive,
              isActive: updated.isActive,
            },
          },
        });
        return toMemberRecord(updated);
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async acceptInvitation(input: {
    tokenHash: string;
    name: string;
    passwordHash: string;
    sessionTokenHash: string;
    sessionExpiresAt: Date;
    now: Date;
    requestId: string;
  }): Promise<AcceptedInvitationSession | null> {
    return this.database.$transaction(
      async (transaction) => {
        const token = await transaction.accountToken.findFirst({
          where: {
            tokenHash: input.tokenHash,
            purpose: AccountTokenPurpose.INVITATION,
            consumedAt: null,
            expiresAt: { gt: input.now },
          },
        });
        if (!token) {
          return null;
        }
        const consumed = await transaction.accountToken.updateMany({
          where: {
            id: token.id,
            consumedAt: null,
            expiresAt: { gt: input.now },
          },
          data: { consumedAt: input.now },
        });
        if (consumed.count !== 1) {
          return null;
        }

        const membership = await transaction.membership.findUnique({
          where: {
            userId_organizationId: {
              userId: token.userId,
              organizationId: token.organizationId,
            },
          },
        });
        if (!membership || membership.acceptedAt !== null) {
          return null;
        }

        const user = await transaction.user.update({
          where: { id: token.userId },
          data: {
            name: input.name,
            passwordHash: input.passwordHash,
            isActive: true,
          },
          select: { id: true, email: true, name: true },
        });
        const activatedMembership = await transaction.membership.update({
          where: { id: membership.id },
          data: { isActive: true, acceptedAt: input.now },
          include: {
            organization: {
              select: { id: true, name: true, timezone: true },
            },
          },
        });
        await transaction.accountToken.updateMany({
          where: {
            userId: token.userId,
            organizationId: token.organizationId,
            purpose: AccountTokenPurpose.INVITATION,
            consumedAt: null,
          },
          data: { consumedAt: input.now },
        });
        const session = await transaction.session.create({
          data: {
            tokenHash: input.sessionTokenHash,
            userId: token.userId,
            organizationId: token.organizationId,
            role: activatedMembership.role,
            expiresAt: input.sessionExpiresAt,
          },
        });
        await transaction.auditLog.createMany({
          data: [
            {
              organizationId: token.organizationId,
              actorId: token.userId,
              action: 'MEMBER_INVITATION_ACCEPTED',
              entityType: 'Membership',
              entityId: membership.id,
              requestId: input.requestId,
            },
            {
              organizationId: token.organizationId,
              actorId: token.userId,
              action: 'USER_LOGIN_SUCCESS',
              entityType: 'Session',
              requestId: input.requestId,
            },
          ],
        });
        return {
          sessionId: session.id,
          user,
          organization: activatedMembership.organization,
          role: activatedMembership.role,
        };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async createPasswordReset(input: {
    normalizedEmail: string;
    tokenHash: string;
    expiresAt: Date;
    now: Date;
    requestId: string;
  }): Promise<PasswordResetIdentity | null> {
    return this.database.$transaction(
      async (transaction) => {
        const user = await transaction.user.findUnique({
          where: { normalizedEmail: input.normalizedEmail },
          include: {
            memberships: {
              where: { isActive: true, acceptedAt: { not: null } },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              take: 1,
            },
          },
        });
        const membership = user?.memberships[0];
        if (!user?.isActive || !user.passwordHash || !membership) {
          return null;
        }

        await transaction.accountToken.updateMany({
          where: {
            userId: user.id,
            purpose: AccountTokenPurpose.PASSWORD_RESET,
            consumedAt: null,
          },
          data: { consumedAt: input.now },
        });
        await transaction.accountToken.create({
          data: {
            tokenHash: input.tokenHash,
            purpose: AccountTokenPurpose.PASSWORD_RESET,
            userId: user.id,
            organizationId: membership.organizationId,
            expiresAt: input.expiresAt,
          },
        });
        await transaction.auditLog.create({
          data: {
            organizationId: membership.organizationId,
            actorId: user.id,
            action: 'PASSWORD_RESET_REQUESTED',
            entityType: 'User',
            entityId: user.id,
            requestId: input.requestId,
          },
        });
        return {
          userId: user.id,
          organizationId: membership.organizationId,
          email: user.email,
          name: user.name,
        };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async completePasswordReset(input: {
    tokenHash: string;
    passwordHash: string;
    now: Date;
    requestId: string;
  }): Promise<boolean> {
    return this.database.$transaction(
      async (transaction) => {
        const token = await transaction.accountToken.findFirst({
          where: {
            tokenHash: input.tokenHash,
            purpose: AccountTokenPurpose.PASSWORD_RESET,
            consumedAt: null,
            expiresAt: { gt: input.now },
            user: { isActive: true },
          },
        });
        if (!token) {
          return false;
        }
        const consumed = await transaction.accountToken.updateMany({
          where: {
            id: token.id,
            consumedAt: null,
            expiresAt: { gt: input.now },
          },
          data: { consumedAt: input.now },
        });
        if (consumed.count !== 1) {
          return false;
        }

        await transaction.user.update({
          where: { id: token.userId },
          data: { passwordHash: input.passwordHash },
        });
        await transaction.session.updateMany({
          where: { userId: token.userId, revokedAt: null },
          data: { revokedAt: input.now },
        });
        await transaction.accountToken.updateMany({
          where: {
            userId: token.userId,
            purpose: AccountTokenPurpose.PASSWORD_RESET,
            consumedAt: null,
          },
          data: { consumedAt: input.now },
        });
        await transaction.auditLog.create({
          data: {
            organizationId: token.organizationId,
            actorId: token.userId,
            action: 'PASSWORD_RESET_COMPLETED',
            entityType: 'User',
            entityId: token.userId,
            requestId: input.requestId,
          },
        });
        return true;
      },
      { isolationLevel: 'Serializable' },
    );
  }
}

const memberSelect = {
  id: true,
  userId: true,
  role: true,
  isActive: true,
  invitedAt: true,
  acceptedAt: true,
  createdAt: true,
  user: { select: { email: true, name: true } },
} as const;

function toMemberRecord(record: {
  id: string;
  userId: string;
  role: MembershipRole;
  isActive: boolean;
  invitedAt: Date | null;
  acceptedAt: Date | null;
  createdAt: Date;
  user: { email: string; name: string };
}): MemberRecord {
  return {
    id: record.id,
    userId: record.userId,
    email: record.user.email,
    name: record.user.name,
    role: record.role,
    isActive: record.isActive,
    invitedAt: record.invitedAt,
    acceptedAt: record.acceptedAt,
    createdAt: record.createdAt,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

function provisionalName(email: string): string {
  return email.split('@', 1)[0]?.slice(0, 200) || 'Invited member';
}
