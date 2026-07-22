CREATE TYPE "PromiseFinalStatus" AS ENUM ('FULFILLED', 'CANCELLED');
CREATE TYPE "DisputeCategory" AS ENUM (
    'MISSING_POD',
    'WRONG_AMOUNT',
    'WRONG_QUANTITY',
    'QUALITY',
    'ADMINISTRATIVE',
    'OTHER'
);
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'RESOLVED');

CREATE TABLE "PromiseToPay" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "promiseDate" DATE NOT NULL,
    "createdById" UUID NOT NULL,
    "createdByRole" "MembershipRole" NOT NULL,
    "operationKey" UUID NOT NULL,
    "finalStatus" "PromiseFinalStatus",
    "fulfilledAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelledById" UUID,
    "cancelledByRole" "MembershipRole",
    "cancelReason" VARCHAR(500),
    "cancellationOperationKey" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PromiseToPay_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PromiseToPay_amount_positive" CHECK ("amount" > 0),
    CONSTRAINT "PromiseToPay_final_evidence" CHECK (
        (
            "finalStatus" IS NULL
            AND "fulfilledAt" IS NULL
            AND "cancelledAt" IS NULL
            AND "cancelledById" IS NULL
            AND "cancelledByRole" IS NULL
            AND "cancelReason" IS NULL
            AND "cancellationOperationKey" IS NULL
        ) OR (
            "finalStatus" = 'FULFILLED'
            AND "fulfilledAt" IS NOT NULL
            AND "cancelledAt" IS NULL
            AND "cancelledById" IS NULL
            AND "cancelledByRole" IS NULL
            AND "cancelReason" IS NULL
            AND "cancellationOperationKey" IS NULL
        ) OR (
            "finalStatus" = 'CANCELLED'
            AND "fulfilledAt" IS NULL
            AND "cancelledAt" IS NOT NULL
            AND "cancelledById" IS NOT NULL
            AND "cancelledByRole" IS NOT NULL
            AND LENGTH(BTRIM("cancelReason")) > 0
            AND "cancellationOperationKey" IS NOT NULL
        )
    )
);

CREATE TABLE "Dispute" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "category" "DisputeCategory" NOT NULL,
    "details" VARCHAR(2000) NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "createdById" UUID NOT NULL,
    "createdByRole" "MembershipRole" NOT NULL,
    "operationKey" UUID NOT NULL,
    "resolvedById" UUID,
    "resolvedByRole" "MembershipRole",
    "resolvedAt" TIMESTAMPTZ(3),
    "resolutionNote" VARCHAR(1000),
    "resolutionOperationKey" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Dispute_details_nonempty" CHECK (LENGTH(BTRIM("details")) > 0),
    CONSTRAINT "Dispute_resolution_evidence" CHECK (
        (
            "status" = 'OPEN'
            AND "resolvedById" IS NULL
            AND "resolvedByRole" IS NULL
            AND "resolvedAt" IS NULL
            AND "resolutionNote" IS NULL
            AND "resolutionOperationKey" IS NULL
        ) OR (
            "status" = 'RESOLVED'
            AND "resolvedById" IS NOT NULL
            AND "resolvedByRole" IS NOT NULL
            AND "resolvedAt" IS NOT NULL
            AND "resolutionOperationKey" IS NOT NULL
            AND ("resolutionNote" IS NULL OR LENGTH(BTRIM("resolutionNote")) > 0)
        )
    )
);

CREATE UNIQUE INDEX "PromiseToPay_org_operation_key"
    ON "PromiseToPay"("organizationId", "operationKey");
CREATE UNIQUE INDEX "PromiseToPay_org_cancel_operation_key"
    ON "PromiseToPay"("organizationId", "cancellationOperationKey");
CREATE INDEX "PromiseToPay_organizationId_invoiceId_promiseDate_idx"
    ON "PromiseToPay"("organizationId", "invoiceId", "promiseDate");
CREATE INDEX "PromiseToPay_organizationId_finalStatus_promiseDate_idx"
    ON "PromiseToPay"("organizationId", "finalStatus", "promiseDate");

CREATE UNIQUE INDEX "Dispute_org_operation_key"
    ON "Dispute"("organizationId", "operationKey");
CREATE UNIQUE INDEX "Dispute_org_resolution_operation_key"
    ON "Dispute"("organizationId", "resolutionOperationKey");
CREATE INDEX "Dispute_organizationId_invoiceId_status_createdAt_idx"
    ON "Dispute"("organizationId", "invoiceId", "status", "createdAt");
CREATE INDEX "Dispute_organizationId_status_createdAt_idx"
    ON "Dispute"("organizationId", "status", "createdAt");

