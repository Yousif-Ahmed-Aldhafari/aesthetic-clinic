import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client.js';
import type { Permission } from '../auth/permissions.js';
import type { VerifiedPrincipal } from './verified-sessions.js';
import { TenantDatabaseService, type TenantContext, type TenantTransaction } from './tenant-database.service.js';
import { BillingError } from '../billing/billing-error.js';

export function canonical(value:unknown):string {
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value!==null&&typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
  return JSON.stringify(typeof value==='bigint'?value.toString():value);
}
export const financialHash=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex');
export async function financialWrite<T>(database:TenantDatabaseService,proof:VerifiedPrincipal,clinicId:string,permissions:readonly Permission[],work:(tx:TenantTransaction,c:TenantContext)=>Promise<T>){
  try{return await database.withClinicContext(proof,clinicId,permissions,async(tx,c)=>{
    if (permissions.some(p => ['invoices.create', 'invoices.issue', 'invoices.manage', 'payments.record', 'payments.reverse'].includes(p))) {
      await tx.clinicInvoiceCounter.upsert({where:{clinicId:c.clinicId},create:{clinicId:c.clinicId},update:{revision:{increment:1}},select:{clinicId:true}});
    }
    return work(tx,c);
  });}catch(error){
    const has=(v:unknown,code:string,depth=0):boolean=>Boolean(v&&typeof v==='object'&&depth<8&&((v as Record<string,unknown>).code===code||(v as Record<string,unknown>).originalCode===code||['cause','meta','driverAdapterError'].some(k=>has((v as Record<string,unknown>)[k],code,depth+1))));
    if(['P2002','23505','P2034','P2028','40P01'].some(code=>has(error,code)))throw new BillingError('BILLING_BUSY');
    if(['P2003','23503'].some(code=>has(error,code)))throw new NotFoundException();
    if(has(error,'23514'))throw new BadRequestException();
    throw error;
  }
}
export const lineSelect={position:true,serviceName:true,description:true,quantityMilli:true,unitPriceMinor:true,grossMinor:true,discountMinor:true,taxBasisPoints:true,taxMinor:true,totalMinor:true} as const;
export const invoiceSelect={id:true,patientId:true,visitId:true,number:true,currency:true,currencyScale:true,status:true,subtotalMinor:true,discountMinor:true,taxMinor:true,totalMinor:true,netPaidMinor:true,patientName:true,patientNumber:true,issuerSnapshot:true,issuedAt:true,voidedAt:true,voidReason:true,version:true,createdAt:true,updatedAt:true} as const;
export const detailSelect={...invoiceSelect,lines:{select:lineSelect,orderBy:{position:'asc' as const},take:50}} satisfies Prisma.InvoiceSelect;
export type InvoiceRow=Prisma.InvoiceGetPayload<{select:typeof invoiceSelect}>;
export function invoiceResponse(row:InvoiceRow){return {
  id:row.id,patientId:row.patientId,visitId:row.visitId,number:row.number,currency:row.currency,currencyScale:row.currencyScale,status:row.status,
  subtotalMinor:row.subtotalMinor.toString(),discountMinor:row.discountMinor.toString(),taxMinor:row.taxMinor.toString(),totalMinor:row.totalMinor.toString(),netPaidMinor:row.netPaidMinor.toString(),balanceMinor:(row.status==='VOID'?0n:row.totalMinor-row.netPaidMinor).toString(),
  patientName:row.patientName,patientNumber:row.patientNumber,issuer:row.issuerSnapshot,issuedAt:row.issuedAt?.toISOString()??null,voidedAt:row.voidedAt?.toISOString()??null,voidReason:row.voidReason,version:row.version,createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString(),
};}
export async function invoiceDetail(tx:TenantTransaction,clinicId:string,id:string){
  const row=await tx.invoice.findFirst({where:{clinicId,id},select:detailSelect});if(!row)throw new NotFoundException();
  return {...invoiceResponse(row),lines:row.lines.map(l=>({...l,unitPriceMinor:l.unitPriceMinor.toString(),grossMinor:l.grossMinor.toString(),discountMinor:l.discountMinor.toString(),taxMinor:l.taxMinor.toString(),totalMinor:l.totalMinor.toString()}))};
}
export async function invoice(tx:TenantTransaction,clinicId:string,id:string,version?:number){
  const row=await tx.invoice.findFirst({where:{clinicId,id}});if(!row)throw new NotFoundException();
  if(version!==undefined&&row.version!==version)throw new BillingError('BILLING_STALE');return row;
}
export const paidStatus=(paid:bigint,total:bigint)=>paid===0n?'ISSUED' as const:paid===total?'PAID' as const:'PARTIALLY_PAID' as const;
export async function audit(tx:TenantTransaction,c:TenantContext,action:string,invoiceId:string|null,invoiceVersion:number|null,details:Record<string,unknown>){
  const last=await tx.financialAuditEvent.findFirst({where:{clinicId:c.clinicId},orderBy:{sequence:'desc'},select:{sequence:true,eventHash:true}});
  const id=randomUUID(),sequence=(last?.sequence??0)+1,previousHash=last?.eventHash??'0'.repeat(64),at=new Date();
  const payload=canonical({id,clinicId:c.clinicId,invoiceId,actorMembershipId:c.membershipId,sequence,action,at:at.toISOString(),invoiceVersion,details});
  const eventHash=createHash('sha256').update(previousHash+'\n'+payload).digest('hex');
  await tx.financialAuditEvent.create({data:{id,clinicId:c.clinicId,invoiceId,actorMembershipId:c.membershipId,sequence,action,payload,previousHash,eventHash,createdAt:at}});
}
export const paymentSelect={id:true,invoiceId:true,amountMinor:true,currency:true,currencyScale:true,method:true,createdAt:true,reversals:{select:{id:true,kind:true,reason:true,amountMinor:true,createdAt:true},orderBy:[{createdAt:'asc' as const},{id:'asc' as const}],take:100}} satisfies Prisma.PaymentSelect;
export function paymentResponse(p:Prisma.PaymentGetPayload<{select:typeof paymentSelect}>){
  const refunded=p.reversals.reduce((n,r)=>n+r.amountMinor,0n);
  return {id:p.id,invoiceId:p.invoiceId,receiptNumber:'PAY-'+p.id.toUpperCase(),amountMinor:p.amountMinor.toString(),currency:p.currency,currencyScale:p.currencyScale,method:p.method,createdAt:p.createdAt.toISOString(),refundedMinor:refunded.toString(),refundableMinor:(p.amountMinor-refunded).toString(),reversals:p.reversals.map(r=>({id:r.id,kind:r.kind,reason:r.reason,amountMinor:r.amountMinor.toString(),createdAt:r.createdAt.toISOString()}))};
}

