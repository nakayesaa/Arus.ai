-- Preserve the actor's authorization context as immutable event evidence.
ALTER TABLE "Communication" ADD COLUMN "actorRole" "MembershipRole";

UPDATE "Communication" c
SET "actorRole" = m."role"
FROM "Membership" m
WHERE m."userId" = c."actorId"
  AND m."organizationId" = c."organizationId";

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "Communication" WHERE "actorRole" IS NULL) THEN
        RAISE EXCEPTION 'Cannot backfill communication actor role';
    END IF;
END;
$$;

ALTER TABLE "Communication" ALTER COLUMN "actorRole" SET NOT NULL;
