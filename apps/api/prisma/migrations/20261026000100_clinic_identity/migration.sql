BEGIN;
-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN     "address" VARCHAR(250),
ADD COLUMN     "contactEmail" VARCHAR(254),
ADD COLUMN     "contactPhone" VARCHAR(16),
ADD COLUMN     "englishName" VARCHAR(150),
ADD COLUMN     "latitude" DECIMAL(9,6),
ADD COLUMN     "longitude" DECIMAL(9,6),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "ClinicBranding" ADD COLUMN     "faviconAssetId" UUID,
ADD COLUMN     "faviconUrl" VARCHAR(2048),
ADD COLUMN     "logoAssetId" UUID,
ADD COLUMN     "typography" VARCHAR(20) NOT NULL DEFAULT 'TAJAWAL',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "ClinicDomain" ADD COLUMN     "challengeExpiresAt" TIMESTAMPTZ(3),
ADD COLUMN     "challengeHash" CHAR(64),
ADD COLUMN     "lastCheckedAt" TIMESTAMPTZ(3),
ADD COLUMN     "verifiedAt" TIMESTAMPTZ(3),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "ClinicMembership" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "ClinicAsset" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "purpose" VARCHAR(10) NOT NULL,
    "storageKey" VARCHAR(100) NOT NULL,
    "mimeType" VARCHAR(20) NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicIdentityState" (
    "clinicId" UUID NOT NULL,
    "lastSequence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ClinicIdentityState_pkey" PRIMARY KEY ("clinicId")
);

-- CreateTable
CREATE TABLE "ClinicIdentityAuditEvent" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "actorUserId" UUID NOT NULL,
    "actorMembershipId" UUID NOT NULL,
    "action" VARCHAR(60) NOT NULL,
    "targetId" UUID NOT NULL,
    "payload" TEXT NOT NULL,
    "previousHash" CHAR(64) NOT NULL,
    "eventHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicIdentityAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClinicAsset_storageKey_key" ON "ClinicAsset"("storageKey");

