import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { calculate, currencyScale, fixed } from '../src/billing/money.js';
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
