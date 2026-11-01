-- Phase 4 Step 4.4 — Treatment Packages, Prepaid Sessions, Installment Plans, Refunds & Financial Integrity
BEGIN;

-- 1. Enums
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PackageStatus') THEN
    CREATE TYPE public."PackageStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PatientPackageStatus') THEN
    CREATE TYPE public."PatientPackageStatus" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'EXHAUSTED', 'EXPIRED', 'CANCELLED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PackageActivationPolicy') THEN
    CREATE TYPE public."PackageActivationPolicy" AS ENUM ('UPON_INVOICE_ISSUANCE', 'UPON_FULL_PAYMENT', 'MANUAL_OVERRIDE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PackageRedemptionStatus') THEN
    CREATE TYPE public."PackageRedemptionStatus" AS ENUM ('RECORDED', 'REVERSED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InstallmentPlanStatus') THEN
    CREATE TYPE public."InstallmentPlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'OVERDUE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InstallmentScheduleStatus') THEN
    CREATE TYPE public."InstallmentScheduleStatus" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RefundRequestStatus') THEN
    CREATE TYPE public."RefundRequestStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'SETTLED', 'CANCELLED');
  END IF;
END $$;

-- 2. Add composite unique constraint to PaymentReversal if not exists
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PaymentReversal_clinicId_id_key'
  ) THEN
    ALTER TABLE public."PaymentReversal" ADD CONSTRAINT "PaymentReversal_clinicId_id_key" UNIQUE ("clinicId", "id");
  END IF;
END $$;

-- 3. TreatmentPackage
CREATE TABLE public."TreatmentPackage" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "nameAr" VARCHAR(150) NOT NULL,
    "nameEn" VARCHAR(150),
    "description" TEXT,
    "status" public."PackageStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersionId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TreatmentPackage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TreatmentPackage_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "treatment_package_values" CHECK (
        version > 0
        AND length(btrim("code")) >= 2
        AND length(btrim("nameAr")) >= 2
    )
);

CREATE UNIQUE INDEX "TreatmentPackage_clinicId_id_key" ON public."TreatmentPackage"("clinicId", "id");
CREATE UNIQUE INDEX "TreatmentPackage_clinicId_code_key" ON public."TreatmentPackage"("clinicId", "code");
CREATE INDEX "TreatmentPackage_clinicId_status_createdAt_idx" ON public."TreatmentPackage"("clinicId", "status", "createdAt");

-- 4. TreatmentPackageVersion
CREATE TABLE public."TreatmentPackageVersion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "packageId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "nameAr" VARCHAR(150) NOT NULL,
    "nameEn" VARCHAR(150),
    "description" TEXT,
    "terms" TEXT,
    "priceMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "currencyScale" INTEGER NOT NULL,
    "validityDays" INTEGER NOT NULL DEFAULT 365,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMPTZ(3),
    "publishedByMembershipId" UUID,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TreatmentPackageVersion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TreatmentPackageVersion_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "TreatmentPackageVersion_package_fkey" FOREIGN KEY ("clinicId", "packageId") REFERENCES public."TreatmentPackage"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "TreatmentPackageVersion_publishedBy_fkey" FOREIGN KEY ("clinicId", "publishedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "treatment_package_version_values" CHECK (
        "versionNumber" > 0
        AND "priceMinor" >= 0
        AND "currencyScale" >= 0 AND "currencyScale" <= 3
        AND "validityDays" > 0
        AND length(btrim("nameAr")) >= 2
    )
);

CREATE UNIQUE INDEX "TreatmentPackageVersion_clinicId_id_key" ON public."TreatmentPackageVersion"("clinicId", "id");
CREATE UNIQUE INDEX "TreatmentPackageVersion_clinicId_packageId_versionNumber_key" ON public."TreatmentPackageVersion"("clinicId", "packageId", "versionNumber");
CREATE INDEX "TreatmentPackageVersion_clinicId_isPublished_idx" ON public."TreatmentPackageVersion"("clinicId", "isPublished");

-- 5. TreatmentPackageItem
CREATE TABLE public."TreatmentPackageItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "packageVersionId" UUID NOT NULL,
    "procedureId" UUID,
    "serviceName" VARCHAR(120) NOT NULL,
    "sessionQuantity" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "TreatmentPackageItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TreatmentPackageItem_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "TreatmentPackageItem_packageVersion_fkey" FOREIGN KEY ("clinicId", "packageVersionId") REFERENCES public."TreatmentPackageVersion"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "TreatmentPackageItem_procedure_fkey" FOREIGN KEY ("clinicId", "procedureId") REFERENCES public."AestheticProcedureCatalog"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "treatment_package_item_values" CHECK (
        "sessionQuantity" > 0
        AND length(btrim("serviceName")) >= 2
    )
);

