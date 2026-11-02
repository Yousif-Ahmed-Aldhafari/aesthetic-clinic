-- Migration: 20261101000500_commissions_reconciliation_reporting
-- Step 4.5: Practitioner Commissions, Settlements, Adjustments & Financial Reporting

BEGIN;

-- 1. Create Enums
CREATE TYPE public."CommissionCalculationType" AS ENUM ('PERCENTAGE', 'FLAT_AMOUNT');
CREATE TYPE public."CommissionEarningEvent" AS ENUM ('PROCEDURE_COMPLETED', 'INVOICE_PAID');
CREATE TYPE public."CommissionPlanStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE public."CommissionAccrualStatus" AS ENUM ('PENDING', 'APPROVED', 'SETTLED', 'ADJUSTED', 'REVERSED');
CREATE TYPE public."CommissionAdjustmentReason" AS ENUM ('REFUND_REVERSAL', 'DISCOUNT_CORRECTION', 'DISPUTE_RESOLUTION', 'ADMINISTRATIVE_CORRECTION');
CREATE TYPE public."CommissionAdjustmentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE public."CommissionSettlementStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- 2. Create PractitionerCommissionPlan
CREATE TABLE public."PractitionerCommissionPlan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "status" public."CommissionPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "currency" CHAR(3) NOT NULL,
    "currencyScale" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PractitionerCommissionPlan_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PractitionerCommissionPlan_clinicId_id_key" UNIQUE ("clinicId", "id"),
    CONSTRAINT "PractitionerCommissionPlan_clinicId_code_key" UNIQUE ("clinicId", "code"),
    CONSTRAINT "PractitionerCommissionPlan_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "PractitionerCommissionPlan_clinicId_status_idx" ON public."PractitionerCommissionPlan"("clinicId", "status");

-- 3. Create PractitionerCommissionAssignment
CREATE TABLE public."PractitionerCommissionAssignment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "practitionerMembershipId" UUID NOT NULL,
    "effectiveFrom" TIMESTAMPTZ(3) NOT NULL,
    "effectiveTo" TIMESTAMPTZ(3),
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PractitionerCommissionAssignment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PractitionerCommissionAssignment_clinicId_id_key" UNIQUE ("clinicId", "id"),
    CONSTRAINT "PractitionerCommissionAssignment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PractitionerCommissionAssignment_plan_fkey" FOREIGN KEY ("clinicId", "planId") REFERENCES public."PractitionerCommissionPlan"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PractitionerCommissionAssignment_practitioner_fkey" FOREIGN KEY ("clinicId", "practitionerMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "PractitionerCommissionAssignment_clinicId_practitioner_idx" ON public."PractitionerCommissionAssignment"("clinicId", "practitionerMembershipId");
CREATE INDEX "PractitionerCommissionAssignment_clinicId_planId_idx" ON public."PractitionerCommissionAssignment"("clinicId", "planId");

-- 4. Create PractitionerCommissionRule
CREATE TABLE public."PractitionerCommissionRule" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "procedureId" UUID,
    "calculationType" public."CommissionCalculationType" NOT NULL,
    "rateBasisPoints" INTEGER,
    "flatAmountMinor" BIGINT,
    "earningEvent" public."CommissionEarningEvent" NOT NULL,
    "ruleVersion" INTEGER NOT NULL DEFAULT 1,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "description" VARCHAR(255),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PractitionerCommissionRule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PractitionerCommissionRule_clinicId_id_key" UNIQUE ("clinicId", "id"),
    CONSTRAINT "PractitionerCommissionRule_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PractitionerCommissionRule_plan_fkey" FOREIGN KEY ("clinicId", "planId") REFERENCES public."PractitionerCommissionPlan"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PractitionerCommissionRule_procedure_fkey" FOREIGN KEY ("clinicId", "procedureId") REFERENCES public."AestheticProcedureCatalog"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "chk_commission_rule_rate" CHECK ("rateBasisPoints" IS NULL OR ("rateBasisPoints" >= 0 AND "rateBasisPoints" <= 10000)),
    CONSTRAINT "chk_commission_rule_flat" CHECK ("flatAmountMinor" IS NULL OR "flatAmountMinor" >= 0),
    CONSTRAINT "chk_commission_rule_calc" CHECK (
        ("calculationType" = 'PERCENTAGE' AND "rateBasisPoints" IS NOT NULL) OR
        ("calculationType" = 'FLAT_AMOUNT' AND "flatAmountMinor" IS NOT NULL)
    )
);
CREATE INDEX "PractitionerCommissionRule_clinicId_planId_idx" ON public."PractitionerCommissionRule"("clinicId", "planId");
CREATE INDEX "PractitionerCommissionRule_clinicId_procedureId_idx" ON public."PractitionerCommissionRule"("clinicId", "procedureId");

