-- Migration 20261112000200_webhook_security_hardening
-- Security Hardening: Elimination of session-GUC reliance, single-use ticketed webhook authorization,
-- immutable PaymentProviderEvent ledger policies, and normalized RLS maintenance_owner.

ALTER TABLE public."PaymentIntent"
  ADD COLUMN IF NOT EXISTS "webhookTicketHash" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "webhookTicketExpiresAt" TIMESTAMPTZ(3);

-- 1. Redefine context_allows to strictly require staff or patient session (Zero GUC bypass)
CREATE OR REPLACE FUNCTION lamssa_security.context_allows(target_clinic uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  SELECT COALESCE(
    target_clinic = lamssa_security.context_uuid('lamssa.clinic_id') AND (
      EXISTS (
        SELECT 1 FROM public."Session" s
        JOIN public."User" u ON u.id = s."userId"
        JOIN public."ClinicMembership" m ON m."userId" = u.id AND m."clinicId" = target_clinic
        JOIN public."Clinic" c ON c.id = m."clinicId"
        WHERE s.id = lamssa_security.context_uuid('lamssa.session_id')
          AND s."userId" = lamssa_security.context_uuid('lamssa.user_id')
          AND s."selectedClinicId" = target_clinic AND s."revokedAt" IS NULL
          AND s."expiresAt" > statement_timestamp()
          AND u.status = 'ACTIVE' AND m.status = 'ACTIVE' AND c.status = 'ACTIVE'
      )
      OR
      EXISTS (
        SELECT 1 FROM public."PatientSession" ps
        JOIN public."PatientAccount" pa ON pa.id = ps."patientAccountId" AND pa."clinicId" = target_clinic
        JOIN public."Patient" p ON p.id = pa."patientId" AND p."clinicId" = target_clinic
        JOIN public."Clinic" c ON c.id = target_clinic
        WHERE ps.id = lamssa_security.context_uuid('lamssa.patient_session_id')
          AND pa.id = lamssa_security.context_uuid('lamssa.patient_account_id')
          AND p.id = lamssa_security.context_uuid('lamssa.patient_id')
          AND ps."clinicId" = target_clinic
          AND ps."revokedAt" IS NULL
          AND ps."expiresAt" > statement_timestamp()
          AND pa.status = 'ACTIVE' AND p.status = 'ACTIVE' AND c.status = 'ACTIVE'
      )
    ), false);
$function$;

-- 2. Drop and recreate resolve_payment_webhook_target to generate single-use authorization ticket and project intent fields
DROP FUNCTION IF EXISTS lamssa_security.resolve_payment_webhook_target(public."PaymentProviderCode", text);

CREATE OR REPLACE FUNCTION lamssa_security.resolve_payment_webhook_target(
  p_provider_code public."PaymentProviderCode",
  p_provider_intent_id text
)
RETURNS TABLE(
  "clinicId" uuid,
  "paymentIntentId" uuid,
  "providerConfigId" uuid,
  "encryptedWebhookSecret" text,
  "mode" public."IntegrationMode",
  "isEnabled" boolean,
  "webhookTicket" text,
  "amountMinor" bigint,
  "currency" text,
  "status" public."PaymentIntentStatus",
  "postedPaymentId" uuid,
  "invoiceId" uuid
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_ticket text;
  v_rec record;
BEGIN
  v_ticket := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  SELECT
    pi."clinicId",
    pi.id AS "paymentIntentId",
    ppc.id AS "providerConfigId",
    ppc."encryptedWebhookSecret",
    ppc.mode,
    ppc."isEnabled",
    pi."amountMinor",
    pi.currency,
    pi.status,
    pi."postedPaymentId",
    pi."invoiceId"
  INTO v_rec
  FROM public."PaymentIntent" pi
  JOIN public."PaymentProviderConfiguration" ppc
    ON ppc."clinicId" = pi."clinicId" AND ppc.id = pi."providerConfigId"
  JOIN public."Clinic" c ON c.id = pi."clinicId"
  WHERE pi."providerCode" = p_provider_code
    AND pi."providerIntentId" = p_provider_intent_id
    AND ppc."isEnabled" = true
    AND c.status = 'ACTIVE'
  LIMIT 1
  FOR UPDATE OF pi;

  IF FOUND THEN
    UPDATE public."PaymentIntent" AS pi_upd
    SET
      "webhookTicketHash" = encode(sha256(v_ticket::bytea), 'hex'),
      "webhookTicketExpiresAt" = clock_timestamp() + interval '120 seconds'
    WHERE pi_upd."clinicId" = v_rec."clinicId" AND pi_upd.id = v_rec."paymentIntentId";

    RETURN QUERY
    SELECT
      v_rec."clinicId",
      v_rec."paymentIntentId",
      v_rec."providerConfigId",
      v_rec."encryptedWebhookSecret",
      v_rec.mode,
      v_rec."isEnabled",
      v_ticket,
      v_rec."amountMinor",
      v_rec.currency::text,
      v_rec.status,
      v_rec."postedPaymentId",
      v_rec."invoiceId";
  END IF;
END;
$$;

-- 3. Dedicated security definer ingestion for PaymentProviderEvent requiring valid webhook ticket
CREATE OR REPLACE FUNCTION lamssa_security.ingest_payment_webhook_event(
  p_clinic_id uuid,
  p_payment_intent_id uuid,
  p_webhook_ticket text,
  p_provider_code public."PaymentProviderCode",
  p_provider_event_id text,
  p_event_type text,
  p_raw_payload_hash text,
  p_sanitized_payload jsonb,
  p_event_timestamp timestamptz,
  p_signature_verified boolean
)
RETURNS TABLE(
  "eventId" uuid,
  "processingStatus" public."WebhookProcessingStatus",
  duplicate boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_intent public."PaymentIntent"%ROWTYPE;
  v_existing public."PaymentProviderEvent"%ROWTYPE;
  v_new_id uuid := gen_random_uuid();
BEGIN
  IF p_webhook_ticket IS NULL OR length(p_webhook_ticket) < 32 THEN
    RAISE EXCEPTION 'Missing or invalid webhook authorization ticket' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_intent
  FROM public."PaymentIntent"
  WHERE "clinicId" = p_clinic_id AND id = p_payment_intent_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PaymentIntent not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_intent."webhookTicketHash" IS NULL
     OR v_intent."webhookTicketHash" != encode(sha256(p_webhook_ticket::bytea), 'hex')
     OR v_intent."webhookTicketExpiresAt" < clock_timestamp() THEN
    RAISE EXCEPTION 'Invalid or expired webhook authorization ticket' USING ERRCODE = '42501';
  END IF;

  -- Idempotency check on provider event
  SELECT * INTO v_existing
  FROM public."PaymentProviderEvent"
  WHERE "clinicId" = p_clinic_id
    AND "providerCode" = p_provider_code
    AND "providerEventId" = p_provider_event_id;

  IF FOUND THEN
    IF v_existing."rawPayloadHash" != p_raw_payload_hash THEN
      RAISE EXCEPTION 'Webhook event payload mismatch' USING ERRCODE = '23505';
    END IF;
    RETURN QUERY SELECT v_existing.id, v_existing."processingStatus", true;
    RETURN;
  END IF;

  -- Insert event under table owner privileges
  INSERT INTO public."PaymentProviderEvent" (
    id,
    "clinicId",
    "providerConfigId",
    "paymentIntentId",
    "providerCode",
    "providerEventId",
    "eventType",
    "signatureVerified",
    "eventTimestamp",
    "rawPayloadHash",
    "sanitizedPayload",
    "processingStatus",
    "retryCount",
    "createdAt"
  ) VALUES (
    v_new_id,
    p_clinic_id,
    v_intent."providerConfigId",
    v_intent.id,
    p_provider_code,
    p_provider_event_id,
    p_event_type,
    p_signature_verified,
    p_event_timestamp,
    p_raw_payload_hash,
    p_sanitized_payload,
    'RECEIVED',
    0,
    clock_timestamp()
  );

  RETURN QUERY SELECT v_new_id, 'RECEIVED'::public."WebhookProcessingStatus", false;
END;
$$;

-- 4. Update webhook event status (for DEAD_LETTER / IGNORED_DUPLICATE / PROCESSED)
CREATE OR REPLACE FUNCTION lamssa_security.update_payment_webhook_event_status(
  p_clinic_id uuid,
  p_payment_intent_id uuid,
  p_event_id uuid,
  p_webhook_ticket text,
  p_new_status public."WebhookProcessingStatus",
  p_error_message text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_intent public."PaymentIntent"%ROWTYPE;
BEGIN
  IF p_webhook_ticket IS NULL OR length(p_webhook_ticket) < 32 THEN
    RAISE EXCEPTION 'Missing or invalid webhook authorization ticket' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_intent
  FROM public."PaymentIntent"
  WHERE "clinicId" = p_clinic_id AND id = p_payment_intent_id
  FOR UPDATE;

  IF NOT FOUND OR v_intent."webhookTicketHash" IS NULL
     OR v_intent."webhookTicketHash" != encode(sha256(p_webhook_ticket::bytea), 'hex')
     OR v_intent."webhookTicketExpiresAt" < clock_timestamp() THEN
    RAISE EXCEPTION 'Invalid or expired webhook authorization ticket' USING ERRCODE = '42501';
  END IF;

  UPDATE public."PaymentProviderEvent"
  SET
    "processingStatus" = p_new_status,
    "errorMessage" = p_error_message,
    "processedAt" = clock_timestamp(),
    "retryCount" = CASE WHEN p_new_status = 'DEAD_LETTER' THEN "retryCount" + 1 ELSE "retryCount" END
  WHERE "clinicId" = p_clinic_id AND id = p_event_id;

  -- Clear ticket upon terminal ingestion
  IF p_new_status IN ('DEAD_LETTER', 'IGNORED_DUPLICATE') THEN
    UPDATE public."PaymentIntent"
    SET "webhookTicketHash" = NULL, "webhookTicketExpiresAt" = NULL
    WHERE "clinicId" = p_clinic_id AND id = p_payment_intent_id;
  END IF;

  RETURN true;
END;
$$;

-- 5. Update PaymentIntent status from webhook
CREATE OR REPLACE FUNCTION lamssa_security.update_payment_intent_webhook_status(
  p_clinic_id uuid,
  p_payment_intent_id uuid,
  p_webhook_ticket text,
  p_new_status public."PaymentIntentStatus",
  p_failure_code text,
  p_failure_message text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_intent public."PaymentIntent"%ROWTYPE;
BEGIN
  IF p_webhook_ticket IS NULL OR length(p_webhook_ticket) < 32 THEN
    RAISE EXCEPTION 'Missing or invalid webhook authorization ticket' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_intent
  FROM public."PaymentIntent"
  WHERE "clinicId" = p_clinic_id AND id = p_payment_intent_id
  FOR UPDATE;

  IF NOT FOUND OR v_intent."webhookTicketHash" IS NULL
     OR v_intent."webhookTicketHash" != encode(sha256(p_webhook_ticket::bytea), 'hex')
     OR v_intent."webhookTicketExpiresAt" < clock_timestamp() THEN
    RAISE EXCEPTION 'Invalid or expired webhook authorization ticket' USING ERRCODE = '42501';
  END IF;

  UPDATE public."PaymentIntent"
  SET
    status = p_new_status,
    "failureCode" = p_failure_code,
    "failureMessage" = p_failure_message,
    version = version + 1,
    "updatedAt" = now()
  WHERE "clinicId" = p_clinic_id AND id = p_payment_intent_id;

  RETURN true;
END;
$$;

-- 6. Drop old post_webhook_payment and recreate with webhook ticket validation
DROP FUNCTION IF EXISTS lamssa_security.post_webhook_payment(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS lamssa_security.post_webhook_payment(uuid, uuid, uuid, text);

CREATE OR REPLACE FUNCTION lamssa_security.post_webhook_payment(
  p_clinic_id uuid,
  p_payment_intent_id uuid,
  p_event_id uuid,
  p_webhook_ticket text
)
RETURNS TABLE(
  posted boolean,
  "paymentId" uuid,
  reason text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_intent public."PaymentIntent"%ROWTYPE;
  v_inv public."Invoice"%ROWTYPE;
  v_event public."PaymentProviderEvent"%ROWTYPE;
  v_new_net bigint;
  v_new_status public."InvoiceStatus";
  v_payment_id uuid := gen_random_uuid();
  v_req_key uuid;
  v_req_hash text;
  v_actor_membership uuid;
  v_last_seq integer;
  v_prev_hash text;
  v_audit_id uuid := gen_random_uuid();
  v_now timestamptz := date_trunc('milliseconds', now());
  v_payload text;
  v_event_hash text;
BEGIN
  IF p_webhook_ticket IS NULL OR length(p_webhook_ticket) < 32 THEN
    RAISE EXCEPTION 'Missing or invalid webhook authorization ticket' USING ERRCODE = '42501';
  END IF;

  -- Verify ticket on PaymentIntent and lock intent
  SELECT * INTO v_intent
  FROM public."PaymentIntent"
  WHERE "clinicId" = p_clinic_id AND id = p_payment_intent_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PaymentIntent not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_intent."webhookTicketHash" IS NULL
     OR v_intent."webhookTicketHash" != encode(sha256(p_webhook_ticket::bytea), 'hex')
     OR v_intent."webhookTicketExpiresAt" < clock_timestamp() THEN
    RAISE EXCEPTION 'Invalid or expired webhook authorization ticket' USING ERRCODE = '42501';
  END IF;

  IF v_intent."postedPaymentId" IS NOT NULL THEN
    RETURN QUERY SELECT true, v_intent."postedPaymentId", NULL::text;
    RETURN;
  END IF;

  IF v_intent.status NOT IN ('CREATED'::public."PaymentIntentStatus", 'REQUIRES_ACTION'::public."PaymentIntentStatus", 'PROCESSING'::public."PaymentIntentStatus") THEN
    RETURN QUERY SELECT false, NULL::uuid, 'PAYMENT_INTENT_ALREADY_SETTLED';
    RETURN;
  END IF;

  -- Immediately invalidate single-use ticket to prevent replay
  UPDATE public."PaymentIntent"
  SET "webhookTicketHash" = NULL, "webhookTicketExpiresAt" = NULL
  WHERE "clinicId" = p_clinic_id AND id = p_payment_intent_id;

  -- Verify authentic fresh event
  SELECT * INTO v_event
  FROM public."PaymentProviderEvent"
  WHERE id = p_event_id
    AND "clinicId" = p_clinic_id
    AND "paymentIntentId" = p_payment_intent_id
    AND "processingStatus" = 'RECEIVED'::public."WebhookProcessingStatus"
    AND "signatureVerified" = true
    AND "createdAt" >= statement_timestamp() - interval '5 minutes'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or stale webhook event for payment posting' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv
  FROM public."Invoice"
  WHERE "clinicId" = p_clinic_id AND id = v_intent."invoiceId"
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, 'INVOICE_NOT_FOUND';
    RETURN;
  END IF;

  IF v_inv.status NOT IN ('ISSUED'::public."InvoiceStatus", 'PARTIALLY_PAID'::public."InvoiceStatus") THEN
    RETURN QUERY SELECT false, NULL::uuid, 'INVOICE_NOT_PAYABLE';
    RETURN;
  END IF;

  v_new_net := v_inv."netPaidMinor" + v_intent."amountMinor";
  IF v_new_net > v_inv."totalMinor" THEN
    RETURN QUERY SELECT false, NULL::uuid, 'OVERPAYMENT_PREVENTED';
    RETURN;
  END IF;

  v_req_key := v_intent.id;
  v_req_hash := encode(sha256(convert_to(
    v_intent."clinicId"::text || ':' || v_intent."invoiceId"::text || ':' || v_intent."amountMinor"::text || ':' || v_intent.currency,
    'UTF8'
  )), 'hex');

  -- Create Payment record matching schema
  INSERT INTO public."Payment" (
    id, "clinicId", "invoiceId", "amountMinor", currency, "currencyScale", method, "requestKey", "requestHash"
  ) VALUES (
    v_payment_id, p_clinic_id, v_inv.id, v_intent."amountMinor", v_inv.currency, v_inv."currencyScale", 'CARD_MANUAL', v_req_key, v_req_hash
  );

  v_new_status := CASE WHEN v_new_net >= v_inv."totalMinor" THEN 'PAID'::public."InvoiceStatus" ELSE 'PARTIALLY_PAID'::public."InvoiceStatus" END;

  -- Update Invoice
  UPDATE public."Invoice"
  SET "netPaidMinor" = v_new_net,
      status = v_new_status,
      version = version + 1,
      "updatedAt" = now()
  WHERE "clinicId" = p_clinic_id AND id = v_inv.id;

  -- Activate patient package if fully paid
  IF v_new_net = v_inv."totalMinor" THEN
    UPDATE public."PatientPackage"
    SET status = 'ACTIVE', "activatedAt" = now()
    WHERE "clinicId" = p_clinic_id
      AND "invoiceId" = v_inv.id
      AND status = 'PENDING_PAYMENT'
      AND "activationPolicy" = 'UPON_FULL_PAYMENT';
  END IF;

  -- Append to FinancialAuditEvent ledger
  v_actor_membership := v_intent."initiatedByMembershipId";
  IF v_actor_membership IS NULL THEN
    SELECT id INTO v_actor_membership
    FROM public."ClinicMembership"
    WHERE "clinicId" = p_clinic_id AND status = 'ACTIVE' AND role = 'CLINIC_OWNER'
    ORDER BY "createdAt" ASC
    LIMIT 1;
  END IF;

  IF v_actor_membership IS NOT NULL THEN
    SELECT sequence, "eventHash" INTO v_last_seq, v_prev_hash
    FROM public."FinancialAuditEvent"
    WHERE "clinicId" = p_clinic_id
    ORDER BY sequence DESC
    LIMIT 1;

    v_last_seq := COALESCE(v_last_seq, 0) + 1;
    v_prev_hash := COALESCE(v_prev_hash, repeat('0', 64));
    v_payload := json_build_object(
      'action', 'PAYMENT_RECORDED',
      'actorMembershipId', v_actor_membership,
      'at', v_now,
      'clinicId', p_clinic_id,
      'id', v_audit_id,
      'invoiceId', v_inv.id,
      'paymentId', v_payment_id,
      'paymentIntentId', v_intent.id,
      'sequence', v_last_seq,
      'viaWebhookEventId', p_event_id
    )::text;
    v_event_hash := encode(sha256(convert_to(v_prev_hash || E'\n' || v_payload, 'UTF8')), 'hex');

    INSERT INTO public."FinancialAuditEvent" (
      id, "clinicId", "invoiceId", "actorMembershipId", sequence, action, payload, "previousHash", "eventHash", "createdAt"
    ) VALUES (
      v_audit_id, p_clinic_id, v_inv.id, v_actor_membership, v_last_seq, 'PAYMENT_RECORDED', v_payload, v_prev_hash, v_event_hash, v_now
    );
  END IF;

  -- Mark event as processed
  UPDATE public."PaymentProviderEvent"
  SET "processingStatus" = 'PROCESSED'::public."WebhookProcessingStatus",
      "processedAt" = v_now
  WHERE "clinicId" = p_clinic_id AND id = p_event_id;

  -- Transition intent to SUCCEEDED and link posted payment
  UPDATE public."PaymentIntent"
  SET status = 'SUCCEEDED'::public."PaymentIntentStatus",
      "postedPaymentId" = v_payment_id,
      version = version + 1,
      "updatedAt" = v_now
  WHERE "clinicId" = p_clinic_id AND id = v_intent.id;

  RETURN QUERY SELECT true, v_payment_id, NULL::text;
END;
$$;

-- 7. Enforce strict RLS policies on integration tables
DO $$
DECLARE
  t text;
  owner_name text;
  pred text;
BEGIN
  SELECT tableowner INTO owner_name
  FROM pg_tables
  WHERE schemaname = 'public' AND tablename = 'PaymentIntent';

  IF owner_name IS NULL THEN
    RAISE EXCEPTION 'Could not determine table owner for PaymentIntent';
  END IF;

  -- Strict immutable policies for PaymentProviderEvent: NO runtime INSERT or UPDATE allowed!
  EXECUTE 'ALTER TABLE public."PaymentProviderEvent" ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public."PaymentProviderEvent" FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON public."PaymentProviderEvent"';
  EXECUTE 'DROP POLICY IF EXISTS maintenance_owner ON public."PaymentProviderEvent"';
  EXECUTE format('CREATE POLICY maintenance_owner ON public."PaymentProviderEvent" FOR ALL TO %I USING (true) WITH CHECK (true)', owner_name);
  EXECUTE 'DROP POLICY IF EXISTS tenant_select ON public."PaymentProviderEvent"';
  EXECUTE format('CREATE POLICY tenant_select ON public."PaymentProviderEvent" FOR SELECT USING (CASE WHEN current_user = %L THEN false ELSE lamssa_security.context_allows("clinicId") END)', owner_name);
  EXECUTE 'DROP POLICY IF EXISTS tenant_insert ON public."PaymentProviderEvent"';
  EXECUTE 'CREATE POLICY tenant_insert ON public."PaymentProviderEvent" FOR INSERT WITH CHECK (false)';
  EXECUTE 'DROP POLICY IF EXISTS tenant_update ON public."PaymentProviderEvent"';
  EXECUTE 'CREATE POLICY tenant_update ON public."PaymentProviderEvent" FOR UPDATE USING (false) WITH CHECK (false)';
  EXECUTE 'DROP POLICY IF EXISTS tenant_delete ON public."PaymentProviderEvent"';
  EXECUTE 'CREATE POLICY tenant_delete ON public."PaymentProviderEvent" FOR DELETE USING (false)';

  -- Apply standardized maintenance_owner to remaining integration tables
  FOR t IN SELECT unnest(ARRAY[
    'PaymentProviderConfiguration',
    'PaymentIntent',
    'PaymentSettlement',
    'ExternalRefund',
    'ExternalPayout',
    'ExternalReconciliationRun',
    'ExternalReconciliationFinding',
    'ClinicRegulatoryProfile',
    'RegulatoryDocument',
    'RegulatorySubmission',
    'RegulatorySubmissionEvent',
    'ExternalPayoutCounter',
    'ExternalReconciliationRunCounter',
    'RegulatoryDocumentCounter'
  ]) LOOP
    pred := format('CASE WHEN current_user = %L THEN false ELSE lamssa_security.context_allows("clinicId") END', owner_name);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
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

  -- Ensure core finance policies have zero GUC hacks
  EXECUTE format(
    'ALTER POLICY tenant_select ON public."Invoice" USING (CASE WHEN current_user = %L THEN false ELSE lamssa_security.finance_allows("clinicId", false) END)',
    owner_name
  );
  EXECUTE format(
    'ALTER POLICY tenant_update ON public."Invoice" USING (CASE WHEN current_user = %L THEN false ELSE lamssa_security.finance_allows("clinicId", false) END) WITH CHECK (CASE WHEN current_user = %L THEN false ELSE lamssa_security.finance_allows("clinicId", status = ''VOID'') END)',
    owner_name,
    owner_name
  );
  EXECUTE format(
    'ALTER POLICY tenant_insert ON public."Payment" WITH CHECK (CASE WHEN current_user = %L THEN false ELSE lamssa_security.finance_allows("clinicId", false) END)',
    owner_name
  );
  EXECUTE format(
    'ALTER POLICY tenant_select ON public."FinancialAuditEvent" USING (CASE WHEN current_user = %L THEN false ELSE lamssa_security.finance_allows("clinicId", false) END)',
    owner_name
  );
  EXECUTE format(
    'ALTER POLICY tenant_insert ON public."FinancialAuditEvent" WITH CHECK (CASE WHEN current_user = %L THEN false ELSE lamssa_security.finance_allows("clinicId", false) AND EXISTS (SELECT 1 FROM public."ClinicMembership" m WHERE m.id = "FinancialAuditEvent"."actorMembershipId" AND m."clinicId" = "FinancialAuditEvent"."clinicId" AND m."userId" = lamssa_security.context_uuid(''lamssa.user_id'') AND m.status = ''ACTIVE'') END)',
    owner_name
  );
END $$;

-- 8. Revoke all execution on webhook security functions from PUBLIC
REVOKE ALL ON FUNCTION
  lamssa_security.resolve_payment_webhook_target("PaymentProviderCode", text),
  lamssa_security.ingest_payment_webhook_event(uuid, uuid, text, "PaymentProviderCode", text, text, text, jsonb, timestamptz, boolean),
  lamssa_security.update_payment_webhook_event_status(uuid, uuid, uuid, text, "WebhookProcessingStatus", text),
  lamssa_security.update_payment_intent_webhook_status(uuid, uuid, text, "PaymentIntentStatus", text, text),
  lamssa_security.post_webhook_payment(uuid, uuid, uuid, text)
FROM PUBLIC;