CREATE UNIQUE INDEX "TreatmentPackageItem_clinicId_id_key" ON public."TreatmentPackageItem"("clinicId", "id");
CREATE INDEX "TreatmentPackageItem_clinicId_packageVersionId_idx" ON public."TreatmentPackageItem"("clinicId", "packageVersionId");

-- 6. PatientPackage
CREATE TABLE public."PatientPackage" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "packageId" UUID NOT NULL,
    "packageVersionId" UUID NOT NULL,
    "invoiceId" UUID,
    "status" public."PatientPackageStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "activationPolicy" public."PackageActivationPolicy" NOT NULL DEFAULT 'UPON_FULL_PAYMENT',
    "purchasedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3),
    "totalSessions" INTEGER NOT NULL,
    "redeemedSessions" INTEGER NOT NULL DEFAULT 0,
    "remainingSessions" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "requestKey" UUID NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PatientPackage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PatientPackage_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PatientPackage_patient_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PatientPackage_package_fkey" FOREIGN KEY ("clinicId", "packageId") REFERENCES public."TreatmentPackage"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PatientPackage_packageVersion_fkey" FOREIGN KEY ("clinicId", "packageVersionId") REFERENCES public."TreatmentPackageVersion"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PatientPackage_invoice_fkey" FOREIGN KEY ("clinicId", "invoiceId") REFERENCES public."Invoice"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "patient_package_values" CHECK (
        "version" > 0
        AND "totalSessions" > 0
        AND "redeemedSessions" >= 0
        AND "remainingSessions" >= 0
        AND "redeemedSessions" <= "totalSessions"
        AND "remainingSessions" = ("totalSessions" - "redeemedSessions")
    )
);

CREATE UNIQUE INDEX "PatientPackage_clinicId_id_key" ON public."PatientPackage"("clinicId", "id");
CREATE UNIQUE INDEX "PatientPackage_clinicId_requestKey_key" ON public."PatientPackage"("clinicId", "requestKey");
CREATE INDEX "PatientPackage_clinicId_patientId_status_idx" ON public."PatientPackage"("clinicId", "patientId", "status");
CREATE INDEX "PatientPackage_clinicId_status_expiresAt_idx" ON public."PatientPackage"("clinicId", "status", "expiresAt");

-- 7. PatientPackageEntitlement
CREATE TABLE public."PatientPackageEntitlement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "patientPackageId" UUID NOT NULL,
    "packageItemId" UUID,
    "procedureId" UUID,
    "serviceName" VARCHAR(120) NOT NULL,
    "totalSessions" INTEGER NOT NULL,
    "redeemedSessions" INTEGER NOT NULL DEFAULT 0,
    "reservedSessions" INTEGER NOT NULL DEFAULT 0,
    "remainingSessions" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PatientPackageEntitlement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PatientPackageEntitlement_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PatientPackageEntitlement_patientPackage_fkey" FOREIGN KEY ("clinicId", "patientPackageId") REFERENCES public."PatientPackage"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PatientPackageEntitlement_procedure_fkey" FOREIGN KEY ("clinicId", "procedureId") REFERENCES public."AestheticProcedureCatalog"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "patient_package_entitlement_values" CHECK (
        "version" > 0
        AND "totalSessions" > 0
        AND "redeemedSessions" >= 0
        AND "reservedSessions" >= 0
        AND "remainingSessions" >= 0
        AND ("redeemedSessions" + "reservedSessions") <= "totalSessions"
        AND "remainingSessions" = ("totalSessions" - "redeemedSessions" - "reservedSessions")
        AND length(btrim("serviceName")) >= 2
    )
);

CREATE UNIQUE INDEX "PatientPackageEntitlement_clinicId_id_key" ON public."PatientPackageEntitlement"("clinicId", "id");
CREATE INDEX "PatientPackageEntitlement_clinicId_patientPackageId_idx" ON public."PatientPackageEntitlement"("clinicId", "patientPackageId");

