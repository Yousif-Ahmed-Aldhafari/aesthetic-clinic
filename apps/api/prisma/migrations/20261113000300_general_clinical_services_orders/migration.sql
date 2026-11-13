-- Migration: 20261113000300_general_clinical_services_orders
-- Phase 6, Step 6.4: General Clinical Services, Diagnostic Orders, Results & Secure Medical Documents

-- 1. Create Enums
DO $$ BEGIN
  CREATE TYPE "ClinicalServiceCategory" AS ENUM (
    'GENERAL_CONSULTATION',
    'SPECIALIST_CONSULTATION',
    'FOLLOW_UP_CONSULTATION',
    'LABORATORY_TEST',
    'DIAGNOSTIC_IMAGING',
    'REFERRAL',
    'MINOR_PROCEDURE',
    'OTHER_OUTPATIENT_SERVICE'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ClinicalOrderType" AS ENUM (
    'LABORATORY',
    'IMAGING',
    'REFERRAL',
    'OTHER_DIAGNOSTIC'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ClinicalOrderStatus" AS ENUM (
    'DRAFT',
    'REQUESTED',
    'ACCEPTED',
    'IN_PROGRESS',
    'COMPLETED',
    'REVIEWED',
    'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "OrderPriority" AS ENUM (
    'ROUTINE',
    'URGENT',
    'STAT'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DiagnosticResultStatus" AS ENUM (
    'DRAFT',
    'PRELIMINARY',
    'FINAL',
    'CORRECTED',
    'CANCELLED',
    'ENTERED_IN_ERROR'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ClinicalDocumentType" AS ENUM (
    'LAB_REPORT',
    'IMAGING_REPORT',
    'REFERRAL_LETTER',
    'EXTERNAL_RECORD',
    'DISCHARGE_SUMMARY',
    'OTHER_CLINICAL'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Create Tables

-- 2.1 GeneralClinicalService
CREATE TABLE IF NOT EXISTS public."GeneralClinicalService" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "serviceCode" VARCHAR(64) NOT NULL,
  "nameAr" VARCHAR(150) NOT NULL,
  "nameEn" VARCHAR(150),
  "description" VARCHAR(2000),
  "category" "ClinicalServiceCategory" NOT NULL,
  "specialtyId" UUID,
  "branchId" UUID,
  "defaultDurationMinutes" INTEGER NOT NULL DEFAULT 30,
  "requiredPrivilege" VARCHAR(64),
  "basePriceMinor" BIGINT NOT NULL DEFAULT 0,
  "clinicServiceId" UUID,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GeneralClinicalService_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GeneralClinicalService_clinicId_id_key" UNIQUE ("clinicId", "id"),
  CONSTRAINT "GeneralClinicalService_clinicId_serviceCode_key" UNIQUE ("clinicId", "serviceCode")
);

-- 2.2 ClinicOrderCounter
CREATE TABLE IF NOT EXISTS public."ClinicOrderCounter" (
  "clinicId" UUID NOT NULL,
  "nextValue" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClinicOrderCounter_pkey" PRIMARY KEY ("clinicId")
);

-- 2.3 ClinicalOrder
CREATE TABLE IF NOT EXISTS public."ClinicalOrder" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "orderNumber" VARCHAR(32) NOT NULL,
  "patientId" UUID NOT NULL,
  "encounterId" UUID,
  "orderingDoctorMembershipId" UUID NOT NULL,
  "specialtyId" UUID,
  "branchId" UUID,
  "orderType" "ClinicalOrderType" NOT NULL,
  "generalClinicalServiceId" UUID,
  "clinicalIndication" VARCHAR(2000),
  "priority" "OrderPriority" NOT NULL DEFAULT 'ROUTINE',
  "status" "ClinicalOrderStatus" NOT NULL DEFAULT 'REQUESTED',
  "notes" VARCHAR(2000),
  "cancellationReason" VARCHAR(500),
  "cancelledByMembershipId" UUID,
  "cancelledAt" TIMESTAMPTZ(3),
  "completedAt" TIMESTAMPTZ(3),
  "reviewedByMembershipId" UUID,
  "reviewedAt" TIMESTAMPTZ(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClinicalOrder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClinicalOrder_clinicId_id_key" UNIQUE ("clinicId", "id"),
  CONSTRAINT "ClinicalOrder_clinicId_orderNumber_key" UNIQUE ("clinicId", "orderNumber")
);

