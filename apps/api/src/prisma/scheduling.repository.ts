import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantDatabaseService, type TenantTransaction } from './tenant-database.service.js';
import type { VerifiedPrincipal } from './verified-sessions.js';
import { SchedulingError } from '../appointments/scheduling-error.js';
import { calendarRange, localInstant, withinWeekly } from '../appointments/scheduling-time.js';
import type { CatalogQuery, ResourceInput, ScheduleInput, ServiceInput, TimeOffInput, TimeOffUpdate, UpdateResource, UpdateService, RangeQuery } from '../appointments/scheduling-input.js';
import { checkDoctor, clinicTimezone, mutateScheduling, resource, resourceResponse, resourceSelect, serviceSelect } from './scheduling.helpers.js';
const timeOffResponse=(r:{id:string;resourceId:string;startAt:Date;endAt:Date;active:boolean;version:number})=>({id:r.id,resourceId:r.resourceId,startAt:r.startAt.toISOString(),endAt:r.endAt.toISOString(),active:r.active,version:r.version});
const configPermissions=['clinic.settings.update'] as const;
@Injectable()
export class SchedulingRepository {
  constructor(private readonly database:TenantDatabaseService){}
  services(proof:VerifiedPrincipal,clinicId:string,q:CatalogQuery){return this.database.withClinicContext(proof,clinicId,['appointments.read'],async(tx,c)=>{
    if(q.cursor&&!await tx.clinicService.findFirst({where:{clinicId:c.clinicId,id:q.cursor},select:{id:true}}))throw new NotFoundException();
    const rows=await tx.clinicService.findMany({where:{clinicId:c.clinicId,...(q.scope==='ACTIVE'?{active:true}:{}),...(q.cursor?{id:{gt:q.cursor}}:{})},select:serviceSelect,orderBy:{id:'asc'},take:q.pageSize+1});
    return this.page(rows,q.pageSize);
  });}
  resources(proof:VerifiedPrincipal,clinicId:string,q:CatalogQuery){return this.database.withClinicContext(proof,clinicId,['appointments.read'],async(tx,c)=>{
    if(q.cursor)await resource(tx,c.clinicId,q.cursor);
    const rows=await tx.bookableResource.findMany({where:{clinicId:c.clinicId,...(q.scope==='ACTIVE'?{active:true}:{}),...(q.cursor?{id:{gt:q.cursor}}:{})},select:resourceSelect,orderBy:{id:'asc'},take:q.pageSize+1});
    return this.page(rows.map(resourceResponse),q.pageSize);
  });}
  doctors(proof:VerifiedPrincipal,clinicId:string,q:CatalogQuery){return this.database.withClinicContext(proof,clinicId,['clinic.settings.update','staff.read'],async(tx,c)=>{
    const rows=await tx.clinicMembership.findMany({where:{clinicId:c.clinicId,role:'DOCTOR',status:'ACTIVE',user:{status:'ACTIVE'},...(q.cursor?{id:{gt:q.cursor}}:{})},select:{id:true,user:{select:{name:true}}},orderBy:{id:'asc'},take:q.pageSize+1});
    return this.page(rows.map(m=>({id:m.id,name:m.user.name})),q.pageSize);
  });}
  createService(proof:VerifiedPrincipal,clinicId:string,input:ServiceInput){return mutateScheduling(this.database,proof,clinicId,configPermissions,(tx,id)=>tx.clinicService.create({data:{clinicId:id,name:input.name,durationMinutes:input.durationMinutes,requiresRoom:input.requiresRoom},select:serviceSelect}));}
  updateService(proof:VerifiedPrincipal,clinicId:string,id:string,input:UpdateService){return mutateScheduling(this.database,proof,clinicId,configPermissions,async(tx,c)=>{
    const current=await tx.clinicService.findFirst({where:{clinicId:c,id},select:{version:true}});if(!current)throw new NotFoundException();if(current.version!==input.expectedVersion)throw new SchedulingError('STALE_VERSION');
    return tx.clinicService.update({where:{clinicId_id:{clinicId:c,id},version:input.expectedVersion},data:{name:input.name,durationMinutes:input.durationMinutes,requiresRoom:input.requiresRoom,active:input.active,version:{increment:1}},select:serviceSelect});
  });}
  createResource(proof:VerifiedPrincipal,clinicId:string,input:ResourceInput){return mutateScheduling(this.database,proof,clinicId,[...configPermissions,'staff.read'],async(tx,c)=>{
    if(input.kind==='DOCTOR'){if(!input.doctorMembershipId)throw new BadRequestException();await checkDoctor(tx,c,input.doctorMembershipId);}
    else if(input.doctorMembershipId!=null)throw new BadRequestException();
    const r=await tx.bookableResource.create({data:{clinicId:c,kind:input.kind,label:input.label,doctorMembershipId:input.doctorMembershipId??null},select:resourceSelect});return resourceResponse(r);
  });}
  updateResource(proof:VerifiedPrincipal,clinicId:string,id:string,input:UpdateResource){return mutateScheduling(this.database,proof,clinicId,configPermissions,async(tx,c)=>{
    const current=await resource(tx,c,id);if(current.version!==input.expectedVersion)throw new SchedulingError('STALE_VERSION');
    if(!input.active&&await tx.appointment.findFirst({where:{clinicId:c,status:{notIn:['CANCELLED','NO_SHOW']},endAt:{gt:new Date()},OR:[{doctorResourceId:id},{roomResourceId:id}]},select:{id:true}}))throw new SchedulingError('SCHEDULE_CHANGE_CONFLICT');
    return resourceResponse(await tx.bookableResource.update({where:{clinicId_id:{clinicId:c,id},version:input.expectedVersion},data:{label:input.label,active:input.active,version:{increment:1}},select:resourceSelect}));
  });}
  schedule(proof:VerifiedPrincipal,clinicId:string,id:string){return this.database.withClinicContext(proof,clinicId,['appointments.read'],async(tx,c)=>{
    const r=await resource(tx,c.clinicId,id);const intervals=await tx.resourceAvailability.findMany({where:{clinicId:c.clinicId,resourceId:id},select:{weekday:true,startMinute:true,endMinute:true},orderBy:[{weekday:'asc'},{startMinute:'asc'}],take:29});if(intervals.length>28)throw new SchedulingError('SCHEDULING_BUSY');
    return {resource:resourceResponse(r),timezone:await clinicTimezone(tx,c.clinicId),intervals};
  });}
  updateSchedule(proof:VerifiedPrincipal,clinicId:string,id:string,input:ScheduleInput){return mutateScheduling(this.database,proof,clinicId,configPermissions,async(tx,c)=>{
    const current=await resource(tx,c,id);if(current.version!==input.expectedVersion)throw new SchedulingError('STALE_VERSION');
    const intervals=[...input.intervals].sort((a,b)=>a.weekday-b.weekday||a.startMinute-b.startMinute);
    for(const [i,w]of intervals.entries())if(w.startMinute>=w.endMinute||(i>0&&intervals[i-1].weekday===w.weekday&&intervals[i-1].endMinute>w.startMinute))throw new BadRequestException();
    await tx.bookableResource.update({where:{clinicId_id:{clinicId:c,id},version:input.expectedVersion},data:{version:{increment:1}}});
    await tx.resourceAvailability.deleteMany({where:{clinicId:c,resourceId:id}});
    if(intervals.length)await tx.resourceAvailability.createMany({data:intervals.map(w=>({clinicId:c,resourceId:id,weekday:w.weekday,startMinute:w.startMinute,endMinute:w.endMinute}))});
    const future=await this.futureBookings(tx,c,id);const timeZone=await clinicTimezone(tx,c);
    if(future.some(a=>!withinWeekly(a.startAt,a.endAt,timeZone,intervals)))throw new SchedulingError('SCHEDULE_CHANGE_CONFLICT');
    return {resource:resourceResponse({...current,version:current.version+1}),timezone:timeZone,intervals};
  });}
  timeOff(proof:VerifiedPrincipal,clinicId:string,id:string,q:RangeQuery){return this.database.withClinicContext(proof,clinicId,['appointments.read'],async(tx,c)=>{
    await resource(tx,c.clinicId,id);const timeZone=await clinicTimezone(tx,c.clinicId),range=calendarRange(q.fromDate,q.toDate,timeZone);
    if(q.cursor&&!await tx.resourceTimeOff.findFirst({where:{clinicId:c.clinicId,resourceId:id,id:q.cursor},select:{id:true}}))throw new NotFoundException();
    const rows=await tx.resourceTimeOff.findMany({where:{clinicId:c.clinicId,resourceId:id,startAt:{lt:range.endAt},endAt:{gt:range.startAt},...(q.cursor?{id:{gt:q.cursor}}:{})},orderBy:{id:'asc'},take:q.pageSize+1});return {timezone:timeZone,...this.page(rows.map(timeOffResponse),q.pageSize)};
  });}
  createTimeOff(proof:VerifiedPrincipal,clinicId:string,id:string,input:TimeOffInput){return mutateScheduling(this.database,proof,clinicId,configPermissions,async(tx,c)=>{
    const current=await resource(tx,c,id);if(current.version!==input.expectedVersion)throw new SchedulingError('STALE_VERSION');
    const timeZone=await clinicTimezone(tx,c),startAt=localInstant(input.startLocal,timeZone,input.startDisambiguation),endAt=localInstant(input.endLocal,timeZone,input.endDisambiguation);
    if(startAt>=endAt||endAt.getTime()-startAt.getTime()>366*86400000)throw new SchedulingError('INVALID_TIME_RANGE');
    if((await this.futureBookings(tx,c,id)).some(a=>a.startAt<endAt&&a.endAt>startAt))throw new SchedulingError('SCHEDULE_CHANGE_CONFLICT');
    await tx.bookableResource.update({where:{clinicId_id:{clinicId:c,id},version:input.expectedVersion},data:{version:{increment:1}}});
    return timeOffResponse(await tx.resourceTimeOff.create({data:{clinicId:c,resourceId:id,startAt,endAt}}));
  });}
  updateTimeOff(proof:VerifiedPrincipal,clinicId:string,resourceId:string,id:string,input:TimeOffUpdate){return mutateScheduling(this.database,proof,clinicId,configPermissions,async(tx,c)=>{
    await resource(tx,c,resourceId);const current=await tx.resourceTimeOff.findFirst({where:{clinicId:c,resourceId,id}});if(!current)throw new NotFoundException();if(current.version!==input.expectedVersion)throw new SchedulingError('STALE_VERSION');
    if(input.active&&(await this.futureBookings(tx,c,resourceId)).some(a=>a.startAt<current.endAt&&a.endAt>current.startAt))throw new SchedulingError('SCHEDULE_CHANGE_CONFLICT');
    await tx.bookableResource.update({where:{clinicId_id:{clinicId:c,id:resourceId}},data:{version:{increment:1}}});
    return timeOffResponse(await tx.resourceTimeOff.update({where:{id,clinicId:c,version:input.expectedVersion},data:{active:input.active,version:{increment:1}}}));
  });}
  private page<T extends{id:string}>(rows:T[],size:number){const hasMore=rows.length>size,items=rows.slice(0,size);return {items,hasMore,nextCursor:hasMore?items.at(-1)!.id:null,pageSize:size};}
  private async futureBookings(tx:TenantTransaction,clinicId:string,resourceId:string){const rows=await tx.appointment.findMany({where:{clinicId,status:{notIn:['CANCELLED','NO_SHOW']},endAt:{gt:new Date()},OR:[{doctorResourceId:resourceId},{roomResourceId:resourceId}]},select:{startAt:true,endAt:true},take:2001});if(rows.length>2000)throw new SchedulingError('SCHEDULE_CHANGE_CONFLICT');return rows;}
}
