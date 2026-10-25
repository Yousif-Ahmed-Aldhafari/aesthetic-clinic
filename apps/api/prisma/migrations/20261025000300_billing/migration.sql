-- Additive, transactional billing foundation. Existing records are untouched.
BEGIN;
-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CARD_MANUAL');

-- CreateEnum
CREATE TYPE "ReversalKind" AS ENUM ('REFUND', 'REVERSAL');

-- CreateEnum
CREATE TYPE "FinancialReason" AS ENUM ('ADMIN_ERROR', 'DUPLICATE', 'PATIENT_REFUND', 'OTHER');

-- CreateTable
CREATE TABLE "Invoice" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "visitId" UUID,
    "number" VARCHAR(24),
    "currency" CHAR(3) NOT NULL,
    "currencyScale" INTEGER NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotalMinor" BIGINT NOT NULL,
    "discountMinor" BIGINT NOT NULL,
    "taxMinor" BIGINT NOT NULL,
    "totalMinor" BIGINT NOT NULL,
    "netPaidMinor" BIGINT NOT NULL DEFAULT 0,
    "patientName" VARCHAR(150) NOT NULL,
    "patientNumber" VARCHAR(20) NOT NULL,
    "issuerSnapshot" JSONB,
    "issuedAt" TIMESTAMPTZ(3),
    "voidedAt" TIMESTAMPTZ(3),
    "voidReason" "FinancialReason",
    "version" INTEGER NOT NULL DEFAULT 1,
    "requestKey" UUID NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "issueKey" UUID,
    "issueHash" CHAR(64),
    "voidKey" UUID,
    "voidHash" CHAR(64),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "serviceName" VARCHAR(120) NOT NULL,
    "description" VARCHAR(240),
    "quantityMilli" INTEGER NOT NULL,
    "unitPriceMinor" BIGINT NOT NULL,
    "grossMinor" BIGINT NOT NULL,
    "discountMinor" BIGINT NOT NULL,
    "taxBasisPoints" INTEGER NOT NULL,
    "taxMinor" BIGINT NOT NULL,
    "totalMinor" BIGINT NOT NULL,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "currencyScale" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "requestKey" UUID NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentReversal" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "kind" "ReversalKind" NOT NULL,
    "reason" "FinancialReason" NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "currencyScale" INTEGER NOT NULL,
    "requestKey" UUID NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentReversal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialAuditEvent" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "invoiceId" UUID,
    "actorMembershipId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "action" VARCHAR(32) NOT NULL,
    "payload" TEXT NOT NULL,
    "previousHash" CHAR(64) NOT NULL,
    "eventHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FinancialAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicInvoiceCounter" (
    "clinicId" UUID NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "revision" BIGINT NOT NULL DEFAULT 1,

    CONSTRAINT "ClinicInvoiceCounter_pkey" PRIMARY KEY ("clinicId")
);

-- CreateTable
CREATE TABLE "ClinicBillingProfile" (
    "clinicId" UUID NOT NULL,
    "address" VARCHAR(250),
    "registrationNumber" VARCHAR(50),
    "taxIdentifier" VARCHAR(50),
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ClinicBillingProfile_pkey" PRIMARY KEY ("clinicId")
);

