import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateAmendmentDto, CreateEncounterDto, UpdateClinicalNoteDto } from '../src/clinical/clinical-input.js';
import { permissionsFor } from '../src/auth/permissions.js';
import { sanitizeAuditMetadata } from '../src/audit/audit.types.js';

test('clinical permissions are doctor-only and separate from administrative patient access',()=>{
  assert(permissionsFor('DOCTOR').includes('clinical.encounters.read'));
  for(const role of ['CLINIC_OWNER','CLINIC_ADMIN','RECEPTIONIST','ACCOUNTANT'] as const)assert(!permissionsFor(role).some(p=>p.startsWith('clinical.')));
  assert(permissionsFor('RECEPTIONIST').includes('patients.read'));
});
test('clinical DTOs reject mass assignment, oversized content and weak amendment reasons',async()=>{
  const invalid=plainToInstance(CreateEncounterDto,{patientId:'bad',clinicId:'forged',content:{assessment:'x'.repeat(8001),diagnosis:'forged'}});
  assert((await validate(invalid,{whitelist:true,forbidNonWhitelisted:true})).length>0);
  const update=plainToInstance(UpdateClinicalNoteDto,{expectedVersion:0,content:{chiefComplaint:'اختبار'}});
  assert((await validate(update,{whitelist:true,forbidNonWhitelisted:true})).length>0);
  const amendment=plainToInstance(CreateAmendmentDto,{reason:'x',content:{assessment:'تصحيح وهمي'}});
  assert((await validate(amendment,{whitelist:true,forbidNonWhitelisted:true})).length>0);
});
test('general audit metadata redacts clinical content keys',()=>{
  const value=sanitizeAuditMetadata({diagnosis:'secret',clinicalNotes:'secret',medications:'secret',status:'SIGNED'});
  assert.equal(value?.diagnosis,'[REDACTED]');assert.equal(value?.clinicalNotes,'[REDACTED]');assert.equal(value?.status,'SIGNED');
});
