import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { calculate, currencyScale, fixed, signedFixed } from '../src/billing/money.js';
import { CreateInvoice, RecordPayment, CreateTreatmentPackageDto, CreateInstallmentPlanDto, CreateRefundRequestDto } from '../src/billing/billing-input.js';
import { permissionsFor } from '../src/auth/permissions.js';
const line=(input:Partial<Parameters<typeof calculate>[0][number]>={})=>({serviceName:'خدمة إدارية وهمية',quantity:'1',unitPrice:'0.10',discount:'0',taxBasisPoints:0,...input});
test('billing uses exact integer minor units, including 0.10 + 0.20',()=>{assert.equal(calculate([line(),line({unitPrice:'0.20'})],2).totals.totalMinor,30n);});
test('quantity and tax use documented per-line half-up rounding after fixed discount',()=>{
  const r=calculate([line({quantity:'1.005',unitPrice:'1.00',discount:'0.01',taxBasisPoints:50})],2);
  assert.equal(r.items[0].grossMinor,101n);assert.equal(r.totals.discountMinor,1n);assert.equal(r.totals.taxMinor,1n);assert.equal(r.totals.totalMinor,101n);
});
test('currency scales are explicit; fractions beyond scale and unsupported currencies fail closed',()=>{
  assert.equal(currencyScale('JPY'),0);assert.equal(currencyScale('KWD'),3);assert.equal(currencyScale('YER'),2);
  assert.equal(fixed('1.005',3),1005n);assert.equal(fixed('123',0),123n);
  for(const [value,scale] of [['1.001',2],['1.0',0],['-1',2],['1e3',2],['NaN',2]] as const)assert.throws(()=>fixed(value,scale));
  assert.throws(()=>currencyScale('ZZZ'));assert.throws(()=>currencyScale('__proto__'));
});
test('zero quantities, excess discounts, oversized totals and invalid taxes are rejected',()=>{
  for(const input of [{quantity:'0'},{quantity:'1001'},{discount:'0.11'},{taxBasisPoints:10001},{unitPrice:'999999999999',quantity:'1000'}])assert.throws(()=>calculate([line(input)],2));
  assert.throws(()=>calculate([],2));assert.throws(()=>calculate(Array.from({length:51},()=>line()),2));
});
test('billing DTOs reject mass assignment, numeric money and nested unknown fields',()=>{
  const base={patientId:'c32adc1a-5925-4904-a959-abd7c441a7ce',requestKey:'bdb22529-40e2-4b7b-8fbd-7bdca1bca739',lines:[line()]};
  const check=(v:unknown)=>validateSync(plainToInstance(CreateInvoice,v),{whitelist:true,forbidNonWhitelisted:true});
  assert.equal(check(base).length,0);
  for(const body of [{...base,clinicId:base.patientId},{...base,totalMinor:'1'},{...base,lines:[line({unitPrice:1 as never})]},{...base,lines:[{...line(),id:base.patientId}]}])assert(check(body).length>0);
  assert(validateSync(plainToInstance(RecordPayment,{amount:0.1,method:'CASH',requestKey:base.requestKey,expectedVersion:1})).length>0);
});
test('finance privileges remain separate from doctor, clinic administration and clinical identity permissions',()=>{
  for(const role of ['DOCTOR','CLINIC_ADMIN'] as const)assert(!permissionsFor(role).includes('invoices.read'));
  for(const p of ['invoices.read','invoices.create','invoices.issue','payments.record'] as const)assert(permissionsFor('RECEPTIONIST').includes(p));
  for(const p of ['payments.reverse','invoices.manage','reports.read'] as const){assert(!permissionsFor('RECEPTIONIST').includes(p));assert(permissionsFor('ACCOUNTANT').includes(p));}
  assert(!permissionsFor('ACCOUNTANT').includes('patients.read'));
});

test('treatment packages, redemptions, installments, and refunds RBAC permissions remain strictly segregated',()=>{
  const doctorPerms = permissionsFor('DOCTOR');
  assert(doctorPerms.includes('packages.redemptions.read'));
  assert(doctorPerms.includes('packages.redemptions.record'));
  assert(!doctorPerms.includes('packages.catalog.manage'));
  assert(!doctorPerms.includes('installments.manage'));
  assert(!doctorPerms.includes('refunds.settle'));

  const recepPerms = permissionsFor('RECEPTIONIST');
  assert(recepPerms.includes('packages.catalog.read'));
  assert(recepPerms.includes('packages.purchases.create'));
  assert(recepPerms.includes('packages.redemptions.record'));
  assert(recepPerms.includes('installments.read'));
  assert(recepPerms.includes('refunds.request'));
  assert(!recepPerms.includes('packages.redemptions.reverse'));
  assert(!recepPerms.includes('refunds.approve'));
  assert(!recepPerms.includes('refunds.settle'));

  const acctPerms = permissionsFor('ACCOUNTANT');
  assert(acctPerms.includes('packages.catalog.read'));
  assert(acctPerms.includes('packages.purchases.manage'));
  assert(acctPerms.includes('installments.manage'));
  assert(acctPerms.includes('installments.allocate'));
  assert(acctPerms.includes('refunds.approve'));
  assert(acctPerms.includes('refunds.settle'));

  const ownerPerms = permissionsFor('CLINIC_OWNER');
  assert(ownerPerms.includes('packages.redemptions.reverse'));
});

