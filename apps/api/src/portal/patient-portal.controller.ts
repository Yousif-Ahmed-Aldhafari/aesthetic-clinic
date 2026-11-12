import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CsrfService } from '../auth/csrf.service.js';
import { PortalRoute } from '../auth/access.js';
import { PatientPortalRepository } from '../prisma/patient-portal.repository.js';
import { PatientAuthGuard } from './patient-auth.guard.js';
import { CurrentPatient, type PatientPrincipal } from './patient-principal.js';
import {
  ActivatePatientAccountDto,
  CancelPatientBookingDto,
  CreatePatientBookingDto,
  CreateRecoveryCheckInDto,
  PatientLoginDto,
  PortalAvailabilityQuery,
  RefusePortalConsentDto,
  RequestPasswordResetDto,
  ReschedulePatientBookingDto,
  ResetPasswordDto,
  SignPortalConsentDto,
  SubmitPatientOutcomeDto,
  WithdrawPortalConsentDto,
} from './patient-portal.dto.js';

@PortalRoute()
@Controller('portal')
export class PatientPortalController {
  constructor(
    private readonly portalRepo: PatientPortalRepository,
    private readonly csrf: CsrfService,
  ) {}

  @Get('clinics/:slug')
  getClinic(@Param('slug') slug: string) {
    return this.portalRepo.getPublicClinic(slug);
  }

  @Post('auth/activate')
  @HttpCode(200)
  async activate(
    @Body() body: ActivatePatientAccountDto,
    @Ip() ip: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userAgent = req.headers['user-agent'];
    const result = await this.portalRepo.activateAccount(body, ip, userAgent);
    res.cookie(this.csrf.patientSessionCookie, result.rawSession, {
      ...this.csrf.cookieOptions(),
      maxAge: 24 * 60 * 60 * 1000,
    });
    return {
      csrfToken: result.csrfToken,
      expiresAt: result.expiresAt,
      patient: result.patient,
      clinic: result.clinic,
    };
  }

  @Post('auth/login')
  @HttpCode(200)
  async login(
    @Body() body: PatientLoginDto,
    @Ip() ip: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userAgent = req.headers['user-agent'];
    const result = await this.portalRepo.login(body, ip, userAgent);
    res.cookie(this.csrf.patientSessionCookie, result.rawSession, {
      ...this.csrf.cookieOptions(),
      maxAge: 24 * 60 * 60 * 1000,
    });
    return {
      csrfToken: result.csrfToken,
      expiresAt: result.expiresAt,
      patient: result.patient,
      clinic: result.clinic,
    };
  }

  @Post('auth/logout')
  @UseGuards(PatientAuthGuard)
  @HttpCode(200)
  async logout(
    @CurrentPatient() principal: PatientPrincipal,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.portalRepo.logout(principal);
    this.csrf.clearPatientSession(res);
    return { success: true };
  }

  @Post('auth/forgot-password')
  @HttpCode(200)
  forgotPassword(@Body() body: RequestPasswordResetDto) {
    return this.portalRepo.requestPasswordReset(body);
  }

  @Post('auth/reset-password')
  @HttpCode(200)
  resetPassword(@Body() body: ResetPasswordDto) {
    return this.portalRepo.resetPassword(body);
  }

  @Get('me')
  @UseGuards(PatientAuthGuard)
  me(@CurrentPatient() principal: PatientPrincipal) {
    return this.portalRepo.getProfile(principal);
  }

  @Get('services')
  @UseGuards(PatientAuthGuard)
  services(@CurrentPatient() principal: PatientPrincipal) {
    return this.portalRepo.listServices(principal);
  }

  @Get('doctors')
  @UseGuards(PatientAuthGuard)
  doctors(@CurrentPatient() principal: PatientPrincipal) {
    return this.portalRepo.listDoctors(principal);
  }

  @Get('availability')
  @UseGuards(PatientAuthGuard)
  availability(
    @CurrentPatient() principal: PatientPrincipal,
    @Query() query: PortalAvailabilityQuery,
  ) {
    return this.portalRepo.getAvailability(principal, query);
  }

  @Get('appointments')
  @UseGuards(PatientAuthGuard)
  appointments(@CurrentPatient() principal: PatientPrincipal) {
    return this.portalRepo.listAppointments(principal);
  }

  @Post('appointments')
  @UseGuards(PatientAuthGuard)
  book(
    @CurrentPatient() principal: PatientPrincipal,
    @Body() body: CreatePatientBookingDto,
  ) {
    return this.portalRepo.bookAppointment(principal, body);
  }

