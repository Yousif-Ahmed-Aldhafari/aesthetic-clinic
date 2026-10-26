import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import pg, { type PoolClient } from 'pg';
import sharp from 'sharp';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { fixtureDatabase, testUrls } from './database-fixtures.js';
import { provisionUser } from '../scripts/provision-user.js';
import { hashPassword } from '../src/auth/password.js';
import { digest } from '../src/auth/crypto.js';
import { configureApp } from '../src/configure-app.js';
import { DomainVerifier } from '../src/identity/domain-verifier.js';
const enabled=Boolean(process.env.TEST_DATABASE_URL),live=(name:string,fn:()=>Promise<void>)=>test('identity: '+name,{skip:!enabled},fn);
const suffix=randomUUID(),clinics=[randomUUID(),randomUUID()],users:string[]=[],patients:string[]=[],password=randomBytes(32).toString('base64url'),origin='http://localhost:5173';
const roles=['CLINIC_OWNER','CLINIC_ADMIN','DOCTOR','RECEPTIONIST','ACCOUNTANT','CLINIC_OWNER'] as const;
const emails=roles.map((_,i)=>`identity-${i}-${suffix}@example.invalid`),proofs=new Map<string,string>();
let owner:ReturnType<typeof fixtureDatabase>,app:INestApplication,pool:pg.Pool,base:string,storage:string;
type Profile={displayName:string;englishName:string|null;legalName:string;contactPhone:string|null;contactEmail:string|null;address:string|null;latitude:string|null;longitude:string|null;timezone:string;currency:string;version:number;currencyLocked:boolean;timezoneLocked:boolean};
type Brand={logoUrl:string|null;faviconUrl:string|null;primaryColor:string;secondaryColor:string;accentColor:string|null;typography:string;logoAssetId:string|null;faviconAssetId:string|null;version:number};
type Member={id:string;role:string;status:string;version:number;user:{email:string;name:string;status:string}};
type Domain={id:string;hostname:string;version:number;verificationStatus:string;routingActive:boolean;verifiedAt:string|null;dnsRecord:{name:string;value:string}};
type Asset={id:string;previewUrl:string;mimeType:string;width:number;height:number};
class Browser {
  cookies=new Map<string,string>();csrf='';clinic=0;
  path(s=''){return `clinics/${clinics[this.clinic]}/identity${s}`;}
  async request(path:string,method='GET',body?:unknown,headers:Record<string,string>={}){
    const r=await fetch(`${base}/api/v1/${path}`,{method,headers:{Cookie:[...this.cookies].map(([k,v])=>`${k}=${v}`).join('; '),...(method==='GET'?{}:{Origin:origin,'X-CSRF-Token':this.csrf,...(body instanceof FormData?{}:{'Content-Type':'application/json'})}),...headers},...(body===undefined?{}:{body:body instanceof FormData?body:JSON.stringify(body)})});
    for(const cookie of r.headers.getSetCookie()){const[pair]=cookie.split(';'),i=pair.indexOf('=');this.cookies.set(pair.slice(0,i),pair.slice(i+1));}return r;
  }
  async login(role=0,clinic=0){this.clinic=clinic;this.csrf=(await (await this.request('auth/csrf')).json() as {csrfToken:string}).csrfToken;const r=await this.request('auth/login','POST',{email:emails[role],password});assert.equal(r.status,200);this.csrf=(await r.json() as {csrfToken:string}).csrfToken;const selected=await this.request('auth/clinic','POST',{clinicId:clinics[clinic]});assert.equal(selected.status,200);this.csrf=(await selected.json() as {csrfToken:string}).csrfToken;return this;}
  async context(work:(client:PoolClient)=>Promise<void>){const session=await owner.session.findUniqueOrThrow({where:{tokenHash:digest(this.cookies.get('lamssa_session')!)}}),c=await pool.connect();try{await c.query('BEGIN');await c.query("select set_config('lamssa.clinic_id',$1,true),set_config('lamssa.user_id',$2,true),set_config('lamssa.session_id',$3,true)",[clinics[this.clinic],session.userId,session.id]);await work(c);}finally{await c.query('ROLLBACK');c.release();}}
}
async function json<T>(r:Response,status=200):Promise<T>{assert.equal(r.status,status,JSON.stringify(await r.clone().json()));return r.json() as Promise<T>;}
const profile=(b:Browser)=>b.request(b.path('/profile')).then(r=>json<Profile>(r));
const branding=(b:Browser)=>b.request(b.path('/branding')).then(r=>json<Brand>(r));
const profileBody=(p:Profile,changes:Record<string,unknown>={})=>({expectedVersion:p.version,displayName:p.displayName,englishName:p.englishName,legalName:p.legalName,contactPhone:p.contactPhone,contactEmail:p.contactEmail,address:p.address,latitude:p.latitude,longitude:p.longitude,timezone:p.timezone,currency:p.currency,...changes});
const brandBody=(b:Brand,x:Record<string,unknown>={})=>({expectedVersion:b.version,primaryColor:b.primaryColor,secondaryColor:b.secondaryColor,accentColor:b.accentColor,typography:b.typography,...x});
async function upload(b:Browser,purpose='LOGO',bytes?:Buffer,mime='image/png'){const buffer=bytes??await sharp({create:{width:64,height:64,channels:3,background:'#7854D9'}}).png().toBuffer();const form=new FormData();form.append('file',new Blob([new Uint8Array(buffer)],{type:mime}),'untrusted-name.png');return b.request(b.path('/assets/'+purpose),'POST',form);}
const members=async(b:Browser)=>(await json<{items:Member[]}>(await b.request(b.path('/members')))).items;
before(async()=>{
 if(!enabled)return;const urls=testUrls();storage=await mkdtemp(join(tmpdir(),'lamssa-identity-assets-'));Object.assign(process.env,{DATABASE_URL:urls.runtime,NODE_ENV:'test',ASSET_STORAGE_DIR:storage,AUTH_CSRF_SECRET:randomBytes(48).toString('base64url'),CORS_ORIGINS:origin,AUTH_LOGIN_ACCOUNT_LIMIT:'200',AUTH_LOGIN_IP_LIMIT:'10000'});
 const {AppModule}=await import('../src/app.module.js');const mod=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(DomainVerifier).useValue({owns:async(h:string,hash:string)=>proofs.get(h)===hash}).compile();app=mod.createNestApplication({logger:false});configureApp(app);await app.listen(0,'127.0.0.1');base=await app.getUrl();owner=fixtureDatabase();pool=new pg.Pool({connectionString:urls.runtime,max:4});
 for(const[i,id]of clinics.entries()){await owner.clinic.create({data:{id,slug:`identity-${i}-${suffix}`,displayName:`عيادة هوية وهمية ${i}`,legalName:`مؤسسة وهمية ${i}`,timezone:'Asia/Aden',currency:'YER',branding:{create:{primaryColor:i?'#087F8C':'#7854D9'}}}});patients.push((await owner.patient.create({data:{clinicId:id,fullName:'مريض هوية وهمي',searchName:'مريض هوية وهمي',patientNumber:'P-000001'}})).id);}
 for(const[i,role]of roles.entries())users.push((await provisionUser(owner,{email:emails[i],name:'مستخدم هوية وهمي',password,memberships:[{clinicSlug:`identity-${i===5?1:0}-${suffix}`,role}]})).id);
 await owner.clinicMembership.create({data:{clinicId:clinics[1],userId:users[3],role:'RECEPTIONIST',status:'ACTIVE'}});
});
after(async()=>{
 if(owner){await owner.$transaction(async tx=>{for(const name of ['financialAuditEvent','paymentReversal','payment','invoiceLine','invoice','clinicInvoiceCounter','clinicBillingProfile']as const)await(tx[name].deleteMany as(a:object)=>Promise<unknown>)({where:{clinicId:{in:clinics}}});});
 for(const name of ['resourceAvailability','resourceTimeOff','bookableResource','patient','clinicBranding','clinicDomain','clinicAsset','clinicIdentityAuditEvent','clinicIdentityState']as const)await(owner[name].deleteMany as(a:object)=>Promise<unknown>)({where:{clinicId:{in:clinics}}});
 await owner.session.deleteMany({where:{userId:{in:users}}});await owner.clinicMembership.deleteMany({where:{userId:{in:users}}});await owner.user.deleteMany({where:{id:{in:users}}});await owner.clinic.deleteMany({where:{id:{in:clinics}}});await owner.$disconnect();}
 await pool?.end();await app?.close();if(storage)await rm(storage,{recursive:true,force:true});
});
live('owner and admin update private profile with normalized contacts, explicit versions and audit',async()=>{
 const b=await new Browser().login(),p=await profile(b);assert.equal(p.englishName,null);assert.equal(p.version,1);await json(await b.request(b.path('/profile'),'PATCH',profileBody(p,{displayName:'عيادة ورد الهوية',englishName:'Fictional Ward',contactPhone:'٧٧٧ ١٢٣ ٤٥٦',contactEmail:'CLINIC@EXAMPLE.COM',address:'عنوان وهمي',latitude:'12.5',longitude:'45.0'})));
 const now=await profile(b);assert.equal(now.version,2);assert.equal(now.contactPhone,'777123456');assert.equal(now.contactEmail,'clinic@example.com');assert.equal(now.latitude,'12.500000');assert.equal((await b.request(b.path('/profile'),'PATCH',profileBody(p))).status,409);
 const admin=await new Browser().login(1);await json(await admin.request(admin.path('/profile'),'PATCH',profileBody(await profile(admin),{legalName:'اسم قانوني وهمي محدّث'})));
 assert((await owner.clinicIdentityAuditEvent.count({where:{clinicId:clinics[0]}}))>=2);
});
live('timezone and currency require acknowledgement; established history locks changes without reinterpretation',async()=>{
 const b=await new Browser().login(5,1),p=await profile(b);assert.equal((await b.request(b.path('/profile'),'PATCH',profileBody(p,{currency:'SAR'}))).status,400);
 await json(await b.request(b.path('/profile'),'PATCH',profileBody(p,{currency:'SAR',timezone:'Asia/Riyadh',confirmTimezoneChange:true,confirmCurrencyChange:true})));
 const resource=await owner.bookableResource.create({data:{clinicId:clinics[1],kind:'ROOM',label:'غرفة وهمية'}});await owner.resourceAvailability.create({data:{clinicId:clinics[1],resourceId:resource.id,weekday:1,startMinute:0,endMinute:60}});
 const locked=await profile(b);assert(locked.timezoneLocked);assert.equal((await b.request(b.path('/profile'),'PATCH',profileBody(locked,{timezone:'UTC',confirmTimezoneChange:true}))).status,409);
 await owner.resourceAvailability.deleteMany({where:{resourceId:resource.id}});await owner.bookableResource.delete({where:{id:resource.id}});
});
live('profile validation rejects unsafe fields, unsupported currency/timezones and invalid locations',async()=>{
 const b=await new Browser().login(),p=await profile(b);for(const extra of [{status:'SUSPENDED'},{clinicId:clinics[1]},{slug:'evil'},{currency:'ZZZ'},{timezone:'+03:00'},{latitude:'99'},{longitude:'0',latitude:null},{displayName:'x'.repeat(201)},{contactEmail:'wrong'}])assert.equal((await b.request(b.path('/profile'),'PATCH',profileBody(p,extra))).status,400);
});
live('doctor, receptionist and accountant cannot administer settings, staff, domains or branding',async()=>{
 for(const role of[2,3,4]){const b=await new Browser().login(role);for(const path of['/profile','/members','/domains','/audit'])assert.equal((await b.request(b.path(path))).status,403);assert.equal((await b.request(b.path('/branding'),'PATCH',{expectedVersion:1,primaryColor:'#17243B',secondaryColor:'#FFFFFF',typography:'SYSTEM'})).status,403);assert.equal((await b.request('platform/me')).status,403);}
});
live('cross-clinic settings and forged role/slug/host context never elevate access',async()=>{
 const b=await new Browser().login(),p=await profile(b);assert.equal((await b.request(`clinics/${clinics[1]}/identity/profile`,'PATCH',profileBody(p),{'X-Role':'CLINIC_OWNER','X-Clinic-Id':clinics[1],'X-Forwarded-Host':'nour.evil.com'})).status,404);
 assert.equal((await b.request(b.path('/branding'),'PATCH',{...brandBody(await branding(b)),role:'CLINIC_OWNER'})).status,400);
});
live('public branding returns only approved fields and excludes private profile/member details',async()=>{
 const b=new Browser(),r=await json<{branding:object}>(await b.request(`public/clinics/identity-0-${suffix}/branding`));assert.deepEqual(Object.keys(r).sort(),['branding','displayName','slug']);assert.deepEqual(Object.keys(r.branding).sort(),['accentColor','faviconUrl','logoUrl','primaryColor','secondaryColor','typography']);const s=JSON.stringify(r);for(const privateValue of['clinic@example.com','777123456','عنوان وهمي','مستخدم هوية وهمي',users[0]])assert(!s.includes(privateValue));
});
live('real uploads are tenant-owned private derivatives until explicit publication',async()=>{
 const b=await new Browser().login(),asset=await json<Asset>(await upload(b),201);assert.equal(asset.mimeType,'image/webp');assert.equal(asset.width,64);assert.equal((await new Browser().request(`public/branding/assets/${asset.id}`)).status,404);
 const read=await b.request(asset.previewUrl.replace('/api/v1/',''));assert.equal(read.status,200);assert.equal(read.headers.get('content-type'),'image/webp');assert.equal((await sharp(Buffer.from(await read.arrayBuffer())).metadata()).width,64);
 const other=await new Browser().login(5,1);assert.equal((await other.request(other.path('/assets/'+asset.id))).status,404);assert.equal((await new Browser().request(asset.previewUrl.replace('/api/v1/',''))).status,401);
 const current=await branding(b);const saved=await json<Brand>(await b.request(b.path('/branding'),'PATCH',brandBody(current,{logoAssetId:asset.id,typography:'SYSTEM'})));assert.equal(saved.logoUrl,`/api/v1/public/branding/assets/${asset.id}`);
 const published=await new Browser().request(`public/branding/assets/${asset.id}`);assert.equal(published.status,200);assert(published.headers.get('cache-control')?.includes('max-age=300'));assert(!published.headers.get('set-cookie'));
});
live('favicon publication, contrast checks, stale versions and cross-clinic asset references are enforced',async()=>{
 const b=await new Browser().login(),other=await new Browser().login(5,1),asset=await json<Asset>(await upload(other),201),icon=await json<Asset>(await upload(b,'FAVICON'),201);let brand=await branding(b);
 assert.equal((await b.request(b.path('/branding'),'PATCH',brandBody(brand,{logoAssetId:asset.id}))).status,404);assert.equal((await b.request(b.path('/branding'),'PATCH',brandBody(brand,{primaryColor:'#FFFFFF'}))).status,400);
 assert.equal((await b.request(b.path('/branding'),'PATCH',brandBody(brand,{logoUrl:'https://evil.com/x'}))).status,400);
 const saved=await json<Brand>(await b.request(b.path('/branding'),'PATCH',brandBody(brand,{faviconAssetId:icon.id})));assert(saved.faviconUrl?.endsWith(icon.id));assert.equal((await b.request(b.path('/branding'),'PATCH',brandBody(brand))).status,409);brand=saved;
 assert.equal((await b.request(b.path('/branding'),'PATCH',brandBody(brand,{logoAssetId:icon.id}))).status,404);
});
live('uploads reject scripts, oversized bodies, unknown parts, CSRF and unauthorized roles',async()=>{
 const b=await new Browser().login();for(const bytes of[Buffer.from('<svg/>'),Buffer.from('<html/>'),Buffer.from([137,80,78,71,13,10,26,10])])assert.equal((await upload(b,'LOGO',bytes)).status,400);
 assert.equal((await upload(b,'LOGO',Buffer.alloc(2097153))).status,413);
 const form=new FormData();form.append('file',new Blob(['fake'],{type:'image/png'}),'x.png');assert.equal((await b.request(b.path('/assets/LOGO'),'POST',form,{'X-CSRF-Token':'forged'})).status,403);
 const doctor=await new Browser().login(2);assert.equal((await upload(doctor)).status,403);
});
live('replacement/removal retains immutable published URLs for historical documents',async()=>{
 const b=await new Browser().login(),old=await branding(b);assert(old.logoUrl);const asset=await json<Asset>(await upload(b),201);let brand=await json<Brand>(await b.request(b.path('/branding'),'PATCH',brandBody(old,{logoAssetId:asset.id})));assert.notEqual(brand.logoUrl,old.logoUrl);assert.equal((await b.request(old.logoUrl.replace('/api/v1/',''))).status,200);
 brand=await json<Brand>(await b.request(b.path('/branding'),'PATCH',brandBody(brand,{logoAssetId:null})));assert.equal(brand.logoUrl,null);assert.equal((await b.request(`public/branding/assets/${asset.id}`)).status,200);
});
live('cleanup deletes only old unpublished own-clinic assets, retaining issued/public identities',async()=>{
 const b=await new Browser().login(),asset=await json<Asset>(await upload(b),201);await owner.clinicAsset.update({where:{id:asset.id},data:{createdAt:new Date(Date.now()-2*86400000)}});const publicCount=await owner.clinicAsset.count({where:{clinicId:clinics[0],publishedAt:{not:null}}});
 await json(await b.request(b.path('/assets/cleanup'),'POST',{confirmUnpublishedOnly:true}),201);assert.equal(await owner.clinicAsset.count({where:{id:asset.id}}),0);assert.equal(await owner.clinicAsset.count({where:{clinicId:clinics[0],publishedAt:{not:null}}}),publicCount);assert.equal((await b.request(asset.previewUrl.replace('/api/v1/',''))).status,404);
});
live('subdomain reservations normalize names, reject reserved/colliding labels and never activate routing',async()=>{
 const b=await new Browser().login(),p=await profile(b);for(const slug of['api','admin','www','bad.dot',`identity-1-${suffix}`])assert([400,409].includes((await b.request(b.path('/subdomain'),'PATCH',{slug,expectedVersion:p.version})).status));
 const reserved=await json<{slug:string;routingActive:boolean}>(await b.request(b.path('/subdomain'),'PATCH',{slug:` IDENTITY-NEW-${suffix} `,expectedVersion:p.version}));assert.equal(reserved.slug,`identity-new-${suffix}`);assert.equal(reserved.routingActive,false);
 await owner.clinic.update({where:{id:clinics[0]},data:{slug:`identity-0-${suffix}`}});
 const other=await new Browser().login(5,1);assert.equal((await other.request(other.path('/subdomain'),'PATCH',{slug:reserved.slug,expectedVersion:(await profile(other)).version})).status,409);
});
live('custom domains require unique public hostnames and one-time hashed expiring TXT challenges',async()=>{
 const b=await new Browser().login();for(const hostname of['127.0.0.1','evil.localhost','http://evil.com','evil.com:80','api.lamssa.localhost'])assert.equal((await b.request(b.path('/domains'),'POST',{hostname})).status,400);
 const d=await json<Domain>(await b.request(b.path('/domains'),'POST',{hostname:`identity-${suffix}.example.com`}),201);assert.equal(d.verificationStatus,'PENDING');assert.equal(d.routingActive,false);assert(d.dnsRecord.value.startsWith('lamssa-verification='));
 const stored=await owner.clinicDomain.findUniqueOrThrow({where:{id:d.id}});assert.equal(stored.challengeHash,createHash('sha256').update(d.dnsRecord.value.split('=')[1]).digest('hex'));assert(!JSON.stringify(stored).includes(d.dnsRecord.value));
 const other=await new Browser().login(5,1);assert.equal((await other.request(other.path('/domains'),'POST',{hostname:d.hostname})).status,409);const list=await json(await b.request(b.path('/domains')));assert(!JSON.stringify(list).includes('challengeHash'));assert(!JSON.stringify(list).includes(d.dnsRecord.value));
});
live('verification fails without matching DNS proof, succeeds only with proof and remains unrouted',async()=>{
 const b=await new Browser().login();let d=await json<Domain>(await b.request(b.path('/domains'),'POST',{hostname:`proof-${suffix}.example.com`}),201);const token=d.dnsRecord.value.split('=')[1];
 d=await json<Domain>(await b.request(b.path('/domains/'+d.id+'/verify'),'POST',{expectedVersion:d.version}),201);assert.equal(d.verificationStatus,'FAILED');assert.equal(d.verifiedAt,null);assert.equal((await b.request(b.path('/domains/'+d.id+'/verify'),'POST',{expectedVersion:d.version})).status,409);
 await owner.clinicDomain.update({where:{id:d.id},data:{lastCheckedAt:new Date(Date.now()-31000)}});proofs.set(d.hostname,createHash('sha256').update(token).digest('hex'));d=await json<Domain>(await b.request(b.path('/domains/'+d.id+'/verify'),'POST',{expectedVersion:d.version}),201);assert.equal(d.verificationStatus,'VERIFIED');assert(d.verifiedAt);assert.equal(d.routingActive,false);
 assert.equal((await b.request(b.path('/domains'),'POST',{hostname:'new.example.com',verificationStatus:'VERIFIED',isPrimary:true})).status,400);
});
live('staff role changes are scoped, versioned and cannot escalate an admin to owner or finance',async()=>{
 const b=await new Browser().login(1),list=await members(b),reception=list.find(m=>m.user.email===emails[3])!;for(const role of['CLINIC_OWNER','CLINIC_ADMIN','ACCOUNTANT','PLATFORM_ADMIN'])assert([400,403].includes((await b.request(b.path('/members/'+reception.id),'PATCH',{expectedVersion:reception.version,role,status:'ACTIVE'})).status));
 for(const target of list.filter(m=>['CLINIC_OWNER','CLINIC_ADMIN','ACCOUNTANT'].includes(m.role)))assert.equal((await b.request(b.path('/members/'+target.id),'PATCH',{expectedVersion:target.version,role:'DOCTOR',status:'ACTIVE'})).status,403);
 const changed=await json<Member>(await b.request(b.path('/members/'+reception.id),'PATCH',{expectedVersion:reception.version,role:'DOCTOR',status:'ACTIVE'}));assert.equal(changed.role,'DOCTOR');assert.equal((await b.request(b.path('/members/'+reception.id),'PATCH',{expectedVersion:reception.version,role:'RECEPTIONIST',status:'ACTIVE'})).status,409);
 await owner.clinicMembership.update({where:{id:reception.id},data:{role:'RECEPTIONIST',version:{increment:1}}});
});
live('admin permission ceiling denies newly granting or reactivating receptionist finance access, including runtime SQL',async()=>{
 const b=await new Browser().login(1),list=await members(b),doctor=list.find(m=>m.user.email===emails[2])!,reception=list.find(m=>m.user.email===emails[3])!;
 assert.equal((await b.request(b.path('/members/'+doctor.id),'PATCH',{expectedVersion:doctor.version,role:'RECEPTIONIST',status:'ACTIVE'})).status,403);
 await assert.rejects(b.context(c=>c.query(`UPDATE "ClinicMembership" SET role='RECEPTIONIST',version=version+1 WHERE id=$1`,[doctor.id]).then(()=>undefined)),e=>(e as {code:string}).code==='42501');
 const suspended=await json<Member>(await b.request(b.path('/members/'+reception.id),'PATCH',{expectedVersion:reception.version,role:'RECEPTIONIST',status:'SUSPENDED'}));
 assert.equal((await b.request(b.path('/members/'+reception.id),'PATCH',{expectedVersion:suspended.version,role:'RECEPTIONIST',status:'ACTIVE'})).status,403);
 const downgraded=await json<Member>(await b.request(b.path('/members/'+reception.id),'PATCH',{expectedVersion:suspended.version,role:'DOCTOR',status:'ACTIVE'}));assert.equal(downgraded.role,'DOCTOR');
 await owner.clinicMembership.update({where:{id:reception.id},data:{role:'RECEPTIONIST',status:'ACTIVE',version:{increment:1}}});
});
live('last owner cannot be deactivated or demoted; foreign membership IDs are safe not-found',async()=>{
 const b=await new Browser().login(),mine=(await members(b)).find(m=>m.user.email===emails[0])!;for(const change of[{role:'DOCTOR',status:'ACTIVE'},{role:'CLINIC_OWNER',status:'SUSPENDED'}])assert.equal((await b.request(b.path('/members/'+mine.id),'PATCH',{expectedVersion:mine.version,...change})).status,409);
 const foreign=await owner.clinicMembership.findFirstOrThrow({where:{clinicId:clinics[1],userId:users[5]}});assert.equal((await b.request(b.path('/members/'+foreign.id),'PATCH',{expectedVersion:foreign.version,role:'DOCTOR',status:'ACTIVE'})).status,404);
});
live('membership revocation invalidates all target sessions without deleting other clinic memberships',async()=>{
 const staff=await new Browser().login(3),otherSession=await new Browser().login(3,1),b=await new Browser().login(),target=(await members(b)).find(m=>m.user.email===emails[3])!;
 await json(await b.request(b.path('/members/'+target.id),'PATCH',{expectedVersion:target.version,role:target.role,status:'SUSPENDED'}));assert.equal((await staff.request('auth/me')).status,401);assert.equal((await otherSession.request('auth/me')).status,401);
 const relogin=await new Browser().login(3,1),contexts=await json<{clinics:{clinicId:string}[]}>(await relogin.request('auth/clinics'));assert.deepEqual(contexts.clinics.map(c=>c.clinicId),[clinics[1]]);assert.equal((await owner.user.findUniqueOrThrow({where:{id:users[3]}})).status,'ACTIVE');await owner.clinicMembership.update({where:{id:target.id},data:{status:'ACTIVE',version:{increment:1}}});
});
live('concurrent owner removals preserve at least one active owner',async()=>{
 const second=await owner.clinicMembership.create({data:{clinicId:clinics[0],userId:users[5],role:'CLINIC_OWNER',status:'ACTIVE'}});const a=await new Browser().login(),b=await new Browser().login(5),first=(await members(a)).find(m=>m.user.email===emails[0])!;
 try{const results=await Promise.all([[a,first],[b,second]].map(async([browser,member])=>{const x=browser as Browser,y=member as Member;return x.request(x.path('/members/'+y.id),'PATCH',{expectedVersion:y.version,role:'DOCTOR',status:'ACTIVE'});}));assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(await owner.clinicMembership.count({where:{clinicId:clinics[0],role:'CLINIC_OWNER',status:'ACTIVE'}}),1);}finally{await owner.clinicMembership.update({where:{id:first.id},data:{role:'CLINIC_OWNER',status:'ACTIVE',version:{increment:1}}});await owner.clinicMembership.delete({where:{id:second.id}});}
});
live('actual runtime RLS denies missing/forged contexts and cross-clinic private assets/audit/state',async()=>{
 const a=await new Browser().login(),b=await new Browser().login(5,1);await upload(b);
 for(const table of['ClinicAsset','ClinicIdentityAuditEvent','ClinicIdentityState','ClinicSlugReservation'])assert.equal((await pool.query(`SELECT * FROM "${table}"`)).rowCount,0);
 await a.context(async c=>{for(const table of['ClinicAsset','ClinicIdentityAuditEvent','ClinicIdentityState','ClinicSlugReservation']){const rows=(await c.query(`SELECT "clinicId" FROM "${table}"`)).rows;assert(rows.every(r=>r.clinicId===clinics[0]));}await c.query("select set_config('lamssa.clinic_id','not-a-uuid',true)");assert.equal((await c.query('SELECT * FROM "ClinicAsset"')).rowCount,0);});
 for(const sql of['UPDATE "ClinicIdentityAuditEvent" SET payload=payload','DELETE FROM "ClinicIdentityAuditEvent"','UPDATE "ClinicIdentityState" SET "lastSequence"=0','UPDATE "ClinicAsset" SET "storageKey"=\'evil\'','ALTER TABLE "ClinicAsset" DISABLE ROW LEVEL SECURITY'])await assert.rejects(pool.query(sql));
});
live('identity audit is trigger-owned, ordered and hash-linked; runtime cannot append forged history',async()=>{
 const events=await owner.clinicIdentityAuditEvent.findMany({where:{clinicId:clinics[0]},orderBy:{sequence:'asc'}});assert(events.length>10);let previous='0'.repeat(64);for(const[e,i]of events.map((e,i)=>[e,i]as const)){assert.equal(e.sequence,i+1);assert.equal(e.previousHash,previous);assert.equal(e.eventHash,createHash('sha256').update(previous+'\n'+e.payload).digest('hex'));previous=e.eventHash;}
 await assert.rejects(pool.query('INSERT INTO "ClinicIdentityAuditEvent" SELECT * FROM "ClinicIdentityAuditEvent"'));assert(!events.some(e=>e.payload.includes('clinic@example.com')));
});
live('all identity mutations enforce CSRF and reject unknown role/ownership inputs',async()=>{
 const b=await new Browser().login(),p=await profile(b),brand=await branding(b);for(const[path,method,body]of[['/profile','PATCH',profileBody(p)],['/branding','PATCH',brandBody(brand)],['/subdomain','PATCH',{slug:'safe-name',expectedVersion:p.version}],['/domains','POST',{hostname:'safe.example.com'}],['/assets/cleanup','POST',{confirmUnpublishedOnly:true}]]as const)assert.equal((await b.request(b.path(path),method,body,{'X-CSRF-Token':'forged'})).status,403);
});
live('host-header injection is rejected; forwarded host never changes branding or redirects',async()=>{
 const b=new Browser(),path=`public/clinics/identity-0-${suffix}/branding`;const poisoned=await new Promise<{status:number;location:unknown}>((resolve,reject)=>{const request=httpRequest(`${base}/api/v1/${path}`,{headers:{Host:'evil.example.com'}},response=>{response.resume();response.on('end',()=>resolve({status:response.statusCode!,location:response.headers.location}));});request.on('error',reject);request.end();});assert.equal(poisoned.status,400);assert.equal(poisoned.location,undefined);const normal=await b.request(path,'GET',undefined,{'X-Forwarded-Host':'evil.example.com'});assert.equal(normal.status,200);assert(!JSON.stringify(await normal.json()).includes('evil.example.com'));
});
live('issued invoice snapshots remain unchanged after profile, branding, legal name or address changes',async()=>{
 const b=await new Browser().login(),root=`clinics/${clinics[0]}/billing`;let invoice=await json<{id:string;version:number;issuer:unknown}>(await b.request(root+'/invoices','POST',{patientId:patients[0],requestKey:randomUUID(),lines:[{serviceName:'خدمة إدارية وهمية',quantity:'1',unitPrice:'10',discount:'0',taxBasisPoints:0}]}),201);invoice=await json(await b.request(root+'/invoices/'+invoice.id+'/issue','POST',{expectedVersion:invoice.version,requestKey:randomUUID()}),201);const frozen=invoice.issuer;
 const p=await profile(b);assert(p.currencyLocked);await json(await b.request(b.path('/profile'),'PATCH',profileBody(p,{legalName:'هوية قانونية لاحقة وهمية',address:'عنوان لاحق وهمي'})));await json(await b.request(b.path('/branding'),'PATCH',brandBody(await branding(b),{primaryColor:'#17243B',typography:'NOTO_NASKH'})));
 const again=await json<{issuer:unknown}>(await b.request(root+'/invoices/'+invoice.id));assert.deepEqual(again.issuer,frozen);assert.equal((await b.request(b.path('/profile'),'PATCH',profileBody(await profile(b),{currency:'SAR',confirmCurrencyChange:true}))).status,409);
});
live('platform administration is a separate explicitly authorized read-only foundation, never a clinic bypass',async()=>{
 const id=randomUUID(),email=`platform-${suffix}@example.invalid`;users.push(id);await owner.user.create({data:{id,email,name:'مشغّل منصة وهمي',status:'ACTIVE',platformRole:'PLATFORM_ADMIN',passwordHash:await hashPassword(password)}});const b=new Browser();b.csrf=(await json<{csrfToken:string}>(await b.request('auth/csrf'))).csrfToken;const login=await json<{csrfToken:string}>(await b.request('auth/login','POST',{email,password}));b.csrf=login.csrfToken;const foundation=await json<{clinicLifecycleEnabled:boolean}>(await b.request('platform/me'));assert.equal(foundation.clinicLifecycleEnabled,false);assert.equal((await b.request(`clinics/${clinics[0]}/identity/profile`)).status,404);assert.equal((await b.request('platform/clinics','POST',{})).status,404);
});
