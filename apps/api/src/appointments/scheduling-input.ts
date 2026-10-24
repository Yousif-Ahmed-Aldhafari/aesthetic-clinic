import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import { normalizeName, safeText } from '../patients/patient-input.js';
export const appointmentStatuses=['SCHEDULED','CONFIRMED','ARRIVED','COMPLETED','CANCELLED','NO_SHOW'] as const;
export const cancellationReasons=['PATIENT_REQUEST','SCHEDULE_CHANGE','OTHER'] as const;
const supplied=(_o:unknown,v:unknown)=>v!==undefined;
const nonNull=(_o:unknown,v:unknown)=>v!==undefined&&v!==null;
export class VersionInput {@IsInt() @Min(1) @Max(2147483646) expectedVersion!:number;}
export class LocalBookingInput {
  @IsUUID() serviceId!:string;
  @IsUUID() doctorResourceId!:string;
  @ValidateIf(nonNull) @IsUUID() roomResourceId?:string|null;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/) startLocal!:string;
  @ValidateIf(supplied) @IsInt() @Min(5) @Max(480) durationMinutes?:number;
  @IsIn(['REJECT','EARLIER','LATER']) disambiguation:'REJECT'|'EARLIER'|'LATER'='REJECT';
}
export class CreateAppointment extends LocalBookingInput {@IsUUID() patientId!:string;@IsUUID() bookingKey!:string;}
export class UpdateAppointment extends LocalBookingInput {@IsInt() @Min(1) @Max(2147483646) expectedVersion!:number;}
export class AppointmentStatusInput extends VersionInput {
  @IsIn(appointmentStatuses) status!:typeof appointmentStatuses[number];
  @ValidateIf(nonNull) @IsIn(cancellationReasons) cancellationReason?:typeof cancellationReasons[number]|null;
}
export class CatalogQuery {
  @Type(()=>Number) @IsInt() @Min(1) @Max(100) pageSize=50;
  @ValidateIf(supplied) @IsUUID() cursor?:string;
  @IsIn(['ACTIVE','ALL']) scope:'ACTIVE'|'ALL'='ACTIVE';
}
export class RangeQuery {
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) fromDate!:string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) toDate!:string;
  @Type(()=>Number) @IsInt() @Min(1) @Max(100) pageSize=50;
  @ValidateIf(supplied) @IsUUID() cursor?:string;
}
export class AppointmentQuery extends RangeQuery {
  @ValidateIf(supplied) @IsUUID() doctorResourceId?:string;
  @ValidateIf(supplied) @IsUUID() patientId?:string;
  @IsIn([...appointmentStatuses,'ALL']) status:typeof appointmentStatuses[number]|'ALL'='ALL';
}
export class AvailabilityQuery {
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) date!:string;
  @IsUUID() serviceId!:string;
  @IsUUID() doctorResourceId!:string;
  @ValidateIf(supplied) @IsUUID() roomResourceId?:string;
  @ValidateIf(supplied) @IsUUID() excludeAppointmentId?:string;
  @ValidateIf(supplied) @Type(()=>Number) @IsInt() @Min(5) @Max(480) durationMinutes?:number;
}
export class ServiceInput {
  @Transform(({value}:{value:unknown})=>typeof value==='string'?normalizeName(value):value)
  @IsString() @MinLength(2) @MaxLength(100) @Matches(safeText) name!:string;
  @IsInt() @Min(5) @Max(480) durationMinutes!:number;
  @IsBoolean() requiresRoom!:boolean;
}
export class UpdateService extends ServiceInput {
  @IsBoolean() active!:boolean;
  @IsInt() @Min(1) @Max(2147483646) expectedVersion!:number;
}
export class ResourceInput {
  @Transform(({value}:{value:unknown})=>typeof value==='string'?normalizeName(value):value)
  @IsString() @MinLength(2) @MaxLength(100) @Matches(safeText) label!:string;
  @IsIn(['DOCTOR','ROOM']) kind!:'DOCTOR'|'ROOM';
  @ValidateIf(nonNull) @IsUUID() doctorMembershipId?:string|null;
}
export class UpdateResource extends VersionInput {
  @Transform(({value}:{value:unknown})=>typeof value==='string'?normalizeName(value):value)
  @IsString() @MinLength(2) @MaxLength(100) @Matches(safeText) label!:string;
  @IsBoolean() active!:boolean;
}
export class WeeklyIntervalInput {
  @IsInt() @Min(1) @Max(7) weekday!:number;
  @IsInt() @Min(0) @Max(1439) startMinute!:number;
  @IsInt() @Min(1) @Max(1440) endMinute!:number;
}
export class ScheduleInput extends VersionInput {
  @IsArray() @ArrayMaxSize(28) @ValidateNested({each:true}) @Type(()=>WeeklyIntervalInput) intervals!:WeeklyIntervalInput[];
}
export class TimeOffInput {
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/) startLocal!:string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/) endLocal!:string;
  @IsIn(['REJECT','EARLIER','LATER']) startDisambiguation:'REJECT'|'EARLIER'|'LATER'='REJECT';
  @IsIn(['REJECT','EARLIER','LATER']) endDisambiguation:'REJECT'|'EARLIER'|'LATER'='REJECT';
  @IsInt() @Min(1) @Max(2147483646) expectedVersion!:number;
}
export class TimeOffUpdate extends VersionInput {@IsBoolean() active!:boolean;}
export class AppointmentRoute {@IsUUID() clinicId!:string;@IsUUID() appointmentId!:string;}
export class ResourceRoute {@IsUUID() clinicId!:string;@IsUUID() resourceId!:string;}
export class ServiceRoute {@IsUUID() clinicId!:string;@IsUUID() serviceId!:string;}
export class TimeOffRoute extends ResourceRoute {@IsUUID() timeOffId!:string;}