-- 2.4 ClinicalOrderResult
CREATE TABLE IF NOT EXISTS public."ClinicalOrderResult" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "resultType" "ClinicalOrderType" NOT NULL,
  "status" "DiagnosticResultStatus" NOT NULL DEFAULT 'FINAL',
  "sourceOrganization" VARCHAR(150),
  "performedAt" TIMESTAMPTZ(3),
  "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recordedByMembershipId" UUID NOT NULL,
  "verifiedByMembershipId" UUID,
  "verifiedAt" TIMESTAMPTZ(3),
  "narrativeFindings" TEXT,
  "impression" TEXT,
  "structuredData" JSONB,
  "isCritical" BOOLEAN NOT NULL DEFAULT false,
  "criticalNotes" VARCHAR(1000),
  "criticalAcknowledgedByMembershipId" UUID,
  "criticalAcknowledgedAt" TIMESTAMPTZ(3),
  "correctionReason" VARCHAR(500),
  "correctedResultId" UUID,
  "isReleasedToPatient" BOOLEAN NOT NULL DEFAULT false,
  "releasedAt" TIMESTAMPTZ(3),
  "releasedByMembershipId" UUID,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClinicalOrderResult_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClinicalOrderResult_clinicId_id_key" UNIQUE ("clinicId", "id")
);

-- 2.5 ClinicalDocument
CREATE TABLE IF NOT EXISTS public."ClinicalDocument" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "encounterId" UUID,
  "orderId" UUID,
  "resultId" UUID,
  "documentType" "ClinicalDocumentType" NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "fileName" VARCHAR(255) NOT NULL,
  "mimeType" VARCHAR(100) NOT NULL,
  "fileSizeBytes" BIGINT NOT NULL,
  "storageKey" VARCHAR(500) NOT NULL,
  "contentSha256" VARCHAR(64) NOT NULL,
  "encryptionIv" VARCHAR(32) NOT NULL,
  "encryptionTag" VARCHAR(32) NOT NULL,
  "isQuarantined" BOOLEAN NOT NULL DEFAULT false,
  "quarantineReason" VARCHAR(500),
  "uploadedByMembershipId" UUID NOT NULL,
  "isConfidential" BOOLEAN NOT NULL DEFAULT false,
  "isLegalHold" BOOLEAN NOT NULL DEFAULT false,
  "legalHoldReason" VARCHAR(500),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClinicalDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClinicalDocument_clinicId_id_key" UNIQUE ("clinicId", "id")
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS "GeneralClinicalService_clinicId_isActive_category_idx"
  ON public."GeneralClinicalService"("clinicId", "isActive", "category");
CREATE INDEX IF NOT EXISTS "GeneralClinicalService_clinicId_specialtyId_idx"
  ON public."GeneralClinicalService"("clinicId", "specialtyId");

CREATE INDEX IF NOT EXISTS "ClinicalOrder_clinicId_patientId_status_idx"
  ON public."ClinicalOrder"("clinicId", "patientId", "status");
CREATE INDEX IF NOT EXISTS "ClinicalOrder_clinicId_orderType_status_idx"
  ON public."ClinicalOrder"("clinicId", "orderType", "status");
CREATE INDEX IF NOT EXISTS "ClinicalOrder_clinicId_encounterId_idx"
  ON public."ClinicalOrder"("clinicId", "encounterId");

CREATE INDEX IF NOT EXISTS "ClinicalOrderResult_clinicId_orderId_idx"
  ON public."ClinicalOrderResult"("clinicId", "orderId");
