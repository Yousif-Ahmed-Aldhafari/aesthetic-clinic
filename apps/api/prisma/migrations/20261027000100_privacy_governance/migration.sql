-- Phase 2, Step 2.3: Privacy, Data Retention and Data Governance
-- Additive only: new tables, enum values, indexes. No existing data altered.

BEGIN;

-- ============================================================
-- 1. Extend AuditCategory enum with PRIVACY
-- ============================================================
ALTER TYPE "AuditCategory" ADD VALUE IF NOT EXISTS 'PRIVACY';

-- ============================================================
-- 2. Privacy Request enums and table
-- ============================================================

CREATE TYPE "PrivacyRequestType" AS ENUM (
  'ACCESS',        -- Patient requests copy of their administrative record
  'CORRECTION',    -- Patient requests correction of administrative record
  'RESTRICTION',   -- Patient requests processing restriction
  'EXPORT',        -- Patient requests machine-readable export
  'ERASURE'        -- Patient requests erasure assessment (may be denied)
);

CREATE TYPE "PrivacyRequestStatus" AS ENUM (
  'OPEN',          -- Submitted, awaiting clinic review
  'IN_REVIEW',     -- Clinic is actively processing
  'APPROVED',      -- Request approved (may trigger export or correction)
  'DENIED',        -- Request denied with documented reason
  'COMPLETED',     -- Request fulfilled; evidence recorded
  'WITHDRAWN',     -- Requestor withdrew the request
  'HELD'           -- Legal hold prevents processing
);

-- Tracks patient privacy rights requests per clinic. Tenant-scoped.
CREATE TABLE public."PrivacyRequest" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId"       UUID NOT NULL,
  "patientId"      UUID,                           -- NULL for anonymous/pre-reg requests
  "patientName"    VARCHAR(200) NOT NULL,           -- Name at time of submission
  "patientContact" VARCHAR(254),                   -- Email or phone for correspondence
  "requestType"    "PrivacyRequestType" NOT NULL,
  "status"         "PrivacyRequestStatus" NOT NULL DEFAULT 'OPEN',
  "subject"        VARCHAR(500) NOT NULL,           -- Brief subject of the request
  "notes"          TEXT,                            -- Clinic-internal notes (never returned to patient)
  "decisionReason" VARCHAR(2000),                   -- Documented reason for approval/denial
  "decisionBy"     UUID,                            -- actorMembershipId of reviewer
  "decisionAt"     TIMESTAMPTZ(3),
  "completedAt"    TIMESTAMPTZ(3),
  "legalHold"      BOOLEAN NOT NULL DEFAULT FALSE,  -- Blocks automated processing
  "legalHoldReason" VARCHAR(500),
  "requestedAt"    TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "version"        INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "PrivacyRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PrivacyRequest_clinicId_status_idx" ON public."PrivacyRequest"("clinicId", "status", "requestedAt" DESC);
CREATE INDEX "PrivacyRequest_clinicId_patientId_idx" ON public."PrivacyRequest"("clinicId", "patientId");
CREATE INDEX "PrivacyRequest_clinicId_type_idx" ON public."PrivacyRequest"("clinicId", "requestType");

ALTER TABLE public."PrivacyRequest"
  ADD CONSTRAINT "PrivacyRequest_patientName_length" CHECK (length("patientName") >= 1 AND length("patientName") <= 200),
  ADD CONSTRAINT "PrivacyRequest_subject_length" CHECK (length("subject") >= 1 AND length("subject") <= 500),
  ADD CONSTRAINT "PrivacyRequest_decision_requires_actor" CHECK (
    ("decisionReason" IS NULL AND "decisionBy" IS NULL AND "decisionAt" IS NULL) OR
    ("decisionReason" IS NOT NULL AND "decisionBy" IS NOT NULL AND "decisionAt" IS NOT NULL)
  ),
  ADD CONSTRAINT "PrivacyRequest_legal_hold_reason" CHECK (
    ("legalHold" = FALSE AND "legalHoldReason" IS NULL) OR
    "legalHold" = TRUE
  ),
  ADD CONSTRAINT "PrivacyRequest_version_positive" CHECK ("version" >= 1);

-- ============================================================
-- 3. Patient Export — tracks generated data exports
-- ============================================================

CREATE TYPE "ExportStatus" AS ENUM (
  'PENDING',    -- Generation requested
  'READY',      -- Generated and downloadable
  'EXPIRED',    -- Past expiry, file purged
  'REVOKED'     -- Manually revoked before expiry
);

