import { api } from '../auth/api';
export type AppointmentStatus='SCHEDULED'|'CONFIRMED'|'ARRIVED'|'COMPLETED'|'CANCELLED'|'NO_SHOW';
export type Choice='REJECT'|'EARLIER'|'LATER';
export type Service={id:string;name:string;durationMinutes:number;requiresRoom:boolean;active:boolean;version:number};
export type Resource={id:string;label:string;kind:'DOCTOR'|'ROOM';active:boolean;bookable:boolean;version:number};
export type Page<T>={items:T[];nextCursor:string|null;hasMore:boolean;pageSize:number};
export type AppointmentRecord={id:string;patient:{id:string;fullName:string;patientNumber:string};service:{id:string;name:string};doctor:{id:string;label:string};room:{id:string;label:string}|null;startAt:string;endAt:string;startLocal:string;endLocal:string;startOffset:string;endOffset:string;timezone:string;status:AppointmentStatus;cancellationReason:string|null;version:number};
export type BookingInput={patientId:string;serviceId:string;doctorResourceId:string;roomResourceId:string|null;startLocal:string;durationMinutes:number;disambiguation:Choice};
export type WeeklyInterval={weekday:number;startMinute:number;endMinute:number};
export type ResourceSchedule={resource:Resource;timezone:string;intervals:WeeklyInterval[]};
export type TimeOff={id:string;resourceId:string;startAt:string;endAt:string;active:boolean;version:number};
export type Slot={startAt:string;endAt:string;startLocal:string;endLocal:string;offset:string;disambiguation:Choice};
export const statuses:Record<AppointmentStatus,string>={SCHEDULED:'مجدول',CONFIRMED:'مؤكد',ARRIVED:'حضر',COMPLETED:'مكتمل',CANCELLED:'ملغي',NO_SHOW:'لم يحضر'};
export const transitions:Record<AppointmentStatus,AppointmentStatus[]>={SCHEDULED:['CONFIRMED','ARRIVED','CANCELLED','NO_SHOW'],CONFIRMED:['ARRIVED','CANCELLED','NO_SHOW'],ARRIVED:['COMPLETED'],COMPLETED:[],CANCELLED:[],NO_SHOW:[]};
export const cancellationReasons:Record<string,string>={PATIENT_REQUEST:'طلب المريض',SCHEDULE_CHANGE:'تغيير في الجدول',OTHER:'سبب إداري آخر'};
export function schedulingMessage(e:unknown){return e instanceof Error?e.message:'تعذّر الاتصال. حدّث التقويم قبل إعادة المحاولة.';}
export const appointmentApi=(clinicId:string,csrf:string)=>{
  const base=`clinics/${encodeURIComponent(clinicId)}`;
  return {
    get:<T>(path:string,signal:AbortSignal)=>api<T>(`${base}/${path}`,'GET',undefined,undefined,signal),
    write:<T>(path:string,method:'POST'|'PATCH',body:unknown,signal:AbortSignal)=>api<T>(`${base}/${path}`,method,body,csrf,signal),
  };
};
