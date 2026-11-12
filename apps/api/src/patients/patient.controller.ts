import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ClinicPermissions, type AuthRequest } from '../auth/access.js';
import { PatientRepository } from '../prisma/patient.repository.js';
import { PatientPortalRepository } from '../prisma/patient-portal.repository.js';
import { CreatePatient, PatientQuery, PatientRoute, PatientStatusChange, UpdatePatient } from './patient-input.js';
import { CreatePortalInvitationDto } from '../portal/patient-portal.dto.js';

@Controller('clinics/:clinicId/patients')
export class PatientController {
  constructor(
    private readonly patients:PatientRepository,
    private readonly portalRepo:PatientPortalRepository,
  ) {}
  @Get() @ClinicPermissions('patients.read')
  list(@Req() r:AuthRequest,@Param('clinicId') clinicId:string,@Query() query:PatientQuery) {return this.patients.list(r.auth!.principal,clinicId,query);}
  @Get(':patientId') @ClinicPermissions('patients.read')
  get(@Req() r:AuthRequest,@Param() route:PatientRoute) {return this.patients.get(r.auth!.principal,route.clinicId,route.patientId);}
  @Post() @ClinicPermissions('patients.create')
  create(@Req() r:AuthRequest,@Param('clinicId') clinicId:string,@Body() body:CreatePatient) {return this.patients.create(r.auth!.principal,clinicId,body);}
  @Patch(':patientId') @ClinicPermissions('patients.update')
  update(@Req() r:AuthRequest,@Param() route:PatientRoute,@Body() body:UpdatePatient) {return this.patients.update(r.auth!.principal,route.clinicId,route.patientId,body);}
  @Patch(':patientId/status') @ClinicPermissions('patients.update')
  status(@Req() r:AuthRequest,@Param() route:PatientRoute,@Body() body:PatientStatusChange) {return this.patients.status(r.auth!.principal,route.clinicId,route.patientId,body);}
  @Post(':patientId/portal-invitation') @ClinicPermissions('patients.update')
  createInvitation(@Req() r:AuthRequest,@Param() route:PatientRoute,@Body() body:CreatePortalInvitationDto) {
    return this.portalRepo.createInvitation(r.auth!.principal,route.clinicId,route.patientId,body);
  }
}
