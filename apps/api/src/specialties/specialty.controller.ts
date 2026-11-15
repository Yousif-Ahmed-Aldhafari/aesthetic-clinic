import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ClinicPermissions, type AuthRequest } from '../auth/access.js';
import { SpecialtyRepository } from '../prisma/specialty.repository.js';
import {
  AddQualificationDto,
  CreatePractitionerProfileDto,
  RejectPrivilegeDto,
  RejectQualificationDto,
  RequestClinicalPrivilegeDto,
  UpdatePractitionerProfileDto,
} from './specialty.dto.js';

interface ClinicRouteParams {
  clinicId: string;
}

interface SpecialtyCodeRouteParams extends ClinicRouteParams {
  code: string;
}

interface BranchSpecialtyRouteParams extends SpecialtyCodeRouteParams {
  branchId: string;
}

interface BranchListRouteParams extends ClinicRouteParams {
  branchId: string;
}

interface PractitionerRouteParams extends ClinicRouteParams {
  membershipId: string;
}

interface QualificationRouteParams extends ClinicRouteParams {
  qualificationId: string;
}

interface PrivilegeRouteParams extends ClinicRouteParams {
  privilegeId: string;
}

@Controller('clinics/:clinicId')
export class SpecialtyController {
  constructor(private readonly repository: SpecialtyRepository) {}

  // 1. Global Specialty Reference Catalog
  @Get('specialties/catalog')
  @ClinicPermissions('specialties.read')
  listCatalog(@Req() req: AuthRequest, @Param() params: ClinicRouteParams) {
    return this.repository.listCatalog(req.auth!.principal, params.clinicId);
  }

  // 2. Clinic Specialty Configuration
  @Get('specialties')
  @ClinicPermissions('specialties.read')
  listClinicSpecialties(@Req() req: AuthRequest, @Param() params: ClinicRouteParams) {
    return this.repository.listClinicSpecialties(req.auth!.principal, params.clinicId);
  }

  @Post('specialties/:code/enable')
  @ClinicPermissions('specialties.manage')
  enableClinicSpecialty(
    @Req() req: AuthRequest,
    @Param() params: SpecialtyCodeRouteParams,
  ) {
    return this.repository.enableClinicSpecialty(req.auth!.principal, params.clinicId, params.code);
  }

  @Post('specialties/:code/disable')
  @ClinicPermissions('specialties.manage')
  disableClinicSpecialty(
    @Req() req: AuthRequest,
    @Param() params: SpecialtyCodeRouteParams,
  ) {
    return this.repository.disableClinicSpecialty(req.auth!.principal, params.clinicId, params.code);
  }

  // 3. Branch Specialty Availability
  @Get('branches/:branchId/specialties')
  @ClinicPermissions('specialties.read')
  listBranchSpecialties(
    @Req() req: AuthRequest,
    @Param() params: BranchListRouteParams,
  ) {
    return this.repository.listBranchSpecialties(req.auth!.principal, params.clinicId, params.branchId);
  }

  @Post('branches/:branchId/specialties/:code/enable')
  @ClinicPermissions('specialties.manage')
  enableBranchSpecialty(
    @Req() req: AuthRequest,
    @Param() params: BranchSpecialtyRouteParams,
  ) {
    return this.repository.enableBranchSpecialty(req.auth!.principal, params.clinicId, params.branchId, params.code);
  }

  @Post('branches/:branchId/specialties/:code/disable')
  @ClinicPermissions('specialties.manage')
  disableBranchSpecialty(
    @Req() req: AuthRequest,
    @Param() params: BranchSpecialtyRouteParams,
  ) {
    return this.repository.disableBranchSpecialty(req.auth!.principal, params.clinicId, params.branchId, params.code);
  }

  // 4. Practitioner Profiles
  @Get('practitioners')
  @ClinicPermissions('practitioners.profiles.read')
  listPractitioners(@Req() req: AuthRequest, @Param() params: ClinicRouteParams) {
    return this.repository.listPractitioners(req.auth!.principal, params.clinicId);
  }

  @Get('practitioners/:membershipId')
  @ClinicPermissions('practitioners.profiles.read')
  getPractitionerProfile(
    @Req() req: AuthRequest,
    @Param() params: PractitionerRouteParams,
  ) {
    return this.repository.getPractitionerProfile(req.auth!.principal, params.clinicId, params.membershipId);
  }