CREATE INDEX IF NOT EXISTS "ClinicalOrderResult_clinicId_patientId_status_idx"
  ON public."ClinicalOrderResult"("clinicId", "patientId", "status");
CREATE INDEX IF NOT EXISTS "ClinicalOrderResult_clinicId_isCritical_criticalAcknowledgedAt_idx"
  ON public."ClinicalOrderResult"("clinicId", "isCritical", "criticalAcknowledgedAt");

CREATE INDEX IF NOT EXISTS "ClinicalDocument_clinicId_patientId_documentType_idx"
  ON public."ClinicalDocument"("clinicId", "patientId", "documentType");
CREATE INDEX IF NOT EXISTS "ClinicalDocument_clinicId_orderId_idx"
  ON public."ClinicalDocument"("clinicId", "orderId");
CREATE INDEX IF NOT EXISTS "ClinicalDocument_clinicId_resultId_idx"
  ON public."ClinicalDocument"("clinicId", "resultId");

-- 4. Foreign Key Constraints
DO $$ BEGIN
  ALTER TABLE public."GeneralClinicalService" ADD CONSTRAINT "GeneralClinicalService_clinic_fkey"
    FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."GeneralClinicalService" ADD CONSTRAINT "GeneralClinicalService_specialty_fkey"
    FOREIGN KEY ("specialtyId") REFERENCES public."MedicalSpecialty"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."GeneralClinicalService" ADD CONSTRAINT "GeneralClinicalService_branch_fkey"
    FOREIGN KEY ("clinicId", "branchId") REFERENCES public."ClinicBranch"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."GeneralClinicalService" ADD CONSTRAINT "GeneralClinicalService_clinicService_fkey"
    FOREIGN KEY ("clinicId", "clinicServiceId") REFERENCES public."ClinicService"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."ClinicOrderCounter" ADD CONSTRAINT "ClinicOrderCounter_clinic_fkey"
    FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."ClinicalOrder" ADD CONSTRAINT "ClinicalOrder_clinic_fkey"
    FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."ClinicalOrder" ADD CONSTRAINT "ClinicalOrder_patient_fkey"
    FOREIGN KEY ("clinicId", "patientId") REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."ClinicalOrder" ADD CONSTRAINT "ClinicalOrder_encounter_fkey"
    FOREIGN KEY ("clinicId", "encounterId") REFERENCES public."ClinicalEncounter"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."ClinicalOrder" ADD CONSTRAINT "ClinicalOrder_orderingDoctor_fkey"
    FOREIGN KEY ("clinicId", "orderingDoctorMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."ClinicalOrder" ADD CONSTRAINT "ClinicalOrder_specialty_fkey"
    FOREIGN KEY ("specialtyId") REFERENCES public."MedicalSpecialty"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."ClinicalOrder" ADD CONSTRAINT "ClinicalOrder_branch_fkey"
    FOREIGN KEY ("clinicId", "branchId") REFERENCES public."ClinicBranch"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."ClinicalOrder" ADD CONSTRAINT "ClinicalOrder_service_fkey"
    FOREIGN KEY ("clinicId", "generalClinicalServiceId") REFERENCES public."GeneralClinicalService"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."ClinicalOrderResult" ADD CONSTRAINT "ClinicalOrderResult_clinic_fkey"
    FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."ClinicalOrderResult" ADD CONSTRAINT "ClinicalOrderResult_order_fkey"
    FOREIGN KEY ("clinicId", "orderId") REFERENCES public."ClinicalOrder"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."ClinicalOrderResult" ADD CONSTRAINT "ClinicalOrderResult_patient_fkey"
    FOREIGN KEY ("clinicId", "patientId") REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."ClinicalOrderResult" ADD CONSTRAINT "ClinicalOrderResult_recorder_fkey"
    FOREIGN KEY ("clinicId", "recordedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."ClinicalOrderResult" ADD CONSTRAINT "ClinicalOrderResult_verifier_fkey"
    FOREIGN KEY ("clinicId", "verifiedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."ClinicalDocument" ADD CONSTRAINT "ClinicalDocument_clinic_fkey"
    FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."ClinicalDocument" ADD CONSTRAINT "ClinicalDocument_patient_fkey"
    FOREIGN KEY ("clinicId", "patientId") REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."ClinicalDocument" ADD CONSTRAINT "ClinicalDocument_encounter_fkey"
    FOREIGN KEY ("clinicId", "encounterId") REFERENCES public."ClinicalEncounter"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."ClinicalDocument" ADD CONSTRAINT "ClinicalDocument_order_fkey"
    FOREIGN KEY ("clinicId", "orderId") REFERENCES public."ClinicalOrder"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."ClinicalDocument" ADD CONSTRAINT "ClinicalDocument_result_fkey"
    FOREIGN KEY ("clinicId", "resultId") REFERENCES public."ClinicalOrderResult"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."ClinicalDocument" ADD CONSTRAINT "ClinicalDocument_uploader_fkey"
    FOREIGN KEY ("clinicId", "uploadedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. Row Level Security & Isolation Policies
DO $$ DECLARE t text; owner_name text:=current_user; pred text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'GeneralClinicalService',
    'ClinicOrderCounter',
    'ClinicalOrder',
    'ClinicalOrderResult',
    'ClinicalDocument'
  ] LOOP
    pred:=format('CASE WHEN current_user=%L THEN false ELSE lamssa_security.context_allows("clinicId") END', owner_name);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS maintenance_owner ON public.%I', t);
    EXECUTE format('CREATE POLICY maintenance_owner ON public.%I FOR ALL TO %I USING (true) WITH CHECK (true)', t, owner_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_select ON public.%I', t);
    EXECUTE format('CREATE POLICY tenant_select ON public.%I FOR SELECT USING (%s)', t, pred);
    EXECUTE format('DROP POLICY IF EXISTS tenant_insert ON public.%I', t);
    EXECUTE format('CREATE POLICY tenant_insert ON public.%I FOR INSERT WITH CHECK (%s)', t, pred);
    EXECUTE format('DROP POLICY IF EXISTS tenant_update ON public.%I', t);
    EXECUTE format('CREATE POLICY tenant_update ON public.%I FOR UPDATE USING (%s) WITH CHECK (%s)', t, pred, pred);
    EXECUTE format('DROP POLICY IF EXISTS tenant_delete ON public.%I', t);
    IF t = 'GeneralClinicalService' THEN
      EXECUTE format('CREATE POLICY tenant_delete ON public.%I FOR DELETE USING (%s)', t, pred);
    ELSE
      EXECUTE format('CREATE POLICY tenant_delete ON public.%I FOR DELETE USING (false)', t);
    END IF;
  END LOOP;
END $$;

-- 6. Immutability Triggers on clinicId
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'GeneralClinicalService',
    'ClinicOrderCounter',
    'ClinicalOrder',
    'ClinicalOrderResult',
    'ClinicalDocument'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS immutable_clinic ON public.%I', t);
    EXECUTE format('CREATE TRIGGER immutable_clinic BEFORE UPDATE OF "clinicId" ON public.%I FOR EACH ROW EXECUTE FUNCTION lamssa_security.reject_clinic_reassignment()', t);
  END LOOP;
END $$;

-- 7. Specific Security Guard Triggers (SECURITY INVOKER with search_path = pg_catalog, pg_temp)

-- 7.1 ClinicalOrder Guard
CREATE OR REPLACE FUNCTION lamssa_security.clinical_order_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD."status" IN ('COMPLETED', 'CANCELLED') THEN
      IF NEW."status" <> OLD."status" THEN
        RAISE EXCEPTION 'Completed or cancelled clinical orders cannot change status';
      END IF;
      IF NEW."patientId" <> OLD."patientId" OR
         NEW."orderType" <> OLD."orderType" OR
         NEW."orderNumber" <> OLD."orderNumber" OR
         NEW."orderingDoctorMembershipId" <> OLD."orderingDoctorMembershipId" THEN
        RAISE EXCEPTION 'Core metadata on completed or cancelled clinical orders is immutable';
      END IF;
    END IF;
    IF NEW."status" = 'CANCELLED' AND (NEW."cancellationReason" IS NULL OR trim(NEW."cancellationReason") = '') THEN
      RAISE EXCEPTION 'Cancellation reason is mandatory when cancelling a clinical order';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION lamssa_security.clinical_order_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_clinical_order_guard ON public."ClinicalOrder";
CREATE TRIGGER trg_clinical_order_guard BEFORE UPDATE ON public."ClinicalOrder"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.clinical_order_guard();

-- 7.2 ClinicalOrderResult Guard
CREATE OR REPLACE FUNCTION lamssa_security.clinical_order_result_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD."status" IN ('FINAL', 'CORRECTED') THEN
      IF NEW."status" NOT IN ('CORRECTED', 'ENTERED_IN_ERROR') THEN
        IF NEW."narrativeFindings" IS DISTINCT FROM OLD."narrativeFindings" OR
           NEW."impression" IS DISTINCT FROM OLD."impression" OR
           NEW."structuredData" IS DISTINCT FROM OLD."structuredData" THEN
          RAISE EXCEPTION 'Verified final diagnostic results cannot be overwritten directly; mark as corrected with reason';
        END IF;
      END IF;
      IF NEW."status" = 'CORRECTED' AND (NEW."correctionReason" IS NULL OR trim(NEW."correctionReason") = '') THEN
        RAISE EXCEPTION 'Correction reason is required when issuing a corrected diagnostic result';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION lamssa_security.clinical_order_result_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_clinical_order_result_guard ON public."ClinicalOrderResult";
CREATE TRIGGER trg_clinical_order_result_guard BEFORE UPDATE ON public."ClinicalOrderResult"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.clinical_order_result_guard();

-- 7.3 ClinicalDocument Guard
CREATE OR REPLACE FUNCTION lamssa_security.clinical_document_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD."isLegalHold" = true AND NEW."isLegalHold" = false THEN
      -- Legal hold release allowed with audit
      NULL;
    ELSIF OLD."isLegalHold" = true THEN
      RAISE EXCEPTION 'Clinical document is under active legal hold and cannot be modified';
    END IF;
    IF NEW."storageKey" <> OLD."storageKey" OR
       NEW."contentSha256" <> OLD."contentSha256" OR
       NEW."patientId" <> OLD."patientId" OR
       NEW."encryptionIv" <> OLD."encryptionIv" OR
       NEW."encryptionTag" <> OLD."encryptionTag" THEN
      RAISE EXCEPTION 'Encrypted storage metadata and payload hashes on clinical documents are immutable';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD."isLegalHold" = true THEN
      RAISE EXCEPTION 'Clinical document is under active legal hold and cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION lamssa_security.clinical_document_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_clinical_document_guard ON public."ClinicalDocument";
CREATE TRIGGER trg_clinical_document_guard BEFORE UPDATE OR DELETE ON public."ClinicalDocument"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.clinical_document_guard();

-- 8. Idempotent Seed of Standard Outpatient General Clinical Services for Active Clinics
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN SELECT "id" FROM public."Clinic" WHERE "status" = 'ACTIVE' LOOP
    -- General Consultation
    INSERT INTO public."GeneralClinicalService" (
      "id", "clinicId", "serviceCode", "nameAr", "nameEn", "description",
      "category", "defaultDurationMinutes", "requiredPrivilege", "basePriceMinor", "isActive", "version"
    ) VALUES (
      gen_random_uuid(), c."id", 'GEN-CONSULT-01', 'استشارة طبية عامة', 'General Medical Consultation',
      'فحص سريري واستشارة شاملة لتقييم الحالة الصحية العامة وتحديد الخطة العلاجية',
      'GENERAL_CONSULTATION', 30, 'CLINICAL_ENCOUNTER_DOCUMENT', 15000, true, 1
    ) ON CONFLICT ("clinicId", "serviceCode") DO NOTHING;

    -- Follow-Up Consultation
    INSERT INTO public."GeneralClinicalService" (
      "id", "clinicId", "serviceCode", "nameAr", "nameEn", "description",
      "category", "defaultDurationMinutes", "requiredPrivilege", "basePriceMinor", "isActive", "version"
    ) VALUES (
      gen_random_uuid(), c."id", 'GEN-FOLLOW-01', 'متابعة استشارة عامة', 'General Consultation Follow-Up',
      'متابعة سريرية لمراجعة نتائج الفحوصات واستجابة المريض للعلاج المقرر',
      'FOLLOW_UP_CONSULTATION', 15, 'CLINICAL_ENCOUNTER_DOCUMENT', 8000, true, 1
    ) ON CONFLICT ("clinicId", "serviceCode") DO NOTHING;

    -- CBC Lab Test
    INSERT INTO public."GeneralClinicalService" (
      "id", "clinicId", "serviceCode", "nameAr", "nameEn", "description",
      "category", "defaultDurationMinutes", "requiredPrivilege", "basePriceMinor", "isActive", "version"
    ) VALUES (
      gen_random_uuid(), c."id", 'LAB-CBC-01', 'تحليل صورة الدم الكاملة (CBC)', 'Complete Blood Count (CBC)',
      'فحص شامل لخلايا الدم الحمراء والبيضاء والصفائح الدموية والهيموجلوبين',
      'LABORATORY_TEST', 10, 'DIAGNOSTIC_LAB_ORDER', 5000, true, 1
    ) ON CONFLICT ("clinicId", "serviceCode") DO NOTHING;

    -- Fasting Blood Sugar Lab Test
    INSERT INTO public."GeneralClinicalService" (
      "id", "clinicId", "serviceCode", "nameAr", "nameEn", "description",
      "category", "defaultDurationMinutes", "requiredPrivilege", "basePriceMinor", "isActive", "version"
    ) VALUES (
      gen_random_uuid(), c."id", 'LAB-GLUCOSE-01', 'فحص سكر الدم الصائم (FBS)', 'Fasting Blood Sugar (FBS)',
      'قياس تركيز الجلوكوز في مصل الدم بعد الصيام لتقييم داء السكري',
      'LABORATORY_TEST', 10, 'DIAGNOSTIC_LAB_ORDER', 3000, true, 1
    ) ON CONFLICT ("clinicId", "serviceCode") DO NOTHING;

    -- Chest X-Ray Imaging
    INSERT INTO public."GeneralClinicalService" (
      "id", "clinicId", "serviceCode", "nameAr", "nameEn", "description",
      "category", "defaultDurationMinutes", "requiredPrivilege", "basePriceMinor", "isActive", "version"
    ) VALUES (
      gen_random_uuid(), c."id", 'IMG-CHEST-XR', 'أشعة سينية للصدر (Chest X-Ray)', 'Chest X-Ray (PA/Lateral)',
      'تصوير إشعاعي للصدر لتقييم الرئتين والقلب والقفص الصدري',
      'DIAGNOSTIC_IMAGING', 15, 'DIAGNOSTIC_IMAGING_ORDER', 12000, true, 1
    ) ON CONFLICT ("clinicId", "serviceCode") DO NOTHING;

    -- Specialist Referral
    INSERT INTO public."GeneralClinicalService" (
      "id", "clinicId", "serviceCode", "nameAr", "nameEn", "description",
      "category", "defaultDurationMinutes", "requiredPrivilege", "basePriceMinor", "isActive", "version"
    ) VALUES (
      gen_random_uuid(), c."id", 'REF-SPECIALIST', 'طلب إحالة استشارية', 'Specialist Referral Consultation',
      'طلب إحالة المريض إلى طبيب أخصائي أو استشاري لتقييم تخصصي متقدم',
      'REFERRAL', 15, 'CLINICAL_ENCOUNTER_DOCUMENT', 0, true, 1
    ) ON CONFLICT ("clinicId", "serviceCode") DO NOTHING;
  END LOOP;
END $$;
