import { createHash, randomUUID } from 'node:crypto';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Prisma, QueueStatus } from '../generated/prisma/client.js';
import type { TenantContext, TenantTransaction } from './tenant-database.service.js';
import { clinicTimezone, resource, resourceResponse } from './scheduling.helpers.js';
import { todayInZone } from '../appointments/scheduling-time.js';
import { SchedulingError } from '../appointments/scheduling-error.js';
import { QueueError } from '../queue/queue-error.js';
export const activeQueue=['WAITING','CALLED','IN_SERVICE'] satisfies QueueStatus[];
export const queueHash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const ticketProjection={id:true,number:true,businessDate:true,status:true,version:true,queuedAt:true,calledAt:true,recallCount:true,
  doctor:{select:{id:true,label:true}},room:{select:{id:true,label:true}},
  visit:{select:{id:true,status:true,source:true,appointmentId:true,checkedInAt:true,startedAt:true,endedAt:true,
    patient:{select:{id:true,patientNumber:true,fullName:true}}}}} satisfies Prisma.QueueTicketSelect;
export type TicketRow=Prisma.QueueTicketGetPayload<{select:typeof ticketProjection}>;
export function ticketResponse(row:TicketRow){return {
  id:row.id,ticketNumber:`Q-${String(row.number).padStart(4,'0')}`,businessDate:row.businessDate.toISOString().slice(0,10),
  status:row.status,version:row.version,queuedAt:row.queuedAt.toISOString(),calledAt:row.calledAt?.toISOString()??null,recallCount:row.recallCount,
  doctor:row.doctor,room:row.room,visit:{id:row.visit.id,status:row.visit.status,source:row.visit.source,appointmentId:row.visit.appointmentId,
    checkedInAt:row.visit.checkedInAt.toISOString(),startedAt:row.visit.startedAt?.toISOString()??null,endedAt:row.visit.endedAt?.toISOString()??null},patient:row.visit.patient,
};}
export async function queueDoctor(tx:TenantTransaction,c:TenantContext,id:string){
  const doctor=await resource(tx,c.clinicId,id);
  if(doctor.kind!=='DOCTOR')throw new NotFoundException();
  if(c.role==='DOCTOR'&&doctor.doctorMembershipId!==c.membershipId)throw new ForbiddenException();
  return doctor;
}
export async function queueAssignment(tx:TenantTransaction,c:TenantContext,doctorId:string,roomId?:string|null){
  const doctor=await queueDoctor(tx,c,doctorId),room=roomId?await resource(tx,c.clinicId,roomId):null;
  if(room&&room.kind!=='ROOM')throw new NotFoundException();
  if(!resourceResponse(doctor).bookable||room&&!resourceResponse(room).bookable)throw new SchedulingError('RESOURCE_UNAVAILABLE');
  return {doctor,room};
}
export async function ticket(tx:TenantTransaction,c:TenantContext,id:string){
  const row=await tx.queueTicket.findFirst({where:{id,clinicId:c.clinicId},select:ticketProjection});
  if(!row)throw new NotFoundException();await queueDoctor(tx,c,row.doctor.id);return row;
}
export async function makeVisit(tx:TenantTransaction,c:TenantContext,input:{patientId:string;appointmentId?:string;doctorResourceId:string;roomResourceId?:string|null;requestKey:string;hash:string}){
  const patient=await tx.patient.findFirst({where:{id:input.patientId,clinicId:c.clinicId},select:{id:true,status:true}});
  if(!patient)throw new NotFoundException();if(patient.status!=='ACTIVE')throw new QueueError('QUEUE_INACTIVE_PATIENT');
  await queueAssignment(tx,c,input.doctorResourceId,input.roomResourceId);
  if(await tx.visit.findFirst({where:{clinicId:c.clinicId,patientId:patient.id,status:{in:['WAITING','IN_SERVICE']}},select:{id:true}}))throw new QueueError('QUEUE_DUPLICATE');
  const day=todayInZone(await clinicTimezone(tx,c.clinicId)),businessDate=new Date(day+'T00:00:00Z');
  const counter=await tx.queueCounter.upsert({where:{clinicId_businessDate:{clinicId:c.clinicId,businessDate}},create:{clinicId:c.clinicId,businessDate,lastNumber:1},update:{lastNumber:{increment:1}},select:{lastNumber:true}});
  const visit=await tx.visit.create({data:{clinicId:c.clinicId,patientId:patient.id,appointmentId:input.appointmentId??null,source:input.appointmentId?'APPOINTMENT':'WALK_IN',checkInKey:input.requestKey,requestHash:input.hash},select:{id:true}});
  return tx.queueTicket.create({data:{clinicId:c.clinicId,visitId:visit.id,businessDate,number:counter.lastNumber,doctorResourceId:input.doctorResourceId,roomResourceId:input.roomResourceId??null},select:ticketProjection});
}
// Called only inside the appointment/queue writer transaction. ARRIVED retries
// return the same ticket; reconciliation is explicit, never a bulk backfill.
export async function checkInAppointment(tx:TenantTransaction,c:TenantContext,id:string,version:number,reconcile=false){
  const appointment=await tx.appointment.findFirst({where:{id,clinicId:c.clinicId},select:{id:true,patientId:true,doctorResourceId:true,roomResourceId:true,startAt:true,status:true,version:true}});
  if(!appointment)throw new NotFoundException();await queueDoctor(tx,c,appointment.doctorResourceId);
  const existing=await tx.queueTicket.findFirst({where:{clinicId:c.clinicId,visit:{appointmentId:id}},select:ticketProjection});
  if(existing){if(appointment.status!=='ARRIVED')throw new QueueError('QUEUE_TRANSITION');return existing;}
  if(appointment.version!==version)throw new QueueError('QUEUE_STALE');
  if(!['SCHEDULED','CONFIRMED','ARRIVED'].includes(appointment.status))throw new QueueError('QUEUE_TRANSITION');
  if(appointment.status==='ARRIVED'&&!reconcile)throw new QueueError('QUEUE_WORKFLOW');
  if(reconcile&&appointment.status!=='ARRIVED')throw new QueueError('QUEUE_TRANSITION');
  // Staff may explicitly check in an early/late appointment. Ticket date always
  // reflects actual check-in in the clinic timezone, not its scheduled date.
  if(appointment.status!=='ARRIVED')await tx.appointment.update({where:{clinicId_id:{clinicId:c.clinicId,id}},data:{status:'ARRIVED',version:{increment:1}}});
  return makeVisit(tx,c,{patientId:appointment.patientId,appointmentId:id,doctorResourceId:appointment.doctorResourceId,roomResourceId:appointment.roomResourceId,requestKey:randomUUID(),hash:queueHash({appointmentId:id})});
}
export async function finishTicket(tx:TenantTransaction,c:TenantContext,current:TicketRow,status:'COMPLETED'|'CANCELLED'|'ABSENT'){
  const visitStatus=status==='ABSENT'?'NO_SHOW':status;
  await tx.visit.update({where:{clinicId_id:{clinicId:c.clinicId,id:current.visit.id}},data:{status:visitStatus,endedAt:new Date(),version:{increment:1}}});
  if(current.visit.appointmentId)await tx.appointment.update({where:{clinicId_id:{clinicId:c.clinicId,id:current.visit.appointmentId}},data:{status:visitStatus,cancellationReason:status==='CANCELLED'?'OTHER':null,version:{increment:1}}});
  return tx.queueTicket.update({where:{clinicId_id:{clinicId:c.clinicId,id:current.id},version:current.version},data:{status,version:{increment:1}},select:ticketProjection});
}
