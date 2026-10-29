import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import type { ClinicalListQuery, CreateAmendmentDto, CreateEncounterDto, UpdateClinicalNoteDto, UpdateMedicalHistoryDto, VersionDto } from '../clinical/clinical-input.js';
import type { VerifiedPrincipal } from './verified-sessions.js';
import { TenantDatabaseService, type TenantTransaction } from './tenant-database.service.js';
import { AuditRepository } from './audit.repository.js';

const noteSelect={id:true,status:true,version:true,content:true,signedAt:true,createdAt:true,updatedAt:true,authorMembershipId:true,
  amendments:{select:{id:true,reason:true,content:true,authorMembershipId:true,createdAt:true},orderBy:[{createdAt:'asc' as const},{id:'asc' as const}]}} satisfies Prisma.ClinicalNoteSelect;
const encounterSelect={id:true,patientId:true,clinicianMembershipId:true,visitId:true,appointmentId:true,status:true,version:true,createdAt:true,updatedAt:true,
  clinician:{select:{user:{select:{name:true}}}},notes:{select:noteSelect,orderBy:{createdAt:'asc' as const}}} satisfies Prisma.ClinicalEncounterSelect;
type EncounterRow=Prisma.ClinicalEncounterGetPayload<{select:typeof encounterSelect}>;
const output=(e:EncounterRow)=>({...e,createdAt:e.createdAt.toISOString(),updatedAt:e.updatedAt.toISOString(),clinicianName:e.clinician.user.name,
  notes:e.notes.map(n=>({...n,signedAt:n.signedAt?.toISOString()??null,createdAt:n.createdAt.toISOString(),updatedAt:n.updatedAt.toISOString(),amendments:n.amendments.map(a=>({...a,createdAt:a.createdAt.toISOString()}))}))});
const emptyContent={chiefComplaint:'',relevantHistory:'',allergies:[],medications:[],priorProcedures:'',examination:'',assessment:'',recommendations:''};

