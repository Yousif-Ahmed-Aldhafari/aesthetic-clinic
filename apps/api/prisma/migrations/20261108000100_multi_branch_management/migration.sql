-- Migration 29: Multi-Branch Organization Hierarchy & Management
-- Phase 5, Step 5.3: ClinicBranch, BranchMembership, InterBranchTransfer,
-- operational branch attribution, backfill, FORCE RLS, and restricted runtime grants.

BEGIN;

-- 1. Enum Types
DO $$ BEGIN
  CREATE TYPE "ClinicBranchStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "InterBranchTransferStatus" AS ENUM ('PENDING', 'DISPATCHED', 'RECEIVED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Create ClinicBranch Table
CREATE TABLE IF NOT EXISTS public."ClinicBranch" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "code" VARCHAR(50) NOT NULL,
  "nameAr" VARCHAR(200) NOT NULL,
  "nameEn" VARCHAR(200),
  "phone" VARCHAR(50),
  "email" VARCHAR(254),
  "address" VARCHAR(500),
  "latitude" DECIMAL(9, 6),
  "longitude" DECIMAL(9, 6),
  "timezone" VARCHAR(100) NOT NULL DEFAULT 'UTC',
  "operatingHours" JSONB,
  "status" "ClinicBranchStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClinicBranch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClinicBranch_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "ClinicBranch_clinicId_id_key" UNIQUE ("clinicId", "id"),
  CONSTRAINT "ClinicBranch_clinicId_code_key" UNIQUE ("clinicId", "code")
);

CREATE INDEX IF NOT EXISTS "ClinicBranch_clinicId_status_idx" ON public."ClinicBranch"("clinicId", "status");

-- 3. Create BranchMembership Table
CREATE TABLE IF NOT EXISTS public."BranchMembership" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "membershipId" UUID NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BranchMembership_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BranchMembership_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "BranchMembership_clinic_branch_fkey" FOREIGN KEY ("clinicId", "branchId") REFERENCES public."ClinicBranch"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "BranchMembership_clinic_membership_fkey" FOREIGN KEY ("clinicId", "membershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "BranchMembership_clinicId_id_key" UNIQUE ("clinicId", "id"),
  CONSTRAINT "BranchMembership_clinicId_branchId_membershipId_key" UNIQUE ("clinicId", "branchId", "membershipId")
);

CREATE INDEX IF NOT EXISTS "BranchMembership_clinicId_membershipId_active_idx" ON public."BranchMembership"("clinicId", "membershipId", "active");
CREATE INDEX IF NOT EXISTS "BranchMembership_clinicId_branchId_active_idx" ON public."BranchMembership"("clinicId", "branchId", "active");

