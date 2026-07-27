-- CreateEnum
CREATE TYPE "WhatsAppProvider" AS ENUM ('META');

-- CreateEnum
CREATE TYPE "WhatsAppConnectionState" AS ENUM ('DISCONNECTED', 'LIVE', 'PAUSED', 'DEGRADED');

-- CreateEnum
CREATE TYPE "ConversationMatchState" AS ENUM ('MATCHED', 'UNMATCHED', 'AMBIGUOUS');

-- CreateEnum
CREATE TYPE "ChannelMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "ChannelMessageType" AS ENUM ('TEXT', 'IMAGE');

-- CreateEnum
CREATE TYPE "ChannelMessageState" AS ENUM ('DRAFT', 'APPROVED', 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'RECEIVED', 'PROCESSING', 'READY');

-- CreateEnum
CREATE TYPE "MediaProcessingState" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentEvidenceState" AS ENUM ('PROCESSING', 'AWAITING_REVIEW', 'ACCEPTED', 'REJECTED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "WebhookInboxState" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'RETRY', 'FAILED');

-- CreateEnum
CREATE TYPE "MessageOutboxState" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'RETRY', 'FAILED');

-- CreateTable
CREATE TABLE "WhatsAppConnection" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "provider" "WhatsAppProvider" NOT NULL DEFAULT 'META',
    "providerBusinessId" VARCHAR(100),
    "providerPhoneNumberId" VARCHAR(100),
    "displayPhoneNumber" VARCHAR(32),
    "state" "WhatsAppConnectionState" NOT NULL DEFAULT 'DISCONNECTED',
    "lastWebhookAt" TIMESTAMPTZ(3),
    "lastHealthyAt" TIMESTAMPTZ(3),
    "lastFailureCode" VARCHAR(80),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WhatsAppConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationThread" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "debtorId" UUID,
    "currentInvoiceId" UUID,
    "normalizedCustomerNumber" VARCHAR(32) NOT NULL,
    "customerDisplayName" VARCHAR(200),
    "matchState" "ConversationMatchState" NOT NULL DEFAULT 'UNMATCHED',
    "lastMessageAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ConversationThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelMessage" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "threadId" UUID NOT NULL,
    "invoiceId" UUID,
    "direction" "ChannelMessageDirection" NOT NULL,
    "type" "ChannelMessageType" NOT NULL,
    "state" "ChannelMessageState" NOT NULL,
    "providerMessageId" VARCHAR(160),
    "operationKey" UUID,
    "body" VARCHAR(4096),
    "safeFailureCode" VARCHAR(80),
    "approvedById" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ChannelMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "providerMediaId" VARCHAR(160),
    "objectKey" VARCHAR(500),
    "sha256" CHAR(64),
    "detectedMime" VARCHAR(80),
    "byteSize" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "processingState" "MediaProcessingState" NOT NULL DEFAULT 'PENDING',
    "failureCode" VARCHAR(80),
    "processingStartedAt" TIMESTAMPTZ(3),
    "processedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvidenceReview" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "mediaAssetId" UUID NOT NULL,
    "debtorId" UUID,
    "invoiceId" UUID,
    "state" "PaymentEvidenceState" NOT NULL DEFAULT 'PROCESSING',
    "reviewerId" UUID,
    "reviewedAt" TIMESTAMPTZ(3),
    "rejectionReason" VARCHAR(500),
    "paymentId" UUID,
    "operationKey" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PaymentEvidenceReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookInbox" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "connectionId" UUID,
    "provider" "WhatsAppProvider" NOT NULL DEFAULT 'META',
    "providerEventId" VARCHAR(200) NOT NULL,
    "payload" JSONB NOT NULL,
    "signatureVerifiedAt" TIMESTAMPTZ(3) NOT NULL,
    "state" "WebhookInboxState" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseOwner" VARCHAR(100),
    "leaseExpiresAt" TIMESTAMPTZ(3),
    "safeErrorCode" VARCHAR(80),
    "processedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WebhookInbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageOutbox" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "channelMessageId" UUID NOT NULL,
    "state" "MessageOutboxState" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseOwner" VARCHAR(100),
    "leaseExpiresAt" TIMESTAMPTZ(3),
    "safeErrorCode" VARCHAR(80),
    "sentAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MessageOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhatsAppConnection_organizationId_state_createdAt_idx" ON "WhatsAppConnection"("organizationId", "state", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConnection_organizationId_provider_key" ON "WhatsAppConnection"("organizationId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConnection_provider_providerPhoneNumberId_key" ON "WhatsAppConnection"("provider", "providerPhoneNumberId");

-- CreateIndex
CREATE INDEX "ConversationThread_organizationId_debtorId_lastMessageAt_idx" ON "ConversationThread"("organizationId", "debtorId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "ConversationThread_organizationId_matchState_lastMessageAt_idx" ON "ConversationThread"("organizationId", "matchState", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationThread_organizationId_normalizedCustomerNumber_key" ON "ConversationThread"("organizationId", "normalizedCustomerNumber");

-- CreateIndex
CREATE INDEX "ChannelMessage_organizationId_threadId_occurredAt_id_idx" ON "ChannelMessage"("organizationId", "threadId", "occurredAt", "id");

-- CreateIndex
CREATE INDEX "ChannelMessage_organizationId_state_createdAt_idx" ON "ChannelMessage"("organizationId", "state", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelMessage_connectionId_providerMessageId_key" ON "ChannelMessage"("connectionId", "providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelMessage_organizationId_operationKey_key" ON "ChannelMessage"("organizationId", "operationKey");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_messageId_key" ON "MediaAsset"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_objectKey_key" ON "MediaAsset"("objectKey");

-- CreateIndex
CREATE INDEX "MediaAsset_organizationId_processingState_createdAt_idx" ON "MediaAsset"("organizationId", "processingState", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_organizationId_providerMediaId_key" ON "MediaAsset"("organizationId", "providerMediaId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvidenceReview_mediaAssetId_key" ON "PaymentEvidenceReview"("mediaAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvidenceReview_paymentId_key" ON "PaymentEvidenceReview"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentEvidenceReview_organizationId_state_createdAt_idx" ON "PaymentEvidenceReview"("organizationId", "state", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentEvidenceReview_organizationId_debtorId_createdAt_idx" ON "PaymentEvidenceReview"("organizationId", "debtorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvidenceReview_organizationId_operationKey_key" ON "PaymentEvidenceReview"("organizationId", "operationKey");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookInbox_providerEventId_key" ON "WebhookInbox"("providerEventId");

-- CreateIndex
CREATE INDEX "WebhookInbox_state_nextAttemptAt_leaseExpiresAt_idx" ON "WebhookInbox"("state", "nextAttemptAt", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "WebhookInbox_organizationId_createdAt_idx" ON "WebhookInbox"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessageOutbox_channelMessageId_key" ON "MessageOutbox"("channelMessageId");

-- CreateIndex
CREATE INDEX "MessageOutbox_organizationId_state_nextAttemptAt_leaseExpir_idx" ON "MessageOutbox"("organizationId", "state", "nextAttemptAt", "leaseExpiresAt");

-- AddForeignKey
ALTER TABLE "WhatsAppConnection" ADD CONSTRAINT "WhatsAppConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationThread" ADD CONSTRAINT "ConversationThread_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationThread" ADD CONSTRAINT "ConversationThread_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationThread" ADD CONSTRAINT "ConversationThread_debtorId_fkey" FOREIGN KEY ("debtorId") REFERENCES "Debtor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationThread" ADD CONSTRAINT "ConversationThread_currentInvoiceId_fkey" FOREIGN KEY ("currentInvoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelMessage" ADD CONSTRAINT "ChannelMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelMessage" ADD CONSTRAINT "ChannelMessage_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelMessage" ADD CONSTRAINT "ChannelMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ConversationThread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelMessage" ADD CONSTRAINT "ChannelMessage_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelMessage" ADD CONSTRAINT "ChannelMessage_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChannelMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvidenceReview" ADD CONSTRAINT "PaymentEvidenceReview_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvidenceReview" ADD CONSTRAINT "PaymentEvidenceReview_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvidenceReview" ADD CONSTRAINT "PaymentEvidenceReview_debtorId_fkey" FOREIGN KEY ("debtorId") REFERENCES "Debtor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvidenceReview" ADD CONSTRAINT "PaymentEvidenceReview_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvidenceReview" ADD CONSTRAINT "PaymentEvidenceReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvidenceReview" ADD CONSTRAINT "PaymentEvidenceReview_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookInbox" ADD CONSTRAINT "WebhookInbox_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookInbox" ADD CONSTRAINT "WebhookInbox_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageOutbox" ADD CONSTRAINT "MessageOutbox_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageOutbox" ADD CONSTRAINT "MessageOutbox_channelMessageId_fkey" FOREIGN KEY ("channelMessageId") REFERENCES "ChannelMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
