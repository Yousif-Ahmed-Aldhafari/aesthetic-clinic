import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ClinicPermissions, type AuthRequest } from '../auth/access.js';
import { TreatmentRepository } from '../prisma/treatment.repository.js';
import { AddTreatmentItemDto, CatalogDto, CatalogRoute, ChangeTreatmentStatusDto, CreateExecutionDto, CreateTreatmentPlanDto, ExecutionRoute, ExecutionStatusDto, ItemRoute, PlanRoute, ReviseTreatmentPlanDto, TreatmentListQuery, UpdateCatalogDto, UpdateTreatmentItemDto, UpdateTreatmentRevisionDto, VersionDto } from './treatment-input.js';
@Controller('clinics/:clinicId/clinical')
export class TreatmentController {
 constructor(private readonly treatment:TreatmentRepository){}
 @Get('patients/:patientId/treatment-plans') @ClinicPermissions('clinical.treatment-plans.read') list(@Req()r:AuthRequest,@Param('clinicId')c:string,@Param('patientId')p:string,@Query()q:TreatmentListQuery){return this.treatment.list(r.auth!.principal,c,p,q);}
 @Get('treatment-plans/:planId') @ClinicPermissions('clinical.treatment-plans.read') get(@Req()r:AuthRequest,@Param()p:PlanRoute){return this.treatment.get(r.auth!.principal,p.clinicId,p.planId);}
 @Post('treatment-plans') @ClinicPermissions('clinical.treatment-plans.create') create(@Req()r:AuthRequest,@Param('clinicId')c:string,@Body()b:CreateTreatmentPlanDto){return this.treatment.create(r.auth!.principal,c,b);}
 @Patch('treatment-plans/:planId/draft') @ClinicPermissions('clinical.treatment-plans.update') update(@Req()r:AuthRequest,@Param()p:PlanRoute,@Body()b:UpdateTreatmentRevisionDto){return this.treatment.updateDraft(r.auth!.principal,p.clinicId,p.planId,b);}
 @Post('treatment-plans/:planId/items') @ClinicPermissions('clinical.treatment-plans.update') addItem(@Req()r:AuthRequest,@Param()p:PlanRoute,@Body()b:AddTreatmentItemDto){return this.treatment.addItem(r.auth!.principal,p.clinicId,p.planId,b);}
 @Patch('treatment-plans/:planId/items/:itemId') @ClinicPermissions('clinical.treatment-plans.update') updateItem(@Req()r:AuthRequest,@Param()p:ItemRoute,@Body()b:UpdateTreatmentItemDto){return this.treatment.updateItem(r.auth!.principal,p.clinicId,p.planId,p.itemId,b);}
 @Delete('treatment-plans/:planId/items/:itemId') @ClinicPermissions('clinical.treatment-plans.update') removeItem(@Req()r:AuthRequest,@Param()p:ItemRoute){return this.treatment.removeItem(r.auth!.principal,p.clinicId,p.planId,p.itemId);}
 @Post('treatment-plans/:planId/approve') @ClinicPermissions('clinical.treatment-plans.approve') approve(@Req()r:AuthRequest,@Param()p:PlanRoute,@Body()b:VersionDto){return this.treatment.approve(r.auth!.principal,p.clinicId,p.planId,b);}
 @Post('treatment-plans/:planId/revisions') @ClinicPermissions('clinical.treatment-plans.update') revise(@Req()r:AuthRequest,@Param()p:PlanRoute,@Body()b:ReviseTreatmentPlanDto){return this.treatment.revise(r.auth!.principal,p.clinicId,p.planId,b);}
 @Patch('treatment-plans/:planId/status') @ClinicPermissions('clinical.treatment-plans.update') status(@Req()r:AuthRequest,@Param()p:PlanRoute,@Body()b:ChangeTreatmentStatusDto){return this.treatment.status(r.auth!.principal,p.clinicId,p.planId,b);}
 @Get('procedure-catalog') @ClinicPermissions('clinical.procedure-catalog.read') catalog(@Req()r:AuthRequest,@Param('clinicId')c:string){return this.treatment.catalog(r.auth!.principal,c);}
 @Post('procedure-catalog') @ClinicPermissions('clinical.procedure-catalog.manage') createCatalog(@Req()r:AuthRequest,@Param('clinicId')c:string,@Body()b:CatalogDto){return this.treatment.createCatalog(r.auth!.principal,c,b);}
 @Patch('procedure-catalog/:catalogId') @ClinicPermissions('clinical.procedure-catalog.manage') updateCatalog(@Req()r:AuthRequest,@Param()p:CatalogRoute,@Body()b:UpdateCatalogDto){return this.treatment.updateCatalog(r.auth!.principal,p.clinicId,p.catalogId,b);}
 @Post('procedure-executions') @ClinicPermissions('clinical.procedures.document') execution(@Req()r:AuthRequest,@Param('clinicId')c:string,@Body()b:CreateExecutionDto){return this.treatment.createExecution(r.auth!.principal,c,b);}
 @Get('procedure-executions/:executionId/eligibility') @ClinicPermissions('clinical.procedures.read') eligibility(@Req()r:AuthRequest,@Param()p:ExecutionRoute){return this.treatment.eligibility(r.auth!.principal,p.clinicId,p.executionId);}
 @Patch('procedure-executions/:executionId/status') @ClinicPermissions('clinical.procedures.perform') executionStatus(@Req()r:AuthRequest,@Param()p:ExecutionRoute,@Body()b:ExecutionStatusDto){return this.treatment.executionStatus(r.auth!.principal,p.clinicId,p.executionId,b);}
}
