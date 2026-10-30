-- Phase 3 Step 3.5 — Clinical Follow-ups, Recovery Monitoring & Treatment Outcomes
BEGIN;

-- 1. Enums
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FollowUpStatus') THEN
    CREATE TYPE public."FollowUpStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'MISSED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FollowUpSeverity') THEN
    CREATE TYPE public."FollowUpSeverity" AS ENUM ('MILD', 'MODERATE', 'SEVERE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AdverseEventStatus') THEN
    CREATE TYPE public."AdverseEventStatus" AS ENUM ('REPORTED', 'UNDER_EVALUATION', 'RESOLVED', 'ESCALATED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OutcomeMeasurementScale') THEN
    CREATE TYPE public."OutcomeMeasurementScale" AS ENUM ('CLINICAL_GLOBAL_IMPRESSION', 'PATIENT_SATISFACTION_5_POINT', 'VISUAL_ANALOG_SCALE_10', 'STRUCTURED_OBSERVATION');
  END IF;
END $$;

-- 2. ClinicalFollowUp
CREATE TABLE public."ClinicalFollowUp" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "treatingDoctorMembershipId" UUID NOT NULL,
    "encounterId" UUID,
    "treatmentPlanId" UUID,
    "procedureExecutionId" UUID,
    "appointmentId" UUID,
    "status" public."FollowUpStatus" NOT NULL DEFAULT 'SCHEDULED',
    "reason" VARCHAR(500) NOT NULL,
    "scheduledDate" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelReason" VARCHAR(500),
    "recoveryInstructions" VARCHAR(2000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ClinicalFollowUp_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ClinicalFollowUp_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "ClinicalFollowUp_patient_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "ClinicalFollowUp_treatingDoctor_fkey" FOREIGN KEY ("clinicId", "treatingDoctorMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "ClinicalFollowUp_encounter_fkey" FOREIGN KEY ("clinicId", "encounterId") REFERENCES public."ClinicalEncounter"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "ClinicalFollowUp_treatmentPlan_fkey" FOREIGN KEY ("clinicId", "treatmentPlanId") REFERENCES public."TreatmentPlan"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "ClinicalFollowUp_procedureExecution_fkey" FOREIGN KEY ("clinicId", "procedureExecutionId") REFERENCES public."ProcedureExecution"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "ClinicalFollowUp_appointment_fkey" FOREIGN KEY ("clinicId", "appointmentId") REFERENCES public."Appointment"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "clinical_follow_up_values" CHECK (
        version > 0
        AND length(btrim(reason)) >= 3
        AND (status != 'COMPLETED' OR "completedAt" IS NOT NULL)
        AND (status != 'CANCELLED' OR ("cancelledAt" IS NOT NULL AND "cancelReason" IS NOT NULL AND length(btrim("cancelReason")) >= 3))
    )
);

CREATE UNIQUE INDEX "ClinicalFollowUp_clinicId_id_key" ON public."ClinicalFollowUp"("clinicId", "id");
CREATE INDEX "ClinicalFollowUp_clinicId_patientId_scheduledDate_id_idx" ON public."ClinicalFollowUp"("clinicId", "patientId", "scheduledDate", "id");
CREATE INDEX "ClinicalFollowUp_clinicId_status_scheduledDate_idx" ON public."ClinicalFollowUp"("clinicId", "status", "scheduledDate");
CREATE INDEX "ClinicalFollowUp_clinicId_treatingDoctor_scheduledDate_idx" ON public."ClinicalFollowUp"("clinicId", "treatingDoctorMembershipId", "scheduledDate");

-- 3. FollowUpAssessment
CREATE TABLE public."FollowUpAssessment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "followUpId" UUID NOT NULL,
    "doctorMembershipId" UUID NOT NULL,
    "symptomsObserved" VARCHAR(2000) NOT NULL,
    "healingProgress" VARCHAR(1000) NOT NULL,
    "clinicalNotes" VARCHAR(4000) NOT NULL,
    "signedAt" TIMESTAMPTZ(3),
    "signatureSha256" VARCHAR(64),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FollowUpAssessment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FollowUpAssessment_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "FollowUpAssessment_followUp_fkey" FOREIGN KEY ("clinicId", "followUpId") REFERENCES public."ClinicalFollowUp"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "FollowUpAssessment_doctor_fkey" FOREIGN KEY ("clinicId", "doctorMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "followup_assessment_values" CHECK (
        version > 0
        AND length(btrim("symptomsObserved")) >= 2
        AND length(btrim("healingProgress")) >= 2
        AND length(btrim("clinicalNotes")) >= 2
        AND (("signedAt" IS NULL AND "signatureSha256" IS NULL) OR ("signedAt" IS NOT NULL AND "signatureSha256" IS NOT NULL AND length("signatureSha256") = 64))
    )
);

