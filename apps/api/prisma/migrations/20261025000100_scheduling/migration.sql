-- Additive scheduling foundation. No legacy data import or record resets.
BEGIN;
-- Trusted PostgreSQL extension: existing database owner can install it without
-- superuser/BYPASSRLS. Required for UUID equality in GiST exclusion constraints.
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;
-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'ARRIVED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "ResourceKind" AS ENUM ('DOCTOR', 'ROOM');

-- CreateEnum
CREATE TYPE "CancellationReason" AS ENUM ('PATIENT_REQUEST', 'SCHEDULE_CHANGE', 'OTHER');

-- CreateTable
CREATE TABLE "ClinicService" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "requiresRoom" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ClinicService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookableResource" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "kind" "ResourceKind" NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "doctorMembershipId" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BookableResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceAvailability" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "resourceId" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,

    CONSTRAINT "ResourceAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceTimeOff" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "resourceId" UUID NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ResourceTimeOff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchedulingState" (
    "clinicId" UUID NOT NULL,
    "revision" BIGINT NOT NULL DEFAULT 1,

    CONSTRAINT "SchedulingState_pkey" PRIMARY KEY ("clinicId")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "doctorResourceId" UUID NOT NULL,
    "doctorKind" "ResourceKind" NOT NULL DEFAULT 'DOCTOR',
    "roomResourceId" UUID,
    "roomKind" "ResourceKind" NOT NULL DEFAULT 'ROOM',
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "cancellationReason" "CancellationReason",
    "version" INTEGER NOT NULL DEFAULT 1,
    "bookingKey" UUID NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClinicService_clinicId_active_id_idx" ON "ClinicService"("clinicId", "active", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicService_clinicId_id_key" ON "ClinicService"("clinicId", "id");

-- CreateIndex
CREATE INDEX "BookableResource_clinicId_kind_active_id_idx" ON "BookableResource"("clinicId", "kind", "active", "id");

