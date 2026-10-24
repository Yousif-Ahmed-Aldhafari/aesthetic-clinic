import { api } from '../auth/api';
export type PatientGender='FEMALE'|'MALE'|'OTHER'|'UNDISCLOSED';
export type PatientStatus='ACTIVE'|'INACTIVE';
export interface PatientRecord {
  id:string;patientNumber:string;fullName:string;phone:string|null;email:string|null;
  dateOfBirth:string|null;gender:PatientGender|null;status:PatientStatus;version:number;
  createdAt:string;updatedAt:string;
}
export interface PatientInput {fullName:string;phone:string|null;email:string|null;dateOfBirth:string|null;gender:PatientGender|null}
export interface PatientPage {items:PatientRecord[];pageSize:number;hasMore:boolean;nextCursor:string|null}
export const patientApi=(clinicId:string)=>{
  const path=`clinics/${encodeURIComponent(clinicId)}/patients`;
  return {
    list:(search:URLSearchParams,signal:AbortSignal)=>api<PatientPage>(`${path}?${search}`,'GET',undefined,undefined,signal),
    get:(id:string,signal:AbortSignal)=>api<PatientRecord>(`${path}/${encodeURIComponent(id)}`,'GET',undefined,undefined,signal),
    create:(input:PatientInput,csrf:string,signal:AbortSignal)=>api<PatientRecord>(path,'POST',input,csrf,signal),
    update:(p:PatientRecord,input:PatientInput,csrf:string,signal:AbortSignal)=>api<PatientRecord>(`${path}/${p.id}`,'PATCH',{...input,expectedVersion:p.version},csrf,signal),
    status:(p:PatientRecord,status:PatientStatus,csrf:string,signal:AbortSignal)=>api<PatientRecord>(`${path}/${p.id}/status`,'PATCH',{status,expectedVersion:p.version},csrf,signal),
  };
};
