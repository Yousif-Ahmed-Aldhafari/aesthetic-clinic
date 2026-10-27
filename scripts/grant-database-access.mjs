import { config } from 'dotenv';
import { resolve } from 'node:path';
import pg from 'pg';
config({ path: resolve(import.meta.dirname, '../.env'), quiet: true });
const tables=['Clinic','ClinicBranding','ClinicDomain','User','ClinicMembership','Session','LoginBucket','Patient','PatientCounter','ClinicService','BookableResource','ResourceAvailability','ResourceTimeOff','SchedulingState','Appointment','Visit','QueueTicket','QueueCounter','QueueConfiguration','QueueCommand','Invoice','InvoiceLine','Payment','PaymentReversal','FinancialAuditEvent','ClinicInvoiceCounter','ClinicBillingProfile','ClinicAsset','ClinicIdentityState','ClinicIdentityAuditEvent','ClinicSlugReservation','AuditEvent','UserMfa','MfaRecoveryCode','MfaChallenge'];
try {
  for(const [key,role] of [['MIGRATION_DATABASE_URL','lamssa_dev_app'],['TEST_MIGRATION_DATABASE_URL','lamssa_test_app']]) {
    if(!process.env[key])throw new Error('Missing migration URL');
    const client=new pg.Client({connectionString:process.env[key],connectionTimeoutMillis:3000});
    try {
      await client.connect();await client.query('BEGIN');
      const {rows:[check]}=await client.query('SELECT rolsuper,rolbypassrls,pg_has_role(rolname,current_user,\'MEMBER\') AS inherits_owner FROM pg_roles WHERE rolname=$1',[role]);
      if(!check || check.rolsuper || check.rolbypassrls || check.inherits_owner)throw new Error('Unsafe runtime role');
      await client.query(`GRANT USAGE ON SCHEMA public,lamssa_security TO ${role}`);
      await client.query(`REVOKE ALL ON TABLE ${tables.map(t=>`public."${t}"`).join(',')} FROM ${role}`);
      await client.query(`GRANT SELECT ON public."Clinic",public."ClinicMembership",public."User" TO ${role}`);
      await client.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON public."ClinicDomain",public."Session",public."LoginBucket",public."UserMfa",public."MfaRecoveryCode",public."MfaChallenge" TO ${role}`);
      await client.query(`GRANT UPDATE("displayName","englishName","legalName","contactPhone","contactEmail",address,latitude,longitude,timezone,currency,slug,version,"mfaPolicy","updatedAt") ON public."Clinic" TO ${role}`);
      await client.query(`GRANT UPDATE(role,status,version,"updatedAt") ON public."ClinicMembership" TO ${role}`);
      await client.query(`GRANT SELECT ON public."ClinicBranding" TO ${role}`);
      await client.query(`GRANT INSERT("clinicId","primaryColor","secondaryColor","accentColor",typography,"logoAssetId","faviconAssetId",version,"updatedAt"),UPDATE("primaryColor","secondaryColor","accentColor",typography,"logoAssetId","faviconAssetId","logoUrl","faviconUrl",version,"updatedAt") ON public."ClinicBranding" TO ${role}`);
      await client.query(`GRANT SELECT,INSERT,DELETE ON public."ClinicAsset" TO ${role}`);
      await client.query(`GRANT SELECT ON public."ClinicIdentityState",public."ClinicIdentityAuditEvent",public."ClinicSlugReservation" TO ${role}`);
      await client.query(`GRANT SELECT,INSERT,UPDATE ON public."Patient",public."PatientCounter" TO ${role}`);
      await client.query(`GRANT SELECT,INSERT,UPDATE ON public."ClinicService",public."BookableResource",public."ResourceAvailability",public."ResourceTimeOff",public."SchedulingState",public."Appointment" TO ${role}`);
      await client.query(`GRANT SELECT,INSERT,UPDATE ON public."Visit",public."QueueTicket",public."QueueCounter",public."QueueConfiguration" TO ${role}`);
      await client.query(`GRANT SELECT,INSERT ON public."QueueCommand" TO ${role}`);
      await client.query(`GRANT SELECT,INSERT,UPDATE ON public."Invoice",public."ClinicInvoiceCounter",public."ClinicBillingProfile" TO ${role}`);
      await client.query(`GRANT SELECT,INSERT,DELETE ON public."InvoiceLine" TO ${role}`);
      await client.query(`GRANT SELECT,INSERT ON public."Payment",public."PaymentReversal",public."FinancialAuditEvent",public."AuditEvent" TO ${role}`);
      await client.query(`GRANT DELETE ON public."ResourceAvailability" TO ${role}`);
      await client.query(`REVOKE ALL ON ALL FUNCTIONS IN SCHEMA lamssa_security FROM ${role}`);
      await client.query(`GRANT EXECUTE ON FUNCTION lamssa_security.context_uuid(text),lamssa_security.context_allows(uuid),lamssa_security.identity_memberships(uuid),lamssa_security.clinic_mfa_policy(uuid),lamssa_security.public_branding(text),lamssa_security.public_queue(text),lamssa_security.finance_allows(uuid,boolean),lamssa_security.administration_allows(uuid,boolean),lamssa_security.administration_locks(uuid),lamssa_security.public_branding_details(text),lamssa_security.public_brand_asset(uuid),lamssa_security.record_audit_event(uuid,uuid,uuid,text,text,"AuditCategory",text,text,"AuditOutcome",text,text,text,jsonb) TO ${role}`);
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{await client.end();}
  }
  console.info('Applied restricted runtime grants for identity, patients, scheduling, queue billing and audited clinic administration; identity/financial history is append-only and only draft lines permit guarded DELETE.');
}catch{console.error('Runtime grants failed. Check separate owner/runtime roles and apply all migrations first; credentials withheld.');process.exitCode=1;}
