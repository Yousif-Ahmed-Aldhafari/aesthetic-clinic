-- Preserve applied history: tighten financial command/actor checks additively.
BEGIN;
DO $$
DECLARE owner_name text:=current_user;
BEGIN
  -- Receptionists can update draft/payment balances but cannot void via runtime SQL.
  EXECUTE format('ALTER POLICY tenant_update ON public."Invoice" WITH CHECK (CASE WHEN current_user=%L THEN false ELSE lamssa_security.finance_allows("clinicId",status=''VOID'') END)',owner_name);
  -- An appended audit actor must be the membership behind the verified context.
  EXECUTE format('ALTER POLICY tenant_insert ON public."FinancialAuditEvent" WITH CHECK (CASE WHEN current_user=%L THEN false ELSE lamssa_security.finance_allows("clinicId",false) AND EXISTS (SELECT 1 FROM public."ClinicMembership" m WHERE m.id="FinancialAuditEvent"."actorMembershipId" AND m."clinicId"="FinancialAuditEvent"."clinicId" AND m."userId"=lamssa_security.context_uuid(''lamssa.user_id'') AND m.status=''ACTIVE'') END)',owner_name);
END;
$$;
COMMIT;
