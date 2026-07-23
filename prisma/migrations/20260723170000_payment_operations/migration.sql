-- Manual payment commands need an immutable operator-supplied reference and a
-- tenant-scoped idempotency key. Both remain nullable for historical opening
-- balances created before this workflow existed.
ALTER TABLE "Payment"
    ADD COLUMN "payerReference" VARCHAR(100),
    ADD COLUMN "operationKey" UUID;

CREATE UNIQUE INDEX "Payment_org_operation_key"
    ON "Payment"("organizationId", "operationKey");

DROP INDEX "Payment_organizationId_paymentDate_idx";
CREATE INDEX "Payment_organizationId_paymentDate_id_idx"
    ON "Payment"("organizationId", "paymentDate", "id");
