import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ClinicPermissions, RequireStepUp, type AuthRequest } from '../auth/access.js';
import { BillingRepository } from '../prisma/billing.repository.js';
import {
  BillingPage, BillingPatientsQuery, BillingProfileInput, BillingVisitsQuery, CreateInvoice, EditInvoice, FinancialCommand, InvoiceQuery, InvoiceRoute, PaymentRoute, RecordPayment, ReversePayment, VoidInvoice,
  CreateTreatmentPackageDto, CreatePackageVersionDto, PublishPackageVersionDto, UpdatePackageStatusDto,
  PurchasePatientPackageDto, ActivatePatientPackageDto, CancelPatientPackageDto, RedeemPackageSessionDto, ReversePackageRedemptionDto,
  CreateInstallmentPlanDto, AllocateInstallmentPaymentDto, CreateRefundRequestDto, DecideRefundRequestDto, SettleRefundRequestDto,
  PackageQuery, PatientPackageQuery, InstallmentPlanQuery, RefundRequestQuery,
} from './billing-input.js';

@Controller('clinics/:clinicId/billing')
export class BillingController {
  constructor(private readonly billing:BillingRepository){}
  @Get('invoices') @ClinicPermissions('invoices.read')
  list(@Req() r:AuthRequest,@Param('clinicId') c:string,@Query() q:InvoiceQuery){return this.billing.list(r.auth!.principal,c,q);}
  @Get('summary') @ClinicPermissions('invoices.read','reports.read')
  summary(@Req() r:AuthRequest,@Param('clinicId') c:string){return this.billing.summary(r.auth!.principal,c);}
  @Get('profile') @ClinicPermissions('invoices.read')
  profile(@Req() r:AuthRequest,@Param('clinicId') c:string){return this.billing.profile(r.auth!.principal,c);}
  @Patch('profile') @ClinicPermissions('invoices.manage')
  configure(@Req() r:AuthRequest,@Param('clinicId') c:string,@Body() b:BillingProfileInput){return this.billing.configure(r.auth!.principal,c,b);}
  @Get('patients') @ClinicPermissions('invoices.create')
  patients(@Req() r:AuthRequest,@Param('clinicId') c:string,@Query() q:BillingPatientsQuery){return this.billing.patients(r.auth!.principal,c,q);}
  @Get('visits') @ClinicPermissions('invoices.create')
  visits(@Req() r:AuthRequest,@Param('clinicId') c:string,@Query() q:BillingVisitsQuery){return this.billing.visits(r.auth!.principal,c,q);}
  @Post('invoices') @ClinicPermissions('invoices.create')
  create(@Req() r:AuthRequest,@Param('clinicId') c:string,@Body() b:CreateInvoice){return this.billing.create(r.auth!.principal,c,b);}
  @Get('invoices/:invoiceId') @ClinicPermissions('invoices.read')
  get(@Req() r:AuthRequest,@Param() p:InvoiceRoute){return this.billing.get(r.auth!.principal,p.clinicId,p.invoiceId);}
  @Patch('invoices/:invoiceId') @ClinicPermissions('invoices.create')
  edit(@Req() r:AuthRequest,@Param() p:InvoiceRoute,@Body() b:EditInvoice){return this.billing.edit(r.auth!.principal,p.clinicId,p.invoiceId,b);}
  @Post('invoices/:invoiceId/issue') @ClinicPermissions('invoices.issue')
  issue(@Req() r:AuthRequest,@Param() p:InvoiceRoute,@Body() b:FinancialCommand){return this.billing.issue(r.auth!.principal,p.clinicId,p.invoiceId,b);}
  @Post('invoices/:invoiceId/void') @ClinicPermissions('invoices.manage') @RequireStepUp(15)
  void(@Req() r:AuthRequest,@Param() p:InvoiceRoute,@Body() b:VoidInvoice){return this.billing.void(r.auth!.principal,p.clinicId,p.invoiceId,b);}
  @Get('invoices/:invoiceId/payments') @ClinicPermissions('invoices.read')
  payments(@Req() r:AuthRequest,@Param() p:InvoiceRoute,@Query() q:BillingPage){return this.billing.payments(r.auth!.principal,p.clinicId,p.invoiceId,q);}
  @Post('invoices/:invoiceId/payments') @ClinicPermissions('payments.record')
  pay(@Req() r:AuthRequest,@Param() p:InvoiceRoute,@Body() b:RecordPayment){return this.billing.pay(r.auth!.principal,p.clinicId,p.invoiceId,b);}
  @Post('invoices/:invoiceId/payments/:paymentId/reversals') @ClinicPermissions('payments.reverse') @RequireStepUp(15)
  reverse(@Req() r:AuthRequest,@Param() p:PaymentRoute,@Body() b:ReversePayment){return this.billing.reverse(r.auth!.principal,p.clinicId,p.invoiceId,p.paymentId,b);}
  @Get('invoices/:invoiceId/audit') @ClinicPermissions('invoices.manage')
  audit(@Req() r:AuthRequest,@Param() p:InvoiceRoute,@Query() q:BillingPage){return this.billing.audit(r.auth!.principal,p.clinicId,p.invoiceId,q);}

