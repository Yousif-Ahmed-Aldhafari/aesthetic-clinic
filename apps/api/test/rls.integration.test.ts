import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Pool, type PoolClient } from 'pg';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { IdentityDatabase } from '../src/prisma/identity.database.js';
import { TenantDatabaseService } from '../src/prisma/tenant-database.service.js';
import { VerifiedSessions, type VerifiedPrincipal } from '../src/prisma/verified-sessions.js';
import type { Environment } from '../src/config/environment.js';
import { validateEnvironment } from '../src/config/environment.js';
import { authorizationHash } from '../src/auth/crypto.js';
import { fixtureDatabase, testUrls } from './database-fixtures.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { seedDemoClinics } from '../prisma/seed.js';

const enabled=Boolean(process.env.TEST_DATABASE_URL);
const live=(name:string,fn:()=>Promise<void>)=>test(name,{skip:!enabled},fn);
const clinics=[randomUUID(),randomUUID()],users=[randomUUID(),randomUUID()],sessions=[randomUUID(),randomUUID()];
const domains=[randomUUID(),randomUUID()],suffix=randomUUID();
let owner:PrismaClient,runtime:PrismaService,identity:IdentityDatabase,database:TenantDatabaseService,registry:VerifiedSessions,pool:Pool;
const proofs:VerifiedPrincipal[]=[];
before(async()=>{
  if(!enabled)return;
  const urls=testUrls();owner=fixtureDatabase();
  const config=new ConfigService<Environment,true>(validateEnvironment({NODE_ENV:'test',DATABASE_URL:urls.runtime,AUTH_CSRF_SECRET:randomBytes(48).toString('base64url'),CORS_ORIGINS:'http://localhost:5173'}));
  runtime=new PrismaService(config);identity=new IdentityDatabase(runtime);registry=new VerifiedSessions();database=new TenantDatabaseService(runtime,identity,registry,config);
  pool=new Pool({connectionString:urls.runtime,max:4,connectionTimeoutMillis:3000});
  for(const [i,id] of clinics.entries())await owner.clinic.create({data:{id,legalName:'عيادة اختبار وهمية',displayName:'اختبار عزل',slug:`rls-${i}-${suffix}`,currency:'YER',
    branding:{create:{primaryColor:i===0?'#7854D9':'#087F8C'}},domains:{create:{id:domains[i],hostname:`rls-${i}-${suffix}.example.invalid`}}}});
  for(const [i,id] of users.entries()){
    await owner.user.create({data:{id,email:`rls-${i}-${suffix}@example.invalid`,name:'مستخدم عزل وهمي',status:'ACTIVE',memberships:{create:{clinicId:clinics[i],status:'ACTIVE',role:'CLINIC_OWNER'}}}});
    const user=await identity.userById(id);assert(user);
    await owner.session.create({data:{id:sessions[i],userId:id,selectedClinicId:clinics[i],tokenHash:randomBytes(32).toString('hex'),csrfHash:randomBytes(32).toString('hex'),authorizationHash:authorizationHash(user),expiresAt:new Date(Date.now()+3600000)}});
    proofs.push(registry.issue(id,sessions[i]));
  }
});
after(async()=>{
  if(owner){
    await owner.session.deleteMany({where:{userId:{in:users}}});
    await owner.clinicMembership.deleteMany({where:{userId:{in:users}}});
    await owner.user.deleteMany({where:{id:{in:users}}});
    await owner.clinicDomain.deleteMany({where:{clinicId:{in:clinics}}});
    await owner.clinicBranding.deleteMany({where:{clinicId:{in:clinics}}});
    await owner.clinic.deleteMany({where:{id:{in:clinics}}});
  }
  await pool?.end();await runtime?.$disconnect();await owner?.$disconnect();
});
async function context(client:PoolClient,index:number) {
  await client.query(`SELECT set_config('lamssa.clinic_id',$1,true),set_config('lamssa.user_id',$2,true),set_config('lamssa.session_id',$3,true)`,[clinics[index],users[index],sessions[index]]);
}
async function scoped<T>(index:number,work:(c:PoolClient)=>Promise<T>,rollback=false) {
  const client=await pool.connect();
  try{await client.query('BEGIN');await context(client,index);const value=await work(client);await client.query(rollback?'ROLLBACK':'COMMIT');return value;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
const denied=(error:unknown)=>(error as {code:string}).code==='42501';
for(const i of [0,1])live(`runtime context ${i===0?'A':'B'} sees only its own protected rows, without application WHERE filters`,async()=>{
  await scoped(i,async c=>{
    for(const table of ['ClinicBranding','ClinicDomain','ClinicMembership']){
      const rows=(await c.query(`SELECT "clinicId" FROM public."${table}"`)).rows;
      assert.equal(rows.length,1);assert.equal(rows[0].clinicId,clinics[i]);
    }
    assert.deepEqual((await c.query('SELECT id FROM public."Clinic"')).rows,[{id:clinics[i]}]);
  });
});
live('missing context returns no protected rows and rejects writes',async()=>{
  for(const table of ['Clinic','ClinicBranding','ClinicDomain','ClinicMembership'])assert.equal((await pool.query(`SELECT 1 FROM public."${table}"`)).rowCount,0);
  await assert.rejects(pool.query('INSERT INTO public."ClinicDomain" (id,"clinicId",hostname,"updatedAt") VALUES ($1,$2,$3,NOW())',[randomUUID(),clinics[0],`missing-${suffix}.example.invalid`]),denied);
});
live('malformed or incomplete GUCs fail closed, including forged clinic selection',async()=>{
  for(const value of ['','not-a-uuid',randomUUID(),clinics[1]]){
    await scoped(0,async c=>{await c.query("SELECT set_config('lamssa.clinic_id',$1,true)",[value]);assert.equal((await c.query('SELECT * FROM public."ClinicDomain"')).rowCount,0);});
  }
  await scoped(0,async c=>{await c.query("SELECT set_config('lamssa.session_id','not-a-uuid',true)");assert.equal((await c.query('SELECT * FROM public."ClinicBranding"')).rowCount,0);});
});
live('cross-clinic SELECT/UPDATE/DELETE are filtered and INSERT is rejected',async()=>{
  await scoped(0,async c=>{
    assert.equal((await c.query('SELECT * FROM public."ClinicDomain" WHERE id=$1',[domains[1]])).rowCount,0);
    assert.equal((await c.query('UPDATE public."ClinicDomain" SET hostname=hostname WHERE id=$1',[domains[1]])).rowCount,0);
    assert.equal((await c.query('DELETE FROM public."ClinicDomain" WHERE id=$1',[domains[1]])).rowCount,0);
  });
  await assert.rejects(scoped(0,c=>c.query('INSERT INTO public."ClinicDomain" (id,"clinicId",hostname,"updatedAt") VALUES ($1,$2,$3,NOW())',[randomUUID(),clinics[1],`cross-${suffix}.example.invalid`])),denied);
});
live('same-clinic domain INSERT/UPDATE/DELETE succeeds under runtime credentials',async()=>{
  const id=randomUUID();
  await scoped(0,async c=>{
    assert.equal((await c.query('INSERT INTO public."ClinicDomain" (id,"clinicId",hostname,"updatedAt") VALUES ($1,$2,$3,NOW())',[id,clinics[0],`own-${suffix}.example.invalid`])).rowCount,1);
    assert.equal((await c.query('UPDATE public."ClinicDomain" SET hostname=$1 WHERE id=$2',[`updated-${suffix}.example.invalid`,id])).rowCount,1);
    assert.equal((await c.query('DELETE FROM public."ClinicDomain" WHERE id=$1',[id])).rowCount,1);
  });
});
live('clinicId reassignment is rejected even by the maintenance owner',async()=>{
  await assert.rejects(scoped(0,c=>c.query('UPDATE public."ClinicDomain" SET "clinicId"=$1 WHERE id=$2',[clinics[1],domains[0]])),denied);
  await assert.rejects(owner.clinicDomain.update({where:{id:domains[0]},data:{clinicId:clinics[1]}}));
  assert.equal((await owner.clinicDomain.findUniqueOrThrow({where:{id:domains[0]}})).clinicId,clinics[0]);
});
live('runtime cannot change global users, clinic roots, or membership roles',async()=>{
  for(const sql of ['UPDATE public."User" SET status=status','UPDATE public."Clinic" SET status=status','UPDATE public."ClinicMembership" SET role=role'])await assert.rejects(pool.query(sql),denied);
});
live('RLS remains active under row_security=off and runtime cannot change policies or owner role',async()=>{
  await assert.rejects(scoped(0,async c=>{await c.query('SET LOCAL row_security=off');return c.query('SELECT * FROM public."ClinicBranding"');}),denied);
  for(const sql of ['ALTER TABLE public."ClinicDomain" DISABLE ROW LEVEL SECURITY','DROP POLICY tenant_select ON public."ClinicBranding"','CREATE FUNCTION lamssa_security.untrusted() RETURNS int LANGUAGE sql AS \'SELECT 1\'','TRUNCATE public."ClinicDomain"'])await assert.rejects(pool.query(sql),denied);
  const {rows:[role]}=await pool.query('SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname=current_user');
  assert.deepEqual(role,{rolsuper:false,rolbypassrls:false,rolcreaterole:false,rolcreatedb:false});
  const {rows:[table]}=await pool.query(`SELECT pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid='public."ClinicDomain"'::regclass`);
  await assert.rejects(pool.query(`SET ROLE "${table.owner}"`),denied);
});
live('FORCE RLS, explicit command policies, and locked definer search paths are installed',async()=>{
  const tables=(await pool.query(`SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid IN ('public."Clinic"'::regclass,'public."ClinicBranding"'::regclass,'public."ClinicDomain"'::regclass,'public."ClinicMembership"'::regclass)`)).rows;
  assert.equal(tables.length,4);assert(tables.every(t=>t.relrowsecurity&&t.relforcerowsecurity));
  for(const t of tables){const policies=(await pool.query('SELECT cmd FROM pg_policies WHERE schemaname=$1 AND tablename=$2',['public',t.relname])).rows.map(r=>r.cmd).sort();assert.deepEqual(policies,['ALL','DELETE','INSERT','SELECT','UPDATE']);}
  const functions=(await pool.query(`SELECT p.proname,p.prosecdef,p.proconfig,EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='lamssa_security'`)).rows;
  assert.equal(functions.length,7);assert(functions.every(f=>f.proconfig.includes('search_path=pg_catalog, pg_temp')&&!f.public_execute));
  assert.deepEqual(functions.filter(f=>f.prosecdef).map(f=>f.proname).sort(),['context_allows','identity_memberships','public_branding']);
});
live('concurrent runtime transactions use distinct connections without context contamination',async()=>{
  const results=await Promise.all([0,1,0,1].map(i=>scoped(i,async c=>{
    const pid=(await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await c.query('SELECT pg_sleep(0.04)');
    const rows=(await c.query('SELECT "clinicId" FROM public."ClinicDomain"')).rows;
    assert.deepEqual(rows,[{clinicId:clinics[i]}]);return pid;
  })));
  assert(new Set(results).size>1);
  assert.equal((await pool.query('SELECT * FROM public."ClinicDomain"')).rowCount,0);
});
live('commit, rollback and reused physical connections retain no tenant context',async()=>{
  const c=await pool.connect();
  try{
    const pid=(await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    for(const i of [0,1])for(const finish of ['COMMIT','ROLLBACK']){
      await c.query('BEGIN');await context(c,i);assert.equal((await c.query('SELECT * FROM public."ClinicDomain"')).rowCount,1);
      await c.query(finish);
      assert.equal((await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,pid);
      assert.equal((await c.query('SELECT * FROM public."ClinicDomain"')).rowCount,0);
      const settings=(await c.query("SELECT NULLIF(current_setting('lamssa.clinic_id',true),'') AS clinic,NULLIF(current_setting('lamssa.user_id',true),'') AS actor,NULLIF(current_setting('lamssa.session_id',true),'') AS session")).rows[0];
      assert.deepEqual(settings,{clinic:null,actor:null,session:null});
    }
  }finally{c.release();}
});
live('central service rejects fabricated principals, absent permissions and unauthorized clinics',async()=>{
  await assert.rejects(database.withClinicContext({} as VerifiedPrincipal,clinics[0],['clinic.branding.read'],async()=>true));
  await assert.rejects(database.withClinicContext(proofs[0],clinics[0],[],async()=>true));
  await assert.rejects(database.withClinicContext(proofs[0],clinics[1],['clinic.branding.read'],async()=>true));
  await assert.rejects(database.withClinicContext(proofs[0],'invalid',['clinic.branding.read'],async()=>true));
});
live('central Prisma transactions isolate concurrent reads and roll back failed writes',async()=>{
  const results=await Promise.all([0,1,0,1].map(i=>database.withClinicContext(proofs[i],clinics[i],['clinic.branding.read'],async tx=>{
    const rows=await tx.clinicBranding.findMany();assert.deepEqual(rows.map(r=>r.clinicId),[clinics[i]]);return rows[0].primaryColor;
  })));
  assert.notEqual(results[0],results[1]);
  await assert.rejects(database.withClinicContext(proofs[0],clinics[0],['clinic.branding.update'],async tx=>{await tx.clinicBranding.update({where:{clinicId:clinics[0]},data:{primaryColor:'#123456'}});throw new Error('intentional fixture rollback');}));
  assert.equal((await owner.clinicBranding.findUniqueOrThrow({where:{clinicId:clinics[0]}})).primaryColor,'#7854D9');
  assert.equal(await runtime.clinicBranding.count(),0);
});
live('dual member must select the intended clinic; revoked and suspended contexts remain inaccessible',async()=>{
  const membership=await owner.clinicMembership.create({data:{userId:users[0],clinicId:clinics[1],role:'DOCTOR',status:'ACTIVE'}});
  const user=await identity.userById(users[0]);assert(user);await owner.session.update({where:{id:sessions[0]},data:{authorizationHash:authorizationHash(user)}});
  try{
    await assert.rejects(database.withClinicContext(proofs[0],clinics[1],['clinic.branding.read'],async()=>true));
    await owner.session.update({where:{id:sessions[0]},data:{selectedClinicId:clinics[1]}});
    assert.equal(await database.withClinicContext(proofs[0],clinics[1],['clinic.branding.read'],tx=>tx.clinicDomain.count()),1);
    await assert.rejects(database.withClinicContext(proofs[0],clinics[1],['staff.manage'],async()=>true));
    await owner.clinicMembership.update({where:{id:membership.id},data:{status:'SUSPENDED'}});
    await scoped(0,async c=>{await c.query("SELECT set_config('lamssa.clinic_id',$1,true)",[clinics[1]]);assert.equal((await c.query('SELECT * FROM public."ClinicDomain"')).rowCount,0);});
    await assert.rejects(database.withClinicContext(proofs[0],clinics[1],['clinic.branding.read'],async()=>true));
  }finally{
    await owner.clinicMembership.delete({where:{id:membership.id}});
    const original=await identity.userById(users[0]);assert(original);
    await owner.session.update({where:{id:sessions[0]},data:{selectedClinicId:clinics[0],authorizationHash:authorizationHash(original)}});
  }
  await owner.clinic.update({where:{id:clinics[0]},data:{status:'SUSPENDED'}});
  try{await scoped(0,async c=>assert.equal((await c.query('SELECT * FROM public."ClinicBranding"')).rowCount,0));}finally{await owner.clinic.update({where:{id:clinics[0]},data:{status:'ACTIVE'}});}
  await owner.session.update({where:{id:sessions[0]},data:{revokedAt:new Date()}});
  try{await scoped(0,async c=>assert.equal((await c.query('SELECT * FROM public."ClinicBranding"')).rowCount,0));}finally{await owner.session.update({where:{id:sessions[0]},data:{revokedAt:null}});}
});
live('public branding function exposes only approved fields without tenant GUCs',async()=>{
  const rows=(await pool.query('SELECT * FROM lamssa_security.public_branding($1)',[`rls-0-${suffix}`])).rows;
  assert.equal(rows.length,1);assert.deepEqual(Object.keys(rows[0]).sort(),['accentColor','displayName','hasBranding','logoUrl','primaryColor','secondaryColor','slug']);
  assert.equal((await pool.query('SELECT * FROM lamssa_security.public_branding($1)',["' OR true --"])).rowCount,0);
  assert.equal((await pool.query('SELECT * FROM public."ClinicBranding"')).rowCount,0);
});
live('migrations remain applied and maintenance seed stays idempotent under FORCE RLS',async()=>{
  // Roll back the seed exercise so the test DB retains no extra seed records.
  const {owner:ownerUrl}=testUrls();const setup=new Pool({connectionString:ownerUrl,max:1});
  try{const rows=(await setup.query('SELECT migration_name FROM public._prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name')).rows;assert.equal(rows.length,4);}finally{await setup.end();}
  const before=await owner.clinic.findMany({where:{slug:{in:['ward-demo','nour-demo']}},include:{branding:true,domains:true}});
  await seedDemoClinics(owner);const once=await owner.clinic.findMany({where:{slug:{in:['ward-demo','nour-demo']}},include:{branding:true,domains:true},orderBy:{slug:'asc'}});
  await seedDemoClinics(owner);const twice=await owner.clinic.findMany({where:{slug:{in:['ward-demo','nour-demo']}},include:{branding:true,domains:true},orderBy:{slug:'asc'}});assert.deepEqual(twice,once);assert.notEqual(twice[0].branding!.primaryColor,twice[1].branding!.primaryColor);
  for(const row of twice.filter(row=>!before.some(existing=>existing.id===row.id))){await owner.clinicDomain.deleteMany({where:{clinicId:row.id}});await owner.clinicBranding.deleteMany({where:{clinicId:row.id}});await owner.clinic.delete({where:{id:row.id}});}
});

live('tenant service fails closed if maintenance credentials are accidentally configured as runtime',async()=>{
  const config=new ConfigService<Environment,true>(validateEnvironment({NODE_ENV:'test',DATABASE_URL:testUrls().owner,AUTH_CSRF_SECRET:randomBytes(48).toString('base64url'),CORS_ORIGINS:'http://localhost:5173'}));
  const unsafe=new PrismaService(config),service=new TenantDatabaseService(unsafe,new IdentityDatabase(unsafe),registry,config);
  try{await assert.rejects(service.withClinicContext(proofs[0],clinics[0],['clinic.branding.read'],tx=>tx.clinicBranding.findMany()));}finally{await unsafe.$disconnect();}
});

live('Prisma connection uses UTC and its session instants agree with PostgreSQL',async()=>{
  const [{timezone}]=await runtime.$queryRaw<{timezone:string}[]>`SELECT current_setting('TimeZone') AS timezone`;
  assert.equal(timezone,'UTC');
  const row=(await pool.query('SELECT "expiresAt",("expiresAt">NOW()) AS valid FROM public."Session" WHERE id=$1',[sessions[1]])).rows[0];
  const viaPrisma=await runtime.session.findUniqueOrThrow({where:{id:sessions[1]}});
  assert.equal(viaPrisma.expiresAt.getTime(),row.expiresAt.getTime());assert.equal(row.valid,true);
});