export function packageVersionResponse(v: any) {
  return {
    id: v.id,
    packageId: v.packageId,
    versionNumber: v.versionNumber,
    nameAr: v.nameAr,
    nameEn: v.nameEn,
    description: v.description,
    terms: v.terms,
    priceMinor: v.priceMinor.toString(),
    currency: v.currency,
    currencyScale: v.currencyScale,
    validityDays: v.validityDays,
    isPublished: v.isPublished,
    publishedAt: v.publishedAt?.toISOString() ?? null,
    publishedByMembershipId: v.publishedByMembershipId,
    notes: v.notes,
    createdAt: v.createdAt.toISOString(),
    items: v.items ? v.items.map((i: any) => ({
      id: i.id,
      procedureId: i.procedureId,
      serviceName: i.serviceName,
      sessionQuantity: i.sessionQuantity,
      notes: i.notes,
      procedure: i.procedure ? { id: i.procedure.id, nameAr: i.procedure.nameAr } : null,
    })) : undefined,
  };
}

export function packageResponse(pkg: any) {
  return {
    id: pkg.id,
    code: pkg.code,
    nameAr: pkg.nameAr,
    nameEn: pkg.nameEn,
    description: pkg.description,
    status: pkg.status,
    currentVersionId: pkg.currentVersionId,
    version: pkg.version,
    createdAt: pkg.createdAt.toISOString(),
    updatedAt: pkg.updatedAt.toISOString(),
    currentVersion: pkg.currentVersion ? packageVersionResponse(pkg.currentVersion) : (pkg.versions && pkg.versions.length ? packageVersionResponse(pkg.versions[0]) : null),
    versions: pkg.versions ? pkg.versions.map(packageVersionResponse) : undefined,
  };
}

