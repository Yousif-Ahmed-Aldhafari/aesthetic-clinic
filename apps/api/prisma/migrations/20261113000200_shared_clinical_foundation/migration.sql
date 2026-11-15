-- Migration: 20261113000200_shared_clinical_foundation
-- Phase 6, Step 6.3: Shared Clinical Data Foundation
-- Scope: Observations & Vitals, Diagnoses & Problems, Allergies & Reactions, Medication Records, Prescriptions & Items

-- 1. Create Enums
DO $$ BEGIN
  CREATE TYPE "ObservationType" AS ENUM (
    'BLOOD_PRESSURE_SYSTOLIC',
    'BLOOD_PRESSURE_DIASTOLIC',
    'HEART_RATE',
    'RESPIRATORY_RATE',
    'BODY_TEMPERATURE',
    'OXYGEN_SATURATION',
    'WEIGHT',
    'HEIGHT',
    'BODY_MASS_INDEX',
    'GENERAL_OBSERVATION'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ObservationStatus" AS ENUM (
    'RECORDED',
    'VERIFIED',
    'AMENDED',
    'ENTERED_IN_ERROR'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ClinicalProvenance" AS ENUM (
    'CLINICIAN_MEASURED',
    'PATIENT_REPORTED',
    'DEVICE_RECORDED',
    'HISTORICAL_TRANSCRIPTION'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DiagnosisRole" AS ENUM (
    'PRIMARY',
    'SECONDARY',
    'DIFFERENTIAL',
    'ADMISSION',
    'DISCHARGE'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DiagnosisClinicalStatus" AS ENUM (
    'PROVISIONAL',
    'CONFIRMED',
    'RESOLVED',
    'REFUTED',
    'ENTERED_IN_ERROR'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DiagnosisVerificationStatus" AS ENUM (
    'SUSPECTED',
    'PROBABLE',
    'CONFIRMED',
    'REFUTED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ProblemListStatus" AS ENUM (
    'ACTIVE',
    'INACTIVE',
    'RESOLVED',
    'REMITTED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AllergyStatusType" AS ENUM (
    'ALLERGY_PRESENT',
    'NO_KNOWN_ALLERGIES',
    'STATUS_UNCONFIRMED_UNKNOWN'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AllergenCategory" AS ENUM (
    'MEDICATION',
    'FOOD',
    'ENVIRONMENTAL',
    'BIOLOGICAL',
    'LATEX',
    'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AllergySeverity" AS ENUM (
    'MILD',
    'MODERATE',
    'SEVERE',
    'LIFE_THREATENING',
    'UNKNOWN'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AllergyClinicalStatus" AS ENUM (
    'ACTIVE',
    'INACTIVE',
    'RESOLVED',
    'ENTERED_IN_ERROR'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AllergyVerificationStatus" AS ENUM (
    'SUSPECTED',
    'PATIENT_REPORTED',
    'CLINICIAN_CONFIRMED',
    'REFUTED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "MedicationRecordStatus" AS ENUM (
    'ACTIVE',
    'PAUSED',
    'DISCONTINUED',
    'COMPLETED',
    'ENTERED_IN_ERROR'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PrescriptionStatus" AS ENUM (
    'DRAFT',
    'PENDING_REVIEW',
    'SIGNED',
    'CANCELLED',
    'SUPERSEDED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Create Tables

-- 2.1 ClinicalObservation
CREATE TABLE IF NOT EXISTS public."ClinicalObservation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "encounterId" UUID,
  "authorMembershipId" UUID NOT NULL,
  "observationType" "ObservationType" NOT NULL,
  "numericValue" NUMERIC(10, 4),
  "textValue" TEXT,
  "unit" VARCHAR(32) NOT NULL,
  "measuredAt" TIMESTAMPTZ(3) NOT NULL,
  "status" "ObservationStatus" NOT NULL DEFAULT 'RECORDED',
  "provenance" "ClinicalProvenance" NOT NULL DEFAULT 'CLINICIAN_MEASURED',
  "bodySite" VARCHAR(100),
  "method" VARCHAR(100),
  "interpretation" VARCHAR(255),
  "amendmentReason" TEXT,
  "supersededById" UUID,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClinicalObservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClinicalObservation_clinic_id_key" UNIQUE ("clinicId", "id")
);

