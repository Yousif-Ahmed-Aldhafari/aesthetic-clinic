import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import type { VerifiedPrincipal } from './verified-sessions.js';
import { TenantDatabaseService } from './tenant-database.service.js';
import { audit, financialHash, financialWrite, invoice, invoiceDetail, invoiceResponse, invoiceSelect, paidStatus, paymentResponse, paymentSelect } from './billing.helpers.js';
import { BillingError } from '../billing/billing-error.js';
import { calculate, currencyScale, fixed } from '../billing/money.js';
import { searchName } from '../patients/patient-input.js';
import type { BillingPage, BillingPatientsQuery, BillingProfileInput, BillingVisitsQuery, CreateInvoice, EditInvoice, FinancialCommand, InvoiceQuery, RecordPayment, ReversePayment, VoidInvoice } from '../billing/billing-input.js';
const literal=(s:string)=>s.replace(/[\\%_]/g,'\\$&');
const profileSelect={address:true,registrationNumber:true,taxIdentifier:true,version:true} as const;
@Injectable()
export class BillingRepository {
  constructor(private readonly database:TenantDatabaseService){}

  list(proof:VerifiedPrincipal,clinicId:string,q:InvoiceQuery){return this.database.withClinicContext(proof,clinicId,['invoices.read'],async(tx,c)=>{
    const where:Prisma.InvoiceWhereInput={clinicId:c.clinicId,...(q.status==='ALL'?{}:{status:q.status})};
    if(q.q)where.OR=[{number:{startsWith:literal(q.q.toUpperCase())}},{patientName:{contains:literal(q.q),mode:'insensitive'}},{patientNumber:{startsWith:literal(q.q.toUpperCase())}}];
    if(q.cursor){const anchor=await invoice(tx,c.clinicId,q.cursor);where.AND={OR:[{createdAt:{lt:anchor.createdAt}},{createdAt:anchor.createdAt,id:{lt:anchor.id}}]};}
    const rows=await tx.invoice.findMany({where,select:invoiceSelect,orderBy:[{createdAt:'desc'},{id:'desc'}],take:q.pageSize+1});
    return {items:rows.slice(0,q.pageSize).map(invoiceResponse),hasMore:rows.length>q.pageSize,nextCursor:rows.length>q.pageSize?rows[q.pageSize-1].id:null};
  });}
  get(proof:VerifiedPrincipal,clinicId:string,id:string){return this.database.withClinicContext(proof,clinicId,['invoices.read'],(tx,c)=>invoiceDetail(tx,c.clinicId,id));}

