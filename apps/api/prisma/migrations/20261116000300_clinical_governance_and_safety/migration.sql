-- Migration 040: Clinical Governance, Patient Safety & Interoperability Readiness
-- Phase 7 Step 7.4

-- 1. Create Enums
DO $$ BEGIN
  CREATE TYPE "ClinicalPolicyStatus" AS ENUM ('DRAFT', 'APPROVED', 'ACTIVATED', 'RETIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ClinicalPolicyCategory" AS ENUM ('ALLERGY_SAFETY', 'PRESCRIPTION_SAFETY', 'CRITICAL_RESULT_ESCALATION', 'FORM_APPROVAL', 'CLINICAL_PROTOCOL', 'GENERAL_SAFETY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ClinicalIncidentSeverity" AS ENUM ('NEAR_MISS', 'LOW', 'MODERATE', 'SEVERE', 'SENTINEL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ClinicalIncidentCategory" AS ENUM ('MEDICATION_SAFETY', 'ALLERGY_ADVERSE_REACTION', 'DIAGNOSTIC_DELAY', 'PROCEDURAL_COMPLICATION', 'PRIVILEGE_BOUNDARY', 'EQUIPMENT_SAFETY', 'DOCUMENTATION_ERROR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ClinicalIncidentStatus" AS ENUM ('REPORTED', 'UNDER_INVESTIGATION', 'CORRECTIVE_ACTION_PENDING', 'RESOLVED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PrivilegeReviewType" AS ENUM ('INITIAL_GRANT', 'PERIODIC_RENEWAL', 'EMERGENCY_SUSPENSION', 'PRIVILEGE_REDUCTION', 'REINSTATEMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PrivilegeReviewStatus" AS ENUM ('PENDING', 'COMPLETED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "BreakGlassReviewOutcome" AS ENUM ('APPROVED_JUSTIFIED', 'QUESTIONED', 'UNJUSTIFIED_FLAGGED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Create Tables
-- 2.1 ClinicalSafetyPolicy
CREATE TABLE IF NOT EXISTS public."ClinicalSafetyPolicy" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "titleAr" VARCHAR(200) NOT NULL,
  "titleEn" VARCHAR(200),
  "description" TEXT,
  "category" "ClinicalPolicyCategory" NOT NULL DEFAULT 'GENERAL_SAFETY',
  "specialtyId" UUID,
  "jurisdiction" VARCHAR(32) NOT NULL DEFAULT 'GLOBAL',
  "status" "ClinicalPolicyStatus" NOT NULL DEFAULT 'DRAFT',
  "activeVersionId" UUID,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClinicalSafetyPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClinicalSafetyPolicy_clinicId_id_key" UNIQUE ("clinicId", "id"),
  CONSTRAINT "ClinicalSafetyPolicy_clinicId_code_key" UNIQUE ("clinicId", "code"),
  CONSTRAINT "ClinicalSafetyPolicy_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "ClinicalSafetyPolicy_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES public."MedicalSpecialty"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX IF NOT EXISTS "ClinicalSafetyPolicy_clinicId_category_status_idx" ON public."ClinicalSafetyPolicy"("clinicId", "category", "status");
CREATE INDEX IF NOT EXISTS "ClinicalSafetyPolicy_clinicId_jurisdiction_idx" ON public."ClinicalSafetyPolicy"("clinicId", "jurisdiction");

-- 2.2 ClinicalSafetyPolicyVersion
CREATE TABLE IF NOT EXISTS public."ClinicalSafetyPolicyVersion" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "policyId" UUID NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "rulesJson" JSONB NOT NULL,
  "changeSummary" VARCHAR(500),
  "status" "ClinicalPolicyStatus" NOT NULL DEFAULT 'DRAFT',
  "sha256Digest" CHAR(64) NOT NULL,
  "authorMembershipId" UUID NOT NULL,
  "approvedByMembershipId" UUID,
  "approvedAt" TIMESTAMPTZ(3),
  "effectiveFrom" TIMESTAMPTZ(3),
  "effectiveTo" TIMESTAMPTZ(3),
  "evidenceReference" VARCHAR(255),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClinicalSafetyPolicyVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClinicalSafetyPolicyVersion_clinicId_id_key" UNIQUE ("clinicId", "id"),
  CONSTRAINT "ClinicalSafetyPolicyVersion_policyId_versionNumber_key" UNIQUE ("policyId", "versionNumber"),
  CONSTRAINT "ClinicalSafetyPolicyVersion_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "ClinicalSafetyPolicyVersion_clinicId_policyId_fkey" FOREIGN KEY ("clinicId", "policyId") REFERENCES public."ClinicalSafetyPolicy"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "ClinicalSafetyPolicyVersion_clinicId_authorMembershipId_fkey" FOREIGN KEY ("clinicId", "authorMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "ClinicalSafetyPolicyVersion_clinicId_approvedByMembershipId_fkey" FOREIGN KEY ("clinicId", "approvedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX IF NOT EXISTS "ClinicalSafetyPolicyVersion_clinicId_policyId_status_idx" ON public."ClinicalSafetyPolicyVersion"("clinicId", "policyId", "status");

DO $$ BEGIN
  ALTER TABLE public."ClinicalSafetyPolicy"
    ADD CONSTRAINT "ClinicalSafetyPolicy_clinicId_activeVersionId_fkey"
    FOREIGN KEY ("clinicId", "activeVersionId") REFERENCES public."ClinicalSafetyPolicyVersion"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2.3 ClinicalIncident
CREATE TABLE IF NOT EXISTS public."ClinicalIncident" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "incidentNumber" VARCHAR(32) NOT NULL,
  "severity" "ClinicalIncidentSeverity" NOT NULL,
  "category" "ClinicalIncidentCategory" NOT NULL,
  "status" "ClinicalIncidentStatus" NOT NULL DEFAULT 'REPORTED',
  "patientId" UUID,
  "encounterId" UUID,
  "reportedByMembershipId" UUID NOT NULL,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL,
  "reportedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "description" TEXT NOT NULL,
  "immediateActionTaken" TEXT,
  "investigationFindings" TEXT,
  "rootCauseAnalysis" TEXT,
  "correctiveActions" TEXT,
  "investigatedByMembershipId" UUID,
  "resolvedAt" TIMESTAMPTZ(3),
  "closedAt" TIMESTAMPTZ(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClinicalIncident_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClinicalIncident_clinicId_id_key" UNIQUE ("clinicId", "id"),
  CONSTRAINT "ClinicalIncident_clinicId_incidentNumber_key" UNIQUE ("clinicId", "incidentNumber"),
  CONSTRAINT "ClinicalIncident_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "ClinicalIncident_clinicId_patientId_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "ClinicalIncident_clinicId_encounterId_fkey" FOREIGN KEY ("clinicId", "encounterId") REFERENCES public."ClinicalEncounter"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "ClinicalIncident_clinicId_reportedByMembershipId_fkey" FOREIGN KEY ("clinicId", "reportedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "ClinicalIncident_clinicId_investigatedByMembershipId_fkey" FOREIGN KEY ("clinicId", "investigatedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX IF NOT EXISTS "ClinicalIncident_clinicId_severity_status_idx" ON public."ClinicalIncident"("clinicId", "severity", "status");
CREATE INDEX IF NOT EXISTS "ClinicalIncident_clinicId_category_idx" ON public."ClinicalIncident"("clinicId", "category");
CREATE INDEX IF NOT EXISTS "ClinicalIncident_clinicId_patientId_idx" ON public."ClinicalIncident"("clinicId", "patientId");

-- 2.4 ClinicalIncidentCounter
CREATE TABLE IF NOT EXISTS public."ClinicalIncidentCounter" (
  "clinicId" UUID NOT NULL,
  "lastNumber" INTEGER NOT NULL,
  CONSTRAINT "ClinicalIncidentCounter_pkey" PRIMARY KEY ("clinicId"),
  CONSTRAINT "ClinicalIncidentCounter_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- 2.5 EmergencyBreakGlassAccess
CREATE TABLE IF NOT EXISTS public."EmergencyBreakGlassAccess" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "requestedByMembershipId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "clinicalJustification" VARCHAR(500) NOT NULL,
  "durationMinutes" INTEGER NOT NULL DEFAULT 60,
  "grantedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "revokedAt" TIMESTAMPTZ(3),
  "revokedByMembershipId" UUID,
  "auditReviewedAt" TIMESTAMPTZ(3),
  "reviewedByMembershipId" UUID,
  "reviewOutcome" "BreakGlassReviewOutcome",
  "reviewNotes" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmergencyBreakGlassAccess_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmergencyBreakGlassAccess_clinicId_id_key" UNIQUE ("clinicId", "id"),
  CONSTRAINT "EmergencyBreakGlassAccess_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "EmergencyBreakGlassAccess_clinicId_patientId_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "EmergencyBreakGlassAccess_clinicId_requestedByMembershipId_fkey" FOREIGN KEY ("clinicId", "requestedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "EmergencyBreakGlassAccess_clinicId_revokedByMembershipId_fkey" FOREIGN KEY ("clinicId", "revokedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "EmergencyBreakGlassAccess_clinicId_reviewedByMembershipId_fkey" FOREIGN KEY ("clinicId", "reviewedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "EmergencyBreakGlassAccess_duration_check" CHECK ("durationMinutes" > 0 AND "durationMinutes" <= 120),
  CONSTRAINT "EmergencyBreakGlassAccess_justification_check" CHECK (length(trim("clinicalJustification")) >= 20)
);
CREATE INDEX IF NOT EXISTS "EmergencyBreakGlassAccess_clinicId_patientId_expiresAt_idx" ON public."EmergencyBreakGlassAccess"("clinicId", "patientId", "expiresAt");
CREATE INDEX IF NOT EXISTS "EmergencyBreakGlassAccess_clinicId_requestedBy_idx" ON public."EmergencyBreakGlassAccess"("clinicId", "requestedByMembershipId");

-- 2.6 PractitionerPrivilegeReview
CREATE TABLE IF NOT EXISTS public."PractitionerPrivilegeReview" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "practitionerProfileId" UUID NOT NULL,
  "privilegeId" UUID,
  "reviewType" "PrivilegeReviewType" NOT NULL,
  "status" "PrivilegeReviewStatus" NOT NULL DEFAULT 'PENDING',
  "conductedByMembershipId" UUID NOT NULL,
  "findings" TEXT NOT NULL,
  "recommendation" TEXT NOT NULL,
  "effectiveDate" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expirationDate" TIMESTAMPTZ(3),
  "evidenceReference" VARCHAR(255),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PractitionerPrivilegeReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PractitionerPrivilegeReview_clinicId_id_key" UNIQUE ("clinicId", "id"),
  CONSTRAINT "PractitionerPrivilegeReview_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "PractitionerPrivilegeReview_clinicId_practitionerProfileId_fkey" FOREIGN KEY ("clinicId", "practitionerProfileId") REFERENCES public."PractitionerProfile"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "PractitionerPrivilegeReview_clinicId_privilegeId_fkey" FOREIGN KEY ("clinicId", "privilegeId") REFERENCES public."PractitionerClinicalPrivilege"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "PractitionerPrivilegeReview_clinicId_conductedByMembershipId_fkey" FOREIGN KEY ("clinicId", "conductedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX IF NOT EXISTS "PractitionerPrivilegeReview_clinicId_profile_type_idx" ON public."PractitionerPrivilegeReview"("clinicId", "practitionerProfileId", "reviewType");
CREATE INDEX IF NOT EXISTS "PractitionerPrivilegeReview_clinicId_status_idx" ON public."PractitionerPrivilegeReview"("clinicId", "status");

-- 3. Anti-Tamper Trigger Functions
CREATE OR REPLACE FUNCTION lamssa_security.clinical_safety_policy_version_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  -- Anti-self-approval: An author cannot approve their own policy version
  IF NEW."status" IN ('APPROVED', 'ACTIVATED') AND (OLD."status" IS NULL OR OLD."status" = 'DRAFT') THEN
    IF NEW."approvedByMembershipId" IS NOT NULL AND NEW."approvedByMembershipId" = NEW."authorMembershipId" THEN
      RAISE EXCEPTION 'Self-approval of clinical safety policy version is prohibited' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Immutability of approved/activated versions
  IF OLD."status" IN ('APPROVED', 'ACTIVATED', 'RETIRED') THEN
    IF NEW."rulesJson" IS DISTINCT FROM OLD."rulesJson" OR
       NEW."sha256Digest" IS DISTINCT FROM OLD."sha256Digest" OR
       NEW."versionNumber" IS DISTINCT FROM OLD."versionNumber" OR
       NEW."authorMembershipId" IS DISTINCT FROM OLD."authorMembershipId" THEN
      RAISE EXCEPTION 'Approved or published clinical safety policy versions are immutable' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION lamssa_security.clinical_safety_policy_version_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_clinical_safety_policy_version_guard ON public."ClinicalSafetyPolicyVersion";
CREATE TRIGGER trg_clinical_safety_policy_version_guard
  BEFORE UPDATE ON public."ClinicalSafetyPolicyVersion"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.clinical_safety_policy_version_guard();

CREATE OR REPLACE FUNCTION lamssa_security.privilege_review_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  profile_membership_id uuid;
BEGIN
  SELECT "membershipId" INTO profile_membership_id
  FROM public."PractitionerProfile"
  WHERE "clinicId" = NEW."clinicId" AND "id" = NEW."practitionerProfileId";

  IF NEW."conductedByMembershipId" = profile_membership_id THEN
    RAISE EXCEPTION 'Self-review or self-suspension of clinical privileges is prohibited' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION lamssa_security.privilege_review_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_privilege_review_guard ON public."PractitionerPrivilegeReview";
CREATE TRIGGER trg_privilege_review_guard
  BEFORE INSERT OR UPDATE ON public."PractitionerPrivilegeReview"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.privilege_review_guard();

CREATE OR REPLACE FUNCTION lamssa_security.break_glass_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  -- Anti-self-audit check
  IF NEW."auditReviewedAt" IS NOT NULL AND NEW."reviewedByMembershipId" IS NOT NULL THEN
    IF NEW."reviewedByMembershipId" = NEW."requestedByMembershipId" THEN
      RAISE EXCEPTION 'Self-audit of emergency break-glass access is prohibited' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION lamssa_security.break_glass_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_break_glass_guard ON public."EmergencyBreakGlassAccess";
CREATE TRIGGER trg_break_glass_guard
  BEFORE UPDATE ON public."EmergencyBreakGlassAccess"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.break_glass_guard();

-- 4. Enable & Force Row Level Security with Multi-Tenant Isolation Policies
DO $$ DECLARE t text; owner_name text:=current_user; pred text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ClinicalSafetyPolicy',
    'ClinicalSafetyPolicyVersion',
    'ClinicalIncident',
    'ClinicalIncidentCounter',
    'EmergencyBreakGlassAccess',
    'PractitionerPrivilegeReview'
  ] LOOP
    pred:=format('CASE WHEN current_user=%L THEN false ELSE lamssa_security.context_allows("clinicId") END', owner_name);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY maintenance_owner ON public.%I FOR ALL TO %I USING (true) WITH CHECK (true)', t, owner_name);
    EXECUTE format('CREATE POLICY tenant_select ON public.%I FOR SELECT USING (%s)', t, pred);
    EXECUTE format('CREATE POLICY tenant_insert ON public.%I FOR INSERT WITH CHECK (%s)', t, pred);
    EXECUTE format('CREATE POLICY tenant_update ON public.%I FOR UPDATE USING (%s) WITH CHECK (%s)', t, pred, pred);
    EXECUTE format('CREATE POLICY tenant_delete ON public.%I FOR DELETE USING (false)', t);
  END LOOP;
END $$;