-- 8. PackageRedemption
CREATE TABLE public."PackageRedemption" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "patientPackageId" UUID NOT NULL,
    "entitlementId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "procedureExecutionId" UUID,
    "appointmentId" UUID,
    "visitId" UUID,
    "sessionsRedeemed" INTEGER NOT NULL DEFAULT 1,
    "status" public."PackageRedemptionStatus" NOT NULL DEFAULT 'RECORDED',
    "redeemedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redeemedByMembershipId" UUID NOT NULL,
    "requestKey" UUID NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PackageRedemption_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PackageRedemption_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PackageRedemption_patientPackage_fkey" FOREIGN KEY ("clinicId", "patientPackageId") REFERENCES public."PatientPackage"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PackageRedemption_entitlement_fkey" FOREIGN KEY ("clinicId", "entitlementId") REFERENCES public."PatientPackageEntitlement"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PackageRedemption_patient_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PackageRedemption_procedureExecution_fkey" FOREIGN KEY ("clinicId", "procedureExecutionId") REFERENCES public."ProcedureExecution"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PackageRedemption_appointment_fkey" FOREIGN KEY ("clinicId", "appointmentId") REFERENCES public."Appointment"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PackageRedemption_visit_fkey" FOREIGN KEY ("clinicId", "visitId") REFERENCES public."Visit"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PackageRedemption_redeemedBy_fkey" FOREIGN KEY ("clinicId", "redeemedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "package_redemption_values" CHECK (
        "version" > 0
        AND "sessionsRedeemed" > 0
    )
);

CREATE UNIQUE INDEX "PackageRedemption_clinicId_id_key" ON public."PackageRedemption"("clinicId", "id");
CREATE UNIQUE INDEX "PackageRedemption_clinicId_requestKey_key" ON public."PackageRedemption"("clinicId", "requestKey");
CREATE INDEX "PackageRedemption_clinicId_patientPackageId_status_idx" ON public."PackageRedemption"("clinicId", "patientPackageId", "status");
CREATE INDEX "PackageRedemption_clinicId_patientId_redeemedAt_idx" ON public."PackageRedemption"("clinicId", "patientId", "redeemedAt");

-- 9. PackageRedemptionReversal
CREATE TABLE public."PackageRedemptionReversal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "redemptionId" UUID NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "reversedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedByMembershipId" UUID NOT NULL,
    "requestKey" UUID NOT NULL,
    "requestHash" CHAR(64) NOT NULL,

    CONSTRAINT "PackageRedemptionReversal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PackageRedemptionReversal_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PackageRedemptionReversal_redemption_fkey" FOREIGN KEY ("clinicId", "redemptionId") REFERENCES public."PackageRedemption"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PackageRedemptionReversal_reversedBy_fkey" FOREIGN KEY ("clinicId", "reversedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "package_redemption_reversal_values" CHECK (
        length(btrim("reason")) >= 3
    )
);

CREATE UNIQUE INDEX "PackageRedemptionReversal_clinicId_id_key" ON public."PackageRedemptionReversal"("clinicId", "id");
CREATE UNIQUE INDEX "PackageRedemptionReversal_clinicId_requestKey_key" ON public."PackageRedemptionReversal"("clinicId", "requestKey");
CREATE INDEX "PackageRedemptionReversal_clinicId_redemptionId_idx" ON public."PackageRedemptionReversal"("clinicId", "redemptionId");

-- 10. InstallmentPlanCounter
CREATE TABLE public."InstallmentPlanCounter" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InstallmentPlanCounter_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InstallmentPlanCounter_clinicId_key" UNIQUE ("clinicId"),
    CONSTRAINT "InstallmentPlanCounter_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- 11. InstallmentPlan
CREATE TABLE public."InstallmentPlan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "patientPackageId" UUID,
    "planNumber" VARCHAR(50) NOT NULL,
    "totalAmountMinor" BIGINT NOT NULL,
    "paidAmountMinor" BIGINT NOT NULL DEFAULT 0,
    "remainingAmountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "currencyScale" INTEGER NOT NULL,
    "numberOfInstallments" INTEGER NOT NULL,
    "status" public."InstallmentPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "requestKey" UUID NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InstallmentPlan_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InstallmentPlan_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InstallmentPlan_patient_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InstallmentPlan_invoice_fkey" FOREIGN KEY ("clinicId", "invoiceId") REFERENCES public."Invoice"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InstallmentPlan_patientPackage_fkey" FOREIGN KEY ("clinicId", "patientPackageId") REFERENCES public."PatientPackage"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "installment_plan_values" CHECK (
        "version" > 0
        AND "totalAmountMinor" > 0
        AND "paidAmountMinor" >= 0
        AND "remainingAmountMinor" >= 0
        AND "paidAmountMinor" <= "totalAmountMinor"
        AND "remainingAmountMinor" = ("totalAmountMinor" - "paidAmountMinor")
        AND "numberOfInstallments" > 0
        AND "currencyScale" >= 0 AND "currencyScale" <= 3
    )
);