export function redemptionResponse(r: any) {
  return {
    id: r.id,
    patientPackageId: r.patientPackageId,
    entitlementId: r.entitlementId,
    patientId: r.patientId,
    procedureExecutionId: r.procedureExecutionId,
    appointmentId: r.appointmentId,
    visitId: r.visitId,
    sessionsRedeemed: r.sessionsRedeemed,
    status: r.status,
    redeemedAt: r.redeemedAt.toISOString(),
    redeemedByMembershipId: r.redeemedByMembershipId,
    notes: r.notes,
    reversals: r.reversals ? r.reversals.map((rev: any) => ({
      id: rev.id,
      reason: rev.reason,
      reversedAt: rev.reversedAt.toISOString(),
      reversedByMembershipId: rev.reversedByMembershipId,
    })) : undefined,
  };
}

export function patientPackageResponse(pp: any) {
  return {
    id: pp.id,
    patientId: pp.patientId,
    packageId: pp.packageId,
    packageVersionId: pp.packageVersionId,
    invoiceId: pp.invoiceId,
    status: pp.status,
    activationPolicy: pp.activationPolicy,
    purchasedAt: pp.purchasedAt.toISOString(),
    activatedAt: pp.activatedAt?.toISOString() ?? null,
    expiresAt: pp.expiresAt?.toISOString() ?? null,
    totalSessions: pp.totalSessions,
    redeemedSessions: pp.redeemedSessions,
    remainingSessions: pp.remainingSessions,
    version: pp.version,
    notes: pp.notes,
    createdAt: pp.createdAt.toISOString(),
    patient: pp.patient ? { id: pp.patient.id, fullName: pp.patient.fullName, patientNumber: pp.patient.patientNumber } : undefined,
    package: pp.package ? { id: pp.package.id, code: pp.package.code, nameAr: pp.package.nameAr } : undefined,
    packageVersion: pp.packageVersion ? packageVersionResponse(pp.packageVersion) : undefined,
    entitlements: pp.entitlements ? pp.entitlements.map((e: any) => ({
      id: e.id,
      packageItemId: e.packageItemId,
      procedureId: e.procedureId,
      serviceName: e.serviceName,
      totalSessions: e.totalSessions,
      redeemedSessions: e.redeemedSessions,
      reservedSessions: e.reservedSessions,
      remainingSessions: e.remainingSessions,
      procedure: e.procedure ? { id: e.procedure.id, nameAr: e.procedure.nameAr } : null,
    })) : undefined,
    redemptions: pp.redemptions ? pp.redemptions.map(redemptionResponse) : undefined,
  };
}

export function installmentPlanResponse(plan: any) {
  return {
    id: plan.id,
    patientId: plan.patientId,
    invoiceId: plan.invoiceId,
    patientPackageId: plan.patientPackageId,
    planNumber: plan.planNumber,
    totalAmountMinor: plan.totalAmountMinor.toString(),
    paidAmountMinor: plan.paidAmountMinor.toString(),
    remainingAmountMinor: plan.remainingAmountMinor.toString(),
    currency: plan.currency,
    currencyScale: plan.currencyScale,
    numberOfInstallments: plan.numberOfInstallments,
    status: plan.status,
    notes: plan.notes,
    version: plan.version,
    createdAt: plan.createdAt.toISOString(),
    patient: plan.patient ? { id: plan.patient.id, fullName: plan.patient.fullName, patientNumber: plan.patient.patientNumber } : undefined,
    invoice: plan.invoice ? { id: plan.invoice.id, number: plan.invoice.number, totalMinor: plan.invoice.totalMinor.toString(), netPaidMinor: plan.invoice.netPaidMinor.toString() } : undefined,
    schedules: plan.schedules ? plan.schedules.map((s: any) => ({
      id: s.id,
      installmentNumber: s.installmentNumber,
      dueDate: s.dueDate.toISOString().slice(0, 10),
      expectedAmountMinor: s.expectedAmountMinor.toString(),
      paidAmountMinor: s.paidAmountMinor.toString(),
      remainingAmountMinor: (s.expectedAmountMinor - s.paidAmountMinor).toString(),
      status: s.status,
      paidAt: s.paidAt?.toISOString() ?? null,
      allocations: s.allocations ? s.allocations.map((a: any) => ({
        id: a.id,
        paymentId: a.paymentId,
        allocatedMinor: a.allocatedMinor.toString(),
        allocatedAt: a.allocatedAt.toISOString(),
        notes: a.notes,
      })) : undefined,
    })) : undefined,
  };
}

