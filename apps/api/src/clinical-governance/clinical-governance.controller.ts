import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ClinicPermissions, type AuthRequest } from '../auth/access.js';
import { ClinicalGovernanceRepository } from '../prisma/clinical-governance.repository.js';
import {
  ApprovePolicyVersionDto,
  ConductPrivilegeReviewDto,
  CreatePolicyVersionDto,
  CreateSafetyPolicyDto,
  InvestigateClinicalIncidentDto,
  ReportClinicalIncidentDto,
  RequestBreakGlassDto,
  ReviewBreakGlassDto,
  RevokeBreakGlassDto,
  RollbackPolicyDto,
} from './clinical-governance.dto.js';

interface ClinicParams {
  clinicId: string;
}

interface PolicyParams extends ClinicParams {
  policyId: string;
}

interface VersionParams extends PolicyParams {
  versionId: string;
}

interface IncidentParams extends ClinicParams {
  incidentId: string;
}

interface BreakGlassParams extends ClinicParams {
  breakGlassId: string;
}

@Controller('clinics/:clinicId/clinical-governance')
export class ClinicalGovernanceController {
  constructor(private readonly repo: ClinicalGovernanceRepository) {}

  // --------------------------------------------------------------------------
  // Safety Policies & Protocols
  // --------------------------------------------------------------------------

  @Post('policies')
  @ClinicPermissions('clinical.safety-policies.manage')
  async createPolicy(
    @Param() params: ClinicParams,
    @Body() dto: CreateSafetyPolicyDto,
    @Req() req: AuthRequest,
  ) {
    return this.repo.createSafetyPolicy(req.auth!.principal, params.clinicId, dto);
  }

  @Get('policies')
  @ClinicPermissions('clinical.safety-policies.read')
  async listPolicies(
    @Param() params: ClinicParams,
    @Req() req: AuthRequest,
  ) {
    return this.repo.listSafetyPolicies(req.auth!.principal, params.clinicId);
  }

  @Post('policies/:policyId/versions')
  @ClinicPermissions('clinical.safety-policies.manage')
  async createPolicyVersion(
    @Param() params: PolicyParams,
    @Body() dto: CreatePolicyVersionDto,
    @Req() req: AuthRequest,
  ) {
    return this.repo.createPolicyVersion(req.auth!.principal, params.clinicId, params.policyId, dto);
  }

  @Post('policies/:policyId/versions/:versionId/approve')
  @ClinicPermissions('clinical.safety-policies.read')
  async approvePolicyVersion(
    @Param() params: VersionParams,
    @Body() dto: ApprovePolicyVersionDto,
    @Req() req: AuthRequest,
  ) {
    return this.repo.approvePolicyVersion(req.auth!.principal, params.clinicId, params.versionId, dto);
  }

  @Post('policies/:policyId/versions/:versionId/activate')
  @ClinicPermissions('clinical.safety-policies.manage')
  async activatePolicyVersion(
    @Param() params: VersionParams,
    @Req() req: AuthRequest,
  ) {
    return this.repo.activatePolicyVersion(req.auth!.principal, params.clinicId, params.versionId);
  }

  @Post('policies/:policyId/rollback')
  @ClinicPermissions('clinical.safety-policies.read')
  async rollbackPolicy(
    @Param() params: PolicyParams,
    @Body() dto: RollbackPolicyDto,
    @Req() req: AuthRequest,
  ) {
    return this.repo.rollbackPolicy(req.auth!.principal, params.clinicId, params.policyId, dto.targetVersionNumber);
  }

  // --------------------------------------------------------------------------
  // Clinical Incidents
  // --------------------------------------------------------------------------

  @Post('incidents')
  @ClinicPermissions('clinical.incidents.report')
  async reportIncident(
    @Param() params: ClinicParams,
    @Body() dto: ReportClinicalIncidentDto,
    @Req() req: AuthRequest,
  ) {
    return this.repo.reportIncident(req.auth!.principal, params.clinicId, dto);
  }

  @Get('incidents')
  @ClinicPermissions('clinical.incidents.read')
  async listIncidents(
    @Param() params: ClinicParams,
    @Req() req: AuthRequest,
  ) {
    return this.repo.listIncidents(req.auth!.principal, params.clinicId);
  }

  @Patch('incidents/:incidentId/investigate')
  @ClinicPermissions('clinical.incidents.read')
  async investigateIncident(
    @Param() params: IncidentParams,
    @Body() dto: InvestigateClinicalIncidentDto,
    @Req() req: AuthRequest,
  ) {
    return this.repo.investigateIncident(req.auth!.principal, params.clinicId, params.incidentId, dto);
  }

  // --------------------------------------------------------------------------
  // Emergency Break-Glass Access
  // --------------------------------------------------------------------------

  @Post('break-glass')
  @ClinicPermissions('clinical.break-glass.request')
  async requestBreakGlass(
    @Param() params: ClinicParams,
    @Body() dto: RequestBreakGlassDto,
    @Req() req: AuthRequest,
  ) {
    return this.repo.requestBreakGlass(req.auth!.principal, params.clinicId, dto);
  }

  @Get('break-glass')
  @ClinicPermissions('clinical.break-glass.audit')
  async listBreakGlass(
    @Param() params: ClinicParams,
    @Req() req: AuthRequest,
  ) {
    return this.repo.listBreakGlass(req.auth!.principal, params.clinicId);
  }

  @Post('break-glass/:breakGlassId/review')
  @ClinicPermissions('clinical.break-glass.audit')
  async reviewBreakGlass(
    @Param() params: BreakGlassParams,
    @Body() dto: ReviewBreakGlassDto,
    @Req() req: AuthRequest,
  ) {
    return this.repo.reviewBreakGlass(req.auth!.principal, params.clinicId, params.breakGlassId, dto);
  }

  @Post('break-glass/:breakGlassId/revoke')
  @ClinicPermissions('clinical.break-glass.request')
  async revokeBreakGlass(
    @Param() params: BreakGlassParams,
    @Body() dto: RevokeBreakGlassDto,
    @Req() req: AuthRequest,
  ) {
    return this.repo.revokeBreakGlass(req.auth!.principal, params.clinicId, params.breakGlassId, dto.reason);
  }

  // --------------------------------------------------------------------------
  // Privilege Reviews & Emergency Suspension
  // --------------------------------------------------------------------------

  @Post('privilege-reviews')
  @ClinicPermissions('privileges.read')
  async conductPrivilegeReview(
    @Param() params: ClinicParams,
    @Body() dto: ConductPrivilegeReviewDto,
    @Req() req: AuthRequest,
  ) {
    return this.repo.conductPrivilegeReview(req.auth!.principal, params.clinicId, dto);
  }

  @Get('privilege-reviews')
  @ClinicPermissions('privileges.read')
  async listPrivilegeReviews(
    @Param() params: ClinicParams,
    @Query('practitionerProfileId') practitionerProfileId: string | undefined,
    @Req() req: AuthRequest,
  ) {
    return this.repo.listPrivilegeReviews(req.auth!.principal, params.clinicId, practitionerProfileId);
  }
}