-- CreateIndex
CREATE INDEX "Invoice_clinicId_status_createdAt_id_idx" ON "Invoice"("clinicId", "status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Invoice_clinicId_patientId_createdAt_id_idx" ON "Invoice"("clinicId", "patientId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_clinicId_id_key" ON "Invoice"("clinicId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_clinicId_number_key" ON "Invoice"("clinicId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_clinicId_requestKey_key" ON "Invoice"("clinicId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceLine_clinicId_invoiceId_position_key" ON "InvoiceLine"("clinicId", "invoiceId", "position");

-- CreateIndex
CREATE INDEX "Payment_clinicId_invoiceId_createdAt_id_idx" ON "Payment"("clinicId", "invoiceId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_clinicId_id_key" ON "Payment"("clinicId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_clinicId_id_invoiceId_key" ON "Payment"("clinicId", "id", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_clinicId_requestKey_key" ON "Payment"("clinicId", "requestKey");

-- CreateIndex
CREATE INDEX "PaymentReversal_clinicId_paymentId_createdAt_id_idx" ON "PaymentReversal"("clinicId", "paymentId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReversal_clinicId_requestKey_key" ON "PaymentReversal"("clinicId", "requestKey");

-- CreateIndex
CREATE INDEX "FinancialAuditEvent_clinicId_invoiceId_sequence_idx" ON "FinancialAuditEvent"("clinicId", "invoiceId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialAuditEvent_clinicId_sequence_key" ON "FinancialAuditEvent"("clinicId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "Visit_clinicId_id_patientId_key" ON "Visit"("clinicId", "id", "patientId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clinicId_patientId_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES "Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clinicId_visitId_patientId_fkey" FOREIGN KEY ("clinicId", "visitId", "patientId") REFERENCES "Visit"("clinicId", "id", "patientId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_clinicId_invoiceId_fkey" FOREIGN KEY ("clinicId", "invoiceId") REFERENCES "Invoice"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_clinicId_invoiceId_fkey" FOREIGN KEY ("clinicId", "invoiceId") REFERENCES "Invoice"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PaymentReversal" ADD CONSTRAINT "PaymentReversal_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PaymentReversal" ADD CONSTRAINT "PaymentReversal_clinicId_invoiceId_fkey" FOREIGN KEY ("clinicId", "invoiceId") REFERENCES "Invoice"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PaymentReversal" ADD CONSTRAINT "PaymentReversal_clinicId_paymentId_invoiceId_fkey" FOREIGN KEY ("clinicId", "paymentId", "invoiceId") REFERENCES "Payment"("clinicId", "id", "invoiceId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "FinancialAuditEvent" ADD CONSTRAINT "FinancialAuditEvent_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "FinancialAuditEvent" ADD CONSTRAINT "FinancialAuditEvent_clinicId_invoiceId_fkey" FOREIGN KEY ("clinicId", "invoiceId") REFERENCES "Invoice"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "FinancialAuditEvent" ADD CONSTRAINT "FinancialAuditEvent_clinicId_actorMembershipId_fkey" FOREIGN KEY ("clinicId", "actorMembershipId") REFERENCES "ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClinicInvoiceCounter" ADD CONSTRAINT "ClinicInvoiceCounter_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClinicBillingProfile" ADD CONSTRAINT "ClinicBillingProfile_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."Invoice" ADD CONSTRAINT invoice_values CHECK (
  version > 0 AND "currencyScale"=(CASE WHEN currency='JPY' THEN 0 WHEN currency IN ('KWD','BHD','OMR','JOD','TND') THEN 3 WHEN currency IN ('YER','SAR','AED','USD','EUR','GBP','QAR','EGP') THEN 2 ELSE -1 END)
  AND "subtotalMinor" BETWEEN 0 AND 999999999999999 AND "discountMinor" BETWEEN 0 AND "subtotalMinor"
  AND "taxMinor" BETWEEN 0 AND 999999999999999 AND "totalMinor" BETWEEN 0 AND 999999999999999
  AND "totalMinor"="subtotalMinor"-"discountMinor"+"taxMinor" AND "netPaidMinor" BETWEEN 0 AND "totalMinor"
  AND (CASE WHEN status='DRAFT' THEN number IS NULL AND "issuedAt" IS NULL AND "issuerSnapshot" IS NULL AND "issueKey" IS NULL AND "issueHash" IS NULL AND "netPaidMinor"=0
    ELSE number ~ '^INV-[0-9]{6,10}$' AND "issuedAt" IS NOT NULL AND "issuerSnapshot" IS NOT NULL AND "issueKey" IS NOT NULL AND "issueHash" IS NOT NULL AND "totalMinor">0 END)
  AND (CASE WHEN status='VOID' THEN "voidedAt" IS NOT NULL AND "voidReason" IS NOT NULL AND "voidKey" IS NOT NULL AND "voidHash" IS NOT NULL AND "netPaidMinor"=0
    ELSE "voidedAt" IS NULL AND "voidReason" IS NULL AND "voidKey" IS NULL AND "voidHash" IS NULL END)
);
ALTER TABLE public."InvoiceLine" ADD CONSTRAINT invoice_line_values CHECK (
  position BETWEEN 1 AND 50 AND "quantityMilli" BETWEEN 1 AND 1000000 AND "unitPriceMinor" BETWEEN 0 AND 999999999999999
  AND "grossMinor"=floor(("unitPriceMinor"::numeric*"quantityMilli"+500)/1000)
  AND "discountMinor" BETWEEN 0 AND "grossMinor" AND "taxBasisPoints" BETWEEN 0 AND 10000
  AND "taxMinor"=floor((("grossMinor"-"discountMinor")::numeric*"taxBasisPoints"+5000)/10000)
  AND "totalMinor"="grossMinor"-"discountMinor"+"taxMinor" AND "totalMinor" BETWEEN 0 AND 999999999999999
);
ALTER TABLE public."Payment" ADD CONSTRAINT payment_values CHECK ("amountMinor" BETWEEN 1 AND 999999999999999 AND "currencyScale" IN (0,2,3));
ALTER TABLE public."PaymentReversal" ADD CONSTRAINT reversal_values CHECK ("amountMinor" BETWEEN 1 AND 999999999999999 AND "currencyScale" IN (0,2,3));
ALTER TABLE public."ClinicInvoiceCounter" ADD CONSTRAINT invoice_counter_values CHECK ("lastNumber" BETWEEN 0 AND 2147483646 AND revision > 0);
ALTER TABLE public."ClinicBillingProfile" ADD CONSTRAINT billing_profile_version CHECK (version > 0);
ALTER TABLE public."FinancialAuditEvent" ADD CONSTRAINT financial_audit_values CHECK (
  sequence > 0 AND action IN ('DRAFT_CREATED','DRAFT_EDITED','INVOICE_ISSUED','PAYMENT_RECORDED','PAYMENT_REFUNDED','PAYMENT_REVERSED','INVOICE_VOIDED','PROFILE_UPDATED')
  AND length(payload) <= 8192 AND "previousHash" ~ '^[0-9a-f]{64}$' AND "eventHash" ~ '^[0-9a-f]{64}$'
);
CREATE INDEX invoice_patient_name_prefix ON public."Invoice"("clinicId","patientName" text_pattern_ops);

-- Additional finance role restriction, using the existing verified session policy.
-- INVOKER, no identity bypass, no recursion through finance tables.
CREATE FUNCTION lamssa_security.finance_allows(target uuid, restricted boolean) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
 SELECT lamssa_security.context_allows(target) AND EXISTS (
   SELECT 1 FROM public."ClinicMembership" m WHERE m."clinicId"=target
     AND m."userId"=lamssa_security.context_uuid('lamssa.user_id') AND m.status='ACTIVE'
     AND (m.role IN ('CLINIC_OWNER','ACCOUNTANT') OR (NOT restricted AND m.role='RECEPTIONIST'))
 );
$$;

CREATE FUNCTION lamssa_security.finance_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
DECLARE inv public."Invoice"; pay public."Payment"; prev public."FinancialAuditEvent"; j jsonb; reversed bigint;
BEGIN
 IF TG_OP='UPDATE' THEN
   IF NEW."clinicId" IS DISTINCT FROM OLD."clinicId" THEN RAISE EXCEPTION 'Immutable tenant' USING ERRCODE='42501'; END IF;
   IF TG_TABLE_NAME='ClinicInvoiceCounter' THEN
     IF NEW.revision<>OLD.revision+1 OR NEW."lastNumber" NOT BETWEEN OLD."lastNumber" AND OLD."lastNumber"+1 THEN RAISE EXCEPTION 'Counter must advance' USING ERRCODE='23514'; END IF;
     RETURN NEW;
   END IF;
   IF TG_TABLE_NAME IN ('Payment','PaymentReversal','FinancialAuditEvent') THEN RAISE EXCEPTION 'Append only' USING ERRCODE='42501'; END IF;
   IF TG_TABLE_NAME='InvoiceLine' THEN RAISE EXCEPTION 'Replace draft lines explicitly' USING ERRCODE='42501'; END IF;
   IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Version must advance' USING ERRCODE='23514'; END IF;
   IF TG_TABLE_NAME='ClinicBillingProfile' THEN RETURN NEW; END IF;
   IF (NEW.id,NEW."patientId",NEW."visitId",NEW.currency,NEW."currencyScale",NEW."requestKey",NEW."requestHash",NEW."createdAt") IS DISTINCT FROM
      (OLD.id,OLD."patientId",OLD."visitId",OLD.currency,OLD."currencyScale",OLD."requestKey",OLD."requestHash",OLD."createdAt") THEN RAISE EXCEPTION 'Immutable invoice identity' USING ERRCODE='42501'; END IF;
   IF OLD.status='VOID' THEN RAISE EXCEPTION 'Terminal invoice' USING ERRCODE='23514'; END IF;
   IF OLD.status<>'DRAFT' AND (NEW.number,NEW."issuedAt",NEW."issuerSnapshot",NEW."patientName",NEW."patientNumber",NEW."subtotalMinor",NEW."discountMinor",NEW."taxMinor",NEW."totalMinor",NEW."issueKey",NEW."issueHash") IS DISTINCT FROM
     (OLD.number,OLD."issuedAt",OLD."issuerSnapshot",OLD."patientName",OLD."patientNumber",OLD."subtotalMinor",OLD."discountMinor",OLD."taxMinor",OLD."totalMinor",OLD."issueKey",OLD."issueHash") THEN RAISE EXCEPTION 'Issued financial snapshot is immutable' USING ERRCODE='42501'; END IF;
   IF OLD.status<>'DRAFT' AND NEW.status='DRAFT' OR OLD.status='DRAFT' AND NEW.status NOT IN ('DRAFT','ISSUED') THEN RAISE EXCEPTION 'Invalid invoice lifecycle' USING ERRCODE='23514'; END IF;
   RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='InvoiceLine' THEN
   IF TG_OP='DELETE' THEN
     -- Owner can clean only tracked fictional fixtures in a single transaction;
     -- runtime never owns tables, and deferred totals still protect live invoices.
     IF current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='public."InvoiceLine"'::regclass)) THEN RETURN OLD; END IF;
     SELECT * INTO inv FROM public."Invoice" WHERE "clinicId"=OLD."clinicId" AND id=OLD."invoiceId" FOR UPDATE;
     IF inv.id IS NULL OR inv.status<>'DRAFT' THEN RAISE EXCEPTION 'Issued line is immutable' USING ERRCODE='42501'; END IF;
     RETURN OLD;
   END IF;
   SELECT * INTO inv FROM public."Invoice" WHERE "clinicId"=NEW."clinicId" AND id=NEW."invoiceId" FOR UPDATE;
   IF inv.id IS NOT NULL AND inv.status<>'DRAFT' THEN RAISE EXCEPTION 'Issued line is immutable' USING ERRCODE='42501'; END IF;
 ELSIF TG_TABLE_NAME='Invoice' THEN
   IF NEW.status<>'DRAFT' OR NEW.version<>1 THEN RAISE EXCEPTION 'Invoice starts as draft' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME IN ('Payment','PaymentReversal') THEN
   -- Independent of the application mutex: lock the parent before ledger writes.
   SELECT * INTO inv FROM public."Invoice" WHERE "clinicId"=NEW."clinicId" AND id=NEW."invoiceId" FOR UPDATE;
   IF inv.id IS NOT NULL AND (inv.status IN ('DRAFT','VOID') OR (NEW.currency,NEW."currencyScale") IS DISTINCT FROM (inv.currency,inv."currencyScale")) THEN RAISE EXCEPTION 'Invalid payment context' USING ERRCODE='23514'; END IF;
   IF TG_TABLE_NAME='PaymentReversal' THEN
     SELECT * INTO pay FROM public."Payment" WHERE "clinicId"=NEW."clinicId" AND id=NEW."paymentId" AND "invoiceId"=NEW."invoiceId";
     IF pay.id IS NOT NULL THEN
       SELECT COALESCE(sum("amountMinor"),0) INTO reversed FROM public."PaymentReversal" WHERE "clinicId"=NEW."clinicId" AND "paymentId"=NEW."paymentId";
       IF reversed+NEW."amountMinor">pay."amountMinor" OR (NEW.kind='REVERSAL' AND (reversed<>0 OR NEW."amountMinor"<>pay."amountMinor")) THEN RAISE EXCEPTION 'Invalid reversal' USING ERRCODE='23514'; END IF;
     END IF;
   END IF;
 ELSIF TG_TABLE_NAME='FinancialAuditEvent' THEN
   SELECT * INTO prev FROM public."FinancialAuditEvent" WHERE "clinicId"=NEW."clinicId" ORDER BY sequence DESC LIMIT 1;
   j:=NEW.payload::jsonb;
   IF NEW.sequence<>COALESCE(prev.sequence,0)+1 OR NEW."previousHash"<>COALESCE(prev."eventHash",repeat('0',64))
     OR NEW."eventHash"<>encode(sha256(convert_to(NEW."previousHash"||E'\n'||NEW.payload,'UTF8')),'hex')
     OR j->>'id' IS DISTINCT FROM NEW.id::text OR j->>'clinicId' IS DISTINCT FROM NEW."clinicId"::text
     OR j->>'invoiceId' IS DISTINCT FROM NEW."invoiceId"::text OR j->>'actorMembershipId' IS DISTINCT FROM NEW."actorMembershipId"::text
     OR j->>'action' IS DISTINCT FROM NEW.action OR (j->>'sequence')::int IS DISTINCT FROM NEW.sequence
     OR (j->>'at')::timestamptz IS DISTINCT FROM NEW."createdAt" THEN RAISE EXCEPTION 'Invalid audit chain' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END;
$$;

CREATE FUNCTION lamssa_security.finance_consistency() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
DECLARE inv public."Invoice"; invoice_id uuid; tenant uuid; n int; sub bigint; disc bigint; tax bigint; total bigint; received bigint; refunded bigint;
BEGIN
 IF TG_OP='DELETE' THEN invoice_id:=OLD."invoiceId";tenant:=OLD."clinicId";
 ELSE tenant:=NEW."clinicId";IF TG_TABLE_NAME='Invoice' THEN invoice_id:=NEW.id; ELSE invoice_id:=NEW."invoiceId"; END IF; END IF;
 SELECT * INTO inv FROM public."Invoice" WHERE "clinicId"=tenant AND id=invoice_id FOR UPDATE;
 IF inv.id IS NULL THEN RETURN NULL; END IF; -- Privileged isolated fixture cleanup only.
 SELECT count(*),COALESCE(sum("grossMinor"),0),COALESCE(sum("discountMinor"),0),COALESCE(sum("taxMinor"),0),COALESCE(sum("totalMinor"),0)
 INTO n,sub,disc,tax,total FROM public."InvoiceLine" WHERE "clinicId"=tenant AND "invoiceId"=invoice_id;
 SELECT COALESCE(sum("amountMinor"),0) INTO received FROM public."Payment" WHERE "clinicId"=tenant AND "invoiceId"=invoice_id;
 SELECT COALESCE(sum("amountMinor"),0) INTO refunded FROM public."PaymentReversal" WHERE "clinicId"=tenant AND "invoiceId"=invoice_id;
 IF n NOT BETWEEN 1 AND 50 OR (inv."subtotalMinor",inv."discountMinor",inv."taxMinor",inv."totalMinor",inv."netPaidMinor") IS DISTINCT FROM (sub,disc,tax,total,received-refunded)
   OR received-refunded NOT BETWEEN 0 AND total THEN RAISE EXCEPTION 'Financial totals inconsistent' USING ERRCODE='23514'; END IF;
 IF inv.status='VOID' AND received<>0 THEN RAISE EXCEPTION 'Cannot void payment history' USING ERRCODE='23514'; END IF;
 IF inv.status NOT IN ('DRAFT','VOID') AND inv.status::text<>(CASE WHEN received-refunded=0 THEN 'ISSUED' WHEN received-refunded=total THEN 'PAID' ELSE 'PARTIALLY_PAID' END) THEN RAISE EXCEPTION 'Financial state inconsistent' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public."FinancialAuditEvent" e WHERE e."clinicId"=tenant AND e."invoiceId"=invoice_id AND (e.payload::jsonb->>'invoiceVersion')::int=inv.version) THEN RAISE EXCEPTION 'Financial change requires audit' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END;
$$;

DO $$
DECLARE t text; owner_name text:=current_user; pred text; write_pred text;
BEGIN
 FOREACH t IN ARRAY ARRAY['Invoice','InvoiceLine','Payment','PaymentReversal','FinancialAuditEvent','ClinicInvoiceCounter','ClinicBillingProfile'] LOOP
   pred:=format('CASE WHEN current_user=%L THEN false ELSE lamssa_security.finance_allows("clinicId",false) END',owner_name);
   write_pred:=format('CASE WHEN current_user=%L THEN false ELSE lamssa_security.finance_allows("clinicId",%s) END',owner_name,CASE WHEN t IN ('PaymentReversal','ClinicBillingProfile') THEN 'true' ELSE 'false' END);
   EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
   EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
   EXECUTE format('CREATE POLICY maintenance_owner ON public.%I FOR ALL TO %I USING (true) WITH CHECK (true)',t,owner_name);
   EXECUTE format('CREATE POLICY tenant_select ON public.%I FOR SELECT USING (%s)',t,pred);
   EXECUTE format('CREATE POLICY tenant_insert ON public.%I FOR INSERT WITH CHECK (%s)',t,write_pred);
   EXECUTE format('CREATE POLICY tenant_update ON public.%I FOR UPDATE USING (%s) WITH CHECK (%s)',t,CASE WHEN t IN ('Invoice','ClinicInvoiceCounter','ClinicBillingProfile') THEN write_pred ELSE 'false' END,CASE WHEN t IN ('Invoice','ClinicInvoiceCounter','ClinicBillingProfile') THEN write_pred ELSE 'false' END);
   EXECUTE format('CREATE POLICY tenant_delete ON public.%I FOR DELETE USING (%s)',t,CASE WHEN t='InvoiceLine' THEN pred ELSE 'false' END);
   EXECUTE format('CREATE TRIGGER finance_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION lamssa_security.finance_guard()',t);
   IF t IN ('Invoice','Payment','PaymentReversal') THEN
     EXECUTE format('CREATE CONSTRAINT TRIGGER finance_consistency AFTER INSERT OR UPDATE ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION lamssa_security.finance_consistency()',t);
   END IF;
   EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC',t);
 END LOOP;
END;
$$;
CREATE TRIGGER finance_line_delete BEFORE DELETE ON public."InvoiceLine" FOR EACH ROW EXECUTE FUNCTION lamssa_security.finance_guard();
CREATE CONSTRAINT TRIGGER finance_line_consistency AFTER INSERT OR UPDATE OR DELETE ON public."InvoiceLine" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION lamssa_security.finance_consistency();
REVOKE ALL ON FUNCTION lamssa_security.finance_allows(uuid,boolean),lamssa_security.finance_guard(),lamssa_security.finance_consistency() FROM PUBLIC;

DO $$
DECLARE runtime_name text;
BEGIN
 FOR runtime_name IN SELECT DISTINCT grantee FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='Session' AND privilege_type='SELECT' AND grantee NOT IN (current_user,'PUBLIC') LOOP
   IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=runtime_name AND (rolsuper OR rolbypassrls)) OR pg_has_role(runtime_name,current_user,'MEMBER') THEN RAISE EXCEPTION 'Unsafe runtime role'; END IF;
   EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public."Invoice",public."ClinicInvoiceCounter",public."ClinicBillingProfile" TO %I',runtime_name);
   EXECUTE format('GRANT SELECT,INSERT,DELETE ON public."InvoiceLine" TO %I',runtime_name);
   EXECUTE format('GRANT SELECT,INSERT ON public."Payment",public."PaymentReversal",public."FinancialAuditEvent" TO %I',runtime_name);
   EXECUTE format('GRANT EXECUTE ON FUNCTION lamssa_security.finance_allows(uuid,boolean) TO %I',runtime_name);
 END LOOP;
END;
$$;
COMMIT;