-- CreateIndex
CREATE INDEX "ClinicAsset_clinicId_publishedAt_createdAt_idx" ON "ClinicAsset"("clinicId", "publishedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicAsset_clinicId_id_key" ON "ClinicAsset"("clinicId", "id");

-- CreateIndex
CREATE INDEX "ClinicIdentityAuditEvent_clinicId_createdAt_id_idx" ON "ClinicIdentityAuditEvent"("clinicId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicIdentityAuditEvent_clinicId_sequence_key" ON "ClinicIdentityAuditEvent"("clinicId", "sequence");

-- AddForeignKey
ALTER TABLE "ClinicBranding" ADD CONSTRAINT "ClinicBranding_clinicId_logoAssetId_fkey" FOREIGN KEY ("clinicId", "logoAssetId") REFERENCES "ClinicAsset"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClinicBranding" ADD CONSTRAINT "ClinicBranding_clinicId_faviconAssetId_fkey" FOREIGN KEY ("clinicId", "faviconAssetId") REFERENCES "ClinicAsset"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClinicAsset" ADD CONSTRAINT "ClinicAsset_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClinicIdentityState" ADD CONSTRAINT "ClinicIdentityState_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClinicIdentityAuditEvent" ADD CONSTRAINT "ClinicIdentityAuditEvent_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Existing values, issued snapshots and migration history are preserved.
ALTER TABLE public."ClinicBranding" DROP CONSTRAINT "ClinicBranding_logo_https";
ALTER TABLE public."ClinicBranding" ADD CONSTRAINT "ClinicBranding_logo_https" CHECK ("logoUrl" IS NULL OR ("logoAssetId" IS NULL AND "logoUrl" ~ '^https://[^[:space:]]+$') OR ("logoAssetId" IS NOT NULL AND "logoUrl"='/api/v1/public/branding/assets/'||"logoAssetId"::text));
ALTER TABLE public."ClinicBranding" ADD CONSTRAINT favicon_managed CHECK ("faviconUrl" IS NULL OR ("faviconAssetId" IS NOT NULL AND "faviconUrl"='/api/v1/public/branding/assets/'||"faviconAssetId"::text));
ALTER TABLE public."Clinic" ADD CONSTRAINT identity_location CHECK ((latitude IS NULL) = (longitude IS NULL) AND (latitude IS NULL OR latitude BETWEEN -90 AND 90) AND (longitude IS NULL OR longitude BETWEEN -180 AND 180));
ALTER TABLE public."ClinicBranding" ADD CONSTRAINT identity_typography CHECK (typography IN ('TAJAWAL','SYSTEM','NOTO_NASKH'));
ALTER TABLE public."ClinicAsset" ADD CONSTRAINT asset_metadata CHECK (
  purpose IN ('LOGO','FAVICON') AND "byteSize" BETWEEN 1 AND 2097152 AND width BETWEEN 1 AND 1024 AND height BETWEEN 1 AND 1024
  AND sha256 ~ '^[0-9a-f]{64}$' AND "storageKey" = "clinicId"::text || '/' || id::text || CASE WHEN purpose='FAVICON' THEN '.png' ELSE '.webp' END
  AND "mimeType" = CASE WHEN purpose='FAVICON' THEN 'image/png' ELSE 'image/webp' END);
ALTER TABLE public."ClinicIdentityAuditEvent" ADD CONSTRAINT identity_audit_shape CHECK (sequence>0 AND length(payload)<=8192 AND "previousHash" ~ '^[0-9a-f]{64}$' AND "eventHash" ~ '^[0-9a-f]{64}$');

CREATE FUNCTION lamssa_security.administration_allows(target uuid, owner_only boolean DEFAULT false) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
  SELECT lamssa_security.context_allows(target) AND EXISTS (
    SELECT 1 FROM public."ClinicMembership" m WHERE m."clinicId"=target
    AND m."userId"=lamssa_security.context_uuid('lamssa.user_id') AND m.status='ACTIVE'
    AND (m.role='CLINIC_OWNER' OR (NOT owner_only AND m.role='CLINIC_ADMIN')));
$$;

-- Boolean-only administrative change locks; never expose finance amounts or records.
CREATE FUNCTION lamssa_security.administration_locks(target uuid)
RETURNS TABLE("currencyLocked" boolean,"timezoneLocked" boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public."Invoice" WHERE "clinicId"=target),
 EXISTS(SELECT 1 FROM public."Appointment" WHERE "clinicId"=target) OR EXISTS(SELECT 1 FROM public."ResourceAvailability" WHERE "clinicId"=target) OR EXISTS(SELECT 1 FROM public."ResourceTimeOff" WHERE "clinicId"=target) OR EXISTS(SELECT 1 FROM public."Visit" WHERE "clinicId"=target) OR EXISTS(SELECT 1 FROM public."QueueTicket" WHERE "clinicId"=target)
 WHERE lamssa_security.administration_allows(target,false);
$$;

-- Fixed trigger-only privilege: no arbitrary SQL, user lookup, bypass flag or tenant parameter.
-- Runtime has no execute grant. Maintenance is recognized by the actual login role.
CREATE FUNCTION lamssa_security.identity_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE target uuid; actor public."ClinicRole"; asset uuid; asset_purpose text; owner_name text;
BEGIN
  target:=CASE WHEN TG_TABLE_NAME='Clinic' THEN (to_jsonb(NEW)->>'id')::uuid ELSE COALESCE((to_jsonb(NEW)->>'clinicId')::uuid,(to_jsonb(OLD)->>'clinicId')::uuid) END;
  IF TG_OP='UPDATE' AND ((TG_TABLE_NAME='Clinic' AND (to_jsonb(NEW)->>'id') IS DISTINCT FROM (to_jsonb(OLD)->>'id')) OR (TG_TABLE_NAME<>'Clinic' AND (to_jsonb(NEW)->>'clinicId') IS DISTINCT FROM (to_jsonb(OLD)->>'clinicId'))) THEN
    RAISE EXCEPTION 'Immutable ownership' USING ERRCODE='42501';
  END IF;
  SELECT pg_get_userbyid(relowner) INTO owner_name FROM pg_class WHERE oid='public."Clinic"'::regclass;
  IF session_user=owner_name THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
  IF NOT lamssa_security.administration_allows(target,false) THEN RAISE EXCEPTION 'Denied' USING ERRCODE='42501'; END IF;
  SELECT role INTO actor FROM public."ClinicMembership" WHERE "clinicId"=target AND "userId"=lamssa_security.context_uuid('lamssa.user_id') AND status='ACTIVE';
  PERFORM pg_advisory_xact_lock(hashtextextended('clinic-identity:'||target::text,0));
  IF TG_OP='UPDATE' AND TG_TABLE_NAME<>'ClinicAsset' AND (to_jsonb(NEW)->>'version')::integer<>(to_jsonb(OLD)->>'version')::integer+1 THEN RAISE EXCEPTION 'Version conflict' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='Clinic' THEN
    IF NEW.status<>OLD.status OR NEW."createdAt"<>OLD."createdAt" THEN RAISE EXCEPTION 'Immutable clinic lifecycle' USING ERRCODE='42501'; END IF;
    IF NEW.slug<>OLD.slug AND (NEW.slug !~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' OR NEW.slug IN ('www','api','admin','platform','auth','login','logout','app','mail','smtp','support','help','status','static','assets','cdn','public','billing','root','localhost','lamssa')) THEN RAISE EXCEPTION 'Invalid reservation' USING ERRCODE='23514'; END IF;
    IF NEW.currency<>OLD.currency AND EXISTS(SELECT 1 FROM public."Invoice" WHERE "clinicId"=target) THEN RAISE EXCEPTION 'Currency locked by finance history' USING ERRCODE='23514'; END IF;
    IF NEW.timezone<>OLD.timezone AND (EXISTS(SELECT 1 FROM public."Appointment" WHERE "clinicId"=target) OR EXISTS(SELECT 1 FROM public."ResourceAvailability" WHERE "clinicId"=target) OR EXISTS(SELECT 1 FROM public."ResourceTimeOff" WHERE "clinicId"=target) OR EXISTS(SELECT 1 FROM public."Visit" WHERE "clinicId"=target) OR EXISTS(SELECT 1 FROM public."QueueTicket" WHERE "clinicId"=target)) THEN RAISE EXCEPTION 'Timezone locked by scheduling history' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME='ClinicMembership' THEN
    IF NEW.id<>OLD.id OR NEW."userId"<>OLD."userId" OR NEW."createdAt"<>OLD."createdAt" OR NEW.status='INVITED' THEN RAISE EXCEPTION 'Invalid membership' USING ERRCODE='42501'; END IF;
    IF actor<>'CLINIC_OWNER' AND (OLD.role IN ('CLINIC_OWNER','CLINIC_ADMIN','ACCOUNTANT') OR NEW.role IN ('CLINIC_OWNER','CLINIC_ADMIN','ACCOUNTANT')) THEN RAISE EXCEPTION 'Role escalation denied' USING ERRCODE='42501'; END IF;
    IF OLD.role='CLINIC_OWNER' AND OLD.status='ACTIVE' AND NOT(NEW.role='CLINIC_OWNER' AND NEW.status='ACTIVE') AND NOT EXISTS (
      SELECT 1 FROM public."ClinicMembership" m JOIN public."User" u ON u.id=m."userId" WHERE m."clinicId"=target AND m.id<>OLD.id AND m.role='CLINIC_OWNER' AND m.status='ACTIVE' AND u.status='ACTIVE'
    ) THEN RAISE EXCEPTION 'Last owner protected' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME='ClinicBranding' THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Use explicit branding edits' USING ERRCODE='42501'; END IF;
    IF TG_OP='UPDATE' AND ((NEW."logoUrl" IS DISTINCT FROM OLD."logoUrl" AND NEW."logoUrl" IS NOT NULL) OR (NEW."faviconUrl" IS DISTINCT FROM OLD."faviconUrl" AND NEW."faviconUrl" IS NOT NULL)) THEN RAISE EXCEPTION 'Only managed asset URLs may be published' USING ERRCODE='42501'; END IF;
    FOREACH asset_purpose IN ARRAY ARRAY['LOGO','FAVICON'] LOOP
      asset:=CASE WHEN asset_purpose='LOGO' THEN NEW."logoAssetId" ELSE NEW."faviconAssetId" END;
      IF asset IS NOT NULL THEN
        IF NOT EXISTS(SELECT 1 FROM public."ClinicAsset" WHERE id=asset AND "clinicId"=target AND purpose=asset_purpose) THEN RAISE EXCEPTION 'Asset not found' USING ERRCODE='23503'; END IF;
        UPDATE public."ClinicAsset" SET "publishedAt"=statement_timestamp() WHERE id=asset AND "publishedAt" IS NULL;
        IF asset_purpose='LOGO' THEN NEW."logoUrl":='/api/v1/public/branding/assets/'||asset::text; ELSE NEW."faviconUrl":='/api/v1/public/branding/assets/'||asset::text; END IF;
      ELSIF TG_OP='INSERT' OR (asset_purpose='LOGO' AND OLD."logoAssetId" IS NOT NULL) OR (asset_purpose='FAVICON' AND OLD."faviconAssetId" IS NOT NULL) THEN
        IF asset_purpose='LOGO' THEN NEW."logoUrl":=NULL; ELSE NEW."faviconUrl":=NULL; END IF;
      END IF;
    END LOOP;
  ELSIF TG_TABLE_NAME='ClinicDomain' THEN
    IF TG_OP<>'DELETE' AND NEW."isPrimary" THEN RAISE EXCEPTION 'Routing is deferred' USING ERRCODE='42501'; END IF;
    IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.hostname<>OLD.hostname OR NEW."createdAt"<>OLD."createdAt") THEN RAISE EXCEPTION 'Domain identity immutable' USING ERRCODE='42501'; END IF;
  ELSIF TG_TABLE_NAME='ClinicAsset' THEN
    IF TG_OP='INSERT' AND NEW."publishedAt" IS NOT NULL THEN RAISE EXCEPTION 'Explicit publication required' USING ERRCODE='42501'; END IF;
    IF TG_OP='UPDATE' AND ((to_jsonb(NEW)-'publishedAt')<>(to_jsonb(OLD)-'publishedAt') OR OLD."publishedAt" IS NOT NULL OR NEW."publishedAt" IS NULL) THEN RAISE EXCEPTION 'Asset immutable' USING ERRCODE='42501'; END IF;
    IF TG_OP='DELETE' AND (OLD."publishedAt" IS NOT NULL OR OLD."createdAt">statement_timestamp()-interval '24 hours') THEN RAISE EXCEPTION 'Retained asset' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- Audit is generated by triggers, never an API-supplied audit payload.
-- No FK to actor: preserve attribution if a maintenance account is retired.
CREATE FUNCTION lamssa_security.identity_record() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE target uuid; owner_name text; actor uuid; membership uuid; seq integer; previous text; body text; event_id uuid:=gen_random_uuid(); at_time timestamptz:=statement_timestamp(); before_value jsonb; after_value jsonb;
BEGIN
  SELECT pg_get_userbyid(relowner) INTO owner_name FROM pg_class WHERE oid='public."Clinic"'::regclass;
  IF session_user=owner_name THEN RETURN NULL; END IF;
  target:=CASE WHEN TG_TABLE_NAME='Clinic' THEN (to_jsonb(NEW)->>'id')::uuid ELSE COALESCE((to_jsonb(NEW)->>'clinicId')::uuid,(to_jsonb(OLD)->>'clinicId')::uuid) END;
  actor:=lamssa_security.context_uuid('lamssa.user_id');
  SELECT id INTO membership FROM public."ClinicMembership" WHERE "clinicId"=target AND "userId"=actor;
  IF membership IS NULL THEN RAISE EXCEPTION 'Missing actor' USING ERRCODE='42501'; END IF;
  INSERT INTO public."ClinicIdentityState" ("clinicId","lastSequence") VALUES(target,1) ON CONFLICT("clinicId") DO UPDATE SET "lastSequence"=public."ClinicIdentityState"."lastSequence"+1 RETURNING "lastSequence" INTO seq;
  SELECT "eventHash" INTO previous FROM public."ClinicIdentityAuditEvent" WHERE "clinicId"=target ORDER BY sequence DESC LIMIT 1;
  previous:=COALESCE(previous,repeat('0',64));
  before_value:=CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD)-'challengeHash' END;
  after_value:=CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW)-'challengeHash' END;
  body:=jsonb_build_object('id',event_id,'clinicId',target,'sequence',seq,'actorUserId',actor,'actorMembershipId',membership,'action',TG_TABLE_NAME||'.'||TG_OP,'targetId',COALESCE(after_value->>'id',before_value->>'id',target::text),'at',at_time,'changedFields',(SELECT jsonb_agg(k ORDER BY k) FROM jsonb_object_keys(COALESCE(before_value,'{}'::jsonb)||COALESCE(after_value,'{}'::jsonb)) AS k WHERE before_value->k IS DISTINCT FROM after_value->k),'beforeConfiguration',CASE WHEN TG_TABLE_NAME='ClinicMembership' THEN jsonb_build_object('role',before_value->'role','status',before_value->'status') WHEN TG_TABLE_NAME='Clinic' THEN jsonb_build_object('slug',before_value->'slug','timezone',before_value->'timezone','currency',before_value->'currency') ELSE NULL END,'afterConfiguration',CASE WHEN TG_TABLE_NAME='ClinicMembership' THEN jsonb_build_object('role',after_value->'role','status',after_value->'status') WHEN TG_TABLE_NAME='Clinic' THEN jsonb_build_object('slug',after_value->'slug','timezone',after_value->'timezone','currency',after_value->'currency') ELSE NULL END,'beforeHash',encode(sha256(convert_to(COALESCE(before_value::text,'null'),'UTF8')),'hex'),'afterHash',encode(sha256(convert_to(COALESCE(after_value::text,'null'),'UTF8')),'hex'))::text;
  INSERT INTO public."ClinicIdentityAuditEvent"(id,"clinicId",sequence,"actorUserId","actorMembershipId",action,"targetId",payload,"previousHash","eventHash","createdAt") VALUES(event_id,target,seq,actor,membership,TG_TABLE_NAME||'.'||TG_OP,COALESCE(after_value->>'id',before_value->>'id',target::text)::uuid,body,previous,encode(sha256(convert_to(previous||E'\n'||body,'UTF8')),'hex'),at_time);
  IF TG_TABLE_NAME='ClinicMembership' THEN
   IF OLD.role<>NEW.role OR OLD.status<>NEW.status THEN
    UPDATE public."Session" SET "revokedAt"=at_time WHERE "userId"=NEW."userId" AND "revokedAt" IS NULL;
   END IF;
  END IF;
  RETURN NULL;
