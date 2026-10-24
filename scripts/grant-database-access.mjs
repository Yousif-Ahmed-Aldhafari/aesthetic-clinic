import { config } from 'dotenv';
import { resolve } from 'node:path';
import pg from 'pg';
config({ path: resolve(import.meta.dirname, '../.env'), quiet: true });
const tables=['Clinic','ClinicBranding','ClinicDomain','User','ClinicMembership','Session','LoginBucket'];
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
      await client.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON public."ClinicBranding",public."ClinicDomain",public."Session",public."LoginBucket" TO ${role}`);
      await client.query(`REVOKE ALL ON ALL FUNCTIONS IN SCHEMA lamssa_security FROM ${role}`);
      await client.query(`GRANT EXECUTE ON FUNCTION lamssa_security.context_uuid(text),lamssa_security.context_allows(uuid),lamssa_security.identity_memberships(uuid),lamssa_security.public_branding(text) TO ${role}`);
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{await client.end();}
  }
  console.info('Applied restricted runtime grants: scoped tenant reads, branding/domain DML, global identity read and session/rate DML.');
}catch{console.error('Runtime grants failed. Check separate owner/runtime roles and apply all migrations first; credentials withheld.');process.exitCode=1;}
