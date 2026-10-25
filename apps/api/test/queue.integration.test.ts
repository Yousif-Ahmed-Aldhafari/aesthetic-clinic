import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { before, after, afterEach, test } from 'node:test';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Temporal } from '@js-temporal/polyfill';
import pg, { type PoolClient } from 'pg';
import { fixtureDatabase, testUrls } from './database-fixtures.js';
import { configureApp } from '../src/configure-app.js';
import { provisionUser } from '../scripts/provision-user.js';
import { digest } from '../src/auth/crypto.js';
import { loginBucketKey } from '../src/auth/login-limiter.service.js';
const enabled=Boolean(process.env.TEST_DATABASE_URL),live=(name:string,fn:()=>Promise<void>)=>test(`queue: ${name}`,{skip:!enabled},fn);
const suffix=randomUUID(),clinics=[randomUUID(),randomUUID()],users:string[]=[],accounts=['owner','doctor','reception','accountant'].map(n=>`${n}-queue-${suffix}@example.invalid`),password=randomBytes(32).toString('base64url'),origin='http://localhost:5173';
let owner:ReturnType<typeof fixtureDatabase>,app:INestApplication,pool:pg.Pool,base:string,day=2;
const services:string[][]=[[],[]],resources:string[][]=[[],[]],patients:string[]=[],members:string[][]=[[],[]];
const date=()=>Temporal.Now.plainDateISO('Asia/Aden').add({days:day++}).toString();
type Booking={id:string;version:number;status:string;startAt:string;endAt:string;startLocal:string;endLocal:string;timezone:string;patient:{id:string;fullName:string};doctor:{id:string};room:{id:string}|null};
class Browser {
  cookies=new Map<string,string>();csrf='';
  path(suffix='',clinic=0){return `clinics/${clinics[clinic]}${suffix}`;}
  async request(path:string,method='GET',body?:unknown,headers:Record<string,string>={}){const r=await fetch(`${base}/api/v1/${path}`,{method,headers:{Cookie:[...this.cookies].map(([k,v])=>`${k}=${v}`).join('; '),...(method==='GET'?{}:{Origin:origin,'Content-Type':'application/json','X-CSRF-Token':this.csrf}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});for(const cookie of r.headers.getSetCookie()){const [p]=cookie.split(';'),i=p.indexOf('=');this.cookies.set(p.slice(0,i),p.slice(i+1));}return r;}
  async login(index=0,clinic=0){this.csrf=(await (await this.request('auth/csrf')).json() as {csrfToken:string}).csrfToken;const r=await this.request('auth/login','POST',{email:accounts[index],password});assert.equal(r.status,200);this.csrf=(await r.json() as {csrfToken:string}).csrfToken;await this.select(clinic);return this;}
  async select(i:number){const r=await this.request('auth/clinic','POST',{clinicId:clinics[i]});assert.equal(r.status,200);this.csrf=(await r.json() as {csrfToken:string}).csrfToken;}
  async book(body:unknown,clinic=0){const r=await this.request(this.path('/appointments',clinic),'POST',body);assert.equal(r.status,201,JSON.stringify(await r.clone().json()));return await r.json() as Booking;}
  async status(p:Booking,status:string){const r=await this.request(this.path(`/appointments/${p.id}/status`),'PATCH',{status,expectedVersion:p.version});assert.equal(r.status,200,JSON.stringify(await r.clone().json()));return await r.json() as Booking;}
  async beginService(p:Booking){const call=await this.request(this.path('/queue/call-next'),'POST',{doctorResourceId:p.doctor.id,requestKey:randomUUID()});assert.equal(call.status,201);const {ticket}=await call.json() as {ticket:{id:string;version:number}};const start=await this.request(this.path('/queue/tickets/'+ticket.id),'PATCH',{action:'START',expectedVersion:ticket.version});assert.equal(start.status,200);}
  async context(work:(c:PoolClient)=>Promise<void>,index=0){const session=await owner.session.findUniqueOrThrow({where:{tokenHash:digest(this.cookies.get('lamssa_session')!)}});const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('lamssa.clinic_id',$1,true),set_config('lamssa.user_id',$2,true),set_config('lamssa.session_id',$3,true)",[clinics[index],session.userId,session.id]);await work(c);}finally{await c.query('ROLLBACK');c.release();}}
}
function input(local=`${date()}T09:00`,clinic=0){return {patientId:patients[clinic],serviceId:services[clinic][0],doctorResourceId:resources[clinic][0],roomResourceId:null as string|null,startLocal:local,durationMinutes:30,bookingKey:randomUUID()};}
before(async()=>{
  if(!enabled)return;const urls=testUrls();process.env.DATABASE_URL=urls.runtime;process.env.NODE_ENV='test';process.env.AUTH_CSRF_SECRET=randomBytes(48).toString('base64url');process.env.CORS_ORIGINS=origin;process.env.AUTH_LOGIN_ACCOUNT_LIMIT='100';process.env.AUTH_LOGIN_IP_LIMIT='10000';
  const {AppModule}=await import('../src/app.module.js');const mod=await Test.createTestingModule({imports:[AppModule]}).compile();app=mod.createNestApplication({logger:false});configureApp(app);await app.listen(0,'127.0.0.1');base=await app.getUrl();owner=fixtureDatabase();pool=new pg.Pool({connectionString:urls.runtime,options:'-c timezone=UTC',max:4});
  for(const [i,id]of clinics.entries()){await owner.clinic.create({data:{id,slug:`queue-${i}-${suffix}`,legalName:'عيادة جدولة وهمية',displayName:`عيادة جدولة ${i}`,currency:'YER',timezone:'Asia/Aden',branding:{create:{primaryColor:i?'#087F8C':'#7854D9'}}}});const p=await owner.patient.create({data:{clinicId:id,patientNumber:'P-000001',fullName:'مريض جدولة وهمي',searchName:'مريض جدولة وهمي'}});patients.push(p.id);await owner.patientCounter.create({data:{clinicId:id,lastNumber:1}});
    for(const roomRequired of [false,true])services[i].push((await owner.clinicService.create({data:{clinicId:id,name:roomRequired?'خدمة إدارية بغرفة':'خدمة إدارية وهمية',durationMinutes:30,requiresRoom:roomRequired}})).id);
  }
  for(const [i,email]of accounts.entries()){const u=await provisionUser(owner,{email,name:`مستخدم جدولة وهمي ${i}`,password,memberships:[{clinicSlug:`queue-0-${suffix}`,role:(['CLINIC_OWNER','DOCTOR','RECEPTIONIST','ACCOUNTANT'] as const)[i]}]});users.push(u.id);if(i===0)await owner.clinicMembership.create({data:{clinicId:clinics[1],userId:u.id,role:'CLINIC_OWNER',status:'ACTIVE'}});}
  for(const [i,clinicId]of clinics.entries()){
    for(let j=0;j<2;j++){let membershipId:string;if(i===0&&j===0)membershipId=(await owner.clinicMembership.findUniqueOrThrow({where:{clinicId_userId:{clinicId,userId:users[1]}}})).id;else{const u=await owner.user.create({data:{name:`طبيب وهمي ${i}-${j}`,email:`resource-${i}-${j}-${suffix}@example.invalid`,status:'ACTIVE',memberships:{create:{clinicId,role:'DOCTOR',status:'ACTIVE'}}},include:{memberships:true}});users.push(u.id);membershipId=u.memberships[0].id;}members[i].push(membershipId);resources[i].push((await owner.bookableResource.create({data:{clinicId,kind:'DOCTOR',label:`طبيب وهمي ${j+1}`,doctorMembershipId:membershipId}})).id);}
    for(let j=0;j<2;j++)resources[i].push((await owner.bookableResource.create({data:{clinicId,kind:'ROOM',label:`غرفة وهمية ${j+1}`}})).id);
    for(const [j,resourceId]of resources[i].entries())for(let weekday=1;weekday<=7;weekday++)for(const [startMinute,endMinute]of (j===0?[[540,720],[780,1080]]:j===1?[[600,960]]:[[480,1200]]))await owner.resourceAvailability.create({data:{clinicId,resourceId,weekday,startMinute,endMinute}});
  }
});
after(async()=>{if(owner){for(const table of [owner.queueCommand,owner.queueTicket,owner.visit,owner.queueCounter,owner.queueConfiguration] as const)await (table.deleteMany as (args:object)=>Promise<unknown>)({where:{clinicId:{in:clinics}}});await owner.appointment.deleteMany({where:{clinicId:{in:clinics}}});await owner.resourceTimeOff.deleteMany({where:{clinicId:{in:clinics}}});await owner.resourceAvailability.deleteMany({where:{clinicId:{in:clinics}}});await owner.bookableResource.deleteMany({where:{clinicId:{in:clinics}}});await owner.clinicService.deleteMany({where:{clinicId:{in:clinics}}});await owner.schedulingState.deleteMany({where:{clinicId:{in:clinics}}});await owner.patient.deleteMany({where:{clinicId:{in:clinics}}});await owner.patientCounter.deleteMany({where:{clinicId:{in:clinics}}});await owner.session.deleteMany({where:{userId:{in:users}}});await owner.clinicMembership.deleteMany({where:{userId:{in:users}}});await owner.user.deleteMany({where:{id:{in:users}}});await owner.clinicBranding.deleteMany({where:{clinicId:{in:clinics}}});await owner.clinic.deleteMany({where:{id:{in:clinics}}});const w=Math.floor(Date.now()/900000);await owner.loginBucket.deleteMany({where:{key:{in:[w,w-1].flatMap(window=>accounts.map(email=>loginBucketKey('account',email,window)))}}});await owner.$disconnect();}if(pool)await pool.end();if(app)await app.close();});

afterEach(async()=>{if(!owner)return;for(const table of [owner.queueCommand,owner.queueTicket,owner.visit,owner.queueCounter,owner.queueConfiguration,owner.appointment] as const)await (table.deleteMany as (args:object)=>Promise<unknown>)({where:{clinicId:{in:clinics}}});});
type Ticket={id:string;version:number;status:string;ticketNumber:string;businessDate:string;doctor:{id:string};room:{id:string}|null;visit:{id:string;status:string};patient:{id:string;fullName:string}};
let patientSequence=1;
async function newPatient(clinic=0){return (await owner.patient.create({data:{clinicId:clinics[clinic],patientNumber:`P-${String(++patientSequence).padStart(6,'0')}`,fullName:'مراجع انتظار وهمي',searchName:'مراجع انتظار وهمي'}})).id;}
async function walk(b:Browser,doctor=0,room:number|null=null,clinic=0){const body={patientId:await newPatient(clinic),doctorResourceId:resources[clinic][doctor],roomResourceId:room===null?null:resources[clinic][room],requestKey:randomUUID()};const r=await b.request(b.path('/queue/walk-ins',clinic),'POST',body);assert.equal(r.status,201,JSON.stringify(await r.clone().json()));return {ticket:await r.json() as Ticket,body};}
async function call(b:Browser,doctor=0,clinic=0,key=randomUUID()){const r=await b.request(b.path('/queue/call-next',clinic),'POST',{doctorResourceId:resources[clinic][doctor],requestKey:key});assert.equal(r.status,201,JSON.stringify(await r.clone().json()));return (await r.json() as {ticket:Ticket|null}).ticket;}
async function action(b:Browser,t:Ticket,kind:string,expected=200){const r=await b.request(b.path('/queue/tickets/'+t.id),'PATCH',{action:kind,expectedVersion:t.version});assert.equal(r.status,expected,JSON.stringify(await r.clone().json()));return await r.json() as Ticket;}

live('appointment ARRIVED and explicit check-in retries atomically create exactly one visit and ticket',async()=>{
  const b=await new Browser().login(),p=await b.book(input());const replies=await Promise.all(Array.from({length:5},()=>b.request(b.path(`/appointments/${p.id}/status`),'PATCH',{status:'ARRIVED',expectedVersion:p.version})));
  assert(replies.every(r=>r.status===200));assert.equal(await owner.visit.count({where:{clinicId:clinics[0],appointmentId:p.id}}),1);assert.equal(await owner.queueTicket.count({where:{clinicId:clinics[0]}}),1);
  const r=await b.request(b.path('/queue/check-in'),'POST',{appointmentId:p.id,expectedVersion:p.version});assert.equal(r.status,201);assert.equal((await r.json() as Ticket).ticketNumber,'Q-0001');
});
live('check-in failure rolls back appointment status, counter, visit and ticket',async()=>{
  const b=await new Browser().login(),p=await b.book(input());await owner.patient.update({where:{id:patients[0]},data:{status:'INACTIVE'}});
  try{assert.equal((await b.request(b.path('/queue/check-in'),'POST',{appointmentId:p.id,expectedVersion:p.version})).status,400);assert.equal((await owner.appointment.findUniqueOrThrow({where:{id:p.id}})).status,'SCHEDULED');assert.equal(await owner.visit.count({where:{clinicId:clinics[0]}}),0);assert.equal(await owner.queueCounter.count({where:{clinicId:clinics[0]}}),0);}finally{await owner.patient.update({where:{id:patients[0]},data:{status:'ACTIVE'}});}
});
live('fictional legacy ARRIVED reconciliation is explicit, idempotent and does not bulk import anything',async()=>{
  const b=await new Browser().login(),p=await b.book(input());await b.status(p,'ARRIVED');
  // Remove only this test's newly created children to reproduce a pre-migration
  // ARRIVED record, without disabling any constraint, policy or trigger.
  await owner.queueTicket.deleteMany({where:{clinicId:clinics[0]}});await owner.visit.deleteMany({where:{clinicId:clinics[0]}});
  const arrived=await owner.appointment.findUniqueOrThrow({where:{id:p.id}});const body={appointmentId:p.id,expectedVersion:arrived.version};
  assert.equal((await b.request(b.path('/queue/check-in'),'POST',body)).status,409);
  const a=await b.request(b.path('/queue/reconcile'),'POST',body),z=await b.request(b.path('/queue/reconcile'),'POST',body);assert.equal(a.status,201);assert.equal(z.status,201);assert.equal((await a.json() as Ticket).id,(await z.json() as Ticket).id);
});
live('walk-in retries replay the same ticket and changed payload with the same key conflicts',async()=>{
  const b=await new Browser().login(2),{ticket:t,body}=await walk(b);const r=await b.request(b.path('/queue/walk-ins'),'POST',body);assert.equal(r.status,201);assert.equal((await r.json() as Ticket).id,t.id);
  assert.equal((await b.request(b.path('/queue/walk-ins'),'POST',{...body,doctorResourceId:resources[0][1]})).status,409);
  assert.equal((await b.request(b.path('/queue/walk-ins'),'POST',{...body,requestKey:randomUUID()})).status,409);
});
live('concurrent registrations allocate distinct consecutive clinic/day numbers',async()=>{
  const b=await new Browser().login(),rows=await Promise.all(Array.from({length:8},()=>walk(b)));assert.equal(new Set(rows.map(r=>r.ticket.ticketNumber)).size,8);assert.deepEqual(rows.map(r=>r.ticket.ticketNumber).sort(),Array.from({length:8},(_,i)=>`Q-${String(i+1).padStart(4,'0')}`));
});
live('numbering uses clinic timezone at UTC day boundaries and stays fixed after transfer',async()=>{
  const b=await new Browser().login();await owner.clinic.update({where:{id:clinics[0]},data:{timezone:'Pacific/Kiritimati'}});
  try{const {ticket:t}=await walk(b);assert.equal(t.businessDate,Temporal.Now.plainDateISO('Pacific/Kiritimati').toString());const transfer=await b.request(b.path('/queue/tickets/'+t.id+'/transfer'),'PATCH',{doctorResourceId:resources[0][1],roomResourceId:resources[0][2],expectedVersion:t.version});assert.equal(transfer.status,200);const moved=await transfer.json() as Ticket;assert.equal(moved.ticketNumber,t.ticketNumber);assert.equal(moved.businessDate,t.businessDate);}finally{await owner.clinic.update({where:{id:clinics[0]},data:{timezone:'Asia/Aden'}});}
});
live('simultaneous call-next requests claim only one patient for a doctor',async()=>{
  const b=await new Browser().login();await walk(b);await walk(b);const rows=await Promise.all(Array.from({length:6},()=>b.request(b.path('/queue/call-next'),'POST',{doctorResourceId:resources[0][0],requestKey:randomUUID()})));assert.equal(rows.filter(r=>r.status===201).length,1);assert.equal(rows.filter(r=>r.status===409).length,5);assert.equal(await owner.queueTicket.count({where:{clinicId:clinics[0],status:'CALLED'}}),1);
});
live('call-next request replay never calls a second patient, even after completion',async()=>{
  const b=await new Browser().login(),emptyKey=randomUUID();assert.equal(await call(b,0,0,emptyKey),null);await walk(b);assert.equal(await call(b,0,0,emptyKey),null);await walk(b);const key=randomUUID();let t=(await call(b,0,0,key))!;t=await action(b,t,'START');t=await action(b,t,'COMPLETE');const replay=(await call(b,0,0,key))!;assert.equal(replay.id,t.id);assert.equal(replay.status,'COMPLETED');assert.equal(await owner.queueTicket.count({where:{clinicId:clinics[0],status:'WAITING'}}),1);
});
live('previous-day waiting records remain first and midnight cannot bypass an existing resource claim',async()=>{
  const b=await new Browser().login(),patientId=await newPatient(),yesterday=Temporal.Now.plainDateISO('Asia/Aden').subtract({days:1}).toString();
  const old=await owner.$transaction(async tx=>{const v=await tx.visit.create({data:{clinicId:clinics[0],patientId,source:'WALK_IN',checkInKey:randomUUID(),requestHash:'d'.repeat(64),checkedInAt:new Date(yesterday+'T08:00:00Z')}});return tx.queueTicket.create({data:{clinicId:clinics[0],visitId:v.id,businessDate:new Date(yesterday+'T00:00:00Z'),number:1,queuedAt:new Date(yesterday+'T08:00:00Z'),doctorResourceId:resources[0][0]}});});
  await walk(b);const list=await (await b.request(b.path('/queue'))).json() as {items:Ticket[]};assert.equal(list.items[0].id,old.id);let called=(await call(b))!;assert.equal(called.id,old.id);assert.equal((await b.request(b.path('/queue/call-next'),'POST',{doctorResourceId:resources[0][0],requestKey:randomUUID()})).status,409);called=await action(b,called,'START');await action(b,called,'COMPLETE');assert(await call(b));
});
live('parallel doctor queues can call independently; one shared room cannot be claimed twice',async()=>{
  const b=await new Browser().login();await walk(b,0,2);await walk(b,1,2);await call(b);assert.equal((await b.request(b.path('/queue/call-next'),'POST',{doctorResourceId:resources[0][1],requestKey:randomUUID()})).status,409);
  const waiting=await owner.queueTicket.findFirstOrThrow({where:{clinicId:clinics[0],status:'WAITING'}});assert.equal((await b.request(b.path('/queue/tickets/'+waiting.id+'/transfer'),'PATCH',{doctorResourceId:resources[0][1],roomResourceId:resources[0][3],expectedVersion:waiting.version})).status,200);assert(await call(b,1));assert.equal(await owner.queueTicket.count({where:{clinicId:clinics[0],status:'CALLED'}}),2);
});
live('strict FIFO, recall, start and completion preserve administrative history',async()=>{
  const b=await new Browser().login(),{ticket:first}=await walk(b);await walk(b);let t=(await call(b))!;assert.equal(t.id,first.id);t=await action(b,t,'RECALL');assert.equal(t.status,'CALLED');t=await action(b,t,'START');assert.equal(t.visit.status,'IN_SERVICE');t=await action(b,t,'COMPLETE');assert.equal(t.visit.status,'COMPLETED');assert.equal((await b.request(b.path('/queue')+'?scope=DAY')).status,200);await action(b,t,'START',409);assert(await call(b));
});
live('invalid transitions and stale versions do not change queue state',async()=>{
  const b=await new Browser().login();let {ticket:t}=await walk(b);for(const a of ['START','COMPLETE','ABSENT','RECALL'])await action(b,t,a,409);const old=t;t=(await call(b))!;await action(b,old,'START',409);await action(b,t,'COMPLETE',409);assert.equal((await owner.queueTicket.findUniqueOrThrow({where:{id:t.id}})).status,'CALLED');
});
live('absence/cancellation synchronize appointment and visit without hard deletion',async()=>{
  const b=await new Browser().login();for(const kind of ['ABSENT','CANCEL']){const p=await b.book({...input(),patientId:await newPatient()});await b.status(p,'ARRIVED');let t=(await call(b))!;t=await action(b,t,kind);assert.equal(t.visit.status,kind==='ABSENT'?'NO_SHOW':'CANCELLED');assert.equal((await owner.appointment.findUniqueOrThrow({where:{id:p.id}})).status,t.visit.status);assert(await owner.visit.findUnique({where:{id:t.visit.id}}));}
});
live('called transfer releases the claim and appends at target FIFO; in-service transfer is denied',async()=>{
  const b=await new Browser().login(),doc=await new Browser().login(1),key=randomUUID();await walk(b);let t=(await call(doc,0,0,key))!;const moved=await b.request(b.path('/queue/tickets/'+t.id+'/transfer'),'PATCH',{doctorResourceId:resources[0][1],expectedVersion:t.version});assert.equal(moved.status,200);t=await moved.json() as Ticket;assert.equal(t.status,'WAITING');assert.equal((await doc.request(doc.path('/queue/call-next'),'POST',{doctorResourceId:resources[0][0],requestKey:key})).status,403);assert.equal(await call(b),null);t=(await call(b,1))!;t=await action(b,t,'START');assert.equal((await b.request(b.path('/queue/tickets/'+t.id+'/transfer'),'PATCH',{doctorResourceId:resources[0][0],expectedVersion:t.version})).status,409);
});
live('same-clinic references and foreign ticket IDs fail with safe errors',async()=>{
  const b=await new Browser().login();const patientId=await newPatient();for(const bad of [{patientId:patients[1]},{doctorResourceId:resources[1][0]},{roomResourceId:resources[1][2]},{doctorResourceId:resources[0][2]}])assert.equal((await b.request(b.path('/queue/walk-ins'),'POST',{patientId,doctorResourceId:resources[0][0],requestKey:randomUUID(),...bad})).status,404);
  const other=await new Browser().login(0,1),{ticket:t}=await walk(other,0,null,1);const errors=[];for(const id of [t.id,randomUUID()]){const r=await b.request(b.path('/queue/tickets/'+id),'PATCH',{action:'START',expectedVersion:1});assert.equal(r.status,404);errors.push(await r.json());}assert.deepEqual(errors[0],errors[1]);assert.equal((await b.request(b.path('/queue',1))).status,403);
});
live('doctor sees and operates only their linked resource; accountants and forged headers are denied',async()=>{
  const b=await new Browser().login();await walk(b);const other=await walk(b,1);const doc=await new Browser().login(1);const list=await (await doc.request(doc.path('/queue'))).json() as {items:Ticket[]};assert.equal(list.items.length,1);assert(list.items.every(t=>t.doctor.id===resources[0][0]));assert.equal((await doc.request(doc.path('/queue')+'?doctorResourceId='+resources[0][1])).status,403);await action(doc,other.ticket,'CANCEL',403);assert.equal((await doc.request(doc.path('/queue/walk-ins'),'POST',{patientId:await newPatient(),doctorResourceId:resources[0][0],requestKey:randomUUID()},{'X-Role':'CLINIC_OWNER'})).status,403);
  const account=await new Browser().login(3);for(const path of ['/queue','/queue/resources','/queue/events'])assert.equal((await account.request(account.path(path))).status,403);assert.equal((await new Browser().request(b.path('/queue'))).status,401);
});
live('reception check-in and management do not grant consultation completion or board publication',async()=>{
  const b=await new Browser().login(2);await walk(b);let t=(await call(b))!;await action(b,t,'START',403);const doctor=await new Browser().login(1);t=await action(doctor,t,'START');await action(b,t,'COMPLETE',403);assert.equal((await b.request(b.path('/queue/configuration'),'PATCH',{publicDisplayEnabled:true,expectedVersion:1})).status,403);assert.equal((await action(doctor,t,'COMPLETE')).status,'COMPLETED');
});
live('all queue mutation routes enforce CSRF and reject mass assignment',async()=>{
  const b=await new Browser().login(),{ticket:t,body}=await walk(b);for(const [path,method,data] of [['/queue/walk-ins','POST',body],['/queue/check-in','POST',{appointmentId:randomUUID(),expectedVersion:1}],['/queue/call-next','POST',{doctorResourceId:resources[0][0],requestKey:randomUUID()}],['/queue/tickets/'+t.id,'PATCH',{action:'CANCEL',expectedVersion:t.version}],['/queue/tickets/'+t.id+'/transfer','PATCH',{doctorResourceId:resources[0][1],expectedVersion:t.version}]] as const)assert.equal((await b.request(b.path(path),method,data,{'X-CSRF-Token':'forged'})).status,403);
  for(const extra of [{clinicId:clinics[1]},{status:'COMPLETED'},{number:999},{fullName:'غير مسموح'}])assert.equal((await b.request(b.path('/queue/walk-ins'),'POST',{...body,...extra})).status,400);
  assert.equal((await b.request(b.path('/queue')+'?pageSize=101')).status,400);
});
live('suspended clinic, membership and user revoke queue access',async()=>{
  for(const target of ['clinic','membership','user']){const b=await new Browser().login();if(target==='clinic')await owner.clinic.update({where:{id:clinics[0]},data:{status:'SUSPENDED'}});if(target==='membership')await owner.clinicMembership.update({where:{clinicId_userId:{clinicId:clinics[0],userId:users[0]}},data:{status:'SUSPENDED'}});if(target==='user')await owner.user.update({where:{id:users[0]},data:{status:'SUSPENDED'}});try{assert([401,403,404].includes((await b.request(b.path('/queue'))).status));}finally{await owner.clinic.update({where:{id:clinics[0]},data:{status:'ACTIVE'}});await owner.clinicMembership.update({where:{clinicId_userId:{clinicId:clinics[0],userId:users[0]}},data:{status:'ACTIVE'}});await owner.user.update({where:{id:users[0]},data:{status:'ACTIVE'}});}}
});
live('actual runtime role sees no protected rows without context, cannot bypass RLS or delete history',async()=>{
  const b=await new Browser().login();await walk(b);const tables=['Visit','QueueTicket','QueueCounter','QueueConfiguration','QueueCommand'];for(const table of tables){assert.equal((await pool.query(`SELECT * FROM public."${table}"`)).rowCount,0);await assert.rejects(pool.query(`ALTER TABLE public."${table}" DISABLE ROW LEVEL SECURITY`),(e:{code:string})=>e.code==='42501');await assert.rejects(pool.query(`DELETE FROM public."${table}"`),(e:{code:string})=>e.code==='42501');}
  const meta=(await pool.query('SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname=ANY($1)',[tables])).rows;assert.equal(meta.length,5);assert(meta.every(r=>r.relrowsecurity&&r.relforcerowsecurity));
  for(const context of ['', 'invalid',clinics[1]]){const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('lamssa.clinic_id',$1,true)",[context]);assert.equal((await c.query('SELECT * FROM public."Visit"')).rowCount,0);await assert.rejects(c.query('INSERT INTO public."QueueCounter" ("clinicId","businessDate","lastNumber") VALUES ($1,current_date,1)',[clinics[0]]),(e:{code:string})=>e.code==='42501');}finally{await c.query('ROLLBACK');c.release();}}
});
live('actual runtime SQL enforces cross-clinic FKs, immutable clinic/number and counter monotonicity',async()=>{
  const b=await new Browser().login(),{ticket:t}=await walk(b);for(const [sql,values,code] of [
    ['UPDATE public."QueueTicket" SET "doctorResourceId"=$1,version=version+1 WHERE id=$2',[resources[1][0],t.id],'23503'],
    ['UPDATE public."QueueTicket" SET "clinicId"=$1,version=version+1 WHERE id=$2',[clinics[1],t.id],'42501'],
    ['UPDATE public."QueueTicket" SET number=number+1,version=version+1 WHERE id=$1',[t.id],'42501'],
    ['UPDATE public."QueueCounter" SET "lastNumber"=1 WHERE "clinicId"=$1',[clinics[0]],'23514'],
  ] as const)await b.context(async c=>{await assert.rejects(c.query(sql,[...values]),(e:{code:string})=>e.code===code);});
});
live('runtime SQL cannot claim two waiting tickets for one doctor or room, independent of application locks',async()=>{
  const b=await new Browser().login();for(const separateDoctor of [false,true]){
    const first=await walk(b,0,2),second=await walk(b,separateDoctor?1:0,2);
    await b.context(async c=>{await c.query('UPDATE public."QueueTicket" SET status=\'CALLED\',"calledAt"=now(),version=version+1 WHERE id=$1',[first.ticket.id]);await assert.rejects(c.query('UPDATE public."QueueTicket" SET status=\'CALLED\',"calledAt"=now(),version=version+1 WHERE id=$1',[second.ticket.id]),(e:{code:string})=>e.code==='23505');});
  }
});
live('runtime composite foreign keys reject foreign patients, appointments and visits',async()=>{
  const a=await new Browser().login(),b=await new Browser().login(0,1),foreign=await walk(b,0,null,1),appointment=await b.book(input(undefined,1),1);
  for(const [patientId,appointmentId] of [[patients[1],null],[patients[0],appointment.id]])await a.context(async c=>{await assert.rejects(c.query('INSERT INTO public."Visit" (id,"clinicId","patientId","appointmentId",source,"checkInKey","requestHash","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,now())',[randomUUID(),clinics[0],patientId,appointmentId,appointmentId?'APPOINTMENT':'WALK_IN',randomUUID(),'e'.repeat(64)]),(e:{code:string})=>e.code==='23503');});
  await a.context(async c=>{await assert.rejects(c.query('INSERT INTO public."QueueTicket" (id,"clinicId","visitId","businessDate",number,"doctorResourceId","updatedAt") VALUES ($1,$2,$3,current_date,900000,$4,now())',[randomUUID(),clinics[0],foreign.ticket.visit.id,resources[0][0]]),(e:{code:string})=>e.code==='23503');});
});
live('concurrent clinic transactions, rollback and connection reuse cannot leak context',async()=>{
  const a=await new Browser().login(),b=await new Browser().login(0,1);await walk(a);await walk(b,0,null,1);await Promise.all(Array.from({length:12},(_,i)=>(i%2?a:b).context(async c=>{for(const table of ['Visit','QueueTicket','QueueCounter']){const rows=(await c.query(`SELECT "clinicId" FROM public."${table}"`)).rows;assert(rows.length);assert(rows.every(r=>r.clinicId===clinics[i%2?0:1]));}},i%2?0:1)));assert.equal((await pool.query('SELECT * FROM public."QueueTicket"')).rowCount,0);
});
live('public board is opt-in, bounded and exposes only queue labels/numbers without patient identity',async()=>{
  const b=await new Browser().login(),path=`public/clinics/queue-0-${suffix}/queue`;assert.equal((await b.request(path)).status,404);await walk(b,0,2);await call(b);assert.equal((await b.request(b.path('/queue/configuration'),'PATCH',{publicDisplayEnabled:true,expectedVersion:1})).status,200);const r=await new Browser().request(path);assert.equal(r.status,200);const board=await r.json() as {items:Record<string,unknown>[]};assert.equal(board.items.length,1);assert.deepEqual(Object.keys(board.items[0]).sort(),['businessDate','calledAt','doctorLabel','recallCount','roomLabel','status','ticketNumber']);const text=JSON.stringify(board);for(const value of ['patientId','fullName','patientNumber','visitId','appointmentId',patients[0],clinics[0]])assert(!text.includes(value));
});
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function stream(b:Browser,path:string){const abort=new AbortController(),events:string[]=[];const r=await fetch(`${base}/api/v1/${path}`,{headers:{Cookie:[...b.cookies].map(([k,v])=>`${k}=${v}`).join('; ')},signal:abort.signal});assert.equal(r.status,200);const reader=r.body!.getReader();const task=(async()=>{try{for(;;){const chunk=await reader.read();if(chunk.done)break;events.push(new TextDecoder().decode(chunk.value));}}catch{/* explicit test cleanup abort */}})();return {events,close:async()=>{abort.abort();await task;}};}
live('private SSE reauthorizes, isolates clinic revisions and closes after logout',async()=>{
  const a=await new Browser().login(),b=await new Browser().login(0,1),one=await stream(a,a.path('/queue/events')),two=await stream(b,b.path('/queue/events',1));
  try{await pause(100);const before=two.events.join('');await walk(a);await pause(2500);assert(one.events.join('').split('event: resync').length>=3);assert.equal(two.events.join(''),before);assert(!one.events.join('').includes('مراجع'));assert.equal((await a.request('auth/logout','POST',{})).status,200);await pause(2500);assert(one.events.join('').includes('access-ended'));}finally{await one.close();await two.close();}
});
live('private SSE closes on absolute session expiry and clinic-selection rotation',async()=>{
  for(const reason of ['expiry','selection']){const b=await new Browser().login(),s=await stream(b,b.path('/queue/events'));try{if(reason==='expiry')await owner.session.updateMany({where:{tokenHash:digest(b.cookies.get('lamssa_session')!)},data:{createdAt:new Date(Date.now()-60000),expiresAt:new Date(Date.now()-1000)}});else await b.select(1);await pause(2500);assert(s.events.join('').includes('access-ended'));}finally{await s.close();}}
});
live('public SSE contains only public fingerprints and disables on publication withdrawal',async()=>{
  const b=await new Browser().login();await b.request(b.path('/queue/configuration'),'PATCH',{publicDisplayEnabled:true,expectedVersion:1});const s=await stream(new Browser(),`public/clinics/queue-0-${suffix}/queue/events`);
  try{await walk(b);await call(b);await pause(2500);assert(s.events.join('').includes('resync'));assert(!s.events.join('').includes('patient'));await b.request(b.path('/queue/configuration'),'PATCH',{publicDisplayEnabled:false,expectedVersion:1});await pause(2500);assert(s.events.join('').includes('access-ended'));}finally{await s.close();}
});