-- 2.2 EncounterDiagnosis
CREATE TABLE IF NOT EXISTS public."EncounterDiagnosis" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "encounterId" UUID NOT NULL,
  "authorMembershipId" UUID NOT NULL,
  "confirmedByMembershipId" UUID,
  "diagnosisRole" "DiagnosisRole" NOT NULL DEFAULT 'PRIMARY',
  "clinicalStatus" "DiagnosisClinicalStatus" NOT NULL DEFAULT 'PROVISIONAL',
  "verificationStatus" "DiagnosisVerificationStatus" NOT NULL DEFAULT 'SUSPECTED',
  "isProblem" BOOLEAN NOT NULL DEFAULT false,
  "problemStatus" "ProblemListStatus",
  "codingSystem" VARCHAR(64) NOT NULL,
  "codingSystemVersion" VARCHAR(32),
  "code" VARCHAR(64) NOT NULL,
  "displayAr" VARCHAR(255) NOT NULL,
  "displayEn" VARCHAR(255),
  "clinicalNarrative" TEXT,
  "onsetDate" TIMESTAMPTZ(3),
  "resolutionDate" TIMESTAMPTZ(3),
  "amendmentReason" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EncounterDiagnosis_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EncounterDiagnosis_clinic_id_key" UNIQUE ("clinicId", "id")
);

-- 2.3 PatientAllergy
CREATE TABLE IF NOT EXISTS public."PatientAllergy" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "encounterId" UUID,
  "recordedByMembershipId" UUID NOT NULL,
  "verifiedByMembershipId" UUID,
  "allergyStatusType" "AllergyStatusType" NOT NULL DEFAULT 'ALLERGY_PRESENT',
  "category" "AllergenCategory" NOT NULL DEFAULT 'MEDICATION',
  "substance" VARCHAR(255) NOT NULL,
  "substanceCode" VARCHAR(64),
  "codingSystem" VARCHAR(64),
  "reaction" VARCHAR(500),
  "severity" "AllergySeverity" NOT NULL DEFAULT 'UNKNOWN',
  "clinicalStatus" "AllergyClinicalStatus" NOT NULL DEFAULT 'ACTIVE',
  "verificationStatus" "AllergyVerificationStatus" NOT NULL DEFAULT 'PATIENT_REPORTED',
  "onsetDate" TIMESTAMPTZ(3),
  "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verifiedAt" TIMESTAMPTZ(3),
  "notes" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatientAllergy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PatientAllergy_clinic_id_key" UNIQUE ("clinicId", "id")
);

-- 2.4 MedicationRecord
CREATE TABLE IF NOT EXISTS public."MedicationRecord" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "encounterId" UUID,
  "recordedByMembershipId" UUID NOT NULL,
  "verifiedByMembershipId" UUID,
  "reconciledByMembershipId" UUID,
  "medicationName" VARCHAR(255) NOT NULL,
  "genericName" VARCHAR(255),
  "brandName" VARCHAR(255),
  "atcCode" VARCHAR(32),
  "dosage" VARCHAR(100) NOT NULL,
  "dosageAmount" NUMERIC(10, 4),
  "dosageUnit" VARCHAR(32),
  "route" VARCHAR(64) NOT NULL,
  "frequency" VARCHAR(100) NOT NULL,
  "instructions" TEXT,
  "indication" VARCHAR(255),
  "status" "MedicationRecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "provenance" "ClinicalProvenance" NOT NULL DEFAULT 'PATIENT_REPORTED',
  "isReconciled" BOOLEAN NOT NULL DEFAULT false,
  "reconciledAt" TIMESTAMPTZ(3),
  "startDate" TIMESTAMPTZ(3),
  "endDate" TIMESTAMPTZ(3),
  "discontinuationReason" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MedicationRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MedicationRecord_clinic_id_key" UNIQUE ("clinicId", "id")
);

