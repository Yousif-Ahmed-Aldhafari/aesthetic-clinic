import { api } from '../auth/api';
import type { Resource } from '../appointments/appointment-api';
export type QueueStatus='WAITING'|'CALLED'|'IN_SERVICE'|'COMPLETED'|'CANCELLED'|'ABSENT';
export type QueueTicket={id:string;ticketNumber:string;businessDate:string;status:QueueStatus;version:number;queuedAt:string;calledAt:string|null;recallCount:number;
  doctor:{id:string;label:string};room:{id:string;label:string}|null;patient:{id:string;fullName:string;patientNumber:string};
  visit:{id:string;status:string;source:'WALK_IN'|'APPOINTMENT';appointmentId:string|null;checkedInAt:string;startedAt:string|null;endedAt:string|null}};
export type QueuePage={items:QueueTicket[];hasMore:boolean;nextCursor:string|null;timezone:string;today:string;date:string;revision:string};
export type QueueSettings={timezone:string;today:string;resources:Resource[];configuration:{publicDisplayEnabled:boolean;version:number}};
export const queueLabels:Record<QueueStatus,string>={WAITING:'في الانتظار',CALLED:'تم النداء',IN_SERVICE:'قيد الخدمة',COMPLETED:'مكتمل',CANCELLED:'ملغي',ABSENT:'غائب'};
export const queueApi=(clinicId:string,csrf:string)=>{
  const base=`clinics/${encodeURIComponent(clinicId)}/queue`;
  return {get:<T>(path:string,signal:AbortSignal)=>api<T>(`${base}${path}`,'GET',undefined,undefined,signal),
    write:<T>(path:string,method:'POST'|'PATCH',body:unknown,signal:AbortSignal)=>api<T>(`${base}${path}`,method,body,csrf,signal)};
};
export { queueEvents } from './live-events';
export type PublicBoard={clinic:{slug:string;displayName:string;branding:{logoUrl:string|null;primaryColor:string;secondaryColor:string;accentColor:string|null}|null};timezone:string;items:{ticketNumber:string;businessDate:string;status:'CALLED'|'IN_SERVICE';doctorLabel:string;roomLabel:string|null;calledAt:string;recallCount:number}[]};
