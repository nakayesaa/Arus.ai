-- Persisted invoice-import previews. Preview records are audit/control-plane
-- data only and never mutate receivable source records.

CREATE TYPE "InvoiceImportJobStatus" AS ENUM (
    'PREVIEWING',
    'READY',
    'COMMITTED',
    'FAILED',
    'CANCELLED'
);

CREATE TYPE "InvoiceImportRowResult" AS ENUM (
    'VALID',
    'INVALID',
    'DUPLICATE',
    'COMMITTED'
);

CREATE TYPE "InvoiceImportDebtorAction" AS ENUM (
    'MATCH_EXISTING',
    'WILL_CREATE'
);

ALTER TABLE "Debtor" ADD COLUMN "normalizedName" VARCHAR(200);
UPDATE "Debtor" SET "normalizedName" = LOWER(BTRIM("name"));
ALTER TABLE "Debtor" ALTER COLUMN "normalizedName" SET NOT NULL;
ALTER TABLE "Debtor" ADD CONSTRAINT "Debtor_normalized_name_check" CHECK (
    LENGTH(BTRIM("name")) > 0
    AND "normalizedName" = LOWER(BTRIM("name"))
);
CREATE INDEX "Debtor_organizationId_normalizedName_deletedAt_idx"
    ON "Debtor"("organizationId", "normalizedName", "deletedAt");

CREATE TABLE "InvoiceImportJob" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "fileHash" CHAR(64) NOT NULL,
    "status" "InvoiceImportJobStatus" NOT NULL DEFAULT 'PREVIEWING',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "warningRows" INTEGER NOT NULL DEFAULT 0,
    "fileWarnings" JSONB,
    "failureCode" VARCHAR(80),
    "failureMessage" VARCHAR(500),
    "createdById" UUID NOT NULL,
    "committedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InvoiceImportJob_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InvoiceImportJob_filename_check" CHECK (
        LENGTH(BTRIM("filename")) > 0
    ),
    CONSTRAINT "InvoiceImportJob_file_hash_check" CHECK (
        "fileHash" ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT "InvoiceImportJob_counts_check" CHECK (
        "totalRows" >= 0
        AND "validRows" >= 0
        AND "invalidRows" >= 0
        AND "duplicateRows" >= 0
        AND "warningRows" >= 0
        AND "warningRows" <= "totalRows"
        AND "totalRows" = "validRows" + "invalidRows" + "duplicateRows"
    ),
    CONSTRAINT "InvoiceImportJob_file_warnings_check" CHECK (
        "fileWarnings" IS NULL OR jsonb_typeof("fileWarnings") = 'array'
    ),
    CONSTRAINT "InvoiceImportJob_failure_check" CHECK (
        (
            "status" = 'FAILED'
            AND "failureCode" IS NOT NULL
            AND "failureMessage" IS NOT NULL
        ) OR (
            "status" <> 'FAILED'
            AND "failureCode" IS NULL
            AND "failureMessage" IS NULL
        )
    ),
    CONSTRAINT "InvoiceImportJob_committed_at_check" CHECK (
        ("status" = 'COMMITTED') = ("committedAt" IS NOT NULL)
    ),
    CONSTRAINT "InvoiceImportJob_cancelled_at_check" CHECK (
        ("status" = 'CANCELLED') = ("cancelledAt" IS NOT NULL)
    )
);

CREATE TABLE "InvoiceImportRow" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "importJobId" UUID NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "result" "InvoiceImportRowResult" NOT NULL,
    "normalizedPayload" JSONB NOT NULL,
    "errors" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "debtorAction" "InvoiceImportDebtorAction",
    "matchedDebtorId" UUID,
    "committedInvoiceId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InvoiceImportRow_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InvoiceImportRow_row_number_check" CHECK ("rowNumber" >= 2),
    CONSTRAINT "InvoiceImportRow_payload_check" CHECK (
        jsonb_typeof("normalizedPayload") = 'object'
        AND jsonb_typeof("errors") = 'array'
        AND jsonb_typeof("warnings") = 'array'
    ),
    CONSTRAINT "InvoiceImportRow_commit_result_check" CHECK (
        ("result" = 'COMMITTED') = ("committedInvoiceId" IS NOT NULL)
    ),
    CONSTRAINT "InvoiceImportRow_debtor_resolution_check" CHECK (
        ("debtorAction" = 'MATCH_EXISTING' AND "matchedDebtorId" IS NOT NULL)
        OR ("debtorAction" = 'WILL_CREATE' AND "matchedDebtorId" IS NULL)
        OR ("debtorAction" IS NULL AND "matchedDebtorId" IS NULL)
    )
);

