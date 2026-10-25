import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import type { Permission } from '../auth/permissions.js';
import type { VerifiedPrincipal } from './verified-sessions.js';
import { TenantDatabaseService } from './tenant-database.service.js';
import { clinicTimezone, mutateScheduling, resourceResponse, resourceSelect } from './scheduling.helpers.js';
import { plainDate, todayInZone } from '../appointments/scheduling-time.js';
import { QueueError } from '../queue/queue-error.js';
import type { CallNextInput, CheckInInput, QueueActionInput, QueueConfigurationInput, QueueQuery, TransferInput, WalkInInput } from '../queue/queue-input.js';
import { activeQueue, checkInAppointment, finishTicket, makeVisit, queueAssignment, queueDoctor, queueHash, ticket, ticketProjection, ticketResponse } from './queue.helpers.js';

@Injectable()
export class QueueRepository {
  constructor(private readonly database:TenantDatabaseService){}
  resources(proof:VerifiedPrincipal,clinicId:string){return this.database.withClinicContext(proof,clinicId,['queue.read'],async(tx,c)=>{
    const timezone=await clinicTimezone(tx,c.clinicId);
    const rows=await tx.bookableResource.findMany({where:{clinicId:c.clinicId,active:true,...(c.role==='DOCTOR'?{OR:[{kind:'ROOM'},{doctorMembershipId:c.membershipId}]}:{})},select:resourceSelect,orderBy:{id:'asc'},take:201});
    if(rows.length>200)throw new BadRequestException();
    const config=await tx.queueConfiguration.findFirst({where:{clinicId:c.clinicId},select:{publicDisplayEnabled:true,version:true}});
    return {timezone,today:todayInZone(timezone),resources:rows.map(resourceResponse).filter(r=>r.bookable),configuration:config??{publicDisplayEnabled:false,version:0}};
  });}
  revision(proof:VerifiedPrincipal,clinicId:string){return this.database.withClinicContext(proof,clinicId,['queue.read'],async(tx,c)=>{
    const state=await tx.schedulingState.findFirst({where:{clinicId:c.clinicId},select:{revision:true}});return {revision:state?.revision.toString()??'0'};
  });}
  list(proof:VerifiedPrincipal,clinicId:string,q:QueueQuery){return this.database.withClinicContext(proof,clinicId,['queue.read'],async(tx,c)=>{
    const timezone=await clinicTimezone(tx,c.clinicId),today=todayInZone(timezone);
    let doctorId=q.doctorResourceId;
    if(c.role==='DOCTOR'){
      const mine=await tx.bookableResource.findFirst({where:{clinicId:c.clinicId,doctorMembershipId:c.membershipId,kind:'DOCTOR',active:true},select:{id:true}});
      if(!mine)throw new ForbiddenException();if(doctorId&&doctorId!==mine.id)throw new ForbiddenException();doctorId=mine.id;
    }
    if(doctorId)await queueDoctor(tx,c,doctorId);
    if(q.scope==='LIVE'&&q.date)throw new BadRequestException();
    if(q.scope==='LIVE'&&q.status!=='ALL'&&!['WAITING','CALLED','IN_SERVICE'].includes(q.status))throw new BadRequestException();
    const date=q.scope==='DAY'?plainDate(q.date??today).toString():today;
    const where:Prisma.QueueTicketWhereInput={clinicId:c.clinicId,...(doctorId?{doctorResourceId:doctorId}:{}),
      ...(q.scope==='LIVE'?{status:{in:activeQueue}}:{businessDate:new Date(date+'T00:00:00Z')})};
    if(q.status!=='ALL')where.status=q.status;
    if(q.cursor){const anchor=await tx.queueTicket.findFirst({where:{clinicId:c.clinicId,id:q.cursor,...(doctorId?{doctorResourceId:doctorId}:{})},select:{id:true,queuedAt:true}});if(!anchor)throw new NotFoundException();where.AND={OR:[{queuedAt:{gt:anchor.queuedAt}},{queuedAt:anchor.queuedAt,id:{gt:anchor.id}}]};}
    const rows=await tx.queueTicket.findMany({where,select:ticketProjection,orderBy:[{queuedAt:'asc'},{id:'asc'}],take:q.pageSize+1});
    const state=await tx.schedulingState.findFirst({where:{clinicId:c.clinicId},select:{revision:true}});
    return {timezone,today,date,items:rows.slice(0,q.pageSize).map(ticketResponse),hasMore:rows.length>q.pageSize,nextCursor:rows.length>q.pageSize?rows[q.pageSize-1].id:null,revision:state?.revision.toString()??'0'};
  });}
  checkIn(proof:VerifiedPrincipal,clinicId:string,input:CheckInInput,reconcile=false){return mutateScheduling(this.database,proof,clinicId,['queue.checkin'],async(tx,_id,c)=>ticketResponse(await checkInAppointment(tx,c,input.appointmentId,input.expectedVersion,reconcile)));}
  walkIn(proof:VerifiedPrincipal,clinicId:string,input:WalkInInput){return mutateScheduling(this.database,proof,clinicId,['queue.checkin'],async(tx,_id,c)=>{
    const hash=queueHash({kind:'WALK_IN',patientId:input.patientId,doctorResourceId:input.doctorResourceId,roomResourceId:input.roomResourceId??null});
    const existing=await tx.visit.findFirst({where:{clinicId:c.clinicId,checkInKey:input.requestKey},select:{requestHash:true,ticket:{select:ticketProjection}}});
    if(existing){if(existing.requestHash!==hash)throw new QueueError('QUEUE_RETRY');if(!existing.ticket)throw new QueueError('QUEUE_TRANSITION');return ticketResponse(existing.ticket);}
    return ticketResponse(await makeVisit(tx,c,{...input,hash}));
  });}
  callNext(proof:VerifiedPrincipal,clinicId:string,input:CallNextInput){return mutateScheduling(this.database,proof,clinicId,['queue.manage'],async(tx,_id,c)=>{
    await queueAssignment(tx,c,input.doctorResourceId);
    const hash=queueHash({kind:'CALL_NEXT',doctorResourceId:input.doctorResourceId});
    const old=await tx.queueCommand.findFirst({where:{clinicId:c.clinicId,requestKey:input.requestKey},select:{requestHash:true,ticket:{select:ticketProjection}}});
    if(old){if(old.requestHash!==hash)throw new QueueError('QUEUE_RETRY');if(old.ticket)await queueDoctor(tx,c,old.ticket.doctor.id);return {ticket:old.ticket?ticketResponse(old.ticket):null};}
    if(await tx.queueTicket.findFirst({where:{clinicId:c.clinicId,doctorResourceId:input.doctorResourceId,status:{in:['CALLED','IN_SERVICE']}},select:{id:true}}))throw new QueueError('QUEUE_BUSY');
    // Strict FIFO per doctor, including carry-over from previous clinic days.
    const next=await tx.queueTicket.findFirst({where:{clinicId:c.clinicId,doctorResourceId:input.doctorResourceId,status:'WAITING'},orderBy:[{queuedAt:'asc'},{id:'asc'}],select:ticketProjection});
    if(next){await queueAssignment(tx,c,next.doctor.id,next.room?.id);
      if(next.room&&await tx.queueTicket.findFirst({where:{clinicId:c.clinicId,roomResourceId:next.room.id,status:{in:['CALLED','IN_SERVICE']}},select:{id:true}}))throw new QueueError('QUEUE_BUSY');
    }
    const called=next?await tx.queueTicket.update({where:{clinicId_id:{clinicId:c.clinicId,id:next.id},version:next.version},data:{status:'CALLED',calledAt:new Date(),version:{increment:1}},select:ticketProjection}):null;
    await tx.queueCommand.create({data:{clinicId:c.clinicId,requestKey:input.requestKey,requestHash:hash,ticketId:called?.id??null}});
    return {ticket:called?ticketResponse(called):null};
  });}
  action(proof:VerifiedPrincipal,clinicId:string,id:string,input:QueueActionInput){
    const permissions:Permission[]=['queue.manage'];if(['START','COMPLETE'].includes(input.action))permissions.push('queue.complete');
    return mutateScheduling(this.database,proof,clinicId,permissions,async(tx,_id,c)=>{
      const current=await ticket(tx,c,id);if(current.version!==input.expectedVersion)throw new QueueError('QUEUE_STALE');
      const allowed:Record<QueueActionInput['action'],readonly string[]>={RECALL:['CALLED'],START:['CALLED'],COMPLETE:['IN_SERVICE'],ABSENT:['CALLED'],CANCEL:['WAITING','CALLED']};
      if(!allowed[input.action].includes(current.status))throw new QueueError('QUEUE_TRANSITION');
      if(input.action==='RECALL')return ticketResponse(await tx.queueTicket.update({where:{clinicId_id:{clinicId:c.clinicId,id}},data:{calledAt:new Date(),recallCount:{increment:1},version:{increment:1}},select:ticketProjection}));
      if(input.action==='START'){
        await queueAssignment(tx,c,current.doctor.id,current.room?.id);
        await tx.visit.update({where:{clinicId_id:{clinicId:c.clinicId,id:current.visit.id}},data:{status:'IN_SERVICE',startedAt:new Date(),version:{increment:1}}});
        return ticketResponse(await tx.queueTicket.update({where:{clinicId_id:{clinicId:c.clinicId,id}},data:{status:'IN_SERVICE',version:{increment:1}},select:ticketProjection}));
      }
      return ticketResponse(await finishTicket(tx,c,current,input.action==='COMPLETE'?'COMPLETED':input.action==='ABSENT'?'ABSENT':'CANCELLED'));
    });
  }
  transfer(proof:VerifiedPrincipal,clinicId:string,id:string,input:TransferInput){return mutateScheduling(this.database,proof,clinicId,['queue.transfer'],async(tx,_id,c)=>{
    const current=await ticket(tx,c,id);if(current.version!==input.expectedVersion)throw new QueueError('QUEUE_STALE');
    if(!['WAITING','CALLED'].includes(current.status))throw new QueueError('QUEUE_TRANSITION');
    await queueAssignment(tx,c,input.doctorResourceId,input.roomResourceId);
    if(current.visit.appointmentId){const a=await tx.appointment.findFirst({where:{clinicId:c.clinicId,id:current.visit.appointmentId},select:{service:{select:{requiresRoom:true}}}});if(a?.service.requiresRoom&&!input.roomResourceId)throw new BadRequestException();}
    return ticketResponse(await tx.queueTicket.update({where:{clinicId_id:{clinicId:c.clinicId,id}},data:{doctorResourceId:input.doctorResourceId,roomResourceId:input.roomResourceId??null,status:'WAITING',queuedAt:new Date(),calledAt:null,version:{increment:1}},select:ticketProjection}));
  });}
  configure(proof:VerifiedPrincipal,clinicId:string,input:QueueConfigurationInput){return mutateScheduling(this.database,proof,clinicId,['clinic.settings.update'],async(tx,_id,c)=>{
    const current=await tx.queueConfiguration.findFirst({where:{clinicId:c.clinicId}});
    if(current){if(current.version!==input.expectedVersion)throw new QueueError('QUEUE_STALE');return tx.queueConfiguration.update({where:{clinicId:c.clinicId},data:{publicDisplayEnabled:input.publicDisplayEnabled,version:{increment:1}},select:{publicDisplayEnabled:true,version:true}});}
    // First configuration uses the explicitly documented initial version 1.
    if(input.expectedVersion!==1)throw new QueueError('QUEUE_STALE');
    return tx.queueConfiguration.create({data:{clinicId:c.clinicId,publicDisplayEnabled:input.publicDisplayEnabled},select:{publicDisplayEnabled:true,version:true}});
  });}
}