  create(proof:VerifiedPrincipal,clinicId:string,input:CreateInvoice){return financialWrite(this.database,proof,clinicId,['invoices.create'],async(tx,c)=>{
    const hash=financialHash(input),old=await tx.invoice.findFirst({where:{clinicId:c.clinicId,requestKey:input.requestKey}});
    if(old){if(old.requestHash!==hash)throw new BillingError('BILLING_RETRY');return invoiceDetail(tx,c.clinicId,old.id);}
    const patient=await tx.patient.findFirst({where:{clinicId:c.clinicId,id:input.patientId},select:{id:true,fullName:true,patientNumber:true,status:true}});
    if(!patient)throw new NotFoundException();if(patient.status!=='ACTIVE')throw new BadRequestException();
    if(input.visitId&&!await tx.visit.findFirst({where:{clinicId:c.clinicId,id:input.visitId,patientId:patient.id},select:{id:true}}))throw new NotFoundException();
    const clinic=await tx.clinic.findFirstOrThrow({where:{id:c.clinicId},select:{currency:true}}),scale=currencyScale(clinic.currency),computed=calculate(input.lines,scale);
    const row=await tx.invoice.create({data:{clinicId:c.clinicId,patientId:patient.id,visitId:input.visitId??null,currency:clinic.currency,currencyScale:scale,patientName:patient.fullName,patientNumber:patient.patientNumber,requestKey:input.requestKey,requestHash:hash,...computed.totals}});
    await tx.invoiceLine.createMany({data:computed.items.map(l=>({...l,clinicId:c.clinicId,invoiceId:row.id}))});
    await audit(tx,c,'DRAFT_CREATED',row.id,row.version,{totalMinor:row.totalMinor.toString(),linesHash:financialHash(computed.items)});
    return invoiceDetail(tx,c.clinicId,row.id);
  });}
  edit(proof:VerifiedPrincipal,clinicId:string,id:string,input:EditInvoice){return financialWrite(this.database,proof,clinicId,['invoices.create'],async(tx,c)=>{
    const current=await invoice(tx,c.clinicId,id,input.expectedVersion);if(current.status!=='DRAFT')throw new BillingError('BILLING_STATE');
    const computed=calculate(input.lines,current.currencyScale);
    await tx.invoiceLine.deleteMany({where:{clinicId:c.clinicId,invoiceId:id}});
    await tx.invoiceLine.createMany({data:computed.items.map(l=>({...l,clinicId:c.clinicId,invoiceId:id}))});
    const row=await tx.invoice.update({where:{clinicId_id:{clinicId:c.clinicId,id}},data:{...computed.totals,version:{increment:1}}});
    await audit(tx,c,'DRAFT_EDITED',id,row.version,{totalMinor:row.totalMinor.toString(),linesHash:financialHash(computed.items)});
    return invoiceDetail(tx,c.clinicId,id);
  });}
  issue(proof:VerifiedPrincipal,clinicId:string,id:string,input:FinancialCommand){return financialWrite(this.database,proof,clinicId,['invoices.issue'],async(tx,c)=>{
    const current=await invoice(tx,c.clinicId,id),hash=financialHash(input);
    if(current.issueKey===input.requestKey){if(current.issueHash!==hash)throw new BillingError('BILLING_RETRY');return invoiceDetail(tx,c.clinicId,id);}
    if(current.version!==input.expectedVersion)throw new BillingError('BILLING_STALE');
    if(current.status!=='DRAFT'||current.totalMinor<=0n)throw new BillingError('BILLING_STATE');
    const clinic=await tx.clinic.findFirstOrThrow({where:{id:c.clinicId},select:{legalName:true,displayName:true,currency:true,timezone:true,branding:{select:{logoUrl:true,primaryColor:true,secondaryColor:true,accentColor:true}}}});
    const profile=await tx.clinicBillingProfile.findFirst({where:{clinicId:c.clinicId},select:profileSelect});
    const patient=await tx.patient.findFirstOrThrow({where:{clinicId:c.clinicId,id:current.patientId},select:{fullName:true,patientNumber:true}});
    const counter=await tx.clinicInvoiceCounter.update({where:{clinicId:c.clinicId},data:{lastNumber:{increment:1},revision:{increment:1}},select:{lastNumber:true}});
    const issuer={legalName:clinic.legalName,displayName:clinic.displayName,timezone:clinic.timezone,logoUrl:clinic.branding?.logoUrl??null,primaryColor:clinic.branding?.primaryColor??'#7854D9',secondaryColor:clinic.branding?.secondaryColor??'#F6F8FC',address:profile?.address??null,registrationNumber:profile?.registrationNumber??null,taxIdentifier:profile?.taxIdentifier??null};
    const row=await tx.invoice.update({where:{clinicId_id:{clinicId:c.clinicId,id}},data:{status:'ISSUED',number:`INV-${String(counter.lastNumber).padStart(6,'0')}`,issuedAt:new Date(),issuerSnapshot:issuer,patientName:patient.fullName,patientNumber:patient.patientNumber,issueKey:input.requestKey,issueHash:hash,version:{increment:1}}});
    await audit(tx,c,'INVOICE_ISSUED',id,row.version,{number:row.number,totalMinor:row.totalMinor.toString(),currency:row.currency,snapshotHash:financialHash(issuer)});
    return invoiceDetail(tx,c.clinicId,id);
  });}
  void(proof:VerifiedPrincipal,clinicId:string,id:string,input:VoidInvoice){return financialWrite(this.database,proof,clinicId,['invoices.manage'],async(tx,c)=>{
    const current=await invoice(tx,c.clinicId,id),hash=financialHash(input);
    if(current.voidKey===input.requestKey){if(current.voidHash!==hash)throw new BillingError('BILLING_RETRY');return invoiceDetail(tx,c.clinicId,id);}
    if(current.version!==input.expectedVersion)throw new BillingError('BILLING_STALE');
    if(current.status!=='ISSUED'||current.netPaidMinor!==0n||await tx.payment.count({where:{clinicId:c.clinicId,invoiceId:id}}))throw new BillingError('BILLING_STATE');
    const row=await tx.invoice.update({where:{clinicId_id:{clinicId:c.clinicId,id}},data:{status:'VOID',voidedAt:new Date(),voidReason:input.reason,voidKey:input.requestKey,voidHash:hash,version:{increment:1}}});
    await audit(tx,c,'INVOICE_VOIDED',id,row.version,{reason:input.reason});return invoiceDetail(tx,c.clinicId,id);
  });}