END;
$$;

DO $$
DECLARE t text; owner_name text:=current_user; p text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ClinicAsset','ClinicIdentityState','ClinicIdentityAuditEvent'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY maintenance_owner ON public.%I FOR ALL TO %I USING(true) WITH CHECK(true)',t,owner_name);
    p:=format('CASE WHEN current_user=%L THEN false ELSE lamssa_security.administration_allows("clinicId",false) END',owner_name);
    EXECUTE format('CREATE POLICY tenant_select ON public.%I FOR SELECT USING(%s)',t,p);
    EXECUTE format('CREATE POLICY tenant_insert ON public.%I FOR INSERT WITH CHECK(%s)',t,CASE WHEN t='ClinicAsset' THEN p ELSE 'false' END);
    EXECUTE format('CREATE POLICY tenant_update ON public.%I FOR UPDATE USING(false) WITH CHECK(false)',t);
    EXECUTE format('CREATE POLICY tenant_delete ON public.%I FOR DELETE USING(%s)',t,CASE WHEN t='ClinicAsset' THEN p||' AND "publishedAt" IS NULL AND "createdAt" < statement_timestamp()-interval ''24 hours''' ELSE 'false' END);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['Clinic','ClinicBranding','ClinicDomain','ClinicMembership'] LOOP
    p:=format('CASE WHEN current_user=%L THEN false ELSE lamssa_security.administration_allows(%s,false) END',owner_name,CASE WHEN t='Clinic' THEN 'id' ELSE '"clinicId"' END);
    EXECUTE format('ALTER POLICY tenant_update ON public.%I USING(%s) WITH CHECK(%s)',t,p,p);
    IF t IN ('ClinicBranding','ClinicDomain') THEN EXECUTE format('ALTER POLICY tenant_insert ON public.%I WITH CHECK(%s)',t,p); END IF;
    IF t='ClinicBranding' THEN EXECUTE 'ALTER POLICY tenant_delete ON public."ClinicBranding" USING(false)'; END IF;
    IF t='ClinicDomain' THEN EXECUTE format('ALTER POLICY tenant_delete ON public.%I USING(%s)',t,p); END IF;
  END LOOP;