  // ---------------------------------------------------------------------------
  // Step 4.4: Treatment Package Catalog
  // ---------------------------------------------------------------------------

  @Get('packages') @ClinicPermissions('packages.catalog.read')
  listPackages(@Req() r:AuthRequest,@Param('clinicId') c:string,@Query() q:PackageQuery){return this.billing.listPackages(r.auth!.principal,c,q);}

  @Get('packages/:packageId') @ClinicPermissions('packages.catalog.read')
  getPackage(@Req() r:AuthRequest,@Param('clinicId') c:string,@Param('packageId') id:string){return this.billing.getPackage(r.auth!.principal,c,id);}

  @Post('packages') @ClinicPermissions('packages.catalog.manage')
  createPackage(@Req() r:AuthRequest,@Param('clinicId') c:string,@Body() b:CreateTreatmentPackageDto){return this.billing.createPackage(r.auth!.principal,c,b);}

  @Post('packages/:packageId/versions') @ClinicPermissions('packages.catalog.manage')
  createPackageVersion(@Req() r:AuthRequest,@Param('clinicId') c:string,@Param('packageId') id:string,@Body() b:CreatePackageVersionDto){return this.billing.createPackageVersion(r.auth!.principal,c,id,b);}

  @Post('packages/:packageId/versions/:versionId/publish') @ClinicPermissions('packages.catalog.manage')
  publishPackageVersion(@Req() r:AuthRequest,@Param('clinicId') c:string,@Param('packageId') id:string,@Param('versionId') vId:string,@Body() b:PublishPackageVersionDto){return this.billing.publishPackageVersion(r.auth!.principal,c,id,vId,b);}

  @Patch('packages/:packageId/status') @ClinicPermissions('packages.catalog.manage')
  updatePackageStatus(@Req() r:AuthRequest,@Param('clinicId') c:string,@Param('packageId') id:string,@Body() b:UpdatePackageStatusDto){return this.billing.updatePackageStatus(r.auth!.principal,c,id,b);}

  // ---------------------------------------------------------------------------
  // Step 4.4: Patient Packages & Redemptions
  // ---------------------------------------------------------------------------

  @Get('patient-packages') @ClinicPermissions('packages.purchases.read')
  listPatientPackages(@Req() r:AuthRequest,@Param('clinicId') c:string,@Query() q:PatientPackageQuery){return this.billing.listPatientPackages(r.auth!.principal,c,q);}

  @Get('patient-packages/:packageId') @ClinicPermissions('packages.purchases.read')
  getPatientPackage(@Req() r:AuthRequest,@Param('clinicId') c:string,@Param('packageId') id:string){return this.billing.getPatientPackage(r.auth!.principal,c,id);}

  @Post('patient-packages') @ClinicPermissions('packages.purchases.create')
  purchasePatientPackage(@Req() r:AuthRequest,@Param('clinicId') c:string,@Body() b:PurchasePatientPackageDto){return this.billing.purchasePatientPackage(r.auth!.principal,c,b);}

  @Post('patient-packages/:packageId/activate') @ClinicPermissions('packages.purchases.manage')
  activatePatientPackage(@Req() r:AuthRequest,@Param('clinicId') c:string,@Param('packageId') id:string,@Body() b:ActivatePatientPackageDto){return this.billing.activatePatientPackage(r.auth!.principal,c,id,b);}

  @Post('patient-packages/:packageId/cancel') @ClinicPermissions('packages.purchases.manage')
  cancelPatientPackage(@Req() r:AuthRequest,@Param('clinicId') c:string,@Param('packageId') id:string,@Body() b:CancelPatientPackageDto){return this.billing.cancelPatientPackage(r.auth!.principal,c,id,b);}

