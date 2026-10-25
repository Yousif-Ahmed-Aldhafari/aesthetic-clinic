import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { before, after, test } from 'node:test';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg, { type PoolClient } from 'pg';
import { fixtureDatabase, testUrls } from './database-fixtures.js';
import { configureApp } from '../src/configure-app.js';
import { provisionUser } from '../scripts/provision-user.js';
import { digest } from '../src/auth/crypto.js';
import { loginBucketKey } from '../src/auth/login-limiter.service.js';
import { canonical } from '../src/prisma/billing.helpers.js';

const enabled=Boolean(process.env.TEST_DATABASE_URL),live=(name:string,fn:()=>Promise<void>)=>test(`billing: ${name}`,{skip:!enabled},fn);
const suffix=randomUUID(),clinics=[randomUUID(),randomUUID()],users:string[]=[],patients:string[]=[],visits:string[]=[],roles=['CLINIC_OWNER','ACCOUNTANT','RECEPTIONIST','DOCTOR','CLINIC_ADMIN'] as const;
const emails=roles.map(r=>`billing-${r}-${suffix}@example.invalid`),password=randomBytes(32).toString('base64url'),origin='http://localhost:5173';
let owner:ReturnType<typeof fixtureDatabase>,app:INestApplication,pool:pg.Pool,base:string;
type Bill={id:string;version:number;number:string|null;status:string;currency:string;currencyScale:number;totalMinor:string;netPaidMinor:string;balanceMinor:string;patientName:string;issuer:Record<string,unknown>|null;lines:Record<string,unknown>[]};
type Payment={id:string;amountMinor:string;refundableMinor:string;reversals:{id:string}[]};
class Browser {
  cookies=new Map<string,string>();csrf='';clinic=0;
  path(suffix=''){return `clinics/${clinics[this.clinic]}/billing${suffix}`;}
  async request(path:string,method='GET',body?:unknown,headers:Record<string,string>={}){
    const r=await fetch(`${base}/api/v1/${path}`,{method,headers:{Cookie:[...this.cookies].map(([k,v])=>`${k}=${v}`).join('; '),...(method==='GET'?{}:{Origin:origin,'Content-Type':'application/json','X-CSRF-Token':this.csrf}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
    for(const cookie of r.headers.getSetCookie()){const [pair]=cookie.split(';'),i=pair.indexOf('=');this.cookies.set(pair.slice(0,i),pair.slice(i+1));}return r;
  }
  async login(role=0,clinic=0){this.clinic=clinic;this.csrf=(await (await this.request('auth/csrf')).json() as {csrfToken:string}).csrfToken;const r=await this.request('auth/login','POST',{email:emails[role],password});assert.equal(r.status,200);this.csrf=(await r.json() as {csrfToken:string}).csrfToken;const s=await this.request('auth/clinic','POST',{clinicId:clinics[clinic]});assert.equal(s.status,200);this.csrf=(await s.json() as {csrfToken:string}).csrfToken;return this;}
  async context(work:(c:PoolClient)=>Promise<void>){const session=await owner.session.findUniqueOrThrow({where:{tokenHash:digest(this.cookies.get('lamssa_session')!)}}),c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('lamssa.clinic_id',$1,true),set_config('lamssa.user_id',$2,true),set_config('lamssa.session_id',$3,true)",[clinics[this.clinic],session.userId,session.id]);await work(c);}finally{await c.query('ROLLBACK');c.release();}}
}
const line=(x:Record<string,unknown>={})=>({serviceName:'خدمة إدارية وهمية',quantity:'1',unitPrice:'100.00',discount:'0',taxBasisPoints:0,...x});
async function json<T>(r:Response,status=200):Promise<T>{assert.equal(r.status,status,JSON.stringify(await r.clone().json()));return await r.json() as T;}
async function draft(b:Browser,x:Record<string,unknown>={}){return json<Bill>(await b.request(b.path('/invoices'),'POST',{patientId:patients[b.clinic],requestKey:randomUUID(),lines:[line()],...x}),201);}
async function issue(b:Browser,i:Bill,key=randomUUID()){return json<Bill>(await b.request(b.path('/invoices/'+i.id+'/issue'),'POST',{expectedVersion:i.version,requestKey:key}),201);}
async function pay(b:Browser,i:Bill,amount='30.00',key=randomUUID()){return json<{invoice:Bill;payment:Payment}>(await b.request(b.path('/invoices/'+i.id+'/payments'),'POST',{amount,method:'CASH',expectedVersion:i.version,requestKey:key}),201);}
before(async()=>{
  if(!enabled)return;const urls=testUrls();process.env.DATABASE_URL=urls.runtime;process.env.NODE_ENV='test';process.env.AUTH_CSRF_SECRET=randomBytes(48).toString('base64url');process.env.CORS_ORIGINS=origin;process.env.AUTH_LOGIN_ACCOUNT_LIMIT='200';process.env.AUTH_LOGIN_IP_LIMIT='10000';
  const {AppModule}=await import('../src/app.module.js');const mod=await Test.createTestingModule({imports:[AppModule]}).compile();app=mod.createNestApplication({logger:false});configureApp(app);await app.listen(0,'127.0.0.1');base=await app.getUrl();owner=fixtureDatabase();pool=new pg.Pool({connectionString:urls.runtime,max:4});
  for(const [i,id] of clinics.entries()){
    await owner.clinic.create({data:{id,slug:`billing-${i}-${suffix}`,legalName:`اسم قانوني وهمي ${i}`,displayName:`عيادة فوترة وهمية ${i}`,currency:i?'KWD':'YER',timezone:'Asia/Aden',branding:{create:{primaryColor:i?'#087F8C':'#7854D9'}}}});
    patients.push((await owner.patient.create({data:{clinicId:id,patientNumber:'P-000001',fullName:`مريض مالي وهمي ${i}`,searchName:`مريض مالي وهمي ${i}`}})).id);
  }
  for(const [i,email] of emails.entries())users.push((await provisionUser(owner,{email,name:'مستخدم مالي وهمي',password,memberships:[{clinicSlug:`billing-0-${suffix}`,role:roles[i]}]})).id);
  await owner.clinicMembership.create({data:{clinicId:clinics[1],userId:users[0],role:'CLINIC_OWNER',status:'ACTIVE'}});
  for(const [i,clinicId] of clinics.entries()){
    let membership=await owner.clinicMembership.findFirst({where:{clinicId,role:'DOCTOR'}});
    if(!membership){const u=await owner.user.create({data:{email:`billing-doc-${suffix}@example.invalid`,name:'طبيب وهمي',status:'ACTIVE'}});users.push(u.id);membership=await owner.clinicMembership.create({data:{clinicId,userId:u.id,role:'DOCTOR',status:'ACTIVE'}});}
    const resource=await owner.bookableResource.create({data:{clinicId,kind:'DOCTOR',label:'طبيب زيارة وهمي',doctorMembershipId:membership.id}});
    visits.push(await owner.$transaction(async tx=>{const v=await tx.visit.create({data:{clinicId,patientId:patients[i],source:'WALK_IN',checkInKey:randomUUID(),requestHash:'a'.repeat(64)}});await tx.queueTicket.create({data:{clinicId,visitId:v.id,doctorResourceId:resource.id,businessDate:new Date('2026-10-25T00:00:00Z'),number:1}});return v.id;}));
  }
});
after(async()=>{
  if(owner){
    await owner.$transaction(async tx=>{for(const table of [tx.financialAuditEvent,tx.paymentReversal,tx.payment,tx.invoiceLine,tx.invoice,tx.clinicInvoiceCounter,tx.clinicBillingProfile] as const)await (table.deleteMany as (a:object)=>Promise<unknown>)({where:{clinicId:{in:clinics}}});});
    for(const table of [owner.queueTicket,owner.visit,owner.bookableResource,owner.patient,owner.clinicBranding] as const)await (table.deleteMany as (a:object)=>Promise<unknown>)({where:{clinicId:{in:clinics}}});
    await owner.session.deleteMany({where:{userId:{in:users}}});await owner.clinicMembership.deleteMany({where:{userId:{in:users}}});await owner.user.deleteMany({where:{id:{in:users}}});await owner.clinic.deleteMany({where:{id:{in:clinics}}});
    const w=Math.floor(Date.now()/900000);await owner.loginBucket.deleteMany({where:{key:{in:[w,w-1].flatMap(window=>emails.map(email=>loginBucketKey('account',email,window)))}}});await owner.$disconnect();
  }await pool?.end();await app?.close();
});

live('draft creation supports patient and matching visit, with exact allowlisted financial fields',async()=>{
  const b=await new Browser().login(),i=await draft(b,{visitId:visits[0],lines:[line({quantity:'2.5',unitPrice:'10.01',discount:'0.03',taxBasisPoints:500})]});assert.equal(i.status,'DRAFT');assert.equal(i.number,null);assert.equal(i.totalMinor,'2625');assert(!JSON.stringify(i).includes('requestHash'));assert(!JSON.stringify(i).includes('phone'));
});
live('cross-clinic and mismatched same-clinic patient/visit links fail safely',async()=>{
  const b=await new Browser().login();for(const extra of [{patientId:patients[1]},{visitId:visits[1]}])assert.equal((await b.request(b.path('/invoices'),'POST',{patientId:patients[0],requestKey:randomUUID(),lines:[line()],...extra})).status,404);
  const p=await owner.patient.create({data:{clinicId:clinics[0],patientNumber:'P-000002',fullName:'مريض آخر وهمي',searchName:'مريض آخر وهمي'}});assert.equal((await b.request(b.path('/invoices'),'POST',{patientId:p.id,visitId:visits[0],requestKey:randomUUID(),lines:[line()]})).status,404);
});
live('draft request retries are idempotent and changed request payload conflicts',async()=>{
  const b=await new Browser().login(),key=randomUUID(),body={requestKey:key},one=await draft(b,body),two=await draft(b,body);assert.equal(one.id,two.id);
  assert.equal((await b.request(b.path('/invoices'),'POST',{patientId:patients[0],requestKey:key,lines:[line({unitPrice:'101.00'})]})).status,409);
});
live('concurrent issuance allocates unique consecutive numbers; issue replay consumes no second number',async()=>{
  const b=await new Browser().login(),rows=await Promise.all(Array.from({length:6},()=>draft(b))),before=await owner.clinicInvoiceCounter.findUniqueOrThrow({where:{clinicId:clinics[0]}}),issued=await Promise.all(rows.map(r=>issue(b,r)));
  const nums=issued.map(i=>Number(i.number!.split('-')[1])).sort((a,z)=>a-z);assert.deepEqual(nums,Array.from({length:6},(_,i)=>before.lastNumber+i+1));
  const d=await draft(b),key=randomUUID(),one=await issue(b,d,key),two=await issue(b,d,key);assert.equal(one.number,two.number);
});
live('draft edits require versions; issued amounts and lines cannot be edited through API or runtime SQL',async()=>{
  const b=await new Browser().login();let i=await draft(b);i=await json<Bill>(await b.request(b.path('/invoices/'+i.id),'PATCH',{expectedVersion:i.version,lines:[line({unitPrice:'200.00'})]}));
  assert.equal((await b.request(b.path('/invoices/'+i.id),'PATCH',{expectedVersion:1,lines:[line()]})).status,409);i=await issue(b,i);
  assert.equal((await b.request(b.path('/invoices/'+i.id),'PATCH',{expectedVersion:i.version,lines:[line()]})).status,409);
  for(const sql of ['UPDATE public."Invoice" SET "totalMinor"="totalMinor"+1,version=version+1 WHERE id=$1','UPDATE public."InvoiceLine" SET "unitPriceMinor"=1 WHERE "invoiceId"=$1','DELETE FROM public."InvoiceLine" WHERE "invoiceId"=$1'])await b.context(async c=>{await assert.rejects(c.query(sql,[i.id]),(e:{code:string})=>e.code==='42501');});
});
live('currency snapshots support two and three decimals without conversion or client override',async()=>{
  const a=await new Browser().login(),b=await new Browser().login(0,1),ia=await draft(a,{lines:[line({unitPrice:'0.10'}),line({unitPrice:'0.20'})]}),ib=await draft(b,{lines:[line({unitPrice:'1.005'})]});assert.equal(ia.totalMinor,'30');assert.equal(ib.totalMinor,'1005');assert.equal(ib.currency,'KWD');assert.equal(ib.currencyScale,3);
  assert.equal((await a.request(a.path('/invoices'),'POST',{patientId:patients[0],requestKey:randomUUID(),currency:'USD',lines:[line()]})).status,400);
});
live('bad money, invalid quantities, oversized and unknown input fields are rejected',async()=>{
  const b=await new Browser().login();for(const lines of [[line({unitPrice:100})],[line({unitPrice:'1.001'})],[line({quantity:'0'})],[line({discount:'101'})],[line({taxBasisPoints:10001})],[line({serviceName:'س'.repeat(121)})],Array.from({length:51},()=>line())])assert.equal((await b.request(b.path('/invoices'),'POST',{patientId:patients[0],requestKey:randomUUID(),lines})).status,400);
  for(const extra of [{status:'PAID'},{clinicId:clinics[1]},{id:randomUUID()},{netPaidMinor:'100'},{number:'INV-111111'}])assert.equal((await b.request(b.path('/invoices'),'POST',{patientId:patients[0],requestKey:randomUUID(),lines:[line()],...extra})).status,400);
});
live('zero total drafts cannot issue, and inactive patients cannot receive new drafts',async()=>{
  const b=await new Browser().login(),i=await draft(b,{lines:[line({unitPrice:'0'})]});assert.equal((await b.request(b.path('/invoices/'+i.id+'/issue'),'POST',{expectedVersion:i.version,requestKey:randomUUID()})).status,409);
  await owner.patient.update({where:{id:patients[0]},data:{status:'INACTIVE'}});try{assert.equal((await b.request(b.path('/invoices'),'POST',{patientId:patients[0],requestKey:randomUUID(),lines:[line()]})).status,400);}finally{await owner.patient.update({where:{id:patients[0]},data:{status:'ACTIVE'}});}
});
live('partial, multiple-method and full payments calculate exact balances',async()=>{
  const b=await new Browser().login();let i=await issue(b,await draft(b));let r=await pay(b,i,'30.00');i=r.invoice;assert.equal(i.status,'PARTIALLY_PAID');assert.equal(i.balanceMinor,'7000');
  r=await json(await b.request(b.path('/invoices/'+i.id+'/payments'),'POST',{amount:'70.00',method:'BANK_TRANSFER',expectedVersion:i.version,requestKey:randomUUID()}),201);i=r.invoice;assert.equal(i.status,'PAID');assert.equal(i.balanceMinor,'0');const history=await json<{items:Payment[]}>(await b.request(b.path('/invoices/'+i.id+'/payments')));assert.equal(history.items.length,2);
});
live('simultaneous payments cannot overpay; stale and excess payment attempts preserve balance',async()=>{
  const b=await new Browser().login(),i=await issue(b,await draft(b)),responses=await Promise.all(Array.from({length:5},()=>b.request(b.path('/invoices/'+i.id+'/payments'),'POST',{amount:'70',method:'CASH',expectedVersion:i.version,requestKey:randomUUID()})));assert.equal(responses.filter(r=>r.status===201).length,1);assert.equal(responses.filter(r=>r.status===409).length,4);const fresh=await json<Bill>(await b.request(b.path('/invoices/'+i.id)));assert.equal(fresh.netPaidMinor,'7000');assert.equal((await b.request(b.path('/invoices/'+i.id+'/payments'),'POST',{amount:'30.01',method:'CASH',expectedVersion:fresh.version,requestKey:randomUUID()})).status,409);
});
live('concurrent payment retries return one durable payment; changed amount on a key is rejected',async()=>{
  const b=await new Browser().login(),i=await issue(b,await draft(b)),key=randomUUID(),rows=await Promise.all(Array.from({length:5},()=>pay(b,i,'20',key)));assert.equal(new Set(rows.map(r=>r.payment.id)).size,1);assert.equal(await owner.payment.count({where:{clinicId:clinics[0],invoiceId:i.id}}),1);
  assert.equal((await b.request(b.path('/invoices/'+i.id+'/payments'),'POST',{amount:'21',method:'CASH',expectedVersion:i.version,requestKey:key})).status,409);
});
live('controlled full reversal reopens balance; retries preserve immutable payment history',async()=>{
  const b=await new Browser().login(),paid=await pay(b,await issue(b,await draft(b)),'100'),body={amount:'100',kind:'REVERSAL',reason:'ADMIN_ERROR',expectedVersion:paid.invoice.version,requestKey:randomUUID()},path=b.path(`/invoices/${paid.invoice.id}/payments/${paid.payment.id}/reversals`);
  const first=await json<{invoice:Bill;payment:Payment}>(await b.request(path,'POST',body),201),second=await json<{invoice:Bill;payment:Payment}>(await b.request(path,'POST',body),201);assert.equal(first.invoice.status,'ISSUED');assert.equal(first.invoice.netPaidMinor,'0');assert.equal(first.payment.reversals[0].id,second.payment.reversals[0].id);assert(await owner.payment.findUnique({where:{id:paid.payment.id}}));
});
live('partial refunds cannot exceed original payment; a partially refunded payment cannot be reversed',async()=>{
  const b=await new Browser().login(),paid=await pay(b,await issue(b,await draft(b)),'100'),path=b.path(`/invoices/${paid.invoice.id}/payments/${paid.payment.id}/reversals`);
  const one=await json<{invoice:Bill;payment:Payment}>(await b.request(path,'POST',{amount:'40',kind:'REFUND',reason:'PATIENT_REFUND',expectedVersion:paid.invoice.version,requestKey:randomUUID()}),201);assert.equal(one.invoice.status,'PARTIALLY_PAID');assert.equal(one.payment.refundableMinor,'6000');
  for(const [amount,kind] of [['61','REFUND'],['60','REVERSAL']])assert.equal((await b.request(path,'POST',{amount,kind,reason:'OTHER',expectedVersion:one.invoice.version,requestKey:randomUUID()})).status,409);
});
live('void requires issued invoice with no payment history, and keeps immutable numbered record',async()=>{
  const b=await new Browser().login(),i=await issue(b,await draft(b)),body={expectedVersion:i.version,requestKey:randomUUID(),reason:'DUPLICATE'},path=b.path('/invoices/'+i.id+'/void'),v=await json<Bill>(await b.request(path,'POST',body),201);assert.equal(v.status,'VOID');assert.equal(v.number,i.number);assert.equal(v.balanceMinor,'0');assert.equal((await json<Bill>(await b.request(path,'POST',body),201)).id,i.id);
  const paid=await pay(b,await issue(b,await draft(b)),'1');assert.equal((await b.request(b.path('/invoices/'+paid.invoice.id+'/void'),'POST',{...body,requestKey:randomUUID(),expectedVersion:paid.invoice.version})).status,409);
});
live('audit chain is hash-valid and append-only under actual runtime credentials',async()=>{
  const b=await new Browser().login(),i=await issue(b,await draft(b));await pay(b,i,'1');const rows=await owner.financialAuditEvent.findMany({where:{clinicId:clinics[0]},orderBy:{sequence:'asc'}});let prev='0'.repeat(64);for(const [index,e] of rows.entries()){assert.equal(e.sequence,index+1);assert.equal(e.previousHash,prev);assert.equal(e.eventHash,createHash('sha256').update(prev+'\n'+e.payload).digest('hex'));prev=e.eventHash;}
  for(const sql of ['UPDATE public."FinancialAuditEvent" SET payload=\'{}\'','DELETE FROM public."FinancialAuditEvent"','UPDATE public."Payment" SET "amountMinor"=1','DELETE FROM public."PaymentReversal"'])await b.context(async c=>{await assert.rejects(c.query(sql),(e:{code:string})=>e.code==='42501');});
});
live('clinic billing identity and branding are frozen at issuance, independent of later settings',async()=>{
  const b=await new Browser().login();await json(await b.request(b.path('/profile'),'PATCH',{expectedVersion:1,address:'عنوان عيادة وهمي',taxIdentifier:'TEST-ONLY'}));const i=await issue(b,await draft(b));assert.equal(i.issuer?.address,'عنوان عيادة وهمي');assert.equal(i.issuer?.primaryColor,'#7854D9');
  await json(await b.request(b.path('/profile'),'PATCH',{expectedVersion:1,address:'عنوان لاحق وهمي'}));await owner.clinicBranding.update({where:{clinicId:clinics[0]},data:{primaryColor:'#123456'}});
  const saved=await json<Bill>(await b.request(b.path('/invoices/'+i.id)));assert.equal(saved.issuer?.address,'عنوان عيادة وهمي');assert.equal(saved.issuer?.primaryColor,'#7854D9');
});
live('reception can draft, issue and record payments but cannot refund, void, audit or read summaries',async()=>{
  const b=await new Browser().login(2),paid=await pay(b,await issue(b,await draft(b)),'1');
  for(const path of ['/summary','/invoices/'+paid.invoice.id+'/audit'])assert.equal((await b.request(b.path(path))).status,403);
  for(const [path,body] of [['/invoices/'+paid.invoice.id+'/void',{expectedVersion:paid.invoice.version,requestKey:randomUUID(),reason:'OTHER'}],['/invoices/'+paid.invoice.id+'/payments/'+paid.payment.id+'/reversals',{expectedVersion:paid.invoice.version,requestKey:randomUUID(),amount:'1',kind:'REFUND',reason:'OTHER'}],['/profile',{expectedVersion:1,address:'غير مسموح'}]] as const)assert.equal((await b.request(b.path(path),path==='/profile'?'PATCH':'POST',body)).status,403);
});
live('accountant uses minimal billing identity lookups without clinical patient, appointment or queue access',async()=>{
  const b=await new Browser().login(1);assert.equal((await b.request(b.path('/patients'))).status,200);assert.equal((await b.request(b.path('/visits')+'?patientId='+patients[0])).status,200);const i=await issue(b,await draft(b));assert.equal((await b.request(b.path('/invoices/'+i.id))).status,200);
  for(const path of ['/patients','/appointments','/queue'])assert.equal((await b.request(`clinics/${clinics[0]}${path}`)).status,403);
  const lookup=await json<{items:Record<string,unknown>[]}>(await b.request(b.path('/patients')));assert.deepEqual(Object.keys(lookup.items[0]).sort(),['fullName','id','patientNumber']);
});
live('doctors, clinic admins, unauthenticated and forged role requests have no finance access',async()=>{
  for(const role of [3,4]){const b=await new Browser().login(role);for(const path of ['/invoices','/profile','/summary','/patients'])assert.equal((await b.request(b.path(path),'GET',undefined,{'X-Role':'CLINIC_OWNER'})).status,403);}
  assert.equal((await new Browser().request(`clinics/${clinics[0]}/billing/invoices`)).status,401);
});
live('all financial mutations enforce CSRF and reject patient/clinic reassignment',async()=>{
  const b=await new Browser().login(),d=await draft(b),i=await issue(b,await draft(b)),paid=await pay(b,i,'1');
  const routes=[['/invoices','POST',{patientId:patients[0],requestKey:randomUUID(),lines:[line()]}],['/invoices/'+d.id,'PATCH',{expectedVersion:d.version,lines:[line()]}],['/invoices/'+d.id+'/issue','POST',{expectedVersion:d.version,requestKey:randomUUID()}],['/invoices/'+paid.invoice.id+'/payments','POST',{expectedVersion:paid.invoice.version,requestKey:randomUUID(),amount:'1',method:'CASH'}],['/invoices/'+paid.invoice.id+'/payments/'+paid.payment.id+'/reversals','POST',{expectedVersion:paid.invoice.version,requestKey:randomUUID(),amount:'1',kind:'REFUND',reason:'OTHER'}],['/invoices/'+i.id+'/void','POST',{expectedVersion:i.version,requestKey:randomUUID(),reason:'OTHER'}],['/profile','PATCH',{expectedVersion:1,address:'اختبار'}]] as const;
  for(const [path,method,body] of routes)assert.equal((await b.request(b.path(path),method,body,{'X-CSRF-Token':'forged'})).status,403);
  assert.equal((await b.request(b.path('/invoices/'+d.id),'PATCH',{expectedVersion:d.version,lines:[line()],clinicId:clinics[1]})).status,400);
});
live('foreign invoice and payment IDs return indistinguishable safe not-found responses',async()=>{
  const a=await new Browser().login(),b=await new Browser().login(0,1),i=await issue(b,await draft(b)),errors=[];
  for(const id of [i.id,randomUUID()]){const r=await a.request(a.path('/invoices/'+id));assert.equal(r.status,404);errors.push(await r.json());}assert.deepEqual(errors[0],errors[1]);
  const mine=await issue(a,await draft(a));assert.equal((await a.request(a.path('/invoices/'+mine.id+'/payments/'+randomUUID()+'/reversals'),'POST',{amount:'1',kind:'REFUND',reason:'OTHER',requestKey:randomUUID(),expectedVersion:mine.version})).status,404);
  assert.equal((await a.request(`clinics/${clinics[1]}/billing/invoices`)).status,403);
});
live('runtime RLS protects all seven finance tables; missing or invalid context denies reads and writes',async()=>{
  const tables=['Invoice','InvoiceLine','Payment','PaymentReversal','FinancialAuditEvent','ClinicInvoiceCounter','ClinicBillingProfile'];const rows=(await pool.query('SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname=ANY($1)',[tables])).rows;assert.equal(rows.length,7);assert(rows.every(r=>r.relrowsecurity&&r.relforcerowsecurity));
  for(const table of tables){assert.equal((await pool.query(`SELECT * FROM public."${table}"`)).rowCount,0);await assert.rejects(pool.query(`ALTER TABLE public."${table}" DISABLE ROW LEVEL SECURITY`),(e:{code:string})=>e.code==='42501');}
  for(const value of ['', 'invalid',clinics[1]]){const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('lamssa.clinic_id',$1,true)",[value]);assert.equal((await c.query('SELECT * FROM public."Invoice"')).rowCount,0);await assert.rejects(c.query('INSERT INTO public."ClinicInvoiceCounter" ("clinicId") VALUES ($1)',[randomUUID()]),(e:{code:string})=>e.code==='42501');}finally{await c.query('ROLLBACK');c.release();}}
});
live('actual runtime finance RLS includes role restrictions and isolates concurrent clinic contexts',async()=>{
  const a=await new Browser().login(),b=await new Browser().login(0,1),doctor=await new Browser().login(3),admin=await new Browser().login(4);await draft(a);await draft(b);
  for(const denied of [doctor,admin])await denied.context(async c=>{for(const table of ['Invoice','Payment','FinancialAuditEvent'])assert.equal((await c.query(`SELECT * FROM public."${table}"`)).rowCount,0);});
  await Promise.all(Array.from({length:8},(_,i)=>(i%2?a:b).context(async c=>{const rows=(await c.query('SELECT "clinicId" FROM public."Invoice"')).rows;assert(rows.length);assert(rows.every(r=>r.clinicId===clinics[i%2?0:1]));})));assert.equal((await pool.query('SELECT * FROM public."Invoice"')).rowCount,0);
});
live('same-clinic composite FK and immutable ownership are enforced under actual runtime credentials',async()=>{
  const b=await new Browser().login(),i=await draft(b);await b.context(async c=>{await assert.rejects(c.query('UPDATE public."Invoice" SET "clinicId"=$1,version=version+1 WHERE id=$2',[clinics[1],i.id]),(e:{code:string})=>e.code==='42501');});
  await b.context(async c=>{await assert.rejects(c.query('INSERT INTO public."InvoiceLine" (id,"clinicId","invoiceId",position,"serviceName","quantityMilli","unitPriceMinor","grossMinor","discountMinor","taxBasisPoints","taxMinor","totalMinor") VALUES ($1,$2,$3,1,\'اختبار\',1000,100,100,0,0,0,100)',[randomUUID(),clinics[0],(await draft(await new Browser().login(0,1))).id]),(e:{code:string})=>e.code==='23503');});
});
live('database totals prevent unaudited or overpaid ledger changes independently of API validation',async()=>{
  const b=await new Browser().login(),i=await issue(b,await draft(b));await b.context(async c=>{await c.query('INSERT INTO public."Payment" (id,"clinicId","invoiceId","amountMinor",currency,"currencyScale",method,"requestKey","requestHash") VALUES ($1,$2,$3,20000,\'YER\',2,\'CASH\',$4,$5)',[randomUUID(),clinics[0],i.id,randomUUID(),'b'.repeat(64)]);await assert.rejects(c.query('SET CONSTRAINTS ALL IMMEDIATE'),(e:{code:string})=>e.code==='23514');});
});
live('summary excludes drafts/voids, separates currencies, and exactly reconciles receipts less refunds',async()=>{
  const a=await new Browser().login(),b=await new Browser().login(0,1);await pay(b,await issue(b,await draft(b)),'10.005');for(const browser of [a,b]){const summary=await json<{items:{currency:string;collectedMinor:string;receivedMinor:string;refundedMinor:string;invoicedMinor:string;outstandingMinor:string}[]}>(await browser.request(browser.path('/summary')));for(const r of summary.items){assert.equal(BigInt(r.collectedMinor),BigInt(r.receivedMinor)-BigInt(r.refundedMinor));assert.equal(BigInt(r.outstandingMinor),BigInt(r.invoicedMinor)-BigInt(r.collectedMinor));assert.equal(r.currency,browser.clinic?'KWD':'YER');}}
});
live('listing, payment history and audit are bounded and deterministically paginated',async()=>{
  const b=await new Browser().login(),one=await json<{items:Bill[];hasMore:boolean;nextCursor:string}>(await b.request(b.path('/invoices')+'?pageSize=2'));assert.equal(one.items.length,2);assert(one.hasMore);const next=await json<{items:Bill[]}>(await b.request(b.path('/invoices')+'?pageSize=2&cursor='+one.nextCursor));assert(!next.items.some(r=>one.items.some(i=>i.id===r.id)));assert.equal((await b.request(b.path('/invoices')+'?pageSize=51')).status,400);
});
live('concurrent refunds cannot return more than the recorded payment',async()=>{
  const b=await new Browser().login(),paid=await pay(b,await issue(b,await draft(b)),'100'),path=b.path(`/invoices/${paid.invoice.id}/payments/${paid.payment.id}/reversals`);
  const rows=await Promise.all(Array.from({length:5},()=>b.request(path,'POST',{amount:'70',kind:'REFUND',reason:'PATIENT_REFUND',expectedVersion:paid.invoice.version,requestKey:randomUUID()})));
  assert.equal(rows.filter(r=>r.status===201).length,1);assert.equal(rows.filter(r=>r.status===409).length,4);
  assert.equal((await owner.paymentReversal.aggregate({where:{clinicId:clinics[0],paymentId:paid.payment.id},_sum:{amountMinor:true}}))._sum.amountMinor,7000n);
});
live('suspended clinic, membership and user cannot access finance even through previous sessions',async()=>{
  for(const target of ['clinic','membership','user']){
    const b=await new Browser().login();
    if(target==='clinic')await owner.clinic.update({where:{id:clinics[0]},data:{status:'SUSPENDED'}});
    if(target==='membership')await owner.clinicMembership.update({where:{clinicId_userId:{clinicId:clinics[0],userId:users[0]}},data:{status:'SUSPENDED'}});
    if(target==='user')await owner.user.update({where:{id:users[0]},data:{status:'SUSPENDED'}});
    try{await b.context(async c=>{assert.equal((await c.query('SELECT * FROM public."Invoice"')).rowCount,0);});assert([401,403,404].includes((await b.request(b.path('/invoices'))).status));}
    finally{await owner.clinic.update({where:{id:clinics[0]},data:{status:'ACTIVE'}});await owner.clinicMembership.update({where:{clinicId_userId:{clinicId:clinics[0],userId:users[0]}},data:{status:'ACTIVE'}});await owner.user.update({where:{id:users[0]},data:{status:'ACTIVE'}});}
  }
});
live('runtime cannot rewind counters or append a forged audit hash',async()=>{
  const b=await new Browser().login(),i=await draft(b),membership=await owner.clinicMembership.findUniqueOrThrow({where:{clinicId_userId:{clinicId:clinics[0],userId:users[0]}}});
  await b.context(async c=>{await assert.rejects(c.query('UPDATE public."ClinicInvoiceCounter" SET "lastNumber"=0,revision=revision+1 WHERE "clinicId"=$1',[clinics[0]]),(e:{code:string})=>e.code==='23514');});
  await b.context(async c=>{await assert.rejects(c.query('INSERT INTO public."FinancialAuditEvent" (id,"clinicId","invoiceId","actorMembershipId",sequence,action,payload,"previousHash","eventHash","createdAt") VALUES ($1,$2,$3,$4,1,\'DRAFT_CREATED\',\'{}\',$5,$5,now())',[randomUUID(),clinics[0],i.id,membership.id,'0'.repeat(64)]),(e:{code:string})=>e.code==='23514');});
});
live('reception cannot void through raw runtime SQL despite ordinary balance-update privileges',async()=>{
  const b=await new Browser().login(2),i=await issue(b,await draft(b));
  await b.context(async c=>{await assert.rejects(c.query('UPDATE public."Invoice" SET status=\'VOID\',"voidedAt"=now(),"voidReason"=\'OTHER\',"voidKey"=$1,"voidHash"=$2,version=version+1 WHERE id=$3',[randomUUID(),'c'.repeat(64),i.id]),(e:{code:string})=>e.code==='42501');});
});
live('audit INSERT cannot attribute an action to another membership under real runtime credentials',async()=>{
  const b=await new Browser().login(),i=await draft(b),actor=await owner.clinicMembership.findUniqueOrThrow({where:{clinicId_userId:{clinicId:clinics[0],userId:users[1]}}}),prev=await owner.financialAuditEvent.findFirstOrThrow({where:{clinicId:clinics[0]},orderBy:{sequence:'desc'}}),at=new Date(),id=randomUUID(),sequence=prev.sequence+1;
  const payload=canonical({id,clinicId:clinics[0],invoiceId:i.id,actorMembershipId:actor.id,sequence,action:'DRAFT_EDITED',at:at.toISOString(),invoiceVersion:i.version,details:{}}),hash=createHash('sha256').update(prev.eventHash+'\n'+payload).digest('hex');
  await b.context(async c=>{await assert.rejects(c.query('INSERT INTO public."FinancialAuditEvent" (id,"clinicId","invoiceId","actorMembershipId",sequence,action,payload,"previousHash","eventHash","createdAt") VALUES ($1,$2,$3,$4,$5,\'DRAFT_EDITED\',$6,$7,$8,$9)',[id,clinics[0],i.id,actor.id,sequence,payload,prev.eventHash,hash,at]),(e:{code:string})=>e.code==='42501');});
});
