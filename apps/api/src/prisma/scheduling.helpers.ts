import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { Permission } from '../auth/permissions.js';
import type { VerifiedPrincipal } from './verified-sessions.js';
import { TenantDatabaseService, type TenantTransaction } from './tenant-database.service.js';
import { SchedulingError } from '../appointments/scheduling-error.js';
import { bookingTimes, withinWeekly, zone } from '../appointments/scheduling-time.js';
import type { LocalBookingInput } from '../appointments/scheduling-input.js';

// Only inspect structured driver codes. Never return SQL/constraint text to clients.
function hasCode(error:unknown,code:string,depth=0):boolean {
  if(!error||typeof error!=='object'||depth>7)return false;
  const e=error as Record<string,unknown>;
  return e.code===code||e.originalCode===code||['cause','meta','driverAdapterError'].some(k=>hasCode(e[k],code,depth+1));
}
export function schedulingDatabaseError(error:unknown):never {
  if(hasCode(error,'23P01'))throw new SchedulingError('SLOT_CONFLICT');
  if(hasCode(error,'23505')||hasCode(error,'P2002'))throw new ConflictException();
  if(hasCode(error,'23503')||hasCode(error,'P2003'))throw new NotFoundException();
  if(hasCode(error,'23514'))throw new BadRequestException();
  if(hasCode(error,'P2028')||hasCode(error,'P2034')||hasCode(error,'40P01'))throw new SchedulingError('SCHEDULING_BUSY');
  throw error;
}
export async function mutateScheduling<T>(database:TenantDatabaseService,proof:VerifiedPrincipal,clinicId:string,permissions:readonly Permission[],work:(tx:TenantTransaction,clinicId:string)=>Promise<T>){
  try{return await database.withClinicContext(proof,clinicId,permissions,async(tx,context)=>{
    // A small clinic-local row lock serializes configuration and booking writes.
    // RLS and the database exclusion constraints remain independently mandatory.
    await tx.schedulingState.upsert({where:{clinicId:context.clinicId},create:{clinicId:context.clinicId},update:{revision:{increment:1}},select:{clinicId:true}});
    return work(tx,context.clinicId);
  });}catch(error){return schedulingDatabaseError(error);}
}
export async function clinicTimezone(tx:TenantTransaction,clinicId:string){
  const clinic=await tx.clinic.findFirst({where:{id:clinicId},select:{timezone:true}});
  if(!clinic)throw new NotFoundException();return zone(clinic.timezone);
}
export const serviceSelect={id:true,name:true,durationMinutes:true,requiresRoom:true,active:true,version:true} as const;
export const resourceSelect={id:true,label:true,kind:true,active:true,version:true,doctorMembershipId:true,
  doctorMembership:{select:{role:true,status:true,user:{select:{status:true}}}}} as const;
export function resourceResponse(r:{id:string;label:string;kind:string;active:boolean;version:number;doctorMembership:{role:string;status:string;user:{status:string}}|null}){
  const eligible=r.kind==='ROOM'||(r.doctorMembership?.role==='DOCTOR'&&r.doctorMembership.status==='ACTIVE'&&r.doctorMembership.user.status==='ACTIVE');
  return {id:r.id,label:r.label,kind:r.kind,active:r.active,bookable:r.active&&eligible,version:r.version};
}
export async function resource(tx:TenantTransaction,clinicId:string,id:string){
  const r=await tx.bookableResource.findFirst({where:{id,clinicId},select:resourceSelect});if(!r)throw new NotFoundException();return r;
}
export async function checkDoctor(tx:TenantTransaction,clinicId:string,membershipId:string){
  const member=await tx.clinicMembership.findFirst({where:{id:membershipId,clinicId,role:'DOCTOR',status:'ACTIVE',user:{status:'ACTIVE'}},select:{id:true}});
  if(!member)throw new NotFoundException();
}
export async function bookingResources(tx:TenantTransaction,clinicId:string,input:LocalBookingInput){
  const service=await tx.clinicService.findFirst({where:{id:input.serviceId,clinicId},select:serviceSelect});
  if(!service)throw new NotFoundException();
  const doctor=await resource(tx,clinicId,input.doctorResourceId);
  const room=input.roomResourceId?await resource(tx,clinicId,input.roomResourceId):null;
  if(doctor.kind!=='DOCTOR'||room&&room.kind!=='ROOM')throw new NotFoundException();
  if(!service.active||!resourceResponse(doctor).bookable||room&&!resourceResponse(room).bookable)throw new SchedulingError('RESOURCE_UNAVAILABLE');
  if(service.requiresRoom&&!room)throw new SchedulingError('ROOM_REQUIRED');
  return {service,doctor,room};
}
export async function inAvailability(tx:TenantTransaction,clinicId:string,ids:string[],startAt:Date,endAt:Date,timeZone:string){
  const intervals=await tx.resourceAvailability.findMany({where:{clinicId,resourceId:{in:ids}},take:57});
  if(intervals.length>56)throw new SchedulingError('SCHEDULING_BUSY');
  for(const id of ids)if(!withinWeekly(startAt,endAt,timeZone,intervals.filter(w=>w.resourceId===id)))return false;
  const excluded=await tx.resourceTimeOff.findFirst({where:{clinicId,resourceId:{in:ids},active:true,startAt:{lt:endAt},endAt:{gt:startAt}},select:{id:true}});
  return !excluded;
}
export async function validatedBooking(tx:TenantTransaction,clinicId:string,patientId:string,input:LocalBookingInput){
  const patient=await tx.patient.findFirst({where:{clinicId,id:patientId},select:{id:true,status:true}});
  if(!patient)throw new NotFoundException();if(patient.status!=='ACTIVE')throw new SchedulingError('INACTIVE_PATIENT');
  const {service,doctor,room}=await bookingResources(tx,clinicId,input);
  const timeZone=await clinicTimezone(tx,clinicId);
  const times=bookingTimes(input.startLocal,timeZone,input.durationMinutes??service.durationMinutes,input.disambiguation);
  if(!await inAvailability(tx,clinicId,[doctor.id,...(room?[room.id]:[])],times.startAt,times.endAt,timeZone))throw new SchedulingError('OUTSIDE_AVAILABILITY');
  return {...times,timeZone};
}
