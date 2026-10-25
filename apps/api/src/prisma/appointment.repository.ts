import { createHash } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import type { Permission } from '../auth/permissions.js';
import type { VerifiedPrincipal } from './verified-sessions.js';
import { TenantDatabaseService } from './tenant-database.service.js';
import { checkInAppointment, finishTicket, ticket, ticketProjection } from './queue.helpers.js';
import { QueueError } from '../queue/queue-error.js';
import { SchedulingError } from '../appointments/scheduling-error.js';
import { calendarRange, localCandidates, localView, nextStatuses, plainDate, withinWeekly, todayInZone } from '../appointments/scheduling-time.js';
import type { AppointmentQuery, AppointmentStatusInput, AvailabilityQuery, CreateAppointment, UpdateAppointment } from '../appointments/scheduling-input.js';
import { bookingResources, clinicTimezone, mutateScheduling, validatedBooking } from './scheduling.helpers.js';
const projection={id:true,patientId:true,serviceId:true,doctorResourceId:true,roomResourceId:true,startAt:true,endAt:true,status:true,cancellationReason:true,version:true,createdAt:true,updatedAt:true,
  patient:{select:{id:true,patientNumber:true,fullName:true}},service:{select:{id:true,name:true}},doctor:{select:{id:true,label:true}},room:{select:{id:true,label:true}}} satisfies Prisma.AppointmentSelect;
type Row=Prisma.AppointmentGetPayload<{select:typeof projection}>;
const response=(p:Row,timeZone:string)=>({
  id:p.id,patient:p.patient,service:p.service,doctor:p.doctor,room:p.room,
  startAt:p.startAt.toISOString(),endAt:p.endAt.toISOString(),
  startLocal:localView(p.startAt,timeZone).local,endLocal:localView(p.endAt,timeZone).local,
  startOffset:localView(p.startAt,timeZone).offset,endOffset:localView(p.endAt,timeZone).offset,
  timezone:timeZone,status:p.status,cancellationReason:p.cancellationReason,version:p.version,
  createdAt:p.createdAt.toISOString(),updatedAt:p.updatedAt.toISOString(),
});
const bookingHash=(input:CreateAppointment)=>createHash('sha256').update(JSON.stringify({patientId:input.patientId,serviceId:input.serviceId,doctorResourceId:input.doctorResourceId,roomResourceId:input.roomResourceId??null,startLocal:input.startLocal,durationMinutes:input.durationMinutes??null,disambiguation:input.disambiguation??'REJECT'})).digest('hex');