END;
$$;
CREATE TRIGGER identity_guard BEFORE UPDATE ON public."Clinic" FOR EACH ROW EXECUTE FUNCTION lamssa_security.identity_guard();
CREATE TRIGGER identity_record AFTER UPDATE ON public."Clinic" FOR EACH ROW EXECUTE FUNCTION lamssa_security.identity_record();
CREATE TRIGGER identity_guard BEFORE UPDATE ON public."ClinicMembership" FOR EACH ROW EXECUTE FUNCTION lamssa_security.identity_guard();
CREATE TRIGGER identity_record AFTER UPDATE ON public."ClinicMembership" FOR EACH ROW EXECUTE FUNCTION lamssa_security.identity_record();
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['ClinicBranding','ClinicDomain','ClinicAsset'] LOOP
  EXECUTE format('CREATE TRIGGER identity_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION lamssa_security.identity_guard()',t);
  EXECUTE format('CREATE TRIGGER identity_record AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION lamssa_security.identity_record()',t);
END LOOP; END; $$;

CREATE FUNCTION lamssa_security.public_branding_details(target_slug text)
RETURNS TABLE(slug varchar,"displayName" varchar,"englishName" varchar,"hasBranding" boolean,"logoUrl" varchar,"primaryColor" varchar,"secondaryColor" varchar,"accentColor" varchar,"faviconUrl" varchar,typography varchar)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT c.slug,c."displayName",c."englishName",b."clinicId" IS NOT NULL,b."logoUrl",b."primaryColor",b."secondaryColor",b."accentColor",b."faviconUrl",b.typography FROM public."Clinic" c LEFT JOIN public."ClinicBranding" b ON b."clinicId"=c.id WHERE c.slug=target_slug AND c.status='ACTIVE';
$$;
CREATE FUNCTION lamssa_security.public_brand_asset(target_asset uuid)
RETURNS TABLE("storageKey" varchar,"mimeType" varchar,"byteSize" integer,sha256 char(64))
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT a."storageKey",a."mimeType",a."byteSize",a.sha256 FROM public."ClinicAsset" a JOIN public."Clinic" c ON c.id=a."clinicId" WHERE a.id=target_asset AND a."publishedAt" IS NOT NULL AND c.status='ACTIVE';
$$;
REVOKE ALL ON FUNCTION lamssa_security.administration_locks(uuid),lamssa_security.administration_allows(uuid,boolean),lamssa_security.identity_guard(),lamssa_security.identity_record(),lamssa_security.public_branding_details(text),lamssa_security.public_brand_asset(uuid) FROM PUBLIC;
REVOKE ALL ON public."ClinicAsset",public."ClinicIdentityState",public."ClinicIdentityAuditEvent" FROM PUBLIC;

