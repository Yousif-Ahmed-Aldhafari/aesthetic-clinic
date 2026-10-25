import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsUUID, Matches, Max, Min, ValidateIf } from 'class-validator';
import { VersionInput } from '../appointments/scheduling-input.js';
const supplied=(_o:unknown,v:unknown)=>v!==undefined;
const nonNull=(_o:unknown,v:unknown)=>v!==undefined&&v!==null;
export const queueStatuses=['WAITING','CALLED','IN_SERVICE','COMPLETED','CANCELLED','ABSENT'] as const;
export class QueueRoute {@IsUUID() clinicId!:string;@IsUUID() ticketId!:string;}
export class CheckInInput extends VersionInput {@IsUUID() appointmentId!:string;}
export class QueueAssignment {
  @IsUUID() doctorResourceId!:string;
  @ValidateIf(nonNull) @IsUUID() roomResourceId?:string|null;
}
export class WalkInInput extends QueueAssignment {@IsUUID() patientId!:string;@IsUUID() requestKey!:string;}
export class CallNextInput {@IsUUID() doctorResourceId!:string;@IsUUID() requestKey!:string;}
export class TransferInput extends QueueAssignment {@IsInt() @Min(1) @Max(2147483646) expectedVersion!:number;}
export class QueueActionInput extends VersionInput {@IsIn(['RECALL','START','COMPLETE','ABSENT','CANCEL']) action!:'RECALL'|'START'|'COMPLETE'|'ABSENT'|'CANCEL';}
export class QueueQuery {
  @IsIn(['LIVE','DAY']) scope:'LIVE'|'DAY'='LIVE';
  @ValidateIf(supplied) @Matches(/^\d{4}-\d{2}-\d{2}$/) date?:string;
  @ValidateIf(supplied) @IsUUID() doctorResourceId?:string;
  @IsIn([...queueStatuses,'ALL']) status:typeof queueStatuses[number]|'ALL'='ALL';
  @Type(()=>Number) @IsInt() @Min(1) @Max(100) pageSize=50;
  @ValidateIf(supplied) @IsUUID() cursor?:string;
}
export class QueueConfigurationInput extends VersionInput {@IsBoolean() publicDisplayEnabled!:boolean;}
