import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ClinicPermissions, type AuthRequest } from '../auth/access.js';
import { ConsentRepository } from '../prisma/consent.repository.js';
import {
  ConsentListQuery,
  ConsentRoute,
  CreateConsentTemplateDto,
  CreateTemplateVersionDto,
  PreparePatientConsentDto,
  RefusePatientConsentDto,
  SignPatientConsentDto,
  TemplateRoute,
  TemplateVersionDto,
  TemplateVersionRoute,
  UpdateConsentTemplateDto,
  VerifyPatientConsentDto,
  WithdrawPatientConsentDto,
} from './consent-input.js';

@Controller('clinics/:clinicId/clinical')
export class ConsentController {
  constructor(private readonly consent: ConsentRepository) {}

  // -------------------------------------------------------------
  // Template Governance Endpoints
  // -------------------------------------------------------------

  @Get('consent-templates')
  @ClinicPermissions('clinical.consent-templates.read')
  listTemplates(
    @Req() r: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Query() query: ConsentListQuery,
  ) {
    return this.consent.listTemplates(r.auth!.principal, clinicId, query);
  }

  @Get('consent-templates/:templateId')
  @ClinicPermissions('clinical.consent-templates.read')
  getTemplate(@Req() r: AuthRequest, @Param() p: TemplateRoute) {
    return this.consent.getTemplate(r.auth!.principal, p.clinicId, p.templateId);
  }

  @Post('consent-templates')
  @ClinicPermissions('clinical.consent-templates.manage')
  createTemplate(
    @Req() r: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Body() body: CreateConsentTemplateDto,
  ) {
    return this.consent.createTemplate(r.auth!.principal, clinicId, body);
  }

  @Patch('consent-templates/:templateId')
  @ClinicPermissions('clinical.consent-templates.manage')
  updateTemplate(
    @Req() r: AuthRequest,
    @Param() p: TemplateRoute,
    @Body() body: UpdateConsentTemplateDto,
  ) {
    return this.consent.updateTemplate(r.auth!.principal, p.clinicId, p.templateId, body);
  }

  @Post('consent-templates/:templateId/versions')
  @ClinicPermissions('clinical.consent-templates.manage')
  createVersion(
    @Req() r: AuthRequest,
    @Param() p: TemplateRoute,
    @Body() body: CreateTemplateVersionDto,
  ) {
    return this.consent.createTemplateVersion(r.auth!.principal, p.clinicId, p.templateId, body);
  }

  @Post('consent-templates/:templateId/versions/:versionId/publish')
  @ClinicPermissions('clinical.consent-templates.manage')
  publishVersion(
    @Req() r: AuthRequest,
    @Param() p: TemplateVersionRoute,
    @Body() body: TemplateVersionDto,
  ) {
    return this.consent.publishTemplateVersion(r.auth!.principal, p.clinicId, p.templateId, p.versionId, body);
  }

  @Post('consent-templates/:templateId/versions/:versionId/retire')
  @ClinicPermissions('clinical.consent-templates.manage')
  retireVersion(
    @Req() r: AuthRequest,
    @Param() p: TemplateVersionRoute,
    @Body() body: TemplateVersionDto,
  ) {
    return this.consent.retireTemplateVersion(r.auth!.principal, p.clinicId, p.templateId, p.versionId, body);
  }

  // -------------------------------------------------------------
  // Patient Consent Lifecycle Endpoints
  // -------------------------------------------------------------

  @Get('consents')
  @ClinicPermissions('clinical.consents.read')
  listConsents(
    @Req() r: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Query() query: ConsentListQuery,
  ) {
    return this.consent.listPatientConsents(r.auth!.principal, clinicId, query);
  }

  @Get('consents/:consentId')
  @ClinicPermissions('clinical.consents.read')
  getConsent(@Req() r: AuthRequest, @Param() p: ConsentRoute) {
    return this.consent.getPatientConsent(r.auth!.principal, p.clinicId, p.consentId);
  }

  @Post('consents')
  @ClinicPermissions('clinical.consents.prepare')
  prepareConsent(
    @Req() r: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Body() body: PreparePatientConsentDto,
  ) {
    return this.consent.prepareConsent(r.auth!.principal, clinicId, body);
  }

  @Post('consents/:consentId/sign')
  @ClinicPermissions('clinical.consents.sign')
  signConsent(
    @Req() r: AuthRequest,
    @Param() p: ConsentRoute,
    @Body() body: SignPatientConsentDto,
  ) {
    return this.consent.signConsent(r.auth!.principal, p.clinicId, p.consentId, body, {
      ipAddress: r.ip,
      userAgent: r.headers['user-agent'],
    });
  }

  @Post('consents/:consentId/verify')
  @ClinicPermissions('clinical.consents.verify')
  verifyConsent(
    @Req() r: AuthRequest,
    @Param() p: ConsentRoute,
    @Body() body: VerifyPatientConsentDto,
  ) {
    return this.consent.verifyConsent(r.auth!.principal, p.clinicId, p.consentId, body);
  }

  @Post('consents/:consentId/withdraw')
  @ClinicPermissions('clinical.consents.withdraw')
  withdrawConsent(
    @Req() r: AuthRequest,
    @Param() p: ConsentRoute,
    @Body() body: WithdrawPatientConsentDto,
  ) {
    return this.consent.withdrawConsent(r.auth!.principal, p.clinicId, p.consentId, body);
  }

  @Post('consents/:consentId/refuse')
  @ClinicPermissions('clinical.consents.prepare')
  refuseConsent(
    @Req() r: AuthRequest,
    @Param() p: ConsentRoute,
    @Body() body: RefusePatientConsentDto,
  ) {
    return this.consent.refuseConsent(r.auth!.principal, p.clinicId, p.consentId, body);
  }
}
