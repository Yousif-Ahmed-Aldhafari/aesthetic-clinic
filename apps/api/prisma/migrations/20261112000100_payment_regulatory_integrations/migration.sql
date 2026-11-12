BEGIN;

-- CreateEnum
CREATE TYPE "PaymentProviderCode" AS ENUM ('SANDBOX_MOCK', 'MOYASAR', 'CHECKOUT_COM', 'STRIPE', 'REGIONAL_BANK_GATEWAY');

-- CreateEnum
CREATE TYPE "IntegrationMode" AS ENUM ('SANDBOX', 'LIVE');

-- CreateEnum
CREATE TYPE "ProviderHealthStatus" AS ENUM ('UNKNOWN', 'HEALTHY', 'DEGRADED', 'DISABLED');

-- CreateEnum
CREATE TYPE "PaymentIntentStatus" AS ENUM ('CREATED', 'REQUIRES_ACTION', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WebhookProcessingStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED_DUPLICATE', 'FAILED_RETRYABLE', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "ExternalRefundStatus" AS ENUM ('INITIATED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ExternalPayoutStatus" AS ENUM ('PREPARED', 'APPROVED', 'SUBMITTED', 'PROCESSING', 'SETTLED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReconciliationScope" AS ENUM ('INTERNAL_LEDGER', 'PAYMENT_PROVIDER', 'BANK_STATEMENT');

-- CreateEnum
CREATE TYPE "ReconciliationFindingType" AS ENUM ('PROVIDER_PAYMENT_MISSING', 'INTERNAL_PAYMENT_MISSING', 'AMOUNT_MISMATCH', 'CURRENCY_MISMATCH', 'DUPLICATE_PROVIDER_EVENT', 'REFUND_STATUS_MISMATCH', 'PAYOUT_UNVERIFIED', 'SETTLEMENT_FEE_VARIANCE');

-- CreateEnum
CREATE TYPE "ReconciliationFindingSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ReconciliationRunStatus" AS ENUM ('COMPLETED', 'COMPLETED_WITH_FINDINGS', 'FAILED');

-- CreateEnum
CREATE TYPE "RegulatoryFramework" AS ENUM ('NOT_CONFIGURED', 'SA_ZATCA', 'AE_FTA', 'GENERIC_TAX_INVOICE');

-- CreateEnum
CREATE TYPE "RegulatoryDocumentType" AS ENUM ('TAX_INVOICE', 'SIMPLIFIED_TAX_INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE');

-- CreateEnum
CREATE TYPE "RegulatorySubmissionStatus" AS ENUM ('NOT_CONFIGURED', 'DRAFT', 'VALIDATED_LOCALLY', 'MOCK_SUBMITTED', 'REJECTED', 'SUBMITTED');


-- CreateTable
CREATE TABLE "PaymentProviderConfiguration" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "providerCode" "PaymentProviderCode" NOT NULL,
    "mode" "IntegrationMode" NOT NULL DEFAULT 'SANDBOX',
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "supportedCurrencies" TEXT[],
    "jurisdiction" VARCHAR(16) NOT NULL DEFAULT 'SA',
    "capabilities" JSONB NOT NULL,
    "encryptedApiKey" TEXT,
    "encryptedWebhookSecret" TEXT,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "secretFingerprint" CHAR(16),
    "healthStatus" "ProviderHealthStatus" NOT NULL DEFAULT 'DISABLED',
    "lastHealthCheckedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PaymentProviderConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentIntent" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "branchId" UUID,
    "invoiceId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "providerConfigId" UUID NOT NULL,
    "providerCode" "PaymentProviderCode" NOT NULL,
    "mode" "IntegrationMode" NOT NULL DEFAULT 'SANDBOX',
    "providerIntentId" VARCHAR(128),
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "currencyScale" INTEGER NOT NULL,
    "status" "PaymentIntentStatus" NOT NULL DEFAULT 'CREATED',
    "checkoutUrl" VARCHAR(500),
    "initiatedByMembershipId" UUID,
    "initiatedByPatientAccountId" UUID,
    "postedPaymentId" UUID,
    "failureCode" VARCHAR(80),
    "failureMessage" VARCHAR(300),
    "idempotencyKey" UUID NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3),

    CONSTRAINT "PaymentIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentProviderEvent" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "providerConfigId" UUID,
    "paymentIntentId" UUID,
    "providerCode" "PaymentProviderCode" NOT NULL,
    "providerEventId" VARCHAR(128) NOT NULL,
    "eventType" VARCHAR(80) NOT NULL,
    "signatureVerified" BOOLEAN NOT NULL,
    "eventTimestamp" TIMESTAMPTZ(3),
    "rawPayloadHash" CHAR(64) NOT NULL,
    "sanitizedPayload" JSONB NOT NULL,
    "processingStatus" "WebhookProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMPTZ(3),
    "errorMessage" VARCHAR(500),
    "processedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentProviderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentSettlement" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "providerConfigId" UUID NOT NULL,
    "providerCode" "PaymentProviderCode" NOT NULL,
    "providerSettlementId" VARCHAR(128) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "currencyScale" INTEGER NOT NULL,
    "grossAmountMinor" BIGINT NOT NULL,
    "feeAmountMinor" BIGINT NOT NULL,
    "netAmountMinor" BIGINT NOT NULL,
    "settledAt" TIMESTAMPTZ(3) NOT NULL,
    "bankReference" VARCHAR(128),
    "isExternallyVerified" BOOLEAN NOT NULL DEFAULT false,
    "evidenceJson" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalRefund" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "refundRequestId" UUID NOT NULL,
    "paymentIntentId" UUID,
    "paymentReversalId" UUID,
    "providerConfigId" UUID NOT NULL,
    "providerCode" "PaymentProviderCode" NOT NULL,
    "mode" "IntegrationMode" NOT NULL DEFAULT 'SANDBOX',
    "providerRefundId" VARCHAR(128),
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "currencyScale" INTEGER NOT NULL,
    "status" "ExternalRefundStatus" NOT NULL DEFAULT 'INITIATED',
    "initiatedByMembershipId" UUID NOT NULL,
    "failureReason" VARCHAR(300),
    "idempotencyKey" UUID NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "evidenceJson" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ExternalRefund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalPayout" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "commissionSettlementId" UUID NOT NULL,
    "providerConfigId" UUID,
    "providerCode" "PaymentProviderCode",
    "mode" "IntegrationMode" NOT NULL DEFAULT 'SANDBOX',
    "payoutNumber" VARCHAR(40) NOT NULL,
    "providerPayoutId" VARCHAR(128),
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "currencyScale" INTEGER NOT NULL,
    "status" "ExternalPayoutStatus" NOT NULL DEFAULT 'PREPARED',
    "preparedByMembershipId" UUID NOT NULL,
    "approvedByMembershipId" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "submittedAt" TIMESTAMPTZ(3),
    "settledAt" TIMESTAMPTZ(3),
    "bankReference" VARCHAR(128),
    "isExternallyVerified" BOOLEAN NOT NULL DEFAULT false,
    "failureReason" VARCHAR(300),
    "idempotencyKey" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ExternalPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalReconciliationRun" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "runNumber" VARCHAR(40) NOT NULL,
    "scope" "ReconciliationScope" NOT NULL,
    "providerCode" "PaymentProviderCode",
    "periodStart" TIMESTAMPTZ(3) NOT NULL,
    "periodEnd" TIMESTAMPTZ(3) NOT NULL,
    "status" "ReconciliationRunStatus" NOT NULL,
    "totalChecked" INTEGER NOT NULL,
    "discrepancyCount" INTEGER NOT NULL,
    "summaryJson" JSONB NOT NULL,
    "executedByMembershipId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalReconciliationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalReconciliationFinding" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "findingType" "ReconciliationFindingType" NOT NULL,
    "severity" "ReconciliationFindingSeverity" NOT NULL,
    "entityType" VARCHAR(50) NOT NULL,
    "entityId" VARCHAR(128) NOT NULL,
    "expectedAmountMinor" BIGINT,
    "actualAmountMinor" BIGINT,
    "currency" CHAR(3),
    "descriptionAr" TEXT NOT NULL,
    "descriptionEn" TEXT NOT NULL,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalReconciliationFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicRegulatoryProfile" (
    "clinicId" UUID NOT NULL,
    "countryCode" CHAR(2) NOT NULL DEFAULT 'SA',
    "framework" "RegulatoryFramework" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "taxRegistrationNumber" VARCHAR(60),
    "invoiceNumberingPrefix" VARCHAR(20),
    "isEInvoicingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "sandboxMode" BOOLEAN NOT NULL DEFAULT true,
    "configJson" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ClinicRegulatoryProfile_pkey" PRIMARY KEY ("clinicId")
);