CREATE UNIQUE INDEX "InstallmentPlan_clinicId_id_key" ON public."InstallmentPlan"("clinicId", "id");
CREATE UNIQUE INDEX "InstallmentPlan_clinicId_planNumber_key" ON public."InstallmentPlan"("clinicId", "planNumber");
CREATE UNIQUE INDEX "InstallmentPlan_clinicId_requestKey_key" ON public."InstallmentPlan"("clinicId", "requestKey");
CREATE INDEX "InstallmentPlan_clinicId_patientId_status_idx" ON public."InstallmentPlan"("clinicId", "patientId", "status");
CREATE INDEX "InstallmentPlan_clinicId_invoiceId_idx" ON public."InstallmentPlan"("clinicId", "invoiceId");

-- 12. InstallmentSchedule
CREATE TABLE public."InstallmentSchedule" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "dueDate" TIMESTAMPTZ(3) NOT NULL,
    "expectedAmountMinor" BIGINT NOT NULL,
    "paidAmountMinor" BIGINT NOT NULL DEFAULT 0,
    "status" public."InstallmentScheduleStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "InstallmentSchedule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InstallmentSchedule_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InstallmentSchedule_plan_fkey" FOREIGN KEY ("clinicId", "planId") REFERENCES public."InstallmentPlan"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "installment_schedule_values" CHECK (
        "version" > 0
        AND "installmentNumber" > 0
        AND "expectedAmountMinor" > 0
        AND "paidAmountMinor" >= 0
        AND "paidAmountMinor" <= "expectedAmountMinor"
    )
);

CREATE UNIQUE INDEX "InstallmentSchedule_clinicId_id_key" ON public."InstallmentSchedule"("clinicId", "id");
CREATE UNIQUE INDEX "InstallmentSchedule_clinicId_planId_installmentNumber_key" ON public."InstallmentSchedule"("clinicId", "planId", "installmentNumber");
CREATE INDEX "InstallmentSchedule_clinicId_dueDate_status_idx" ON public."InstallmentSchedule"("clinicId", "dueDate", "status");

-- 13. InstallmentAllocation
CREATE TABLE public."InstallmentAllocation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "scheduleId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "allocatedMinor" BIGINT NOT NULL,
    "allocatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "allocatedByMembershipId" UUID NOT NULL,
    "notes" TEXT,

    CONSTRAINT "InstallmentAllocation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InstallmentAllocation_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InstallmentAllocation_plan_fkey" FOREIGN KEY ("clinicId", "planId") REFERENCES public."InstallmentPlan"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InstallmentAllocation_schedule_fkey" FOREIGN KEY ("clinicId", "scheduleId") REFERENCES public."InstallmentSchedule"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InstallmentAllocation_payment_fkey" FOREIGN KEY ("clinicId", "paymentId") REFERENCES public."Payment"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InstallmentAllocation_allocatedBy_fkey" FOREIGN KEY ("clinicId", "allocatedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "installment_allocation_values" CHECK (
        "allocatedMinor" > 0
    )
);

CREATE UNIQUE INDEX "InstallmentAllocation_clinicId_id_key" ON public."InstallmentAllocation"("clinicId", "id");
CREATE UNIQUE INDEX "InstallmentAllocation_clinicId_scheduleId_paymentId_key" ON public."InstallmentAllocation"("clinicId", "scheduleId", "paymentId");
CREATE INDEX "InstallmentAllocation_clinicId_planId_idx" ON public."InstallmentAllocation"("clinicId", "planId");

