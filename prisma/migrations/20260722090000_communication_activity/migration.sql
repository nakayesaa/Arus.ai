-- Append-only communication evidence. Outbound delivery remains outside Arus
-- in P0; this table records the human action and explicit next follow-up.

CREATE TYPE "CommunicationChannel" AS ENUM (
    'WHATSAPP',
    'CALL',
    'EMAIL',
    'OTHER'
);

CREATE TABLE "Communication" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "operationKey" UUID NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "channel" "CommunicationChannel" NOT NULL,
    "notes" VARCHAR(2000) NOT NULL,
    "nextFollowUpDate" DATE,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Communication_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Communication_notes_check" CHECK (
        LENGTH(BTRIM("notes")) > 0
    )
);

CREATE UNIQUE INDEX "Communication_organizationId_operationKey_key"
    ON "Communication"("organizationId", "operationKey");
CREATE INDEX "Communication_organizationId_invoiceId_occurredAt_idx"
    ON "Communication"("organizationId", "invoiceId", "occurredAt");
CREATE INDEX "Communication_organizationId_createdAt_idx"
    ON "Communication"("organizationId", "createdAt");

ALTER TABLE "Communication" ADD CONSTRAINT "Communication_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Communication" ADD CONSTRAINT "Communication_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Communication" ADD CONSTRAINT "Communication_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "enforce_communication_tenant_consistency"()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "Invoice" i
        WHERE i."id" = NEW."invoiceId"
          AND i."organizationId" = NEW."organizationId"
    ) OR NOT EXISTS (
        SELECT 1 FROM "Membership" m
        WHERE m."userId" = NEW."actorId"
          AND m."organizationId" = NEW."organizationId"
          AND m."isActive" = true
    ) THEN
        RAISE EXCEPTION 'Communication references must belong to the same organization' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Communication_tenant_consistency"
    BEFORE INSERT OR UPDATE OF "organizationId", "invoiceId", "actorId" ON "Communication"
    FOR EACH ROW EXECUTE FUNCTION "enforce_communication_tenant_consistency"();

CREATE TRIGGER "Communication_immutable_organization"
    BEFORE UPDATE OF "organizationId" ON "Communication"
    FOR EACH ROW EXECUTE FUNCTION "enforce_immutable_organization_id"();
