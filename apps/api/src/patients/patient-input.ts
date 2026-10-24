import { Transform, Type } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateBy, ValidateIf } from 'class-validator';

export const genders=['FEMALE','MALE','OTHER','UNDISCLOSED'] as const;
export const statuses=['ACTIVE','INACTIVE'] as const;
export const digits=(value:string)=>value.replace(/[٠-٩۰-۹]/g,c=>String(c.charCodeAt(0)-(c<='٩'?0x660:0x6f0)));
export const normalizeName=(value:string)=>value.normalize('NFC').trim().replace(/\s+/gu,' ');
export const searchName=(value:string)=>digits(value.normalize('NFKC')).toLowerCase().replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06edـ]/gu,'').replace(/[أإآٱ]/gu,'ا').replace(/ى/gu,'ي').trim().replace(/\s+/gu,' ');
export const normalizePhone=(value:string)=>digits(value).trim().replace(/[\s().-]/gu,'').replace(/^00/,'+');
export const safeText=/^[^\p{Cc}\u202a-\u202e\u2066-\u2069]*$/u;
export function validBirthDate(value:unknown):boolean {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'0001-01-01')return false;
  const parsed=new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value&&value<=new Date().toISOString().slice(0,10);
}
const optionalText=(normalizer:(s:string)=>string)=>Transform(({value}:{value:unknown})=>typeof value==='string'?(value.trim()?normalizer(value):null):value);
const supplied=(_object:unknown,value:unknown)=>value!==undefined;
const nonNull=(_object:unknown,value:unknown)=>value!==undefined&&value!==null;

export class CreatePatient {
  @Transform(({value}:{value:unknown})=>typeof value==='string'?normalizeName(value):value)
  @IsString() @MinLength(2) @MaxLength(150) @Matches(safeText) @Matches(/\p{L}/u) @ValidateBy({name:'searchNameLength',validator:{validate:(v:unknown)=>typeof v==='string'&&searchName(v).length>0&&searchName(v).length<=150}}) fullName!:string;
  @optionalText(normalizePhone) @ValidateIf(nonNull) @IsString() @Matches(/^\+?[0-9]{7,15}$/) phone?:string|null;
  @optionalText(v=>v.trim().toLowerCase()) @ValidateIf(nonNull) @IsEmail() @MaxLength(254) email?:string|null;
  @ValidateIf(nonNull) @ValidateBy({name:'dateOnly',validator:{validate:validBirthDate}}) dateOfBirth?:string|null;
  @ValidateIf(nonNull) @IsIn(genders) gender?:typeof genders[number]|null;
}
export class UpdatePatient {
  @ValidateIf(supplied) @Transform(({value}:{value:unknown})=>typeof value==='string'?normalizeName(value):value)
  @IsString() @MinLength(2) @MaxLength(150) @Matches(safeText) @Matches(/\p{L}/u) @ValidateBy({name:'searchNameLength',validator:{validate:(v:unknown)=>typeof v==='string'&&searchName(v).length>0&&searchName(v).length<=150}}) fullName?:string;
  @optionalText(normalizePhone) @ValidateIf(nonNull) @IsString() @Matches(/^\+?[0-9]{7,15}$/) phone?:string|null;
  @optionalText(v=>v.trim().toLowerCase()) @ValidateIf(nonNull) @IsEmail() @MaxLength(254) email?:string|null;
  @ValidateIf(nonNull) @ValidateBy({name:'dateOnly',validator:{validate:validBirthDate}}) dateOfBirth?:string|null;
  @ValidateIf(nonNull) @IsIn(genders) gender?:typeof genders[number]|null;
  @IsInt() @Min(1) @Max(2147483646) expectedVersion!:number;
}
export class PatientStatusChange {
  @IsIn(statuses) status!:typeof statuses[number];
  @IsInt() @Min(1) @Max(2147483646) expectedVersion!:number;
}
export class PatientQuery {
  @Type(()=>Number) @IsInt() @Min(1) @Max(50) pageSize=20;
  @ValidateIf(supplied) @IsUUID() cursor?:string;
  @IsString() @MaxLength(60) @Matches(safeText) q='';
  @IsIn(['ACTIVE','INACTIVE','ALL']) status:'ACTIVE'|'INACTIVE'|'ALL'='ACTIVE';
}
export class PatientRoute {
  @IsUUID() clinicId!:string;
  @IsUUID() patientId!:string;
}
