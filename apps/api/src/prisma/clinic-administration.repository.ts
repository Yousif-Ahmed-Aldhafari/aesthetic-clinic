import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client.js';
import type { Permission } from '../auth/permissions.js';
import { permissionsFor } from '../auth/permissions.js';
import type { Environment } from '../config/environment.js';
import type { VerifiedPrincipal } from './verified-sessions.js';
import { TenantDatabaseService, type TenantTransaction, type TenantContext } from './tenant-database.service.js';
import { AuditRepository } from './audit.repository.js';
import { IdentityError } from '../identity/identity-error.js';
import { customHostname, subdomain, validateColors } from '../identity/identity-policy.js';
import type { BrandingInput, IdentityPage, MemberInput, ProfileInput } from '../identity/identity-input.js';
const profileSelect={displayName:true,englishName:true,legalName:true,contactPhone:true,contactEmail:true,address:true,latitude:true,longitude:true,timezone:true,currency:true,status:true,slug:true,version:true} as const;
const brandSelect={logoUrl:true,faviconUrl:true,primaryColor:true,secondaryColor:true,accentColor:true,typography:true,logoAssetId:true,faviconAssetId:true,version:true} as const;
const domainSelect={id:true,hostname:true,verificationStatus:true,isPrimary:true,challengeExpiresAt:true,verifiedAt:true,lastCheckedAt:true,version:true} as const;
const memberSelect={id:true,role:true,status:true,version:true,user:{select:{name:true,email:true,status:true}}} as const;
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
function code(error:unknown,c:string,depth=0):boolean {if(!error||typeof error!=='object'||depth>7)return false;const x=error as Record<string,unknown>;return x.code===c||x.originalCode===c||['cause','meta','driverAdapterError'].some(k=>code(x[k],c,depth+1));}
function databaseError(e:unknown):never {
  if(['P2002','23505','23514','P2034','P2028','40P01'].some(c=>code(e,c)))throw new IdentityError('IDENTITY_CONFLICT');
  if(['P2003','23503'].some(c=>code(e,c)))throw new NotFoundException();
  if(code(e,'42501'))throw new ForbiddenException();throw e;
}
const version=(actual:number,expected:number)=>{if(actual!==expected)throw new IdentityError('IDENTITY_STALE');};
const page=<T extends{id:string}>(rows:T[],size:number)=>({items:rows.slice(0,size),hasMore:rows.length>size,nextCursor:rows.length>size?rows[size-1].id:null});
const domainResponse=(d:Prisma.ClinicDomainGetPayload<{select:typeof domainSelect}>)=>({...d,routingActive:false,challengeExpiresAt:d.challengeExpiresAt?.toISOString()??null,verifiedAt:d.verifiedAt?.toISOString()??null,lastCheckedAt:d.lastCheckedAt?.toISOString()??null});