  @Post('appointments/:appointmentId/reschedule')
  @UseGuards(PatientAuthGuard)
  @HttpCode(200)
  reschedule(
    @CurrentPatient() principal: PatientPrincipal,
    @Param('appointmentId') appointmentId: string,
    @Body() body: ReschedulePatientBookingDto,
  ) {
    return this.portalRepo.rescheduleAppointment(principal, appointmentId, body);
  }

  @Post('appointments/:appointmentId/cancel')
  @UseGuards(PatientAuthGuard)
  @HttpCode(200)
  cancel(
    @CurrentPatient() principal: PatientPrincipal,
    @Param('appointmentId') appointmentId: string,
    @Body() body: CancelPatientBookingDto,
  ) {
    return this.portalRepo.cancelAppointment(principal, appointmentId, body);
  }

  // -------------------------------------------------------------
  // Consent Self-Service Endpoints
  // -------------------------------------------------------------
  @Get('consents')
  @UseGuards(PatientAuthGuard)
  listConsents(@CurrentPatient() principal: PatientPrincipal) {
    return this.portalRepo.listConsents(principal);
  }

  @Get('consents/:consentId')
  @UseGuards(PatientAuthGuard)
  getConsent(
    @CurrentPatient() principal: PatientPrincipal,
    @Param('consentId') consentId: string,
  ) {
    return this.portalRepo.getConsent(principal, consentId);
  }

  @Post('consents/:consentId/sign')
  @UseGuards(PatientAuthGuard)
  @HttpCode(200)
  signConsent(
    @CurrentPatient() principal: PatientPrincipal,
    @Param('consentId') consentId: string,
    @Body() body: SignPortalConsentDto,
    @Ip() ip: string,
    @Req() req: Request,
  ) {
    const userAgent = req.headers['user-agent'];
    return this.portalRepo.signConsent(principal, consentId, body, { ipAddress: ip, userAgent });
  }

  @Post('consents/:consentId/refuse')
  @UseGuards(PatientAuthGuard)
  @HttpCode(200)
  refuseConsent(
    @CurrentPatient() principal: PatientPrincipal,
    @Param('consentId') consentId: string,
    @Body() body: RefusePortalConsentDto,
  ) {
    return this.portalRepo.refuseConsent(principal, consentId, body);
  }

  @Post('consents/:consentId/withdraw')
  @UseGuards(PatientAuthGuard)
  @HttpCode(200)
  withdrawConsent(
    @CurrentPatient() principal: PatientPrincipal,
    @Param('consentId') consentId: string,
    @Body() body: WithdrawPortalConsentDto,
  ) {
    return this.portalRepo.withdrawConsent(principal, consentId, body);
  }

  // -------------------------------------------------------------
  // Follow-ups & Recovery Check-ins
  // -------------------------------------------------------------
  @Get('follow-ups')
  @UseGuards(PatientAuthGuard)
  listFollowUps(@CurrentPatient() principal: PatientPrincipal) {
    return this.portalRepo.listFollowUps(principal);
  }

  @Get('check-ins')
  @UseGuards(PatientAuthGuard)
  listCheckIns(@CurrentPatient() principal: PatientPrincipal) {
    return this.portalRepo.listRecoveryCheckIns(principal);
  }

  @Post('check-ins')
  @UseGuards(PatientAuthGuard)
  createCheckIn(
    @CurrentPatient() principal: PatientPrincipal,
    @Body() body: CreateRecoveryCheckInDto,
  ) {
    return this.portalRepo.createRecoveryCheckIn(principal, body);
  }

  @Get('check-ins/:checkInId')
  @UseGuards(PatientAuthGuard)
  getCheckIn(
    @CurrentPatient() principal: PatientPrincipal,
    @Param('checkInId') checkInId: string,
  ) {
    return this.portalRepo.getRecoveryCheckIn(principal, checkInId);
  }

  // -------------------------------------------------------------
  // Patient-Reported Outcomes (PROMs)
  // -------------------------------------------------------------
  @Post('outcomes')
  @UseGuards(PatientAuthGuard)
  submitOutcome(
    @CurrentPatient() principal: PatientPrincipal,
    @Body() body: SubmitPatientOutcomeDto,
  ) {
    return this.portalRepo.submitPatientOutcome(principal, body);
  }

  @Get('outcomes')
  @UseGuards(PatientAuthGuard)
  listOutcomes(@CurrentPatient() principal: PatientPrincipal) {
    return this.portalRepo.listPatientOutcomes(principal);
  }
}
