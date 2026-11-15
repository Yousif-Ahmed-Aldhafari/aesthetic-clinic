import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ClinicPermissions, type AuthRequest } from '../auth/access.js';
import { ClinicalFormsRepository } from '../prisma/clinical-forms.repository.js';
import { AmendFormResponseDto, ApplicableFormsQueryDto, CreateFormDefinitionDto, CreateFormVersionDto, FormPageDto, FormResponsePageDto, FormResponseRoute, FormRoute, FormVersionRoute, SaveFormResponseDto, StartFormResponseDto, UpdateFormVersionDto, ValidateFormSchemaDto, VersionCommandDto } from './clinical-forms.dto.js';
@Controller('clinics/:clinicId/clinical/forms')
export class ClinicalFormsController{
 constructor(private readonly forms:ClinicalFormsRepository){}
 @Get('definitions')@ClinicPermissions('clinical.form-templates.read')definitions(@Req()r:AuthRequest,@Param('clinicId')c:string,@Query()q:FormPageDto){return this.forms.listDefinitions(r.auth!.principal,c,q);}
 @Post('definitions')@ClinicPermissions('clinical.form-templates.manage')create(@Req()r:AuthRequest,@Param('clinicId')c:string,@Body()b:CreateFormDefinitionDto){return this.forms.createDefinition(r.auth!.principal,c,b);}
 @Post('definitions/install-standard')@ClinicPermissions('clinical.form-templates.manage')install(@Req()r:AuthRequest,@Param('clinicId')c:string){return this.forms.installStandard(r.auth!.principal,c);}
 @Post('definitions/validate-schema')@ClinicPermissions('clinical.form-templates.manage')validateSchema(@Req()r:AuthRequest,@Param('clinicId')c:string,@Body()b:ValidateFormSchemaDto){return this.forms.validateSchema(r.auth!.principal,c,b);}
 @Post('definitions/:definitionId/versions')@ClinicPermissions('clinical.form-templates.manage')version(@Req()r:AuthRequest,@Param()p:FormRoute,@Body()b:CreateFormVersionDto){return this.forms.createVersion(r.auth!.principal,p.clinicId,p.definitionId,b);}
 @Patch('definitions/:definitionId/versions/:versionId')@ClinicPermissions('clinical.form-templates.manage')update(@Req()r:AuthRequest,@Param()p:FormVersionRoute,@Body()b:UpdateFormVersionDto){return this.forms.updateDraft(r.auth!.principal,p.clinicId,p.definitionId,p.versionId,b);}
 @Post('definitions/:definitionId/versions/:versionId/publish')@ClinicPermissions('clinical.form-templates.publish')publish(@Req()r:AuthRequest,@Param()p:FormVersionRoute,@Body()b:VersionCommandDto){return this.forms.publish(r.auth!.principal,p.clinicId,p.definitionId,p.versionId,b);}
 @Post('definitions/:definitionId/versions/:versionId/retire')@ClinicPermissions('clinical.form-templates.publish')retire(@Req()r:AuthRequest,@Param()p:FormVersionRoute,@Body()b:VersionCommandDto){return this.forms.retire(r.auth!.principal,p.clinicId,p.definitionId,p.versionId,b);}
 @Get('applicable')@ClinicPermissions('clinical.form-responses.read')applicable(@Req()r:AuthRequest,@Param('clinicId')c:string,@Query()q:ApplicableFormsQueryDto){return this.forms.applicable(r.auth!.principal,c,q.patientId,q.encounterId);}
 @Post('responses')@ClinicPermissions('clinical.form-responses.create')start(@Req()r:AuthRequest,@Param('clinicId')c:string,@Body()b:StartFormResponseDto){return this.forms.startResponse(r.auth!.principal,c,b);}
 @Get('responses')@ClinicPermissions('clinical.form-responses.read')responses(@Req()r:AuthRequest,@Param('clinicId')c:string,@Query()q:FormResponsePageDto){return this.forms.listResponses(r.auth!.principal,c,q.patientId,q.encounterId,q);}
 @Get('responses/:responseId')@ClinicPermissions('clinical.form-responses.read')response(@Req()r:AuthRequest,@Param()p:FormResponseRoute){return this.forms.getResponse(r.auth!.principal,p.clinicId,p.responseId);}
 @Patch('responses/:responseId')@ClinicPermissions('clinical.form-responses.update')save(@Req()r:AuthRequest,@Param()p:FormResponseRoute,@Body()b:SaveFormResponseDto){return this.forms.saveDraft(r.auth!.principal,p.clinicId,p.responseId,b);}
 @Post('responses/:responseId/submit')@ClinicPermissions('clinical.form-responses.update')submit(@Req()r:AuthRequest,@Param()p:FormResponseRoute,@Body()b:SaveFormResponseDto){return this.forms.submit(r.auth!.principal,p.clinicId,p.responseId,b);}
 @Post('responses/:responseId/finalize')@ClinicPermissions('clinical.form-responses.finalize')finalize(@Req()r:AuthRequest,@Param()p:FormResponseRoute,@Body()b:VersionCommandDto){return this.forms.finalize(r.auth!.principal,p.clinicId,p.responseId,b);}
 @Post('responses/:responseId/amendments')@ClinicPermissions('clinical.form-responses.amend')amend(@Req()r:AuthRequest,@Param()p:FormResponseRoute,@Body()b:AmendFormResponseDto){return this.forms.amend(r.auth!.principal,p.clinicId,p.responseId,b);}
}
