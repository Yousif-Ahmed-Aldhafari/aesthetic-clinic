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
    await tx.clinicInvoiceCounter.upsert({where:{clinicId:c.clinicId},create:{clinicId:c.clinicId},update:{revision:{increment:1}},select:{clinicId:true}});
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
