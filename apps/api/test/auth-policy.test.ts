import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { CsrfService } from '../src/auth/csrf.service.js';
import { mac } from '../src/auth/crypto.js';
import { permissions, permissionsFor, rolePermissions } from '../src/auth/permissions.js';
import type { AuthRequest } from '../src/auth/access.js';

test('all clinic roles use known granular permissions; unknown roles default deny',()=>{
  for(const list of Object.values(rolePermissions)){
    assert.equal(new Set(list).size,list.length);
    assert(list.every(value=>permissions.includes(value)));
    assert(list.includes('clinic.branding.read'));
  }
  assert.deepEqual(permissionsFor('PLATFORM_ADMIN' as never),[]);
  assert.deepEqual(permissionsFor('unrecognized' as never),[]);
  assert.deepEqual(permissionsFor('__proto__' as never),[]);
  assert(!permissionsFor('CLINIC_ADMIN').includes('invoices.read'));
  assert(!permissionsFor('DOCTOR').includes('staff.manage'));
  assert(!permissionsFor('ACCOUNTANT').includes('patients.read'));
  assert(!permissionsFor('RECEPTIONIST').includes('invoices.manage'));
  const clinical=permissions.filter(value=>value.startsWith('clinical.'));
  assert(clinical.every(value=>permissionsFor('DOCTOR').includes(value)));
  for(const role of ['CLINIC_OWNER','CLINIC_ADMIN','RECEPTIONIST','ACCOUNTANT'] as const)assert(!permissionsFor(role).some(value=>value.startsWith('clinical.')));
});
test('production cookies are Secure, HttpOnly, host scoped and use __Host names',()=>{
  const service=new CsrfService(new ConfigService({NODE_ENV:'production'}));
  assert.deepEqual(service.cookieOptions(),{httpOnly:true,secure:true,sameSite:'lax',path:'/'});
  assert.equal(service.sessionCookie,'__Host-lamssa_session');
  assert.equal(service.preauthCookie,'__Host-lamssa_preauth');
});
test('signed pre-login CSRF tokens reject expiry, future issue time and signature replacement',()=>{
  const key='test-only-key',service=new CsrfService(new ConfigService({NODE_ENV:'test',AUTH_CSRF_SECRET:key,CORS_ORIGINS:['http://localhost:5173']}));
  const check=(token:string)=>service.validate({headers:{origin:'http://localhost:5173','x-csrf-token':token},cookies:{lamssa_preauth:token}} as unknown as AuthRequest,true);
  for(const issued of [Date.now()-600001,Date.now()+60000]){
    const payload=`${issued}.nonce`,token=`${payload}.${mac(key,`preauth:${payload}`)}`;
    assert.throws(()=>check(token));
  }
  let issued='';
  service.issuePreauth({cookie:(_name:string,value:string)=>{issued=value;}} as unknown as Response);
  assert.doesNotThrow(()=>check(issued));
  assert.throws(()=>check(issued.replace(/.$/,'!')));
});