-- CreateIndex
CREATE UNIQUE INDEX "BookableResource_clinicId_id_key" ON "BookableResource"("clinicId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "BookableResource_clinicId_id_kind_key" ON "BookableResource"("clinicId", "id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "BookableResource_clinicId_doctorMembershipId_key" ON "BookableResource"("clinicId", "doctorMembershipId");

-- CreateIndex
CREATE INDEX "ResourceAvailability_clinicId_resourceId_weekday_idx" ON "ResourceAvailability"("clinicId", "resourceId", "weekday");

-- CreateIndex
CREATE INDEX "ResourceTimeOff_clinicId_resourceId_active_startAt_idx" ON "ResourceTimeOff"("clinicId", "resourceId", "active", "startAt");

-- CreateIndex
CREATE INDEX "Appointment_clinicId_startAt_id_idx" ON "Appointment"("clinicId", "startAt", "id");

-- CreateIndex
CREATE INDEX "Appointment_clinicId_patientId_startAt_id_idx" ON "Appointment"("clinicId", "patientId", "startAt", "id");

-- CreateIndex
CREATE INDEX "Appointment_clinicId_doctorResourceId_startAt_id_idx" ON "Appointment"("clinicId", "doctorResourceId", "startAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_clinicId_id_key" ON "Appointment"("clinicId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_clinicId_bookingKey_key" ON "Appointment"("clinicId", "bookingKey");

-- AddForeignKey
ALTER TABLE "ClinicService" ADD CONSTRAINT "ClinicService_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "BookableResource" ADD CONSTRAINT "BookableResource_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "BookableResource" ADD CONSTRAINT "BookableResource_clinicId_doctorMembershipId_fkey" FOREIGN KEY ("clinicId", "doctorMembershipId") REFERENCES "ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ResourceAvailability" ADD CONSTRAINT "ResourceAvailability_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ResourceAvailability" ADD CONSTRAINT "ResourceAvailability_clinicId_resourceId_fkey" FOREIGN KEY ("clinicId", "resourceId") REFERENCES "BookableResource"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ResourceTimeOff" ADD CONSTRAINT "ResourceTimeOff_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ResourceTimeOff" ADD CONSTRAINT "ResourceTimeOff_clinicId_resourceId_fkey" FOREIGN KEY ("clinicId", "resourceId") REFERENCES "BookableResource"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SchedulingState" ADD CONSTRAINT "SchedulingState_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clinicId_patientId_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES "Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clinicId_serviceId_fkey" FOREIGN KEY ("clinicId", "serviceId") REFERENCES "ClinicService"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clinicId_doctorResourceId_doctorKind_fkey" FOREIGN KEY ("clinicId", "doctorResourceId", "doctorKind") REFERENCES "BookableResource"("clinicId", "id", "kind") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clinicId_roomResourceId_roomKind_fkey" FOREIGN KEY ("clinicId", "roomResourceId", "roomKind") REFERENCES "BookableResource"("clinicId", "id", "kind") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."ClinicService" ADD CONSTRAINT service_values CHECK (length(btrim(name)) BETWEEN 2 AND 100 AND "durationMinutes" BETWEEN 5 AND 480 AND version > 0);
ALTER TABLE public."BookableResource" ADD CONSTRAINT resource_values CHECK (
  length(btrim(label)) BETWEEN 2 AND 100 AND version > 0 AND
  ((kind='DOCTOR' AND "doctorMembershipId" IS NOT NULL) OR (kind='ROOM' AND "doctorMembershipId" IS NULL))
);
ALTER TABLE public."ResourceAvailability" ADD CONSTRAINT weekly_interval CHECK (
  weekday BETWEEN 1 AND 7 AND "startMinute" >= 0 AND "endMinute" <= 1440 AND "startMinute" < "endMinute"
);
ALTER TABLE public."ResourceAvailability" ADD CONSTRAINT weekly_no_overlap EXCLUDE USING gist (
  "clinicId" WITH =, "resourceId" WITH =, weekday WITH =, int4range("startMinute","endMinute",'[)') WITH &&
);
ALTER TABLE public."ResourceTimeOff" ADD CONSTRAINT time_off_interval CHECK ("startAt" < "endAt" AND "endAt"-"startAt" <= interval '366 days' AND version > 0);
ALTER TABLE public."SchedulingState" ADD CONSTRAINT positive_scheduling_revision CHECK (revision > 0);
ALTER TABLE public."Appointment" ADD CONSTRAINT appointment_values CHECK (
  "endAt"-"startAt" BETWEEN interval '5 minutes' AND interval '8 hours'
  AND "startAt" = date_trunc('minute',"startAt") AND "endAt" = date_trunc('minute',"endAt")
  AND "doctorKind"='DOCTOR' AND "roomKind"='ROOM' AND version > 0
  AND (status='CANCELLED' OR "cancellationReason" IS NULL)
);
-- Completed appointments retain historical occupancy; cancelled/no-show rows do
-- not reserve a slot. Half-open intervals allow back-to-back reservations.
ALTER TABLE public."Appointment" ADD CONSTRAINT appointment_doctor_no_overlap EXCLUDE USING gist (
  "clinicId" WITH =,"doctorResourceId" WITH =,tstzrange("startAt","endAt",'[)') WITH &&
) WHERE (status NOT IN ('CANCELLED','NO_SHOW'));
ALTER TABLE public."Appointment" ADD CONSTRAINT appointment_room_no_overlap EXCLUDE USING gist (
  "clinicId" WITH =,"roomResourceId" WITH =,tstzrange("startAt","endAt",'[)') WITH &&
) WHERE ("roomResourceId" IS NOT NULL AND status NOT IN ('CANCELLED','NO_SHOW'));

CREATE FUNCTION lamssa_security.scheduling_guard() RETURNS trigger
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
      (OLD.status='ARRIVED' AND NEW.status='COMPLETED')
    ) THEN RAISE EXCEPTION 'Invalid appointment transition' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION lamssa_security.scheduling_guard() FROM PUBLIC;
CREATE TRIGGER appointment_initial_state BEFORE INSERT ON public."Appointment" FOR EACH ROW EXECUTE FUNCTION lamssa_security.scheduling_guard();
DO $$
DECLARE t text; owner_name text:=current_user; predicate text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ClinicService','BookableResource','ResourceAvailability','ResourceTimeOff','SchedulingState','Appointment'] LOOP
    predicate:=format('CASE WHEN current_user=%L THEN false ELSE lamssa_security.context_allows("clinicId") END',owner_name);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY maintenance_owner ON public.%I FOR ALL TO %I USING (true) WITH CHECK (true)',t,owner_name);
    EXECUTE format('CREATE POLICY tenant_select ON public.%I FOR SELECT USING (%s)',t,predicate);
    EXECUTE format('CREATE POLICY tenant_insert ON public.%I FOR INSERT WITH CHECK (%s)',t,predicate);
    EXECUTE format('CREATE POLICY tenant_update ON public.%I FOR UPDATE USING (%s) WITH CHECK (%s)',t,predicate,predicate);
    EXECUTE format('CREATE POLICY tenant_delete ON public.%I FOR DELETE USING (%s)',t,CASE WHEN t='ResourceAvailability' THEN predicate ELSE 'false' END);
    EXECUTE format('CREATE TRIGGER scheduling_identity BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION lamssa_security.scheduling_guard()',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC',t);
  END LOOP;
END;
$$;
DO $$
DECLARE r text;
BEGIN
  FOR r IN SELECT DISTINCT grantee FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='Session' AND privilege_type='SELECT' AND grantee NOT IN (current_user,'PUBLIC')
  LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r AND (rolsuper OR rolbypassrls)) OR pg_has_role(r,current_user,'MEMBER') THEN RAISE EXCEPTION 'Unsafe runtime role'; END IF;
    EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public."ClinicService",public."BookableResource",public."ResourceAvailability",public."ResourceTimeOff",public."SchedulingState",public."Appointment" TO %I',r);
    EXECUTE format('GRANT DELETE ON public."ResourceAvailability" TO %I',r);
  END LOOP;
END;
$$;
COMMIT;
