import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { randomBytes, createHash } from 'node:crypto';
import { Resolver } from 'node:dns/promises';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import sharp from 'sharp';
import { customHostname, subdomain, validTimezone, validateColors } from '../src/identity/identity-policy.js';
import { ProfileInput, BrandingInput, MemberInput } from '../src/identity/identity-input.js';
import { encodeImage } from '../src/identity/asset.service.js';
import { DomainVerifier } from '../src/identity/domain-verifier.js';
import { permissionsFor } from '../src/auth/permissions.js';
test('identity: normalized platform reservations reject reserved names and invalid labels',()=>{
  assert.equal(subdomain('  Ward-New  '),'ward-new');for(const v of ['API','admin','x','-ward','ward-','a.b','عيادة','http://ward','a'.repeat(64)])assert.throws(()=>subdomain(v));
});
test('identity: custom hostnames are canonical public DNS names, never URLs or platform hosts',()=>{
  assert.equal(customHostname('Clinic.Example.COM.','lamssa.localhost'),'clinic.example.com');
  for(const h of ['127.0.0.1','[::1]','localhost','foo.internal','test.invalid','test.local','http://evil.com','evil.com/x','user@evil.com','evil.com:80','api.lamssa.localhost','lamssa.localhost','a..com','a'.repeat(64)+'.com'])assert.throws(()=>customHostname(h,'lamssa.localhost'));
});
test('identity: timezone and colors enforce IANA names and readable foregrounds',()=>{
  assert(validTimezone('Asia/Aden'));assert(validTimezone('UTC'));for(const z of ['+03:00','GMT+3','invalid/zone',null])assert(!validTimezone(z));
  validateColors('#7854D9','#F6F8FC','#A886F3');for(const c of ['#FFFFFF','#EEEEEE'])assert.throws(()=>validateColors(c,'#F6F8FC',null));assert.throws(()=>validateColors('#7854D9','#17243B',null));
});
test('identity: profile DTO normalizes contact fields and rejects lifecycle/ownership mass assignment',async()=>{
  const input={expectedVersion:1,displayName:' عيادة  ورد ',legalName:'مؤسسة وهمية',timezone:'Asia/Aden',currency:'YER',contactPhone:'٠٠٩٦٧ ٧٧٧ ١٢٣ ٤٥٦',contactEmail:'CONTACT@EXAMPLE.COM'};
  const p=plainToInstance(ProfileInput,input);assert.equal((await validate(p)).length,0);assert.equal(p.displayName,'عيادة ورد');assert.equal(p.contactPhone,'+967777123456');assert.equal(p.contactEmail,'contact@example.com');
  assert((await validate(plainToInstance(ProfileInput,{...input,status:'ACTIVE'}),{whitelist:true,forbidNonWhitelisted:true})).length);
  for(const x of [{displayName:'English only'},{currency:'ZZZ'},{timezone:'+03:00'},{latitude:'91'},{contactPhone:'123'},{contactEmail:'invalid'}])assert((await validate(plainToInstance(ProfileInput,{...input,...x}))).length);
});
test('identity: branding and membership DTOs cannot write URLs, sessions or platform roles',async()=>{
  const b={expectedVersion:1,primaryColor:'#7854D9',secondaryColor:'#F6F8FC',typography:'TAJAWAL'};assert.equal((await validate(plainToInstance(BrandingInput,b))).length,0);
  for(const extra of [{logoUrl:'https://evil.example/x'},{typography:'url(evil)'},{clinicId:randomBytes(16).toString('hex')}])assert((await validate(plainToInstance(BrandingInput,{...b,...extra}),{whitelist:true,forbidNonWhitelisted:true})).length);
  assert((await validate(plainToInstance(MemberInput,{expectedVersion:1,role:'PLATFORM_ADMIN',status:'ACTIVE'}))).length);
});
test('identity: real image decoding strips metadata, bounds output and encodes immutable derivatives',async()=>{
  const bytes=await sharp({create:{width:1500,height:500,channels:3,background:'#7854D9'}}).jpeg().toBuffer();
  const logo=await encodeImage({buffer:bytes,mimetype:'image/jpeg',size:bytes.length},'LOGO');assert.equal(logo.width,1024);assert.equal(logo.mimeType,'image/webp');assert.equal((await sharp(logo.bytes).metadata()).exif,undefined);
  const icon=await encodeImage({buffer:bytes,mimetype:'image/jpeg',size:bytes.length},'FAVICON');assert.equal(icon.width,128);assert.equal(icon.mimeType,'image/png');
});
test('identity: executable/mislabeled/oversized/tiny/corrupt images fail closed',async()=>{
  for(const bytes of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),Buffer.from('<html>'),Buffer.alloc(2097153),Buffer.from([137,80,78,71,13,10,26,10])])await assert.rejects(encodeImage({buffer:bytes,mimetype:'image/png',size:bytes.length},'LOGO'));
  const tiny=await sharp({create:{width:1,height:1,channels:3,background:'red'}}).png().toBuffer();await assert.rejects(encodeImage({buffer:tiny,mimetype:'image/png',size:tiny.length},'LOGO'));
  const huge=await sharp({create:{width:4097,height:20,channels:3,background:'red'}}).png().toBuffer();await assert.rejects(encodeImage({buffer:huge,mimetype:'image/png',size:huge.length},'LOGO'));
});
test('identity: DNS TXT proof checks the actual secret hash, supports TXT chunks and never fetches HTTP',async()=>{
  const token=randomBytes(32).toString('base64url'),hash=createHash('sha256').update(token).digest('hex');
  const mocked=mock.method(Resolver.prototype,'resolveTxt',async(host:string)=>{assert.equal(host,'_lamssa-verification.clinic.example.com');return[['lamssa-verification=',token]];});
  try{assert(await new DomainVerifier().owns('clinic.example.com',hash));assert.equal(await new DomainVerifier().owns('clinic.example.com','a'.repeat(64)),false);}finally{mocked.mock.restore();}
});
test('identity: permission ceiling ensures CLINIC_ADMIN cannot grant roles with finance privileges',()=>{
  const adminPermissions=permissionsFor('CLINIC_ADMIN');
  assert(!permissionsFor('RECEPTIONIST').every(p=>adminPermissions.includes(p)));
  assert(!permissionsFor('ACCOUNTANT').every(p=>adminPermissions.includes(p)));
  assert(!permissionsFor('CLINIC_OWNER').every(p=>adminPermissions.includes(p)));
  assert(permissionsFor('DOCTOR').every(p=>adminPermissions.includes(p)));
});