CREATE UNIQUE INDEX "FollowUpAssessment_clinicId_id_key" ON public."FollowUpAssessment"("clinicId", "id");
CREATE UNIQUE INDEX "FollowUpAssessment_clinicId_followUpId_key" ON public."FollowUpAssessment"("clinicId", "followUpId");
CREATE INDEX "FollowUpAssessment_clinicId_doctor_createdAt_idx" ON public."FollowUpAssessment"("clinicId", "doctorMembershipId", "createdAt");

-- 4. FollowUpAssessmentAmendment
CREATE TABLE public."FollowUpAssessmentAmendment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "assessmentId" UUID NOT NULL,
    "authorMembershipId" UUID NOT NULL,
    "amendmentReason" VARCHAR(1000) NOT NULL,
    "amendedContent" VARCHAR(4000) NOT NULL,
    "signedAt" TIMESTAMPTZ(3) NOT NULL,
    "signatureSha256" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowUpAssessmentAmendment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FollowUpAssessmentAmendment_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "FollowUpAssessmentAmendment_assessment_fkey" FOREIGN KEY ("clinicId", "assessmentId") REFERENCES public."FollowUpAssessment"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "FollowUpAssessmentAmendment_author_fkey" FOREIGN KEY ("clinicId", "authorMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "followup_amendment_values" CHECK (
        length(btrim("amendmentReason")) >= 5
        AND length(btrim("amendedContent")) >= 2
        AND length("signatureSha256") = 64
    )
);

CREATE UNIQUE INDEX "FollowUpAssessmentAmendment_clinicId_id_key" ON public."FollowUpAssessmentAmendment"("clinicId", "id");
CREATE INDEX "FollowUpAssessmentAmendment_clinicId_assessment_createdAt_idx" ON public."FollowUpAssessmentAmendment"("clinicId", "assessmentId", "createdAt", "id");