-- CreateTable
CREATE TABLE "RegulatoryDocument" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "documentNumber" VARCHAR(48) NOT NULL,
    "documentType" "RegulatoryDocumentType" NOT NULL,
    "framework" "RegulatoryFramework" NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "canonicalHash" CHAR(64) NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "status" "RegulatorySubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "isImmutable" BOOLEAN NOT NULL DEFAULT false,
    "createdByMembershipId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RegulatoryDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulatorySubmission" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "framework" "RegulatoryFramework" NOT NULL,
    "mode" "IntegrationMode" NOT NULL DEFAULT 'SANDBOX',
    "status" "RegulatorySubmissionStatus" NOT NULL,
    "externalReferenceId" VARCHAR(128),
    "responseSummary" JSONB,
    "submittedByMembershipId" UUID NOT NULL,
    "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegulatorySubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulatorySubmissionEvent" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "eventType" VARCHAR(64) NOT NULL,
    "status" "RegulatorySubmissionStatus" NOT NULL,
    "detailsJson" JSONB,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegulatorySubmissionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalPayoutCounter" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ExternalPayoutCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalReconciliationRunCounter" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ExternalReconciliationRunCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulatoryDocumentCounter" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RegulatoryDocumentCounter_pkey" PRIMARY KEY ("id")
);