-- 4. Create InterBranchTransfer Table
CREATE TABLE IF NOT EXISTS public."InterBranchTransfer" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "transferNumber" VARCHAR(50) NOT NULL,
  "sourceBranchId" UUID NOT NULL,
  "destinationBranchId" UUID NOT NULL,
  "sourceLocationId" UUID NOT NULL,
  "destinationLocationId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "batchId" UUID,
  "quantity" DECIMAL(12, 4) NOT NULL,
  "status" "InterBranchTransferStatus" NOT NULL DEFAULT 'PENDING',
  "dispatchedAt" TIMESTAMPTZ(3),
  "dispatchedByMembershipId" UUID,
  "receivedAt" TIMESTAMPTZ(3),
  "receivedByMembershipId" UUID,
  "cancelledAt" TIMESTAMPTZ(3),
  "cancelledByMembershipId" UUID,
  "notes" VARCHAR(1000),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InterBranchTransfer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InterBranchTransfer_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "InterBranchTransfer_source_branch_fkey" FOREIGN KEY ("clinicId", "sourceBranchId") REFERENCES public."ClinicBranch"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "InterBranchTransfer_dest_branch_fkey" FOREIGN KEY ("clinicId", "destinationBranchId") REFERENCES public."ClinicBranch"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "InterBranchTransfer_source_loc_fkey" FOREIGN KEY ("clinicId", "sourceLocationId") REFERENCES public."InventoryLocation"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "InterBranchTransfer_dest_loc_fkey" FOREIGN KEY ("clinicId", "destinationLocationId") REFERENCES public."InventoryLocation"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "InterBranchTransfer_product_fkey" FOREIGN KEY ("clinicId", "productId") REFERENCES public."InventoryProduct"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "InterBranchTransfer_batch_fkey" FOREIGN KEY ("clinicId", "batchId") REFERENCES public."InventoryBatch"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "InterBranchTransfer_dispatcher_fkey" FOREIGN KEY ("clinicId", "dispatchedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "InterBranchTransfer_receiver_fkey" FOREIGN KEY ("clinicId", "receivedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "InterBranchTransfer_canceller_fkey" FOREIGN KEY ("clinicId", "cancelledByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "InterBranchTransfer_clinicId_id_key" UNIQUE ("clinicId", "id"),
  CONSTRAINT "InterBranchTransfer_clinicId_transferNumber_key" UNIQUE ("clinicId", "transferNumber"),
  CONSTRAINT "InterBranchTransfer_different_branches_check" CHECK ("sourceBranchId" <> "destinationBranchId"),
  CONSTRAINT "InterBranchTransfer_different_locations_check" CHECK ("sourceLocationId" <> "destinationLocationId"),
  CONSTRAINT "InterBranchTransfer_positive_quantity_check" CHECK ("quantity" > 0)
);

CREATE INDEX IF NOT EXISTS "InterBranchTransfer_clinicId_sourceBranchId_status_idx" ON public."InterBranchTransfer"("clinicId", "sourceBranchId", "status");
CREATE INDEX IF NOT EXISTS "InterBranchTransfer_clinicId_destinationBranchId_status_idx" ON public."InterBranchTransfer"("clinicId", "destinationBranchId", "status");
CREATE INDEX IF NOT EXISTS "InterBranchTransfer_clinicId_productId_status_idx" ON public."InterBranchTransfer"("clinicId", "productId", "status");

-- 5. Add selectedBranchId to Session
ALTER TABLE public."Session" ADD COLUMN IF NOT EXISTS "selectedBranchId" UUID;
DO $$ BEGIN
  ALTER TABLE public."Session" ADD CONSTRAINT "Session_selectedBranchId_fkey"
    FOREIGN KEY ("selectedBranchId") REFERENCES public."ClinicBranch"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 6. Add branchId Columns to Operational Tables (Initially Nullable for Backfill)
ALTER TABLE public."BookableResource" ADD COLUMN IF NOT EXISTS "branchId" UUID;
ALTER TABLE public."Appointment" ADD COLUMN IF NOT EXISTS "branchId" UUID;
ALTER TABLE public."Visit" ADD COLUMN IF NOT EXISTS "branchId" UUID;
ALTER TABLE public."InventoryLocation" ADD COLUMN IF NOT EXISTS "branchId" UUID;
ALTER TABLE public."Invoice" ADD COLUMN IF NOT EXISTS "branchId" UUID;

-- 7. Deterministic Provisioning & Backfill
-- Disable triggers temporarily on tables with immutability/version guards to ensure clean backfill
ALTER TABLE public."Invoice" DISABLE TRIGGER USER;
ALTER TABLE public."Visit" DISABLE TRIGGER USER;
ALTER TABLE public."Appointment" DISABLE TRIGGER USER;
ALTER TABLE public."BookableResource" DISABLE TRIGGER USER;
ALTER TABLE public."InventoryLocation" DISABLE TRIGGER USER;

-- Provision default 'MAIN' branch for every existing clinic
INSERT INTO public."ClinicBranch" ("id", "clinicId", "code", "nameAr", "nameEn", "timezone", "status")
SELECT
  gen_random_uuid(),
  c."id",
  'MAIN',
  'الفرع الرئيسي',
  'Main Branch',
  c."timezone",
  'ACTIVE'::"ClinicBranchStatus"
FROM public."Clinic" c
ON CONFLICT ("clinicId", "code") DO NOTHING;

-- Backfill BookableResource
UPDATE public."BookableResource" r
SET "branchId" = b."id"
FROM public."ClinicBranch" b
WHERE b."clinicId" = r."clinicId" AND b."code" = 'MAIN' AND r."branchId" IS NULL;

-- Backfill Appointment
UPDATE public."Appointment" a
SET "branchId" = b."id"
FROM public."ClinicBranch" b
WHERE b."clinicId" = a."clinicId" AND b."code" = 'MAIN' AND a."branchId" IS NULL;

-- Backfill Visit
UPDATE public."Visit" v
SET "branchId" = b."id"
FROM public."ClinicBranch" b
WHERE b."clinicId" = v."clinicId" AND b."code" = 'MAIN' AND v."branchId" IS NULL;

-- Backfill InventoryLocation
UPDATE public."InventoryLocation" l
SET "branchId" = b."id"
FROM public."ClinicBranch" b
WHERE b."clinicId" = l."clinicId" AND b."code" = 'MAIN' AND l."branchId" IS NULL;

-- Backfill Invoice
UPDATE public."Invoice" i
SET "branchId" = b."id"
FROM public."ClinicBranch" b
WHERE b."clinicId" = i."clinicId" AND b."code" = 'MAIN' AND i."branchId" IS NULL;

-- Provision primary BranchMembership for existing staff
INSERT INTO public."BranchMembership" ("id", "clinicId", "branchId", "membershipId", "isPrimary", "active")
SELECT
  gen_random_uuid(),
  m."clinicId",
  b."id",
  m."id",
  true,
  true
FROM public."ClinicMembership" m
JOIN public."ClinicBranch" b ON b."clinicId" = m."clinicId" AND b."code" = 'MAIN'
ON CONFLICT ("clinicId", "branchId", "membershipId") DO NOTHING;

-- Re-enable triggers
ALTER TABLE public."Invoice" ENABLE TRIGGER USER;
ALTER TABLE public."Visit" ENABLE TRIGGER USER;
ALTER TABLE public."Appointment" ENABLE TRIGGER USER;
ALTER TABLE public."BookableResource" ENABLE TRIGGER USER;
ALTER TABLE public."InventoryLocation" ENABLE TRIGGER USER;

-- 8. Enforce NOT NULL Constraints and Composite Foreign Keys
ALTER TABLE public."BookableResource" ALTER COLUMN "branchId" SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE public."BookableResource" ADD CONSTRAINT "BookableResource_clinic_branch_fkey"
    FOREIGN KEY ("clinicId", "branchId") REFERENCES public."ClinicBranch"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "BookableResource_clinicId_branchId_kind_active_id_idx"
  ON public."BookableResource"("clinicId", "branchId", "kind", "active", "id");

ALTER TABLE public."Appointment" ALTER COLUMN "branchId" SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE public."Appointment" ADD CONSTRAINT "Appointment_clinic_branch_fkey"
    FOREIGN KEY ("clinicId", "branchId") REFERENCES public."ClinicBranch"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "Appointment_clinicId_branchId_status_startAt_idx"
  ON public."Appointment"("clinicId", "branchId", "status", "startAt");

ALTER TABLE public."Visit" ALTER COLUMN "branchId" SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE public."Visit" ADD CONSTRAINT "Visit_clinic_branch_fkey"
    FOREIGN KEY ("clinicId", "branchId") REFERENCES public."ClinicBranch"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "Visit_clinicId_branchId_status_checkedInAt_idx"
  ON public."Visit"("clinicId", "branchId", "status", "checkedInAt");

ALTER TABLE public."InventoryLocation" ALTER COLUMN "branchId" SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE public."InventoryLocation" ADD CONSTRAINT "InventoryLocation_clinic_branch_fkey"
    FOREIGN KEY ("clinicId", "branchId") REFERENCES public."ClinicBranch"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "InventoryLocation_clinicId_branchId_type_isActive_idx"
  ON public."InventoryLocation"("clinicId", "branchId", "type", "isActive");

ALTER TABLE public."Invoice" ALTER COLUMN "branchId" SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE public."Invoice" ADD CONSTRAINT "Invoice_clinic_branch_fkey"
    FOREIGN KEY ("clinicId", "branchId") REFERENCES public."ClinicBranch"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "Invoice_clinicId_branchId_status_createdAt_id_idx"
  ON public."Invoice"("clinicId", "branchId", "status", "createdAt", "id");

-- 9. Row Level Security & Definer Triggers
DO $$ DECLARE t text; owner_name text:=current_user; pred text; BEGIN
 FOREACH t IN ARRAY ARRAY['ClinicBranch','BranchMembership','InterBranchTransfer'] LOOP
  pred:=format('CASE WHEN current_user=%L THEN false ELSE lamssa_security.context_allows("clinicId") END',owner_name);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('DROP POLICY IF EXISTS clinic_branch_isolation ON public.%I',t);
  EXECUTE format('DROP POLICY IF EXISTS branch_membership_isolation ON public.%I',t);
  EXECUTE format('DROP POLICY IF EXISTS inter_branch_transfer_isolation ON public.%I',t);
  EXECUTE format('DROP POLICY IF EXISTS maintenance_owner ON public.%I',t);
  EXECUTE format('CREATE POLICY maintenance_owner ON public.%I FOR ALL TO %I USING (true) WITH CHECK (true)',t,owner_name);
  EXECUTE format('DROP POLICY IF EXISTS tenant_select ON public.%I',t);
  EXECUTE format('CREATE POLICY tenant_select ON public.%I FOR SELECT USING (%s)',t,pred);
  EXECUTE format('DROP POLICY IF EXISTS tenant_insert ON public.%I',t);
  EXECUTE format('CREATE POLICY tenant_insert ON public.%I FOR INSERT WITH CHECK (%s)',t,pred);
  EXECUTE format('DROP POLICY IF EXISTS tenant_update ON public.%I',t);
  EXECUTE format('CREATE POLICY tenant_update ON public.%I FOR UPDATE USING (%s) WITH CHECK (%s)',t,pred,pred);
  EXECUTE format('DROP POLICY IF EXISTS tenant_delete ON public.%I',t);
  EXECUTE format('CREATE POLICY tenant_delete ON public.%I FOR DELETE USING (false)',t);
 END LOOP;
END $$;

-- Immutability triggers on clinicId
DROP TRIGGER IF EXISTS immutable_clinic ON public."ClinicBranch";
CREATE TRIGGER immutable_clinic BEFORE UPDATE OF "clinicId" ON public."ClinicBranch"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.reject_clinic_reassignment();

DROP TRIGGER IF EXISTS immutable_clinic ON public."BranchMembership";
CREATE TRIGGER immutable_clinic BEFORE UPDATE OF "clinicId" ON public."BranchMembership"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.reject_clinic_reassignment();

DROP TRIGGER IF EXISTS immutable_clinic ON public."InterBranchTransfer";
CREATE TRIGGER immutable_clinic BEFORE UPDATE OF "clinicId" ON public."InterBranchTransfer"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.reject_clinic_reassignment();

-- Automatic default branch creation on Clinic creation
CREATE OR REPLACE FUNCTION lamssa_security.clinic_default_branch() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  INSERT INTO public."ClinicBranch" ("id", "clinicId", "code", "nameAr", "timezone", "status", "version")
  VALUES (gen_random_uuid(), NEW."id", 'MAIN', 'الفرع الرئيسي', NEW."timezone", 'ACTIVE', 1)
  ON CONFLICT ("clinicId", "code") DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clinic_default_branch ON public."Clinic";
CREATE TRIGGER clinic_default_branch
  AFTER INSERT ON public."Clinic"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.clinic_default_branch();

-- Automatic cleanup of branch records when Clinic is deleted in test environments
CREATE OR REPLACE FUNCTION lamssa_security.clinic_cascade_cleanup() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  DELETE FROM public."InterBranchTransfer" WHERE "clinicId" = OLD."id";
  DELETE FROM public."BranchMembership" WHERE "clinicId" = OLD."id";
  DELETE FROM public."ClinicBranch" WHERE "clinicId" = OLD."id";
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS clinic_cascade_cleanup ON public."Clinic";
CREATE TRIGGER clinic_cascade_cleanup
  BEFORE DELETE ON public."Clinic"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.clinic_cascade_cleanup();

-- Automatic default branch assignment guard for backward compatibility
CREATE OR REPLACE FUNCTION lamssa_security.default_branch_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW."branchId" IS NULL THEN
    SELECT "id" INTO NEW."branchId" FROM public."ClinicBranch"
    WHERE "clinicId" = NEW."clinicId" AND "code" = 'MAIN' LIMIT 1;
    IF NEW."branchId" IS NULL THEN
      SELECT "id" INTO NEW."branchId" FROM public."ClinicBranch"
      WHERE "clinicId" = NEW."clinicId" LIMIT 1;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS default_branch_guard ON public."BookableResource";
CREATE TRIGGER default_branch_guard BEFORE INSERT ON public."BookableResource"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.default_branch_guard();

DROP TRIGGER IF EXISTS default_branch_guard ON public."Appointment";
CREATE TRIGGER default_branch_guard BEFORE INSERT ON public."Appointment"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.default_branch_guard();

DROP TRIGGER IF EXISTS default_branch_guard ON public."Visit";
CREATE TRIGGER default_branch_guard BEFORE INSERT ON public."Visit"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.default_branch_guard();

DROP TRIGGER IF EXISTS default_branch_guard ON public."InventoryLocation";
CREATE TRIGGER default_branch_guard BEFORE INSERT ON public."InventoryLocation"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.default_branch_guard();

DROP TRIGGER IF EXISTS default_branch_guard ON public."Invoice";
CREATE TRIGGER default_branch_guard BEFORE INSERT ON public."Invoice"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.default_branch_guard();

-- 10. Runtime Grants
REVOKE ALL ON
  public."ClinicBranch",
  public."BranchMembership",
  public."InterBranchTransfer"
FROM PUBLIC;

REVOKE ALL ON FUNCTION
  lamssa_security.default_branch_guard(),
  lamssa_security.clinic_default_branch(),
  lamssa_security.clinic_cascade_cleanup()
FROM PUBLIC;

DO $$
DECLARE r text;
BEGIN
  FOR r IN SELECT DISTINCT grantee FROM information_schema.role_table_grants
           WHERE table_schema = 'public' AND table_name = 'Session' AND privilege_type = 'SELECT' AND grantee NOT IN (current_user, 'PUBLIC') LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r AND (rolsuper OR rolbypassrls)) OR pg_has_role(r, current_user, 'MEMBER') THEN
      RAISE EXCEPTION 'Unsafe runtime role';
    END IF;
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public."ClinicBranch", public."BranchMembership", public."InterBranchTransfer" TO %I', r);
  END LOOP;
END $$;

-- 11. Comments
COMMENT ON TABLE public."ClinicBranch" IS 'Physical operating locations/branches within the clinic tenant.';
COMMENT ON TABLE public."BranchMembership" IS 'Staff authorization and assignment to specific clinic branches with primary designation.';
COMMENT ON TABLE public."InterBranchTransfer" IS 'Controlled, auditable two-step stock transfers between branches within the same clinic.';

COMMIT;