@Injectable()
export class ClinicalRepository {
  constructor(private readonly database:TenantDatabaseService,private readonly audit:AuditRepository){}
  list(proof:VerifiedPrincipal,clinicId:string,patientId:string,q:ClinicalListQuery){
    return this.database.withClinicContext(proof,clinicId,['clinical.encounters.read'],async(tx,c)=>{
      const patient=await tx.patient.findFirst({where:{id:patientId,clinicId:c.clinicId},select:{id:true}});if(!patient)throw new NotFoundException();
      const rows=await tx.clinicalEncounter.findMany({where:{clinicId:c.clinicId,patientId,clinicianMembershipId:c.membershipId},select:encounterSelect,orderBy:[{createdAt:'desc'},{id:'desc'}],take:Math.min(q.pageSize,50)+1,...(q.cursor?{cursor:{id:q.cursor},skip:1}:{})});
      const size=Math.min(q.pageSize,50),items=rows.slice(0,size);return{items:items.map(output),nextCursor:rows.length>size?items.at(-1)!.id:null};
    });
  }
  get(proof:VerifiedPrincipal,clinicId:string,id:string){return this.database.withClinicContext(proof,clinicId,['clinical.encounters.read'],async(tx,c)=>{
    const row=await this.owned(tx,c.clinicId,c.membershipId,id);if(!row)throw new NotFoundException();
    await this.safeAudit(tx,c,'clinical.encounter.read',id,{status:row.status});return output(row);
  });}
  create(proof:VerifiedPrincipal,clinicId:string,input:CreateEncounterDto){return this.database.withClinicContext(proof,clinicId,['clinical.encounters.create'],async(tx,c)=>{
    const patient=await tx.patient.findFirst({where:{id:input.patientId,clinicId:c.clinicId,status:'ACTIVE'},select:{id:true}});if(!patient)throw new NotFoundException();
    if(input.visitId){const v=await tx.visit.findFirst({where:{id:input.visitId,clinicId:c.clinicId,patientId:patient.id},select:{appointmentId:true}});if(!v)throw new NotFoundException();if(input.appointmentId&&v.appointmentId!==input.appointmentId)throw new NotFoundException();}
    if(input.appointmentId){const a=await tx.appointment.findFirst({where:{id:input.appointmentId,clinicId:c.clinicId,patientId:patient.id,doctor:{doctorMembershipId:c.membershipId}},select:{id:true}});if(!a)throw new NotFoundException();}
    const created=await tx.clinicalEncounter.create({data:{clinicId:c.clinicId,patientId:patient.id,clinicianMembershipId:c.membershipId,visitId:input.visitId,appointmentId:input.appointmentId,status:'IN_PROGRESS'},select:{id:true}});
    await tx.clinicalNote.create({data:{clinicId:c.clinicId,encounterId:created.id,authorMembershipId:c.membershipId,content:(input.content??emptyContent) as Prisma.InputJsonValue}});
    const row=(await this.owned(tx,c.clinicId,c.membershipId,created.id))!;await this.safeAudit(tx,c,'clinical.encounter.create',row.id,{status:row.status});return output(row);
  });}
  update(proof:VerifiedPrincipal,clinicId:string,id:string,input:UpdateClinicalNoteDto){return this.database.withClinicContext(proof,clinicId,['clinical.encounters.update'],async(tx,c)=>{
    const row=await this.owned(tx,c.clinicId,c.membershipId,id);if(!row)throw new NotFoundException();const note=row.notes[0];if(!note||note.status!=='DRAFT')throw new ConflictException();
    const changed=await tx.clinicalNote.updateMany({where:{id:note.id,clinicId:c.clinicId,authorMembershipId:c.membershipId,status:'DRAFT',version:input.expectedVersion},data:{content:input.content as Prisma.InputJsonValue,version:{increment:1}}});if(changed.count!==1)throw new ConflictException();
    await tx.clinicalEncounter.update({where:{id},data:{version:{increment:1},status:'IN_PROGRESS'}});await this.safeAudit(tx,c,'clinical.note.update',note.id,{version:input.expectedVersion+1});return output((await this.owned(tx,c.clinicId,c.membershipId,id))!);
  });}
  sign(proof:VerifiedPrincipal,clinicId:string,id:string,input:VersionDto){return this.database.withClinicContext(proof,clinicId,['clinical.encounters.sign'],async(tx,c)=>{
    const row=await this.owned(tx,c.clinicId,c.membershipId,id);if(!row)throw new NotFoundException();const note=row.notes[0];if(!note||note.status!=='DRAFT'||row.version!==input.expectedVersion)throw new ConflictException();const now=new Date();
    await tx.clinicalNote.update({where:{id:note.id},data:{status:'SIGNED',signedAt:now,version:{increment:1}}});await tx.clinicalEncounter.update({where:{id},data:{status:'SIGNED',version:{increment:1}}});await this.safeAudit(tx,c,'clinical.note.sign',note.id,{encounterStatus:'SIGNED'});return output((await this.owned(tx,c.clinicId,c.membershipId,id))!);
  });}
  amend(proof:VerifiedPrincipal,clinicId:string,id:string,input:CreateAmendmentDto){return this.database.withClinicContext(proof,clinicId,['clinical.amendments.create'],async(tx,c)=>{
    const row=await this.owned(tx,c.clinicId,c.membershipId,id);if(!row)throw new NotFoundException();const note=row.notes[0];if(!note||!['SIGNED','AMENDED'].includes(note.status))throw new ConflictException();
    await tx.clinicalNoteAmendment.create({data:{clinicId:c.clinicId,noteId:note.id,authorMembershipId:c.membershipId,reason:input.reason.trim(),content:input.content as Prisma.InputJsonValue}});await tx.clinicalNote.update({where:{id:note.id},data:{status:'AMENDED',version:{increment:1}}});await tx.clinicalEncounter.update({where:{id},data:{status:'AMENDED',version:{increment:1}}});await this.safeAudit(tx,c,'clinical.note.amend',note.id,{reasonRecorded:true});return output((await this.owned(tx,c.clinicId,c.membershipId,id))!);
  });}
  history(proof:VerifiedPrincipal,clinicId:string,patientId:string){return this.database.withClinicContext(proof,clinicId,['clinical.history.read'],async(tx,c)=>{
    const patient=await tx.patient.findFirst({where:{id:patientId,clinicId:c.clinicId},select:{id:true}});if(!patient)throw new NotFoundException();const h=await tx.medicalHistory.findUnique({where:{clinicId_patientId:{clinicId:c.clinicId,patientId}}});
    await this.safeAudit(tx,c,'clinical.history.read',patientId,{exists:Boolean(h)});return h?{...h,createdAt:h.createdAt.toISOString(),updatedAt:h.updatedAt.toISOString(),reviewedAt:h.reviewedAt?.toISOString()??null}:{clinicId:c.clinicId,patientId,content:emptyContent,version:0,reviewedByMembershipId:null,reviewedAt:null,createdAt:null,updatedAt:null};
  });}
  updateHistory(proof:VerifiedPrincipal,clinicId:string,patientId:string,input:UpdateMedicalHistoryDto){return this.database.withClinicContext(proof,clinicId,['clinical.history.update'],async(tx,c)=>{
    const patient=await tx.patient.findFirst({where:{id:patientId,clinicId:c.clinicId},select:{id:true}});if(!patient)throw new NotFoundException();const now=new Date();
    if(input.expectedVersion===0){try{await tx.medicalHistory.create({data:{clinicId:c.clinicId,patientId,content:input.content as Prisma.InputJsonValue,reviewedByMembershipId:c.membershipId,reviewedAt:now}});}catch(e){if((e as {code?:string}).code==='P2002')throw new ConflictException();throw e;}}
    else {const changed=await tx.medicalHistory.updateMany({where:{clinicId:c.clinicId,patientId,version:input.expectedVersion},data:{content:input.content as Prisma.InputJsonValue,reviewedByMembershipId:c.membershipId,reviewedAt:now,version:{increment:1}}});if(changed.count!==1)throw new ConflictException();}
    await this.safeAudit(tx,c,'clinical.history.update',patientId,{version:input.expectedVersion+1});const h=await tx.medicalHistory.findUniqueOrThrow({where:{clinicId_patientId:{clinicId:c.clinicId,patientId}}});return{...h,createdAt:h.createdAt.toISOString(),updatedAt:h.updatedAt.toISOString(),reviewedAt:h.reviewedAt?.toISOString()??null};
  });}
  private owned(tx:TenantTransaction,clinicId:string,membershipId:string,id:string){return tx.clinicalEncounter.findFirst({where:{id,clinicId,clinicianMembershipId:membershipId},select:encounterSelect});}
  private safeAudit(tx:TenantTransaction,c:{clinicId:string;userId:string},action:string,targetId:string,metadata:Record<string,unknown>){return this.audit.record({clinicId:c.clinicId,actorId:c.userId,action,category:'CLINICAL',targetType:'ClinicalRecord',targetId,outcome:'SUCCESS',metadata},tx);}
}
