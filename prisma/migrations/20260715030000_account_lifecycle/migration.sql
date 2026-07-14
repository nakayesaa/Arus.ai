-- Account lifecycle: pending invitations and one-time password action tokens.
CREATE TYPE "AccountTokenPurpose" AS ENUM ('INVITATION', 'PASSWORD_RESET');

ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

ALTER TABLE "Membership"
ADD COLUMN "invitedAt" TIMESTAMPTZ(3),
ADD COLUMN "acceptedAt" TIMESTAMPTZ(3);

-- Existing seeded/production memberships predate invitations and are already accepted.
UPDATE "Membership" SET "acceptedAt" = "createdAt" WHERE "isActive" = true;

CREATE TABLE "AccountToken" (
    "id" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "purpose" "AccountTokenPurpose" NOT NULL,
    "userId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountToken_tokenHash_key" ON "AccountToken"("tokenHash");
CREATE INDEX "AccountToken_organizationId_purpose_expiresAt_idx" ON "AccountToken"("organizationId", "purpose", "expiresAt");
CREATE INDEX "AccountToken_userId_purpose_expiresAt_idx" ON "AccountToken"("userId", "purpose", "expiresAt");

ALTER TABLE "AccountToken" ADD CONSTRAINT "AccountToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountToken" ADD CONSTRAINT "AccountToken_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