@Injectable()
export class AppointmentRepository {
  constructor(private readonly database:TenantDatabaseService){}
  settings(proof:VerifiedPrincipal,clinicId:string){return this.database.withClinicContext(proof,clinicId,['appointments.read'],async(tx,c)=>({timezone:await clinicTimezone(tx,c.clinicId),slotStepMinutes:15,minDurationMinutes:5,maxDurationMinutes:480,maxBookingDays:366}));}
  list(proof:VerifiedPrincipal,clinicId:string,q:AppointmentQuery){
    return this.database.withClinicContext(proof,clinicId,['appointments.read'],async(tx,c)=>{
      const timeZone=await clinicTimezone(tx,c.clinicId),range=calendarRange(q.fromDate,q.toDate,timeZone);
      const where:Prisma.AppointmentWhereInput={clinicId:c.clinicId,startAt:{lt:range.endAt},endAt:{gt:range.startAt}};
      if(q.status!=='ALL')where.status=q.status;
      if(q.doctorResourceId){await bookingResourceExists();where.doctorResourceId=q.doctorResourceId;}
      async function bookingResourceExists(){const r=await tx.bookableResource.findFirst({where:{clinicId:c.clinicId,id:q.doctorResourceId,kind:'DOCTOR'},select:{id:true}});if(!r)throw new NotFoundException();}
      if(q.patientId){if(!await tx.patient.findFirst({where:{clinicId:c.clinicId,id:q.patientId},select:{id:true}}))throw new NotFoundException();where.patientId=q.patientId;}
      if(q.cursor){const anchor=await tx.appointment.findFirst({where:{id:q.cursor,clinicId:c.clinicId},select:{id:true,startAt:true}});if(!anchor)throw new NotFoundException();where.AND={OR:[{startAt:{gt:anchor.startAt}},{startAt:anchor.startAt,id:{gt:anchor.id}}]};}
      const rows=await tx.appointment.findMany({where,select:projection,orderBy:[{startAt:'asc'},{id:'asc'}],take:q.pageSize+1});
      const hasMore=rows.length>q.pageSize,items=rows.slice(0,q.pageSize);
      return {timezone:timeZone,items:items.map(p=>response(p,timeZone)),hasMore,nextCursor:hasMore?items.at(-1)!.id:null,pageSize:q.pageSize};
    });
  }
  get(proof:VerifiedPrincipal,clinicId:string,id:string){return this.database.withClinicContext(proof,clinicId,['appointments.read'],async(tx,c)=>{
    const p=await tx.appointment.findFirst({where:{id,clinicId:c.clinicId},select:projection});if(!p)throw new NotFoundException();return response(p,await clinicTimezone(tx,c.clinicId));
  });}
  create(proof:VerifiedPrincipal,clinicId:string,input:CreateAppointment){return mutateScheduling(this.database,proof,clinicId,['appointments.create'],async(tx,id)=>{
    const hash=bookingHash(input),existing=await tx.appointment.findFirst({where:{clinicId:id,bookingKey:input.bookingKey},select:{...projection,requestHash:true}});
    if(existing){if(existing.requestHash!==hash)throw new SchedulingError('IDEMPOTENCY_CONFLICT');return response(existing,await clinicTimezone(tx,id));}
    const times=await validatedBooking(tx,id,input.patientId,input);
    const p=await tx.appointment.create({data:{clinicId:id,patientId:input.patientId,serviceId:input.serviceId,doctorResourceId:input.doctorResourceId,roomResourceId:input.roomResourceId??null,startAt:times.startAt,endAt:times.endAt,bookingKey:input.bookingKey,requestHash:hash},select:projection});
    return response(p,times.timeZone);
  });}
  update(proof:VerifiedPrincipal,clinicId:string,id:string,input:UpdateAppointment){return mutateScheduling(this.database,proof,clinicId,['appointments.update'],async(tx,tenant)=>{
    const current=await tx.appointment.findFirst({where:{id,clinicId:tenant},select:projection});if(!current)throw new NotFoundException();
    if(current.version!==input.expectedVersion)throw new SchedulingError('STALE_VERSION');
    if(!['SCHEDULED','CONFIRMED'].includes(current.status))throw new SchedulingError('INVALID_TRANSITION');
    const times=await validatedBooking(tx,tenant,current.patientId,input);
    const changed=times.startAt.getTime()!==current.startAt.getTime()||times.endAt.getTime()!==current.endAt.getTime()||input.serviceId!==current.serviceId||input.doctorResourceId!==current.doctorResourceId||(input.roomResourceId??null)!==current.roomResourceId;
    const p=await tx.appointment.update({where:{clinicId_id:{clinicId:tenant,id},version:input.expectedVersion},data:{serviceId:input.serviceId,doctorResourceId:input.doctorResourceId,roomResourceId:input.roomResourceId??null,startAt:times.startAt,endAt:times.endAt,status:changed?'SCHEDULED':current.status,version:{increment:1}},select:projection});return response(p,times.timeZone);
  });}
  status(proof:VerifiedPrincipal,clinicId:string,id:string,input:AppointmentStatusInput){
    const required:Permission[]=['appointments.update'];
    if(['CANCELLED','NO_SHOW'].includes(input.status))required.push('appointments.cancel');
    if(input.status==='ARRIVED')required.push('queue.manage');
    if(input.status==='COMPLETED')required.push('appointments.complete','queue.manage','queue.complete');
    return mutateScheduling(this.database,proof,clinicId,required,async(tx,tenant,c)=>{
      if(input.status==='ARRIVED'){
        if(input.cancellationReason!=null)throw new BadRequestException();
        await checkInAppointment(tx,c,id,input.expectedVersion);
        const arrived=await tx.appointment.findFirstOrThrow({where:{id,clinicId:tenant},select:projection});return response(arrived,await clinicTimezone(tx,tenant));
      }
      const current=await tx.appointment.findFirst({where:{id,clinicId:tenant},select:{id:true,status:true,version:true}});if(!current)throw new NotFoundException();
      if(current.version!==input.expectedVersion)throw new SchedulingError('STALE_VERSION');
      if(!nextStatuses[current.status].includes(input.status))throw new SchedulingError('INVALID_TRANSITION');
      if(input.status!=='CANCELLED'&&input.cancellationReason!=null)throw new BadRequestException();
      if(current.status==='ARRIVED'){
        const row=await tx.queueTicket.findFirst({where:{clinicId:tenant,visit:{appointmentId:id}},select:ticketProjection});
        if(!row||row.status!=='IN_SERVICE'||input.status!=='COMPLETED')throw new QueueError('QUEUE_WORKFLOW');
        await ticket(tx,c,row.id);await finishTicket(tx,c,row,'COMPLETED');
        return response(await tx.appointment.findFirstOrThrow({where:{id,clinicId:tenant},select:projection}),await clinicTimezone(tx,tenant));
      }
      const p=await tx.appointment.update({where:{clinicId_id:{clinicId:tenant,id},version:input.expectedVersion},data:{status:input.status,cancellationReason:input.status==='CANCELLED'?input.cancellationReason??null:null,version:{increment:1}},select:projection});return response(p,await clinicTimezone(tx,tenant));
    });
  }
  availability(proof:VerifiedPrincipal,clinicId:string,q:AvailabilityQuery){return this.database.withClinicContext(proof,clinicId,['appointments.read'],async(tx,c)=>{
    const timeZone=await clinicTimezone(tx,c.clinicId),date=plainDate(q.date),range=calendarRange(q.date,date.add({days:1}).toString(),timeZone);
    const {service,doctor,room}=await bookingResources(tx,c.clinicId,{...q,startLocal:`${q.date}T00:00`,disambiguation:'REJECT'});
    if(q.excludeAppointmentId&&!await tx.appointment.findFirst({where:{id:q.excludeAppointmentId,clinicId:c.clinicId},select:{id:true}}))throw new NotFoundException();
    const ids=[doctor.id,...(room?[room.id]:[])],duration=q.durationMinutes??service.durationMinutes;
    const weekly=await tx.resourceAvailability.findMany({where:{clinicId:c.clinicId,resourceId:{in:ids}},take:57});if(weekly.length>56)throw new SchedulingError('SCHEDULING_BUSY');
    const windowEnd=new Date(range.endAt.getTime()+480*60000);
    const blocks=await tx.resourceTimeOff.findMany({where:{clinicId:c.clinicId,resourceId:{in:ids},active:true,startAt:{lt:windowEnd},endAt:{gt:range.startAt}},select:{resourceId:true,startAt:true,endAt:true},take:1001});
    const bookings=await tx.appointment.findMany({where:{clinicId:c.clinicId,status:{notIn:['CANCELLED','NO_SHOW']},...(q.excludeAppointmentId?{id:{not:q.excludeAppointmentId}}:{}),OR:[{doctorResourceId:doctor.id},...(room?[{roomResourceId:room.id}]:[])],startAt:{lt:windowEnd},endAt:{gt:range.startAt}},select:{startAt:true,endAt:true},take:1001});
    if(blocks.length>1000||bookings.length>1000)throw new SchedulingError('SCHEDULING_BUSY');
    const slots=[];const horizon=plainDate(q.date).since(plainDate(todayInZone(timeZone))).days;
    if(horizon<0||horizon>366)return {timezone:timeZone,date:q.date,slots:[],advisory:true};
    for(let minute=0;minute<1440;minute+=15){const local=`${q.date}T${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;const candidates=localCandidates(local,timeZone);
      for(const [index,z] of candidates.entries()){
        const startAt=new Date(z.epochMilliseconds),endAt=new Date(z.epochMilliseconds+duration*60000);if(startAt.getTime()<Date.now())continue;
        if(!ids.every(id=>withinWeekly(startAt,endAt,timeZone,weekly.filter(w=>w.resourceId===id))))continue;
        if([...blocks,...bookings].some(b=>b.startAt<endAt&&b.endAt>startAt))continue;
        slots.push({startAt:startAt.toISOString(),endAt:endAt.toISOString(),startLocal:local,endLocal:localView(endAt,timeZone).local,offset:z.offset,disambiguation:candidates.length>1?(index?'LATER':'EARLIER'):'REJECT'});
      }
    }
    slots.sort((a,b)=>a.startAt.localeCompare(b.startAt));return {timezone:timeZone,date:q.date,slots,advisory:true};
  });}
}
