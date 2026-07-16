-- Receivables and payment-allocation source records. Derived balances, states,
-- and aging remain application/domain values and are intentionally not stored.

CREATE TABLE "Debtor" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" VARCHAR(50),
    "normalizedCode" VARCHAR(50),
    "name" VARCHAR(200) NOT NULL,
    "contactName" VARCHAR(200),
    "phoneNumber" VARCHAR(50),
    "email" VARCHAR(320),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Debtor_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Debtor_code_pair_check" CHECK (
        ("code" IS NULL AND "normalizedCode" IS NULL)
        OR (
            "code" IS NOT NULL
            AND LENGTH(BTRIM("code")) > 0
            AND "normalizedCode" IS NOT NULL
            AND "normalizedCode" = LOWER(BTRIM("code"))
        )
    )
);

CREATE TABLE "Invoice" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "debtorId" UUID NOT NULL,
    "invoiceNumber" VARCHAR(50) NOT NULL,
    "normalizedInvoiceNumber" VARCHAR(50) NOT NULL,
    "invoiceDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "originalAmount" DECIMAL(18,2) NOT NULL,
    "description" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Invoice_originalAmount_positive_check" CHECK ("originalAmount" > 0),
    CONSTRAINT "Invoice_dueDate_order_check" CHECK ("dueDate" >= "invoiceDate"),
    CONSTRAINT "Invoice_normalized_number_check" CHECK (
        LENGTH(BTRIM("invoiceNumber")) > 0
        AND "normalizedInvoiceNumber" = LOWER(BTRIM("invoiceNumber"))
    )
);

CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "debtorId" UUID NOT NULL,
    "paymentDate" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "bankReference" VARCHAR(100),
    "isOpeningBalance" BOOLEAN NOT NULL DEFAULT false,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Payment_amount_positive_check" CHECK ("amount" > 0)
);

CREATE TABLE "PaymentAllocation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "allocationDate" DATE NOT NULL,
    "createdById" UUID NOT NULL,
    "reversedAt" TIMESTAMPTZ(3),
    "reversalReason" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PaymentAllocation_amount_positive_check" CHECK ("amount" > 0),
    CONSTRAINT "PaymentAllocation_reversal_check" CHECK (
        ("reversedAt" IS NULL AND "reversalReason" IS NULL)
        OR ("reversedAt" IS NOT NULL AND "reversalReason" IS NOT NULL AND LENGTH(BTRIM("reversalReason")) > 0)
    )
);

CREATE INDEX "Debtor_organizationId_deletedAt_idx" ON "Debtor"("organizationId", "deletedAt");
CREATE INDEX "Debtor_organizationId_name_idx" ON "Debtor"("organizationId", "name");
CREATE UNIQUE INDEX "Debtor_organizationId_normalizedCode_active_key"
    ON "Debtor"("organizationId", "normalizedCode")
    WHERE "deletedAt" IS NULL AND "normalizedCode" IS NOT NULL;

CREATE INDEX "Invoice_organizationId_dueDate_idx" ON "Invoice"("organizationId", "dueDate");
CREATE INDEX "Invoice_organizationId_debtorId_idx" ON "Invoice"("organizationId", "debtorId");
CREATE INDEX "Invoice_organizationId_deletedAt_idx" ON "Invoice"("organizationId", "deletedAt");
CREATE UNIQUE INDEX "Invoice_organizationId_normalizedInvoiceNumber_active_key"
    ON "Invoice"("organizationId", "normalizedInvoiceNumber")
    WHERE "deletedAt" IS NULL;

CREATE INDEX "Payment_organizationId_paymentDate_idx" ON "Payment"("organizationId", "paymentDate");
CREATE INDEX "Payment_organizationId_debtorId_idx" ON "Payment"("organizationId", "debtorId");

CREATE INDEX "PaymentAllocation_organizationId_invoiceId_allocationDate_idx"
    ON "PaymentAllocation"("organizationId", "invoiceId", "allocationDate");
CREATE INDEX "PaymentAllocation_organizationId_paymentId_idx"
    ON "PaymentAllocation"("organizationId", "paymentId");

