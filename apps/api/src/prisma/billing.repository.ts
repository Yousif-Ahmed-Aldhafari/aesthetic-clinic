import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import type { VerifiedPrincipal } from './verified-sessions.js';
import { TenantDatabaseService } from './tenant-database.service.js';
import {
  audit, financialHash, financialWrite, invoice, invoiceDetail, invoiceResponse, invoiceSelect, paidStatus, paymentResponse, paymentSelect,
  packageResponse, patientPackageResponse, installmentPlanResponse, refundRequestResponse,
  packageDetail, patientPackageDetail, installmentPlanDetail, refundRequestDetail,
  commissionPlanResponse, commissionAccrualResponse, commissionAdjustmentResponse, commissionSettlementResponse,
  commissionPlanDetail, commissionAccrualDetail, commissionSettlementDetail,
} from './billing.helpers.js';
import { BillingError } from '../billing/billing-error.js';
import { calculate, currencyScale, fixed, signedFixed } from '../billing/money.js';
import { searchName } from '../patients/patient-input.js';
import type {
  BillingPage, BillingPatientsQuery, BillingProfileInput, BillingVisitsQuery, CreateInvoice, EditInvoice, FinancialCommand, InvoiceQuery, RecordPayment, ReversePayment, VoidInvoice,
  CreateTreatmentPackageDto, CreatePackageVersionDto, PublishPackageVersionDto, UpdatePackageStatusDto,
  PurchasePatientPackageDto, ActivatePatientPackageDto, CancelPatientPackageDto, RedeemPackageSessionDto, ReversePackageRedemptionDto,
  CreateInstallmentPlanDto, AllocateInstallmentPaymentDto, CreateRefundRequestDto, DecideRefundRequestDto, SettleRefundRequestDto,
  PackageQuery, PatientPackageQuery, InstallmentPlanQuery, RefundRequestQuery,
} from '../billing/billing-input.js';
import type {
  CreateCommissionPlanDto, AssignPractitionerPlanDto, CreateCommissionRuleDto, CreateCommissionAccrualDto,
  RequestCommissionAdjustmentDto, DecideCommissionAdjustmentDto, CreateCommissionSettlementDto, ConfirmCommissionSettlementDto,
  CommissionQuery, OperationalReportQueryDto,
} from '../billing/commission-input.js';
import type {
  FinancialReconciliationReport, ReconciliationFinding, RevenueCollectionsSummary, InstallmentAgingReport,
  PackageLiabilityReport, PractitionerPerformanceReport, InventoryValuationSummary, AppointmentUtilizationReport,
} from '../billing/reconciliation.types.js';
import { AuditRepository } from './audit.repository.js';
const literal=(s:string)=>s.replace(/[\\%_]/g,'\\$&');
const profileSelect={address:true,registrationNumber:true,taxIdentifier:true,version:true} as const;
@Injectable()
export class BillingRepository {
  constructor(
    private readonly database:TenantDatabaseService,
    private readonly auditRepo:AuditRepository,
  ){}

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
    await this.auditRepo.record({clinicId:c.clinicId,actorId:c.userId,action:'invoices.draft',category:'FINANCE',targetType:'Invoice',targetId:row.id,outcome:'SUCCESS',metadata:{totalMinor:row.totalMinor.toString()}},tx);
    return invoiceDetail(tx,c.clinicId,row.id);
  });}
  edit(proof:VerifiedPrincipal,clinicId:string,id:string,input:EditInvoice){return financialWrite(this.database,proof,clinicId,['invoices.create'],async(tx,c)=>{
    const current=await invoice(tx,c.clinicId,id,input.expectedVersion);if(current.status!=='DRAFT')throw new BillingError('BILLING_STATE');
    const computed=calculate(input.lines,current.currencyScale);
    await tx.invoiceLine.deleteMany({where:{clinicId:c.clinicId,invoiceId:id}});
    await tx.invoiceLine.createMany({data:computed.items.map(l=>({...l,clinicId:c.clinicId,invoiceId:id}))});
    const row=await tx.invoice.update({where:{clinicId_id:{clinicId:c.clinicId,id}},data:{...computed.totals,version:{increment:1}}});
    await audit(tx,c,'DRAFT_EDITED',id,row.version,{totalMinor:row.totalMinor.toString(),linesHash:financialHash(computed.items)});
    await this.auditRepo.record({clinicId:c.clinicId,actorId:c.userId,action:'invoices.edit',category:'FINANCE',targetType:'Invoice',targetId:id,outcome:'SUCCESS',metadata:{version:row.version}},tx);
    return invoiceDetail(tx,c.clinicId,id);
  });}
  issue(proof:VerifiedPrincipal,clinicId:string,id:string,input:FinancialCommand){return financialWrite(this.database,proof,clinicId,['invoices.issue'],async(tx,c)=>{
    const current=await invoice(tx,c.clinicId,id),hash=financialHash(input);
    if(current.issueKey===input.requestKey){if(current.issueHash!==hash)throw new BillingError('BILLING_RETRY');return invoiceDetail(tx,c.clinicId,id);}
    if(current.version!==input.expectedVersion)throw new BillingError('BILLING_STALE');
    if(current.status!=='DRAFT'||current.totalMinor<=0n)throw new BillingError('BILLING_STATE');
    const clinic=await tx.clinic.findFirstOrThrow({where:{id:c.clinicId},select:{legalName:true,displayName:true,currency:true,timezone:true,address:true,branding:{select:{typography:true,logoUrl:true,primaryColor:true,secondaryColor:true,accentColor:true}}}});
    const profile=await tx.clinicBillingProfile.findFirst({where:{clinicId:c.clinicId},select:profileSelect});
    const patient=await tx.patient.findFirstOrThrow({where:{clinicId:c.clinicId,id:current.patientId},select:{fullName:true,patientNumber:true}});
    const counter=await tx.clinicInvoiceCounter.update({where:{clinicId:c.clinicId},data:{lastNumber:{increment:1},revision:{increment:1}},select:{lastNumber:true}});
    const issuer={typography:clinic.branding?.typography??'TAJAWAL',legalName:clinic.legalName,displayName:clinic.displayName,timezone:clinic.timezone,logoUrl:clinic.branding?.logoUrl??null,primaryColor:clinic.branding?.primaryColor??'#7854D9',secondaryColor:clinic.branding?.secondaryColor??'#F6F8FC',address:profile?.address??clinic.address??null,registrationNumber:profile?.registrationNumber??null,taxIdentifier:profile?.taxIdentifier??null};
    const row=await tx.invoice.update({where:{clinicId_id:{clinicId:c.clinicId,id}},data:{status:'ISSUED',number:`INV-${String(counter.lastNumber).padStart(6,'0')}`,issuedAt:new Date(),issuerSnapshot:issuer,patientName:patient.fullName,patientNumber:patient.patientNumber,issueKey:input.requestKey,issueHash:hash,version:{increment:1}}});
    await tx.patientPackage.updateMany({
      where: { clinicId: c.clinicId, invoiceId: id, status: 'PENDING_PAYMENT', activationPolicy: 'UPON_INVOICE_ISSUANCE' },
      data: { status: 'ACTIVE', activatedAt: new Date() },
    });
    await audit(tx,c,'INVOICE_ISSUED',id,row.version,{number:row.number,totalMinor:row.totalMinor.toString(),currency:row.currency,snapshotHash:financialHash(issuer)});
    await this.auditRepo.record({clinicId:c.clinicId,actorId:c.userId,action:'invoices.issue',category:'FINANCE',targetType:'Invoice',targetId:id,outcome:'SUCCESS',metadata:{number:row.number,totalMinor:row.totalMinor.toString()}},tx);
    return invoiceDetail(tx,c.clinicId,id);
  });}
  void(proof:VerifiedPrincipal,clinicId:string,id:string,input:VoidInvoice){return financialWrite(this.database,proof,clinicId,['invoices.manage'],async(tx,c)=>{
    const current=await invoice(tx,c.clinicId,id),hash=financialHash(input);
    if(current.voidKey===input.requestKey){if(current.voidHash!==hash)throw new BillingError('BILLING_RETRY');return invoiceDetail(tx,c.clinicId,id);}
    if(current.version!==input.expectedVersion)throw new BillingError('BILLING_STALE');
    if(current.status!=='ISSUED'||current.netPaidMinor!==0n||await tx.payment.count({where:{clinicId:c.clinicId,invoiceId:id}}))throw new BillingError('BILLING_STATE');
    const row=await tx.invoice.update({where:{clinicId_id:{clinicId:c.clinicId,id}},data:{status:'VOID',voidedAt:new Date(),voidReason:input.reason,voidKey:input.requestKey,voidHash:hash,version:{increment:1}}});
    await audit(tx,c,'INVOICE_VOIDED',id,row.version,{reason:input.reason});
    await this.auditRepo.record({clinicId:c.clinicId,actorId:c.userId,action:'invoices.void',category:'FINANCE',targetType:'Invoice',targetId:id,outcome:'SUCCESS',metadata:{reason:input.reason}},tx);
    return invoiceDetail(tx,c.clinicId,id);
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
    if (paid === current.totalMinor) {
      await tx.patientPackage.updateMany({
        where: { clinicId: c.clinicId, invoiceId: id, status: 'PENDING_PAYMENT', activationPolicy: 'UPON_FULL_PAYMENT' },
        data: { status: 'ACTIVE', activatedAt: new Date() },
      });
    }
    await audit(tx,c,'PAYMENT_RECORDED',id,row.version,{paymentId:payment.id,amountMinor:amount.toString(),method:input.method});
    await this.auditRepo.record({clinicId:c.clinicId,actorId:c.userId,action:'payments.record',category:'FINANCE',targetType:'Invoice',targetId:id,outcome:'SUCCESS',metadata:{paymentId:payment.id,amountMinor:amount.toString()}},tx);
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
    await this.auditRepo.record({clinicId:c.clinicId,actorId:c.userId,action:input.kind==='REFUND'?'payments.refund':'payments.reverse',category:'FINANCE',targetType:'Invoice',targetId:id,outcome:'SUCCESS',metadata:{paymentId,amountMinor:amount.toString()}},tx);
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
    await audit(tx,c,'PROFILE_UPDATED',null,null,{version:profile.version,profileHash:financialHash(profile)});
    await this.auditRepo.record({clinicId:c.clinicId,actorId:c.userId,action:'finance.profile_update',category:'FINANCE',targetType:'ClinicBillingProfile',targetId:c.clinicId,outcome:'SUCCESS',metadata:{version:profile.version}},tx);
    return profile;
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

  // ---------------------------------------------------------------------------
  // Step 4.4: Treatment Package Catalog
  // ---------------------------------------------------------------------------

  listPackages(proof: VerifiedPrincipal, clinicId: string, q: PackageQuery) {
    return this.database.withClinicContext(proof, clinicId, ['packages.catalog.read'], async (tx, c) => {
      const where: Prisma.TreatmentPackageWhereInput = {
        clinicId: c.clinicId,
        ...(q.status === 'ALL' ? {} : { status: q.status }),
      };
      if (q.q) {
        where.OR = [
          { code: { startsWith: literal(q.q.toUpperCase()) } },
          { nameAr: { contains: literal(q.q), mode: 'insensitive' } },
          { nameEn: { contains: literal(q.q), mode: 'insensitive' } },
        ];
      }
      if (q.cursor) {
        const anchor = await tx.treatmentPackage.findFirst({ where: { clinicId: c.clinicId, id: q.cursor }, select: { createdAt: true, id: true } });
        if (!anchor) throw new NotFoundException();
        where.AND = { OR: [{ createdAt: { lt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { lt: anchor.id } }] };
      }
      const rows = await tx.treatmentPackage.findMany({
        where,
        include: {
          versions: {
            where: { clinicId: c.clinicId },
            orderBy: { versionNumber: 'desc' },
            take: 1,
            include: { items: { include: { procedure: { select: { id: true, nameAr: true } } } } },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: q.pageSize + 1,
      });
      return {
        items: rows.slice(0, q.pageSize).map(packageResponse),
        hasMore: rows.length > q.pageSize,
        nextCursor: rows.length > q.pageSize ? rows[q.pageSize - 1].id : null,
      };
    });
  }

  getPackage(proof: VerifiedPrincipal, clinicId: string, id: string) {
    return this.database.withClinicContext(proof, clinicId, ['packages.catalog.read'], (tx, c) => packageDetail(tx, c.clinicId, id));
  }

  createPackage(proof: VerifiedPrincipal, clinicId: string, input: CreateTreatmentPackageDto) {
    return financialWrite(this.database, proof, clinicId, ['packages.catalog.manage'], async (tx, c) => {
      const code = input.code.trim().toUpperCase();
      const existing = await tx.treatmentPackage.findFirst({ where: { clinicId: c.clinicId, code } });
      if (existing) throw new BillingError('PACKAGE_CODE_EXISTS');

      const clinic = await tx.clinic.findFirstOrThrow({ where: { id: c.clinicId }, select: { currency: true } });
      const scale = currencyScale(clinic.currency);
      const priceMinor = fixed(input.price, scale);

      const created = await tx.treatmentPackage.create({
        data: {
          clinicId: c.clinicId,
          code,
          nameAr: input.nameAr.trim(),
          nameEn: input.nameEn?.trim() || null,
          description: input.description?.trim() || null,
          status: 'DRAFT',
        },
      });

      const version = await tx.treatmentPackageVersion.create({
        data: {
          clinicId: c.clinicId,
          packageId: created.id,
          versionNumber: 1,
          nameAr: input.nameAr.trim(),
          nameEn: input.nameEn?.trim() || null,
          description: input.description?.trim() || null,
          terms: input.terms?.trim() || null,
          priceMinor,
          currency: clinic.currency,
          currencyScale: scale,
          validityDays: input.validityDays || 365,
          isPublished: false,
        },
      });

      if (input.items && input.items.length > 0) {
        await tx.treatmentPackageItem.createMany({
          data: input.items.map((item) => ({
            clinicId: c.clinicId,
            packageVersionId: version.id,
            procedureId: item.procedureId || null,
            serviceName: item.serviceName.trim(),
            sessionQuantity: item.sessionQuantity,
            notes: item.notes?.trim() || null,
          })),
        });
      }

      await tx.treatmentPackage.update({
        where: { clinicId_id: { clinicId: c.clinicId, id: created.id } },
        data: { currentVersionId: version.id },
      });

      await this.auditRepo.record({
        clinicId: c.clinicId,
        actorId: c.userId,
        action: 'packages.create',
        category: 'FINANCE',
        targetType: 'TreatmentPackage',
        targetId: created.id,
        outcome: 'SUCCESS',
        metadata: { code, priceMinor: priceMinor.toString() },
      }, tx);

      return packageDetail(tx, c.clinicId, created.id);
    });
  }

  createPackageVersion(proof: VerifiedPrincipal, clinicId: string, packageId: string, input: CreatePackageVersionDto) {
    return financialWrite(this.database, proof, clinicId, ['packages.catalog.manage'], async (tx, c) => {
      const pkg = await tx.treatmentPackage.findFirst({ where: { clinicId: c.clinicId, id: packageId } });
      if (!pkg) throw new NotFoundException('PACKAGE_NOT_FOUND');

      const clinic = await tx.clinic.findFirstOrThrow({ where: { id: c.clinicId }, select: { currency: true } });
      const scale = currencyScale(clinic.currency);
      const priceMinor = fixed(input.price, scale);

      const latest = await tx.treatmentPackageVersion.findFirst({
        where: { clinicId: c.clinicId, packageId },
        orderBy: { versionNumber: 'desc' },
      });
      const nextVersionNumber = (latest?.versionNumber ?? 0) + 1;

      const version = await tx.treatmentPackageVersion.create({
        data: {
          clinicId: c.clinicId,
          packageId,
          versionNumber: nextVersionNumber,
          nameAr: input.nameAr.trim(),
          nameEn: input.nameEn?.trim() || null,
          description: input.description?.trim() || null,
          terms: input.terms?.trim() || null,
          priceMinor,
          currency: clinic.currency,
          currencyScale: scale,
          validityDays: input.validityDays || 365,
          isPublished: false,
        },
      });

      if (input.items && input.items.length > 0) {
        await tx.treatmentPackageItem.createMany({
          data: input.items.map((item) => ({
            clinicId: c.clinicId,
            packageVersionId: version.id,
            procedureId: item.procedureId || null,
            serviceName: item.serviceName.trim(),
            sessionQuantity: item.sessionQuantity,
            notes: item.notes?.trim() || null,
          })),
        });
      }

      await this.auditRepo.record({
        clinicId: c.clinicId,
        actorId: c.userId,
        action: 'packages.create-version',
        category: 'FINANCE',
        targetType: 'TreatmentPackageVersion',
        targetId: packageId,
        outcome: 'SUCCESS',
        metadata: { packageId, versionNumber: nextVersionNumber, priceMinor: priceMinor.toString() },
      }, tx);
      return packageDetail(tx, c.clinicId, packageId);
    });
  }

  publishPackageVersion(proof: VerifiedPrincipal, clinicId: string, packageId: string, versionId: string, _input: PublishPackageVersionDto) {
    return financialWrite(this.database, proof, clinicId, ['packages.catalog.manage'], async (tx, c) => {
      const version = await tx.treatmentPackageVersion.findFirst({
        where: { clinicId: c.clinicId, id: versionId, packageId },
      });
      if (!version) throw new NotFoundException('PACKAGE_VERSION_NOT_FOUND');
      if (version.isPublished) return packageDetail(tx, c.clinicId, packageId);

      await tx.treatmentPackageVersion.update({
        where: { clinicId_id: { clinicId: c.clinicId, id: versionId } },
        data: {
          isPublished: true,
          publishedAt: new Date(),
          publishedByMembershipId: c.membershipId,
        },
      });

      await tx.treatmentPackage.update({
        where: { clinicId_id: { clinicId: c.clinicId, id: packageId } },
        data: {
          currentVersionId: versionId,
          status: 'ACTIVE',
          version: { increment: 1 },
        },
      });

      await this.auditRepo.record({
        clinicId: c.clinicId,
        actorId: c.userId,
        action: 'packages.publish',
        category: 'FINANCE',
        targetType: 'TreatmentPackageVersion',
        targetId: versionId,
        outcome: 'SUCCESS',
        metadata: { packageId, versionNumber: version.versionNumber },
      }, tx);

      return packageDetail(tx, c.clinicId, packageId);
    });
  }

  updatePackageStatus(proof: VerifiedPrincipal, clinicId: string, packageId: string, input: UpdatePackageStatusDto) {
    return financialWrite(this.database, proof, clinicId, ['packages.catalog.manage'], async (tx, c) => {
      const pkg = await tx.treatmentPackage.findFirst({ where: { clinicId: c.clinicId, id: packageId } });
      if (!pkg) throw new NotFoundException('PACKAGE_NOT_FOUND');
      if (pkg.version !== input.expectedVersion) throw new BillingError('BILLING_STALE');

      await tx.treatmentPackage.update({
        where: { clinicId_id: { clinicId: c.clinicId, id: packageId } },
        data: { status: input.status, version: { increment: 1 } },
      });

      await this.auditRepo.record({
        clinicId: c.clinicId,
        actorId: c.userId,
        action: 'packages.status-update',
        category: 'FINANCE',
        targetType: 'TreatmentPackage',
        targetId: packageId,
        outcome: 'SUCCESS',
        metadata: { packageId, status: input.status },
      }, tx);
      return packageDetail(tx, c.clinicId, packageId);
    });
  }

  // ---------------------------------------------------------------------------
  // Step 4.4: Patient Packages & Session Entitlements
  // ---------------------------------------------------------------------------

  listPatientPackages(proof: VerifiedPrincipal, clinicId: string, q: PatientPackageQuery) {
    return this.database.withClinicContext(proof, clinicId, ['packages.purchases.read'], async (tx, c) => {
      const where: Prisma.PatientPackageWhereInput = {
        clinicId: c.clinicId,
        ...(q.patientId ? { patientId: q.patientId } : {}),
        ...(q.status === 'ALL' ? {} : { status: q.status }),
      };
      if (q.cursor) {
        const anchor = await tx.patientPackage.findFirst({ where: { clinicId: c.clinicId, id: q.cursor }, select: { createdAt: true, id: true } });
        if (!anchor) throw new NotFoundException();
        where.AND = { OR: [{ createdAt: { lt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { lt: anchor.id } }] };
      }
      const rows = await tx.patientPackage.findMany({
        where,
        include: {
          patient: { select: { id: true, fullName: true, patientNumber: true } },
          package: { select: { id: true, code: true, nameAr: true } },
          packageVersion: { include: { items: { include: { procedure: { select: { id: true, nameAr: true } } } } } },
          entitlements: { include: { procedure: { select: { id: true, nameAr: true } } } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: q.pageSize + 1,
      });
      return {
        items: rows.slice(0, q.pageSize).map(patientPackageResponse),
        hasMore: rows.length > q.pageSize,
        nextCursor: rows.length > q.pageSize ? rows[q.pageSize - 1].id : null,
      };
    });
  }

  getPatientPackage(proof: VerifiedPrincipal, clinicId: string, id: string) {
    return this.database.withClinicContext(proof, clinicId, ['packages.purchases.read'], (tx, c) => patientPackageDetail(tx, c.clinicId, id));
  }

  purchasePatientPackage(proof: VerifiedPrincipal, clinicId: string, input: PurchasePatientPackageDto) {
    return financialWrite(this.database, proof, clinicId, ['packages.purchases.create'], async (tx, c) => {
      const hash = financialHash(input);
      const old = await tx.patientPackage.findFirst({ where: { clinicId: c.clinicId, requestKey: input.requestKey } });
      if (old) {
        if (old.requestHash !== hash) throw new BillingError('BILLING_RETRY');
        return patientPackageDetail(tx, c.clinicId, old.id);
      }

      const patient = await tx.patient.findFirst({
        where: { clinicId: c.clinicId, id: input.patientId },
        select: { id: true, fullName: true, patientNumber: true, status: true },
      });
      if (!patient) throw new NotFoundException('PATIENT_NOT_FOUND');
      if (patient.status !== 'ACTIVE') throw new BadRequestException('Patient is inactive');

      const version = await tx.treatmentPackageVersion.findFirst({
        where: { clinicId: c.clinicId, id: input.packageVersionId, isPublished: true },
        include: { package: true, items: true },
      });
      if (!version) throw new BillingError('PACKAGE_VERSION_NOT_PUBLISHED');
      if (version.package.status !== 'ACTIVE') throw new BillingError('PACKAGE_NOT_ACTIVE');
      if (!version.items || version.items.length === 0) throw new BadRequestException('Package version has no session items');

      let invoiceRecord = null;
      if (input.invoiceId) {
        invoiceRecord = await tx.invoice.findFirst({
          where: { clinicId: c.clinicId, id: input.invoiceId, patientId: input.patientId },
        });
        if (!invoiceRecord) throw new NotFoundException('INVOICE_NOT_FOUND');
      }

      const totalSessions = version.items.reduce((sum, item) => sum + item.sessionQuantity, 0);

      // Evaluate initial funding status
      let status: 'PENDING_PAYMENT' | 'ACTIVE' = 'PENDING_PAYMENT';
      if (input.activationPolicy === 'MANUAL_OVERRIDE') {
        status = 'ACTIVE';
      } else if (input.activationPolicy === 'UPON_INVOICE_ISSUANCE') {
        if (invoiceRecord && ['ISSUED', 'PARTIALLY_PAID', 'PAID'].includes(invoiceRecord.status)) {
          status = 'ACTIVE';
        }
      } else {
        // UPON_FULL_PAYMENT
        if (invoiceRecord && invoiceRecord.status === 'PAID') {
          status = 'ACTIVE';
        }
      }

      const expiresAt = new Date(Date.now() + version.validityDays * 86400000);

      const created = await tx.patientPackage.create({
        data: {
          clinicId: c.clinicId,
          patientId: input.patientId,
          packageId: version.packageId,
          packageVersionId: version.id,
          invoiceId: input.invoiceId || null,
          status,
          activationPolicy: input.activationPolicy,
          activatedAt: status === 'ACTIVE' ? new Date() : null,
          expiresAt,
          totalSessions,
          redeemedSessions: 0,
          remainingSessions: totalSessions,
          requestKey: input.requestKey,
          requestHash: hash,
          notes: input.notes?.trim() || null,
        },
      });

      await tx.patientPackageEntitlement.createMany({
        data: version.items.map((item) => ({
          clinicId: c.clinicId,
          patientPackageId: created.id,
          packageItemId: item.id,
          procedureId: item.procedureId,
          serviceName: item.serviceName,
          totalSessions: item.sessionQuantity,
          redeemedSessions: 0,
          reservedSessions: 0,
          remainingSessions: item.sessionQuantity,
        })),
      });

      await this.auditRepo.record({
        clinicId: c.clinicId,
        actorId: c.userId,
        action: 'packages.purchase',
        category: 'FINANCE',
        targetType: 'PatientPackage',
        targetId: created.id,
        outcome: 'SUCCESS',
        metadata: { patientId: input.patientId, packageId: version.packageId, totalSessions, status },
      }, tx);

      return patientPackageDetail(tx, c.clinicId, created.id);
    });
  }

  activatePatientPackage(proof: VerifiedPrincipal, clinicId: string, id: string, input: ActivatePatientPackageDto) {
    return financialWrite(this.database, proof, clinicId, ['packages.purchases.manage'], async (tx, c) => {
      const pp = await tx.patientPackage.findFirst({ where: { clinicId: c.clinicId, id } });
      if (!pp) throw new NotFoundException('PATIENT_PACKAGE_NOT_FOUND');
      if (pp.version !== input.expectedVersion) throw new BillingError('BILLING_STALE');
      if (pp.status === 'ACTIVE') return patientPackageDetail(tx, c.clinicId, id);

      await tx.patientPackage.update({
        where: { clinicId_id: { clinicId: c.clinicId, id } },
        data: {
          status: 'ACTIVE',
          activatedAt: new Date(),
          version: { increment: 1 },
          ...(input.notes ? { notes: input.notes.trim() } : {}),
        },
      });

      await this.auditRepo.record({
        clinicId: c.clinicId,
        actorId: c.userId,
        action: 'packages.activate',
        category: 'FINANCE',
        targetType: 'PatientPackage',
        targetId: id,
        outcome: 'SUCCESS',
      }, tx);
      return patientPackageDetail(tx, c.clinicId, id);
    });
  }

  cancelPatientPackage(proof: VerifiedPrincipal, clinicId: string, id: string, input: CancelPatientPackageDto) {
    return financialWrite(this.database, proof, clinicId, ['packages.purchases.manage'], async (tx, c) => {
      const pp = await tx.patientPackage.findFirst({ where: { clinicId: c.clinicId, id } });
      if (!pp) throw new NotFoundException('PATIENT_PACKAGE_NOT_FOUND');
      if (pp.version !== input.expectedVersion) throw new BillingError('BILLING_STALE');
      if (pp.status === 'CANCELLED') return patientPackageDetail(tx, c.clinicId, id);

      await tx.patientPackage.update({
        where: { clinicId_id: { clinicId: c.clinicId, id } },
        data: {
          status: 'CANCELLED',
          version: { increment: 1 },
          notes: pp.notes ? `${pp.notes} | Cancelled: ${input.reason.trim()}` : `Cancelled: ${input.reason.trim()}`,
        },
      });

      await this.auditRepo.record({
        clinicId: c.clinicId,
        actorId: c.userId,
        action: 'packages.cancel',
        category: 'FINANCE',
        targetType: 'PatientPackage',
        targetId: id,
        outcome: 'SUCCESS',
        metadata: { reason: input.reason.trim() },
      }, tx);
      return patientPackageDetail(tx, c.clinicId, id);
    });
  }

  // ---------------------------------------------------------------------------
  // Step 4.4: Session Redemptions & Reversals
  // ---------------------------------------------------------------------------

  redeemPackageSession(proof: VerifiedPrincipal, clinicId: string, packageId: string, input: RedeemPackageSessionDto) {
    return financialWrite(this.database, proof, clinicId, ['packages.redemptions.record'], async (tx, c) => {
      const hash = financialHash(input);
      const old = await tx.packageRedemption.findFirst({ where: { clinicId: c.clinicId, requestKey: input.requestKey } });
      if (old) {
        if (old.requestHash !== hash) throw new BillingError('BILLING_RETRY');
        return patientPackageDetail(tx, c.clinicId, packageId);
      }

      const pp = await tx.patientPackage.findFirst({ where: { clinicId: c.clinicId, id: packageId } });
      if (!pp) throw new NotFoundException('PATIENT_PACKAGE_NOT_FOUND');
      if (pp.status !== 'ACTIVE') throw new BillingError('PATIENT_PACKAGE_NOT_ACTIVE');
      if (pp.expiresAt && pp.expiresAt < new Date()) throw new BillingError('PATIENT_PACKAGE_EXPIRED');

      const entitlement = await tx.patientPackageEntitlement.findFirst({
        where: { clinicId: c.clinicId, id: input.entitlementId, patientPackageId: packageId },
      });
      if (!entitlement) throw new NotFoundException('ENTITLEMENT_NOT_FOUND');
      if (entitlement.remainingSessions < input.sessionsRedeemed) throw new BillingError('INSUFFICIENT_PACKAGE_SESSIONS');

      if (input.procedureExecutionId) {
        const proc = await tx.procedureExecution.findFirst({
          where: { clinicId: c.clinicId, id: input.procedureExecutionId, patientId: pp.patientId },
        });
        if (!proc) throw new NotFoundException('PROCEDURE_NOT_FOUND');
      }

      const redemption = await tx.packageRedemption.create({
        data: {
          clinicId: c.clinicId,
          patientPackageId: packageId,
          entitlementId: input.entitlementId,
          patientId: pp.patientId,
          procedureExecutionId: input.procedureExecutionId || null,
          appointmentId: input.appointmentId || null,
          visitId: input.visitId || null,
          sessionsRedeemed: input.sessionsRedeemed,
          status: 'RECORDED',
          redeemedByMembershipId: c.membershipId,
          requestKey: input.requestKey,
          requestHash: hash,
          notes: input.notes?.trim() || null,
        },
      });

      const newEntRemaining = entitlement.remainingSessions - input.sessionsRedeemed;
      await tx.patientPackageEntitlement.update({
        where: { clinicId_id: { clinicId: c.clinicId, id: input.entitlementId } },
        data: {
          redeemedSessions: entitlement.redeemedSessions + input.sessionsRedeemed,
          remainingSessions: newEntRemaining,
          version: { increment: 1 },
        },
      });

      const newPackageRemaining = pp.remainingSessions - input.sessionsRedeemed;
      await tx.patientPackage.update({
        where: { clinicId_id: { clinicId: c.clinicId, id: packageId } },
        data: {
          redeemedSessions: pp.redeemedSessions + input.sessionsRedeemed,
          remainingSessions: newPackageRemaining,
          status: newPackageRemaining === 0 ? 'EXHAUSTED' : 'ACTIVE',
          version: { increment: 1 },
        },
      });

      await this.auditRepo.record({
        clinicId: c.clinicId,
        actorId: c.userId,
        action: 'packages.redeem',
        category: 'FINANCE',
        targetType: 'PackageRedemption',
        targetId: redemption.id,
        outcome: 'SUCCESS',
        metadata: { patientPackageId: packageId, sessionsRedeemed: input.sessionsRedeemed, remainingSessions: newPackageRemaining },
      }, tx);

      return patientPackageDetail(tx, c.clinicId, packageId);
    });
  }

  reversePackageRedemption(proof: VerifiedPrincipal, clinicId: string, packageId: string, redemptionId: string, input: ReversePackageRedemptionDto) {
    return financialWrite(this.database, proof, clinicId, ['packages.redemptions.reverse'], async (tx, c) => {
      const hash = financialHash(input);
      const old = await tx.packageRedemptionReversal.findFirst({ where: { clinicId: c.clinicId, requestKey: input.requestKey } });
      if (old) {
        if (old.requestHash !== hash) throw new BillingError('BILLING_RETRY');
        return patientPackageDetail(tx, c.clinicId, packageId);
      }

      const redemption = await tx.packageRedemption.findFirst({
        where: { clinicId: c.clinicId, id: redemptionId, patientPackageId: packageId },
      });
      if (!redemption) throw new NotFoundException('REDEMPTION_NOT_FOUND');
      if (redemption.status === 'REVERSED') throw new BillingError('REDEMPTION_ALREADY_REVERSED');

      const pp = await tx.patientPackage.findFirstOrThrow({ where: { clinicId: c.clinicId, id: packageId } });
      if (input.expectedVersion && pp.version !== input.expectedVersion) {
        throw new BillingError('BILLING_STALE');
      }
      const entitlement = await tx.patientPackageEntitlement.findFirstOrThrow({
        where: { clinicId: c.clinicId, id: redemption.entitlementId },
      });

      await tx.packageRedemptionReversal.create({
        data: {
          clinicId: c.clinicId,
          redemptionId,
          reason: (input.reasonDetails ? `${input.reason}: ${input.reasonDetails}` : input.reason).trim(),
          reversedByMembershipId: c.membershipId,
          requestKey: input.requestKey,
          requestHash: hash,
        },
      });

      await tx.packageRedemption.update({
        where: { clinicId_id: { clinicId: c.clinicId, id: redemptionId } },
        data: { status: 'REVERSED', version: { increment: 1 } },
      });

      await tx.patientPackageEntitlement.update({
        where: { clinicId_id: { clinicId: c.clinicId, id: entitlement.id } },
        data: {
          redeemedSessions: entitlement.redeemedSessions - redemption.sessionsRedeemed,
          remainingSessions: entitlement.remainingSessions + redemption.sessionsRedeemed,
          version: { increment: 1 },
        },
      });

      const newRemaining = pp.remainingSessions + redemption.sessionsRedeemed;
      await tx.patientPackage.update({
        where: { clinicId_id: { clinicId: c.clinicId, id: packageId } },
        data: {
          redeemedSessions: pp.redeemedSessions - redemption.sessionsRedeemed,
          remainingSessions: newRemaining,
          status: pp.status === 'EXHAUSTED' ? 'ACTIVE' : pp.status,
          version: { increment: 1 },
        },
      });

      await this.auditRepo.record({
        clinicId: c.clinicId,
        actorId: c.userId,
        action: 'packages.reverse-redemption',
        category: 'FINANCE',
        targetType: 'PackageRedemptionReversal',
        targetId: redemptionId,
        outcome: 'SUCCESS',
        metadata: { patientPackageId: packageId, reason: input.reason.trim() },
      }, tx);

      return patientPackageDetail(tx, c.clinicId, packageId);
    });
  }

  // ---------------------------------------------------------------------------
  // Step 4.4: Installment Payment Plans
  // ---------------------------------------------------------------------------

  listInstallmentPlans(proof: VerifiedPrincipal, clinicId: string, q: InstallmentPlanQuery) {
    return this.database.withClinicContext(proof, clinicId, ['installments.read'], async (tx, c) => {
      const where: Prisma.InstallmentPlanWhereInput = {
        clinicId: c.clinicId,
        ...(q.patientId ? { patientId: q.patientId } : {}),
        ...(q.invoiceId ? { invoiceId: q.invoiceId } : {}),
        ...(q.status === 'ALL' ? {} : { status: q.status }),
      };
      if (q.cursor) {
        const anchor = await tx.installmentPlan.findFirst({ where: { clinicId: c.clinicId, id: q.cursor }, select: { createdAt: true, id: true } });
        if (!anchor) throw new NotFoundException();
        where.AND = { OR: [{ createdAt: { lt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { lt: anchor.id } }] };
      }
      const rows = await tx.installmentPlan.findMany({
        where,
        include: {
          patient: { select: { id: true, fullName: true, patientNumber: true } },
          invoice: { select: { id: true, number: true, totalMinor: true, netPaidMinor: true } },
          schedules: {
            where: { clinicId: c.clinicId },
            include: { allocations: true },
            orderBy: { installmentNumber: 'asc' },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: q.pageSize + 1,
      });
      return {
        items: rows.slice(0, q.pageSize).map(installmentPlanResponse),
        hasMore: rows.length > q.pageSize,
        nextCursor: rows.length > q.pageSize ? rows[q.pageSize - 1].id : null,
      };
    });
  }

  getInstallmentPlan(proof: VerifiedPrincipal, clinicId: string, id: string) {
    return this.database.withClinicContext(proof, clinicId, ['installments.read'], (tx, c) => installmentPlanDetail(tx, c.clinicId, id));
  }

  createInstallmentPlan(proof: VerifiedPrincipal, clinicId: string, input: CreateInstallmentPlanDto) {
    return financialWrite(this.database, proof, clinicId, ['installments.manage'], async (tx, c) => {
      const hash = financialHash(input);
      const old = await tx.installmentPlan.findFirst({ where: { clinicId: c.clinicId, requestKey: input.requestKey } });
      if (old) {
        if (old.requestHash !== hash) throw new BillingError('BILLING_RETRY');
        return installmentPlanDetail(tx, c.clinicId, old.id);
      }

      const inv = await tx.invoice.findFirst({ where: { clinicId: c.clinicId, id: input.invoiceId, patientId: input.patientId } });
      if (!inv) throw new NotFoundException('INVOICE_NOT_FOUND');
      if (!['ISSUED', 'PARTIALLY_PAID'].includes(inv.status)) throw new BillingError('BILLING_STATE');

      const scale = inv.currencyScale;
      const totalAmountMinor = fixed(input.totalAmount, scale);

      // Verify schedule total matches totalAmountMinor
      let scheduleTotal = 0n;
      const scheduleData = [];
      for (const s of input.schedules) {
        const expected = fixed(s.expectedAmount, scale);
        scheduleTotal += expected;
        scheduleData.push({
          clinicId: c.clinicId,
          installmentNumber: s.installmentNumber,
          dueDate: new Date(`${s.dueDate}T00:00:00.000Z`),
          expectedAmountMinor: expected,
          paidAmountMinor: 0n,
          status: 'PENDING' as const,
        });
      }
      if (scheduleTotal !== totalAmountMinor) {
        throw new BadRequestException('Sum of installment amounts must equal plan total amount');
      }

      const counter = await tx.installmentPlanCounter.upsert({
        where: { clinicId: c.clinicId },
        create: { clinicId: c.clinicId, lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
        select: { lastNumber: true },
      });
      const planNumber = `IP-${String(counter.lastNumber).padStart(6, '0')}`;

      const created = await tx.installmentPlan.create({
        data: {
          clinicId: c.clinicId,
          patientId: input.patientId,
          invoiceId: input.invoiceId,
          patientPackageId: input.patientPackageId || null,
          planNumber,
          totalAmountMinor,
          paidAmountMinor: 0n,
          remainingAmountMinor: totalAmountMinor,
          currency: inv.currency,
          currencyScale: scale,
          numberOfInstallments: input.numberOfInstallments,
          status: 'ACTIVE',
          notes: input.notes?.trim() || null,
          requestKey: input.requestKey,
          requestHash: hash,
        },
      });

      await tx.installmentSchedule.createMany({
        data: scheduleData.map((s) => ({ ...s, planId: created.id })),
      });

      // If the invoice already has payments recorded, deterministically allocate them
      const payments = await tx.payment.findMany({
        where: { clinicId: c.clinicId, invoiceId: inv.id },
        orderBy: { createdAt: 'asc' },
      });

      if (payments.length > 0) {
        const schedules = await tx.installmentSchedule.findMany({
          where: { clinicId: c.clinicId, planId: created.id },
          orderBy: { installmentNumber: 'asc' },
        });

        let currentSchedIdx = 0;
        let totalAllocated = 0n;

        for (const p of payments) {
          let unallocated = p.amountMinor;
          while (unallocated > 0n && currentSchedIdx < schedules.length) {
            const sched = schedules[currentSchedIdx];
            const needed = sched.expectedAmountMinor - sched.paidAmountMinor;
            if (needed <= 0n) {
              currentSchedIdx++;
              continue;
            }
            const alloc = unallocated < needed ? unallocated : needed;
            await tx.installmentAllocation.create({
              data: {
                clinicId: c.clinicId,
                planId: created.id,
                scheduleId: sched.id,
                paymentId: p.id,
                allocatedMinor: alloc,
                allocatedByMembershipId: c.membershipId,
                notes: 'Automatic invoice payment allocation',
              },
            });
            sched.paidAmountMinor += alloc;
            unallocated -= alloc;
            totalAllocated += alloc;

            await tx.installmentSchedule.update({
              where: { clinicId_id: { clinicId: c.clinicId, id: sched.id } },
              data: {
                paidAmountMinor: sched.paidAmountMinor,
                status: sched.paidAmountMinor === sched.expectedAmountMinor ? 'PAID' : 'PARTIALLY_PAID',
                paidAt: sched.paidAmountMinor === sched.expectedAmountMinor ? new Date() : null,
              },
            });

            if (sched.paidAmountMinor === sched.expectedAmountMinor) {
              currentSchedIdx++;
            }
          }
        }

        if (totalAllocated > 0n) {
          await tx.installmentPlan.update({
            where: { clinicId_id: { clinicId: c.clinicId, id: created.id } },
            data: {
              paidAmountMinor: totalAllocated,
              remainingAmountMinor: totalAmountMinor - totalAllocated,
              status: totalAllocated === totalAmountMinor ? 'COMPLETED' : 'ACTIVE',
            },
          });
        }
      }

      await this.auditRepo.record({
        clinicId: c.clinicId,
        actorId: c.userId,
        action: 'installments.create',
        category: 'FINANCE',
        targetType: 'InstallmentPlan',
        targetId: created.id,
        outcome: 'SUCCESS',
        metadata: { planNumber, totalAmountMinor: totalAmountMinor.toString() },
      }, tx);

      return installmentPlanDetail(tx, c.clinicId, created.id);
    });
  }

  allocateInstallmentPayment(proof: VerifiedPrincipal, clinicId: string, planId: string, input: AllocateInstallmentPaymentDto) {
    return financialWrite(this.database, proof, clinicId, ['installments.allocate'], async (tx, c) => {
      const plan = await tx.installmentPlan.findFirst({ where: { clinicId: c.clinicId, id: planId } });
      if (!plan) throw new NotFoundException('INSTALLMENT_PLAN_NOT_FOUND');
      if (plan.status !== 'ACTIVE') throw new BillingError('BILLING_STATE');

      const schedule = await tx.installmentSchedule.findFirst({
        where: { clinicId: c.clinicId, id: input.scheduleId, planId },
      });
      if (!schedule) throw new NotFoundException('INSTALLMENT_SCHEDULE_NOT_FOUND');

      const payment = await tx.payment.findFirst({
        where: { clinicId: c.clinicId, id: input.paymentId, invoiceId: plan.invoiceId },
        include: { reversals: true },
      });
      if (!payment) throw new NotFoundException('PAYMENT_NOT_FOUND');

      const allocAmount = fixed(input.amount, plan.currencyScale);
      if (allocAmount <= 0n) throw new BillingError('BILLING_AMOUNT');

      // Check remaining on schedule
      const schedRemaining = schedule.expectedAmountMinor - schedule.paidAmountMinor;
      if (allocAmount > schedRemaining) throw new BillingError('INSTALLMENT_OVERPAYMENT');

      // Check available unallocated on payment
      const existingAllocs = await tx.installmentAllocation.findMany({
        where: { clinicId: c.clinicId, paymentId: input.paymentId },
      });
      const totalAllocatedFromPayment = existingAllocs.reduce((sum, a) => sum + a.allocatedMinor, 0n);
      const refundedFromPayment = payment.reversals.reduce((sum, r) => sum + r.amountMinor, 0n);
      const availablePayment = payment.amountMinor - totalAllocatedFromPayment - refundedFromPayment;
      if (allocAmount > availablePayment) throw new BillingError('INSTALLMENT_PAYMENT_UNAVAILABLE');

      await tx.installmentAllocation.create({
        data: {
          clinicId: c.clinicId,
          planId,
          scheduleId: schedule.id,
          paymentId: payment.id,
          allocatedMinor: allocAmount,
          allocatedByMembershipId: c.membershipId,
          notes: input.notes?.trim() || null,
        },
      });

      const newSchedPaid = schedule.paidAmountMinor + allocAmount;
      await tx.installmentSchedule.update({
        where: { clinicId_id: { clinicId: c.clinicId, id: schedule.id } },
        data: {
          paidAmountMinor: newSchedPaid,
          status: newSchedPaid === schedule.expectedAmountMinor ? 'PAID' : 'PARTIALLY_PAID',
          paidAt: newSchedPaid === schedule.expectedAmountMinor ? new Date() : null,
          version: { increment: 1 },
        },
      });

      const newPlanPaid = plan.paidAmountMinor + allocAmount;
      const newPlanRemaining = plan.totalAmountMinor - newPlanPaid;
      await tx.installmentPlan.update({
        where: { clinicId_id: { clinicId: c.clinicId, id: planId } },
        data: {
          paidAmountMinor: newPlanPaid,
          remainingAmountMinor: newPlanRemaining,
          status: newPlanRemaining === 0n ? 'COMPLETED' : 'ACTIVE',
          version: { increment: 1 },
        },
      });

      await this.auditRepo.record({
        clinicId: c.clinicId,
        actorId: c.userId,
        action: 'installments.allocate',
        category: 'FINANCE',
        targetType: 'InstallmentAllocation',
        targetId: planId,
        outcome: 'SUCCESS',
        metadata: { scheduleId: schedule.id, paymentId: payment.id, allocatedMinor: allocAmount.toString() },
      }, tx);

      return installmentPlanDetail(tx, c.clinicId, planId);
    });
  }

  // ---------------------------------------------------------------------------
  // Step 4.4: Refunds & Cancellations
  // ---------------------------------------------------------------------------

  listRefundRequests(proof: VerifiedPrincipal, clinicId: string, q: RefundRequestQuery) {
    return this.database.withClinicContext(proof, clinicId, ['refunds.request'], async (tx, c) => {
      const where: Prisma.RefundRequestWhereInput = {
        clinicId: c.clinicId,
        ...(q.invoiceId ? { invoiceId: q.invoiceId } : {}),
        ...(q.patientId ? { patientId: q.patientId } : {}),
        ...(q.status === 'ALL' ? {} : { status: q.status }),
      };
      if (q.cursor) {
        const anchor = await tx.refundRequest.findFirst({ where: { clinicId: c.clinicId, id: q.cursor }, select: { createdAt: true, id: true } });
        if (!anchor) throw new NotFoundException();
        where.AND = { OR: [{ createdAt: { lt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { lt: anchor.id } }] };
      }
      const rows = await tx.refundRequest.findMany({
        where,
        include: {
          patient: { select: { id: true, fullName: true, patientNumber: true } },
          invoice: { select: { id: true, number: true, totalMinor: true, netPaidMinor: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: q.pageSize + 1,
      });
      return {
        items: rows.slice(0, q.pageSize).map(refundRequestResponse),
        hasMore: rows.length > q.pageSize,
        nextCursor: rows.length > q.pageSize ? rows[q.pageSize - 1].id : null,
      };
    });
  }

  getRefundRequest(proof: VerifiedPrincipal, clinicId: string, id: string) {
    return this.database.withClinicContext(proof, clinicId, ['refunds.request'], (tx, c) => refundRequestDetail(tx, c.clinicId, id));
  }

  createRefundRequest(proof: VerifiedPrincipal, clinicId: string, input: CreateRefundRequestDto) {
    return financialWrite(this.database, proof, clinicId, ['refunds.request'], async (tx, c) => {
      const hash = financialHash(input);
      const old = await tx.refundRequest.findFirst({ where: { clinicId: c.clinicId, requestKey: input.requestKey } });
      if (old) {
        if (old.requestHash !== hash) throw new BillingError('BILLING_RETRY');
        return refundRequestDetail(tx, c.clinicId, old.id);
      }

      const inv = await tx.invoice.findFirst({ where: { clinicId: c.clinicId, id: input.invoiceId, patientId: input.patientId } });
      if (!inv) throw new NotFoundException('INVOICE_NOT_FOUND');
      if (!['ISSUED', 'PARTIALLY_PAID', 'PAID'].includes(inv.status)) throw new BillingError('BILLING_STATE');

      const requestedMinor = fixed(input.amount, inv.currencyScale);
      if (requestedMinor <= 0n) throw new BillingError('BILLING_AMOUNT');

      // Check against invoice net paid minus pending requested/approved refunds
      const existingRefunds = await tx.refundRequest.findMany({
        where: { clinicId: c.clinicId, invoiceId: inv.id, status: { in: ['REQUESTED', 'APPROVED'] } },
      });
      const committedRefunds = existingRefunds.reduce((sum, r) => sum + r.requestedAmountMinor, 0n);
      if (requestedMinor > inv.netPaidMinor - committedRefunds) throw new BillingError('REFUND_EXCEEDS_NET_PAID');

      const created = await tx.refundRequest.create({
        data: {
          clinicId: c.clinicId,
          invoiceId: inv.id,
          patientId: input.patientId,
          patientPackageId: input.patientPackageId || null,
          requestedAmountMinor: requestedMinor,
          currency: inv.currency,
          currencyScale: inv.currencyScale,
          reason: input.reason,
          reasonDetails: input.reasonDetails.trim(),
          status: 'REQUESTED',
          requestedByMembershipId: c.membershipId,
          requestKey: input.requestKey,
          requestHash: hash,
        },
      });

      await this.auditRepo.record({
        clinicId: c.clinicId,
        actorId: c.userId,
        action: 'refunds.request',
        category: 'FINANCE',
        targetType: 'RefundRequest',
        targetId: created.id,
        outcome: 'SUCCESS',
        metadata: { invoiceId: inv.id, requestedAmountMinor: requestedMinor.toString(), reason: input.reason },
      }, tx);

      return refundRequestDetail(tx, c.clinicId, created.id);
    });
  }

  approveRefundRequest(proof: VerifiedPrincipal, clinicId: string, id: string, input: DecideRefundRequestDto) {
    return financialWrite(this.database, proof, clinicId, ['refunds.approve'], async (tx, c) => {
      const r = await tx.refundRequest.findFirst({ where: { clinicId: c.clinicId, id } });
      if (!r) throw new NotFoundException('REFUND_REQUEST_NOT_FOUND');
      if (r.version !== input.expectedVersion) throw new BillingError('BILLING_STALE');
      if (r.status !== 'REQUESTED') throw new BillingError('REFUND_ALREADY_DECIDED');
      if (r.requestedByMembershipId === c.membershipId) throw new BillingError('REFUND_SELF_APPROVAL_FORBIDDEN');

      await tx.refundRequest.update({
        where: { clinicId_id: { clinicId: c.clinicId, id } },
        data: {
          status: 'APPROVED',
          approvedByMembershipId: c.membershipId,
          approvedAt: new Date(),
          version: { increment: 1 },
        },
      });

      await this.auditRepo.record({
        clinicId: c.clinicId,
        actorId: c.userId,
        action: 'refunds.approve',
        category: 'FINANCE',
        targetType: 'RefundRequest',
        targetId: id,
        outcome: 'SUCCESS',
      }, tx);

      return refundRequestDetail(tx, c.clinicId, id);
    });
  }

  rejectRefundRequest(proof: VerifiedPrincipal, clinicId: string, id: string, input: DecideRefundRequestDto) {
    return financialWrite(this.database, proof, clinicId, ['refunds.reject'], async (tx, c) => {
      const r = await tx.refundRequest.findFirst({ where: { clinicId: c.clinicId, id } });
      if (!r) throw new NotFoundException('REFUND_REQUEST_NOT_FOUND');
      if (r.version !== input.expectedVersion) throw new BillingError('BILLING_STALE');
      if (r.status !== 'REQUESTED') throw new BillingError('REFUND_ALREADY_DECIDED');

      await tx.refundRequest.update({
        where: { clinicId_id: { clinicId: c.clinicId, id } },
        data: {
          status: 'REJECTED',
          rejectedByMembershipId: c.membershipId,
          rejectedAt: new Date(),
          rejectionReason: input.rejectionReason?.trim() || 'Rejected by clinic administration',
          version: { increment: 1 },
        },
      });

      await this.auditRepo.record({
        clinicId: c.clinicId,
        actorId: c.userId,
        action: 'refunds.reject',
        category: 'FINANCE',
        targetType: 'RefundRequest',
        targetId: id,
        outcome: 'SUCCESS',
      }, tx);

      return refundRequestDetail(tx, c.clinicId, id);
    });
  }

  settleRefundRequest(proof: VerifiedPrincipal, clinicId: string, id: string, input: SettleRefundRequestDto) {
    return financialWrite(this.database, proof, clinicId, ['refunds.settle'], async (tx, c) => {
      const r = await tx.refundRequest.findFirst({ where: { clinicId: c.clinicId, id } });
      if (!r) throw new NotFoundException('REFUND_REQUEST_NOT_FOUND');
      if (r.version !== input.expectedVersion) throw new BillingError('BILLING_STALE');
      if (r.status !== 'APPROVED') throw new BillingError('BILLING_STATE');

      const inv = await tx.invoice.findFirstOrThrow({ where: { clinicId: c.clinicId, id: r.invoiceId } });

      // Find an eligible payment on the invoice to attach the refund reversal to
      const payments = await tx.payment.findMany({
        where: { clinicId: c.clinicId, invoiceId: inv.id },
        include: { reversals: true },
        orderBy: { createdAt: 'desc' },
      });

      let eligiblePayment = null;
      for (const p of payments) {
        const refunded = p.reversals.reduce((sum, rev) => sum + rev.amountMinor, 0n);
        if (p.amountMinor - refunded >= r.requestedAmountMinor) {
          eligiblePayment = p;
          break;
        }
      }

      if (!eligiblePayment) throw new BillingError('REFUND_SETTLEMENT_FAILED');

      const hash = financialHash(input);
      const reversal = await tx.paymentReversal.create({
        data: {
          clinicId: c.clinicId,
          invoiceId: inv.id,
          paymentId: eligiblePayment.id,
          amountMinor: r.requestedAmountMinor,
          currency: r.currency,
          currencyScale: r.currencyScale,
          kind: 'REFUND',
          reason: r.reason,
          requestKey: input.requestKey,
          requestHash: hash,
        },
      });

      const newNetPaid = inv.netPaidMinor - r.requestedAmountMinor;
      const updatedInv = await tx.invoice.update({
        where: { clinicId_id: { clinicId: c.clinicId, id: inv.id } },
        data: {
          netPaidMinor: newNetPaid,
          status: paidStatus(newNetPaid, inv.totalMinor),
          version: { increment: 1 },
        },
      });

      await tx.refundRequest.update({
        where: { clinicId_id: { clinicId: c.clinicId, id } },
        data: {
          status: 'SETTLED',
          settledAt: new Date(),
          settledByMembershipId: c.membershipId,
          settlementReference: input.settlementReference?.trim() || null,
          paymentReversalId: reversal.id,
          version: { increment: 1 },
        },
      });

      await audit(tx, c, 'PAYMENT_REFUNDED', inv.id, updatedInv.version, {
        paymentId: eligiblePayment.id,
        reversalId: reversal.id,
        amountMinor: r.requestedAmountMinor.toString(),
        reason: r.reason,
      });

      await this.auditRepo.record({
        clinicId: c.clinicId,
        actorId: c.userId,
        action: 'refunds.settle',
        category: 'FINANCE',
        targetType: 'RefundRequest',
        targetId: id,
        outcome: 'SUCCESS',
        metadata: { invoiceId: inv.id, amountMinor: r.requestedAmountMinor.toString() },
      }, tx);

      return refundRequestDetail(tx, c.clinicId, id);
    });
  }

  // ===========================================================================
  // Step 4.5: Practitioner Commissions, Settlements & Adjustments
  // ===========================================================================

  listCommissionPlans(proof: VerifiedPrincipal, clinicId: string) {
    return this.database.withClinicContext(proof, clinicId, ['commissions.plans.read'], async (tx, c) => {
      const plans = await tx.practitionerCommissionPlan.findMany({
        where: { clinicId: c.clinicId },
        include: {
          rules: { include: { procedure: { select: { id: true, nameAr: true } } }, orderBy: { createdAt: 'asc' } },
          assignments: {
            include: { practitioner: { include: { user: { select: { name: true } } } } },
            orderBy: { effectiveFrom: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      return plans.map(commissionPlanResponse);
    });
  }

  getCommissionPlan(proof: VerifiedPrincipal, clinicId: string, id: string) {
    return this.database.withClinicContext(proof, clinicId, ['commissions.plans.read'], (tx, c) => commissionPlanDetail(tx, c.clinicId, id));
  }

  createCommissionPlan(proof: VerifiedPrincipal, clinicId: string, input: CreateCommissionPlanDto) {
    return financialWrite(this.database, proof, clinicId, ['commissions.plans.manage'], async (tx, c) => {
      const clinic = await tx.clinic.findUnique({ where: { id: c.clinicId }, select: { currency: true } });
      const scale = currencyScale(clinic?.currency ?? 'SAR');

      const existing = await tx.practitionerCommissionPlan.findFirst({
        where: { clinicId: c.clinicId, code: input.code.trim().toUpperCase() },
      });
      if (existing) throw new BillingError('PACKAGE_CODE_EXISTS');

      const plan = await tx.practitionerCommissionPlan.create({
        data: {
          clinicId: c.clinicId,
          code: input.code.trim().toUpperCase(),
          name: input.name.trim(),
          description: input.description?.trim() || null,
          status: 'ACTIVE',
          currency: clinic?.currency ?? 'SAR',
          currencyScale: scale,
        },
      });

      await this.auditRepo.record({
        clinicId: c.clinicId,
        actorId: c.userId,
        action: 'commissions.plan.create',
        category: 'FINANCE',
        targetType: 'PractitionerCommissionPlan',
        targetId: plan.id,
        outcome: 'SUCCESS',
        metadata: { code: plan.code, name: plan.name },
      }, tx);

      return commissionPlanDetail(tx, c.clinicId, plan.id);
    });
  }

  createCommissionRule(proof: VerifiedPrincipal, clinicId: string, planId: string, input: CreateCommissionRuleDto) {
    return financialWrite(this.database, proof, clinicId, ['commissions.plans.manage'], async (tx, c) => {
      const plan = await tx.practitionerCommissionPlan.findFirst({ where: { clinicId: c.clinicId, id: planId } });
      if (!plan) throw new NotFoundException('COMMISSION_PLAN_NOT_FOUND');
      if (plan.status !== 'ACTIVE') throw new BillingError('COMMISSION_PLAN_INACTIVE');

      let flatAmountMinor: bigint | null = null;
      if (input.calculationType === 'FLAT_AMOUNT') {
        if (!input.flatAmount) throw new BillingError('COMMISSION_CALCULATION_INVALID');
        flatAmountMinor = fixed(input.flatAmount, plan.currencyScale);
      }

      if (input.procedureId) {
        const proc = await tx.aestheticProcedureCatalog.findFirst({
          where: { clinicId: c.clinicId, id: input.procedureId },
        });
        if (!proc) throw new NotFoundException('PROCEDURE_NOT_FOUND');
      }

      const rule = await tx.practitionerCommissionRule.create({
        data: {
          clinicId: c.clinicId,
          planId,
          procedureId: input.procedureId || null,
          calculationType: input.calculationType,
          rateBasisPoints: input.calculationType === 'PERCENTAGE' ? input.rateBasisPoints : null,
          flatAmountMinor,
          earningEvent: input.earningEvent,
          description: input.description?.trim() || null,
          isPublished: true,
        },
      });

      await this.auditRepo.record({
        clinicId: c.clinicId,
        actorId: c.userId,
        action: 'commissions.rule.create',
        category: 'FINANCE',
        targetType: 'PractitionerCommissionRule',
        targetId: rule.id,
        outcome: 'SUCCESS',
        metadata: { planId, calculationType: input.calculationType, earningEvent: input.earningEvent },
      }, tx);

      return commissionPlanDetail(tx, c.clinicId, planId);
    });
  }

  assignPractitionerToPlan(proof: VerifiedPrincipal, clinicId: string, planId: string, input: AssignPractitionerPlanDto) {
    return financialWrite(this.database, proof, clinicId, ['commissions.plans.manage'], async (tx, c) => {
      const plan = await tx.practitionerCommissionPlan.findFirst({ where: { clinicId: c.clinicId, id: planId } });
      if (!plan) throw new NotFoundException('COMMISSION_PLAN_NOT_FOUND');

      const membership = await tx.clinicMembership.findFirst({
        where: { clinicId: c.clinicId, id: input.practitionerMembershipId, status: 'ACTIVE' },
      });
      if (!membership) throw new NotFoundException('Practitioner membership not found');

      const assignment = await tx.practitionerCommissionAssignment.create({
        data: {
          clinicId: c.clinicId,
          planId,
          practitionerMembershipId: input.practitionerMembershipId,
          effectiveFrom: new Date(input.effectiveFrom),
          effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
          notes: input.notes?.trim() || null,
        },
      });

      await this.auditRepo.record({
        clinicId: c.clinicId,
        actorId: c.userId,
        action: 'commissions.assign',
        category: 'FINANCE',
        targetType: 'PractitionerCommissionAssignment',
        targetId: assignment.id,
        outcome: 'SUCCESS',
        metadata: { planId, practitionerMembershipId: input.practitionerMembershipId },
      }, tx);

      return commissionPlanDetail(tx, c.clinicId, planId);
    });
  }

  listCommissionAccruals(proof: VerifiedPrincipal, clinicId: string, q: CommissionQuery) {
    return this.database.withClinicContext(proof, clinicId, ['commissions.accruals.read'], async (tx, c) => {
      const where: Prisma.PractitionerCommissionAccrualWhereInput = {
        clinicId: c.clinicId,
        ...(q.practitionerMembershipId ? { practitionerMembershipId: q.practitionerMembershipId } : {}),
        ...(q.status && q.status !== 'ALL' ? { status: q.status as any } : {}),
        ...(q.startDate || q.endDate ? {
          earnedAt: {
            ...(q.startDate ? { gte: new Date(q.startDate) } : {}),
            ...(q.endDate ? { lte: new Date(q.endDate) } : {}),
          },
        } : {}),
      };

      const rows = await tx.practitionerCommissionAccrual.findMany({
        where,
        include: {
          plan: { select: { id: true, name: true, code: true } },
          practitioner: { include: { user: { select: { name: true } } } },
          patient: { select: { id: true, fullName: true, patientNumber: true } },
          invoice: { select: { id: true, number: true, totalMinor: true } },
          adjustments: { orderBy: { createdAt: 'desc' } },
        },
        orderBy: { earnedAt: 'desc' },
        take: q.limit ?? 50,
      });

      return rows.map(commissionAccrualResponse);
    });
  }

  getMyCommissionStatement(proof: VerifiedPrincipal, clinicId: string, q: CommissionQuery) {
    return this.database.withClinicContext(proof, clinicId, ['commissions.accruals.read-own'], async (tx, c) => {
      // Force practitioner filter strictly to the authenticated membership
      const where: Prisma.PractitionerCommissionAccrualWhereInput = {
        clinicId: c.clinicId,
        practitionerMembershipId: c.membershipId,
        ...(q.status && q.status !== 'ALL' ? { status: q.status as any } : {}),
        ...(q.startDate || q.endDate ? {
          earnedAt: {
            ...(q.startDate ? { gte: new Date(q.startDate) } : {}),
            ...(q.endDate ? { lte: new Date(q.endDate) } : {}),
          },
        } : {}),
      };

      const rows = await tx.practitionerCommissionAccrual.findMany({
        where,
        include: {
          plan: { select: { id: true, name: true, code: true } },
          practitioner: { include: { user: { select: { name: true } } } },
          patient: { select: { id: true, fullName: true, patientNumber: true } },
          invoice: { select: { id: true, number: true, totalMinor: true } },
          adjustments: { orderBy: { createdAt: 'desc' } },
        },
        orderBy: { earnedAt: 'desc' },
        take: q.limit ?? 50,
      });

      const totalAccruedMinor = rows.reduce((sum, r) => sum + r.commissionAmountMinor, 0n);
      const settledMinor = rows.filter(r => r.status === 'SETTLED').reduce((sum, r) => sum + r.commissionAmountMinor, 0n);
      const pendingMinor = rows.filter(r => ['PENDING', 'APPROVED'].includes(r.status)).reduce((sum, r) => sum + r.commissionAmountMinor, 0n);

      return {
        practitionerMembershipId: c.membershipId,
        totalAccruedMinor: totalAccruedMinor.toString(),
        settledMinor: settledMinor.toString(),
        pendingMinor: pendingMinor.toString(),
        items: rows.map(commissionAccrualResponse),
      };
    });
  }

  getCommissionAccrual(proof: VerifiedPrincipal, clinicId: string, id: string) {
    return this.database.withClinicContext(proof, clinicId, ['commissions.accruals.read'], (tx, c) => commissionAccrualDetail(tx, c.clinicId, id));
  }

  createCommissionAccrual(proof: VerifiedPrincipal, clinicId: string, input: CreateCommissionAccrualDto) {
    return financialWrite(this.database, proof, clinicId, ['commissions.accruals.manage'], async (tx, c) => {
      const hash = financialHash(input);
      const old = await tx.practitionerCommissionAccrual.findFirst({ where: { clinicId: c.clinicId, requestKey: input.requestKey } });
      if (old) {
        if (old.requestHash !== hash) throw new BillingError('BILLING_RETRY');
        return commissionAccrualDetail(tx, c.clinicId, old.id);
      }

      const plan = await tx.practitionerCommissionPlan.findFirst({ where: { clinicId: c.clinicId, id: input.planId } });
      if (!plan) throw new NotFoundException('COMMISSION_PLAN_NOT_FOUND');

      const rule = await tx.practitionerCommissionRule.findFirst({ where: { clinicId: c.clinicId, id: input.ruleId, planId: input.planId } });
      if (!rule) throw new NotFoundException('COMMISSION_RULE_NOT_FOUND');

      const inv = await tx.invoice.findFirst({ where: { clinicId: c.clinicId, id: input.invoiceId } });
      if (!inv) throw new NotFoundException('INVOICE_NOT_FOUND');

      // Prevent unperformed / cancelled procedure execution commissions
      if (input.procedureExecutionId) {
        const proc = await tx.procedureExecution.findFirst({
          where: { clinicId: c.clinicId, id: input.procedureExecutionId },
        });
        if (!proc) throw new NotFoundException('PROCEDURE_NOT_FOUND');
        if (proc.status !== 'COMPLETED') {
          throw new BadRequestException('Commission can only be accrued for completed procedure executions');
        }
      }

      const baseAmountMinor = fixed(input.baseAmount, plan.currencyScale);
      if (baseAmountMinor < 0n) throw new BillingError('BILLING_AMOUNT');

      let commissionAmountMinor: bigint;
      if (rule.calculationType === 'PERCENTAGE') {
        const bps = BigInt(rule.rateBasisPoints ?? 0);
        commissionAmountMinor = (baseAmountMinor * bps + 5000n) / 10000n;
      } else {
        commissionAmountMinor = rule.flatAmountMinor ?? 0n;
      }

      const created = await tx.practitionerCommissionAccrual.create({
        data: {
          clinicId: c.clinicId,
          planId: plan.id,
          ruleId: rule.id,
          ruleVersion: rule.ruleVersion,
          practitionerMembershipId: input.practitionerMembershipId,
          patientId: input.patientId,
          invoiceId: input.invoiceId,
          procedureExecutionId: input.procedureExecutionId || null,
          appointmentId: input.appointmentId || null,
          baseAmountMinor,
          rateBasisPoints: rule.rateBasisPoints,
          flatAmountMinor: rule.flatAmountMinor,
          commissionAmountMinor,
          currency: plan.currency,
          currencyScale: plan.currencyScale,
          status: 'PENDING',
          earningEvent: input.earningEvent,
          notes: input.notes?.trim() || null,
          requestKey: input.requestKey,
          requestHash: hash,
        },
      });

      await this.auditRepo.record({
        clinicId: c.clinicId,
        actorId: c.userId,
        action: 'commissions.accrue',
        category: 'FINANCE',
        targetType: 'PractitionerCommissionAccrual',
        targetId: created.id,
        outcome: 'SUCCESS',
        metadata: {
          practitionerMembershipId: input.practitionerMembershipId,
          commissionAmountMinor: commissionAmountMinor.toString(),
          ruleId: rule.id,
        },
      }, tx);

      return commissionAccrualDetail(tx, c.clinicId, created.id);
    });
  }

  requestCommissionAdjustment(proof: VerifiedPrincipal, clinicId: string, accrualId: string, input: RequestCommissionAdjustmentDto) {
    return financialWrite(this.database, proof, clinicId, ['commissions.adjustments.request'], async (tx, c) => {
      const hash = financialHash(input);
      const old = await tx.practitionerCommissionAdjustment.findFirst({ where: { clinicId: c.clinicId, requestKey: input.requestKey } });
      if (old) {
        if (old.requestHash !== hash) throw new BillingError('BILLING_RETRY');
        return commissionAdjustmentResponse(old);
      }

      const accrual = await tx.practitionerCommissionAccrual.findFirst({ where: { clinicId: c.clinicId, id: accrualId } });
      if (!accrual) throw new NotFoundException('COMMISSION_ACCRUAL_NOT_FOUND');

      const adjAmountMinor = signedFixed(input.adjustmentAmount, accrual.currencyScale);
      if (adjAmountMinor === 0n) throw new BillingError('BILLING_AMOUNT');

      const created = await tx.practitionerCommissionAdjustment.create({
        data: {
          clinicId: c.clinicId,
          accrualId,
          adjustmentAmountMinor: adjAmountMinor,
          reason: input.reason,
          reasonDetails: input.reasonDetails.trim(),
          status: 'PENDING',
          requestedByMembershipId: c.membershipId,
          requestKey: input.requestKey,
          requestHash: hash,
        },
      });

      await this.auditRepo.record({
        clinicId: c.clinicId,
        actorId: c.userId,
        action: 'commissions.adjustment.request',
        category: 'FINANCE',
        targetType: 'PractitionerCommissionAdjustment',
        targetId: created.id,
        outcome: 'SUCCESS',
        metadata: { accrualId, adjustmentAmountMinor: adjAmountMinor.toString(), reason: input.reason },
      }, tx);

      return commissionAdjustmentResponse(created);
    });
  }

  decideCommissionAdjustment(proof: VerifiedPrincipal, clinicId: string, adjustmentId: string, input: DecideCommissionAdjustmentDto) {
    return financialWrite(this.database, proof, clinicId, ['commissions.adjustments.decide'], async (tx, c) => {
      const adj = await tx.practitionerCommissionAdjustment.findFirst({ where: { clinicId: c.clinicId, id: adjustmentId } });
      if (!adj) throw new NotFoundException('COMMISSION_ADJUSTMENT_NOT_FOUND');
      if (adj.status !== 'PENDING') throw new BillingError('COMMISSION_ADJUSTMENT_ALREADY_DECIDED');

      // Segregation of duties: decider cannot be the same membership as requester
      if (adj.requestedByMembershipId === c.membershipId) {
        throw new BillingError('COMMISSION_SELF_DECISION_FORBIDDEN');
      }

      const newStatus = input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';

      const updated = await tx.practitionerCommissionAdjustment.update({
        where: { clinicId_id: { clinicId: c.clinicId, id: adjustmentId } },
        data: {
          status: newStatus,
          decidedByMembershipId: c.membershipId,
          decidedAt: new Date(),
          version: { increment: 1 },
        },
      });

      if (newStatus === 'APPROVED') {
        const accrual = await tx.practitionerCommissionAccrual.findFirstOrThrow({ where: { clinicId: c.clinicId, id: adj.accrualId } });
        const newCommission = accrual.commissionAmountMinor + adj.adjustmentAmountMinor;
        await tx.practitionerCommissionAccrual.update({
          where: { clinicId_id: { clinicId: c.clinicId, id: adj.accrualId } },
          data: {
            commissionAmountMinor: newCommission >= 0n ? newCommission : 0n,
            status: newCommission === 0n ? 'REVERSED' : 'ADJUSTED',
            version: { increment: 1 },
          },
        });
      }

      await this.auditRepo.record({
        clinicId: c.clinicId,
        actorId: c.userId,
        action: 'commissions.adjustment.decide',
        category: 'FINANCE',
        targetType: 'PractitionerCommissionAdjustment',
        targetId: adjustmentId,
        outcome: 'SUCCESS',
        metadata: { decision: newStatus, accrualId: adj.accrualId },
      }, tx);

      return commissionAdjustmentResponse(updated);
    });
  }

  listCommissionSettlements(proof: VerifiedPrincipal, clinicId: string, q: CommissionQuery) {
    return this.database.withClinicContext(proof, clinicId, ['commissions.settlements.read'], async (tx, c) => {
      const where: Prisma.PractitionerCommissionSettlementWhereInput = {
        clinicId: c.clinicId,
        ...(q.practitionerMembershipId ? { practitionerMembershipId: q.practitionerMembershipId } : {}),
        ...(q.status && q.status !== 'ALL' ? { status: q.status as any } : {}),
      };

      const rows = await tx.practitionerCommissionSettlement.findMany({
        where,
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
        orderBy: { createdAt: 'desc' },
        take: q.limit ?? 50,
      });

      return rows.map(commissionSettlementResponse);
    });
  }

  getCommissionSettlement(proof: VerifiedPrincipal, clinicId: string, id: string) {
    return this.database.withClinicContext(proof, clinicId, ['commissions.settlements.read'], (tx, c) => commissionSettlementDetail(tx, c.clinicId, id));
  }

  createCommissionSettlement(proof: VerifiedPrincipal, clinicId: string, input: CreateCommissionSettlementDto) {
    return financialWrite(this.database, proof, clinicId, ['commissions.settlements.manage'], async (tx, c) => {
      const hash = financialHash(input);
      const old = await tx.practitionerCommissionSettlement.findFirst({ where: { clinicId: c.clinicId, requestKey: input.requestKey } });
      if (old) {
        if (old.requestHash !== hash) throw new BillingError('BILLING_RETRY');
        return commissionSettlementDetail(tx, c.clinicId, old.id);
      }

      const practitioner = await tx.clinicMembership.findFirst({
        where: { clinicId: c.clinicId, id: input.practitionerMembershipId, status: 'ACTIVE' },
      });
      if (!practitioner) throw new NotFoundException('Practitioner membership not found');

      // Load eligible accruals
      const accruals = await tx.practitionerCommissionAccrual.findMany({
        where: {
          clinicId: c.clinicId,
          id: { in: input.accrualIds },
          practitionerMembershipId: input.practitionerMembershipId,
          status: { in: ['PENDING', 'APPROVED', 'ADJUSTED'] },
          settlementId: null,
        },
      });
      if (accruals.length !== input.accrualIds.length) {
        throw new BadRequestException('One or more accruals are invalid or already assigned to a settlement');
      }

      const grossAmountMinor = accruals.reduce((sum, a) => sum + a.commissionAmountMinor, 0n);

      // Load approved adjustments if any
      let adjustmentsAmountMinor = 0n;
      if (input.adjustmentIds && input.adjustmentIds.length > 0) {
        const adjustments = await tx.practitionerCommissionAdjustment.findMany({
          where: {
            clinicId: c.clinicId,
            id: { in: input.adjustmentIds },
            status: 'APPROVED',
            settlementId: null,
          },
        });
        if (adjustments.length !== input.adjustmentIds.length) {
          throw new BadRequestException('One or more adjustments are invalid or unapproved');
        }
        adjustmentsAmountMinor = adjustments.reduce((sum, a) => sum + a.adjustmentAmountMinor, 0n);
      }

      const netSettledMinor = grossAmountMinor + adjustmentsAmountMinor;
      if (netSettledMinor < 0n) throw new BadRequestException('Net settlement amount cannot be negative');

      const clinic = await tx.clinic.findUnique({ where: { id: c.clinicId }, select: { currency: true } });
      const scale = currencyScale(clinic?.currency ?? 'SAR');

      const counter = await tx.commissionSettlementCounter.upsert({
        where: { clinicId: c.clinicId },
        create: { clinicId: c.clinicId, lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
      });
      const settlementNumber = `COMM-SETTLE-${counter.lastNumber.toString().padStart(6, '0')}`;

      const created = await tx.practitionerCommissionSettlement.create({
        data: {
          clinicId: c.clinicId,
          settlementNumber,
          practitionerMembershipId: input.practitionerMembershipId,
          periodStart: new Date(input.periodStart),
          periodEnd: new Date(input.periodEnd),
          grossAmountMinor,
          adjustmentsAmountMinor,
          netSettledMinor,
          currency: clinic?.currency ?? 'SAR',
          currencyScale: scale,
          status: 'DRAFT',
          notes: input.notes?.trim() || null,
          requestKey: input.requestKey,
          requestHash: hash,
        },
      });

      // Link accruals to this settlement
      await tx.practitionerCommissionAccrual.updateMany({
        where: { clinicId: c.clinicId, id: { in: input.accrualIds } },
        data: { settlementId: created.id },
      });

      // Link adjustments if provided
      if (input.adjustmentIds && input.adjustmentIds.length > 0) {
        await tx.practitionerCommissionAdjustment.updateMany({
          where: { clinicId: c.clinicId, id: { in: input.adjustmentIds } },
          data: { settlementId: created.id },
        });
      }

      await this.auditRepo.record({
        clinicId: c.clinicId,
        actorId: c.userId,
        action: 'commissions.settlement.create',
        category: 'FINANCE',
        targetType: 'PractitionerCommissionSettlement',
        targetId: created.id,
        outcome: 'SUCCESS',
        metadata: {
          settlementNumber,
          netSettledMinor: netSettledMinor.toString(),
          accrualsCount: accruals.length,
        },
      }, tx);

      return commissionSettlementDetail(tx, c.clinicId, created.id);
    });
  }

  confirmCommissionSettlement(proof: VerifiedPrincipal, clinicId: string, id: string, input: ConfirmCommissionSettlementDto) {
    return financialWrite(this.database, proof, clinicId, ['commissions.settlements.manage'], async (tx, c) => {
      const s = await tx.practitionerCommissionSettlement.findFirst({ where: { clinicId: c.clinicId, id } });
      if (!s) throw new NotFoundException('COMMISSION_SETTLEMENT_NOT_FOUND');
      if (s.version !== input.expectedVersion) throw new BillingError('BILLING_STALE');
      if (s.status === 'CONFIRMED') throw new BillingError('COMMISSION_SETTLEMENT_ALREADY_CONFIRMED');

      await tx.practitionerCommissionSettlement.update({
        where: { clinicId_id: { clinicId: c.clinicId, id } },
        data: {
          status: 'CONFIRMED',
          payoutReference: input.payoutReference.trim(),
          confirmedByMembershipId: c.membershipId,
          confirmedAt: new Date(),
          version: { increment: 1 },
        },
      });

      // Mark attached accruals as SETTLED
      await tx.practitionerCommissionAccrual.updateMany({
        where: { clinicId: c.clinicId, settlementId: id },
        data: { status: 'SETTLED' },
      });

      await this.auditRepo.record({
        clinicId: c.clinicId,
        actorId: c.userId,
        action: 'commissions.settlement.confirm',
        category: 'FINANCE',
        targetType: 'PractitionerCommissionSettlement',
        targetId: id,
        outcome: 'SUCCESS',
        metadata: { payoutReference: input.payoutReference, netSettledMinor: s.netSettledMinor.toString() },
      }, tx);

      return commissionSettlementDetail(tx, c.clinicId, id);
    });
  }

  // ===========================================================================
  // Step 4.5: Financial Reconciliation Engine
  // ===========================================================================

  runFinancialReconciliation(proof: VerifiedPrincipal, clinicId: string): Promise<FinancialReconciliationReport> {
    return this.database.withClinicContext(proof, clinicId, ['finance.reconciliation.read'], async (tx, c) => {
      const findings: ReconciliationFinding[] = [];

      // 1. Invoices & Payments Reconciliation
      const invoices = await tx.invoice.findMany({
        where: { clinicId: c.clinicId },
        include: { lines: true, payments: { include: { reversals: true } } },
      });

      for (const inv of invoices) {
        if (inv.status === 'VOID') continue;

        // Line item totals check
        const linesTotal = inv.lines.reduce((sum, l) => sum + l.totalMinor, 0n);
        if (linesTotal !== inv.totalMinor) {
          findings.push({
            resource: 'INVOICE',
            entityId: inv.id,
            code: 'INVOICE_LINE_SUM_MISMATCH',
            severity: 'CRITICAL',
            details: `Invoice ${inv.number ?? inv.id} line items total ${linesTotal} does not match recorded totalMinor ${inv.totalMinor}`,
            metadata: { expected: inv.totalMinor.toString(), computed: linesTotal.toString() },
          });
        }

        // Net paid check against payments and reversals
        let computedNetPaid = 0n;
        for (const p of inv.payments) {
          const revTotal = p.reversals.reduce((sum, r) => sum + r.amountMinor, 0n);
          if (revTotal > p.amountMinor) {
            findings.push({
              resource: 'PAYMENT',
              entityId: p.id,
              code: 'PAYMENT_EXCESS_REVERSAL',
              severity: 'CRITICAL',
              details: `Payment ${p.id} reversals (${revTotal}) exceed original payment amount (${p.amountMinor})`,
              metadata: { paymentAmount: p.amountMinor.toString(), reversedAmount: revTotal.toString() },
            });
          }
          computedNetPaid += (p.amountMinor - revTotal);
        }

        if (computedNetPaid !== inv.netPaidMinor) {
          findings.push({
            resource: 'INVOICE',
            entityId: inv.id,
            code: 'INVOICE_NET_PAID_MISMATCH',
            severity: 'CRITICAL',
            details: `Invoice ${inv.number ?? inv.id} netPaidMinor ${inv.netPaidMinor} does not match payments net total ${computedNetPaid}`,
            metadata: { recordedNetPaid: inv.netPaidMinor.toString(), computedNetPaid: computedNetPaid.toString() },
          });
        }
      }

      // 2. Installment Plans Reconciliation
      const installmentPlans = await tx.installmentPlan.findMany({
        where: { clinicId: c.clinicId },
        include: { schedules: { include: { allocations: true } } },
      });

      for (const plan of installmentPlans) {
        const expectedTotal = plan.schedules.reduce((sum, s) => sum + s.expectedAmountMinor, 0n);
        if (expectedTotal !== plan.totalAmountMinor) {
          findings.push({
            resource: 'INSTALLMENT',
            entityId: plan.id,
            code: 'INSTALLMENT_SCHEDULE_MISMATCH',
            severity: 'CRITICAL',
            details: `Installment plan ${plan.planNumber} total amount ${plan.totalAmountMinor} does not equal schedules sum ${expectedTotal}`,
            metadata: { planTotal: plan.totalAmountMinor.toString(), schedulesTotal: expectedTotal.toString() },
          });
        }

        let allAllocated = 0n;
        for (const sched of plan.schedules) {
          const schedAlloc = sched.allocations.reduce((sum, a) => sum + a.allocatedMinor, 0n);
          if (schedAlloc !== sched.paidAmountMinor) {
            findings.push({
              resource: 'INSTALLMENT',
              entityId: sched.id,
              code: 'INSTALLMENT_SCHEDULE_PAID_MISMATCH',
              severity: 'WARNING',
              details: `Schedule ${sched.installmentNumber} of plan ${plan.planNumber} paidAmountMinor ${sched.paidAmountMinor} differs from allocations sum ${schedAlloc}`,
              metadata: { schedulePaid: sched.paidAmountMinor.toString(), allocationsSum: schedAlloc.toString() },
            });
          }
          allAllocated += schedAlloc;
        }

        if (allAllocated !== plan.paidAmountMinor) {
          findings.push({
            resource: 'INSTALLMENT',
            entityId: plan.id,
            code: 'INSTALLMENT_PLAN_PAID_MISMATCH',
            severity: 'CRITICAL',
            details: `Installment plan ${plan.planNumber} paidAmountMinor ${plan.paidAmountMinor} does not equal total allocations ${allAllocated}`,
            metadata: { planPaid: plan.paidAmountMinor.toString(), totalAllocations: allAllocated.toString() },
          });
        }
      }

      // 3. Patient Packages & Entitlements Reconciliation
      const packages = await tx.patientPackage.findMany({
        where: { clinicId: c.clinicId },
        include: { entitlements: true, redemptions: { include: { reversals: true } } },
      });

      for (const pp of packages) {
        const entTotal = pp.entitlements.reduce((sum, e) => sum + e.totalSessions, 0);
        if (entTotal !== pp.totalSessions) {
          findings.push({
            resource: 'PACKAGE',
            entityId: pp.id,
            code: 'PACKAGE_TOTAL_SESSIONS_DRIFT',
            severity: 'WARNING',
            details: `Patient package ${pp.id} totalSessions ${pp.totalSessions} does not match sum of entitlements ${entTotal}`,
            metadata: { packageTotal: pp.totalSessions.toString(), entitlementsTotal: entTotal.toString() },
          });
        }

        const entRemaining = pp.entitlements.reduce((sum, e) => sum + e.remainingSessions, 0);
        if (entRemaining !== pp.remainingSessions) {
          findings.push({
            resource: 'PACKAGE',
            entityId: pp.id,
            code: 'PACKAGE_REMAINING_SESSIONS_DRIFT',
            severity: 'CRITICAL',
            details: `Patient package ${pp.id} remainingSessions ${pp.remainingSessions} does not match sum of entitlement remaining sessions ${entRemaining}`,
            metadata: { packageRemaining: pp.remainingSessions.toString(), entitlementsRemaining: entRemaining.toString() },
          });
        }
      }

      // 4. Refund Requests & Payment Reversals Reconciliation
      const refundRequests = await tx.refundRequest.findMany({
        where: { clinicId: c.clinicId, status: 'SETTLED' },
      });

      for (const r of refundRequests) {
        if (!r.paymentReversalId) {
          findings.push({
            resource: 'REFUND',
            entityId: r.id,
            code: 'REFUND_MISSING_REVERSAL_LINK',
            severity: 'CRITICAL',
            details: `Settled refund request ${r.id} is missing linked payment reversal record`,
            metadata: { refundRequestId: r.id },
          });
        }
      }

      // 5. Commission Settlements Reconciliation
      const settlements = await tx.practitionerCommissionSettlement.findMany({
        where: { clinicId: c.clinicId, status: 'CONFIRMED' },
        include: { accruals: true, adjustments: true },
      });

      for (const s of settlements) {
        const accrualsSum = s.accruals.reduce((sum, a) => sum + a.commissionAmountMinor, 0n);
        if (accrualsSum !== s.grossAmountMinor) {
          findings.push({
            resource: 'COMMISSION',
            entityId: s.id,
            code: 'COMMISSION_GROSS_AMOUNT_DRIFT',
            severity: 'CRITICAL',
            details: `Commission settlement ${s.settlementNumber} grossAmountMinor ${s.grossAmountMinor} does not match sum of accruals ${accrualsSum}`,
            metadata: { recordedGross: s.grossAmountMinor.toString(), computedGross: accrualsSum.toString() },
          });
        }

        const adjustmentsSum = s.adjustments.reduce((sum, a) => sum + a.adjustmentAmountMinor, 0n);
        if (adjustmentsSum !== s.adjustmentsAmountMinor) {
          findings.push({
            resource: 'COMMISSION',
            entityId: s.id,
            code: 'COMMISSION_ADJUSTMENT_SUM_DRIFT',
            severity: 'WARNING',
            details: `Commission settlement ${s.settlementNumber} adjustmentsAmountMinor ${s.adjustmentsAmountMinor} does not match sum of adjustments ${adjustmentsSum}`,
            metadata: { recordedAdjustments: s.adjustmentsAmountMinor.toString(), computedAdjustments: adjustmentsSum.toString() },
          });
        }

        if (s.grossAmountMinor + s.adjustmentsAmountMinor !== s.netSettledMinor) {
          findings.push({
            resource: 'COMMISSION',
            entityId: s.id,
            code: 'COMMISSION_NET_SETTLED_MISMATCH',
            severity: 'CRITICAL',
            details: `Commission settlement ${s.settlementNumber} netSettledMinor ${s.netSettledMinor} does not equal gross plus adjustments`,
            metadata: { netSettled: s.netSettledMinor.toString(), computedNet: (s.grossAmountMinor + s.adjustmentsAmountMinor).toString() },
          });
        }
      }

      // 6. Inventory Stock Movement Ledgers vs Balances & Batch Balance Integrity
      const inventoryBalances = await tx.inventoryBalance.findMany({
        where: { clinicId: c.clinicId },
        include: { product: true, location: true },
      });

      for (const bal of inventoryBalances) {
        const movementsAgg = await tx.inventoryStockMovement.aggregate({
          where: {
            clinicId: c.clinicId,
            productId: bal.productId,
            locationId: bal.locationId,
          },
          _sum: { quantity: true },
        });
        const computedLedgerBalance = movementsAgg._sum.quantity || new Prisma.Decimal('0.0000');
        if (!computedLedgerBalance.equals(bal.onHandQuantity)) {
          findings.push({
            resource: 'INVENTORY',
            entityId: bal.id,
            code: 'INVENTORY_LEDGER_BALANCE_MISMATCH',
            severity: 'CRITICAL',
            details: `Inventory balance for product ${bal.product.sku} at location ${bal.location.code} (${bal.onHandQuantity}) differs from sum of stock movements (${computedLedgerBalance})`,
            metadata: {
              recordedOnHand: bal.onHandQuantity.toString(),
              computedLedgerBalance: computedLedgerBalance.toString(),
              productId: bal.productId,
              locationId: bal.locationId,
            },
          });
        }

        // Batch-level balances vs Product-level balances for items requiring batch tracking
        if (bal.product.requiresBatchTracking) {
          const batchBalancesAgg = await tx.inventoryBatchBalance.aggregate({
            where: {
              clinicId: c.clinicId,
              productId: bal.productId,
              locationId: bal.locationId,
            },
            _sum: { onHandQuantity: true },
          });
          const totalBatchUnits = batchBalancesAgg._sum.onHandQuantity || new Prisma.Decimal('0.0000');
          if (!totalBatchUnits.equals(bal.onHandQuantity)) {
            findings.push({
              resource: 'INVENTORY',
              entityId: bal.id,
              code: 'INVENTORY_BATCH_PRODUCT_BALANCE_MISMATCH',
              severity: 'CRITICAL',
              details: `Batch balances sum for product ${bal.product.sku} at location ${bal.location.code} (${totalBatchUnits}) differs from product balance (${bal.onHandQuantity})`,
              metadata: {
                recordedOnHand: bal.onHandQuantity.toString(),
                totalBatchUnits: totalBatchUnits.toString(),
                productId: bal.productId,
                locationId: bal.locationId,
              },
            });
          }
        }
      }

      const paymentsCount = await tx.payment.count({ where: { clinicId: c.clinicId } });
      const inventoryBatchesCount = await tx.inventoryBatch.count({ where: { clinicId: c.clinicId } });

      return {
        clinicId: c.clinicId,
        timestamp: new Date().toISOString(),
        resourcesScanned: {
          invoicesCount: invoices.length,
          paymentsCount,
          installmentPlansCount: installmentPlans.length,
          patientPackagesCount: packages.length,
          refundRequestsCount: refundRequests.length,
          commissionSettlementsCount: settlements.length,
          inventoryBalancesCount: inventoryBalances.length,
          inventoryBatchesCount,
        },
        totalDiscrepancies: findings.length,
        findings,
        status: findings.length === 0 ? 'CLEAN' : 'DISCREPANCIES_DETECTED',
      };
    });
  }

  // ===========================================================================
  // Step 4.5: Clinic Operational Reporting
  // ===========================================================================

  getRevenueCollectionsSummary(proof: VerifiedPrincipal, clinicId: string, q: OperationalReportQueryDto): Promise<RevenueCollectionsSummary> {
    return this.database.withClinicContext(proof, clinicId, ['reports.operational.read'], async (tx, c) => {
      const start = new Date(q.startDate);
      const end = new Date(q.endDate);
      if (end.getTime() - start.getTime() > 366 * 86400000) {
        throw new BadRequestException('Reporting date range cannot exceed 366 days');
      }

      const clinic = await tx.clinic.findUnique({ where: { id: c.clinicId }, select: { currency: true } });
      const scale = currencyScale(clinic?.currency ?? 'SAR');

      const invoices = await tx.invoice.findMany({
        where: {
          clinicId: c.clinicId,
          issuedAt: { gte: start, lte: end },
          status: { not: 'VOID' },
        },
        select: { totalMinor: true, netPaidMinor: true, status: true },
      });

      const invoicedRevenueMinor = invoices.reduce((sum, inv) => sum + inv.totalMinor, 0n);
      const outstandingReceivablesMinor = invoices
        .filter(inv => ['ISSUED', 'PARTIALLY_PAID'].includes(inv.status))
        .reduce((sum, inv) => sum + (inv.totalMinor - inv.netPaidMinor), 0n);

      const payments = await tx.payment.findMany({
        where: {
          clinicId: c.clinicId,
          createdAt: { gte: start, lte: end },
        },
        select: { amountMinor: true },
      });
      const grossPaymentsCollectedMinor = payments.reduce((sum, p) => sum + p.amountMinor, 0n);

      const refunds = await tx.paymentReversal.findMany({
        where: {
          clinicId: c.clinicId,
          createdAt: { gte: start, lte: end },
          kind: 'REFUND',
        },
        select: { amountMinor: true },
      });
      const refundsSettledMinor = refunds.reduce((sum, r) => sum + r.amountMinor, 0n);

      const netCashFlowMinor = grossPaymentsCollectedMinor - refundsSettledMinor;

      return {
        clinicId: c.clinicId,
        periodStart: start.toISOString(),
        periodEnd: end.toISOString(),
        currency: clinic?.currency ?? 'SAR',
        currencyScale: scale,
        invoicedRevenueMinor: invoicedRevenueMinor.toString(),
        invoicesIssuedCount: invoices.length,
        grossPaymentsCollectedMinor: grossPaymentsCollectedMinor.toString(),
        paymentsCount: payments.length,
        refundsSettledMinor: refundsSettledMinor.toString(),
        refundsCount: refunds.length,
        netCashFlowMinor: netCashFlowMinor.toString(),
        outstandingReceivablesMinor: outstandingReceivablesMinor.toString(),
      };
    });
  }

  getInstallmentAgingReport(proof: VerifiedPrincipal, clinicId: string): Promise<InstallmentAgingReport> {
    return this.database.withClinicContext(proof, clinicId, ['reports.operational.read'], async (tx, c) => {
      const now = new Date();
      const clinic = await tx.clinic.findUnique({ where: { id: c.clinicId }, select: { currency: true } });
      const scale = currencyScale(clinic?.currency ?? 'SAR');

      const plans = await tx.installmentPlan.findMany({
        where: { clinicId: c.clinicId, status: 'ACTIVE' },
        include: {
          schedules: {
            where: { status: { in: ['PENDING', 'PARTIALLY_PAID'] } },
          },
        },
      });

      const buckets: Record<string, { count: number; expected: bigint; unpaid: bigint }> = {
        CURRENT: { count: 0, expected: 0n, unpaid: 0n },
        DAYS_1_30: { count: 0, expected: 0n, unpaid: 0n },
        DAYS_31_60: { count: 0, expected: 0n, unpaid: 0n },
        DAYS_61_90: { count: 0, expected: 0n, unpaid: 0n },
        DAYS_90_PLUS: { count: 0, expected: 0n, unpaid: 0n },
      };

      let totalOutstandingMinor = 0n;

      for (const p of plans) {
        for (const s of p.schedules) {
          const unpaid = s.expectedAmountMinor - s.paidAmountMinor;
          totalOutstandingMinor += unpaid;

          const diffDays = Math.floor((now.getTime() - s.dueDate.getTime()) / 86400000);
          let key = 'CURRENT';
          if (diffDays > 90) key = 'DAYS_90_PLUS';
          else if (diffDays > 60) key = 'DAYS_61_90';
          else if (diffDays > 30) key = 'DAYS_31_60';
          else if (diffDays > 0) key = 'DAYS_1_30';

          buckets[key].count++;
          buckets[key].expected += s.expectedAmountMinor;
          buckets[key].unpaid += unpaid;
        }
      }

      const bucketLabels: Record<string, string> = {
        CURRENT: 'غير متأخر (جاري)',
        DAYS_1_30: 'متأخر 1-30 يوم',
        DAYS_31_60: 'متأخر 31-60 يوم',
        DAYS_61_90: 'متأخر 61-90 يوم',
        DAYS_90_PLUS: 'متأخر أكثر من 90 يوم',
      };

      return {
        clinicId: c.clinicId,
        asOfDate: now.toISOString(),
        currency: clinic?.currency ?? 'SAR',
        currencyScale: scale,
        totalActivePlansCount: plans.length,
        totalOutstandingMinor: totalOutstandingMinor.toString(),
        buckets: (['CURRENT', 'DAYS_1_30', 'DAYS_31_60', 'DAYS_61_90', 'DAYS_90_PLUS'] as const).map(k => ({
          bucket: k,
          labelAr: bucketLabels[k],
          schedulesCount: buckets[k].count,
          expectedAmountMinor: buckets[k].expected.toString(),
          unpaidAmountMinor: buckets[k].unpaid.toString(),
        })),
      };
    });
  }

  getPackageLiabilityReport(proof: VerifiedPrincipal, clinicId: string): Promise<PackageLiabilityReport> {
    return this.database.withClinicContext(proof, clinicId, ['reports.operational.read'], async (tx, c) => {
      const clinic = await tx.clinic.findUnique({ where: { id: c.clinicId }, select: { currency: true } });
      const scale = currencyScale(clinic?.currency ?? 'SAR');

      const packages = await tx.patientPackage.findMany({
        where: { clinicId: c.clinicId, status: { in: ['ACTIVE', 'PENDING_PAYMENT'] } },
        include: {
          package: { select: { nameAr: true } },
          patient: { select: { fullName: true } },
          packageVersion: { select: { priceMinor: true } },
        },
      });

      let totalSessionsPurchased = 0;
      let totalSessionsRedeemed = 0;
      let totalSessionsRemaining = 0;
      let totalEstimatedUnearnedLiabilityMinor = 0n;

      const items = packages.map(p => {
        totalSessionsPurchased += p.totalSessions;
        totalSessionsRedeemed += p.redeemedSessions;
        totalSessionsRemaining += p.remainingSessions;

        if (p.totalSessions > 0) {
          const price = p.packageVersion.priceMinor;
          const unearned = (price * BigInt(p.remainingSessions)) / BigInt(p.totalSessions);
          totalEstimatedUnearnedLiabilityMinor += unearned;
        }

        return {
          packageId: p.id,
          packageName: p.package.nameAr,
          patientName: p.patient.fullName,
          totalSessions: p.totalSessions,
          remainingSessions: p.remainingSessions,
          status: p.status,
          expiresAt: p.expiresAt ? p.expiresAt.toISOString() : null,
        };
      });

      return {
        clinicId: c.clinicId,
        currency: clinic?.currency ?? 'SAR',
        currencyScale: scale,
        totalActivePackages: packages.length,
        totalSessionsPurchased,
        totalSessionsRedeemed,
        totalSessionsRemaining,
        totalEstimatedUnearnedLiabilityMinor: totalEstimatedUnearnedLiabilityMinor.toString(),
        packages: items,
      };
    });
  }

  getPractitionerPerformanceReport(proof: VerifiedPrincipal, clinicId: string, q: OperationalReportQueryDto): Promise<PractitionerPerformanceReport> {
    return this.database.withClinicContext(proof, clinicId, ['reports.operational.read'], async (tx, c) => {
      const start = new Date(q.startDate);
      const end = new Date(q.endDate);
      const clinic = await tx.clinic.findUnique({ where: { id: c.clinicId }, select: { currency: true } });
      const scale = currencyScale(clinic?.currency ?? 'SAR');

      const practitioners = await tx.clinicMembership.findMany({
        where: {
          clinicId: c.clinicId,
          role: 'DOCTOR',
          ...(q.practitionerMembershipId ? { id: q.practitionerMembershipId } : {}),
        },
        include: { user: { select: { name: true } } },
      });

      const reportItems = [];

      for (const p of practitioners) {
        const completedProcedures = await tx.procedureExecution.count({
          where: {
            clinicId: c.clinicId,
            clinicianMembershipId: p.id,
            status: 'COMPLETED',
            performedAt: { gte: start, lte: end },
          },
        });

        const accruals = await tx.practitionerCommissionAccrual.findMany({
          where: {
            clinicId: c.clinicId,
            practitionerMembershipId: p.id,
            earnedAt: { gte: start, lte: end },
          },
        });

        const grossBillableMinor = accruals.reduce((sum, a) => sum + a.baseAmountMinor, 0n);
        const accruedCommissionMinor = accruals.reduce((sum, a) => sum + a.commissionAmountMinor, 0n);
        const settledCommissionMinor = accruals.filter(a => a.status === 'SETTLED').reduce((sum, a) => sum + a.commissionAmountMinor, 0n);
        const pendingCommissionMinor = accruals.filter(a => ['PENDING', 'APPROVED'].includes(a.status)).reduce((sum, a) => sum + a.commissionAmountMinor, 0n);

        reportItems.push({
          practitionerMembershipId: p.id,
          practitionerName: p.user?.name ?? 'Unknown',
          role: p.role,
          completedProceduresCount: completedProcedures,
          grossBillableMinor: grossBillableMinor.toString(),
          accruedCommissionMinor: accruedCommissionMinor.toString(),
          settledCommissionMinor: settledCommissionMinor.toString(),
          pendingCommissionMinor: pendingCommissionMinor.toString(),
        });
      }

      return {
        clinicId: c.clinicId,
        periodStart: start.toISOString(),
        periodEnd: end.toISOString(),
        currency: clinic?.currency ?? 'SAR',
        currencyScale: scale,
        practitioners: reportItems,
      };
    });
  }

  getInventoryValuationReport(proof: VerifiedPrincipal, clinicId: string): Promise<InventoryValuationSummary> {
    return this.database.withClinicContext(proof, clinicId, ['reports.operational.read'], async (tx, c) => {
      const clinic = await tx.clinic.findUnique({ where: { id: c.clinicId }, select: { currency: true } });
      const scale = currencyScale(clinic?.currency ?? 'SAR');

      const totalProductsCount = await tx.inventoryProduct.count({ where: { clinicId: c.clinicId } });
      const totalLocationsCount = await tx.inventoryLocation.count({ where: { clinicId: c.clinicId } });

      const locations = await tx.inventoryLocation.findMany({
        where: { clinicId: c.clinicId },
        include: {
          balances: true,
        },
      });

      let totalUnitsSum = new Prisma.Decimal('0.0000');
      let totalValuationMinor = 0n;

      const locationSummaries = locations.map((loc) => {
        const locUnits = loc.balances.reduce(
          (sum, b) => sum.plus(b.onHandQuantity),
          new Prisma.Decimal('0.0000'),
        );
        totalUnitsSum = totalUnitsSum.plus(locUnits);

        // Valuation is estimated as 0 pending formal landed cost / FIFO module
        const locValuationMinor = 0n;
        totalValuationMinor += locValuationMinor;

        return {
          locationId: loc.id,
          locationName: loc.nameAr,
          productsCount: loc.balances.length,
          totalUnits: locUnits.toFixed(4),
          valuationMinor: locValuationMinor.toString(),
        };
      });

      const activeBatchesCount = await tx.inventoryBatch.count({ where: { clinicId: c.clinicId, status: 'AVAILABLE' } });
      const expiredBatchesCount = await tx.inventoryBatch.count({ where: { clinicId: c.clinicId, status: 'EXPIRED' } });
      const recalledBatchesCount = await tx.inventoryBatch.count({ where: { clinicId: c.clinicId, status: 'RECALLED' } });

      return {
        clinicId: c.clinicId,
        asOf: new Date().toISOString(),
        currency: clinic?.currency ?? 'SAR',
        currencyScale: scale,
        totalProductsCount,
        totalLocationsCount,
        totalOnHandUnits: totalUnitsSum.toFixed(4),
        totalValuationMinor: totalValuationMinor.toString(),
        isAccountingVerified: false,
        valuationMethod: 'ESTIMATED_UNIT_COST',
        disclaimerAr: 'تنبيه تدقيق: تقييم المخزون المالي الحالي تقديري وغير معتمد محاسبيًا لعدم اكتمال ترصيد تكلفة الوصول (Landed Cost / FIFO).',
        disclaimerEn: 'Audit Notice: Inventory financial valuation is an estimate and not accounting-verified pending landed cost / FIFO implementation.',
        locations: locationSummaries,
        batchesSummary: {
          activeBatchesCount,
          expiredBatchesCount,
          recalledBatchesCount,
        },
      };
    });
  }

  getAppointmentUtilizationReport(proof: VerifiedPrincipal, clinicId: string, q: OperationalReportQueryDto): Promise<AppointmentUtilizationReport> {
    return this.database.withClinicContext(proof, clinicId, ['reports.operational.read'], async (tx, c) => {
      const start = new Date(q.startDate);
      const end = new Date(q.endDate);

      const appointments = await tx.appointment.findMany({
        where: {
          clinicId: c.clinicId,
          startAt: { gte: start, lte: end },
        },
        select: { status: true },
      });

      const totalScheduled = appointments.length;
      const totalCompleted = appointments.filter(a => a.status === 'COMPLETED').length;
      const totalArrived = appointments.filter(a => a.status === 'ARRIVED').length;
      const totalCancelled = appointments.filter(a => a.status === 'CANCELLED').length;
      const totalNoShow = appointments.filter(a => a.status === 'NO_SHOW').length;

      const completionRatePercent = totalScheduled > 0 ? Math.round((totalCompleted / totalScheduled) * 100) : 0;
      const cancellationRatePercent = totalScheduled > 0 ? Math.round((totalCancelled / totalScheduled) * 100) : 0;

      return {
        clinicId: c.clinicId,
        periodStart: start.toISOString(),
        periodEnd: end.toISOString(),
        totalScheduled,
        totalArrived,
        totalCompleted,
        totalCancelled,
        totalNoShow,
        completionRatePercent,
        cancellationRatePercent,
      };
    });
  }
}
