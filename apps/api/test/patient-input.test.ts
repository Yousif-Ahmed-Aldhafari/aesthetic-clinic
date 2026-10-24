import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePatient, UpdatePatient, normalizePhone, searchName, validBirthDate } from '../src/patients/patient-input.js';
test('patient normalization preserves display-name accents and changes only search/contact representations',async()=>{
  const input=plainToInstance(CreatePatient,{fullName:'  إِيَادـ   الوهمي ',phone:'٠٠٩٦٧ ٧٧٧-١٢٣-٤٥٦',email:' SAMPLE@EXAMPLE.INVALID '});assert.deepEqual(await validate(input),[]);assert.equal(input.fullName,'إِيَادـ الوهمي');assert.equal(searchName(input.fullName),'اياد الوهمي');assert.equal(input.phone,'+967777123456');assert.equal(input.email,'sample@example.invalid');assert.equal(normalizePhone('0777 (123) 456'),'0777123456');
});
test('patient date-only validation rejects normalization, times, invalid leap days and future dates',()=>{
  assert(validBirthDate('2000-02-29'));for(const date of ['2023-02-29','2000-13-01','2000-01-01T00:00:00Z','0000-01-01','2999-01-01',null])assert(!validBirthDate(date));
});
test('patient update requires a positive numeric version and cannot null the required name',async()=>{
  for(const value of [{fullName:null,expectedVersion:1},{fullName:'وهمي'},{fullName:'وهمي',expectedVersion:'1'}])assert((await validate(plainToInstance(UpdatePatient,value))).length>0);
  assert.deepEqual(await validate(plainToInstance(UpdatePatient,{phone:null,email:'',dateOfBirth:null,gender:null,expectedVersion:1})),[]);
});
