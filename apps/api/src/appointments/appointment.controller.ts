import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ClinicPermissions, type AuthRequest } from '../auth/access.js';
import { AppointmentRepository } from '../prisma/appointment.repository.js';
import { AppointmentQuery, AppointmentRoute, AppointmentStatusInput, AvailabilityQuery, CreateAppointment, UpdateAppointment } from './scheduling-input.js';
@Controller('clinics/:clinicId')
export class AppointmentController {
  constructor(private readonly appointments:AppointmentRepository){}
  @Get('scheduling/settings') @ClinicPermissions('appointments.read') settings(@Req() r:AuthRequest,@Param('clinicId') id:string){return this.appointments.settings(r.auth!.principal,id);}
  @Get('appointments') @ClinicPermissions('appointments.read') list(@Req() r:AuthRequest,@Param('clinicId') id:string,@Query() q:AppointmentQuery){return this.appointments.list(r.auth!.principal,id,q);}
  @Get('appointments/:appointmentId') @ClinicPermissions('appointments.read') get(@Req() r:AuthRequest,@Param() p:AppointmentRoute){return this.appointments.get(r.auth!.principal,p.clinicId,p.appointmentId);}
  @Post('appointments') @ClinicPermissions('appointments.create') create(@Req() r:AuthRequest,@Param('clinicId') id:string,@Body() b:CreateAppointment){return this.appointments.create(r.auth!.principal,id,b);}
  @Patch('appointments/:appointmentId') @ClinicPermissions('appointments.update') update(@Req() r:AuthRequest,@Param() p:AppointmentRoute,@Body() b:UpdateAppointment){return this.appointments.update(r.auth!.principal,p.clinicId,p.appointmentId,b);}
  @Patch('appointments/:appointmentId/status') @ClinicPermissions('appointments.update') status(@Req() r:AuthRequest,@Param() p:AppointmentRoute,@Body() b:AppointmentStatusInput){return this.appointments.status(r.auth!.principal,p.clinicId,p.appointmentId,b);}
  @Get('availability') @ClinicPermissions('appointments.read') availability(@Req() r:AuthRequest,@Param('clinicId') id:string,@Query() q:AvailabilityQuery){return this.appointments.availability(r.auth!.principal,id,q);}
}