  pay(proof:VerifiedPrincipal,clinicId:string,id:string,input:RecordPayment){return financialWrite(this.database,proof,clinicId,['payments.record'],async(tx,c)=>{
    const current=await invoice(tx,c.clinicId,id),hash=financialHash({invoiceId:id,...input});
    const old=await tx.payment.findFirst({where:{clinicId:c.clinicId,requestKey:input.requestKey}});
    if(old){if(old.requestHash!==hash)throw new BillingError('BILLING_RETRY');return {invoice:await invoiceDetail(tx,c.clinicId,id),payment:paymentResponse(await tx.payment.findFirstOrThrow({where:{clinicId:c.clinicId,id:old.id},select:paymentSelect}))};}
    if(current.version!==input.expectedVersion)throw new BillingError('BILLING_STALE');
    if(!['ISSUED','PARTIALLY_PAID'].includes(current.status))throw new BillingError('BILLING_STATE');
    const amount=fixed(input.amount,current.currencyScale);if(amount<=0n)throw new BillingError('BILLING_AMOUNT');
    if(amount>current.totalMinor-current.netPaidMinor)throw new BillingError('BILLING_OVERPAYMENT');
    const payment=await tx.payment.create({data:{clinicId:c.clinicId,invoiceId:id,amountMinor:amount,currency:current.currency,currencyScale:current.currencyScale,method:input.method,requestKey:input.requestKey,requestHash:hash},select:paymentSelect});
    const paid=current.netPaidMinor+amount,row=await tx.invoice.update({where:{clinicId_id:{clinicId:c.clinicId,id}},data:{netPaidMinor:paid,status:paidStatus(paid,current.totalMinor),version:{increment:1}}});
    await audit(tx,c,'PAYMENT_RECORDED',id,row.version,{paymentId:payment.id,amountMinor:amount.toString(),method:input.method});
    return {invoice:await invoiceDetail(tx,c.clinicId,id),payment:paymentResponse(payment)};
  });}
  reverse(proof:VerifiedPrincipal,clinicId:string,id:string,paymentId:string,input:ReversePayment){return financialWrite(this.database,proof,clinicId,['payments.reverse'],async(tx,c)=>{
    const current=await invoice(tx,c.clinicId,id),hash=financialHash({invoiceId:id,paymentId,...input});
    const payment=await tx.payment.findFirst({where:{clinicId:c.clinicId,id:paymentId,invoiceId:id},select:paymentSelect});if(!payment)throw new NotFoundException();
    const old=await tx.paymentReversal.findFirst({where:{clinicId:c.clinicId,requestKey:input.requestKey}});
    if(old){if(old.requestHash!==hash)throw new BillingError('BILLING_RETRY');return {invoice:await invoiceDetail(tx,c.clinicId,id),payment:paymentResponse(payment)};}
    if(current.version!==input.expectedVersion)throw new BillingError('BILLING_STALE');
    if(!['ISSUED','PARTIALLY_PAID','PAID'].includes(current.status))throw new BillingError('BILLING_STATE');
    const amount=fixed(input.amount,current.currencyScale),refunded=payment.reversals.reduce((n,r)=>n+r.amountMinor,0n);
    if(amount<=0n)throw new BillingError('BILLING_AMOUNT');
    if(payment.reversals.length>=100||amount>payment.amountMinor-refunded||input.kind==='REVERSAL'&&(refunded!==0n||amount!==payment.amountMinor))throw new BillingError('BILLING_REFUND');
    const reversal=await tx.paymentReversal.create({data:{clinicId:c.clinicId,invoiceId:id,paymentId,amountMinor:amount,currency:current.currency,currencyScale:current.currencyScale,kind:input.kind,reason:input.reason,requestKey:input.requestKey,requestHash:hash}});
    const paid=current.netPaidMinor-amount,row=await tx.invoice.update({where:{clinicId_id:{clinicId:c.clinicId,id}},data:{netPaidMinor:paid,status:paidStatus(paid,current.totalMinor),version:{increment:1}}});
    await audit(tx,c,input.kind==='REFUND'?'PAYMENT_REFUNDED':'PAYMENT_REVERSED',id,row.version,{paymentId,reversalId:reversal.id,amountMinor:amount.toString(),reason:input.reason});
    return {invoice:await invoiceDetail(tx,c.clinicId,id),payment:paymentResponse(await tx.payment.findFirstOrThrow({where:{clinicId:c.clinicId,id:paymentId},select:paymentSelect}))};
  });}

