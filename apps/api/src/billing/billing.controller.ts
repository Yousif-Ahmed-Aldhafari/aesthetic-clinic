import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ClinicPermissions, RequireStepUp, type AuthRequest } from '../auth/access.js';
import { BillingRepository } from '../prisma/billing.repository.js';
import { BillingPage, BillingPatientsQuery, BillingProfileInput, BillingVisitsQuery, CreateInvoice, EditInvoice, FinancialCommand, InvoiceQuery, InvoiceRoute, PaymentRoute, RecordPayment, ReversePayment, VoidInvoice } from './billing-input.js';

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
}