DO $$ DECLARE runtime_name text; BEGIN
 FOR runtime_name IN SELECT DISTINCT grantee FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='Session' AND privilege_type='SELECT' AND grantee NOT IN(current_user,'PUBLIC') LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=runtime_name AND (rolsuper OR rolbypassrls)) OR pg_has_role(runtime_name,current_user,'MEMBER') THEN RAISE EXCEPTION 'Unsafe runtime'; END IF;
  EXECUTE format('GRANT UPDATE("displayName","englishName","legalName","contactPhone","contactEmail",address,latitude,longitude,timezone,currency,slug,version,"updatedAt") ON public."Clinic" TO %I',runtime_name);
  EXECUTE format('GRANT UPDATE(role,status,version,"updatedAt") ON public."ClinicMembership" TO %I',runtime_name);
  EXECUTE format('REVOKE ALL ON public."ClinicBranding" FROM %I',runtime_name);
  EXECUTE format('GRANT SELECT ON public."ClinicBranding" TO %I',runtime_name);
  EXECUTE format('GRANT INSERT("clinicId","primaryColor","secondaryColor","accentColor",typography,"logoAssetId","faviconAssetId",version,"updatedAt"),UPDATE("primaryColor","secondaryColor","accentColor",typography,"logoAssetId","faviconAssetId","logoUrl","faviconUrl",version,"updatedAt") ON public."ClinicBranding" TO %I',runtime_name);
  EXECUTE format('GRANT SELECT,INSERT,DELETE ON public."ClinicAsset" TO %I',runtime_name);
  EXECUTE format('GRANT SELECT ON public."ClinicIdentityState",public."ClinicIdentityAuditEvent" TO %I',runtime_name);
  EXECUTE format('GRANT EXECUTE ON FUNCTION lamssa_security.administration_locks(uuid),lamssa_security.administration_allows(uuid,boolean),lamssa_security.public_branding_details(text),lamssa_security.public_brand_asset(uuid) TO %I',runtime_name);
 END LOOP;
END; $$;

COMMIT;
