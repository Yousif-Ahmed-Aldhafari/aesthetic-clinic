import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ClinicPermissions, PublicRoute, RequireStepUp, type AuthRequest } from '../auth/access.js';
import { ClinicAdministrationRepository } from '../prisma/clinic-administration.repository.js';
import { PublicBrandingRepository } from '../prisma/public-branding.repository.js';
import { AssetStore } from './asset-store.js';
import { AssetService, type ImageUpload } from './asset.service.js';
import { DomainVerifier } from './domain-verifier.js';
import { AssetRoute, BrandingInput, CleanupInput, ClinicRoute, DomainInput, DomainRoute, IdentityPage, IdentityVersion, MemberInput, MemberRoute, ProfileInput, PublicAssetRoute, SubdomainInput, UploadRoute } from './identity-input.js';

@Controller('clinics/:clinicId/identity')
export class ClinicAdministrationController {
  constructor(private readonly repository:ClinicAdministrationRepository,private readonly assets:AssetService,private readonly store:AssetStore,private readonly verifier:DomainVerifier){}
  @Get('profile') @ClinicPermissions('clinic.settings.read')
  profile(@Req() r:AuthRequest,@Param() p:ClinicRoute){return this.repository.profile(r.auth!.principal,p.clinicId);}
  @Patch('profile') @ClinicPermissions('clinic.settings.update')
  updateProfile(@Req() r:AuthRequest,@Param() p:ClinicRoute,@Body() b:ProfileInput){return this.repository.updateProfile(r.auth!.principal,p.clinicId,b);}
  @Get('branding') @ClinicPermissions('clinic.branding.read')
  branding(@Req() r:AuthRequest,@Param() p:ClinicRoute){return this.repository.branding(r.auth!.principal,p.clinicId);}
  @Patch('branding') @ClinicPermissions('clinic.branding.update')
  updateBranding(@Req() r:AuthRequest,@Param() p:ClinicRoute,@Body() b:BrandingInput){return this.repository.updateBranding(r.auth!.principal,p.clinicId,b);}
  @Post('assets/cleanup') @ClinicPermissions('clinic.branding.update')
  cleanup(@Req() r:AuthRequest,@Param() p:ClinicRoute,@Body() _b:CleanupInput){return this.assets.cleanup(r.auth!.principal,p.clinicId);}
  @Post('assets/:purpose') @ClinicPermissions('clinic.branding.update')
  @UseInterceptors(FileInterceptor('file',{limits:{fileSize:2097152,files:1,fields:0,parts:1}}))
  upload(@Req() r:AuthRequest,@Param() p:UploadRoute,@UploadedFile() file:ImageUpload|undefined){return this.assets.upload(r.auth!.principal,p.clinicId,p.purpose,file);}
  @Get('assets/:assetId') @ClinicPermissions('clinic.branding.update')
  async asset(@Req() r:AuthRequest,@Param() p:AssetRoute){const asset=await this.repository.asset(r.auth!.principal,p.clinicId,p.assetId);return new StreamableFile(await this.store.read(asset.storageKey),{type:asset.mimeType,disposition:'inline'});}
  @Patch('subdomain') @ClinicPermissions('clinic.settings.update')
  reserve(@Req() r:AuthRequest,@Param() p:ClinicRoute,@Body() b:SubdomainInput){return this.repository.reserve(r.auth!.principal,p.clinicId,b.slug,b.expectedVersion);}
  @Get('domains') @ClinicPermissions('clinic.settings.read')
  domains(@Req() r:AuthRequest,@Param() p:ClinicRoute){return this.repository.domains(r.auth!.principal,p.clinicId);}
  @Post('domains') @ClinicPermissions('clinic.settings.update')
  createDomain(@Req() r:AuthRequest,@Param() p:ClinicRoute,@Body() b:DomainInput){return this.repository.createDomain(r.auth!.principal,p.clinicId,b.hostname);}
  @Post('domains/:domainId/challenge') @ClinicPermissions('clinic.settings.update')
  challenge(@Req() r:AuthRequest,@Param() p:DomainRoute,@Body() b:IdentityVersion){return this.repository.rotateChallenge(r.auth!.principal,p.clinicId,p.domainId,b.expectedVersion);}
  @Post('domains/:domainId/verify') @ClinicPermissions('clinic.settings.update') @RequireStepUp(15)
  async verify(@Req() r:AuthRequest,@Param() p:DomainRoute,@Body() b:IdentityVersion){const check=await this.repository.beginVerification(r.auth!.principal,p.clinicId,p.domainId,b.expectedVersion);const owns=await this.verifier.owns(check.hostname,check.challengeHash);return this.repository.finishVerification(r.auth!.principal,p.clinicId,p.domainId,check.version,owns);}
  @Get('members') @ClinicPermissions('staff.read')
  members(@Req() r:AuthRequest,@Param() p:ClinicRoute,@Query() q:IdentityPage){return this.repository.members(r.auth!.principal,p.clinicId,q);}
  @Patch('members/:membershipId') @ClinicPermissions('staff.manage') @RequireStepUp(15)
  updateMember(@Req() r:AuthRequest,@Param() p:MemberRoute,@Body() b:MemberInput){return this.repository.updateMember(r.auth!.principal,p.clinicId,p.membershipId,b);}
  @Get('audit') @ClinicPermissions('clinic.settings.read')
  audit(@Req() r:AuthRequest,@Param() p:ClinicRoute,@Query() q:IdentityPage){return this.repository.audit(r.auth!.principal,p.clinicId,q);}
}
@Controller('public/branding/assets')
export class PublicAssetController {
  constructor(private readonly repository:PublicBrandingRepository,private readonly store:AssetStore){}
  @Get(':assetId') @PublicRoute()
  async asset(@Param() p:PublicAssetRoute,@Res({passthrough:true}) response:Response){const asset=await this.repository.asset(p.assetId);const data=await this.store.read(asset.storageKey);response.setHeader('Cache-Control','public, max-age=300, must-revalidate');response.setHeader('ETag',`"${asset.sha256}"`);response.setHeader('Cross-Origin-Resource-Policy','same-origin');return new StreamableFile(data,{type:asset.mimeType,disposition:'inline'});}
}
