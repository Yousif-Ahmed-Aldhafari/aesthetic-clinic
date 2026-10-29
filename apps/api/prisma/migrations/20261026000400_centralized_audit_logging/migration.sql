BEGIN;

-- CreateEnum
CREATE TYPE "AuditCategory" AS ENUM ('AUTH', 'IDENTITY', 'STAFF', 'PATIENTS', 'SCHEDULING', 'QUEUE', 'FINANCE', 'SECURITY', 'PLATFORM');

-- CreateEnum
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS', 'DENIED', 'FAILURE');

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "clinicId" UUID,
    "actorId" UUID,
    "actorEmail" VARCHAR(254),
    "action" VARCHAR(64) NOT NULL,
    "category" "AuditCategory" NOT NULL,
    "targetType" VARCHAR(64),
    "targetId" VARCHAR(64),
    "outcome" "AuditOutcome" NOT NULL DEFAULT 'SUCCESS',
    "correlationId" VARCHAR(64),
    "ipAddress" VARCHAR(64),
    "userAgent" VARCHAR(256),
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditEvent_clinicId_createdAt_id_idx" ON "AuditEvent"("clinicId", "createdAt" DESC, "id");
CREATE INDEX "AuditEvent_clinicId_category_createdAt_idx" ON "AuditEvent"("clinicId", "category", "createdAt" DESC);
CREATE INDEX "AuditEvent_clinicId_action_createdAt_idx" ON "AuditEvent"("clinicId", "action", "createdAt" DESC);
CREATE INDEX "AuditEvent_clinicId_actorId_createdAt_idx" ON "AuditEvent"("clinicId", "actorId", "createdAt" DESC);
CREATE INDEX "AuditEvent_correlationId_idx" ON "AuditEvent"("correlationId");

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Check Constraints
ALTER TABLE public."AuditEvent" ADD CONSTRAINT audit_action_length CHECK (length(action) <= 64);
ALTER TABLE public."AuditEvent" ADD CONSTRAINT audit_metadata_size CHECK (metadata IS NULL OR length(metadata::text) <= 16384);
ALTER TABLE public."AuditEvent" ADD CONSTRAINT audit_text_lengths CHECK (
  ("ipAddress" IS NULL OR length("ipAddress") <= 64) AND
  ("userAgent" IS NULL OR length("userAgent") <= 256) AND
  ("actorEmail" IS NULL OR length("actorEmail") <= 254) AND
  ("correlationId" IS NULL OR length("correlationId") <= 64) AND
  ("targetType" IS NULL OR length("targetType") <= 64) AND
  ("targetId" IS NULL OR length("targetId") <= 64)
);

-- Immutability trigger: runtime updates and deletions are rejected
CREATE OR REPLACE FUNCTION lamssa_security.reject_audit_mutation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' AND (current_user = 'lamssa_dev_migrator' OR current_user = 'lamssa_test_migrator' OR current_user = 'postgres') THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Audit records are append-only and immutable' USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON public."AuditEvent"
FOR EACH ROW EXECUTE FUNCTION lamssa_security.reject_audit_mutation();

-- Secure append function for transactional & out-of-band audit logging
CREATE OR REPLACE FUNCTION lamssa_security.record_audit_event(
  p_id uuid,
  p_clinic_id uuid,
  p_actor_id uuid,
  p_actor_email text,
  p_action text,
  p_category "AuditCategory",
  p_target_type text,
  p_target_id text,
  p_outcome "AuditOutcome",
  p_correlation_id text,
  p_ip_address text,
  p_user_agent text,
  p_metadata jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  INSERT INTO public."AuditEvent" (
    id, "clinicId", "actorId", "actorEmail", action, category,
    "targetType", "targetId", outcome, "correlationId",
    "ipAddress", "userAgent", metadata, "createdAt"
  ) VALUES (
    p_id, p_clinic_id, p_actor_id, p_actor_email, p_action, p_category,
    p_target_type, p_target_id, p_outcome, p_correlation_id,
    p_ip_address, p_user_agent, p_metadata, CURRENT_TIMESTAMP
  );
  RETURN p_id;
END;
$$;

-- Row Level Security
ALTER TABLE public."AuditEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AuditEvent" FORCE ROW LEVEL SECURITY;

DO $$
DECLARE owner_name text := current_user; pred text; write_pred text;
BEGIN
  EXECUTE format('CREATE POLICY maintenance_owner ON public."AuditEvent" FOR ALL TO %I USING (true) WITH CHECK (true)', owner_name);
  pred := format('CASE WHEN current_user = %L THEN false WHEN "clinicId" IS NULL THEN false ELSE lamssa_security.context_allows("clinicId") END', owner_name);
  EXECUTE format('CREATE POLICY tenant_select ON public."AuditEvent" FOR SELECT USING (%s)', pred);
  write_pred := format('CASE WHEN current_user = %L THEN true ELSE lamssa_security.context_allows("clinicId") END', owner_name);
  EXECUTE format('CREATE POLICY tenant_insert ON public."AuditEvent" FOR INSERT WITH CHECK (%s)', write_pred);
  EXECUTE 'CREATE POLICY tenant_update ON public."AuditEvent" FOR UPDATE USING (false) WITH CHECK (false)';
  EXECUTE 'CREATE POLICY tenant_delete ON public."AuditEvent" FOR DELETE USING (false)';
END;
$$;

REVOKE ALL ON FUNCTION lamssa_security.reject_audit_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION lamssa_security.record_audit_event(uuid,uuid,uuid,text,text,"AuditCategory",text,text,"AuditOutcome",text,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON public."AuditEvent" FROM PUBLIC;

DO $$ DECLARE runtime_name text; BEGIN
 FOR runtime_name IN SELECT DISTINCT grantee FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='Session' AND privilege_type='SELECT' AND grantee NOT IN(current_user,'PUBLIC') LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=runtime_name AND (rolsuper OR rolbypassrls)) OR pg_has_role(runtime_name,current_user,'MEMBER') THEN RAISE EXCEPTION 'Unsafe runtime'; END IF;
  EXECUTE format('GRANT SELECT, INSERT ON public."AuditEvent" TO %I', runtime_name);
  EXECUTE format('GRANT EXECUTE ON FUNCTION lamssa_security.record_audit_event(uuid,uuid,uuid,text,text,"AuditCategory",text,text,"AuditOutcome",text,text,text,jsonb) TO %I', runtime_name);
 END LOOP;
END; $$;

COMMIT;
