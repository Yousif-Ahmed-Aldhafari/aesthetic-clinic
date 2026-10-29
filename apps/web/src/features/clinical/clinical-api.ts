import { api } from '../auth/api';
export type ClinicalContent={chiefComplaint:string;relevantHistory:string;allergies:string[];medications:string[];priorProcedures:string;examination:string;assessment:string;recommendations:string};
export const blankClinical=():ClinicalContent=>({chiefComplaint:'',relevantHistory:'',allergies:[],medications:[],priorProcedures:'',examination:'',assessment:'',recommendations:''});
export type Amendment={id:string;reason:string;content:ClinicalContent;authorMembershipId:string;createdAt:string};
export type ClinicalNote={id:string;status:'DRAFT'|'SIGNED'|'AMENDED';version:number;content:ClinicalContent;signedAt:string|null;createdAt:string;updatedAt:string;amendments:Amendment[]};
export type Encounter={id:string;patientId:string;status:'DRAFT'|'IN_PROGRESS'|'SIGNED'|'AMENDED'|'CLOSED';version:number;clinicianName:string;createdAt:string;updatedAt:string;notes:ClinicalNote[]};
export type MedicalHistory={patientId:string;content:ClinicalContent;version:number;reviewedAt:string|null};
export const clinicalApi=(clinicId:string)=>{const root=`clinics/${encodeURIComponent(clinicId)}/clinical`;return{
  list:(patientId:string,signal:AbortSignal)=>api<{items:Encounter[];nextCursor:string|null}>(`${root}/patients/${patientId}/encounters?pageSize=50`,'GET',undefined,undefined,signal),
  create:(patientId:string,content:ClinicalContent,csrf:string,signal:AbortSignal)=>api<Encounter>(`${root}/encounters`,'POST',{patientId,content},csrf,signal),
  update:(encounterId:string,expectedVersion:number,content:ClinicalContent,csrf:string,signal:AbortSignal)=>api<Encounter>(`${root}/encounters/${encounterId}/note`,'PATCH',{expectedVersion,content},csrf,signal),
  sign:(encounterId:string,expectedVersion:number,csrf:string,signal:AbortSignal)=>api<Encounter>(`${root}/encounters/${encounterId}/sign`,'POST',{expectedVersion},csrf,signal),
  amend:(encounterId:string,reason:string,content:ClinicalContent,csrf:string,signal:AbortSignal)=>api<Encounter>(`${root}/encounters/${encounterId}/amendments`,'POST',{reason,content},csrf,signal),
  history:(patientId:string,signal:AbortSignal)=>api<MedicalHistory>(`${root}/patients/${patientId}/history`,'GET',undefined,undefined,signal),
  saveHistory:(patientId:string,expectedVersion:number,content:ClinicalContent,csrf:string,signal:AbortSignal)=>api<MedicalHistory>(`${root}/patients/${patientId}/history`,'PATCH',{expectedVersion,content},csrf,signal),
};};
