import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { ClinicalFormValidationService, CLINICAL_FORM_DIALECT } from '../src/clinical-forms/clinical-form-validation.service.js';
import { STANDARD_CLINICAL_FORMS } from '../src/clinical-forms/standard-clinical-forms.js';
import { permissionsFor } from '../src/auth/permissions.js';

const schema=(properties:Record<string,unknown>={value:{type:'string',maxLength:40}},required=['value'])=>({$schema:CLINICAL_FORM_DIALECT,type:'object',additionalProperties:false,properties,required});
const rejects=(fn:()=>unknown,code:string)=>assert.throws(fn,(error:unknown)=>error instanceof BadRequestException&&JSON.stringify(error.getResponse()).includes(code));

describe('structured clinical forms security policy',()=>{
 const validator=new ClinicalFormValidationService();
 it('uses one JSON Schema 2020-12 dialect and validates required data server-side',()=>{const s=schema();assert.match(validator.inspectSchema(s).digest,/^[a-f0-9]{64}$/);assert.match(validator.validatePayload(s,{value:'synthetic'}).digest,/^[a-f0-9]{64}$/);rejects(()=>validator.validatePayload(s,{}),'FORM_RESPONSE_INVALID');assert.doesNotThrow(()=>validator.validatePayload(s,{},false));});
 it('rejects remote references, unsafe regex keywords, excessive depth, and oversized response data',()=>{rejects(()=>validator.inspectSchema({...schema(),$ref:'https://invalid.example/schema'}),'FORM_SCHEMA_REFERENCES_FORBIDDEN');rejects(()=>validator.inspectSchema(schema({value:{type:'string',pattern:'(a+)+$'}})),'FORM_SCHEMA_KEYWORD_FORBIDDEN');let nested:any={type:'string',maxLength:20};for(let i=0;i<10;i++)nested={type:'array',maxItems:2,items:nested};rejects(()=>validator.inspectSchema(schema({value:nested})),'FORM_SCHEMA_TOO_DEEP');rejects(()=>validator.validatePayload(schema(),{value:'x'.repeat(300_000)}),'FORM_RESPONSE_TOO_LARGE');});
 it('requires explicit bounds on configured arrays and strings',()=>{rejects(()=>validator.inspectSchema(schema({list:{type:'array',maxItems:51,items:{type:'string',maxLength:10}}},[])),'FORM_SCHEMA_ARRAY_BOUND_REQUIRED');rejects(()=>validator.inspectSchema(schema({value:{type:'string',maxLength:10001}},[])),'FORM_SCHEMA_STRING_BOUND_REQUIRED');});
 it('requires closed nested objects and finite numeric bounds',()=>{rejects(()=>validator.inspectSchema(schema({section:{type:'object',properties:{value:{type:'string',maxLength:10}}}},[])),'FORM_SCHEMA_OBJECT_MUST_BE_CLOSED');rejects(()=>validator.inspectSchema(schema({score:{type:'number'}},[])),'FORM_SCHEMA_NUMERIC_BOUNDS_REQUIRED');assert.doesNotThrow(()=>validator.inspectSchema(schema({score:{type:'number',minimum:0,maximum:100}},[])));});
 it('ships four neutral templates without duplicating authoritative allergy, diagnosis, prescription, or observation facts',()=>{assert.deepEqual(STANDARD_CLINICAL_FORMS.map(x=>x.specialtyCode).sort(),['AESTHETICS','DERMATOLOGY','GENERAL_MEDICINE','PEDIATRICS']);for(const template of STANDARD_CLINICAL_FORMS){validator.inspectSchema(template.validationSchema);assert.equal(template.compatibilityMetadata.authoritativeFacts,'references-only');}});
 it('separates template administration from confidential response access',()=>{for(const role of ['CLINIC_OWNER','CLINIC_ADMIN'] as const){const p=permissionsFor(role);assert(p.includes('clinical.form-templates.manage'));assert(!p.includes('clinical.form-responses.read'));}const doctor=permissionsFor('DOCTOR');assert(doctor.includes('clinical.form-responses.finalize'));assert(!doctor.includes('clinical.form-templates.manage'));for(const role of ['RECEPTIONIST','ACCOUNTANT'] as const)assert(!permissionsFor(role).includes('clinical.form-responses.read'));});
});