-- 2.5 MedicationPrescription
CREATE TABLE IF NOT EXISTS public."MedicationPrescription" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "encounterId" UUID NOT NULL,
  "prescriberMembershipId" UUID NOT NULL,
  "practitionerClinicalPrivilegeId" UUID,
  "prescriptionNumber" VARCHAR(64) NOT NULL,
  "status" "PrescriptionStatus" NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "signedAt" TIMESTAMPTZ(3),
  "signedByMembershipId" UUID,
  "signatureDigest" VARCHAR(64),
  "cancellationReason" TEXT,
  "cancelledAt" TIMESTAMPTZ(3),
  "supersededById" UUID,
  "safetyReviewAcknowledged" BOOLEAN NOT NULL DEFAULT false,
  "allergyCheckWarning" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MedicationPrescription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MedicationPrescription_clinic_id_key" UNIQUE ("clinicId", "id"),
  CONSTRAINT "MedicationPrescription_clinic_rx_num_key" UNIQUE ("clinicId", "prescriptionNumber")
);

-- 2.6 MedicationPrescriptionItem
CREATE TABLE IF NOT EXISTS public."MedicationPrescriptionItem" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "prescriptionId" UUID NOT NULL,
  "medicationName" VARCHAR(255) NOT NULL,
  "genericName" VARCHAR(255),
  "strength" VARCHAR(64) NOT NULL,
  "dosageForm" VARCHAR(64) NOT NULL,
  "route" VARCHAR(64) NOT NULL,
  "frequency" VARCHAR(100) NOT NULL,
  "duration" VARCHAR(64) NOT NULL,
  "durationDays" INTEGER,
  "quantity" INTEGER NOT NULL,
  "unit" VARCHAR(32) NOT NULL,
  "refillsAllowed" INTEGER NOT NULL DEFAULT 0,
  "substitutionAllowed" BOOLEAN NOT NULL DEFAULT false,
  "instructions" TEXT NOT NULL,
  "indication" VARCHAR(255),
  "itemOrder" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MedicationPrescriptionItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MedicationPrescriptionItem_clinic_id_key" UNIQUE ("clinicId", "id")
);