CREATE UNIQUE INDEX "InvoiceImportRow_importJobId_rowNumber_key"
    ON "InvoiceImportRow"("importJobId", "rowNumber");
CREATE UNIQUE INDEX "InvoiceImportRow_committedInvoiceId_key"
    ON "InvoiceImportRow"("committedInvoiceId");
CREATE INDEX "InvoiceImportJob_organizationId_status_createdAt_idx"
    ON "InvoiceImportJob"("organizationId", "status", "createdAt");
CREATE INDEX "InvoiceImportJob_organizationId_fileHash_createdAt_idx"
    ON "InvoiceImportJob"("organizationId", "fileHash", "createdAt");
CREATE INDEX "InvoiceImportRow_organizationId_importJobId_result_rowNumber_idx"
    ON "InvoiceImportRow"("organizationId", "importJobId", "result", "rowNumber");
CREATE INDEX "InvoiceImportRow_organizationId_matchedDebtorId_idx"
    ON "InvoiceImportRow"("organizationId", "matchedDebtorId");

ALTER TABLE "InvoiceImportJob" ADD CONSTRAINT "InvoiceImportJob_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceImportJob" ADD CONSTRAINT "InvoiceImportJob_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceImportRow" ADD CONSTRAINT "InvoiceImportRow_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceImportRow" ADD CONSTRAINT "InvoiceImportRow_importJobId_fkey"
    FOREIGN KEY ("importJobId") REFERENCES "InvoiceImportJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceImportRow" ADD CONSTRAINT "InvoiceImportRow_matchedDebtorId_fkey"
    FOREIGN KEY ("matchedDebtorId") REFERENCES "Debtor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceImportRow" ADD CONSTRAINT "InvoiceImportRow_committedInvoiceId_fkey"
    FOREIGN KEY ("committedInvoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "enforce_invoice_import_job_tenant_consistency"()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "Membership" m
        WHERE m."userId" = NEW."createdById"
          AND m."organizationId" = NEW."organizationId"
    ) THEN
        RAISE EXCEPTION 'Import creator must belong to the same organization' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "enforce_invoice_import_row_tenant_consistency"()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "InvoiceImportJob" j
        WHERE j."id" = NEW."importJobId"
          AND j."organizationId" = NEW."organizationId"
    ) OR (
        NEW."matchedDebtorId" IS NOT NULL
        AND NOT EXISTS (
            SELECT 1 FROM "Debtor" d
            WHERE d."id" = NEW."matchedDebtorId"
              AND d."organizationId" = NEW."organizationId"
        )
    ) OR (
        NEW."committedInvoiceId" IS NOT NULL
        AND NOT EXISTS (
            SELECT 1 FROM "Invoice" i
            WHERE i."id" = NEW."committedInvoiceId"
              AND i."organizationId" = NEW."organizationId"
        )
    ) THEN
        RAISE EXCEPTION 'Import row references must belong to the same organization' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "InvoiceImportJob_tenant_consistency"
    BEFORE INSERT OR UPDATE OF "organizationId", "createdById" ON "InvoiceImportJob"
    FOR EACH ROW EXECUTE FUNCTION "enforce_invoice_import_job_tenant_consistency"();
CREATE TRIGGER "InvoiceImportRow_tenant_consistency"
    BEFORE INSERT OR UPDATE OF "organizationId", "importJobId", "matchedDebtorId", "committedInvoiceId" ON "InvoiceImportRow"
    FOR EACH ROW EXECUTE FUNCTION "enforce_invoice_import_row_tenant_consistency"();

CREATE TRIGGER "InvoiceImportJob_immutable_organization"
    BEFORE UPDATE OF "organizationId" ON "InvoiceImportJob"
    FOR EACH ROW EXECUTE FUNCTION "enforce_immutable_organization_id"();
CREATE TRIGGER "InvoiceImportRow_immutable_organization"
    BEFORE UPDATE OF "organizationId" ON "InvoiceImportRow"
    FOR EACH ROW EXECUTE FUNCTION "enforce_immutable_organization_id"();
