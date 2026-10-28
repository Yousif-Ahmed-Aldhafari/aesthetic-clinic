import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { config } from 'dotenv';
import { configureApp } from '../src/configure-app.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { fixtureDatabase } from './database-fixtures.js';
import { ClinicPermissions } from '../src/auth/access.js';
import { digest } from '../src/auth/crypto.js';
import { loginBucketKey } from '../src/auth/login-limiter.service.js';
import { provisionUser } from '../scripts/provision-user.js';

config({ path: resolve(import.meta.dirname, '../../../../.env'), quiet: true });
const developmentUrl = process.env.DATABASE_URL;
const testUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(testUrl);
const origin = 'http://localhost:5173';
const password = randomBytes(32).toString('base64url');
const suffix = randomUUID();
const clinicIds = [randomUUID(), randomUUID()];
const slugs = [`auth-a-${suffix}`, `auth-b-${suffix}`];
const userIds: string[] = [];
const accounts = ['owner','doctor','dual','platform','rate'].map(name=>`${name}-${suffix}@example.invalid`);
let app: INestApplication, prisma: PrismaClient, base: string;

@Controller('security-test')
class SecurityController {
  @Get('unmarked') unmarked() { return { shouldNeverBeReturned: true }; }
  @Get('clinics/:clinicId/financial') @ClinicPermissions('invoices.manage') financial() { return { ok: true }; }
}
class Browser {
  cookies = new Map<string,string>();
  csrf = '';
  async request(path: string, method = 'GET', body?: unknown, headers: Record<string,string> = {}) {
    const response = await fetch(`${base}/api/v1/${path}`, { method, headers: {
      Cookie: [...this.cookies].map(([key,value])=>`${key}=${value}`).join('; '),
      ...(method !== 'GET' ? { Origin: origin, 'Content-Type': 'application/json', 'X-CSRF-Token': this.csrf } : {}), ...headers,
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0], index = pair.indexOf('=');
      this.cookies.set(pair.slice(0,index), pair.slice(index+1));
    }
    return response;
  }
  async preauth() {
    const response = await this.request('auth/csrf');
    this.csrf = (await response.json() as { csrfToken: string }).csrfToken;
  }
  async login(index = 0, pass = password) {
    await this.preauth();
    const response = await this.request('auth/login','POST',{ email: accounts[index], password: pass });
    if (response.ok) this.csrf = (await response.clone().json() as { csrfToken: string }).csrfToken;
    return response;
  }
  async select(index: number) {
    const response = await this.request('auth/clinic','POST',{clinicId:clinicIds[index]});
    if (response.ok) this.csrf = (await response.clone().json() as { csrfToken: string }).csrfToken;
    return response;
  }
  tokenHash() { return digest(this.cookies.get('lamssa_session')!); }
}
const live = (name: string, fn: () => Promise<void>)=>test(name, { skip: !enabled }, fn);
before(async () => {
  if (!enabled) return;
  const identity = (url: string)=>{ const u=new URL(url); return `${u.hostname}:${u.port||5432}${u.pathname}`; };
  assert.notEqual(identity(testUrl!), identity(developmentUrl!), 'Integration tests require a separate database');
  process.env.NODE_ENV='test'; process.env.DATABASE_URL=testUrl;
  process.env.AUTH_CSRF_SECRET=randomBytes(48).toString('base64url');
  process.env.METRICS_SECRET_KEY=randomBytes(48).toString('base64url');
  process.env.CORS_ORIGINS=origin; process.env.AUTH_LOGIN_ACCOUNT_LIMIT='100'; process.env.AUTH_LOGIN_IP_LIMIT='10000';
  const { AppModule } = await import('../src/app.module.js');
  const module = await Test.createTestingModule({imports:[AppModule],controllers:[SecurityController]}).compile();
  app=module.createNestApplication({logger:false}); configureApp(app); await app.listen(0,'127.0.0.1'); base=await app.getUrl();
  prisma=fixtureDatabase();
  for (const [i,id] of clinicIds.entries()) await prisma.clinic.create({data:{id,slug:slugs[i],legalName:'عيادة اختبار وهمية',displayName:`عيادة اختبار ${i+1}`,currency:'YER',branding:{create:{primaryColor:i===0?'#7854D9':'#087F8C'}}}});
  for (const [i,email] of accounts.entries()) {
    const role = i===1 ? 'DOCTOR' : 'CLINIC_OWNER';
    const result=await provisionUser(prisma,{email,name:'مستخدم اختبار وهمي',password,memberships:[{clinicSlug:slugs[0],role}]});
    userIds.push(result.id);
    if (i===2) await prisma.clinicMembership.create({data:{userId:result.id,clinicId:clinicIds[1],role:'ACCOUNTANT',status:'ACTIVE'}});
    if (i===3) {
      await prisma.clinicMembership.deleteMany({where:{userId:result.id}});
      await prisma.user.update({where:{id:result.id},data:{platformRole:'PLATFORM_ADMIN'}});
    }
  }
});
after(async () => {
  if (prisma) {
    // Only UUID-tracked fictional fixtures; never reset, truncate or delete unrelated rows.
    await prisma.session.deleteMany({where:{userId:{in:userIds}}});
    await prisma.clinicMembership.deleteMany({where:{userId:{in:userIds}}});
    await prisma.user.deleteMany({where:{id:{in:userIds}}});
    await prisma.clinicBranding.deleteMany({where:{clinicId:{in:clinicIds}}});
    await prisma.clinic.deleteMany({where:{id:{in:clinicIds}}});
    const window=Math.floor(Date.now()/900000);
    await prisma.loginBucket.deleteMany({where:{key:{in:[window,window-1].flatMap(w=>[...accounts,`missing-${suffix}@example.invalid`,...[0,1,2].map(i=>`ip-${i}-${suffix}@example.invalid`)].map(email=>loginBucketKey('account',email,w)))}}});
  }
  await prisma?.$disconnect();
  await app?.close();
});
live('valid login stores only hashed verifiers and uses HttpOnly scoped cookies',async()=>{
  const browser=new Browser(), response=await browser.login(); assert.equal(response.status,200);
  const data=await response.json() as Record<string,unknown>;
  assert.deepEqual(Object.keys(data).sort(),['csrfToken','expiresAt','selectedClinicId','user']);
  assert.deepEqual(Object.keys(data.user as object).sort(),['email','id','name']);
  const cookie=response.headers.getSetCookie().find(s=>s.startsWith('lamssa_session='))!;
  assert(cookie.includes('HttpOnly') && cookie.includes('SameSite=Lax') && cookie.includes('Path=/api/v1'));
  assert(!cookie.includes('Domain='));
  const row=await prisma.session.findUniqueOrThrow({where:{tokenHash:browser.tokenHash()}});
  assert.equal(row.csrfHash,digest(browser.csrf)); assert.equal(row.tokenHash.length,64);
  assert.equal((await prisma.user.findUniqueOrThrow({where:{id:userIds[0]}})).passwordHash!.startsWith('$argon2id$v=19$'),true);
  const parameters=(await prisma.user.findUniqueOrThrow({where:{id:userIds[0]}})).passwordHash!.split('$')[3].split(',').sort();
  assert.deepEqual(parameters,['m=65536','p=1','t=3']);
  assert.equal((await browser.request('auth/me')).status,200);
});
live('unknown email, wrong password and suspended user return identical generic failure',async()=>{
  const bodies=[];
  for(const [index,pass] of [[0,'incorrect'],[4,'incorrect']] as const){const r=await new Browser().login(index,pass);assert.equal(r.status,401);bodies.push(await r.json());}
  const b=new Browser();await b.preauth();const r=await b.request('auth/login','POST',{email:`missing-${suffix}@example.invalid`,password});assert.equal(r.status,401);bodies.push(await r.json());
  await prisma.user.update({where:{id:userIds[4]},data:{status:'SUSPENDED'}});
  try{const r=await new Browser().login(4);assert.equal(r.status,401);bodies.push(await r.json());}finally{await prisma.user.update({where:{id:userIds[4]},data:{status:'ACTIVE'}});}
  for(const body of bodies) assert.deepEqual(body,bodies[0]);
});
live('private routes reject missing/forged sessions; unmarked routes fail closed',async()=>{
  const b=new Browser();
  for(const path of ['auth/me','auth/clinics',`clinics/${clinicIds[0]}/me`]) assert.equal((await b.request(path)).status,401);
  b.cookies.set('lamssa_session',randomBytes(32).toString('base64url'));assert.equal((await b.request('auth/me')).status,401);
  assert.equal((await b.request('security-test/unmarked')).status,403);
});
live('clinic A member cannot read or select clinic B, including forged context',async()=>{
  const b=new Browser();assert.equal((await b.login()).status,200);
  assert.equal((await b.select(0)).status,200);
  assert.equal((await b.request(`clinics/${clinicIds[0]}/me`)).status,200);
  const settings=await b.request(`clinics/${clinicIds[0]}/settings`);assert.equal(settings.status,200);
  assert.deepEqual(Object.keys(await settings.json() as object).sort(),['currency','displayName','timezone']);
  assert.equal((await b.request(`clinics/${clinicIds[1]}/me?slug=${slugs[0]}&role=CLINIC_OWNER`, 'GET',undefined,{'X-Clinic-Id':clinicIds[0],'X-Role':'PLATFORM_ADMIN'})).status,404);
  assert.equal((await b.select(1)).status,404);
  assert.equal((await b.request('auth/clinic','POST',{clinicId:clinicIds[0],role:'CLINIC_OWNER',slug:slugs[1]})).status,400);
  assert.equal((await b.request('clinics/not-a-uuid/me')).status,400);
});
live('dual membership selects either clinic with different identity and rotates the session',async()=>{
  const b=new Browser();await b.login(2);const colors=[];
  assert.equal((await b.request(`clinics/${clinicIds[0]}/me`)).status,403);
  for(const i of [0,1]){const old=b.tokenHash();const r=await b.select(i);assert.equal(r.status,200);const data=await r.json() as {clinic:{clinicId:string;branding:{primaryColor:string}}};assert.equal(data.clinic.clinicId,clinicIds[i]);assert.equal((await b.request(`clinics/${clinicIds[1-i]}/me`)).status,403);colors.push(data.clinic.branding.primaryColor);assert.notEqual(b.tokenHash(),old);assert((await prisma.session.findUniqueOrThrow({where:{tokenHash:old}})).revokedAt);}
  assert.notEqual(colors[0],colors[1]);
  const clinics=await (await b.request('auth/clinics')).json() as {clinics:unknown[]};assert.equal(clinics.clinics.length,2);
});
live('least privilege denies settings and financial permissions to doctor despite forged role',async()=>{
  const b=new Browser();await b.login(1);await b.select(0);
  assert.equal((await b.request(`clinics/${clinicIds[0]}/me`)).status,200);
  assert.equal((await b.request(`clinics/${clinicIds[0]}/settings?role=CLINIC_OWNER`,'GET',undefined,{'X-Role':'CLINIC_OWNER'})).status,403);
  assert.equal((await b.request(`security-test/clinics/${clinicIds[0]}/financial`)).status,403);
});
live('global platform administrator has no automatic clinic bypass',async()=>{
  const b=new Browser();await b.login(3);assert.equal((await b.request(`clinics/${clinicIds[0]}/me`)).status,404);
  assert.deepEqual(await (await b.request('auth/clinics')).json(),{clinics:[]});
});
live('clinic owners and admins cannot access platform telemetry while an active platform operator can',async()=>{
  const clinicOwner=new Browser();await clinicOwner.login(0);
  assert.equal((await clinicOwner.request('health/diagnostics')).status,403);
  assert.equal((await clinicOwner.request('alerts/active')).status,403);
  assert.equal((await clinicOwner.request('metrics')).status,401);
  await prisma.clinicMembership.update({where:{clinicId_userId:{clinicId:clinicIds[0],userId:userIds[0]}},data:{role:'CLINIC_ADMIN'}});
  try{
    const clinicAdmin=new Browser();await clinicAdmin.login(0);
    assert.equal((await clinicAdmin.request('health/diagnostics')).status,403);
    assert.equal((await clinicAdmin.request('alerts/active')).status,403);
    assert.equal((await clinicAdmin.request('metrics')).status,401);
  }finally{
    await prisma.clinicMembership.update({where:{clinicId_userId:{clinicId:clinicIds[0],userId:userIds[0]}},data:{role:'CLINIC_OWNER'}});
  }
  const platform=new Browser();await platform.login(3);
  assert.equal((await platform.request('health/diagnostics')).status,200);
  assert.equal((await platform.request('alerts/active')).status,200);
  const machine=await fetch(`${base}/api/v1/metrics`,{headers:{'X-Metrics-Key':process.env.METRICS_SECRET_KEY!}});
  assert.equal(machine.status,200);
  const snapshot=await machine.json() as Record<string,unknown>;
  assert(!JSON.stringify(snapshot).includes(slugs[0]));
  assert(!JSON.stringify(snapshot).includes(clinicIds[0]));
});
live('suspended membership, clinic and user revoke existing sessions and deny fresh access',async()=>{
  for(const target of ['membership','clinic','user']){
    const b=new Browser();await b.login(1);
    const set=async(status:'ACTIVE'|'SUSPENDED')=>{
      if(target==='membership')await prisma.clinicMembership.update({where:{clinicId_userId:{clinicId:clinicIds[0],userId:userIds[1]}},data:{status}});
      if(target==='clinic')await prisma.clinic.update({where:{id:clinicIds[0]},data:{status}});
      if(target==='user')await prisma.user.update({where:{id:userIds[1]},data:{status}});
    };
    await set('SUSPENDED');
    try{
      assert.equal((await b.request(`clinics/${clinicIds[0]}/me`)).status,401);
      const fresh=new Browser();const login=await fresh.login(1);
      if(target==='user')assert.equal(login.status,401);else{assert.equal(login.status,200);assert.equal((await fresh.request(`clinics/${clinicIds[0]}/me`)).status,404);assert.equal((await fresh.select(0)).status,404);}
    }finally{await set('ACTIVE');}
  }
});
live('absolute expiration and idle timeout revoke sessions',async()=>{
  for(const idle of [false,true]){
    const b=new Browser();await b.login();const tokenHash=b.tokenHash();
    const yesterday=new Date(Date.now()-86400000);
    await prisma.session.update({where:{tokenHash},data:idle?{lastSeenAt:yesterday}:{createdAt:new Date(yesterday.getTime()-1000),expiresAt:yesterday}});
    const r=await b.request('auth/me');assert.equal(r.status,401);assert((await prisma.session.findUniqueOrThrow({where:{tokenHash}})).revokedAt);
  }
});
live('explicit rotation and re-login invalidate old cookies; logout is persistent',async()=>{
  const b=new Browser();await b.login();
  for(const action of ['rotate','login']){
    const replay=new Browser();replay.cookies=new Map(b.cookies);
    const response=action==='rotate'?await b.request('auth/rotate','POST',{}):await b.login();assert.equal(response.status,200);
    b.csrf=(await response.json() as {csrfToken:string}).csrfToken;
    assert.equal((await replay.request('auth/me')).status,401);
  }
  const replay=new Browser();replay.cookies=new Map(b.cookies);
  assert.equal((await b.request('auth/logout','POST',{})).status,200);
  assert.equal((await replay.request('auth/me')).status,401);
});
live('privilege changes invalidate every older session and re-login issues a new verifier',async()=>{
  const a=new Browser(),b=new Browser();await a.login(1);await b.login(1);const old=a.tokenHash();
  await prisma.clinicMembership.update({where:{clinicId_userId:{clinicId:clinicIds[0],userId:userIds[1]}},data:{role:'RECEPTIONIST'}});
  try{assert.equal((await a.request('auth/me')).status,401);assert.equal((await b.request('auth/me')).status,401);await a.login(1);assert.notEqual(a.tokenHash(),old);assert.equal((await a.request('auth/me')).status,200);}finally{await prisma.clinicMembership.update({where:{clinicId_userId:{clinicId:clinicIds[0],userId:userIds[1]}},data:{role:'DOCTOR'}});}
});
live('CSRF rejects missing/foreign origins, missing/forged tokens and cross-site requests',async()=>{
  const b=new Browser();await b.login();
  const before=(await prisma.session.findUniqueOrThrow({where:{tokenHash:b.tokenHash()}})).lastSeenAt;
  for(const headers of ([{Origin:''},{Origin:'https://evil.example'},{'X-CSRF-Token':''},{'X-CSRF-Token':'forged'},{'Sec-Fetch-Site':'cross-site'}] as Record<string,string>[])){
    assert.equal((await b.request('auth/logout','POST',{},headers)).status,403);
  }
  assert.equal((await prisma.session.findUniqueOrThrow({where:{tokenHash:b.tokenHash()}})).lastSeenAt.getTime(),before.getTime());
  assert.equal((await b.request('auth/me')).status,200);
  const c=new Browser();await c.preauth();c.csrf='forged';c.cookies.set('lamssa_preauth','forged');
  assert.equal((await c.request('auth/login','POST',{email:accounts[0],password})).status,403);
});
live('public branding stays unauthenticated and contains no private fields',async()=>{
  const results=[];
  for(const slug of slugs){const r=await new Browser().request(`public/clinics/${slug}/branding`);assert.equal(r.status,200);const data=await r.json() as {branding:{primaryColor:string}};assert.deepEqual(Object.keys(data).sort(),['branding','displayName','slug']);assert.deepEqual(Object.keys(data.branding).sort(),['accentColor','faviconUrl','logoUrl','primaryColor','secondaryColor','typography']);results.push(data);}
  assert.notEqual(results[0].branding.primaryColor,results[1].branding.primaryColor);
});
live('login rate limit persists across fresh clients and ignores spoofed forwarding header',async()=>{
  const config=app.get(ConfigService);config.set('AUTH_LOGIN_ACCOUNT_LIMIT',2);
  const window=Math.floor(Date.now()/900000),key=loginBucketKey('account',accounts[4],window);
  await prisma.loginBucket.deleteMany({where:{key}});
  try{for(const status of [401,401,429]){const b=new Browser();await b.preauth();const r=await b.request('auth/login','POST',{email:accounts[4],password:'wrong'},{'X-Forwarded-For':randomUUID()});assert.equal(r.status,status);}assert.equal((await prisma.loginBucket.findUniqueOrThrow({where:{key}})).attempts,3);}finally{config.set('AUTH_LOGIN_ACCOUNT_LIMIT',100);}
});
live('controlled provisioning refuses implicit overwrite and revokes sessions on explicit update',async()=>{
  const input={email:accounts[4],name:'اختبار',password,memberships:[{clinicSlug:slugs[0],role:'RECEPTIONIST' as const}]};
  await assert.rejects(provisionUser(prisma,input),/explicit/);
  const b=new Browser();await b.login(4);await provisionUser(prisma,{...input,updateExisting:true});assert.equal((await b.request('auth/me')).status,401);
  await assert.rejects(provisionUser(prisma,{...input,email:`bad-${suffix}@example.invalid`,password:'short'}),/Invalid/);
});
live('live health and readiness remain available',async()=>{
  for(const path of ['health','health/ready']){const r=await new Browser().request(path);assert.equal(r.status,200);assert.deepEqual(await r.json(),{status:path==='health'?'ok':'ready'});}
});

live('production auth refuses plaintext HTTP even with a spoofed forwarding header',async()=>{
  const cfg=app.get(ConfigService);cfg.set('NODE_ENV','production');
  try{for(const headers of [{},{'X-Forwarded-Proto':'https'}] as Record<string,string>[])assert.equal((await new Browser().request('auth/csrf','GET',undefined,headers)).status,403);assert.equal((await new Browser().request('health')).status,200);}finally{cfg.set('NODE_ENV','test');}
});

live('rotating the CSRF server secret expires older sessions safely',async()=>{
  const b=new Browser();await b.login();const cfg=app.get(ConfigService),old=cfg.get<string>('AUTH_CSRF_SECRET');
  cfg.set('AUTH_CSRF_SECRET',randomBytes(48).toString('base64url'));
  try{assert.equal((await b.request('auth/me')).status,401);}finally{cfg.set('AUTH_CSRF_SECRET',old);}
});

live('IP throttling spans accounts and cannot be bypassed by spoofed X-Forwarded-For',async()=>{
  const cfg=app.get(ConfigService),key=loginBucketKey('ip','127.0.0.1',Math.floor(Date.now()/900000));
  const baseline=(await prisma.loginBucket.findUnique({where:{key}}))?.attempts??0;
  cfg.set('AUTH_LOGIN_IP_LIMIT',baseline+2);
  try{
    for(const [i,status] of [401,401,429].entries()){
      const b=new Browser();await b.preauth();
      const r=await b.request('auth/login','POST',{email:`ip-${i}-${suffix}@example.invalid`,password:'incorrect'},{'X-Forwarded-For':`192.0.2.${i+1}`});
      assert.equal(r.status,status);
    }
  }finally{cfg.set('AUTH_LOGIN_IP_LIMIT',10000);}
});