-- 5. Create CommissionSettlementCounter
CREATE TABLE public."CommissionSettlementCounter" (
    "clinicId" UUID NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CommissionSettlementCounter_pkey" PRIMARY KEY ("clinicId"),
    CONSTRAINT "CommissionSettlementCounter_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "chk_commission_settlement_counter_positive" CHECK ("lastNumber" >= 0)
);

-- 6. Create PractitionerCommissionSettlement
CREATE TABLE public."PractitionerCommissionSettlement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "settlementNumber" VARCHAR(50) NOT NULL,
    "practitionerMembershipId" UUID NOT NULL,
    "periodStart" TIMESTAMPTZ(3) NOT NULL,
    "periodEnd" TIMESTAMPTZ(3) NOT NULL,
    "grossAmountMinor" BIGINT NOT NULL,
    "adjustmentsAmountMinor" BIGINT NOT NULL DEFAULT 0,
    "netSettledMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "currencyScale" INTEGER NOT NULL,
    "status" public."CommissionSettlementStatus" NOT NULL DEFAULT 'DRAFT',
    "payoutReference" VARCHAR(100),
    "confirmedByMembershipId" UUID,
    "confirmedAt" TIMESTAMPTZ(3),
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "requestKey" UUID NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PractitionerCommissionSettlement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PractitionerCommissionSettlement_clinicId_id_key" UNIQUE ("clinicId", "id"),
    CONSTRAINT "PractitionerCommissionSettlement_clinicId_settlementNumber_key" UNIQUE ("clinicId", "settlementNumber"),
    CONSTRAINT "PractitionerCommissionSettlement_clinicId_requestKey_key" UNIQUE ("clinicId", "requestKey"),
    CONSTRAINT "PractitionerCommissionSettlement_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PractitionerCommissionSettlement_practitioner_fkey" FOREIGN KEY ("clinicId", "practitionerMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PractitionerCommissionSettlement_confirmer_fkey" FOREIGN KEY ("clinicId", "confirmedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "chk_settlement_dates" CHECK ("periodEnd" >= "periodStart")
);
CREATE INDEX "PractitionerCommissionSettlement_clinicId_practitioner_idx" ON public."PractitionerCommissionSettlement"("clinicId", "practitionerMembershipId", "status");

-- 7. Create PractitionerCommissionAccrual
CREATE TABLE public."PractitionerCommissionAccrual" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "ruleId" UUID NOT NULL,
    "ruleVersion" INTEGER NOT NULL,
    "practitionerMembershipId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "procedureExecutionId" UUID,
    "appointmentId" UUID,
    "baseAmountMinor" BIGINT NOT NULL,
    "rateBasisPoints" INTEGER,
    "flatAmountMinor" BIGINT,
    "commissionAmountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "currencyScale" INTEGER NOT NULL,
    "status" public."CommissionAccrualStatus" NOT NULL DEFAULT 'PENDING',
    "earningEvent" public."CommissionEarningEvent" NOT NULL,
    "earnedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settlementId" UUID,
    "approvedByMembershipId" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "requestKey" UUID NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PractitionerCommissionAccrual_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PractitionerCommissionAccrual_clinicId_id_key" UNIQUE ("clinicId", "id"),
    CONSTRAINT "PractitionerCommissionAccrual_clinicId_requestKey_key" UNIQUE ("clinicId", "requestKey"),
    CONSTRAINT "PractitionerCommissionAccrual_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PractitionerCommissionAccrual_plan_fkey" FOREIGN KEY ("clinicId", "planId") REFERENCES public."PractitionerCommissionPlan"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PractitionerCommissionAccrual_rule_fkey" FOREIGN KEY ("clinicId", "ruleId") REFERENCES public."PractitionerCommissionRule"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PractitionerCommissionAccrual_practitioner_fkey" FOREIGN KEY ("clinicId", "practitionerMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PractitionerCommissionAccrual_patient_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PractitionerCommissionAccrual_invoice_fkey" FOREIGN KEY ("clinicId", "invoiceId") REFERENCES public."Invoice"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PractitionerCommissionAccrual_proc_fkey" FOREIGN KEY ("clinicId", "procedureExecutionId") REFERENCES public."ProcedureExecution"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PractitionerCommissionAccrual_appt_fkey" FOREIGN KEY ("clinicId", "appointmentId") REFERENCES public."Appointment"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PractitionerCommissionAccrual_settlement_fkey" FOREIGN KEY ("clinicId", "settlementId") REFERENCES public."PractitionerCommissionSettlement"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PractitionerCommissionAccrual_approver_fkey" FOREIGN KEY ("clinicId", "approvedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "chk_accrual_base_amount" CHECK ("baseAmountMinor" >= 0),
    CONSTRAINT "chk_accrual_commission_amount" CHECK ("commissionAmountMinor" >= 0)
);
CREATE INDEX "PractitionerCommissionAccrual_clinic_practitioner_status_idx" ON public."PractitionerCommissionAccrual"("clinicId", "practitionerMembershipId", "status");
CREATE INDEX "PractitionerCommissionAccrual_clinic_invoice_idx" ON public."PractitionerCommissionAccrual"("clinicId", "invoiceId");
CREATE INDEX "PractitionerCommissionAccrual_clinic_procedure_idx" ON public."PractitionerCommissionAccrual"("clinicId", "procedureExecutionId");
CREATE INDEX "PractitionerCommissionAccrual_clinic_settlement_idx" ON public."PractitionerCommissionAccrual"("clinicId", "settlementId");

-- 8. Create PractitionerCommissionAdjustment
CREATE TABLE public."PractitionerCommissionAdjustment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "accrualId" UUID NOT NULL,
    "settlementId" UUID,
    "adjustmentAmountMinor" BIGINT NOT NULL,
    "reason" public."CommissionAdjustmentReason" NOT NULL,
    "reasonDetails" VARCHAR(500) NOT NULL,
    "status" public."CommissionAdjustmentStatus" NOT NULL DEFAULT 'PENDING',
    "requestedByMembershipId" UUID NOT NULL,
    "decidedByMembershipId" UUID,
    "decidedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "requestKey" UUID NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PractitionerCommissionAdjustment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PractitionerCommissionAdjustment_clinicId_id_key" UNIQUE ("clinicId", "id"),
    CONSTRAINT "PractitionerCommissionAdjustment_clinicId_requestKey_key" UNIQUE ("clinicId", "requestKey"),
    CONSTRAINT "PractitionerCommissionAdjustment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PractitionerCommissionAdjustment_accrual_fkey" FOREIGN KEY ("clinicId", "accrualId") REFERENCES public."PractitionerCommissionAccrual"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PractitionerCommissionAdjustment_settlement_fkey" FOREIGN KEY ("clinicId", "settlementId") REFERENCES public."PractitionerCommissionSettlement"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PractitionerCommissionAdjustment_requester_fkey" FOREIGN KEY ("clinicId", "requestedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PractitionerCommissionAdjustment_decider_fkey" FOREIGN KEY ("clinicId", "decidedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "PractitionerCommissionAdjustment_clinic_accrual_idx" ON public."PractitionerCommissionAdjustment"("clinicId", "accrualId");
CREATE INDEX "PractitionerCommissionAdjustment_clinic_settlement_idx" ON public."PractitionerCommissionAdjustment"("clinicId", "settlementId");

-- 9. Trigger Guards (SECURITY INVOKER with SET search_path = pg_catalog, pg_temp)
CREATE OR REPLACE FUNCTION lamssa_security.commission_rule_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD."isPublished" = true AND (
      OLD."calculationType" <> NEW."calculationType" OR
      OLD."rateBasisPoints" IS DISTINCT FROM NEW."rateBasisPoints" OR
      OLD."flatAmountMinor" IS DISTINCT FROM NEW."flatAmountMinor" OR
      OLD."earningEvent" <> NEW."earningEvent" OR
      OLD."procedureId" IS DISTINCT FROM NEW."procedureId"
    ) AND OLD."ruleVersion" = NEW."ruleVersion" THEN
      RAISE EXCEPTION 'Modifying calculation parameters of a published commission rule requires bumping ruleVersion'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION lamssa_security.commission_rule_guard() FROM PUBLIC;

CREATE TRIGGER trg_commission_rule_guard
  BEFORE UPDATE ON public."PractitionerCommissionRule"
  FOR EACH ROW
  EXECUTE FUNCTION lamssa_security.commission_rule_guard();

CREATE OR REPLACE FUNCTION lamssa_security.commission_accrual_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD."status" = 'SETTLED' AND (
      OLD."commissionAmountMinor" <> NEW."commissionAmountMinor" OR
      OLD."baseAmountMinor" <> NEW."baseAmountMinor" OR
      OLD."practitionerMembershipId" <> NEW."practitionerMembershipId"
    ) THEN
      RAISE EXCEPTION 'Settled commission accruals cannot be directly modified; record a compensating PractitionerCommissionAdjustment instead'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION lamssa_security.commission_accrual_guard() FROM PUBLIC;

CREATE TRIGGER trg_commission_accrual_guard
  BEFORE UPDATE ON public."PractitionerCommissionAccrual"
  FOR EACH ROW
  EXECUTE FUNCTION lamssa_security.commission_accrual_guard();

-- 10. Enable and Force RLS
DO $$
DECLARE
  t text;
  pred text;
  owner_name text;
BEGIN
 SELECT current_user INTO owner_name;
 FOR t IN SELECT unnest(ARRAY[
   'PractitionerCommissionPlan',
   'PractitionerCommissionAssignment',
   'PractitionerCommissionRule',
   'CommissionSettlementCounter',
   'PractitionerCommissionSettlement',
   'PractitionerCommissionAccrual',
   'PractitionerCommissionAdjustment'
 ]) LOOP
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

-- 11. Revocations and Grants
REVOKE ALL ON FUNCTION
  lamssa_security.commission_rule_guard(),
  lamssa_security.commission_accrual_guard()
FROM PUBLIC;

DO $$ DECLARE r text; BEGIN
 FOR r IN SELECT DISTINCT grantee FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='Session' AND privilege_type='SELECT' AND grantee NOT IN(current_user,'PUBLIC') LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r AND (rolsuper OR rolbypassrls)) OR pg_has_role(r,current_user,'MEMBER') THEN RAISE EXCEPTION 'Unsafe runtime role'; END IF;
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public."PractitionerCommissionPlan",public."PractitionerCommissionAssignment",public."PractitionerCommissionRule",public."CommissionSettlementCounter",public."PractitionerCommissionSettlement",public."PractitionerCommissionAccrual",public."PractitionerCommissionAdjustment" TO %I',r);
 END LOOP;
END $$;

-- 12. Comments
COMMENT ON TABLE public."PractitionerCommissionPlan" IS 'Clinic-scoped compensation and commission plans for clinical practitioners.';
COMMENT ON TABLE public."PractitionerCommissionAssignment" IS 'Practitioner membership assignments to commission plans with validity intervals.';
COMMENT ON TABLE public."PractitionerCommissionRule" IS 'Tiered commission calculation rules per procedure or general service.';
COMMENT ON TABLE public."CommissionSettlementCounter" IS 'Atomic sequential counter for commission settlement batch numbering.';
COMMENT ON TABLE public."PractitionerCommissionSettlement" IS 'Aggregated commission settlement batches linked to external payout evidence.';
COMMENT ON TABLE public."PractitionerCommissionAccrual" IS 'Granular earned commission accruals linked to verified eligible clinical events.';
COMMENT ON TABLE public."PractitionerCommissionAdjustment" IS 'Compensating adjustments and reversals on commission accruals.';

COMMIT;

