import { api } from '../auth/api';
export type Field={key:string;labelAr:string;labelEn?:string;type:'string'|'integer'|'number'|'boolean'|'date'|'date-time'|'array'|'object'|'observationReferences';required?:boolean;multiline?:boolean;readOnly?:boolean;unit?:string;options?:{value:string;labelAr:string;labelEn?:string}[];multiple?:boolean;fields?:Field[];maxItems?:number;visibleWhen?:{key:string;equals:string|number|boolean}};
export type Presentation={direction:'rtl';sections:{id:string;titleAr:string;titleEn?:string;fields:Field[]}[]};
export type FormVersion={id:string;versionNumber:number;status:'DRAFT'|'PUBLISHED'|'RETIRED';validationSchema:Record<string,unknown>;presentationSchema:Presentation;schemaDigest:string;version:number;publishedAt:string|null};
export type FormDefinition={id:string;stableKey:string;nameAr:string;nameEn:string|null;category:string;specialty:{code:string;arabicName:string;englishName:string};status:string;currentVersion:number;version:number;versions:FormVersion[]};
export type FormResponse={id:string;patientId:string;encounterId:string;formDefinitionId:string;formVersionId:string;status:'DRAFT'|'SUBMITTED'|'FINALIZED'|'AMENDED'|'ENTERED_IN_ERROR';responseData:Record<string,unknown>;contentDigest:string;version:number;createdAt:string;updatedAt:string;definition:{stableKey:string;nameAr:string;nameEn:string|null;category:string};formVersion:FormVersion;author:{user:{name:string}};amendments:{id:string;sequence:number;reason:string;amendedData:Record<string,unknown>;contentDigest:string;createdAt:string}[]};
const root=(clinicId:string)=>`clinics/${clinicId}/clinical/forms`;
export const formsApi={
 definitions:(clinicId:string,signal?:AbortSignal)=>api<{items:FormDefinition[]}>(`${root(clinicId)}/definitions?pageSize=50`,'GET',undefined,undefined,signal),
 install:(clinicId:string,csrf:string,signal?:AbortSignal)=>api<{items:FormDefinition[]}>(`${root(clinicId)}/definitions/install-standard`,'POST',{},csrf,signal),
 publish:(clinicId:string,d:FormDefinition,v:FormVersion,csrf:string,signal?:AbortSignal)=>api<FormDefinition>(`${root(clinicId)}/definitions/${d.id}/versions/${v.id}/publish`,'POST',{expectedVersion:v.version},csrf,signal),
 applicable:(clinicId:string,patientId:string,encounterId:string,signal?:AbortSignal)=>api<{branchId:string;items:FormDefinition[]}>(`${root(clinicId)}/applicable?patientId=${patientId}&encounterId=${encounterId}`,'GET',undefined,undefined,signal),
 listResponses:(clinicId:string,patientId:string,encounterId:string,signal?:AbortSignal)=>api<{items:FormResponse[]}>(`${root(clinicId)}/responses?patientId=${patientId}&encounterId=${encounterId}&pageSize=50`,'GET',undefined,undefined,signal),
 start:(clinicId:string,input:unknown,csrf:string,signal?:AbortSignal)=>api<FormResponse>(`${root(clinicId)}/responses`,'POST',input,csrf,signal),
 save:(clinicId:string,id:string,expectedVersion:number,responseData:Record<string,unknown>,csrf:string,signal?:AbortSignal)=>api<FormResponse>(`${root(clinicId)}/responses/${id}`,'PATCH',{expectedVersion,responseData},csrf,signal),
 submit:(clinicId:string,id:string,expectedVersion:number,responseData:Record<string,unknown>,csrf:string,signal?:AbortSignal)=>api<FormResponse>(`${root(clinicId)}/responses/${id}/submit`,'POST',{expectedVersion,responseData},csrf,signal),
 finalize:(clinicId:string,id:string,expectedVersion:number,csrf:string,signal?:AbortSignal)=>api<FormResponse>(`${root(clinicId)}/responses/${id}/finalize`,'POST',{expectedVersion},csrf,signal),
 amend:(clinicId:string,id:string,expectedVersion:number,reason:string,responseData:Record<string,unknown>,csrf:string,signal?:AbortSignal)=>api<FormResponse>(`${root(clinicId)}/responses/${id}/amendments`,'POST',{expectedVersion,reason,responseData},csrf,signal),
};
