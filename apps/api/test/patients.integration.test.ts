import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg, { type PoolClient } from 'pg';
import { configureApp } from '../src/configure-app.js';
import { digest } from '../src/auth/crypto.js';
import { loginBucketKey } from '../src/auth/login-limiter.service.js';
import { provisionUser } from '../scripts/provision-user.js';
import { fixtureDatabase, testUrls } from './database-fixtures.js';

const enabled=Boolean(process.env.TEST_DATABASE_URL);
const live=(name:string,fn:()=>Promise<void>)=>test(`patients: ${name}`,{skip:!enabled},fn);
const suffix=randomUUID(),clinics=[randomUUID(),randomUUID()],users:string[]=[],password=randomBytes(32).toString('base64url');
const accounts=['owner','doctor','reception','accountant','dual'].map(n=>`${n}-patients-${suffix}@example.invalid`);
const slugs=clinics.map((_,i)=>`patients-${i}-${suffix}`),origin='http://localhost:5173';
let owner:ReturnType<typeof fixtureDatabase>,pool:pg.Pool,app:INestApplication,base:string;
type Patient={id:string;patientNumber:string;fullName:string;phone:string|null;email:string|null;dateOfBirth:string|null;gender:string|null;status:string;version:number};
class Browser {
  cookies=new Map<string,string>();csrf='';
  async request(path:string,method='GET',body?:unknown,headers:Record<string,string>={}) {
    const r=await fetch(`${base}/api/v1/${path}`,{method,headers:{Cookie:[...this.cookies].map(([k,v])=>`${k}=${v}`).join('; '),...(method==='GET'?{}:{Origin:origin,'Content-Type':'application/json','X-CSRF-Token':this.csrf}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
    for(const cookie of r.headers.getSetCookie()){const [pair]=cookie.split(';'),i=pair.indexOf('=');this.cookies.set(pair.slice(0,i),pair.slice(i+1));}return r;
  }
  async login(index=0,clinic=0) {
    this.csrf=(await (await this.request('auth/csrf')).json() as {csrfToken:string}).csrfToken;
    let r=await this.request('auth/login','POST',{email:accounts[index],password});assert.equal(r.status,200);
    this.csrf=(await r.json() as {csrfToken:string}).csrfToken;await this.select(clinic);return this;
  }
  async select(index:number){const r=await this.request('auth/clinic','POST',{clinicId:clinics[index]});assert.equal(r.status,200);this.csrf=(await r.json() as {csrfToken:string}).csrfToken;}
  path(clinic=0,id=''){return `clinics/${clinics[clinic]}/patients${id?`/${id}`:''}`;}
  async create(data:unknown={fullName:'مريض اختبار وهمي'},clinic=0) {const r=await this.request(this.path(clinic),'POST',data);assert.equal(r.status,201,JSON.stringify(await r.clone().json()));return await r.json() as Patient;}
  async context(work:(client:PoolClient)=>Promise<void>,clinic=0) {
    const session=await owner.session.findUniqueOrThrow({where:{tokenHash:digest(this.cookies.get('lamssa_session')!)}});
    const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('lamssa.clinic_id',$1,true),set_config('lamssa.user_id',$2,true),set_config('lamssa.session_id',$3,true)",[clinics[clinic],session.userId,session.id]);await work(c);}finally{await c.query('ROLLBACK');c.release();}
  }
}
before(async()=>{
  if(!enabled)return;
  const urls=testUrls();process.env.DATABASE_URL=urls.runtime;process.env.NODE_ENV='test';process.env.AUTH_CSRF_SECRET=randomBytes(48).toString('base64url');process.env.CORS_ORIGINS=origin;process.env.AUTH_LOGIN_ACCOUNT_LIMIT='100';process.env.AUTH_LOGIN_IP_LIMIT='10000';
  const {AppModule}=await import('../src/app.module.js');const module=await Test.createTestingModule({imports:[AppModule]}).compile();app=module.createNestApplication({logger:false});configureApp(app);await app.listen(0,'127.0.0.1');base=await app.getUrl();
  owner=fixtureDatabase();pool=new pg.Pool({connectionString:urls.runtime,max:5,options:'-c timezone=UTC'});
  for(const [i,id] of clinics.entries())await owner.clinic.create({data:{id,slug:slugs[i],legalName:'عيادة اختبار وهمية',displayName:`عيادة مرضى وهمية ${i}`,currency:'YER',branding:{create:{primaryColor:i?'#087F8C':'#7854D9'}}}});
  const roles=['CLINIC_OWNER','DOCTOR','RECEPTIONIST','ACCOUNTANT','CLINIC_OWNER'] as const;
  for(const [i,email] of accounts.entries()){const u=await provisionUser(owner,{email,name:'مستخدم اختبار وهمي',password,memberships:[{clinicSlug:slugs[0],role:roles[i]}]});users.push(u.id);if(i===4)await owner.clinicMembership.create({data:{clinicId:clinics[1],userId:u.id,role:'CLINIC_OWNER',status:'ACTIVE'}});}
});
after(async()=>{
  if(owner){await owner.patient.deleteMany({where:{clinicId:{in:clinics}}});await owner.patientCounter.deleteMany({where:{clinicId:{in:clinics}}});await owner.session.deleteMany({where:{userId:{in:users}}});await owner.clinicMembership.deleteMany({where:{userId:{in:users}}});await owner.user.deleteMany({where:{id:{in:users}}});await owner.clinicBranding.deleteMany({where:{clinicId:{in:clinics}}});await owner.clinic.deleteMany({where:{id:{in:clinics}}});
    const window=Math.floor(Date.now()/900000);await owner.loginBucket.deleteMany({where:{key:{in:[window,window-1].flatMap(w=>accounts.map(email=>loginBucketKey('account',email,w)))}}});await owner.$disconnect();}
  if(pool)await pool.end();if(app)await app.close();
});
live('registration normalizes optional contact fields and returns only approved date-only fields',async()=>{
  const b=await new Browser().login();const p=await b.create({fullName:'  أَحْمَد   الوهمي  ',phone:'٠٠٩٦٧ (٧٧٧) ١٢٣-٤٥٦',email:' FICTIONAL@EXAMPLE.INVALID ',dateOfBirth:'2000-02-29',gender:'UNDISCLOSED'});
  assert.equal(p.fullName,'أَحْمَد الوهمي');assert.equal(p.phone,'+967777123456');assert.equal(p.email,'fictional@example.invalid');assert.equal(p.dateOfBirth,'2000-02-29');assert.match(p.patientNumber,/^P-\d{6,10}$/);assert.equal(p.version,1);
  assert.deepEqual(Object.keys(p).sort(),['createdAt','dateOfBirth','email','fullName','gender','id','patientNumber','phone','status','updatedAt','version']);assert.deepEqual(await (await b.request(b.path(0,p.id))).json(),p);
});
live('identical names and phones are allowed; absent/blank/null optional values stay null',async()=>{
  const b=await new Browser().login();for(const phone of [undefined,'',null,'777123456','777123456']){const p=await b.create({fullName:'اسم وهمي مكرر',phone});assert.equal(p.phone,phone?'777123456':null);assert.equal(p.email,null);assert.equal(p.gender,null);}
});
live('Arabic search folds only the search key, supports literal prefix/phone/number, and paginates deterministically',async()=>{
  const b=await new Browser().login();const p=await b.create({fullName:'إِيَادـ الوهمي',phone:'٧٧١٢٣٤٥٦٧'});
  for(const q of ['اياد','إِيَاد',p.patientNumber,'٧٧١٢٣']){const r=await b.request(`${b.path()}?q=${encodeURIComponent(q)}`);assert.equal(r.status,200);assert((await r.json() as {items:Patient[]}).items.some(i=>i.id===p.id));}
  assert.equal((await (await b.request(`${b.path()}?q=%25`)).json() as {items:Patient[]}).items.length,0);
  let cursor='',seen=new Set<string>();do{const r=await b.request(`${b.path()}?pageSize=2${cursor?`&cursor=${cursor}`:''}`);assert.equal(r.status,200);const data=await r.json() as {items:Patient[];nextCursor:string|null;pageSize:number};assert(data.items.length<=2);for(const p of data.items){assert(!seen.has(p.id));seen.add(p.id);}cursor=data.nextCursor??'';}while(cursor);assert(seen.size>=7);
});
live('concurrent first and subsequent allocation produces unique clinic-local numbers',async()=>{
  const b=await new Browser().login(4,1);const rows=await Promise.all(Array.from({length:10},(_,i)=>b.create({fullName:`تزامن وهمي ${i}`},1)));
  assert.equal(new Set(rows.map(p=>p.patientNumber)).size,10);assert.deepEqual(rows.map(p=>p.patientNumber).sort(),Array.from({length:10},(_,i)=>`P-${String(i+1).padStart(6,'0')}`));
  await b.select(0);const a=await b.request(`${b.path()}?q=P-000001`);assert.equal((await a.json() as {items:Patient[]}).items[0].patientNumber,'P-000001');
});
live('clinic A cannot list clinic B or retrieve/update its IDs; absent and foreign IDs have identical safe responses',async()=>{
  const dual=await new Browser().login(4,1),foreign=await dual.create({fullName:'هوية وهمية للعيادة الثانية'},1),a=await new Browser().login();
  assert.equal((await a.request(a.path(1))).status,404);const responses:unknown[]=[];
  for(const id of [foreign.id,randomUUID()]){for(const method of ['GET','PATCH']){const r=await a.request(a.path(0,id),method,method==='PATCH'?{fullName:'تغيير وهمي',expectedVersion:1}:undefined);assert.equal(r.status,404);responses.push(await r.json());}}
  assert(responses.every(r=>JSON.stringify(r)===JSON.stringify(responses[0])));
  assert.equal((await a.request(`${a.path()}?cursor=${foreign.id}`)).status,404);
});
live('profile update uses optimistic version; status requires its separate validated workflow',async()=>{
  const b=await new Browser().login(),p=await b.create();let r=await b.request(b.path(0,p.id),'PATCH',{fullName:'اسم وهمي محدث',email:null,expectedVersion:1});assert.equal(r.status,200);assert.equal((await r.json() as Patient).version,2);
  r=await b.request(b.path(0,p.id),'PATCH',{fullName:'نسخة قديمة وهمية',expectedVersion:1});assert.equal(r.status,409);
  r=await b.request(`${b.path(0,p.id)}/status`,'PATCH',{status:'INACTIVE',expectedVersion:2});assert.equal(r.status,200);assert.equal((await r.json() as Patient).status,'INACTIVE');
  assert.equal((await (await b.request(b.path(0,p.id))).json() as Patient).status,'INACTIVE');assert(!(await (await b.request(b.path())).json() as {items:Patient[]}).items.some(i=>i.id===p.id));
  assert((await (await b.request(`${b.path()}?status=INACTIVE`)).json() as {items:Patient[]}).items.some(i=>i.id===p.id));
  assert.equal((await b.request(`${b.path(0,p.id)}/status`,'PATCH',{status:'ACTIVE',expectedVersion:3})).status,200);
});
live('simultaneous edits cannot silently overwrite one another',async()=>{
  const b=await new Browser().login(),p=await b.create();const r=await Promise.all(['الأول','الثاني'].map(n=>b.request(b.path(0,p.id),'PATCH',{fullName:`تعديل وهمي ${n}`,expectedVersion:1})));assert.deepEqual(r.map(x=>x.status).sort(),[200,409]);
});
live('receptionist can register/update, doctor can read/update only, accountant cannot read patients',async()=>{
  const reception=await new Browser().login(2),p=await reception.create();assert.equal((await reception.request(reception.path(0,p.id),'PATCH',{phone:null,expectedVersion:1})).status,200);
  const doctor=await new Browser().login(1);assert.equal((await doctor.request(doctor.path(0,p.id))).status,200);assert.equal((await doctor.request(doctor.path(),'POST',{fullName:'رفض وهمي'})).status,403);assert.equal((await doctor.request(doctor.path(0,p.id),'PATCH',{email:null,expectedVersion:2})).status,200);
  const accountant=await new Browser().login(3);for(const path of [accountant.path(),accountant.path(0,p.id)])assert.equal((await accountant.request(path)).status,403);
});
live('invalid, oversized, forged identity/status/clinical fields are strictly rejected',async()=>{
  const b=await new Browser().login();for(const data of [{},{fullName:''},{fullName:'x'.repeat(151)},{fullName:'1234'},{fullName:'وهمي\u0000'},{fullName:'وهمي\u202e'},{fullName:'وهمي',clinicId:clinics[1]},{fullName:'وهمي',patientNumber:'P-000001'},{fullName:'وهمي',id:randomUUID()},{fullName:'وهمي',status:'INACTIVE'},{fullName:'وهمي',notes:'ملاحظات'},{fullName:'وهمي',phone:'123'},{fullName:'وهمي',phone:'1'.repeat(16)},{fullName:'وهمي',email:'invalid'},{fullName:'وهمي',dateOfBirth:'2023-02-29'},{fullName:'وهمي',dateOfBirth:'2999-01-01'},{fullName:'وهمي',gender:'UNKNOWN'},{fullName:'وهمي',fullNameExtra:'x'}])assert.equal((await b.request(b.path(),'POST',data)).status,400,JSON.stringify(data));
  const p=await b.create();for(const data of [{expectedVersion:1},{fullName:null,expectedVersion:1},{fullName:'وهمي'},{clinicId:clinics[1],expectedVersion:1},{patientNumber:'P-999999',expectedVersion:1},{status:'INACTIVE',expectedVersion:1}])assert.equal((await b.request(b.path(0,p.id),'PATCH',data)).status,400);
  for(const query of ['pageSize=0','pageSize=51','pageSize=abc','cursor=no','q='+encodeURIComponent('x'.repeat(61)),'role=CLINIC_OWNER','status=DELETED'])assert.equal((await b.request(`${b.path()}?${query}`)).status,400);
  assert.equal((await b.request(`${b.path(0,p.id)}/status`,'PATCH',{status:'DELETED',expectedVersion:1})).status,400);assert.equal((await b.request(b.path(0,'not-uuid'))).status,400);
});
live('POST and both PATCH workflows reject missing or forged CSRF/origins without mutations',async()=>{
  const b=await new Browser().login(),p=await b.create();for(const headers of ([{'X-CSRF-Token':''},{'X-CSRF-Token':'forged'},{Origin:'https://evil.example'},{Origin:''}] as Record<string,string>[]))for(const [path,method,body] of [[b.path(),'POST',{fullName:'رفض وهمي'}],[b.path(0,p.id),'PATCH',{fullName:'رفض وهمي',expectedVersion:1}],[`${b.path(0,p.id)}/status`,'PATCH',{status:'INACTIVE',expectedVersion:1}]] as const)assert.equal((await b.request(path,method,body,headers)).status,403);
  assert.equal((await owner.patient.findUniqueOrThrow({where:{id:p.id}})).version,1);
});
live('unauthenticated and inactive user/membership/clinic are denied',async()=>{
  assert.equal((await new Browser().request(`clinics/${clinics[0]}/patients`)).status,401);
  for(const target of ['membership','user','clinic']){const b=await new Browser().login(1);const status=async(value:'ACTIVE'|'SUSPENDED')=>{if(target==='user')await owner.user.update({where:{id:users[1]},data:{status:value}});if(target==='clinic')await owner.clinic.update({where:{id:clinics[0]},data:{status:value}});if(target==='membership')await owner.clinicMembership.update({where:{clinicId_userId:{clinicId:clinics[0],userId:users[1]}},data:{status:value}});};await status('SUSPENDED');try{assert.equal((await b.request(b.path())).status,401);}finally{await status('ACTIVE');}}
});
live('dual membership selection rotates sessions and never authorizes the other selected clinic',async()=>{
  const b=await new Browser().login(4);for(const i of [0,1,0]){await b.select(i);const r=await b.request(b.path(i));assert.equal(r.status,200);assert.equal((await b.request(b.path(1-i))).status,403);}
});
live('actual runtime role has FORCE RLS and only SELECT/INSERT/UPDATE on patient/counter',async()=>{
  const {rows}=await pool.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner)=current_user AS owner,has_table_privilege(c.oid,'DELETE') AS can_delete FROM pg_class c WHERE c.oid IN ('public."Patient"'::regclass,'public."PatientCounter"'::regclass)`);assert.equal(rows.length,2);for(const row of rows){assert.equal(row.relrowsecurity,true);assert.equal(row.relforcerowsecurity,true);assert.equal(row.owner,false);assert.equal(row.can_delete,false);}
  const {rows:[role]}=await pool.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user');assert.deepEqual(role,{rolsuper:false,rolbypassrls:false});await assert.rejects(pool.query('ALTER TABLE public."Patient" DISABLE ROW LEVEL SECURITY'),(e:{code:string})=>e.code==='42501');
});
live('missing and invalid runtime context filters all patients/counters and denies inserts',async()=>{
  for(const context of ['', 'not-a-uuid']){const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('lamssa.clinic_id',$1,true)",[context]);assert.equal((await c.query('SELECT * FROM public."Patient"')).rowCount,0);assert.equal((await c.query('SELECT * FROM public."PatientCounter"')).rowCount,0);await c.query('SAVEPOINT missing_write');await assert.rejects(c.query('INSERT INTO public."PatientCounter" ("clinicId","lastNumber") VALUES ($1,1)',[randomUUID()]),(e:{code:string})=>e.code==='42501');await c.query('ROLLBACK TO SAVEPOINT missing_write');await assert.rejects(c.query('INSERT INTO public."Patient" (id,"clinicId","patientNumber","fullName","searchName","updatedAt") VALUES ($1,$2,$3,$4,$4,now())',[randomUUID(),clinics[0],'P-999999','رفض وهمي']),(e:{code:string})=>e.code==='42501');}finally{await c.query('ROLLBACK');c.release();}}
});
live('runtime RLS sees only selected-clinic rows; foreign SELECT/UPDATE filter and INSERT fails',async()=>{
  const b=await new Browser().login(4);await b.context(async c=>{const rows=(await c.query('SELECT "clinicId" FROM public."Patient"')).rows;assert(rows.length>0);assert(rows.every(p=>p.clinicId===clinics[0]));assert.equal((await c.query('UPDATE public."Patient" SET "fullName"=$1 WHERE "clinicId"=$2',['رفض وهمي',clinics[1]])).rowCount,0);assert.equal((await c.query('SELECT * FROM public."Patient" WHERE "clinicId"=$1',[clinics[1]])).rowCount,0);await assert.rejects(c.query('INSERT INTO public."Patient" (id,"clinicId","patientNumber","fullName","searchName","updatedAt") VALUES ($1,$2,$3,$4,$4,now())',[randomUUID(),clinics[1],'P-999999','رفض وهمي']),(e:{code:string})=>e.code==='42501');});
});
live('database rejects reassignment/renumbering, counter rewind, and runtime hard deletion',async()=>{
  const b=await new Browser().login(),p=await b.create();for(const column of ['clinicId','patientNumber','id'])await b.context(async c=>{await assert.rejects(c.query(`UPDATE public."Patient" SET "${column}"=$1 WHERE id=$2`,[column==='patientNumber'?'P-999999':randomUUID(),p.id]),(e:{code:string})=>e.code==='42501');});
  await b.context(async c=>{await assert.rejects(c.query('UPDATE public."PatientCounter" SET "lastNumber"=1 WHERE "clinicId"=$1',[clinics[0]]),(e:{code:string})=>e.code==='42501');});
  for(const table of ['Patient','PatientCounter'])await b.context(async c=>{await assert.rejects(c.query(`DELETE FROM public."${table}"`),(e:{code:string})=>e.code==='42501');});
});
live('rollback and pooled concurrent contexts cannot leak patient rows',async()=>{
  const a=await new Browser().login(4,0),b=await new Browser().login(4,1);await Promise.all(Array.from({length:12},(_,i)=>(i%2?a:b).context(async c=>{const expected=i%2?clinics[0]:clinics[1];const rows=(await c.query('SELECT "clinicId" FROM public."Patient"')).rows;assert(rows.length);assert(rows.every(p=>p.clinicId===expected));},i%2?0:1)));for(let i=0;i<6;i++)assert.equal((await pool.query('SELECT * FROM public."Patient"')).rowCount,0);
});
live('unique number is clinic-scoped; public branding never returns patient data',async()=>{
  const b=await new Browser().login();await b.context(async c=>{const p=(await c.query('SELECT * FROM public."Patient" LIMIT 1')).rows[0];await assert.rejects(c.query('INSERT INTO public."Patient" (id,"clinicId","patientNumber","fullName","searchName","updatedAt") VALUES ($1,$2,$3,$4,$4,now())',[randomUUID(),clinics[0],p.patientNumber,'تكرار وهمي']),(e:{code:string})=>e.code==='23505');});
  for(const slug of slugs){const r=await new Browser().request(`public/clinics/${slug}/branding`);assert.equal(r.status,200);assert.deepEqual(Object.keys(await r.json() as object).sort(),['branding','displayName','slug']);}
});

live('a failed registration transaction rolls back its counter and all tentative patient writes',async()=>{
  const b=await new Browser().login();const before=await owner.patientCounter.findUniqueOrThrow({where:{clinicId:clinics[0]}});
  await b.context(async c=>{await c.query('UPDATE public."PatientCounter" SET "lastNumber"="lastNumber"+1 WHERE "clinicId"=$1',[clinics[0]]);await assert.rejects(c.query('INSERT INTO public."Patient" (id,"clinicId","patientNumber","fullName","searchName","updatedAt") VALUES ($1,$2,$3,$4,$4,now())',[randomUUID(),clinics[0],'P-999999','x']),(e:{code:string})=>e.code==='23514');});
  assert.equal((await owner.patientCounter.findUniqueOrThrow({where:{clinicId:clinics[0]}})).lastNumber,before.lastNumber);
});

live('search treats percent, underscore and backslash as literal name prefixes',async()=>{
  const b=await new Browser().login();for(const prefix of ['%','_','\\']){const p=await b.create({fullName:`${prefix} اسم وهمي`});const r=await b.request(`${b.path()}?q=${encodeURIComponent(prefix)}`);assert.equal(r.status,200);const rows=(await r.json() as {items:Patient[]}).items;assert.equal(rows.length,1);assert.equal(rows[0].id,p.id);}
});