test('package, installment, and refund input DTOs enforce strict structure and reject mass assignment',()=>{
  const validUuid = 'c32adc1a-5925-4904-a959-abd7c441a7ce';

  // Package validation
  const validPkg = {
    code: 'PKG-GLOW-01',
    nameAr: 'باقة جلسات نضارة',
    price: '500.00',
    items: [{ serviceName: 'جلسة نضارة', sessionQuantity: 3 }],
  };
  assert.equal(validateSync(plainToInstance(CreateTreatmentPackageDto, validPkg), { whitelist: true, forbidNonWhitelisted: true }).length, 0);
  assert(validateSync(plainToInstance(CreateTreatmentPackageDto, { ...validPkg, items: [] })).length > 0);
  assert(validateSync(plainToInstance(CreateTreatmentPackageDto, { ...validPkg, extraField: 'hacked' }), { whitelist: true, forbidNonWhitelisted: true }).length > 0);

  // Installment plan validation
  const validPlan = {
    patientId: validUuid,
    invoiceId: validUuid,
    numberOfInstallments: 2,
    totalAmount: '1000.00',
    schedules: [
      { installmentNumber: 1, dueDate: '2026-11-15', expectedAmount: '500.00' },
      { installmentNumber: 2, dueDate: '2026-12-15', expectedAmount: '500.00' },
    ],
    requestKey: validUuid,
  };
  assert.equal(validateSync(plainToInstance(CreateInstallmentPlanDto, validPlan), { whitelist: true, forbidNonWhitelisted: true }).length, 0);
  assert(validateSync(plainToInstance(CreateInstallmentPlanDto, { ...validPlan, numberOfInstallments: 1 })).length > 0);

  // Refund request validation
  const validRefund = {
    invoiceId: validUuid,
    patientId: validUuid,
    amount: '250.00',
    reason: 'PATIENT_REFUND',
    reasonDetails: 'طلب المريض إلغاء الخدمة',
    requestKey: validUuid,
  };
  assert.equal(validateSync(plainToInstance(CreateRefundRequestDto, validRefund), { whitelist: true, forbidNonWhitelisted: true }).length, 0);
  assert(validateSync(plainToInstance(CreateRefundRequestDto, { ...validRefund, amount: '-10' })).length > 0);
});

test('practitioner commission exact integer arithmetic enforces deterministic half-up rounding', () => {
  // Formula: (baseAmountMinor * BigInt(rateBasisPoints) + 5000n) / 10000n
  const computeCommission = (baseMinor: bigint, bps: number): bigint => {
    return (baseMinor * BigInt(bps) + 5000n) / 10000n;
  };

  // Exactly 15.00% on 100.00 (10000 minor units): 10000 * 1500 = 15,000,000 / 10000 = 1500 (15.00)
  assert.equal(computeCommission(10000n, 1500), 1500n);

  // Exact half-up rounding test cases:
  // Base 33.33 (3333 minor units) at 10.00% (1000 bps):
  // 3333 * 1000 = 3,333,000 + 5000 = 3,338,000 / 10000 = 333 (rounds down when < 0.5)
  assert.equal(computeCommission(3333n, 1000), 333n);

  // Base 33.35 (3335 minor units) at 10.00% (1000 bps):
  // 3335 * 1000 = 3,335,000 + 5000 = 3,340,000 / 10000 = 334 (rounds up when >= 0.5)
  assert.equal(computeCommission(3335n, 1000), 334n);

  // Zero base or zero bps yields zero
  assert.equal(computeCommission(0n, 1500), 0n);
  assert.equal(computeCommission(10000n, 0), 0n);
});

test('practitioner commission, reconciliation and operational reporting permissions fail closed', () => {
  const doctorPerms = permissionsFor('DOCTOR');
  const accountantPerms = permissionsFor('ACCOUNTANT');
  const receptionistPerms = permissionsFor('RECEPTIONIST');
  const ownerPerms = permissionsFor('CLINIC_OWNER');

  // Doctor can read own statement, but NOT manage plans or read clinic-wide operational reports
  assert(doctorPerms.includes('commissions.accruals.read-own'));
  assert(!doctorPerms.includes('commissions.plans.manage'));
  assert(!doctorPerms.includes('commissions.accruals.read'));
  assert(!doctorPerms.includes('reports.operational.read'));
  assert(!doctorPerms.includes('finance.reconciliation.read'));

  // Receptionist has no commission privileges
  assert(!receptionistPerms.includes('commissions.accruals.read-own'));
  assert(!receptionistPerms.includes('commissions.plans.read'));
  assert(!receptionistPerms.includes('reports.operational.read'));

  // Accountant has financial reconciliation, operational reporting and settlement management, but NO clinical records
  assert(accountantPerms.includes('finance.reconciliation.read'));
  assert(accountantPerms.includes('reports.operational.read'));
  assert(accountantPerms.includes('commissions.settlements.manage'));
  assert(!accountantPerms.includes('clinical.encounters.read'));
  assert(!accountantPerms.includes('clinical.history.read'));

  // Owner has all permissions
  assert(ownerPerms.includes('commissions.plans.manage'));
  assert(ownerPerms.includes('finance.reconciliation.read'));
  assert(ownerPerms.includes('reports.operational.read'));
});

test('signedFixed correctly parses positive, negative, and zero signed decimal values with scale validation',()=>{
  assert.equal(signedFixed('100.50', 2), 10050n);
  assert.equal(signedFixed('-20.00', 2), -2000n);
  assert.equal(signedFixed('0', 2), 0n);
  assert.equal(signedFixed('-0.05', 2), -5n);
  assert.equal(signedFixed('-15.000', 3), -15000n);
  assert.throws(() => signedFixed('abc', 2));
  assert.throws(() => signedFixed('10.999', 2));
  assert.throws(() => signedFixed('-10.999', 2));
});