ALTER TABLE "PromiseToPay" ADD CONSTRAINT "PromiseToPay_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PromiseToPay" ADD CONSTRAINT "PromiseToPay_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PromiseToPay" ADD CONSTRAINT "PromiseToPay_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PromiseToPay" ADD CONSTRAINT "PromiseToPay_cancelledById_fkey"
    FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_resolvedById_fkey"
    FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "enforce_promise_tenant_consistency"()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "Invoice" i
        WHERE i."id" = NEW."invoiceId"
          AND i."organizationId" = NEW."organizationId"
    ) OR NOT EXISTS (
        SELECT 1 FROM "Membership" m
        WHERE m."userId" = NEW."createdById"
          AND m."organizationId" = NEW."organizationId"
          AND m."role" = NEW."createdByRole"
          AND (TG_OP <> 'INSERT' OR m."isActive" = true)
    ) OR (
        NEW."cancelledById" IS NOT NULL
        AND NOT EXISTS (
            SELECT 1 FROM "Membership" m
            WHERE m."userId" = NEW."cancelledById"
              AND m."organizationId" = NEW."organizationId"
              AND m."isActive" = true
              AND m."role" = NEW."cancelledByRole"
        )
    ) THEN
        RAISE EXCEPTION 'Promise references must belong to the same organization' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "enforce_dispute_tenant_consistency"()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "Invoice" i
        WHERE i."id" = NEW."invoiceId"
          AND i."organizationId" = NEW."organizationId"
    ) OR NOT EXISTS (
        SELECT 1 FROM "Membership" m
        WHERE m."userId" = NEW."createdById"
          AND m."organizationId" = NEW."organizationId"
          AND m."role" = NEW."createdByRole"
          AND (TG_OP <> 'INSERT' OR m."isActive" = true)
    ) OR (
        NEW."resolvedById" IS NOT NULL
        AND NOT EXISTS (
            SELECT 1 FROM "Membership" m
            WHERE m."userId" = NEW."resolvedById"
              AND m."organizationId" = NEW."organizationId"
              AND m."isActive" = true
              AND m."role" = NEW."resolvedByRole"
        )
    ) THEN
        RAISE EXCEPTION 'Dispute references must belong to the same organization' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PromiseToPay_tenant_consistency"
    BEFORE INSERT OR UPDATE OF "organizationId", "invoiceId", "createdById", "cancelledById" ON "PromiseToPay"
    FOR EACH ROW EXECUTE FUNCTION "enforce_promise_tenant_consistency"();
CREATE TRIGGER "Dispute_tenant_consistency"
    BEFORE INSERT OR UPDATE OF "organizationId", "invoiceId", "createdById", "resolvedById" ON "Dispute"
    FOR EACH ROW EXECUTE FUNCTION "enforce_dispute_tenant_consistency"();

CREATE OR REPLACE FUNCTION "enforce_promise_immutable_evidence"()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD."organizationId" IS DISTINCT FROM NEW."organizationId"
        OR OLD."invoiceId" IS DISTINCT FROM NEW."invoiceId"
        OR OLD."amount" IS DISTINCT FROM NEW."amount"
        OR OLD."promiseDate" IS DISTINCT FROM NEW."promiseDate"
        OR OLD."createdById" IS DISTINCT FROM NEW."createdById"
        OR OLD."createdByRole" IS DISTINCT FROM NEW."createdByRole"
        OR OLD."operationKey" IS DISTINCT FROM NEW."operationKey"
        OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt"
        OR (
            OLD."finalStatus" IS NOT NULL
            AND (
                OLD."finalStatus" IS DISTINCT FROM NEW."finalStatus"
                OR OLD."fulfilledAt" IS DISTINCT FROM NEW."fulfilledAt"
                OR OLD."cancelledAt" IS DISTINCT FROM NEW."cancelledAt"
                OR OLD."cancelledById" IS DISTINCT FROM NEW."cancelledById"
                OR OLD."cancelledByRole" IS DISTINCT FROM NEW."cancelledByRole"
                OR OLD."cancelReason" IS DISTINCT FROM NEW."cancelReason"
                OR OLD."cancellationOperationKey" IS DISTINCT FROM NEW."cancellationOperationKey"
            )
        )
    THEN
        RAISE EXCEPTION 'Promise evidence is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "enforce_dispute_immutable_evidence"()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD."organizationId" IS DISTINCT FROM NEW."organizationId"
        OR OLD."invoiceId" IS DISTINCT FROM NEW."invoiceId"
        OR OLD."category" IS DISTINCT FROM NEW."category"
        OR OLD."details" IS DISTINCT FROM NEW."details"
        OR OLD."createdById" IS DISTINCT FROM NEW."createdById"
        OR OLD."createdByRole" IS DISTINCT FROM NEW."createdByRole"
        OR OLD."operationKey" IS DISTINCT FROM NEW."operationKey"
        OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt"
        OR (
            OLD."status" = 'RESOLVED'
            AND (
                OLD."status" IS DISTINCT FROM NEW."status"
                OR OLD."resolvedById" IS DISTINCT FROM NEW."resolvedById"
                OR OLD."resolvedByRole" IS DISTINCT FROM NEW."resolvedByRole"
                OR OLD."resolvedAt" IS DISTINCT FROM NEW."resolvedAt"
                OR OLD."resolutionNote" IS DISTINCT FROM NEW."resolutionNote"
                OR OLD."resolutionOperationKey" IS DISTINCT FROM NEW."resolutionOperationKey"
            )
        )
    THEN
        RAISE EXCEPTION 'Dispute evidence is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PromiseToPay_immutable_evidence"
    BEFORE UPDATE ON "PromiseToPay"
    FOR EACH ROW EXECUTE FUNCTION "enforce_promise_immutable_evidence"();
CREATE TRIGGER "Dispute_immutable_evidence"
    BEFORE UPDATE ON "Dispute"
    FOR EACH ROW EXECUTE FUNCTION "enforce_dispute_immutable_evidence"();