export function refundRequestResponse(r: any) {
  return {
    id: r.id,
    invoiceId: r.invoiceId,
    patientId: r.patientId,
    patientPackageId: r.patientPackageId,
    amountMinor: r.requestedAmountMinor.toString(),
    requestedAmountMinor: r.requestedAmountMinor.toString(),
    currency: r.currency,
    currencyScale: r.currencyScale,
    reason: r.reason,
    reasonDetails: r.reasonDetails,
    status: r.status,
    requestedByMembershipId: r.requestedByMembershipId,
    approvedByMembershipId: r.approvedByMembershipId,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    rejectedByMembershipId: r.rejectedByMembershipId,
    rejectedAt: r.rejectedAt?.toISOString() ?? null,
    rejectionReason: r.rejectionReason,
    settledAt: r.settledAt?.toISOString() ?? null,
    settledByMembershipId: r.settledByMembershipId,
    settlementReference: r.settlementReference,
    paymentReversalId: r.paymentReversalId,
    version: r.version,
    createdAt: r.createdAt.toISOString(),
    patient: r.patient ? { id: r.patient.id, fullName: r.patient.fullName, patientNumber: r.patient.patientNumber } : undefined,
    invoice: r.invoice ? { id: r.invoice.id, number: r.invoice.number, totalMinor: r.invoice.totalMinor.toString(), netPaidMinor: r.invoice.netPaidMinor.toString() } : undefined,
  };
}

export async function packageDetail(tx: TenantTransaction, clinicId: string, id: string) {
  const pkg = await tx.treatmentPackage.findFirst({
    where: { clinicId, id },
    include: {
      versions: {
        where: { clinicId },
        orderBy: { versionNumber: 'desc' },
        include: { items: { include: { procedure: { select: { id: true, nameAr: true } } } } },
      },
    },
  });
  if (!pkg) throw new NotFoundException('PACKAGE_NOT_FOUND');
  return packageResponse(pkg);
}