-- 2.7 ClinicPrescriptionCounter
CREATE TABLE IF NOT EXISTS public."ClinicPrescriptionCounter" (
  "clinicId" UUID NOT NULL,
  "nextValue" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClinicPrescriptionCounter_pkey" PRIMARY KEY ("clinicId")
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS "idx_clinical_obs_patient_type" ON public."ClinicalObservation" ("clinicId", "patientId", "measuredAt", "observationType");
CREATE INDEX IF NOT EXISTS "idx_clinical_obs_encounter" ON public."ClinicalObservation" ("clinicId", "encounterId");

CREATE INDEX IF NOT EXISTS "idx_encounter_diag_problem" ON public."EncounterDiagnosis" ("clinicId", "patientId", "isProblem", "problemStatus");
CREATE INDEX IF NOT EXISTS "idx_encounter_diag_encounter_role" ON public."EncounterDiagnosis" ("clinicId", "encounterId", "diagnosisRole");
CREATE INDEX IF NOT EXISTS "idx_encounter_diag_code" ON public."EncounterDiagnosis" ("clinicId", "code");

CREATE INDEX IF NOT EXISTS "idx_patient_allergy_status" ON public."PatientAllergy" ("clinicId", "patientId", "clinicalStatus");
CREATE INDEX IF NOT EXISTS "idx_patient_allergy_type" ON public."PatientAllergy" ("clinicId", "patientId", "allergyStatusType");

CREATE INDEX IF NOT EXISTS "idx_med_record_patient_status" ON public."MedicationRecord" ("clinicId", "patientId", "status");
CREATE INDEX IF NOT EXISTS "idx_med_record_reconciled" ON public."MedicationRecord" ("clinicId", "patientId", "isReconciled");

CREATE INDEX IF NOT EXISTS "idx_prescription_patient_status" ON public."MedicationPrescription" ("clinicId", "patientId", "status");
CREATE INDEX IF NOT EXISTS "idx_prescription_encounter" ON public."MedicationPrescription" ("clinicId", "encounterId");
CREATE INDEX IF NOT EXISTS "idx_prescription_prescriber" ON public."MedicationPrescription" ("clinicId", "prescriberMembershipId");

CREATE INDEX IF NOT EXISTS "idx_prescription_item_order" ON public."MedicationPrescriptionItem" ("clinicId", "prescriptionId", "itemOrder");

-- Section 3.D: Fix nullable branchId uniqueness for clinic-wide clinical privileges
CREATE UNIQUE INDEX IF NOT EXISTS "idx_practitioner_privilege_clinic_wide"
ON public."PractitionerClinicalPrivilege" ("practitionerProfileId", "specialtyId", "privilegeCode")
WHERE "branchId" IS NULL;

-- 4. Foreign Key Constraints
DO $$ BEGIN
  ALTER TABLE public."ClinicalObservation" ADD CONSTRAINT "ClinicalObservation_clinic_fkey"
    FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."ClinicalObservation" ADD CONSTRAINT "ClinicalObservation_patient_fkey"
    FOREIGN KEY ("clinicId", "patientId") REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."ClinicalObservation" ADD CONSTRAINT "ClinicalObservation_encounter_fkey"
    FOREIGN KEY ("clinicId", "encounterId") REFERENCES public."ClinicalEncounter"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."ClinicalObservation" ADD CONSTRAINT "ClinicalObservation_author_fkey"
    FOREIGN KEY ("clinicId", "authorMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."EncounterDiagnosis" ADD CONSTRAINT "EncounterDiagnosis_clinic_fkey"
    FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."EncounterDiagnosis" ADD CONSTRAINT "EncounterDiagnosis_patient_fkey"
    FOREIGN KEY ("clinicId", "patientId") REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."EncounterDiagnosis" ADD CONSTRAINT "EncounterDiagnosis_encounter_fkey"
    FOREIGN KEY ("clinicId", "encounterId") REFERENCES public."ClinicalEncounter"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."EncounterDiagnosis" ADD CONSTRAINT "EncounterDiagnosis_author_fkey"
    FOREIGN KEY ("clinicId", "authorMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."EncounterDiagnosis" ADD CONSTRAINT "EncounterDiagnosis_confirmedBy_fkey"
    FOREIGN KEY ("clinicId", "confirmedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."PatientAllergy" ADD CONSTRAINT "PatientAllergy_clinic_fkey"
    FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."PatientAllergy" ADD CONSTRAINT "PatientAllergy_patient_fkey"
    FOREIGN KEY ("clinicId", "patientId") REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."PatientAllergy" ADD CONSTRAINT "PatientAllergy_encounter_fkey"
    FOREIGN KEY ("clinicId", "encounterId") REFERENCES public."ClinicalEncounter"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."PatientAllergy" ADD CONSTRAINT "PatientAllergy_recordedBy_fkey"
    FOREIGN KEY ("clinicId", "recordedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."PatientAllergy" ADD CONSTRAINT "PatientAllergy_verifiedBy_fkey"
    FOREIGN KEY ("clinicId", "verifiedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."MedicationRecord" ADD CONSTRAINT "MedicationRecord_clinic_fkey"
    FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."MedicationRecord" ADD CONSTRAINT "MedicationRecord_patient_fkey"
    FOREIGN KEY ("clinicId", "patientId") REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."MedicationRecord" ADD CONSTRAINT "MedicationRecord_encounter_fkey"
    FOREIGN KEY ("clinicId", "encounterId") REFERENCES public."ClinicalEncounter"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."MedicationRecord" ADD CONSTRAINT "MedicationRecord_recordedBy_fkey"
    FOREIGN KEY ("clinicId", "recordedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."MedicationRecord" ADD CONSTRAINT "MedicationRecord_verifiedBy_fkey"
    FOREIGN KEY ("clinicId", "verifiedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."MedicationRecord" ADD CONSTRAINT "MedicationRecord_reconciledBy_fkey"
    FOREIGN KEY ("clinicId", "reconciledByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."MedicationPrescription" ADD CONSTRAINT "MedicationPrescription_clinic_fkey"
    FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."MedicationPrescription" ADD CONSTRAINT "MedicationPrescription_patient_fkey"
    FOREIGN KEY ("clinicId", "patientId") REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."MedicationPrescription" ADD CONSTRAINT "MedicationPrescription_encounter_fkey"
    FOREIGN KEY ("clinicId", "encounterId") REFERENCES public."ClinicalEncounter"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."MedicationPrescription" ADD CONSTRAINT "MedicationPrescription_prescriber_fkey"
    FOREIGN KEY ("clinicId", "prescriberMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."MedicationPrescription" ADD CONSTRAINT "MedicationPrescription_signer_fkey"
    FOREIGN KEY ("clinicId", "signedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."MedicationPrescription" ADD CONSTRAINT "MedicationPrescription_privilege_fkey"
    FOREIGN KEY ("clinicId", "practitionerClinicalPrivilegeId") REFERENCES public."PractitionerClinicalPrivilege"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."MedicationPrescriptionItem" ADD CONSTRAINT "MedicationPrescriptionItem_clinic_fkey"
    FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."MedicationPrescriptionItem" ADD CONSTRAINT "MedicationPrescriptionItem_prescription_fkey"
    FOREIGN KEY ("clinicId", "prescriptionId") REFERENCES public."MedicationPrescription"("clinicId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."ClinicPrescriptionCounter" ADD CONSTRAINT "ClinicPrescriptionCounter_clinic_fkey"
    FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. Row Level Security & Isolation Policies
DO $$ DECLARE t text; owner_name text:=current_user; pred text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ClinicalObservation',
    'EncounterDiagnosis',
    'PatientAllergy',
    'MedicationRecord',
    'MedicationPrescription',
    'MedicationPrescriptionItem',
    'ClinicPrescriptionCounter'
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
    EXECUTE format('CREATE POLICY tenant_delete ON public.%I FOR DELETE USING (false)', t);
  END LOOP;
END $$;

-- 6. Immutability Triggers on clinicId
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ClinicalObservation',
    'EncounterDiagnosis',
    'PatientAllergy',
    'MedicationRecord',
    'MedicationPrescription',
    'MedicationPrescriptionItem',
    'ClinicPrescriptionCounter'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS immutable_clinic ON public.%I', t);
    EXECUTE format('CREATE TRIGGER immutable_clinic BEFORE UPDATE OF "clinicId" ON public.%I FOR EACH ROW EXECUTE FUNCTION lamssa_security.reject_clinic_reassignment()', t);
  END LOOP;
END $$;

-- 7. Security Remediations (Section 3.C: Database Credential and Privilege Integrity)

-- 7.1 PractitionerProfile Anti-Tamper Trigger
CREATE OR REPLACE FUNCTION lamssa_security.practitioner_credential_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  -- Anti-self-verification check
  IF NEW."verificationStatus" = 'VERIFIED' AND OLD."verificationStatus" IS DISTINCT FROM 'VERIFIED' THEN
    IF NEW."verifiedByMembershipId" = NEW."membershipId" THEN
      RAISE EXCEPTION 'Self-verification of practitioner profile is prohibited';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION lamssa_security.practitioner_credential_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_practitioner_profile_guard ON public."PractitionerProfile";
CREATE TRIGGER trg_practitioner_profile_guard BEFORE UPDATE ON public."PractitionerProfile"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.practitioner_credential_guard();

-- 7.2 PractitionerSpecialty Qualification Anti-Tamper Trigger
CREATE OR REPLACE FUNCTION lamssa_security.practitioner_qualification_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  profile_membership_id uuid;
BEGIN
  IF NEW."status" = 'VERIFIED' AND OLD."status" IS DISTINCT FROM 'VERIFIED' THEN
    SELECT "membershipId" INTO profile_membership_id
    FROM public."PractitionerProfile"
    WHERE "clinicId" = NEW."clinicId" AND "id" = NEW."practitionerProfileId";

    IF NEW."verifiedByMembershipId" = profile_membership_id THEN
      RAISE EXCEPTION 'Self-verification of specialty qualifications is prohibited';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION lamssa_security.practitioner_qualification_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_practitioner_specialty_guard ON public."PractitionerSpecialty";
CREATE TRIGGER trg_practitioner_specialty_guard BEFORE UPDATE ON public."PractitionerSpecialty"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.practitioner_qualification_guard();

-- 7.3 PractitionerClinicalPrivilege Anti-Tamper Trigger
CREATE OR REPLACE FUNCTION lamssa_security.practitioner_privilege_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  profile_membership_id uuid;
BEGIN
  IF NEW."status" = 'APPROVED' AND OLD."status" IS DISTINCT FROM 'APPROVED' THEN
    SELECT "membershipId" INTO profile_membership_id
    FROM public."PractitionerProfile"
    WHERE "clinicId" = NEW."clinicId" AND "id" = NEW."practitionerProfileId";

    IF NEW."approvedByMembershipId" = profile_membership_id THEN
      RAISE EXCEPTION 'Self-approval of clinical privileges is prohibited';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION lamssa_security.practitioner_privilege_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_practitioner_privilege_guard ON public."PractitionerClinicalPrivilege";
CREATE TRIGGER trg_practitioner_privilege_guard BEFORE UPDATE ON public."PractitionerClinicalPrivilege"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.practitioner_privilege_guard();

-- 8. Clinical Prescription & Observation Immutability Triggers

-- 8.1 Prescription Immutability Guard
CREATE OR REPLACE FUNCTION lamssa_security.prescription_immutability_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD."status" IN ('SIGNED', 'CANCELLED', 'SUPERSEDED') THEN
      -- Once signed, only transition to CANCELLED or SUPERSEDED is allowed
      IF NOT (OLD."status" = 'SIGNED' AND NEW."status" IN ('CANCELLED', 'SUPERSEDED')) THEN
        RAISE EXCEPTION 'Signed prescription content is immutable and cannot be modified';
      END IF;
      -- Core metadata is permanently immutable
      IF NEW."patientId" <> OLD."patientId" OR
         NEW."encounterId" <> OLD."encounterId" OR
         NEW."prescriberMembershipId" <> OLD."prescriberMembershipId" OR
         NEW."prescriptionNumber" <> OLD."prescriptionNumber" OR
         NEW."signatureDigest" <> OLD."signatureDigest" THEN
        RAISE EXCEPTION 'Signed prescription core metadata is immutable';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION lamssa_security.prescription_immutability_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_prescription_guard ON public."MedicationPrescription";
CREATE TRIGGER trg_prescription_guard BEFORE UPDATE ON public."MedicationPrescription"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.prescription_immutability_guard();

-- 8.2 Prescription Item Immutability Guard
CREATE OR REPLACE FUNCTION lamssa_security.prescription_item_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  rx_status public."PrescriptionStatus";
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT "status" INTO rx_status FROM public."MedicationPrescription"
    WHERE "clinicId" = NEW."clinicId" AND "id" = NEW."prescriptionId";
  ELSE
    SELECT "status" INTO rx_status FROM public."MedicationPrescription"
    WHERE "clinicId" = OLD."clinicId" AND "id" = OLD."prescriptionId";
  END IF;

  IF rx_status IN ('SIGNED', 'CANCELLED', 'SUPERSEDED') THEN
    RAISE EXCEPTION 'Prescription items cannot be added, modified or deleted on a signed or closed prescription';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
REVOKE ALL ON FUNCTION lamssa_security.prescription_item_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_prescription_item_guard ON public."MedicationPrescriptionItem";
CREATE TRIGGER trg_prescription_item_guard BEFORE INSERT OR UPDATE OR DELETE ON public."MedicationPrescriptionItem"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.prescription_item_guard();

-- 8.3 Observation Immutability Guard
CREATE OR REPLACE FUNCTION lamssa_security.clinical_observation_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF OLD."status" = 'VERIFIED' THEN
    -- Verified observation values cannot be mutated; amendments require AMENDED/ENTERED_IN_ERROR
    IF NEW."status" NOT IN ('AMENDED', 'ENTERED_IN_ERROR') THEN
      RAISE EXCEPTION 'Verified clinical observation values are immutable';
    END IF;
    IF NEW."numericValue" IS DISTINCT FROM OLD."numericValue" OR
       NEW."textValue" IS DISTINCT FROM OLD."textValue" OR
       NEW."unit" IS DISTINCT FROM OLD."unit" OR
       NEW."observationType" IS DISTINCT FROM OLD."observationType" THEN
      RAISE EXCEPTION 'Verified clinical observation measurement cannot be overwritten directly; create an amendment';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION lamssa_security.clinical_observation_guard() FROM PUBLIC;
    IF NEW."numericValue" IS DISTINCT FROM OLD."numericValue" OR
       NEW."textValue" IS DISTINCT FROM OLD."textValue" OR
       NEW."unit" IS DISTINCT FROM OLD."unit" OR
       NEW."observationType" IS DISTINCT FROM OLD."observationType" THEN
      RAISE EXCEPTION 'Verified clinical observation measurement cannot be overwritten directly; create an amendment';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clinical_observation_guard ON public."ClinicalObservation";
CREATE TRIGGER trg_clinical_observation_guard BEFORE UPDATE ON public."ClinicalObservation"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.clinical_observation_guard();
