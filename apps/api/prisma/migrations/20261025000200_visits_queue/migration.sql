BEGIN;
-- CreateEnum
CREATE TYPE "VisitSource" AS ENUM ('APPOINTMENT', 'WALK_IN');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('WAITING', 'IN_SERVICE', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "QueueStatus" AS ENUM ('WAITING', 'CALLED', 'IN_SERVICE', 'COMPLETED', 'CANCELLED', 'ABSENT');

-- CreateTable
CREATE TABLE "Visit" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "appointmentId" UUID,
    "source" "VisitSource" NOT NULL,
    "status" "VisitStatus" NOT NULL DEFAULT 'WAITING',
    "checkInKey" UUID NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "checkedInAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMPTZ(3),
    "endedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueTicket" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "visitId" UUID NOT NULL,
    "businessDate" DATE NOT NULL,
    "number" INTEGER NOT NULL,
    "doctorResourceId" UUID NOT NULL,
    "doctorKind" "ResourceKind" NOT NULL DEFAULT 'DOCTOR',
    "roomResourceId" UUID,
    "roomKind" "ResourceKind" NOT NULL DEFAULT 'ROOM',
    "status" "QueueStatus" NOT NULL DEFAULT 'WAITING',
    "queuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calledAt" TIMESTAMPTZ(3),
    "recallCount" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "QueueTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueCounter" (
    "clinicId" UUID NOT NULL,
    "businessDate" DATE NOT NULL,
    "lastNumber" INTEGER NOT NULL,

    CONSTRAINT "QueueCounter_pkey" PRIMARY KEY ("clinicId","businessDate")
);

-- CreateTable
CREATE TABLE "QueueConfiguration" (
    "clinicId" UUID NOT NULL,
    "publicDisplayEnabled" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "QueueConfiguration_pkey" PRIMARY KEY ("clinicId")
);

-- CreateTable
CREATE TABLE "QueueCommand" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "requestKey" UUID NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "ticketId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QueueCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Visit_clinicId_checkedInAt_id_idx" ON "Visit"("clinicId", "checkedInAt", "id");

-- CreateIndex
CREATE INDEX "Visit_clinicId_patientId_checkedInAt_idx" ON "Visit"("clinicId", "patientId", "checkedInAt");

-- CreateIndex
CREATE UNIQUE INDEX "Visit_clinicId_id_key" ON "Visit"("clinicId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Visit_clinicId_appointmentId_key" ON "Visit"("clinicId", "appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Visit_clinicId_checkInKey_key" ON "Visit"("clinicId", "checkInKey");

-- CreateIndex
CREATE INDEX "QueueTicket_clinicId_status_queuedAt_id_idx" ON "QueueTicket"("clinicId", "status", "queuedAt", "id");

-- CreateIndex
CREATE INDEX "QueueTicket_clinicId_doctorResourceId_status_queuedAt_id_idx" ON "QueueTicket"("clinicId", "doctorResourceId", "status", "queuedAt", "id");

-- CreateIndex
CREATE INDEX "QueueTicket_clinicId_businessDate_number_idx" ON "QueueTicket"("clinicId", "businessDate", "number");

-- CreateIndex
CREATE UNIQUE INDEX "QueueTicket_clinicId_id_key" ON "QueueTicket"("clinicId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "QueueTicket_clinicId_visitId_key" ON "QueueTicket"("clinicId", "visitId");

-- CreateIndex
CREATE UNIQUE INDEX "QueueTicket_clinicId_businessDate_number_key" ON "QueueTicket"("clinicId", "businessDate", "number");

-- CreateIndex
CREATE UNIQUE INDEX "QueueCommand_clinicId_requestKey_key" ON "QueueCommand"("clinicId", "requestKey");

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_clinicId_patientId_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES "Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_clinicId_appointmentId_fkey" FOREIGN KEY ("clinicId", "appointmentId") REFERENCES "Appointment"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "QueueTicket" ADD CONSTRAINT "QueueTicket_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "QueueTicket" ADD CONSTRAINT "QueueTicket_clinicId_visitId_fkey" FOREIGN KEY ("clinicId", "visitId") REFERENCES "Visit"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "QueueTicket" ADD CONSTRAINT "QueueTicket_clinicId_doctorResourceId_doctorKind_fkey" FOREIGN KEY ("clinicId", "doctorResourceId", "doctorKind") REFERENCES "BookableResource"("clinicId", "id", "kind") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "QueueTicket" ADD CONSTRAINT "QueueTicket_clinicId_roomResourceId_roomKind_fkey" FOREIGN KEY ("clinicId", "roomResourceId", "roomKind") REFERENCES "BookableResource"("clinicId", "id", "kind") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "QueueCounter" ADD CONSTRAINT "QueueCounter_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "QueueConfiguration" ADD CONSTRAINT "QueueConfiguration_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "QueueCommand" ADD CONSTRAINT "QueueCommand_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "QueueCommand" ADD CONSTRAINT "QueueCommand_clinicId_ticketId_fkey" FOREIGN KEY ("clinicId", "ticketId") REFERENCES "QueueTicket"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Extend arrived attendance transitions; preserve all other scheduling rules.
CREATE OR REPLACE FUNCTION lamssa_security.scheduling_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status <> 'SCHEDULED' THEN RAISE EXCEPTION 'Initial appointment must be scheduled' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF NEW."clinicId" IS DISTINCT FROM OLD."clinicId" THEN RAISE EXCEPTION 'Clinic ownership is immutable' USING ERRCODE='42501'; END IF;
  IF TG_TABLE_NAME='SchedulingState' THEN
    IF NEW.revision <> OLD.revision+1 THEN RAISE EXCEPTION 'Revision must advance' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'Identity is immutable' USING ERRCODE='42501'; END IF;
  IF TG_TABLE_NAME='BookableResource' THEN
    IF NEW.kind IS DISTINCT FROM OLD.kind OR NEW."doctorMembershipId" IS DISTINCT FROM OLD."doctorMembershipId" THEN
      RAISE EXCEPTION 'Resource assignment is immutable' USING ERRCODE='42501';
    END IF;
  END IF;
  IF TG_TABLE_NAME='ResourceAvailability' THEN
    IF NEW."resourceId" IS DISTINCT FROM OLD."resourceId" THEN RAISE EXCEPTION 'Resource assignment is immutable' USING ERRCODE='42501'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.version <> OLD.version+1 THEN RAISE EXCEPTION 'Version must advance' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='ResourceTimeOff' THEN
    IF NEW."resourceId" IS DISTINCT FROM OLD."resourceId" THEN RAISE EXCEPTION 'Resource assignment is immutable' USING ERRCODE='42501'; END IF;
  END IF;
  IF TG_TABLE_NAME='Appointment' THEN
    IF NEW."patientId" IS DISTINCT FROM OLD."patientId" OR NEW."bookingKey" IS DISTINCT FROM OLD."bookingKey" OR NEW."requestHash" IS DISTINCT FROM OLD."requestHash" THEN
      RAISE EXCEPTION 'Booking identity is immutable' USING ERRCODE='42501';
    END IF;
    IF OLD.status IN ('COMPLETED','CANCELLED','NO_SHOW') THEN RAISE EXCEPTION 'Appointment is terminal' USING ERRCODE='23514'; END IF;
    IF OLD.status='ARRIVED' AND (NEW."startAt",NEW."endAt",NEW."doctorResourceId",NEW."roomResourceId",NEW."serviceId") IS DISTINCT FROM (OLD."startAt",OLD."endAt",OLD."doctorResourceId",OLD."roomResourceId",OLD."serviceId") THEN
      RAISE EXCEPTION 'Arrived appointment cannot be rescheduled' USING ERRCODE='23514';
    END IF;
    IF NEW.status <> OLD.status AND NOT (
      (OLD.status='SCHEDULED' AND NEW.status IN ('CONFIRMED','ARRIVED','CANCELLED','NO_SHOW')) OR
      (OLD.status='CONFIRMED' AND NEW.status IN ('ARRIVED','CANCELLED','NO_SHOW')) OR
      (OLD.status='CONFIRMED' AND NEW.status='SCHEDULED' AND (NEW."startAt",NEW."endAt",NEW."doctorResourceId",NEW."roomResourceId",NEW."serviceId") IS DISTINCT FROM (OLD."startAt",OLD."endAt",OLD."doctorResourceId",OLD."roomResourceId",OLD."serviceId")) OR
      (OLD.status='ARRIVED' AND NEW.status IN ('COMPLETED','CANCELLED','NO_SHOW'))
    ) THEN RAISE EXCEPTION 'Invalid appointment transition' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Reviewed source appended to the incremental migration. No data backfill: old
-- ARRIVED appointments use the explicit authorized reconciliation endpoint.
ALTER TABLE public."Visit" ADD CONSTRAINT visit_values CHECK (
  version > 0 AND ((source='APPOINTMENT' AND "appointmentId" IS NOT NULL) OR (source='WALK_IN' AND "appointmentId" IS NULL))
  AND (status NOT IN ('COMPLETED','CANCELLED','NO_SHOW') OR "endedAt" IS NOT NULL)
  AND (status NOT IN ('IN_SERVICE','COMPLETED') OR "startedAt" IS NOT NULL)
);
CREATE UNIQUE INDEX visit_one_active_patient ON public."Visit"("clinicId","patientId") WHERE status IN ('WAITING','IN_SERVICE');
ALTER TABLE public."QueueTicket" ADD CONSTRAINT queue_values CHECK (
  number BETWEEN 1 AND 999999 AND version > 0 AND "recallCount" BETWEEN 0 AND 10000
  AND "doctorKind"='DOCTOR' AND "roomKind"='ROOM'
  AND (status NOT IN ('CALLED','IN_SERVICE','COMPLETED') OR "calledAt" IS NOT NULL)
);
CREATE UNIQUE INDEX queue_one_claim_per_doctor ON public."QueueTicket"("clinicId","doctorResourceId") WHERE status IN ('CALLED','IN_SERVICE');
CREATE UNIQUE INDEX queue_one_claim_per_room ON public."QueueTicket"("clinicId","roomResourceId") WHERE "roomResourceId" IS NOT NULL AND status IN ('CALLED','IN_SERVICE');
ALTER TABLE public."QueueCounter" ADD CONSTRAINT queue_counter_positive CHECK ("lastNumber" BETWEEN 1 AND 999999);
ALTER TABLE public."QueueConfiguration" ADD CONSTRAINT queue_configuration_version CHECK (version > 0);

CREATE FUNCTION lamssa_security.queue_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF TG_TABLE_NAME IN ('Visit','QueueTicket') THEN
      IF NEW.status <> 'WAITING' THEN RAISE EXCEPTION 'Invalid initial state' USING ERRCODE='23514'; END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."clinicId" IS DISTINCT FROM OLD."clinicId" THEN RAISE EXCEPTION 'Immutable clinic' USING ERRCODE='42501'; END IF;
  IF TG_TABLE_NAME='QueueCounter' THEN
    IF NEW."businessDate" IS DISTINCT FROM OLD."businessDate" OR NEW."lastNumber" <> OLD."lastNumber"+1 THEN RAISE EXCEPTION 'Invalid counter update' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.version <> OLD.version+1 THEN RAISE EXCEPTION 'Invalid version' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='QueueConfiguration' THEN RETURN NEW; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN RAISE EXCEPTION 'Immutable identity' USING ERRCODE='42501'; END IF;
  IF TG_TABLE_NAME='Visit' THEN
    IF (NEW."patientId",NEW."appointmentId",NEW.source,NEW."checkInKey",NEW."requestHash",NEW."checkedInAt") IS DISTINCT FROM
       (OLD."patientId",OLD."appointmentId",OLD.source,OLD."checkInKey",OLD."requestHash",OLD."checkedInAt") THEN RAISE EXCEPTION 'Immutable visit' USING ERRCODE='42501'; END IF;
    IF OLD.status IN ('COMPLETED','CANCELLED','NO_SHOW') OR NOT (
      OLD.status='WAITING' AND NEW.status IN ('IN_SERVICE','CANCELLED','NO_SHOW') OR OLD.status='IN_SERVICE' AND NEW.status='COMPLETED'
    ) THEN RAISE EXCEPTION 'Invalid visit transition' USING ERRCODE='23514'; END IF;
  ELSE
    IF (NEW."visitId",NEW."businessDate",NEW.number,NEW."doctorKind",NEW."roomKind") IS DISTINCT FROM
       (OLD."visitId",OLD."businessDate",OLD.number,OLD."doctorKind",OLD."roomKind") THEN RAISE EXCEPTION 'Immutable ticket' USING ERRCODE='42501'; END IF;
    IF OLD.status IN ('COMPLETED','CANCELLED','ABSENT') THEN RAISE EXCEPTION 'Terminal ticket' USING ERRCODE='23514'; END IF;
    IF OLD.status='IN_SERVICE' AND (NEW."doctorResourceId",NEW."roomResourceId") IS DISTINCT FROM (OLD."doctorResourceId",OLD."roomResourceId") THEN RAISE EXCEPTION 'Cannot transfer in service' USING ERRCODE='23514'; END IF;
    IF NEW.status <> OLD.status AND NOT (
      OLD.status='WAITING' AND NEW.status IN ('CALLED','CANCELLED') OR
      OLD.status='CALLED' AND NEW.status IN ('WAITING','IN_SERVICE','ABSENT','CANCELLED') OR
      OLD.status='IN_SERVICE' AND NEW.status='COMPLETED'
    ) THEN RAISE EXCEPTION 'Invalid queue transition' USING ERRCODE='23514'; END IF;
    IF NEW."queuedAt" < OLD."queuedAt" OR NEW."recallCount" < OLD."recallCount" THEN RAISE EXCEPTION 'Cannot rewind queue' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION lamssa_security.queue_guard() FROM PUBLIC;

-- Deferred so check-in/terminal updates can change all three rows atomically.
-- Invoker privileges and RLS still apply; no arbitrary privileged query path.
CREATE FUNCTION lamssa_security.queue_consistency() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v public."Visit"; q public."QueueTicket"; a public."Appointment";
BEGIN
  IF TG_TABLE_NAME='Appointment' THEN
    SELECT * INTO a FROM public."Appointment" WHERE id=NEW.id AND "clinicId"=NEW."clinicId";
    SELECT * INTO v FROM public."Visit" WHERE "appointmentId"=NEW.id AND "clinicId"=NEW."clinicId";
    -- Old ARRIVED rows are untouched until explicitly reconciled.
    IF v.id IS NULL THEN
      IF TG_OP='UPDATE' AND NEW.status='ARRIVED' AND OLD.status <> 'ARRIVED' THEN RAISE EXCEPTION 'Check-in requires visit' USING ERRCODE='23514'; END IF;
      RETURN NULL;
    END IF;
  ELSIF TG_TABLE_NAME='Visit' THEN
    SELECT * INTO v FROM public."Visit" WHERE id=NEW.id AND "clinicId"=NEW."clinicId";
  ELSE
    SELECT * INTO v FROM public."Visit" WHERE id=NEW."visitId" AND "clinicId"=NEW."clinicId";
  END IF;
  IF v.id IS NULL THEN RETURN NULL; END IF; -- Owner fixture cleanup, not runtime deletion.
  SELECT * INTO q FROM public."QueueTicket" WHERE "visitId"=v.id AND "clinicId"=v."clinicId";
  IF q.id IS NULL OR v.status::text <> (CASE q.status WHEN 'CALLED' THEN 'WAITING' WHEN 'ABSENT' THEN 'NO_SHOW' ELSE q.status::text END) THEN
    RAISE EXCEPTION 'Visit and ticket inconsistent' USING ERRCODE='23514';
  END IF;
  IF v."appointmentId" IS NOT NULL THEN
    SELECT * INTO a FROM public."Appointment" WHERE id=v."appointmentId" AND "clinicId"=v."clinicId";
    IF a.id IS NULL OR a."patientId" <> v."patientId" OR a.status::text <> (CASE WHEN v.status IN ('WAITING','IN_SERVICE') THEN 'ARRIVED' ELSE v.status::text END) THEN
      RAISE EXCEPTION 'Appointment and visit inconsistent' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION lamssa_security.queue_consistency() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER queue_appointment_consistency AFTER UPDATE ON public."Appointment" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION lamssa_security.queue_consistency();
CREATE CONSTRAINT TRIGGER queue_visit_consistency AFTER INSERT OR UPDATE ON public."Visit" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION lamssa_security.queue_consistency();
CREATE CONSTRAINT TRIGGER queue_ticket_consistency AFTER INSERT OR UPDATE ON public."QueueTicket" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION lamssa_security.queue_consistency();

DO $$
DECLARE t text; owner_name text:=current_user; predicate text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Visit','QueueTicket','QueueCounter','QueueConfiguration','QueueCommand'] LOOP
    predicate:=format('CASE WHEN current_user=%L THEN false ELSE lamssa_security.context_allows("clinicId") END',owner_name);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY maintenance_owner ON public.%I FOR ALL TO %I USING (true) WITH CHECK (true)',t,owner_name);
    EXECUTE format('CREATE POLICY tenant_select ON public.%I FOR SELECT USING (%s)',t,predicate);
    EXECUTE format('CREATE POLICY tenant_insert ON public.%I FOR INSERT WITH CHECK (%s)',t,predicate);
    EXECUTE format('CREATE POLICY tenant_update ON public.%I FOR UPDATE USING (%s) WITH CHECK (%s)',t,CASE WHEN t='QueueCommand' THEN 'false' ELSE predicate END,CASE WHEN t='QueueCommand' THEN 'false' ELSE predicate END);
    EXECUTE format('CREATE POLICY tenant_delete ON public.%I FOR DELETE USING (false)',t);
    IF t <> 'QueueCommand' THEN
      EXECUTE format('CREATE TRIGGER queue_identity BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION lamssa_security.queue_guard()',t);
    END IF;
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC',t);
  END LOOP;
END;
$$;

-- Intentionally public, opt-in, bounded projection. No patient/visit/ticket UUIDs,
-- names, contacts, appointment details, counts or private revision are returned.
CREATE FUNCTION lamssa_security.public_queue(requested_slug text)
RETURNS TABLE("displayName" text,timezone text,"businessDate" text,number integer,status text,"doctorLabel" text,"roomLabel" text,"calledAt" timestamptz,"recallCount" integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
  SELECT c."displayName"::text,c.timezone::text,q."businessDate"::text,q.number,q.status::text,d.label::text,r.label::text,q."calledAt",q."recallCount"
  FROM public."Clinic" c JOIN public."QueueConfiguration" cfg ON cfg."clinicId"=c.id AND cfg."publicDisplayEnabled"
  LEFT JOIN LATERAL (SELECT * FROM public."QueueTicket" t WHERE t."clinicId"=c.id AND t.status IN ('CALLED','IN_SERVICE') ORDER BY t."calledAt" DESC,t.id LIMIT 50) q ON true
  LEFT JOIN public."BookableResource" d ON d."clinicId"=c.id AND d.id=q."doctorResourceId"
  LEFT JOIN public."BookableResource" r ON r."clinicId"=c.id AND r.id=q."roomResourceId"
  WHERE c.slug=requested_slug AND c.status='ACTIVE'
  ORDER BY q."calledAt" DESC NULLS LAST,q.number LIMIT 50;
$$;
REVOKE ALL ON FUNCTION lamssa_security.public_queue(text) FROM PUBLIC;

DO $$
DECLARE r text;
BEGIN
  FOR r IN SELECT DISTINCT grantee FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='Session' AND privilege_type='SELECT' AND grantee NOT IN (current_user,'PUBLIC') LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r AND (rolsuper OR rolbypassrls)) OR pg_has_role(r,current_user,'MEMBER') THEN RAISE EXCEPTION 'Unsafe runtime role'; END IF;
    EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public."Visit",public."QueueTicket",public."QueueCounter",public."QueueConfiguration" TO %I',r);
    EXECUTE format('GRANT SELECT,INSERT ON public."QueueCommand" TO %I',r);
    EXECUTE format('GRANT EXECUTE ON FUNCTION lamssa_security.public_queue(text) TO %I',r);
  END LOOP;
END;
$$;

COMMIT;