-- Tracks patient data exports. Exports are scoped per clinic and expire.
CREATE TABLE public."PatientExport" (
  "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId"          UUID NOT NULL,
  "privacyRequestId"  UUID,                        -- Optional link to a privacy request
  "patientId"         UUID NOT NULL,
  "generatedBy"       UUID NOT NULL,               -- actorMembershipId
  "status"            "ExportStatus" NOT NULL DEFAULT 'PENDING',
  "purpose"           VARCHAR(200) NOT NULL,        -- Brief documented purpose
  "tokenHash"         CHAR(64),                    -- SHA-256 of download token; null until ready
  "expiresAt"         TIMESTAMPTZ(3),
  "downloadCount"     INTEGER NOT NULL DEFAULT 0,
  "maxDownloads"      INTEGER NOT NULL DEFAULT 3,  -- Limit repeated downloads
  "revokedAt"         TIMESTAMPTZ(3),
  "revokeReason"      VARCHAR(200),
  "fileSizeBytes"     BIGINT,
  "createdAt"         TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatientExport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PatientExport_tokenHash_key" ON public."PatientExport"("tokenHash") WHERE "tokenHash" IS NOT NULL;
CREATE INDEX "PatientExport_clinicId_patientId_idx" ON public."PatientExport"("clinicId", "patientId", "createdAt" DESC);
CREATE INDEX "PatientExport_clinicId_status_idx" ON public."PatientExport"("clinicId", "status");
CREATE INDEX "PatientExport_privacyRequestId_idx" ON public."PatientExport"("privacyRequestId") WHERE "privacyRequestId" IS NOT NULL;

ALTER TABLE public."PatientExport"
  ADD CONSTRAINT "PatientExport_purpose_length" CHECK (length("purpose") >= 1 AND length("purpose") <= 200),
  ADD CONSTRAINT "PatientExport_downloads_bounded" CHECK ("downloadCount" >= 0 AND "maxDownloads" >= 1),
  ADD CONSTRAINT "PatientExport_revoke_integrity" CHECK (
    ("revokedAt" IS NULL AND "revokeReason" IS NULL) OR
    ("revokedAt" IS NOT NULL)
  );

-- ============================================================
-- 4. Retention Policy — per-clinic, dry-run configuration
-- ============================================================

-- Retention policy: one row per clinic, no automatic deletion activated.
-- All values are in days. NULL means no configured limit (platform/legal default applies).
-- Deletions NEVER execute automatically; this is a dry-run/reporting framework.
CREATE TABLE public."RetentionPolicy" (
  "clinicId"              UUID NOT NULL,
  "policyVersion"         INTEGER NOT NULL DEFAULT 1,
  "dryRunOnly"            BOOLEAN NOT NULL DEFAULT TRUE,   -- MUST remain TRUE until legal review
  "patientRecordDays"     INTEGER,   -- Days to retain inactive patient admin records
  "appointmentDays"       INTEGER,   -- Days to retain completed/cancelled appointment data
  "visitDays"             INTEGER,   -- Days to retain visit records
  "auditEventDays"        INTEGER,   -- Audit log retention (must not override minimums)
  "backupRetentionDays"   INTEGER,   -- How many days encrypted backups are retained
  "exportRetentionDays"   INTEGER NOT NULL DEFAULT 7,   -- Days export files remain available
  "privacyRequestDays"    INTEGER,   -- Days to retain completed privacy requests
  "configuredBy"          UUID,      -- actorMembershipId of last update
  "configuredAt"          TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RetentionPolicy_pkey" PRIMARY KEY ("clinicId"),
  -- Enforce platform minimums via check constraints (legal review required before lowering)
  CONSTRAINT "RetentionPolicy_audit_minimum" CHECK ("auditEventDays" IS NULL OR "auditEventDays" >= 90),
  CONSTRAINT "RetentionPolicy_backup_minimum" CHECK ("backupRetentionDays" IS NULL OR "backupRetentionDays" >= 7),
  CONSTRAINT "RetentionPolicy_export_sane" CHECK ("exportRetentionDays" >= 1 AND "exportRetentionDays" <= 30),
  CONSTRAINT "RetentionPolicy_dry_run_guard" CHECK ("dryRunOnly" = TRUE)  -- Remove only after legal sign-off
);

-- ============================================================
-- 5. Foreign key constraints
-- ============================================================

ALTER TABLE public."PrivacyRequest"
  ADD CONSTRAINT "PrivacyRequest_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."PatientExport"
  ADD CONSTRAINT "PatientExport_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."RetentionPolicy"
  ADD CONSTRAINT "RetentionPolicy_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ============================================================
-- 6. RLS policies on new tables (mirrors existing FORCE RLS pattern)
-- ============================================================

ALTER TABLE public."PrivacyRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PrivacyRequest" FORCE ROW LEVEL SECURITY;

ALTER TABLE public."PatientExport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PatientExport" FORCE ROW LEVEL SECURITY;

ALTER TABLE public."RetentionPolicy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."RetentionPolicy" FORCE ROW LEVEL SECURITY;

-- Maintenance owner bypasses for migrations/seeds/cleanup
CREATE POLICY "maintenance_owner" ON public."PrivacyRequest" FOR ALL TO current_user USING (true) WITH CHECK (true);
CREATE POLICY "maintenance_owner" ON public."PatientExport" FOR ALL TO current_user USING (true) WITH CHECK (true);
CREATE POLICY "maintenance_owner" ON public."RetentionPolicy" FOR ALL TO current_user USING (true) WITH CHECK (true);

-- PrivacyRequest: tenant-scoped by clinicId
CREATE POLICY "privacy_request_tenant" ON public."PrivacyRequest"
  USING (lamssa_security.context_allows("clinicId"))
  WITH CHECK (lamssa_security.context_allows("clinicId"));

-- PatientExport: tenant-scoped by clinicId
CREATE POLICY "patient_export_tenant" ON public."PatientExport"
  USING (lamssa_security.context_allows("clinicId"))
  WITH CHECK (lamssa_security.context_allows("clinicId"));

-- RetentionPolicy: tenant-scoped by clinicId
CREATE POLICY "retention_policy_tenant" ON public."RetentionPolicy"
  USING (lamssa_security.context_allows("clinicId"))
  WITH CHECK (lamssa_security.context_allows("clinicId"));

-- ============================================================
-- 7. Retention dry-run reporting function (security definer)
-- ============================================================

CREATE FUNCTION lamssa_security.retention_dry_run(target_clinic uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  policy_row public."RetentionPolicy"%ROWTYPE;
  result jsonb;
BEGIN
  SELECT * INTO policy_row
  FROM public."RetentionPolicy"
  WHERE "clinicId" = target_clinic;

  -- Returns row counts that WOULD be eligible for retention actions under the policy.
  -- Never deletes or modifies any data. Dry-run only.
  SELECT jsonb_build_object(
    'clinicId', target_clinic,
    'dryRunOnly', TRUE,
    'generatedAt', now(),
    'eligible', jsonb_build_object(
      'patients', (
        SELECT count(*)
        FROM public."Patient"
        WHERE "clinicId" = target_clinic
          AND "status" = 'INACTIVE'
          AND policy_row."patientRecordDays" IS NOT NULL
          AND "updatedAt" < now() - (policy_row."patientRecordDays" || ' days')::interval
      ),
      'appointments', (
        SELECT count(*)
        FROM public."Appointment"
        WHERE "clinicId" = target_clinic
          AND status IN ('COMPLETED', 'CANCELLED', 'NO_SHOW')
          AND policy_row."appointmentDays" IS NOT NULL
          AND "updatedAt" < now() - (policy_row."appointmentDays" || ' days')::interval
      ),
      'auditEvents', (
        SELECT count(*)
        FROM public."AuditEvent"
        WHERE "clinicId" = target_clinic
          AND policy_row."auditEventDays" IS NOT NULL
          AND "createdAt" < now() - (policy_row."auditEventDays" || ' days')::interval
      ),
      'exports', (
        SELECT count(*)
        FROM public."PatientExport"
        WHERE "clinicId" = target_clinic
          AND "status" = 'READY'
          AND "expiresAt" IS NOT NULL
          AND "expiresAt" < now()
      ),
      'privacyRequests', (
        SELECT count(*)
        FROM public."PrivacyRequest"
        WHERE "clinicId" = target_clinic
          AND "status" IN ('COMPLETED', 'WITHDRAWN', 'DENIED')
          AND policy_row."privacyRequestDays" IS NOT NULL
          AND "updatedAt" < now() - (policy_row."privacyRequestDays" || ' days')::interval
      )
    ),
    'note', 'Dry-run report only. No data modified. Legal review required before activation.'
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION lamssa_security.retention_dry_run(uuid) FROM PUBLIC;

-- Grant to runtime roles (same pattern as clinic_mfa_policy)
DO $$
DECLARE
  runtime_name text;
BEGIN
  FOR runtime_name IN
    SELECT DISTINCT grantee FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='Session' AND privilege_type='SELECT'
      AND grantee NOT IN (current_user, 'PUBLIC')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION lamssa_security.retention_dry_run(uuid) TO %I', runtime_name);
  END LOOP;
END;
$$;

COMMIT;
