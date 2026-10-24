import { Injectable } from '@nestjs/common';
import type { Permission } from '../auth/permissions.js';
import { TenantDatabaseService } from './tenant-database.service.js';
import type { VerifiedPrincipal } from './verified-sessions.js';
@Injectable()
export class ClinicRepository {
  constructor(private readonly database:TenantDatabaseService) {}
  context(proof:VerifiedPrincipal,clinicId:string,required:readonly Permission[]) {
    return this.database.withClinicContext(proof,clinicId,required,async(tx,context)=>{
      const b=await tx.clinicBranding.findUnique({where:{clinicId:context.clinicId}});
      return {...context,branding:b?{logoUrl:b.logoUrl,primaryColor:b.primaryColor,secondaryColor:b.secondaryColor,accentColor:b.accentColor}:null};
    });
  }
  settings(proof:VerifiedPrincipal,clinicId:string) {
    return this.database.withClinicContext(proof,clinicId,['clinic.settings.read'],(tx,context)=>
      tx.clinic.findUniqueOrThrow({where:{id:context.clinicId},select:{displayName:true,timezone:true,currency:true}}));
  }
}