export async function patientPackageDetail(tx: TenantTransaction, clinicId: string, id: string) {
  const row = await tx.patientPackage.findFirst({
    where: { clinicId, id },
    include: {
      patient: { select: { id: true, fullName: true, patientNumber: true } },
      package: { select: { id: true, code: true, nameAr: true } },
      packageVersion: { include: { items: { include: { procedure: { select: { id: true, nameAr: true } } } } } },
      entitlements: {
        include: { procedure: { select: { id: true, nameAr: true } } },
        orderBy: { id: 'asc' },
      },
      redemptions: {
        include: {
          entitlement: { select: { serviceName: true } },
          reversals: true,
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!row) throw new NotFoundException('PATIENT_PACKAGE_NOT_FOUND');
  return patientPackageResponse(row);
}

export async function installmentPlanDetail(tx: TenantTransaction, clinicId: string, id: string) {
  const row = await tx.installmentPlan.findFirst({
    where: { clinicId, id },
    include: {
      patient: { select: { id: true, fullName: true, patientNumber: true } },
      invoice: { select: { id: true, number: true, totalMinor: true, netPaidMinor: true } },
      schedules: {
        orderBy: { installmentNumber: 'asc' },
        include: {
          allocations: {
            include: { payment: { select: { id: true, method: true, amountMinor: true } } },
          },
        },
      },
    },
  });
  if (!row) throw new NotFoundException('INSTALLMENT_PLAN_NOT_FOUND');
  return installmentPlanResponse(row);
}

export async function refundRequestDetail(tx: TenantTransaction, clinicId: string, id: string) {
  const row = await tx.refundRequest.findFirst({
    where: { clinicId, id },
    include: {
      invoice: { select: { id: true, number: true, totalMinor: true, netPaidMinor: true } },
      patient: { select: { id: true, fullName: true, patientNumber: true } },
      patientPackage: { select: { id: true, package: { select: { nameAr: true } } } },
      reversal: { select: { id: true, amountMinor: true, kind: true, createdAt: true } },
    },
  });
  if (!row) throw new NotFoundException('REFUND_REQUEST_NOT_FOUND');
  return refundRequestResponse(row);
}

// -----------------------------------------------------------------------------
// Step 4.5: Commission Serializers & Helpers
// -----------------------------------------------------------------------------

export function commissionRuleResponse(r: any) {
  return {
    id: r.id,
    planId: r.planId,
    procedureId: r.procedureId,
    calculationType: r.calculationType,
    rateBasisPoints: r.rateBasisPoints,
    flatAmountMinor: r.flatAmountMinor ? r.flatAmountMinor.toString() : null,
    earningEvent: r.earningEvent,
    ruleVersion: r.ruleVersion,
    isPublished: r.isPublished,
    description: r.description,
    createdAt: r.createdAt.toISOString(),
    procedure: r.procedure ? { id: r.procedure.id, nameAr: r.procedure.nameAr } : null,
  };
}

export function commissionPlanResponse(p: any) {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
    status: p.status,
    currency: p.currency,
    currencyScale: p.currencyScale,
    version: p.version,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    rules: p.rules ? p.rules.map(commissionRuleResponse) : undefined,
    assignments: p.assignments ? p.assignments.map((a: any) => ({
      id: a.id,
      practitionerMembershipId: a.practitionerMembershipId,
      effectiveFrom: a.effectiveFrom.toISOString(),
      effectiveTo: a.effectiveTo ? a.effectiveTo.toISOString() : null,
      notes: a.notes,
      practitioner: a.practitioner ? {
        id: a.practitioner.id,
        user: a.practitioner.user ? { fullName: a.practitioner.user.name } : null,
        role: a.practitioner.role,
      } : null,
    })) : undefined,
  };
}

export function commissionAccrualResponse(a: any) {
  return {
    id: a.id,
    planId: a.planId,
    ruleId: a.ruleId,
    ruleVersion: a.ruleVersion,
    practitionerMembershipId: a.practitionerMembershipId,
    patientId: a.patientId,
    invoiceId: a.invoiceId,
    procedureExecutionId: a.procedureExecutionId,
    appointmentId: a.appointmentId,
    baseAmountMinor: a.baseAmountMinor.toString(),
    rateBasisPoints: a.rateBasisPoints,
    flatAmountMinor: a.flatAmountMinor ? a.flatAmountMinor.toString() : null,
    commissionAmountMinor: a.commissionAmountMinor.toString(),
    currency: a.currency,
    currencyScale: a.currencyScale,
    status: a.status,
    earningEvent: a.earningEvent,
    earnedAt: a.earnedAt.toISOString(),
    settlementId: a.settlementId,
    approvedByMembershipId: a.approvedByMembershipId,
    approvedAt: a.approvedAt ? a.approvedAt.toISOString() : null,
    notes: a.notes,
    version: a.version,
    createdAt: a.createdAt.toISOString(),
    practitioner: a.practitioner ? {
      id: a.practitioner.id,
      user: a.practitioner.user ? { fullName: a.practitioner.user.name } : null,
      role: a.practitioner.role,
    } : undefined,
    patient: a.patient ? { id: a.patient.id, fullName: a.patient.fullName, patientNumber: a.patient.patientNumber } : undefined,
    invoice: a.invoice ? { id: a.invoice.id, number: a.invoice.number, totalMinor: a.invoice.totalMinor.toString() } : undefined,
    plan: a.plan ? { id: a.plan.id, name: a.plan.name, code: a.plan.code } : undefined,
    adjustments: a.adjustments ? a.adjustments.map(commissionAdjustmentResponse) : undefined,
  };
}

export function commissionAdjustmentResponse(adj: any) {
  return {
    id: adj.id,
    accrualId: adj.accrualId,
    settlementId: adj.settlementId,
    adjustmentAmountMinor: adj.adjustmentAmountMinor.toString(),
    reason: adj.reason,
    reasonDetails: adj.reasonDetails,
    status: adj.status,
    requestedByMembershipId: adj.requestedByMembershipId,
    decidedByMembershipId: adj.decidedByMembershipId,
    decidedAt: adj.decidedAt ? adj.decidedAt.toISOString() : null,
    version: adj.version,
    createdAt: adj.createdAt.toISOString(),
  };
}

export function commissionSettlementResponse(s: any) {
  return {
    id: s.id,
    settlementNumber: s.settlementNumber,
    practitionerMembershipId: s.practitionerMembershipId,
    periodStart: s.periodStart.toISOString(),
    periodEnd: s.periodEnd.toISOString(),
    grossAmountMinor: s.grossAmountMinor.toString(),
    adjustmentsAmountMinor: s.adjustmentsAmountMinor.toString(),
    netSettledMinor: s.netSettledMinor.toString(),
    currency: s.currency,
    currencyScale: s.currencyScale,
    status: s.status,
    payoutReference: s.payoutReference,
    confirmedByMembershipId: s.confirmedByMembershipId,
    confirmedAt: s.confirmedAt ? s.confirmedAt.toISOString() : null,
    notes: s.notes,
    version: s.version,
    createdAt: s.createdAt.toISOString(),
    practitioner: s.practitioner ? {
      id: s.practitioner.id,
      user: s.practitioner.user ? { fullName: s.practitioner.user.name } : null,
      role: s.practitioner.role,
    } : undefined,
    accruals: s.accruals ? s.accruals.map(commissionAccrualResponse) : undefined,
  };
}

export async function commissionPlanDetail(tx: TenantTransaction, clinicId: string, id: string) {
  const row = await tx.practitionerCommissionPlan.findFirst({
    where: { clinicId, id },
    include: {
      rules: { include: { procedure: { select: { id: true, nameAr: true } } }, orderBy: { createdAt: 'asc' } },
      assignments: {
        include: { practitioner: { include: { user: { select: { name: true } } } } },
        orderBy: { effectiveFrom: 'desc' },
      },
    },
  });
  if (!row) throw new NotFoundException('COMMISSION_PLAN_NOT_FOUND');
  return commissionPlanResponse(row);
}

export async function commissionAccrualDetail(tx: TenantTransaction, clinicId: string, id: string) {
  const row = await tx.practitionerCommissionAccrual.findFirst({
    where: { clinicId, id },
    include: {
      plan: { select: { id: true, name: true, code: true } },
      practitioner: { include: { user: { select: { name: true } } } },
      patient: { select: { id: true, fullName: true, patientNumber: true } },
      invoice: { select: { id: true, number: true, totalMinor: true } },
      adjustments: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!row) throw new NotFoundException('COMMISSION_ACCRUAL_NOT_FOUND');
  return commissionAccrualResponse(row);
}

export async function commissionSettlementDetail(tx: TenantTransaction, clinicId: string, id: string) {
  const row = await tx.practitionerCommissionSettlement.findFirst({
    where: { clinicId, id },
    include: {
      practitioner: { include: { user: { select: { name: true } } } },
      accruals: {
        include: {
          patient: { select: { id: true, fullName: true, patientNumber: true } },
          invoice: { select: { id: true, number: true, totalMinor: true } },
        },
      },
      adjustments: true,
    },
  });
  if (!row) throw new NotFoundException('COMMISSION_SETTLEMENT_NOT_FOUND');
  return commissionSettlementResponse(row);
}
