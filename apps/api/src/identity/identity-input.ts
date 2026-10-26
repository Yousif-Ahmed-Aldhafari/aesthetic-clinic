import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsInt, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateBy, ValidateIf } from 'class-validator';
import { normalizeName, normalizePhone, safeText } from '../patients/patient-input.js';
import { currencies, staffRoles, typography, validTimezone } from './identity-policy.js';
const supplied=(_o:unknown,v:unknown)=>v!==undefined;
const optional=(_o:unknown,v:unknown)=>v!==undefined&&v!==null;
const text=()=>Transform(({value}:{value:unknown})=>typeof value==='string'?normalizeName(value):value);
export class IdentityVersion {@IsInt() @Min(1) @Max(2147483646) expectedVersion!:number;}
export class ProfileInput extends IdentityVersion {
  @text() @IsString() @MinLength(2) @MaxLength(150) @Matches(safeText) @Matches(/\p{Script=Arabic}/u) displayName!:string;
  @text() @IsString() @MinLength(2) @MaxLength(200) @Matches(safeText) legalName!:string;
  @ValidateIf(optional) @text() @IsString() @MaxLength(150) @Matches(safeText) englishName?:string|null;
  @ValidateIf(optional) @Transform(({value}:{value:unknown})=>typeof value==='string'?normalizePhone(value):value) @Matches(/^\+?[0-9]{7,15}$/) contactPhone?:string|null;
  @ValidateIf(optional) @Transform(({value}:{value:unknown})=>typeof value==='string'?value.trim().toLowerCase():value) @IsEmail() @MaxLength(254) contactEmail?:string|null;
  @ValidateIf(optional) @text() @IsString() @MaxLength(250) @Matches(safeText) address?:string|null;
  @ValidateIf(optional) @IsString() @Matches(/^-?\d{1,2}(?:\.\d{1,6})?$/) @ValidateBy({name:'latitude',validator:{validate:v=>Math.abs(Number(v))<=90}}) latitude?:string|null;
  @ValidateIf(optional) @IsString() @Matches(/^-?\d{1,3}(?:\.\d{1,6})?$/) @ValidateBy({name:'longitude',validator:{validate:v=>Math.abs(Number(v))<=180}}) longitude?:string|null;
  @IsString() @ValidateBy({name:'ianaTimezone',validator:{validate:validTimezone}}) timezone!:string;
  @IsIn(currencies) currency!:string;
  @ValidateIf(supplied) @IsBoolean() confirmTimezoneChange?:boolean;
  @ValidateIf(supplied) @IsBoolean() confirmCurrencyChange?:boolean;
}
export class BrandingInput extends IdentityVersion {
  @Matches(/^#[0-9a-fA-F]{6}$/) primaryColor!:string;
  @Matches(/^#[0-9a-fA-F]{6}$/) secondaryColor!:string;
  @ValidateIf(optional) @Matches(/^#[0-9a-fA-F]{6}$/) accentColor?:string|null;
  @IsIn(typography) typography!:typeof typography[number];
  @ValidateIf(optional) @IsUUID() logoAssetId?:string|null;
  @ValidateIf(optional) @IsUUID() faviconAssetId?:string|null;
}
export class SubdomainInput extends IdentityVersion {@IsString() @MaxLength(63) slug!:string;}
export class DomainInput {@IsString() @MinLength(3) @MaxLength(253) hostname!:string;}
export class MemberInput extends IdentityVersion {
  @IsIn(staffRoles) role!:typeof staffRoles[number];
  @IsIn(['ACTIVE','SUSPENDED']) status!:'ACTIVE'|'SUSPENDED';
}
export class IdentityPage {
  @Type(()=>Number) @IsInt() @Min(1) @Max(50) pageSize=20;
  @ValidateIf(supplied) @IsUUID() cursor?:string;
}
export class ClinicRoute {@IsUUID() clinicId!:string;}
export class MemberRoute extends ClinicRoute {@IsUUID() membershipId!:string;}
export class DomainRoute extends ClinicRoute {@IsUUID() domainId!:string;}
export class AssetRoute extends ClinicRoute {@IsUUID() assetId!:string;}
export class PublicAssetRoute {@IsUUID() assetId!:string;}
export class UploadRoute extends ClinicRoute {@IsIn(['LOGO','FAVICON']) purpose!:'LOGO'|'FAVICON';}
export class CleanupInput {@IsIn([true]) confirmUnpublishedOnly!:boolean;}