-- CreateIndex
CREATE INDEX "PaymentProviderConfiguration_clinicId_isEnabled_idx" ON "PaymentProviderConfiguration"("clinicId", "isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProviderConfiguration_clinicId_id_key" ON "PaymentProviderConfiguration"("clinicId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProviderConfiguration_clinicId_providerCode_mode_key" ON "PaymentProviderConfiguration"("clinicId", "providerCode", "mode");

-- CreateIndex
CREATE INDEX "PaymentIntent_clinicId_invoiceId_status_idx" ON "PaymentIntent"("clinicId", "invoiceId", "status");

-- CreateIndex
CREATE INDEX "PaymentIntent_clinicId_status_createdAt_idx" ON "PaymentIntent"("clinicId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_clinicId_id_key" ON "PaymentIntent"("clinicId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_clinicId_idempotencyKey_key" ON "PaymentIntent"("clinicId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_clinicId_providerCode_providerIntentId_key" ON "PaymentIntent"("clinicId", "providerCode", "providerIntentId");

-- CreateIndex
CREATE INDEX "PaymentProviderEvent_clinicId_processingStatus_createdAt_idx" ON "PaymentProviderEvent"("clinicId", "processingStatus", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProviderEvent_clinicId_id_key" ON "PaymentProviderEvent"("clinicId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProviderEvent_clinicId_providerCode_providerEventId_key" ON "PaymentProviderEvent"("clinicId", "providerCode", "providerEventId");

-- CreateIndex
CREATE INDEX "PaymentSettlement_clinicId_settledAt_idx" ON "PaymentSettlement"("clinicId", "settledAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSettlement_clinicId_id_key" ON "PaymentSettlement"("clinicId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSettlement_clinicId_providerCode_providerSettlementI_key" ON "PaymentSettlement"("clinicId", "providerCode", "providerSettlementId");

-- CreateIndex
CREATE INDEX "ExternalRefund_clinicId_refundRequestId_status_idx" ON "ExternalRefund"("clinicId", "refundRequestId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalRefund_clinicId_id_key" ON "ExternalRefund"("clinicId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalRefund_clinicId_idempotencyKey_key" ON "ExternalRefund"("clinicId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalRefund_clinicId_providerCode_providerRefundId_key" ON "ExternalRefund"("clinicId", "providerCode", "providerRefundId");

-- CreateIndex
CREATE INDEX "ExternalPayout_clinicId_status_createdAt_idx" ON "ExternalPayout"("clinicId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalPayout_clinicId_id_key" ON "ExternalPayout"("clinicId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalPayout_clinicId_payoutNumber_key" ON "ExternalPayout"("clinicId", "payoutNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalPayout_clinicId_idempotencyKey_key" ON "ExternalPayout"("clinicId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ExternalReconciliationRun_clinicId_createdAt_idx" ON "ExternalReconciliationRun"("clinicId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalReconciliationRun_clinicId_id_key" ON "ExternalReconciliationRun"("clinicId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalReconciliationRun_clinicId_runNumber_key" ON "ExternalReconciliationRun"("clinicId", "runNumber");

-- CreateIndex
CREATE INDEX "ExternalReconciliationFinding_clinicId_runId_findingType_idx" ON "ExternalReconciliationFinding"("clinicId", "runId", "findingType");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalReconciliationFinding_clinicId_id_key" ON "ExternalReconciliationFinding"("clinicId", "id");

-- CreateIndex
CREATE INDEX "RegulatoryDocument_clinicId_invoiceId_idx" ON "RegulatoryDocument"("clinicId", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "RegulatoryDocument_clinicId_id_key" ON "RegulatoryDocument"("clinicId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "RegulatoryDocument_clinicId_documentNumber_key" ON "RegulatoryDocument"("clinicId", "documentNumber");

-- CreateIndex
CREATE INDEX "RegulatorySubmission_clinicId_documentId_createdAt_idx" ON "RegulatorySubmission"("clinicId", "documentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RegulatorySubmission_clinicId_id_key" ON "RegulatorySubmission"("clinicId", "id");

-- CreateIndex
CREATE INDEX "RegulatorySubmissionEvent_clinicId_submissionId_occurredAt_idx" ON "RegulatorySubmissionEvent"("clinicId", "submissionId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "RegulatorySubmissionEvent_clinicId_id_key" ON "RegulatorySubmissionEvent"("clinicId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalPayoutCounter_clinicId_key" ON "ExternalPayoutCounter"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalReconciliationRunCounter_clinicId_key" ON "ExternalReconciliationRunCounter"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "RegulatoryDocumentCounter_clinicId_key" ON "RegulatoryDocumentCounter"("clinicId");

-- AddForeignKey
ALTER TABLE "PaymentProviderConfiguration" ADD CONSTRAINT "PaymentProviderConfiguration_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_clinicId_branchId_fkey" FOREIGN KEY ("clinicId", "branchId") REFERENCES "ClinicBranch"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_clinicId_invoiceId_fkey" FOREIGN KEY ("clinicId", "invoiceId") REFERENCES "Invoice"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_clinicId_patientId_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES "Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_clinicId_providerConfigId_fkey" FOREIGN KEY ("clinicId", "providerConfigId") REFERENCES "PaymentProviderConfiguration"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_clinicId_initiatedByMembershipId_fkey" FOREIGN KEY ("clinicId", "initiatedByMembershipId") REFERENCES "ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_clinicId_initiatedByPatientAccountId_fkey" FOREIGN KEY ("clinicId", "initiatedByPatientAccountId") REFERENCES "PatientAccount"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_clinicId_postedPaymentId_fkey" FOREIGN KEY ("clinicId", "postedPaymentId") REFERENCES "Payment"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PaymentProviderEvent" ADD CONSTRAINT "PaymentProviderEvent_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PaymentProviderEvent" ADD CONSTRAINT "PaymentProviderEvent_clinicId_providerConfigId_fkey" FOREIGN KEY ("clinicId", "providerConfigId") REFERENCES "PaymentProviderConfiguration"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PaymentProviderEvent" ADD CONSTRAINT "PaymentProviderEvent_clinicId_paymentIntentId_fkey" FOREIGN KEY ("clinicId", "paymentIntentId") REFERENCES "PaymentIntent"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PaymentSettlement" ADD CONSTRAINT "PaymentSettlement_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PaymentSettlement" ADD CONSTRAINT "PaymentSettlement_clinicId_providerConfigId_fkey" FOREIGN KEY ("clinicId", "providerConfigId") REFERENCES "PaymentProviderConfiguration"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ExternalRefund" ADD CONSTRAINT "ExternalRefund_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ExternalRefund" ADD CONSTRAINT "ExternalRefund_clinicId_refundRequestId_fkey" FOREIGN KEY ("clinicId", "refundRequestId") REFERENCES "RefundRequest"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ExternalRefund" ADD CONSTRAINT "ExternalRefund_clinicId_paymentIntentId_fkey" FOREIGN KEY ("clinicId", "paymentIntentId") REFERENCES "PaymentIntent"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ExternalRefund" ADD CONSTRAINT "ExternalRefund_clinicId_paymentReversalId_fkey" FOREIGN KEY ("clinicId", "paymentReversalId") REFERENCES "PaymentReversal"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ExternalRefund" ADD CONSTRAINT "ExternalRefund_clinicId_providerConfigId_fkey" FOREIGN KEY ("clinicId", "providerConfigId") REFERENCES "PaymentProviderConfiguration"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ExternalRefund" ADD CONSTRAINT "ExternalRefund_clinicId_initiatedByMembershipId_fkey" FOREIGN KEY ("clinicId", "initiatedByMembershipId") REFERENCES "ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ExternalPayout" ADD CONSTRAINT "ExternalPayout_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ExternalPayout" ADD CONSTRAINT "ExternalPayout_clinicId_commissionSettlementId_fkey" FOREIGN KEY ("clinicId", "commissionSettlementId") REFERENCES "PractitionerCommissionSettlement"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ExternalPayout" ADD CONSTRAINT "ExternalPayout_clinicId_providerConfigId_fkey" FOREIGN KEY ("clinicId", "providerConfigId") REFERENCES "PaymentProviderConfiguration"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ExternalPayout" ADD CONSTRAINT "ExternalPayout_clinicId_preparedByMembershipId_fkey" FOREIGN KEY ("clinicId", "preparedByMembershipId") REFERENCES "ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ExternalPayout" ADD CONSTRAINT "ExternalPayout_clinicId_approvedByMembershipId_fkey" FOREIGN KEY ("clinicId", "approvedByMembershipId") REFERENCES "ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ExternalReconciliationRun" ADD CONSTRAINT "ExternalReconciliationRun_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ExternalReconciliationRun" ADD CONSTRAINT "ExternalReconciliationRun_clinicId_executedByMembershipId_fkey" FOREIGN KEY ("clinicId", "executedByMembershipId") REFERENCES "ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ExternalReconciliationFinding" ADD CONSTRAINT "ExternalReconciliationFinding_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ExternalReconciliationFinding" ADD CONSTRAINT "ExternalReconciliationFinding_clinicId_runId_fkey" FOREIGN KEY ("clinicId", "runId") REFERENCES "ExternalReconciliationRun"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClinicRegulatoryProfile" ADD CONSTRAINT "ClinicRegulatoryProfile_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RegulatoryDocument" ADD CONSTRAINT "RegulatoryDocument_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RegulatoryDocument" ADD CONSTRAINT "RegulatoryDocument_clinicId_invoiceId_fkey" FOREIGN KEY ("clinicId", "invoiceId") REFERENCES "Invoice"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RegulatoryDocument" ADD CONSTRAINT "RegulatoryDocument_clinicId_createdByMembershipId_fkey" FOREIGN KEY ("clinicId", "createdByMembershipId") REFERENCES "ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RegulatorySubmission" ADD CONSTRAINT "RegulatorySubmission_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RegulatorySubmission" ADD CONSTRAINT "RegulatorySubmission_clinicId_documentId_fkey" FOREIGN KEY ("clinicId", "documentId") REFERENCES "RegulatoryDocument"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RegulatorySubmission" ADD CONSTRAINT "RegulatorySubmission_clinicId_submittedByMembershipId_fkey" FOREIGN KEY ("clinicId", "submittedByMembershipId") REFERENCES "ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RegulatorySubmissionEvent" ADD CONSTRAINT "RegulatorySubmissionEvent_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RegulatorySubmissionEvent" ADD CONSTRAINT "RegulatorySubmissionEvent_clinicId_submissionId_fkey" FOREIGN KEY ("clinicId", "submissionId") REFERENCES "RegulatorySubmission"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ExternalPayoutCounter" ADD CONSTRAINT "ExternalPayoutCounter_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ExternalReconciliationRunCounter" ADD CONSTRAINT "ExternalReconciliationRunCounter_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RegulatoryDocumentCounter" ADD CONSTRAINT "RegulatoryDocumentCounter_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- 1. Security-definer webhook target resolver (no raw clinic GUC bypass)
CREATE OR REPLACE FUNCTION lamssa_security.resolve_payment_webhook_target(
  p_provider_code "PaymentProviderCode",
  p_provider_intent_id text
)
RETURNS TABLE(
  "clinicId" uuid,
  "paymentIntentId" uuid,
  "providerConfigId" uuid,
  "encryptedWebhookSecret" text,
  mode "IntegrationMode",
  "isEnabled" boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pi."clinicId",
    pi.id AS "paymentIntentId",
    ppc.id AS "providerConfigId",
    ppc."encryptedWebhookSecret",
    ppc.mode,
    ppc."isEnabled"
  FROM public."PaymentIntent" pi
  JOIN public."PaymentProviderConfiguration" ppc
    ON ppc."clinicId" = pi."clinicId"
   AND ppc.id = pi."providerConfigId"
  JOIN public."Clinic" c
    ON c.id = pi."clinicId"
  WHERE pi."providerCode" = p_provider_code
    AND pi."providerIntentId" = p_provider_intent_id
    AND ppc."providerCode" = p_provider_code
    AND ppc."isEnabled" = true
    AND c.status = 'ACTIVE'
  LIMIT 2;
END;
$$;

CREATE OR REPLACE FUNCTION lamssa_security.webhook_intent_allows(target_clinic uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public."PaymentIntent" pi
    JOIN public."PaymentProviderConfiguration" ppc
      ON ppc."clinicId" = pi."clinicId" AND ppc.id = pi."providerConfigId"
    JOIN public."Clinic" c ON c.id = target_clinic
    WHERE pi.id = lamssa_security.context_uuid('lamssa.webhook_intent_id')
      AND pi."clinicId" = target_clinic
      AND ppc."isEnabled" = true
      AND c.status = 'ACTIVE'
  );
END;
$$;

CREATE OR REPLACE FUNCTION lamssa_security.portal_invoice_for_payment(
  p_clinic_id uuid,
  p_patient_id uuid,
  p_invoice_id uuid
)
RETURNS TABLE(
  id uuid,
  "branchId" uuid,
  "patientId" uuid,
  currency text,
  "currencyScale" integer,
  status public."InvoiceStatus",
  "totalMinor" bigint,
  "netPaidMinor" bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i."branchId",
    i."patientId",
    i.currency::text,
    i."currencyScale",
    i.status,
    i."totalMinor",
    i."netPaidMinor"
  FROM public."Invoice" i
  WHERE lamssa_security.patient_row_allows(p_clinic_id, p_patient_id)
    AND i."clinicId" = p_clinic_id
    AND i."patientId" = p_patient_id
    AND i.id = p_invoice_id
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION lamssa_security.post_webhook_payment(
  p_clinic_id uuid,
  p_payment_intent_id uuid,
  p_event_id uuid
)
RETURNS TABLE(
  posted boolean,
  "paymentId" uuid,
  reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_intent public."PaymentIntent"%ROWTYPE;
  v_inv public."Invoice"%ROWTYPE;
  v_event public."PaymentProviderEvent"%ROWTYPE;
  v_new_net bigint;
  v_new_status public."InvoiceStatus";
  v_payment_id uuid := gen_random_uuid();
  v_req_key uuid;
  v_req_hash text;
  v_actor_membership uuid;
  v_last_seq integer;
  v_prev_hash text;
  v_audit_id uuid := gen_random_uuid();
  v_now timestamptz := date_trunc('milliseconds', now());
  v_payload text;
  v_event_hash text;
BEGIN
  IF p_clinic_id IS DISTINCT FROM lamssa_security.context_uuid('lamssa.clinic_id')
     OR p_payment_intent_id IS DISTINCT FROM lamssa_security.context_uuid('lamssa.webhook_intent_id') THEN
    RAISE EXCEPTION 'Unauthorized webhook payment context' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_event
  FROM public."PaymentProviderEvent"
  WHERE id = p_event_id
    AND "clinicId" = p_clinic_id
    AND "paymentIntentId" = p_payment_intent_id
    AND "processingStatus" = 'RECEIVED'
    AND "createdAt" >= statement_timestamp() - interval '5 minutes'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or stale webhook event for payment posting' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_intent
  FROM public."PaymentIntent"
  WHERE "clinicId" = p_clinic_id AND id = p_payment_intent_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, 'PAYMENT_INTENT_NOT_FOUND';
    RETURN;
  END IF;

  IF v_intent."postedPaymentId" IS NOT NULL THEN
    RETURN QUERY SELECT true, v_intent."postedPaymentId", NULL::text;
    RETURN;
  END IF;

  SELECT * INTO v_inv
  FROM public."Invoice"
  WHERE "clinicId" = p_clinic_id AND id = v_intent."invoiceId"
  FOR UPDATE;

  v_new_net := v_inv."netPaidMinor" + v_intent."amountMinor";
  IF v_new_net > v_inv."totalMinor" THEN
    RETURN QUERY SELECT false, NULL::uuid, 'OVERPAYMENT_PREVENTED';
    RETURN;
  END IF;

  v_req_key := v_intent.id;
  v_req_hash := encode(sha256(convert_to(
    v_intent."clinicId"::text || ':' || v_intent."invoiceId"::text || ':' || v_intent."amountMinor"::text || ':' || v_intent.currency,
    'UTF8'
  )), 'hex');

  INSERT INTO public."Payment" (
    id, "clinicId", "invoiceId", "amountMinor", currency, "currencyScale", method, "requestKey", "requestHash"
  ) VALUES (
    v_payment_id, p_clinic_id, v_inv.id, v_intent."amountMinor", v_inv.currency, v_inv."currencyScale", 'CARD_MANUAL', v_req_key, v_req_hash
  );

  v_new_status := CASE WHEN v_new_net >= v_inv."totalMinor" THEN 'PAID'::public."InvoiceStatus" ELSE 'PARTIALLY_PAID'::public."InvoiceStatus" END;

  UPDATE public."Invoice"
  SET "netPaidMinor" = v_new_net,
      status = v_new_status,
      version = version + 1,
      "updatedAt" = now()
  WHERE "clinicId" = p_clinic_id AND id = v_inv.id;

  IF v_new_net = v_inv."totalMinor" THEN
    UPDATE public."PatientPackage"
    SET status = 'ACTIVE', "activatedAt" = now()
    WHERE "clinicId" = p_clinic_id
      AND "invoiceId" = v_inv.id
      AND status = 'PENDING_PAYMENT'
      AND "activationPolicy" = 'UPON_FULL_PAYMENT';
  END IF;

  v_actor_membership := v_intent."initiatedByMembershipId";
  IF v_actor_membership IS NULL THEN
    SELECT id INTO v_actor_membership
    FROM public."ClinicMembership"
    WHERE "clinicId" = p_clinic_id AND status = 'ACTIVE' AND role = 'CLINIC_OWNER'
    ORDER BY "createdAt" ASC
    LIMIT 1;
  END IF;

  IF v_actor_membership IS NOT NULL THEN
    SELECT sequence, "eventHash" INTO v_last_seq, v_prev_hash
    FROM public."FinancialAuditEvent"
    WHERE "clinicId" = p_clinic_id
    ORDER BY sequence DESC
    LIMIT 1;

    v_last_seq := COALESCE(v_last_seq, 0) + 1;
    v_prev_hash := COALESCE(v_prev_hash, repeat('0', 64));
    v_payload := json_build_object(
      'action', 'PAYMENT_RECORDED',
      'actorMembershipId', v_actor_membership,
      'at', v_now,
      'clinicId', p_clinic_id,
      'id', v_audit_id,
      'invoiceId', v_inv.id,
      'paymentId', v_payment_id,
      'paymentIntentId', v_intent.id,
      'sequence', v_last_seq,
      'viaWebhookEventId', p_event_id
    )::text;
    v_event_hash := encode(sha256(convert_to(v_prev_hash || E'\n' || v_payload, 'UTF8')), 'hex');

    INSERT INTO public."FinancialAuditEvent" (
      id, "clinicId", "invoiceId", "actorMembershipId", sequence, action, payload, "previousHash", "eventHash", "createdAt"
    ) VALUES (
      v_audit_id, p_clinic_id, v_inv.id, v_actor_membership, v_last_seq, 'PAYMENT_RECORDED', v_payload, v_prev_hash, v_event_hash, v_now
    );
  END IF;

  UPDATE public."PaymentIntent"
  SET status = 'SUCCEEDED',
      "postedPaymentId" = v_payment_id,
      version = version + 1,
      "updatedAt" = now()
  WHERE "clinicId" = p_clinic_id AND id = v_intent.id;

  RETURN QUERY SELECT true, v_payment_id, NULL::text;
END;
$$;

-- 2. Extend context_allows to support verified webhook intent context
CREATE OR REPLACE FUNCTION lamssa_security.context_allows(target_clinic uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT COALESCE(
    target_clinic = lamssa_security.context_uuid('lamssa.clinic_id') AND (
      EXISTS (
        SELECT 1 FROM public."Session" s
        JOIN public."User" u ON u.id = s."userId"
        JOIN public."ClinicMembership" m ON m."userId" = u.id AND m."clinicId" = target_clinic
        JOIN public."Clinic" c ON c.id = m."clinicId"
        WHERE s.id = lamssa_security.context_uuid('lamssa.session_id')
          AND s."userId" = lamssa_security.context_uuid('lamssa.user_id')
          AND s."selectedClinicId" = target_clinic AND s."revokedAt" IS NULL
          AND s."expiresAt" > statement_timestamp()
          AND u.status = 'ACTIVE' AND m.status = 'ACTIVE' AND c.status = 'ACTIVE'
      )
      OR
      EXISTS (
        SELECT 1 FROM public."PatientSession" ps
        JOIN public."PatientAccount" pa ON pa.id = ps."patientAccountId" AND pa."clinicId" = target_clinic
        JOIN public."Patient" p ON p.id = pa."patientId" AND p."clinicId" = target_clinic
        JOIN public."Clinic" c ON c.id = target_clinic
        WHERE ps.id = lamssa_security.context_uuid('lamssa.patient_session_id')
          AND pa.id = lamssa_security.context_uuid('lamssa.patient_account_id')
          AND p.id = lamssa_security.context_uuid('lamssa.patient_id')
          AND ps."clinicId" = target_clinic
          AND ps."revokedAt" IS NULL
          AND ps."expiresAt" > statement_timestamp()
          AND pa.status = 'ACTIVE' AND p.status = 'ACTIVE' AND c.status = 'ACTIVE'
      )
      OR
      lamssa_security.webhook_intent_allows(target_clinic)
    ), false);
$$;

-- 3. Enable and force RLS on all 15 new clinic-owned tables
DO $$
DECLARE
  t text;
  owner_name text := current_user;
  pred text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'PaymentProviderConfiguration',
    'PaymentIntent',
    'PaymentProviderEvent',
    'PaymentSettlement',
    'ExternalRefund',
    'ExternalPayout',
    'ExternalReconciliationRun',
    'ExternalReconciliationFinding',
    'ClinicRegulatoryProfile',
    'RegulatoryDocument',
    'RegulatorySubmission',
    'RegulatorySubmissionEvent',
    'ExternalPayoutCounter',
    'ExternalReconciliationRunCounter',
    'RegulatoryDocumentCounter'
  ]) LOOP
    pred := format('CASE WHEN current_user = %L THEN false ELSE lamssa_security.context_allows("clinicId") END', owner_name);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS maintenance_owner ON public.%I', t);
    EXECUTE format('CREATE POLICY maintenance_owner ON public.%I FOR ALL TO %I USING (true) WITH CHECK (true)', t, owner_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_select ON public.%I', t);
    EXECUTE format('CREATE POLICY tenant_select ON public.%I FOR SELECT USING (%s)', t, pred);
    EXECUTE format('DROP POLICY IF EXISTS tenant_insert ON public.%I', t);
    EXECUTE format('CREATE POLICY tenant_insert ON public.%I FOR INSERT WITH CHECK (%s)', t, pred);
    EXECUTE format('DROP POLICY IF EXISTS tenant_update ON public.%I', t);
    EXECUTE format('CREATE POLICY tenant_update ON public.%I FOR UPDATE USING (%s) WITH CHECK (%s)', t, pred, pred);
    EXECUTE format('DROP POLICY IF EXISTS tenant_delete ON public.%I', t);
    EXECUTE format('CREATE POLICY tenant_delete ON public.%I FOR DELETE USING (false)', t);
    EXECUTE format('DROP TRIGGER IF EXISTS immutable_clinic ON public.%I', t);
    EXECUTE format('CREATE TRIGGER immutable_clinic BEFORE UPDATE OF "clinicId" ON public.%I FOR EACH ROW EXECUTE FUNCTION lamssa_security.reject_clinic_reassignment()', t);
  END LOOP;

  EXECUTE 'DROP POLICY IF EXISTS internal_integration_op ON public."PaymentIntent"';
  EXECUTE 'DROP POLICY IF EXISTS internal_integration_op ON public."PaymentProviderConfiguration"';
  EXECUTE 'DROP POLICY IF EXISTS internal_integration_op_select ON public."Invoice"';
  EXECUTE 'DROP POLICY IF EXISTS internal_integration_op_update ON public."Invoice"';
  EXECUTE 'DROP POLICY IF EXISTS internal_integration_op_insert ON public."Payment"';
  EXECUTE 'DROP POLICY IF EXISTS internal_integration_op_insert ON public."FinancialAuditEvent"';

  EXECUTE format(
    'ALTER POLICY tenant_select ON public."Invoice" USING (CASE WHEN current_user = %L THEN false ELSE lamssa_security.finance_allows("clinicId", false) END)',
    owner_name
  );
  EXECUTE format(
    'ALTER POLICY tenant_update ON public."Invoice" USING (CASE WHEN current_user = %L THEN false ELSE lamssa_security.finance_allows("clinicId", false) END) WITH CHECK (CASE WHEN current_user = %L THEN false ELSE lamssa_security.finance_allows("clinicId", status = ''VOID'') END)',
    owner_name,
    owner_name
  );
  EXECUTE format(
    'ALTER POLICY tenant_insert ON public."Payment" WITH CHECK (CASE WHEN current_user = %L THEN false ELSE lamssa_security.finance_allows("clinicId", false) END)',
    owner_name
  );
  EXECUTE format(
    'ALTER POLICY tenant_select ON public."FinancialAuditEvent" USING (CASE WHEN current_user = %L THEN false ELSE lamssa_security.finance_allows("clinicId", false) END)',
    owner_name
  );
  EXECUTE format(
    'ALTER POLICY tenant_insert ON public."FinancialAuditEvent" WITH CHECK (CASE WHEN current_user = %L THEN false ELSE lamssa_security.finance_allows("clinicId", false) AND EXISTS (SELECT 1 FROM public."ClinicMembership" m WHERE m.id = "FinancialAuditEvent"."actorMembershipId" AND m."clinicId" = "FinancialAuditEvent"."clinicId" AND m."userId" = lamssa_security.context_uuid(''lamssa.user_id'') AND m.status = ''ACTIVE'') END)',
    owner_name
  );
END $$;

-- 4. Immutability triggers for financial & regulatory evidence
CREATE OR REPLACE FUNCTION lamssa_security.reject_immutable_integration_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Financial and regulatory evidence records are immutable once persisted';
END;
$$;

CREATE OR REPLACE FUNCTION lamssa_security.guard_regulatory_document_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."isImmutable" THEN
      RAISE EXCEPTION 'Immutable regulatory documents cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."isImmutable" AND (
    NEW."documentType" IS DISTINCT FROM OLD."documentType" OR
    NEW."documentNumber" IS DISTINCT FROM OLD."documentNumber" OR
    NEW."canonicalHash" IS DISTINCT FROM OLD."canonicalHash" OR
    NEW."payloadJson"::text IS DISTINCT FROM OLD."payloadJson"::text OR
    NEW."invoiceId" IS DISTINCT FROM OLD."invoiceId" OR
    NEW.framework IS DISTINCT FROM OLD.framework OR
    NEW."countryCode" IS DISTINCT FROM OLD."countryCode" OR
    NEW."isImmutable" IS DISTINCT FROM OLD."isImmutable"
  ) THEN
    RAISE EXCEPTION 'Immutable regulatory document content cannot be modified';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION lamssa_security.guard_payment_intent_core()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW."amountMinor" IS DISTINCT FROM OLD."amountMinor" OR
     NEW.currency IS DISTINCT FROM OLD.currency OR
     NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey" OR
     NEW."invoiceId" IS DISTINCT FROM OLD."invoiceId" OR
     NEW."patientId" IS DISTINCT FROM OLD."patientId" OR
     NEW."providerCode" IS DISTINCT FROM OLD."providerCode" OR
     NEW."providerConfigId" IS DISTINCT FROM OLD."providerConfigId" THEN
    RAISE EXCEPTION 'Core PaymentIntent financial fields are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION lamssa_security.guard_provider_event_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW."providerConfigId" IS DISTINCT FROM OLD."providerConfigId" OR
     NEW."providerCode" IS DISTINCT FROM OLD."providerCode" OR
     NEW."providerEventId" IS DISTINCT FROM OLD."providerEventId" OR
     NEW."eventType" IS DISTINCT FROM OLD."eventType" OR
     NEW."rawPayloadHash" IS DISTINCT FROM OLD."rawPayloadHash" OR
     NEW."sanitizedPayload"::text IS DISTINCT FROM OLD."sanitizedPayload"::text OR
     NEW."signatureVerified" IS DISTINCT FROM OLD."signatureVerified" OR
     NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'PaymentProviderEvent raw evidence fields are immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS immutable_payment_settlement ON public."PaymentSettlement";
CREATE TRIGGER immutable_payment_settlement
  BEFORE UPDATE OR DELETE ON public."PaymentSettlement"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.reject_immutable_integration_mutation();

DROP TRIGGER IF EXISTS immutable_regulatory_submission_event ON public."RegulatorySubmissionEvent";
CREATE TRIGGER immutable_regulatory_submission_event
  BEFORE UPDATE OR DELETE ON public."RegulatorySubmissionEvent"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.reject_immutable_integration_mutation();

DROP TRIGGER IF EXISTS immutable_regulatory_document ON public."RegulatoryDocument";
CREATE TRIGGER immutable_regulatory_document
  BEFORE UPDATE OR DELETE ON public."RegulatoryDocument"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.guard_regulatory_document_immutability();

DROP TRIGGER IF EXISTS immutable_payment_intent_core ON public."PaymentIntent";
CREATE TRIGGER immutable_payment_intent_core
  BEFORE UPDATE ON public."PaymentIntent"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.guard_payment_intent_core();

DROP TRIGGER IF EXISTS immutable_provider_event_evidence ON public."PaymentProviderEvent";
CREATE TRIGGER immutable_provider_event_evidence
  BEFORE UPDATE ON public."PaymentProviderEvent"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.guard_provider_event_evidence();

-- 5. Runtime grants
REVOKE ALL ON
  public."PaymentProviderConfiguration",
  public."PaymentIntent",
  public."PaymentProviderEvent",
  public."PaymentSettlement",
  public."ExternalRefund",
  public."ExternalPayout",
  public."ExternalReconciliationRun",
  public."ExternalReconciliationFinding",
  public."ClinicRegulatoryProfile",
  public."RegulatoryDocument",
  public."RegulatorySubmission",
  public."RegulatorySubmissionEvent",
  public."ExternalPayoutCounter",
  public."ExternalReconciliationRunCounter",
  public."RegulatoryDocumentCounter"
FROM PUBLIC;

DO $$
DECLARE r text;
BEGIN
  FOR r IN SELECT DISTINCT grantee FROM information_schema.role_table_grants
           WHERE table_schema = 'public' AND table_name = 'Session' AND privilege_type = 'SELECT' AND grantee NOT IN (current_user, 'PUBLIC') LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r AND (rolsuper OR rolbypassrls)) OR pg_has_role(r, current_user, 'MEMBER') THEN
      RAISE EXCEPTION 'Unsafe runtime role';
    END IF;
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON
      public."PaymentProviderConfiguration",
      public."PaymentIntent",
      public."PaymentProviderEvent",
      public."ExternalRefund",
      public."ExternalPayout",
      public."ExternalReconciliationRun",
      public."ExternalReconciliationFinding",
      public."ClinicRegulatoryProfile",
      public."RegulatoryDocument",
      public."RegulatorySubmission",
      public."ExternalPayoutCounter",
      public."ExternalReconciliationRunCounter",
      public."RegulatoryDocumentCounter"
    TO %I', r);
    EXECUTE format('GRANT SELECT, INSERT ON
      public."PaymentSettlement",
      public."RegulatorySubmissionEvent"
    TO %I', r);
    EXECUTE format('GRANT EXECUTE ON FUNCTION lamssa_security.resolve_payment_webhook_target("PaymentProviderCode", text), lamssa_security.webhook_intent_allows(uuid), lamssa_security.portal_invoice_for_payment(uuid, uuid, uuid), lamssa_security.post_webhook_payment(uuid, uuid, uuid) TO %I', r);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION
  lamssa_security.resolve_payment_webhook_target("PaymentProviderCode", text),
  lamssa_security.webhook_intent_allows(uuid),
  lamssa_security.portal_invoice_for_payment(uuid, uuid, uuid),
  lamssa_security.post_webhook_payment(uuid, uuid, uuid),
  lamssa_security.reject_immutable_integration_mutation(),
  lamssa_security.guard_regulatory_document_immutability(),
  lamssa_security.guard_payment_intent_core(),
  lamssa_security.guard_provider_event_evidence()
FROM PUBLIC;

COMMIT;
