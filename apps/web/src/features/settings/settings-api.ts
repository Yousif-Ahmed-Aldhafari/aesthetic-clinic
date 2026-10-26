import { ApiError } from '../auth/api';
export interface ClinicProfile {displayName:string;englishName:string|null;legalName:string;contactPhone:string|null;contactEmail:string|null;address:string|null;latitude:string|null;longitude:string|null;timezone:string;currency:string;status:string;slug:string;version:number;currencyLocked:boolean;timezoneLocked:boolean;platformHostname:string;routingActive:boolean;reservedSlugs:string[]}
export interface Branding {logoUrl:string|null;faviconUrl:string|null;primaryColor:string;secondaryColor:string;accentColor:string|null;typography:string;logoAssetId:string|null;faviconAssetId:string|null;version:number}
export interface StaffMember {id:string;role:string;status:string;version:number;user:{name:string;email:string;status:string}}
export interface Domain {id:string;hostname:string;verificationStatus:string;version:number;verifiedAt:string|null;challengeExpiresAt:string|null;routingActive:boolean}
export interface DomainChallenge extends Domain {dnsRecord:{name:string;type:string;value:string}}
export interface Page<T>{items:T[];hasMore:boolean;nextCursor:string|null}
export interface AuditEvent{id:string;sequence:number;action:string;targetId:string;eventHash:string;previousHash:string;createdAt:string}
export interface UploadedAsset {id:string;previewUrl:string;mimeType:string;width:number;height:number}
export async function uploadAsset(clinicId:string,purpose:string,file:File,csrf:string,signal:AbortSignal):Promise<UploadedAsset>{
  const body=new FormData();body.append('file',file);
  const response=await fetch(`/api/v1/clinics/${clinicId}/identity/assets/${purpose}`,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'X-CSRF-Token':csrf,Accept:'application/json'},body,signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])});
  const data=await response.json().catch(()=>null);if(!response.ok)throw new ApiError(response.status,data?.error?.code??'UNAVAILABLE',data?.error?.message??'تعذّر رفع الصورة');return data;
}