-- 14. RefundRequest
CREATE TABLE public."RefundRequest" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "patientPackageId" UUID,
    "requestedAmountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "currencyScale" INTEGER NOT NULL,
    "reason" public."FinancialReason" NOT NULL,
    "reasonDetails" VARCHAR(500) NOT NULL,
    "status" public."RefundRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedByMembershipId" UUID NOT NULL,
    "approvedByMembershipId" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "rejectedByMembershipId" UUID,
    "rejectedAt" TIMESTAMPTZ(3),
    "rejectionReason" VARCHAR(500),
    "settledAt" TIMESTAMPTZ(3),
    "settledByMembershipId" UUID,
    "settlementReference" VARCHAR(100),
    "paymentReversalId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "requestKey" UUID NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RefundRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RefundRequest_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "RefundRequest_invoice_fkey" FOREIGN KEY ("clinicId", "invoiceId") REFERENCES public."Invoice"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "RefundRequest_patient_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "RefundRequest_patientPackage_fkey" FOREIGN KEY ("clinicId", "patientPackageId") REFERENCES public."PatientPackage"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "RefundRequest_reversal_fkey" FOREIGN KEY ("clinicId", "paymentReversalId") REFERENCES public."PaymentReversal"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "RefundRequest_requestedBy_fkey" FOREIGN KEY ("clinicId", "requestedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "RefundRequest_approvedBy_fkey" FOREIGN KEY ("clinicId", "approvedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "RefundRequest_rejectedBy_fkey" FOREIGN KEY ("clinicId", "rejectedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "RefundRequest_settledBy_fkey" FOREIGN KEY ("clinicId", "settledByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "refund_request_values" CHECK (
        "version" > 0
        AND "requestedAmountMinor" > 0
        AND "currencyScale" >= 0 AND "currencyScale" <= 3
        AND length(btrim("reasonDetails")) >= 3
    )
);

CREATE UNIQUE INDEX "RefundRequest_clinicId_id_key" ON public."RefundRequest"("clinicId", "id");
CREATE UNIQUE INDEX "RefundRequest_clinicId_requestKey_key" ON public."RefundRequest"("clinicId", "requestKey");
CREATE INDEX "RefundRequest_clinicId_invoiceId_status_idx" ON public."RefundRequest"("clinicId", "invoiceId", "status");
CREATE INDEX "RefundRequest_clinicId_patientId_status_idx" ON public."RefundRequest"("clinicId", "patientId", "status");

-- 15. Security Triggers
-- 15.1 Published TreatmentPackageVersion immutability guard
CREATE OR REPLACE FUNCTION lamssa_security.package_version_immutability_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF OLD."isPublished" = true THEN
    IF NEW."nameAr" <> OLD."nameAr" OR
       NEW."priceMinor" <> OLD."priceMinor" OR
       NEW."currency" <> OLD."currency" OR
       NEW."validityDays" <> OLD."validityDays" OR
       NEW."versionNumber" <> OLD."versionNumber" OR
       NEW."packageId" <> OLD."packageId" OR
       NEW."clinicId" <> OLD."clinicId" THEN
      RAISE EXCEPTION 'Published treatment package version % cannot be modified', OLD.id
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION lamssa_security.package_version_immutability_guard() FROM PUBLIC;

CREATE TRIGGER trg_package_version_immutability
  BEFORE UPDATE ON public."TreatmentPackageVersion"
  FOR EACH ROW
  EXECUTE FUNCTION lamssa_security.package_version_immutability_guard();

-- 15.2 Block deletion of items belonging to published package versions
CREATE OR REPLACE FUNCTION lamssa_security.package_item_delete_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  is_pub boolean;
BEGIN
  SELECT "isPublished" INTO is_pub FROM public."TreatmentPackageVersion" WHERE id = OLD."packageVersionId";
  IF is_pub = true THEN
    RAISE EXCEPTION 'Cannot delete package items from a published package version'
      USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION lamssa_security.package_item_delete_guard() FROM PUBLIC;

CREATE TRIGGER trg_package_item_delete
  BEFORE DELETE ON public."TreatmentPackageItem"
  FOR EACH ROW
  EXECUTE FUNCTION lamssa_security.package_item_delete_guard();

-- 15.3 Direct SQL / concurrency protection on PatientPackageEntitlement
CREATE OR REPLACE FUNCTION lamssa_security.patient_package_entitlement_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF NEW."remainingSessions" < 0 THEN
    RAISE EXCEPTION 'Remaining package sessions cannot be negative'
      USING ERRCODE = '23514';
  END IF;
  IF NEW."remainingSessions" <> (NEW."totalSessions" - NEW."redeemedSessions" - NEW."reservedSessions") THEN
    RAISE EXCEPTION 'Entitlement remaining sessions does not reconcile with total, redeemed, and reserved counts'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION lamssa_security.patient_package_entitlement_guard() FROM PUBLIC;

CREATE TRIGGER trg_patient_package_entitlement_guard
  BEFORE INSERT OR UPDATE ON public."PatientPackageEntitlement"
  FOR EACH ROW
  EXECUTE FUNCTION lamssa_security.patient_package_entitlement_guard();

-- 16. Enable and Force RLS
DO $$
DECLARE
  t text;
  pred text;
  owner_name text;
BEGIN
 SELECT current_user INTO owner_name;
 FOR t IN SELECT unnest(ARRAY[
   'TreatmentPackage',
   'TreatmentPackageVersion',
   'TreatmentPackageItem',
   'PatientPackage',
   'PatientPackageEntitlement',
   'PackageRedemption',
   'PackageRedemptionReversal',
   'InstallmentPlanCounter',
   'InstallmentPlan',
   'InstallmentSchedule',
   'InstallmentAllocation',
   'RefundRequest'
 ]) LOOP
  pred:=format('CASE WHEN current_user=%L THEN false ELSE lamssa_security.context_allows("clinicId") END',owner_name);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY maintenance_owner ON public.%I FOR ALL TO %I USING (true) WITH CHECK (true)',t,owner_name);
  EXECUTE format('CREATE POLICY tenant_select ON public.%I FOR SELECT USING (%s)',t,pred);
  EXECUTE format('CREATE POLICY tenant_insert ON public.%I FOR INSERT WITH CHECK (%s)',t,pred);
  EXECUTE format('CREATE POLICY tenant_update ON public.%I FOR UPDATE USING (%s) WITH CHECK (%s)',t,pred,pred);
  EXECUTE format('CREATE POLICY tenant_delete ON public.%I FOR DELETE USING (%s)',t,CASE WHEN t = 'TreatmentPackageItem' THEN pred ELSE 'false' END);
 END LOOP;
END $$;

-- 17. Revocations and Grants
REVOKE ALL ON
  public."TreatmentPackage",
  public."TreatmentPackageVersion",
  public."TreatmentPackageItem",
  public."PatientPackage",
  public."PatientPackageEntitlement",
  public."PackageRedemption",
  public."PackageRedemptionReversal",
  public."InstallmentPlanCounter",
  public."InstallmentPlan",
  public."InstallmentSchedule",
  public."InstallmentAllocation",
  public."RefundRequest"
FROM PUBLIC;

REVOKE ALL ON FUNCTION
  lamssa_security.package_version_immutability_guard(),
  lamssa_security.package_item_delete_guard(),
  lamssa_security.patient_package_entitlement_guard()
FROM PUBLIC;

DO $$ DECLARE r text; BEGIN
 FOR r IN SELECT DISTINCT grantee FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='Session' AND privilege_type='SELECT' AND grantee NOT IN(current_user,'PUBLIC') LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r AND (rolsuper OR rolbypassrls)) OR pg_has_role(r,current_user,'MEMBER') THEN RAISE EXCEPTION 'Unsafe runtime role'; END IF;
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public."TreatmentPackage",public."TreatmentPackageVersion",public."TreatmentPackageItem",public."PatientPackage",public."PatientPackageEntitlement",public."PackageRedemption",public."PackageRedemptionReversal",public."InstallmentPlanCounter",public."InstallmentPlan",public."InstallmentSchedule",public."InstallmentAllocation",public."RefundRequest" TO %I',r);
  EXECUTE format('GRANT DELETE ON public."TreatmentPackageItem" TO %I',r);
 END LOOP;