  @Post('practitioners')
  @ClinicPermissions('practitioners.profiles.manage')
  upsertPractitionerProfile(
    @Req() req: AuthRequest,
    @Param() params: ClinicRouteParams,
    @Body() body: CreatePractitionerProfileDto,
  ) {
    return this.repository.upsertPractitionerProfile(req.auth!.principal, params.clinicId, body);
  }

  @Patch('practitioners/:membershipId')
  @ClinicPermissions('practitioners.profiles.manage')
  updatePractitionerProfile(
    @Req() req: AuthRequest,
    @Param() params: PractitionerRouteParams,
    @Body() body: UpdatePractitionerProfileDto,
  ) {
    return this.repository.upsertPractitionerProfile(req.auth!.principal, params.clinicId, {
      ...body,
      membershipId: params.membershipId,
      professionalTitleAr: body.professionalTitleAr ?? '',
      professionalTitleEn: body.professionalTitleEn ?? '',
    });
  }

  // 5. Medical Director Designation (CLINIC_OWNER only)
  @Post('practitioners/:membershipId/designate-medical-director')
  @ClinicPermissions('staff.manage')
  designateMedicalDirector(
    @Req() req: AuthRequest,
    @Param() params: PractitionerRouteParams,
  ) {
    return this.repository.designateMedicalDirector(req.auth!.principal, params.clinicId, params.membershipId);
  }

  // 6. Practitioner Qualifications
  @Post('practitioners/:membershipId/qualifications')
  @ClinicPermissions('practitioners.profiles.manage')
  addQualification(
    @Req() req: AuthRequest,
    @Param() params: PractitionerRouteParams,
    @Body() body: AddQualificationDto,
  ) {
    return this.repository.addPractitionerQualification(req.auth!.principal, params.clinicId, params.membershipId, body);
  }

  @Post('qualifications/:qualificationId/verify')
  @ClinicPermissions('practitioners.profiles.read')
  verifyQualification(
    @Req() req: AuthRequest,
    @Param() params: QualificationRouteParams,
  ) {
    return this.repository.verifyPractitionerQualification(req.auth!.principal, params.clinicId, params.qualificationId);
  }

  @Post('qualifications/:qualificationId/reject')
  @ClinicPermissions('practitioners.profiles.read')
  rejectQualification(
    @Req() req: AuthRequest,
    @Param() params: QualificationRouteParams,
    @Body() body: RejectQualificationDto,
  ) {
    return this.repository.rejectPractitionerQualification(req.auth!.principal, params.clinicId, params.qualificationId, body.reason);
  }

  // 7. Clinical Privileges
  @Post('practitioners/:membershipId/privileges/request')
  @ClinicPermissions('privileges.request')
  requestPrivilege(
    @Req() req: AuthRequest,
    @Param() params: PractitionerRouteParams,
    @Body() body: RequestClinicalPrivilegeDto,
  ) {
    return this.repository.requestClinicalPrivilege(req.auth!.principal, params.clinicId, params.membershipId, body);
  }

  @Post('privileges/:privilegeId/approve')
  @ClinicPermissions('privileges.read')
  approvePrivilege(
    @Req() req: AuthRequest,
    @Param() params: PrivilegeRouteParams,
  ) {
    return this.repository.approveClinicalPrivilege(req.auth!.principal, params.clinicId, params.privilegeId);
  }

  @Post('privileges/:privilegeId/revoke')
  @ClinicPermissions('privileges.read')
  revokePrivilege(
    @Req() req: AuthRequest,
    @Param() params: PrivilegeRouteParams,
    @Body() body: RejectPrivilegeDto,
  ) {
    return this.repository.revokeClinicalPrivilege(req.auth!.principal, params.clinicId, params.privilegeId, body.reason);
  }

  // 8. Medical Director Review Queue
  @Get('privileges/approval-queue')
  @ClinicPermissions('privileges.read')
  listApprovalQueue(
    @Req() req: AuthRequest,
    @Param() params: ClinicRouteParams,
  ) {
    return this.repository.listApprovalQueue(req.auth!.principal, params.clinicId);
  }
}
