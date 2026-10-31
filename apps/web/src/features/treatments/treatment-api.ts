import { api } from '../auth/api';
export type Catalog={id:string;nameAr:string;nameEn:string|null;category:string;description:string|null;requirements:string|null;defaultDurationMinutes:number|null;active:boolean;version:number};
export type PlanItem={id:string;sessionOrder:number;targetAt:string|null;expectedDurationMinutes:number;clinicianInstructions:string|null;version:number;procedureCatalog:Catalog;executions:{id:string;status:string;version:number}[]};
export type Revision={id:string;revisionNumber:number;status:'DRAFT'|'APPROVED';title:string;clinicalPurpose:string;indications:string|null;objectives:string|null;preparationInstructions:string|null;aftercareInstructions:string|null;revisionReason:string|null;version:number;approvedAt:string|null;items:PlanItem[]};
export type Plan={id:string;patientId:string;status:'DRAFT'|'ACTIVE'|'PAUSED'|'COMPLETED'|'CANCELLED';currentRevisionNumber:number;version:number;createdAt:string;clinician:{user:{name:string}};revisions:Revision[]};
export type PlanText={title:string;clinicalPurpose:string;indications?:string;objectives?:string;preparationInstructions?:string;aftercareInstructions?:string};
export const treatmentApi=(clinicId:string)=>{const root=`clinics/${encodeURIComponent(clinicId)}/clinical`;return{
 list:(patientId:string,signal:AbortSignal)=>api<{items:Plan[];nextCursor:string|null}>(`${root}/patients/${patientId}/treatment-plans?pageSize=50`,'GET',undefined,undefined,signal),
 catalog:(signal:AbortSignal)=>api<Catalog[]>(`${root}/procedure-catalog`,'GET',undefined,undefined,signal),
 createCatalog:(body:Omit<Catalog,'id'|'active'|'version'|'nameEn'|'description'|'requirements'|'defaultDurationMinutes'>&Partial<Pick<Catalog,'nameEn'|'description'|'requirements'|'defaultDurationMinutes'>>,csrf:string,signal:AbortSignal)=>api<Catalog>(`${root}/procedure-catalog`,'POST',body,csrf,signal),
 create:(patientId:string,body:PlanText,csrf:string,signal:AbortSignal)=>api<Plan>(`${root}/treatment-plans`,'POST',{patientId,...body},csrf,signal),
 update:(id:string,expectedVersion:number,body:PlanText,csrf:string,signal:AbortSignal)=>api<Plan>(`${root}/treatment-plans/${id}/draft`,'PATCH',{expectedVersion,...body},csrf,signal),
 addItem:(id:string,body:{procedureCatalogId:string;sessionOrder:number;expectedDurationMinutes:number;clinicianInstructions?:string},csrf:string,signal:AbortSignal)=>api<Plan>(`${root}/treatment-plans/${id}/items`,'POST',body,csrf,signal),
 approve:(id:string,expectedVersion:number,csrf:string,signal:AbortSignal)=>api<Plan>(`${root}/treatment-plans/${id}/approve`,'POST',{expectedVersion},csrf,signal),
 revise:(id:string,expectedVersion:number,reason:string,csrf:string,signal:AbortSignal)=>api<Plan>(`${root}/treatment-plans/${id}/revisions`,'POST',{expectedVersion,reason},csrf,signal),
 execution:(itemId:string,csrf:string,signal:AbortSignal)=>api<{id:string;status:string;consentEligible:boolean;consentReason:string}>(`${root}/procedure-executions`,'POST',{treatmentPlanItemId:itemId},csrf,signal),
 eligibility:(executionId:string,signal:AbortSignal)=>api<{eligible:boolean;status:string;reason:string;consent?:any}>(`${root}/procedure-executions/${executionId}/eligibility`,'GET',undefined,undefined,signal),
 perform:(executionId:string,expectedVersion:number,csrf:string,signal:AbortSignal)=>api(`${root}/procedure-executions/${executionId}/status`,'PATCH',{expectedVersion,status:'PERFORMED'},csrf,signal),
};};
