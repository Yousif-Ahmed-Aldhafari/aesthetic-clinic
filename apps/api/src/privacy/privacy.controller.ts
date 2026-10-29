import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ClinicPermissions, RequireStepUp, type AuthRequest } from '../auth/access.js';
import { PrivacyRepository } from '../prisma/privacy.repository.js';
import {
  CreatePatientExportDto,
  CreatePrivacyRequestDto,
  DecidePrivacyRequestDto,
  PrivacyRequestQueryDto,
  RevokeExportDto,
  UpdateRetentionPolicyDto,
} from './privacy.dto.js';

@Controller('clinics/:clinicId/privacy')
export class PrivacyController {
  constructor(private readonly privacyRepo: PrivacyRepository) {}

  // -------------------------------------------------------------
  // PRIVACY REQUESTS
  // -------------------------------------------------------------

  @Get('requests')
  @ClinicPermissions('privacy.requests.read')
  async listRequests(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Query() query: PrivacyRequestQueryDto,
  ) {
    return this.privacyRepo.listRequests(req.auth!.principal, clinicId, query);
  }

  @Get('requests/:requestId')
  @ClinicPermissions('privacy.requests.read')
  async getRequest(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('requestId') requestId: string,
  ) {
    return this.privacyRepo.getRequest(req.auth!.principal, clinicId, requestId);
  }

  @Post('requests')
  @HttpCode(201)
  @ClinicPermissions('privacy.requests.manage')
  async createRequest(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Body() body: CreatePrivacyRequestDto,
  ) {
    return this.privacyRepo.createRequest(req.auth!.principal, clinicId, body);
  }

  @Patch('requests/:requestId/decision')
  @ClinicPermissions('privacy.requests.manage')
  async decideRequest(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('requestId') requestId: string,
    @Body() body: DecidePrivacyRequestDto,
  ) {
    return this.privacyRepo.decideRequest(req.auth!.principal, clinicId, requestId, body);
  }

  // -------------------------------------------------------------
  // DATA EXPORTS (REQUIRES MFA STEP-UP)
  // -------------------------------------------------------------

  @Post('exports')
  @HttpCode(201)
  @ClinicPermissions('privacy.export')
  @RequireStepUp(15) // High-risk bulk export strictly requires MFA Step-up
  async createExport(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Body() body: CreatePatientExportDto,
  ) {
    return this.privacyRepo.createExport(req.auth!.principal, clinicId, body);
  }

  @Get('exports')
  @ClinicPermissions('privacy.export')
  async listExports(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
  ) {
    return this.privacyRepo.listExports(req.auth!.principal, clinicId);
  }

  @Patch('exports/:exportId/revoke')
  @ClinicPermissions('privacy.export')
  async revokeExport(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('exportId') exportId: string,
    @Body() body: RevokeExportDto,
  ) {
    return this.privacyRepo.revokeExport(req.auth!.principal, clinicId, exportId, body.reason);
  }

  @Get('exports/:exportId/download')
  @ClinicPermissions('privacy.export')
  async downloadExport(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('exportId') exportId: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    const { buffer, fileName } = await this.privacyRepo.downloadExport(req.auth!.principal, clinicId, exportId, token);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Pragma', 'no-cache');
    res.send(buffer);
  }

  // -------------------------------------------------------------
  // RETENTION POLICY & DRY-RUN
  // -------------------------------------------------------------

  @Get('retention-policy')
  @ClinicPermissions('privacy.requests.read')
  async getRetentionPolicy(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
  ) {
    return this.privacyRepo.getRetentionPolicy(req.auth!.principal, clinicId);
  }

  @Patch('retention-policy')
  @ClinicPermissions('privacy.requests.manage')
  async updateRetentionPolicy(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Body() body: UpdateRetentionPolicyDto,
  ) {
    return this.privacyRepo.updateRetentionPolicy(req.auth!.principal, clinicId, body);
  }

  @Post('retention-dry-run')
  @HttpCode(200)
  @ClinicPermissions('privacy.requests.manage')
  async runRetentionDryRun(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
  ) {
    return this.privacyRepo.runRetentionDryRun(req.auth!.principal, clinicId);
  }
}
