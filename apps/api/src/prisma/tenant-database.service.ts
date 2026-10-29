import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isUUID } from 'class-validator';
import type { Prisma, ClinicRole } from '../generated/prisma/client.js';
import type { Environment } from '../config/environment.js';
import { authorizationHash, equal } from '../auth/crypto.js';
import { AuthError } from '../auth/auth-error.js';
import { permissionsFor, type Permission } from '../auth/permissions.js';
import { IdentityDatabase } from './identity.database.js';
import { PrismaService } from './prisma.service.js';
import { VerifiedSessions, type VerifiedPrincipal } from './verified-sessions.js';

// Feature callbacks receive only tenant delegates, never raw SQL/global identity.
export type TenantTransaction = Pick<Prisma.TransactionClient,'clinic'|'clinicBranding'|'clinicDomain'|'clinicMembership'|'patient'|'patientCounter'|'clinicService'|'bookableResource'|'resourceAvailability'|'resourceTimeOff'|'schedulingState'|'appointment'|'visit'|'queueTicket'|'queueCounter'|'queueConfiguration'|'queueCommand'|'invoice'|'invoiceLine'|'payment'|'paymentReversal'|'financialAuditEvent'|'clinicInvoiceCounter'|'clinicBillingProfile'|'clinicAsset'|'clinicIdentityState'|'clinicIdentityAuditEvent'|'clinicSlugReservation'|'auditEvent'|'privacyRequest'|'patientExport'|'retentionPolicy'|'clinicalEncounter'|'clinicalNote'|'clinicalNoteAmendment'|'medicalHistory'> & {identityLocks:()=>Promise<{currencyLocked:boolean;timezoneLocked:boolean}>};
export type TenantContext={userId:string;membershipId:string;clinicId:string;role:ClinicRole;permissions:readonly Permission[];slug:string;displayName:string};
@Injectable()
export class TenantDatabaseService {
  constructor(private readonly prisma:PrismaService,private readonly identity:IdentityDatabase,
    private readonly verified:VerifiedSessions,private readonly config:ConfigService<Environment,true>) {}
  async withClinicContext<T>(proof:VerifiedPrincipal,clinicId:string,required:readonly Permission[],work:(tx:TenantTransaction,context:TenantContext)=>Promise<T>,options:{isolationLevel?:Prisma.TransactionIsolationLevel;identityWrite?:boolean}={}):Promise<T> {
    const principal=this.verified.require(proof);
    if(!isUUID(clinicId) || !required.length)throw new ForbiddenException();
    return this.prisma.$transaction(async tx=>{
      await this.prisma.assertRuntimeRole(tx);
      const session=await tx.session.findUnique({where:{id:principal.sessionId}});
      const user=await this.identity.loadUser(tx,principal.userId);
      const now=new Date();
      if(!session || !user || session.userId!==user.id || session.revokedAt || session.expiresAt<=now || user.status!=='ACTIVE' ||
        now.getTime()-session.lastSeenAt.getTime()>this.config.get('AUTH_IDLE_MINUTES',{infer:true})*60000 ||
        !equal(session.authorizationHash,authorizationHash(user)))throw new AuthError('SESSION_EXPIRED');
      const membership=user.memberships.find(m=>m.clinicId===clinicId && m.status==='ACTIVE' && m.clinic.status==='ACTIVE');
      if(!membership)throw new NotFoundException();
      const permissions=permissionsFor(membership.role);
      if(session.selectedClinicId!==clinicId || !required.every(p=>permissions.includes(p)))throw new ForbiddenException();
      // Values originate from verified identity and the fresh membership lookup.
      // true makes every value transaction-local on this same pooled connection.
      await tx.$queryRaw`SELECT set_config('lamssa.clinic_id',${membership.clinicId},true),
        set_config('lamssa.user_id',${user.id},true),set_config('lamssa.session_id',${session.id},true)`;
      // Shared/exclusive transaction-local advisory locks coordinate metadata
      // changes with every supported scheduling, queue and financial operation.
      if(options.identityWrite)await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'clinic-identity:'+membership.clinicId},0))::text`;
      else await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${'clinic-identity:'+membership.clinicId},0))::text`;
      const context={userId:user.id,membershipId:membership.id,clinicId:membership.clinicId,role:membership.role,permissions,slug:membership.clinic.slug,displayName:membership.clinic.displayName};
      return work({clinic:tx.clinic,clinicBranding:tx.clinicBranding,clinicDomain:tx.clinicDomain,clinicMembership:tx.clinicMembership,patient:tx.patient,patientCounter:tx.patientCounter,clinicService:tx.clinicService,bookableResource:tx.bookableResource,resourceAvailability:tx.resourceAvailability,resourceTimeOff:tx.resourceTimeOff,schedulingState:tx.schedulingState,appointment:tx.appointment,visit:tx.visit,queueTicket:tx.queueTicket,queueCounter:tx.queueCounter,queueConfiguration:tx.queueConfiguration,queueCommand:tx.queueCommand,invoice:tx.invoice,invoiceLine:tx.invoiceLine,payment:tx.payment,paymentReversal:tx.paymentReversal,financialAuditEvent:tx.financialAuditEvent,clinicInvoiceCounter:tx.clinicInvoiceCounter,clinicBillingProfile:tx.clinicBillingProfile,clinicAsset:tx.clinicAsset,clinicIdentityState:tx.clinicIdentityState,clinicIdentityAuditEvent:tx.clinicIdentityAuditEvent,clinicSlugReservation:tx.clinicSlugReservation,auditEvent:tx.auditEvent,privacyRequest:tx.privacyRequest,patientExport:tx.patientExport,retentionPolicy:tx.retentionPolicy,clinicalEncounter:tx.clinicalEncounter,clinicalNote:tx.clinicalNote,clinicalNoteAmendment:tx.clinicalNoteAmendment,medicalHistory:tx.medicalHistory,identityLocks:async()=>{const [flags]=await tx.$queryRaw<{currencyLocked:boolean;timezoneLocked:boolean}[]>`SELECT * FROM lamssa_security.administration_locks(${membership.clinicId}::uuid)`;if(!flags)throw new ForbiddenException();return flags;}},context);
    },{maxWait:5000,timeout:10000,...(options.isolationLevel?{isolationLevel:options.isolationLevel}:{})});
  }
}