@Injectable()
export class ClinicAdministrationRepository {
  constructor(
    private readonly database:TenantDatabaseService,
    private readonly config:ConfigService<Environment,true>,
    private readonly auditRepo:AuditRepository,
  ){}
  private write<T>(proof:VerifiedPrincipal,clinicId:string,permission:Permission,work:(tx:TenantTransaction,c:TenantContext)=>Promise<T>){
    return this.database.withClinicContext(proof,clinicId,[permission],work,{identityWrite:true}).catch(databaseError);
  }
  profile(proof:VerifiedPrincipal,clinicId:string){return this.database.withClinicContext(proof,clinicId,['clinic.settings.read'],async(tx,c)=>{
    const row=await tx.clinic.findUniqueOrThrow({where:{id:c.clinicId},select:profileSelect});
    const locks=await tx.identityLocks();
    const reservations=await tx.clinicSlugReservation.findMany({where:{clinicId:c.clinicId},select:{slug:true},orderBy:{createdAt:'asc'},take:20});
    return {...row,reservedSlugs:reservations.map(r=>r.slug),latitude:row.latitude?.toFixed(6)??null,longitude:row.longitude?.toFixed(6)??null,...locks,platformHostname:`${row.slug}.${this.config.get('PLATFORM_BASE_DOMAIN',{infer:true})}`,routingActive:false};
  });}
  updateProfile(proof:VerifiedPrincipal,clinicId:string,input:ProfileInput){return this.write(proof,clinicId,'clinic.settings.update',async(tx,c)=>{
    const old=await tx.clinic.findUniqueOrThrow({where:{id:c.clinicId},select:profileSelect});version(old.version,input.expectedVersion);
    const locks=await tx.identityLocks();
    if((old.currency!==input.currency&&locks.currencyLocked)||(old.timezone!==input.timezone&&locks.timezoneLocked))throw new IdentityError('IDENTITY_LOCKED');
    if((old.currency!==input.currency&&!input.confirmCurrencyChange)||(old.timezone!==input.timezone&&!input.confirmTimezoneChange))throw new IdentityError('IDENTITY_CONFIRM');
    const latitude=input.latitude===undefined?old.latitude:input.latitude,longitude=input.longitude===undefined?old.longitude:input.longitude;
    if((latitude===null)!==(longitude===null))throw new BadRequestException();
    await tx.clinic.update({where:{id:c.clinicId},data:{displayName:input.displayName,englishName:input.englishName,legalName:input.legalName,contactPhone:input.contactPhone,contactEmail:input.contactEmail,address:input.address,latitude:input.latitude,longitude:input.longitude,timezone:input.timezone,currency:input.currency,version:{increment:1}},select:{id:true}});
    await this.auditRepo.record({clinicId:c.clinicId,actorId:c.userId,action:'identity.profile_update',category:'IDENTITY',targetType:'Clinic',targetId:c.clinicId,outcome:'SUCCESS',metadata:{version:old.version+1}},tx);
    return {ok:true};
  });}
  branding(proof:VerifiedPrincipal,clinicId:string){return this.database.withClinicContext(proof,clinicId,['clinic.branding.read'],async(tx,c)=>
    await tx.clinicBranding.findUnique({where:{clinicId:c.clinicId},select:brandSelect})??{logoUrl:null,faviconUrl:null,primaryColor:'#7854D9',secondaryColor:'#F6F8FC',accentColor:null,typography:'TAJAWAL',logoAssetId:null,faviconAssetId:null,version:1});}
  updateBranding(proof:VerifiedPrincipal,clinicId:string,input:BrandingInput){validateColors(input.primaryColor,input.secondaryColor,input.accentColor??null);return this.write(proof,clinicId,'clinic.branding.update',async(tx,c)=>{
    const old=await tx.clinicBranding.findUnique({where:{clinicId:c.clinicId},select:{version:true}});version(old?.version??1,input.expectedVersion);
    for(const [id,purpose]of[[input.logoAssetId,'LOGO'],[input.faviconAssetId,'FAVICON']]as const)if(id&&!await tx.clinicAsset.findFirst({where:{clinicId:c.clinicId,id,purpose},select:{id:true}}))throw new NotFoundException();
    const data={primaryColor:input.primaryColor.toUpperCase(),secondaryColor:input.secondaryColor.toUpperCase(),accentColor:input.accentColor?.toUpperCase()??null,typography:input.typography,logoAssetId:input.logoAssetId,faviconAssetId:input.faviconAssetId};
    const res = await (old?tx.clinicBranding.update({where:{clinicId:c.clinicId},data:{...data,...(input.logoAssetId===null?{logoUrl:null}:{}),...(input.faviconAssetId===null?{faviconUrl:null}:{}),version:{increment:1}},select:brandSelect}):tx.clinicBranding.create({data:{clinicId:c.clinicId,...data},select:brandSelect}));
    await this.auditRepo.record({clinicId:c.clinicId,actorId:c.userId,action:'identity.branding_update',category:'IDENTITY',targetType:'ClinicBranding',targetId:c.clinicId,outcome:'SUCCESS',metadata:{primaryColor:input.primaryColor,secondaryColor:input.secondaryColor}},tx);
    return res;
  });}
  reserve(proof:VerifiedPrincipal,clinicId:string,slug:string,expected:number){const normalized=subdomain(slug);return this.write(proof,clinicId,'clinic.settings.update',async(tx,c)=>{
    const old=await tx.clinic.findUniqueOrThrow({where:{id:c.clinicId},select:{version:true}});version(old.version,expected);
    await tx.clinic.update({where:{id:c.clinicId},data:{slug:normalized,version:{increment:1}},select:{id:true}});return{slug:normalized,hostname:`${normalized}.${this.config.get('PLATFORM_BASE_DOMAIN',{infer:true})}`,routingActive:false};
  });}
  members(proof:VerifiedPrincipal,clinicId:string,q:IdentityPage){return this.database.withClinicContext(proof,clinicId,['staff.read'],async(tx,c)=>{
    if(q.cursor&&!await tx.clinicMembership.findFirst({where:{clinicId:c.clinicId,id:q.cursor},select:{id:true}}))throw new NotFoundException();
    return page(await tx.clinicMembership.findMany({where:{clinicId:c.clinicId,...(q.cursor?{id:{gt:q.cursor}}:{})},select:memberSelect,orderBy:{id:'asc'},take:q.pageSize+1}),q.pageSize);
  });}
  updateMember(proof:VerifiedPrincipal,clinicId:string,id:string,input:MemberInput){
    return this.write(proof,clinicId,'staff.manage',async(tx,c)=>{
      const old=await tx.clinicMembership.findFirst({where:{id,clinicId:c.clinicId},select:memberSelect});if(!old)throw new NotFoundException();version(old.version,input.expectedVersion);
      if(c.role!=='CLINIC_OWNER'&&([old.role,input.role].some(r=>['CLINIC_OWNER','CLINIC_ADMIN','ACCOUNTANT'].includes(r))))throw new ForbiddenException();
      const explicitlyDelegableClinicalRole=input.role==='DOCTOR';
      if(c.role!=='CLINIC_OWNER'&&input.status==='ACTIVE'&&(old.role!==input.role||old.status!=='ACTIVE')&&!explicitlyDelegableClinicalRole&&!permissionsFor(input.role).every(permission=>c.permissions.includes(permission)))throw new ForbiddenException();
      if(old.role==='CLINIC_OWNER'&&(input.role!=='CLINIC_OWNER'||input.status!=='ACTIVE')){
        const activeOwners=await tx.clinicMembership.count({where:{clinicId:c.clinicId,role:'CLINIC_OWNER',status:'ACTIVE'}});
        if(activeOwners<=1)throw new IdentityError('IDENTITY_CONFLICT');
      }
      await this.auditRepo.record({clinicId:c.clinicId,actorId:c.userId,action:old.role!==input.role?'staff.role_change':'staff.status_change',category:'STAFF',targetType:'ClinicMembership',targetId:id,outcome:'SUCCESS',metadata:{previousRole:old.role,nextRole:input.role,previousStatus:old.status,nextStatus:input.status}},tx);
      const result=await tx.clinicMembership.update({
        where:{clinicId_id:{clinicId:c.clinicId,id}},
        data:{role:input.role,status:input.status,version:{increment:1}},
        select:{id:true,role:true,status:true,version:true}
      });
      return {...result,user:old.user,reauthenticationRequired:id===c.membershipId&&(old.role!==input.role||old.status!==input.status)};
    });
  }
  domains(proof:VerifiedPrincipal,clinicId:string){return this.database.withClinicContext(proof,clinicId,['clinic.settings.read'],async(tx,c)=>({items:(await tx.clinicDomain.findMany({where:{clinicId:c.clinicId},select:domainSelect,orderBy:{id:'asc'},take:20})).map(domainResponse)}));}
  createDomain(proof:VerifiedPrincipal,clinicId:string,hostname:string){const normalized=customHostname(hostname,this.config.get('PLATFORM_BASE_DOMAIN',{infer:true}));return this.write(proof,clinicId,'clinic.settings.update',async(tx,c)=>{
    if(await tx.clinicDomain.count({where:{clinicId:c.clinicId}})>=10)throw new IdentityError('IDENTITY_CONFLICT');
    const token=randomBytes(32).toString('base64url');const row=await tx.clinicDomain.create({data:{clinicId:c.clinicId,hostname:normalized,challengeHash:digest(token),challengeExpiresAt:new Date(Date.now()+7*86400000)},select:domainSelect});
    await this.auditRepo.record({clinicId:c.clinicId,actorId:c.userId,action:'identity.domain_request',category:'IDENTITY',targetType:'ClinicDomain',targetId:row.id,outcome:'SUCCESS',metadata:{hostname:normalized}},tx);
    return {...domainResponse(row),dnsRecord:{name:`_lamssa-verification.${normalized}`,type:'TXT',value:`lamssa-verification=${token}`}};
  });}
  rotateChallenge(proof:VerifiedPrincipal,clinicId:string,id:string,expected:number){return this.write(proof,clinicId,'clinic.settings.update',async(tx,c)=>{
    const old=await tx.clinicDomain.findFirst({where:{clinicId:c.clinicId,id},select:domainSelect});if(!old)throw new NotFoundException();version(old.version,expected);customHostname(old.hostname,this.config.get('PLATFORM_BASE_DOMAIN',{infer:true}));
    const token=randomBytes(32).toString('base64url');const row=await tx.clinicDomain.update({where:{clinicId_id:{clinicId:c.clinicId,id}},data:{challengeHash:digest(token),challengeExpiresAt:new Date(Date.now()+7*86400000),verificationStatus:'PENDING',verifiedAt:null,lastCheckedAt:null,version:{increment:1}},select:domainSelect});
    return {...domainResponse(row),dnsRecord:{name:`_lamssa-verification.${old.hostname}`,type:'TXT',value:`lamssa-verification=${token}`}};
  });}
  beginVerification(proof:VerifiedPrincipal,clinicId:string,id:string,expected:number){return this.write(proof,clinicId,'clinic.settings.update',async(tx,c)=>{
    const old=await tx.clinicDomain.findFirst({where:{clinicId:c.clinicId,id}});if(!old)throw new NotFoundException();version(old.version,expected);customHostname(old.hostname,this.config.get('PLATFORM_BASE_DOMAIN',{infer:true}));
    if(!old.challengeHash||!old.challengeExpiresAt||old.challengeExpiresAt<=new Date()||(old.lastCheckedAt&&Date.now()-old.lastCheckedAt.getTime()<30000))throw new IdentityError('DOMAIN_WAIT');
    await tx.clinicDomain.update({where:{clinicId_id:{clinicId:c.clinicId,id}},data:{lastCheckedAt:new Date(),version:{increment:1}},select:{id:true}});
    return {hostname:old.hostname,challengeHash:old.challengeHash,version:old.version+1};
  });}
  finishVerification(proof:VerifiedPrincipal,clinicId:string,id:string,expected:number,verified:boolean){return this.write(proof,clinicId,'clinic.settings.update',async(tx,c)=>{
    const old=await tx.clinicDomain.findFirst({where:{clinicId:c.clinicId,id},select:{version:true}});if(!old)throw new NotFoundException();version(old.version,expected);
    const updated = await tx.clinicDomain.update({where:{clinicId_id:{clinicId:c.clinicId,id}},data:{verificationStatus:verified?'VERIFIED':'FAILED',verifiedAt:verified?new Date():null,version:{increment:1}},select:domainSelect});
    await this.auditRepo.record({clinicId:c.clinicId,actorId:c.userId,action:'identity.domain_verify',category:'IDENTITY',targetType:'ClinicDomain',targetId:id,outcome:'SUCCESS',metadata:{verified}},tx);
    return domainResponse(updated);
  });}
  assetCreate(proof:VerifiedPrincipal,clinicId:string,data:Omit<Prisma.ClinicAssetUncheckedCreateInput,'clinicId'>){return this.write(proof,clinicId,'clinic.branding.update',async(tx,c)=>{
    const usage=await tx.clinicAsset.aggregate({where:{clinicId:c.clinicId},_count:{id:true},_sum:{byteSize:true}});
    if(usage._count.id>=200||(usage._sum.byteSize??0)+(data.byteSize as number)>50*1024*1024||await tx.clinicAsset.count({where:{clinicId:c.clinicId,publishedAt:null}})>=20)throw new IdentityError('ASSET_LIMIT');
    const row=await tx.clinicAsset.create({data:{...data,clinicId:c.clinicId},select:{id:true,purpose:true,mimeType:true,width:true,height:true}});return {...row,previewUrl:`/api/v1/clinics/${c.clinicId}/identity/assets/${row.id}`};
  });}
  asset(proof:VerifiedPrincipal,clinicId:string,id:string){return this.database.withClinicContext(proof,clinicId,['clinic.branding.update'],async(tx,c)=>{
    const row=await tx.clinicAsset.findFirst({where:{id,clinicId:c.clinicId},select:{storageKey:true,mimeType:true,sha256:true}});if(!row)throw new NotFoundException();return row;
  });}
  cleanup(proof:VerifiedPrincipal,clinicId:string){return this.write(proof,clinicId,'clinic.branding.update',async(tx,c)=>{
    const rows=await tx.clinicAsset.findMany({where:{clinicId:c.clinicId,publishedAt:null,createdAt:{lt:new Date(Date.now()-86400000)}},select:{id:true,storageKey:true},take:20});
    await tx.clinicAsset.deleteMany({where:{clinicId:c.clinicId,id:{in:rows.map(r=>r.id)}}});return rows;
  });}
  audit(proof:VerifiedPrincipal,clinicId:string,q:IdentityPage){return this.database.withClinicContext(proof,clinicId,['clinic.settings.read'],async(tx,c)=>{
    let sequence:number|undefined;if(q.cursor){const row=await tx.clinicIdentityAuditEvent.findFirst({where:{id:q.cursor,clinicId:c.clinicId},select:{sequence:true}});if(!row)throw new NotFoundException();sequence=row.sequence;}
    const rows=await tx.clinicIdentityAuditEvent.findMany({where:{clinicId:c.clinicId,...(sequence?{sequence:{lt:sequence}}:{})},select:{id:true,sequence:true,action:true,targetId:true,eventHash:true,previousHash:true,createdAt:true},orderBy:{sequence:'desc'},take:q.pageSize+1});return page(rows.map(r=>({...r,createdAt:r.createdAt.toISOString()})),q.pageSize);
  });}
}
