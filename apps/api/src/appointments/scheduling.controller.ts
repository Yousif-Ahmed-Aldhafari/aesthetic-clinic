import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ClinicPermissions, type AuthRequest } from '../auth/access.js';
import { SchedulingRepository } from '../prisma/scheduling.repository.js';
import { CatalogQuery, RangeQuery, ResourceInput, ResourceRoute, ScheduleInput, ServiceInput, ServiceRoute, TimeOffInput, TimeOffRoute, TimeOffUpdate, UpdateResource, UpdateService } from './scheduling-input.js';
@Controller('clinics/:clinicId')
export class SchedulingController {
  constructor(private readonly scheduling:SchedulingRepository){}
  @Get('services') @ClinicPermissions('appointments.read') services(@Req() r:AuthRequest,@Param('clinicId') c:string,@Query() q:CatalogQuery){return this.scheduling.services(r.auth!.principal,c,q);}
  @Post('services') @ClinicPermissions('clinic.settings.update') createService(@Req() r:AuthRequest,@Param('clinicId') c:string,@Body() b:ServiceInput){return this.scheduling.createService(r.auth!.principal,c,b);}
  @Patch('services/:serviceId') @ClinicPermissions('clinic.settings.update') updateService(@Req() r:AuthRequest,@Param() p:ServiceRoute,@Body() b:UpdateService){return this.scheduling.updateService(r.auth!.principal,p.clinicId,p.serviceId,b);}
  @Get('resources') @ClinicPermissions('appointments.read') resources(@Req() r:AuthRequest,@Param('clinicId') c:string,@Query() q:CatalogQuery){return this.scheduling.resources(r.auth!.principal,c,q);}
  @Get('scheduling/doctors') @ClinicPermissions('clinic.settings.update','staff.read') doctors(@Req() r:AuthRequest,@Param('clinicId') c:string,@Query() q:CatalogQuery){return this.scheduling.doctors(r.auth!.principal,c,q);}
  @Post('resources') @ClinicPermissions('clinic.settings.update','staff.read') createResource(@Req() r:AuthRequest,@Param('clinicId') c:string,@Body() b:ResourceInput){return this.scheduling.createResource(r.auth!.principal,c,b);}
  @Patch('resources/:resourceId') @ClinicPermissions('clinic.settings.update') updateResource(@Req() r:AuthRequest,@Param() p:ResourceRoute,@Body() b:UpdateResource){return this.scheduling.updateResource(r.auth!.principal,p.clinicId,p.resourceId,b);}
  @Get('resources/:resourceId/schedule') @ClinicPermissions('appointments.read') schedule(@Req() r:AuthRequest,@Param() p:ResourceRoute){return this.scheduling.schedule(r.auth!.principal,p.clinicId,p.resourceId);}
  @Patch('resources/:resourceId/schedule') @ClinicPermissions('clinic.settings.update') updateSchedule(@Req() r:AuthRequest,@Param() p:ResourceRoute,@Body() b:ScheduleInput){return this.scheduling.updateSchedule(r.auth!.principal,p.clinicId,p.resourceId,b);}
  @Get('resources/:resourceId/time-off') @ClinicPermissions('appointments.read') timeOff(@Req() r:AuthRequest,@Param() p:ResourceRoute,@Query() q:RangeQuery){return this.scheduling.timeOff(r.auth!.principal,p.clinicId,p.resourceId,q);}
  @Post('resources/:resourceId/time-off') @ClinicPermissions('clinic.settings.update') createTimeOff(@Req() r:AuthRequest,@Param() p:ResourceRoute,@Body() b:TimeOffInput){return this.scheduling.createTimeOff(r.auth!.principal,p.clinicId,p.resourceId,b);}
  @Patch('resources/:resourceId/time-off/:timeOffId') @ClinicPermissions('clinic.settings.update') updateTimeOff(@Req() r:AuthRequest,@Param() p:TimeOffRoute,@Body() b:TimeOffUpdate){return this.scheduling.updateTimeOff(r.auth!.principal,p.clinicId,p.resourceId,p.timeOffId,b);}
}
