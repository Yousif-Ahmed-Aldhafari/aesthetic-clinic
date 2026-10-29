import { Injectable } from '@nestjs/common';
export type ConsentEligibility={eligible:boolean;reason:'VERIFIED_CONSENT_REQUIRED'};
/** Step 3.3 replaces this implementation with a verified, server-owned consent lookup. */
@Injectable()
export class ConsentEligibilityService {
  async check(_clinicId:string,_patientId:string,_procedureExecutionId:string):Promise<ConsentEligibility>{return {eligible:false,reason:'VERIFIED_CONSENT_REQUIRED'};}
}
