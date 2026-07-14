-- Replace case-sensitive email uniqueness with an explicit normalized identity.
ALTER TABLE "User" ADD COLUMN "normalizedEmail" VARCHAR(320);

UPDATE "User"
SET "normalizedEmail" = LOWER(BTRIM("email"));

ALTER TABLE "User" ALTER COLUMN "normalizedEmail" SET NOT NULL;

DROP INDEX "User_email_key";

CREATE UNIQUE INDEX "User_normalizedEmail_key" ON "User"("normalizedEmail");