-- 5. TreatmentOutcome
CREATE TABLE public."TreatmentOutcome" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "followUpId" UUID,
    "procedureExecutionId" UUID,
    "treatmentPlanId" UUID,
    "photoComparisonGroupId" UUID,
    "recordedByMembershipId" UUID NOT NULL,
    "measurementScale" public."OutcomeMeasurementScale" NOT NULL,
    "clinicianScore" DECIMAL(5, 2),
    "clinicianNotes" VARCHAR(2000),
    "patientReportedScore" DECIMAL(5, 2),
    "patientReportedNotes" VARCHAR(2000),
    "recordedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TreatmentOutcome_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TreatmentOutcome_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "TreatmentOutcome_patient_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "TreatmentOutcome_followUp_fkey" FOREIGN KEY ("clinicId", "followUpId") REFERENCES public."ClinicalFollowUp"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "TreatmentOutcome_procedureExecution_fkey" FOREIGN KEY ("clinicId", "procedureExecutionId") REFERENCES public."ProcedureExecution"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "TreatmentOutcome_treatmentPlan_fkey" FOREIGN KEY ("clinicId", "treatmentPlanId") REFERENCES public."TreatmentPlan"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "TreatmentOutcome_photoComparison_fkey" FOREIGN KEY ("clinicId", "photoComparisonGroupId") REFERENCES public."PhotoComparisonGroup"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "TreatmentOutcome_recordedBy_fkey" FOREIGN KEY ("clinicId", "recordedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "treatment_outcome_values" CHECK (
        version > 0
        AND ("clinicianScore" IS NOT NULL OR "patientReportedScore" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "TreatmentOutcome_clinicId_id_key" ON public."TreatmentOutcome"("clinicId", "id");
CREATE INDEX "TreatmentOutcome_clinicId_patientId_recordedAt_id_idx" ON public."TreatmentOutcome"("clinicId", "patientId", "recordedAt", "id");
CREATE INDEX "TreatmentOutcome_clinicId_followUpId_idx" ON public."TreatmentOutcome"("clinicId", "followUpId");
CREATE INDEX "TreatmentOutcome_clinicId_procedureExecutionId_idx" ON public."TreatmentOutcome"("clinicId", "procedureExecutionId");

-- 6. AdverseEvent
CREATE TABLE public."AdverseEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "followUpId" UUID,
    "procedureExecutionId" UUID,
    "reportedByMembershipId" UUID NOT NULL,
    "eventType" VARCHAR(100) NOT NULL,
    "severity" public."FollowUpSeverity" NOT NULL,
    "observationDate" TIMESTAMPTZ(3) NOT NULL,
    "documentedFindings" VARCHAR(4000) NOT NULL,
    "status" public."AdverseEventStatus" NOT NULL DEFAULT 'REPORTED',
    "escalationNotes" VARCHAR(2000),
    "resolvedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AdverseEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AdverseEvent_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "AdverseEvent_patient_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "AdverseEvent_followUp_fkey" FOREIGN KEY ("clinicId", "followUpId") REFERENCES public."ClinicalFollowUp"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "AdverseEvent_procedureExecution_fkey" FOREIGN KEY ("clinicId", "procedureExecutionId") REFERENCES public."ProcedureExecution"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "AdverseEvent_reportedBy_fkey" FOREIGN KEY ("clinicId", "reportedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "adverse_event_values" CHECK (
        version > 0
        AND length(btrim("eventType")) >= 2
        AND length(btrim("documentedFindings")) >= 5
        AND (status != 'RESOLVED' OR "resolvedAt" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "AdverseEvent_clinicId_id_key" ON public."AdverseEvent"("clinicId", "id");
CREATE INDEX "AdverseEvent_clinicId_patientId_observationDate_id_idx" ON public."AdverseEvent"("clinicId", "patientId", "observationDate", "id");
CREATE INDEX "AdverseEvent_clinicId_status_observationDate_idx" ON public."AdverseEvent"("clinicId", "status", "observationDate");
CREATE INDEX "AdverseEvent_clinicId_severity_observationDate_idx" ON public."AdverseEvent"("clinicId", "severity", "observationDate");

-- 7. Trigger Guards & Immutability Functions

-- ClinicalFollowUp Guard
CREATE FUNCTION lamssa_security.clinical_followup_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Clinical follow-ups cannot be deleted' USING ERRCODE='42501';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."clinicId" IS DISTINCT FROM OLD."clinicId" OR NEW."patientId" IS DISTINCT FROM OLD."patientId" OR NEW."treatingDoctorMembershipId" IS DISTINCT FROM OLD."treatingDoctorMembershipId" OR NEW.version < OLD.version THEN
    RAISE EXCEPTION 'Clinical follow-up identity and doctor assignment are immutable' USING ERRCODE='42501';
  END IF;
  IF OLD.status IN ('COMPLETED', 'CANCELLED') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Terminal follow-up statuses (COMPLETED, CANCELLED) cannot reopen or change' USING ERRCODE='42501';
  END IF;
  IF NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public."FollowUpAssessment" fa
      WHERE fa."clinicId" = NEW."clinicId" AND fa."followUpId" = NEW.id AND fa."signedAt" IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Completed follow-up requires a signed assessment' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER clinical_followup_guard BEFORE UPDATE OR DELETE ON public."ClinicalFollowUp" FOR EACH ROW EXECUTE FUNCTION lamssa_security.clinical_followup_guard();

-- FollowUpAssessment Guard
CREATE FUNCTION lamssa_security.followup_assessment_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Follow-up assessments cannot be deleted' USING ERRCODE='42501';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."clinicId" IS DISTINCT FROM OLD."clinicId" OR NEW."followUpId" IS DISTINCT FROM OLD."followUpId" OR NEW."doctorMembershipId" IS DISTINCT FROM OLD."doctorMembershipId" OR NEW.version < OLD.version THEN
    RAISE EXCEPTION 'Follow-up assessment identity and doctor authorship are immutable' USING ERRCODE='42501';
  END IF;
  IF OLD."signedAt" IS NOT NULL THEN
    IF NEW."symptomsObserved" IS DISTINCT FROM OLD."symptomsObserved"
       OR NEW."healingProgress" IS DISTINCT FROM OLD."healingProgress"
       OR NEW."clinicalNotes" IS DISTINCT FROM OLD."clinicalNotes"
       OR NEW."signedAt" IS DISTINCT FROM OLD."signedAt"
       OR NEW."signatureSha256" IS DISTINCT FROM OLD."signatureSha256" THEN
      RAISE EXCEPTION 'Signed follow-up assessments are immutable; use amendments' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER followup_assessment_guard BEFORE UPDATE OR DELETE ON public."FollowUpAssessment" FOR EACH ROW EXECUTE FUNCTION lamssa_security.followup_assessment_guard();

-- FollowUpAssessmentAmendment Guard
CREATE FUNCTION lamssa_security.followup_assessment_amendment_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Follow-up assessment amendments cannot be deleted' USING ERRCODE='42501';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Follow-up assessment amendments are append-only and strictly immutable' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER followup_assessment_amendment_guard BEFORE UPDATE OR DELETE ON public."FollowUpAssessmentAmendment" FOR EACH ROW EXECUTE FUNCTION lamssa_security.followup_assessment_amendment_guard();

-- TreatmentOutcome Guard
CREATE FUNCTION lamssa_security.treatment_outcome_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Treatment outcomes cannot be deleted' USING ERRCODE='42501';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."clinicId" IS DISTINCT FROM OLD."clinicId" OR NEW."patientId" IS DISTINCT FROM OLD."patientId" OR NEW."recordedByMembershipId" IS DISTINCT FROM OLD."recordedByMembershipId" OR NEW.version < OLD.version THEN
    RAISE EXCEPTION 'Treatment outcome identity and provenance are immutable' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER treatment_outcome_guard BEFORE UPDATE OR DELETE ON public."TreatmentOutcome" FOR EACH ROW EXECUTE FUNCTION lamssa_security.treatment_outcome_guard();

-- AdverseEvent Guard
CREATE FUNCTION lamssa_security.adverse_event_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Adverse events cannot be deleted' USING ERRCODE='42501';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."clinicId" IS DISTINCT FROM OLD."clinicId" OR NEW."patientId" IS DISTINCT FROM OLD."patientId" OR NEW."reportedByMembershipId" IS DISTINCT FROM OLD."reportedByMembershipId" OR NEW."eventType" IS DISTINCT FROM OLD."eventType" OR NEW."observationDate" IS DISTINCT FROM OLD."observationDate" OR NEW.version < OLD.version THEN
    RAISE EXCEPTION 'Adverse event identity and initial observation details are immutable' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER adverse_event_guard BEFORE UPDATE OR DELETE ON public."AdverseEvent" FOR EACH ROW EXECUTE FUNCTION lamssa_security.adverse_event_guard();

-- 8. Hardening: Upgrade clinical_photo_guard to enforce active consent on INSERT
CREATE OR REPLACE FUNCTION lamssa_security.clinical_photo_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Clinical photos cannot be deleted' USING ERRCODE='42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Prevent upload/creation race condition if consent was withdrawn or expired
    IF NOT EXISTS (
      SELECT 1 FROM public."ClinicalPhotoSession" cps
      JOIN public."PatientConsent" pc ON pc.id = cps."consentId" AND pc."clinicId" = cps."clinicId"
      WHERE cps.id = NEW."photoSessionId"
        AND cps."clinicId" = NEW."clinicId"
        AND pc.status = 'ACTIVE'
        AND pc.purpose = 'CLINICAL_PHOTOGRAPHY'
        AND pc."verifiedAt" IS NOT NULL
        AND pc."validFrom" <= CURRENT_TIMESTAMP
        AND (pc."expiresAt" IS NULL OR pc."expiresAt" > CURRENT_TIMESTAMP)
        AND NOT EXISTS (
          SELECT 1 FROM public."ConsentWithdrawal" cw WHERE cw."patientConsentId" = pc.id AND cw."clinicId" = pc."clinicId"
        )
    ) THEN
      RAISE EXCEPTION 'Verified active clinical photography consent required to store photo' USING ERRCODE='42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."clinicId" IS DISTINCT FROM OLD."clinicId" OR NEW."patientId" IS DISTINCT FROM OLD."patientId" OR NEW."photoSessionId" IS DISTINCT FROM OLD."photoSessionId" OR NEW."clinicianMembershipId" IS DISTINCT FROM OLD."clinicianMembershipId" OR NEW."sha256Digest" IS DISTINCT FROM OLD."sha256Digest" OR NEW."storageKey" IS DISTINCT FROM OLD."storageKey" OR NEW."thumbnailStorageKey" IS DISTINCT FROM OLD."thumbnailStorageKey" OR NEW."byteSize" IS DISTINCT FROM OLD."byteSize" OR NEW."mimeType" IS DISTINCT FROM OLD."mimeType" OR NEW.version < OLD.version THEN
    RAISE EXCEPTION 'Clinical photo master and identity are immutable' USING ERRCODE='42501';
  END IF;
  IF OLD."isArchived" AND (NOT NEW."isArchived" OR NEW."archivedReason" IS DISTINCT FROM OLD."archivedReason") THEN
    RAISE EXCEPTION 'Archived clinical photos cannot be unarchived or modified' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS clinical_photo_guard ON public."ClinicalPhoto";
CREATE TRIGGER clinical_photo_guard BEFORE INSERT OR UPDATE OR DELETE ON public."ClinicalPhoto" FOR EACH ROW EXECUTE FUNCTION lamssa_security.clinical_photo_guard();

-- 9. FORCE ROW LEVEL SECURITY and Tenant Isolation
DO $$ DECLARE t text; owner_name text:=current_user; pred text; BEGIN
 FOREACH t IN ARRAY ARRAY['ClinicalFollowUp','FollowUpAssessment','FollowUpAssessmentAmendment','TreatmentOutcome','AdverseEvent'] LOOP
  pred:=format('CASE WHEN current_user=%L THEN false ELSE lamssa_security.context_allows("clinicId") END',owner_name);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY maintenance_owner ON public.%I FOR ALL TO %I USING (true) WITH CHECK (true)',t,owner_name);
  EXECUTE format('CREATE POLICY tenant_select ON public.%I FOR SELECT USING (%s)',t,pred);
  EXECUTE format('CREATE POLICY tenant_insert ON public.%I FOR INSERT WITH CHECK (%s)',t,pred);
  EXECUTE format('CREATE POLICY tenant_update ON public.%I FOR UPDATE USING (%s) WITH CHECK (%s)',t,pred,pred);
  EXECUTE format('CREATE POLICY tenant_delete ON public.%I FOR DELETE USING (false)',t);
 END LOOP;
END $$;

REVOKE ALL ON public."ClinicalFollowUp",public."FollowUpAssessment",public."FollowUpAssessmentAmendment",public."TreatmentOutcome",public."AdverseEvent" FROM PUBLIC;
REVOKE ALL ON FUNCTION lamssa_security.clinical_followup_guard(),lamssa_security.followup_assessment_guard(),lamssa_security.followup_assessment_amendment_guard(),lamssa_security.treatment_outcome_guard(),lamssa_security.adverse_event_guard() FROM PUBLIC;

DO $$ DECLARE r text; BEGIN
 FOR r IN SELECT DISTINCT grantee FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='Session' AND privilege_type='SELECT' AND grantee NOT IN(current_user,'PUBLIC') LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r AND (rolsuper OR rolbypassrls)) OR pg_has_role(r,current_user,'MEMBER') THEN RAISE EXCEPTION 'Unsafe runtime role'; END IF;
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public."ClinicalFollowUp",public."FollowUpAssessment",public."FollowUpAssessmentAmendment",public."TreatmentOutcome",public."AdverseEvent" TO %I',r);
 END LOOP;
END $$;

COMMENT ON TABLE public."ClinicalFollowUp" IS 'Clinical recovery and follow-up plan tracking post-procedure recovery under doctor supervision.';
COMMENT ON TABLE public."FollowUpAssessment" IS 'Clinician-signed recovery assessment with symptoms observed and healing evaluation.';
COMMENT ON TABLE public."FollowUpAssessmentAmendment" IS 'Attributable signed amendment preserving original assessment findings.';
COMMENT ON TABLE public."TreatmentOutcome" IS 'Standardized clinical and patient-reported outcome tracking with scale identification.';
COMMENT ON TABLE public."AdverseEvent" IS 'Clinician-documented adverse event recording observation, severity, and resolution lifecycle.';

COMMIT;