  payments(proof:VerifiedPrincipal,clinicId:string,id:string,q:BillingPage){return this.database.withClinicContext(proof,clinicId,['invoices.read'],async(tx,c)=>{
    await invoice(tx,c.clinicId,id);const where:Prisma.PaymentWhereInput={clinicId:c.clinicId,invoiceId:id};
    if(q.cursor){const anchor=await tx.payment.findFirst({where:{...where,id:q.cursor},select:{createdAt:true,id:true}});if(!anchor)throw new NotFoundException();where.AND={OR:[{createdAt:{lt:anchor.createdAt}},{createdAt:anchor.createdAt,id:{lt:anchor.id}}]};}
    const rows=await tx.payment.findMany({where,select:paymentSelect,orderBy:[{createdAt:'desc'},{id:'desc'}],take:q.pageSize+1});return {items:rows.slice(0,q.pageSize).map(paymentResponse),hasMore:rows.length>q.pageSize,nextCursor:rows.length>q.pageSize?rows[q.pageSize-1].id:null};
  });}
  summary(proof:VerifiedPrincipal,clinicId:string){return this.database.withClinicContext(proof,clinicId,['invoices.read','reports.read'],async(tx,c)=>{
    // BigInt aggregation stays in PostgreSQL. Totals are separated by currency.
    const invoices=await tx.invoice.groupBy({by:['currency','currencyScale'],where:{clinicId:c.clinicId,status:{in:['ISSUED','PARTIALLY_PAID','PAID']}},_sum:{totalMinor:true,netPaidMinor:true},_count:true});
    const payments=await tx.payment.groupBy({by:['currency','currencyScale'],where:{clinicId:c.clinicId},_sum:{amountMinor:true}});
    const refunds=await tx.paymentReversal.groupBy({by:['currency','currencyScale'],where:{clinicId:c.clinicId},_sum:{amountMinor:true}});
    const unpaid=await tx.invoice.groupBy({by:['currency','currencyScale'],where:{clinicId:c.clinicId,status:'ISSUED'},_sum:{totalMinor:true}});
    return {scope:'ALL_TIME',items:invoices.map(r=>({currency:r.currency,currencyScale:r.currencyScale,invoiceCount:r._count,unpaidMinor:(unpaid.find(p=>p.currency===r.currency)?._sum.totalMinor??0n).toString(),invoicedMinor:(r._sum.totalMinor??0n).toString(),collectedMinor:(r._sum.netPaidMinor??0n).toString(),outstandingMinor:((r._sum.totalMinor??0n)-(r._sum.netPaidMinor??0n)).toString(),receivedMinor:(payments.find(p=>p.currency===r.currency)?._sum.amountMinor??0n).toString(),refundedMinor:(refunds.find(p=>p.currency===r.currency)?._sum.amountMinor??0n).toString()}))};
  },{isolationLevel:'RepeatableRead'});}
  profile(proof:VerifiedPrincipal,clinicId:string){return this.database.withClinicContext(proof,clinicId,['invoices.read'],async(tx,c)=>{
    const clinic=await tx.clinic.findFirstOrThrow({where:{id:c.clinicId},select:{legalName:true,displayName:true,currency:true,timezone:true}});
    const profile=await tx.clinicBillingProfile.findFirst({where:{clinicId:c.clinicId},select:profileSelect});
    return {...clinic,currencyScale:currencyScale(clinic.currency),profile:profile??{address:null,registrationNumber:null,taxIdentifier:null,version:0}};
  });}
  configure(proof:VerifiedPrincipal,clinicId:string,input:BillingProfileInput){return financialWrite(this.database,proof,clinicId,['invoices.manage'],async(tx,c)=>{
    const current=await tx.clinicBillingProfile.findFirst({where:{clinicId:c.clinicId},select:profileSelect});
    if(input.expectedVersion!==(current?.version??1))throw new BillingError('BILLING_STALE');
    const data={...(input.address===undefined?{}:{address:input.address||null}),...(input.registrationNumber===undefined?{}:{registrationNumber:input.registrationNumber||null}),...(input.taxIdentifier===undefined?{}:{taxIdentifier:input.taxIdentifier||null})};
    if(!Object.keys(data).length)throw new BadRequestException();
    const profile=current?await tx.clinicBillingProfile.update({where:{clinicId:c.clinicId},data:{...data,version:{increment:1}},select:profileSelect}):await tx.clinicBillingProfile.create({data:{clinicId:c.clinicId,...data},select:profileSelect});
    await audit(tx,c,'PROFILE_UPDATED',null,null,{version:profile.version,profileHash:financialHash(profile)});return profile;
  });}
  patients(proof:VerifiedPrincipal,clinicId:string,q:BillingPatientsQuery){return this.database.withClinicContext(proof,clinicId,['invoices.create'],async(tx,c)=>{
    const where:Prisma.PatientWhereInput={clinicId:c.clinicId,status:'ACTIVE'};
    if(q.q)where.OR=[{searchName:{startsWith:literal(searchName(q.q))}},{patientNumber:{startsWith:literal(q.q.toUpperCase())}}];
    if(q.cursor){const anchor=await tx.patient.findFirst({where:{clinicId:c.clinicId,id:q.cursor},select:{id:true}});if(!anchor)throw new NotFoundException();where.id={gt:anchor.id};}
    const rows=await tx.patient.findMany({where,select:{id:true,fullName:true,patientNumber:true},orderBy:{id:'asc'},take:q.pageSize+1});return {items:rows.slice(0,q.pageSize),hasMore:rows.length>q.pageSize,nextCursor:rows.length>q.pageSize?rows[q.pageSize-1].id:null};
  });}
  visits(proof:VerifiedPrincipal,clinicId:string,q:BillingVisitsQuery){return this.database.withClinicContext(proof,clinicId,['invoices.create'],async(tx,c)=>{
    if(!await tx.patient.findFirst({where:{clinicId:c.clinicId,id:q.patientId},select:{id:true}}))throw new NotFoundException();
    const where:Prisma.VisitWhereInput={clinicId:c.clinicId,patientId:q.patientId};if(q.cursor){const anchor=await tx.visit.findFirst({where:{...where,id:q.cursor},select:{id:true}});if(!anchor)throw new NotFoundException();where.id={gt:anchor.id};}
    const rows=await tx.visit.findMany({where,select:{id:true,checkedInAt:true},orderBy:{id:'asc'},take:q.pageSize+1});return {items:rows.slice(0,q.pageSize).map(v=>({id:v.id,checkedInAt:v.checkedInAt.toISOString()})),hasMore:rows.length>q.pageSize,nextCursor:rows.length>q.pageSize?rows[q.pageSize-1].id:null};
  });}
  audit(proof:VerifiedPrincipal,clinicId:string,id:string,q:BillingPage){return this.database.withClinicContext(proof,clinicId,['invoices.manage'],async(tx,c)=>{
    await invoice(tx,c.clinicId,id);const where:Prisma.FinancialAuditEventWhereInput={clinicId:c.clinicId,invoiceId:id};
    if(q.cursor){const anchor=await tx.financialAuditEvent.findFirst({where:{...where,id:q.cursor},select:{sequence:true}});if(!anchor)throw new NotFoundException();where.sequence={lt:anchor.sequence};}
    const rows=await tx.financialAuditEvent.findMany({where,select:{id:true,sequence:true,action:true,previousHash:true,eventHash:true,createdAt:true},orderBy:{sequence:'desc'},take:q.pageSize+1});return {items:rows.slice(0,q.pageSize).map(e=>({...e,createdAt:e.createdAt.toISOString()})),hasMore:rows.length>q.pageSize,nextCursor:rows.length>q.pageSize?rows[q.pageSize-1].id:null};
  });}
}
