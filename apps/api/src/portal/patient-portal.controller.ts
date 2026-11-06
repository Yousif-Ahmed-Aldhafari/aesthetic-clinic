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
  PatientLoginDto,
  PortalAvailabilityQuery,
  RequestPasswordResetDto,
  ReschedulePatientBookingDto,
  ResetPasswordDto,
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
}
