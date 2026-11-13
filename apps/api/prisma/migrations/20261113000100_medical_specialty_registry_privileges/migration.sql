-- Migration: 20261113000100_medical_specialty_registry_privileges
-- Phase 6, Step 6.2: Medical Specialty Registry, Practitioner Qualifications & Clinical Privilege Engine

-- 1. Create Enums
DO $$ BEGIN
  CREATE TYPE "SpecialtyConfigurationStatus" AS ENUM ('ACTIVE', 'INACTIVE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CredentialVerificationStatus" AS ENUM ('SELF_REPORTED', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'EXPIRED', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ClinicalPrivilegeCode" AS ENUM (
    'CLINICAL_ENCOUNTER_DOCUMENT',
    'CLINICAL_NOTE_SIGN',
    'CLINICAL_DIAGNOSIS_RECORD',
    'MEDICATION_PRESCRIBE',
    'DIAGNOSTIC_LAB_ORDER',
    'DIAGNOSTIC_IMAGING_ORDER',
    'CLINICAL_PROCEDURE_PERFORM',
    'MEDICATION_ADMINISTER',
    'SEDATION_ADMINISTER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PrivilegeScope" AS ENUM ('CLINIC_WIDE', 'BRANCH_SCOPED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PrivilegeStatus" AS ENUM ('REQUESTED', 'APPROVED', 'SUSPENDED', 'REVOKED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Create Global Medical Specialty Reference Catalog
CREATE TABLE IF NOT EXISTS public."MedicalSpecialty" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" VARCHAR(64) NOT NULL,
  "arabicName" VARCHAR(128) NOT NULL,
  "englishName" VARCHAR(128) NOT NULL,
  "description" TEXT,
  "classification" VARCHAR(64) NOT NULL DEFAULT 'MEDICAL',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MedicalSpecialty_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MedicalSpecialty_code_key" ON public."MedicalSpecialty"("code");
CREATE INDEX IF NOT EXISTS "MedicalSpecialty_isActive_classification_idx" ON public."MedicalSpecialty"("isActive", "classification");

-- 3. Create Tenant Clinic Specialty Configuration Table
CREATE TABLE IF NOT EXISTS public."ClinicSpecialty" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "specialtyId" UUID NOT NULL,
  "status" "SpecialtyConfigurationStatus" NOT NULL DEFAULT 'ACTIVE',
  "isCompatibility" BOOLEAN NOT NULL DEFAULT false,
  "enabledAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "disabledAt" TIMESTAMPTZ(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClinicSpecialty_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClinicSpecialty_clinicId_specialtyId_key" ON public."ClinicSpecialty"("clinicId", "specialtyId");
CREATE UNIQUE INDEX IF NOT EXISTS "ClinicSpecialty_clinicId_id_key" ON public."ClinicSpecialty"("clinicId", "id");
CREATE INDEX IF NOT EXISTS "ClinicSpecialty_clinicId_status_idx" ON public."ClinicSpecialty"("clinicId", "status");

-- 4. Create Branch Specialty Availability Table
CREATE TABLE IF NOT EXISTS public."BranchSpecialty" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "specialtyId" UUID NOT NULL,
  "status" "SpecialtyConfigurationStatus" NOT NULL DEFAULT 'ACTIVE',
  "isCompatibility" BOOLEAN NOT NULL DEFAULT false,
  "enabledAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "disabledAt" TIMESTAMPTZ(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BranchSpecialty_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BranchSpecialty_branchId_specialtyId_key" ON public."BranchSpecialty"("branchId", "specialtyId");
CREATE UNIQUE INDEX IF NOT EXISTS "BranchSpecialty_clinicId_id_key" ON public."BranchSpecialty"("clinicId", "id");
CREATE INDEX IF NOT EXISTS "BranchSpecialty_clinicId_branchId_status_idx" ON public."BranchSpecialty"("clinicId", "branchId", "status");

-- 5. Create Practitioner Profile Table
CREATE TABLE IF NOT EXISTS public."PractitionerProfile" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "membershipId" UUID NOT NULL,
  "professionalTitleAr" VARCHAR(128) NOT NULL,
  "professionalTitleEn" VARCHAR(128) NOT NULL,
  "licenseNumber" VARCHAR(64),
  "licensingAuthority" VARCHAR(128),
  "licensingJurisdiction" VARCHAR(64),
  "licenseEffectiveDate" TIMESTAMPTZ(3),
  "licenseExpirationDate" TIMESTAMPTZ(3),
  "verificationStatus" "CredentialVerificationStatus" NOT NULL DEFAULT 'SELF_REPORTED',
  "verifiedByMembershipId" UUID,
  "verifiedAt" TIMESTAMPTZ(3),
  "rejectionReason" TEXT,
  "evidenceReference" VARCHAR(255),
  "isMedicalDirector" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PractitionerProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PractitionerProfile_membershipId_key" ON public."PractitionerProfile"("membershipId");
CREATE UNIQUE INDEX IF NOT EXISTS "PractitionerProfile_clinicId_membershipId_key" ON public."PractitionerProfile"("clinicId", "membershipId");
CREATE UNIQUE INDEX IF NOT EXISTS "PractitionerProfile_clinicId_id_key" ON public."PractitionerProfile"("clinicId", "id");
CREATE INDEX IF NOT EXISTS "PractitionerProfile_clinicId_verificationStatus_idx" ON public."PractitionerProfile"("clinicId", "verificationStatus");

-- 6. Create Practitioner Specialty Qualification Table
CREATE TABLE IF NOT EXISTS public."PractitionerSpecialty" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "practitionerProfileId" UUID NOT NULL,
  "specialtyId" UUID NOT NULL,
  "qualificationTitle" VARCHAR(128) NOT NULL,
  "qualificationLevel" VARCHAR(64) NOT NULL DEFAULT 'SPECIALIST',
  "status" "CredentialVerificationStatus" NOT NULL DEFAULT 'SELF_REPORTED',
  "effectiveDate" TIMESTAMPTZ(3),
  "expirationDate" TIMESTAMPTZ(3),
  "verifiedByMembershipId" UUID,
  "verifiedAt" TIMESTAMPTZ(3),
  "rejectionReason" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PractitionerSpecialty_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PractitionerSpecialty_practitionerProfileId_specialtyId_key" ON public."PractitionerSpecialty"("practitionerProfileId", "specialtyId");
CREATE UNIQUE INDEX IF NOT EXISTS "PractitionerSpecialty_clinicId_id_key" ON public."PractitionerSpecialty"("clinicId", "id");
CREATE INDEX IF NOT EXISTS "PractitionerSpecialty_clinicId_status_idx" ON public."PractitionerSpecialty"("clinicId", "status");

-- 7. Create Practitioner Clinical Privilege Table
CREATE TABLE IF NOT EXISTS public."PractitionerClinicalPrivilege" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "branchId" UUID,
  "practitionerProfileId" UUID NOT NULL,
  "specialtyId" UUID NOT NULL,
  "practitionerSpecialtyId" UUID,
  "privilegeCode" "ClinicalPrivilegeCode" NOT NULL,
  "scope" "PrivilegeScope" NOT NULL DEFAULT 'CLINIC_WIDE',
  "status" "PrivilegeStatus" NOT NULL DEFAULT 'REQUESTED',
  "approvedByMembershipId" UUID,
  "approvedAt" TIMESTAMPTZ(3),
  "rejectionReason" TEXT,
  "effectiveDate" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expirationDate" TIMESTAMPTZ(3),
  "isCompatibility" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PractitionerClinicalPrivilege_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PractitionerClinicalPrivilege_unique_scope_key"
  ON public."PractitionerClinicalPrivilege" ("practitionerProfileId", "specialtyId", "privilegeCode", COALESCE("branchId", '00000000-0000-0000-0000-000000000000'::uuid));
CREATE UNIQUE INDEX IF NOT EXISTS "PractitionerClinicalPrivilege_clinicId_id_key" ON public."PractitionerClinicalPrivilege"("clinicId", "id");
CREATE INDEX IF NOT EXISTS "PractitionerClinicalPrivilege_clinic_profile_status_idx" ON public."PractitionerClinicalPrivilege"("clinicId", "practitionerProfileId", "status");
CREATE INDEX IF NOT EXISTS "PractitionerClinicalPrivilege_clinic_lookup_idx" ON public."PractitionerClinicalPrivilege"("clinicId", "specialtyId", "privilegeCode", "status");

-- 8. Add Foreign Key Constraints with Composite Tenant Scoping
DO $$ BEGIN
  ALTER TABLE public."ClinicSpecialty" ADD CONSTRAINT "ClinicSpecialty_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."ClinicSpecialty" ADD CONSTRAINT "ClinicSpecialty_specialtyId_fkey"
    FOREIGN KEY ("specialtyId") REFERENCES public."MedicalSpecialty"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."BranchSpecialty" ADD CONSTRAINT "BranchSpecialty_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."BranchSpecialty" ADD CONSTRAINT "BranchSpecialty_clinic_branch_fkey"
    FOREIGN KEY ("clinicId", "branchId") REFERENCES public."ClinicBranch"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."BranchSpecialty" ADD CONSTRAINT "BranchSpecialty_specialtyId_fkey"
    FOREIGN KEY ("specialtyId") REFERENCES public."MedicalSpecialty"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."BranchSpecialty" ADD CONSTRAINT "BranchSpecialty_clinic_specialty_fkey"
    FOREIGN KEY ("clinicId", "specialtyId") REFERENCES public."ClinicSpecialty"("clinicId", "specialtyId") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."PractitionerProfile" ADD CONSTRAINT "PractitionerProfile_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."PractitionerProfile" ADD CONSTRAINT "PractitionerProfile_clinic_membership_fkey"
    FOREIGN KEY ("clinicId", "membershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."PractitionerProfile" ADD CONSTRAINT "PractitionerProfile_verifiedBy_fkey"
    FOREIGN KEY ("clinicId", "verifiedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."PractitionerSpecialty" ADD CONSTRAINT "PractitionerSpecialty_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."PractitionerSpecialty" ADD CONSTRAINT "PractitionerSpecialty_profile_fkey"
    FOREIGN KEY ("clinicId", "practitionerProfileId") REFERENCES public."PractitionerProfile"("clinicId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."PractitionerSpecialty" ADD CONSTRAINT "PractitionerSpecialty_specialtyId_fkey"
    FOREIGN KEY ("specialtyId") REFERENCES public."MedicalSpecialty"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."PractitionerSpecialty" ADD CONSTRAINT "PractitionerSpecialty_verifiedBy_fkey"
    FOREIGN KEY ("clinicId", "verifiedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."PractitionerClinicalPrivilege" ADD CONSTRAINT "PractitionerClinicalPrivilege_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."PractitionerClinicalPrivilege" ADD CONSTRAINT "PractitionerClinicalPrivilege_branch_fkey"
    FOREIGN KEY ("clinicId", "branchId") REFERENCES public."ClinicBranch"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."PractitionerClinicalPrivilege" ADD CONSTRAINT "PractitionerClinicalPrivilege_profile_fkey"
    FOREIGN KEY ("clinicId", "practitionerProfileId") REFERENCES public."PractitionerProfile"("clinicId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."PractitionerClinicalPrivilege" ADD CONSTRAINT "PractitionerClinicalPrivilege_specialtyId_fkey"
    FOREIGN KEY ("specialtyId") REFERENCES public."MedicalSpecialty"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."PractitionerClinicalPrivilege" ADD CONSTRAINT "PractitionerClinicalPrivilege_qualification_fkey"
    FOREIGN KEY ("clinicId", "practitionerSpecialtyId") REFERENCES public."PractitionerSpecialty"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."PractitionerClinicalPrivilege" ADD CONSTRAINT "PractitionerClinicalPrivilege_approvedBy_fkey"
    FOREIGN KEY ("clinicId", "approvedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 9. Row Level Security & Isolation Policies
-- Global Catalog RLS (Public Select, Maintenance Owner Full Access)
DO $$ DECLARE owner_name text:=current_user; BEGIN
  EXECUTE 'ALTER TABLE public."MedicalSpecialty" ENABLE ROW LEVEL SECURITY';
  EXECUTE format('DROP POLICY IF EXISTS maintenance_owner ON public."MedicalSpecialty"');
  EXECUTE format('CREATE POLICY maintenance_owner ON public."MedicalSpecialty" FOR ALL TO %I USING (true) WITH CHECK (true)', owner_name);
  EXECUTE 'DROP POLICY IF EXISTS specialty_public_select ON public."MedicalSpecialty"';
  EXECUTE 'CREATE POLICY specialty_public_select ON public."MedicalSpecialty" FOR SELECT USING (true)';
END $$;

-- Tenant Tables RLS
DO $$ DECLARE t text; owner_name text:=current_user; pred text; BEGIN
  FOREACH t IN ARRAY ARRAY['ClinicSpecialty', 'BranchSpecialty', 'PractitionerProfile', 'PractitionerSpecialty', 'PractitionerClinicalPrivilege'] LOOP
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

-- 10. Immutability Triggers on clinicId
DROP TRIGGER IF EXISTS immutable_clinic ON public."ClinicSpecialty";
CREATE TRIGGER immutable_clinic BEFORE UPDATE OF "clinicId" ON public."ClinicSpecialty"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.reject_clinic_reassignment();

DROP TRIGGER IF EXISTS immutable_clinic ON public."BranchSpecialty";
CREATE TRIGGER immutable_clinic BEFORE UPDATE OF "clinicId" ON public."BranchSpecialty"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.reject_clinic_reassignment();

DROP TRIGGER IF EXISTS immutable_clinic ON public."PractitionerProfile";
CREATE TRIGGER immutable_clinic BEFORE UPDATE OF "clinicId" ON public."PractitionerProfile"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.reject_clinic_reassignment();

DROP TRIGGER IF EXISTS immutable_clinic ON public."PractitionerSpecialty";
CREATE TRIGGER immutable_clinic BEFORE UPDATE OF "clinicId" ON public."PractitionerSpecialty"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.reject_clinic_reassignment();

DROP TRIGGER IF EXISTS immutable_clinic ON public."PractitionerClinicalPrivilege";
CREATE TRIGGER immutable_clinic BEFORE UPDATE OF "clinicId" ON public."PractitionerClinicalPrivilege"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.reject_clinic_reassignment();

-- 11. Idempotent Initial Seed of Global Specialty Reference Catalog
INSERT INTO public."MedicalSpecialty" ("id", "code", "arabicName", "englishName", "description", "classification", "isActive", "version", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'AESTHETICS', 'الطب التجميلي', 'Aesthetic Medicine', 'Aesthetic procedures, cosmetic dermatology, and non-surgical anti-aging care', 'SURGICAL_PROCEDURAL', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'GENERAL_MEDICINE', 'الطب العام وطب الأسرة', 'General Medicine & Family Practice', 'Primary healthcare, routine consultations, preventive screening, and chronic disease management', 'PRIMARY_CARE', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'DERMATOLOGY', 'الأمراض الجلدية والتناسلية', 'Dermatology', 'Diagnosis and treatment of skin, hair, and nail disorders', 'MEDICAL', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'DENTISTRY', 'طب وجراحة الفم والأسنان', 'Dentistry & Oral Health', 'Preventive, restorative, endodontic, and cosmetic dental procedures', 'DENTAL', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'PEDIATRICS', 'طب الأطفال وحديثي الولادة', 'Pediatrics & Neonatology', 'Comprehensive medical care for infants, children, and adolescents', 'PRIMARY_CARE', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'OB_GYN', 'أمراض النساء والولادة', 'Obstetrics & Gynecology', 'Women reproductive health, antenatal monitoring, and gynecological care', 'SURGICAL_PROCEDURAL', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'OPHTHALMOLOGY', 'طب وجراحة العيون', 'Ophthalmology', 'Vision testing, refractive assessment, and medical/surgical eye care', 'SURGICAL_PROCEDURAL', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ORTHOPEDICS', 'جراحة العظام والمفاصل', 'Orthopedics', 'Musculoskeletal system care, joint disorders, and sports injury treatment', 'SURGICAL_PROCEDURAL', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ENT', 'الأنف والأذن والحنجرة', 'Ear, Nose & Throat (ENT)', 'Otolaryngology diagnostics, hearing assessments, and upper airway management', 'SURGICAL_PROCEDURAL', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'PHYSIOTHERAPY', 'العلاج الطبيعي والتأهيل الطبي', 'Physiotherapy & Rehabilitation', 'Physical rehabilitation, musculoskeletal pain therapy, and functional mobility restoration', 'ALLIED_HEALTH', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "arabicName" = EXCLUDED."arabicName",
  "englishName" = EXCLUDED."englishName",
  "description" = EXCLUDED."description",
  "classification" = EXCLUDED."classification",
  "isActive" = EXCLUDED."isActive";

-- 12. Non-Destructive Backward Compatibility Backfill
-- Enable AESTHETICS specialty for all existing clinics
INSERT INTO public."ClinicSpecialty" ("id", "clinicId", "specialtyId", "status", "isCompatibility", "enabledAt", "version", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  c."id",
  s."id",
  'ACTIVE'::"SpecialtyConfigurationStatus",
  true,
  CURRENT_TIMESTAMP,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM public."Clinic" c
CROSS JOIN public."MedicalSpecialty" s
WHERE s."code" = 'AESTHETICS'
ON CONFLICT ("clinicId", "specialtyId") DO NOTHING;

-- Enable AESTHETICS specialty for all existing branches
INSERT INTO public."BranchSpecialty" ("id", "clinicId", "branchId", "specialtyId", "status", "isCompatibility", "enabledAt", "version", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  b."clinicId",
  b."id",
  s."id",
  'ACTIVE'::"SpecialtyConfigurationStatus",
  true,
  CURRENT_TIMESTAMP,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM public."ClinicBranch" b
CROSS JOIN public."MedicalSpecialty" s
WHERE s."code" = 'AESTHETICS'
ON CONFLICT ("branchId", "specialtyId") DO NOTHING;