ALTER TABLE "Debtor" ADD CONSTRAINT "Debtor_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_debtorId_fkey"
    FOREIGN KEY ("debtorId") REFERENCES "Debtor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_debtorId_fkey"
    FOREIGN KEY ("debtorId") REFERENCES "Debtor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enforce tenant consistency for child records at the database boundary. These
-- checks complement repository scoping and prevent cross-organization joins
-- even if a future write path is implemented incorrectly.
CREATE OR REPLACE FUNCTION "enforce_invoice_tenant_consistency"()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "Debtor" d
        WHERE d."id" = NEW."debtorId" AND d."organizationId" = NEW."organizationId"
    ) THEN
        RAISE EXCEPTION 'Invoice debtor must belong to the same organization' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "enforce_payment_tenant_consistency"()
RETURNS TRIGGER AS $$
BEGIN
    IF (
        NOT EXISTS (
            SELECT 1 FROM "Debtor" d
            WHERE d."id" = NEW."debtorId" AND d."organizationId" = NEW."organizationId"
        ) OR NOT EXISTS (
            SELECT 1 FROM "Membership" m
            WHERE m."userId" = NEW."createdById" AND m."organizationId" = NEW."organizationId"
        )
    ) THEN
        RAISE EXCEPTION 'Payment references must belong to the same organization' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "enforce_payment_allocation_tenant_consistency"()
RETURNS TRIGGER AS $$
BEGIN
    IF (
        NOT EXISTS (
            SELECT 1
            FROM "Payment" p
            INNER JOIN "Invoice" i ON i."id" = NEW."invoiceId"
            WHERE p."id" = NEW."paymentId"
              AND p."organizationId" = NEW."organizationId"
              AND i."organizationId" = NEW."organizationId"
              AND p."debtorId" = i."debtorId"
        ) OR NOT EXISTS (
            SELECT 1 FROM "Membership" m
            WHERE m."userId" = NEW."createdById" AND m."organizationId" = NEW."organizationId"
        )
    ) THEN
        RAISE EXCEPTION 'Allocation references must belong to the same organization and debtor' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Tenant ownership is immutable. Without this guard, moving a parent record
-- could bypass child-row consistency checks that only run on child writes.
CREATE OR REPLACE FUNCTION "enforce_immutable_organization_id"()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW."organizationId" <> OLD."organizationId" THEN
        RAISE EXCEPTION 'Tenant ownership cannot be changed' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Invoice_tenant_consistency"
    BEFORE INSERT OR UPDATE OF "organizationId", "debtorId" ON "Invoice"
    FOR EACH ROW EXECUTE FUNCTION "enforce_invoice_tenant_consistency"();
CREATE TRIGGER "Payment_tenant_consistency"
    BEFORE INSERT OR UPDATE OF "organizationId", "debtorId", "createdById" ON "Payment"
    FOR EACH ROW EXECUTE FUNCTION "enforce_payment_tenant_consistency"();
CREATE TRIGGER "PaymentAllocation_tenant_consistency"
    BEFORE INSERT OR UPDATE OF "organizationId", "paymentId", "invoiceId", "createdById" ON "PaymentAllocation"
    FOR EACH ROW EXECUTE FUNCTION "enforce_payment_allocation_tenant_consistency"();

CREATE TRIGGER "Debtor_immutable_organization"
    BEFORE UPDATE OF "organizationId" ON "Debtor"
    FOR EACH ROW EXECUTE FUNCTION "enforce_immutable_organization_id"();
CREATE TRIGGER "Invoice_immutable_organization"
    BEFORE UPDATE OF "organizationId" ON "Invoice"
    FOR EACH ROW EXECUTE FUNCTION "enforce_immutable_organization_id"();
CREATE TRIGGER "Payment_immutable_organization"
    BEFORE UPDATE OF "organizationId" ON "Payment"
    FOR EACH ROW EXECUTE FUNCTION "enforce_immutable_organization_id"();
CREATE TRIGGER "PaymentAllocation_immutable_organization"
    BEFORE UPDATE OF "organizationId" ON "PaymentAllocation"
    FOR EACH ROW EXECUTE FUNCTION "enforce_immutable_organization_id"();