  @Post('patient-packages/:packageId/redeem') @ClinicPermissions('packages.redemptions.record')
  redeemPackageSession(@Req() r:AuthRequest,@Param('clinicId') c:string,@Param('packageId') id:string,@Body() b:RedeemPackageSessionDto){return this.billing.redeemPackageSession(r.auth!.principal,c,id,b);}

  @Post('patient-packages/:packageId/redemptions/:redemptionId/reverse') @ClinicPermissions('packages.redemptions.reverse') @RequireStepUp(15)
  reversePackageRedemption(@Req() r:AuthRequest,@Param('clinicId') c:string,@Param('packageId') id:string,@Param('redemptionId') rId:string,@Body() b:ReversePackageRedemptionDto){return this.billing.reversePackageRedemption(r.auth!.principal,c,id,rId,b);}

  // ---------------------------------------------------------------------------
  // Step 4.4: Installment Plans
  // ---------------------------------------------------------------------------

  @Get('installment-plans') @ClinicPermissions('installments.read')
  listInstallmentPlans(@Req() r:AuthRequest,@Param('clinicId') c:string,@Query() q:InstallmentPlanQuery){return this.billing.listInstallmentPlans(r.auth!.principal,c,q);}

  @Get('installment-plans/:planId') @ClinicPermissions('installments.read')
  getInstallmentPlan(@Req() r:AuthRequest,@Param('clinicId') c:string,@Param('planId') id:string){return this.billing.getInstallmentPlan(r.auth!.principal,c,id);}

  @Post('installment-plans') @ClinicPermissions('installments.manage')
  createInstallmentPlan(@Req() r:AuthRequest,@Param('clinicId') c:string,@Body() b:CreateInstallmentPlanDto){return this.billing.createInstallmentPlan(r.auth!.principal,c,b);}

  @Post('installment-plans/:planId/allocations') @ClinicPermissions('installments.allocate')
  allocateInstallmentPayment(@Req() r:AuthRequest,@Param('clinicId') c:string,@Param('planId') id:string,@Body() b:AllocateInstallmentPaymentDto){return this.billing.allocateInstallmentPayment(r.auth!.principal,c,id,b);}

  // ---------------------------------------------------------------------------
  // Step 4.4: Refunds
  // ---------------------------------------------------------------------------

  @Get('refund-requests') @ClinicPermissions('refunds.request')
  listRefundRequests(@Req() r:AuthRequest,@Param('clinicId') c:string,@Query() q:RefundRequestQuery){return this.billing.listRefundRequests(r.auth!.principal,c,q);}

  @Get('refund-requests/:refundId') @ClinicPermissions('refunds.request')
  getRefundRequest(@Req() r:AuthRequest,@Param('clinicId') c:string,@Param('refundId') id:string){return this.billing.getRefundRequest(r.auth!.principal,c,id);}

  @Post('refund-requests') @ClinicPermissions('refunds.request')
  createRefundRequest(@Req() r:AuthRequest,@Param('clinicId') c:string,@Body() b:CreateRefundRequestDto){return this.billing.createRefundRequest(r.auth!.principal,c,b);}

  @Post('refund-requests/:refundId/approve') @ClinicPermissions('refunds.approve') @RequireStepUp(15)
  approveRefundRequest(@Req() r:AuthRequest,@Param('clinicId') c:string,@Param('refundId') id:string,@Body() b:DecideRefundRequestDto){return this.billing.approveRefundRequest(r.auth!.principal,c,id,b);}

  @Post('refund-requests/:refundId/reject') @ClinicPermissions('refunds.reject') @RequireStepUp(15)
  rejectRefundRequest(@Req() r:AuthRequest,@Param('clinicId') c:string,@Param('refundId') id:string,@Body() b:DecideRefundRequestDto){return this.billing.rejectRefundRequest(r.auth!.principal,c,id,b);}

  @Post('refund-requests/:refundId/settle') @ClinicPermissions('refunds.settle') @RequireStepUp(15)
  settleRefundRequest(@Req() r:AuthRequest,@Param('clinicId') c:string,@Param('refundId') id:string,@Body() b:SettleRefundRequestDto){return this.billing.settleRefundRequest(r.auth!.principal,c,id,b);}
}