END $$;

-- 18. Comments
COMMENT ON TABLE public."TreatmentPackage" IS 'Clinic-scoped commercial treatment package definition and lifecycle.';
COMMENT ON TABLE public."TreatmentPackageVersion" IS 'Immutable published package versions with session pricing and validity days.';
COMMENT ON TABLE public."TreatmentPackageItem" IS 'Service items and session quantities composing a package version.';
COMMENT ON TABLE public."PatientPackage" IS 'Purchased patient package with activation policy and aggregate session tracking.';
COMMENT ON TABLE public."PatientPackageEntitlement" IS 'Granular session entitlement balances per service/procedure item in a patient package.';
COMMENT ON TABLE public."PackageRedemption" IS 'Session redemption against patient package entitlement linked to clinical or appointment execution.';
COMMENT ON TABLE public."PackageRedemptionReversal" IS 'Controlled reversal of a package session redemption restoring remaining balance.';
COMMENT ON TABLE public."InstallmentPlan" IS 'Payment installment arrangements linked to invoices or package purchases.';
COMMENT ON TABLE public."InstallmentSchedule" IS 'Scheduled installment due dates and expected minor currency amounts.';
COMMENT ON TABLE public."InstallmentAllocation" IS 'Deterministic application of recorded payments against installment schedules.';
COMMENT ON TABLE public."RefundRequest" IS 'Multi-stage refund request, approval, rejection, and settlement tracking.';

COMMIT;
