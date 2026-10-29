import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import type { Response } from 'express';
import { Authenticated, PublicRoute, RequireStepUp, type AuthRequest } from './access.js';
import { AuthService } from './auth.service.js';
import { CsrfService } from './csrf.service.js';
import { MfaService } from './mfa.service.js';
import { SessionManagerService } from './session-manager.service.js';

class LoginBody {
  @Transform(({ value }: { value: unknown })=>typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(1) @MaxLength(128) password!: string;
}

class ClinicBody { @IsUUID() clinicId!: string; }

class MfaVerifyBody {
  @IsString() @MinLength(10) @MaxLength(256) challengeToken!: string;
  @IsOptional() @IsString() @MaxLength(16) code?: string;
  @IsOptional() @IsString() @MaxLength(32) recoveryCode?: string;
}

class MfaSetupBody {
  @IsString() @MinLength(1) @MaxLength(128) password!: string;
}

class MfaVerifySetupBody {
  @IsString() @MinLength(6) @MaxLength(8) code!: string;
}

class MfaDisableBody {
  @IsString() @MinLength(1) @MaxLength(128) password!: string;
  @IsString() @MinLength(6) @MaxLength(32) code!: string;
}

class MfaRegenerateRecoveryBody {
  @IsString() @MinLength(1) @MaxLength(128) password!: string;
}

class MfaStepUpBody {
  @IsOptional() @IsString() @MaxLength(16) code?: string;
  @IsOptional() @IsString() @MaxLength(64) recoveryCode?: string;
}

class SessionRoute {
  @IsUUID() id!: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly csrf: CsrfService,
    private readonly mfa: MfaService,
    private readonly sessionManager: SessionManagerService,
  ) {}

  @Get('csrf') @PublicRoute()
  csrfToken(@Res({ passthrough: true }) response: Response) { return { csrfToken: this.csrf.issuePreauth(response) }; }

  @Post('login') @HttpCode(200) @PublicRoute()
  login(@Req() request: AuthRequest, @Res({ passthrough: true }) response: Response, @Body() body: LoginBody) {
    return this.auth.login(request, response, body.email, body.password);
  }

  @Post('mfa/verify') @HttpCode(200) @PublicRoute()
  verifyMfaLogin(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
    @Body() body: MfaVerifyBody,
  ) {
    return this.auth.verifyMfaLogin(request, response, body.challengeToken, body.code, body.recoveryCode);
  }

  @Get('mfa/status') @Authenticated()
  mfaStatus(@Req() request: AuthRequest) {
    const { user, session } = request.auth!;
    return this.mfa.getStatus(user.id, user, session.selectedClinicId);
  }

  @Post('mfa/setup') @HttpCode(200) @Authenticated()
  setupMfa(@Req() request: AuthRequest, @Body() body: MfaSetupBody) {
    const { user } = request.auth!;
    const ip = request.ip ?? request.socket?.remoteAddress ?? null;
    const ua = typeof request.headers?.['user-agent'] === 'string' ? request.headers['user-agent'] : null;
    const correlationId = typeof request.headers?.['x-correlation-id'] === 'string' ? request.headers['x-correlation-id'] : null;
    return this.mfa.setup(user.id, body.password, user.email, ip, ua, correlationId);
  }

  @Post('mfa/verify-setup') @HttpCode(200) @Authenticated()
  verifyMfaSetup(@Req() request: AuthRequest, @Body() body: MfaVerifySetupBody) {
    const { user, session } = request.auth!;
    const ip = request.ip ?? request.socket?.remoteAddress ?? null;
    const ua = typeof request.headers?.['user-agent'] === 'string' ? request.headers['user-agent'] : null;
    const correlationId = typeof request.headers?.['x-correlation-id'] === 'string' ? request.headers['x-correlation-id'] : null;
    return this.mfa.verifySetup(user.id, body.code, session.id, ip, ua, correlationId);
  }

  @Post('mfa/disable') @HttpCode(200) @Authenticated()
  disableMfa(@Req() request: AuthRequest, @Body() body: MfaDisableBody) {
    const { user } = request.auth!;
    const ip = request.ip ?? request.socket?.remoteAddress ?? null;
    const ua = typeof request.headers?.['user-agent'] === 'string' ? request.headers['user-agent'] : null;
    const correlationId = typeof request.headers?.['x-correlation-id'] === 'string' ? request.headers['x-correlation-id'] : null;
    return this.mfa.disable(user.id, body.password, body.code, ip, ua, correlationId);
  }

  @Post('mfa/recovery-codes/regenerate') @HttpCode(200) @Authenticated() @RequireStepUp(15)
  regenerateRecoveryCodes(@Req() request: AuthRequest, @Body() body: MfaRegenerateRecoveryBody) {
    const { user } = request.auth!;
    const ip = request.ip ?? request.socket?.remoteAddress ?? null;
    const ua = typeof request.headers?.['user-agent'] === 'string' ? request.headers['user-agent'] : null;
    const correlationId = typeof request.headers?.['x-correlation-id'] === 'string' ? request.headers['x-correlation-id'] : null;
    return this.mfa.regenerateRecoveryCodes(user.id, body.password, ip, ua, correlationId);
  }

  @Post('mfa/step-up') @HttpCode(200) @Authenticated()
  stepUp(@Req() request: AuthRequest, @Body() body: MfaStepUpBody) {
    const { user, session } = request.auth!;
    const ip = request.ip ?? request.socket?.remoteAddress ?? null;
    const ua = typeof request.headers?.['user-agent'] === 'string' ? request.headers['user-agent'] : null;
    const correlationId = typeof request.headers?.['x-correlation-id'] === 'string' ? request.headers['x-correlation-id'] : null;
    return this.mfa.verifyStepUp(session.id, user.id, body.code, body.recoveryCode, ip, ua, correlationId);
  }

  @Get('sessions') @Authenticated()
  sessions(@Req() request: AuthRequest) {
    const { user, session } = request.auth!;
    return this.sessionManager.listActiveSessions(user.id, session.id);
  }

  @Delete('sessions/:id') @HttpCode(200) @Authenticated()
  async revokeSession(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
    @Param() param: SessionRoute,
  ) {
    const { user, session } = request.auth!;
    const ip = request.ip ?? request.socket?.remoteAddress ?? null;
    const ua = typeof request.headers?.['user-agent'] === 'string' ? request.headers['user-agent'] : null;
    await this.sessionManager.revokeSession(user.id, param.id, ip, ua);
    if (param.id === session.id) {
      this.csrf.clearSession(response);
    }
    return { ok: true };
  }

  @Delete('sessions') @HttpCode(200) @Authenticated()
  revokeOtherSessions(@Req() request: AuthRequest) {
    const { user, session } = request.auth!;
    const ip = request.ip ?? request.socket?.remoteAddress ?? null;
    const ua = typeof request.headers?.['user-agent'] === 'string' ? request.headers['user-agent'] : null;
    return this.sessionManager.revokeOtherSessions(user.id, session.id, ip, ua);
  }

  @Post('logout') @HttpCode(200) @Authenticated()
  logout(@Req() request: AuthRequest, @Res({ passthrough: true }) response: Response) { return this.auth.logout(request, response); }

  @Get('me') @Authenticated()
  me(@Req() request: AuthRequest) { return this.auth.current(request); }

  @Get('clinics') @Authenticated()
  clinics(@Req() request: AuthRequest) { return this.auth.clinics(request.auth!.principal); }

  @Post('clinic') @HttpCode(200) @Authenticated()
  async select(@Req() request: AuthRequest, @Res({ passthrough: true }) response: Response, @Body() body: ClinicBody) {
    const clinic = await this.auth.selectionContext(request.auth!.principal, body.clinicId);
    return { ...await this.auth.rotate(request, response, body.clinicId), clinic };
  }

  @Post('rotate') @HttpCode(200) @Authenticated()
  rotate(@Req() request: AuthRequest, @Res({ passthrough: true }) response: Response) { return this.auth.rotate(request, response); }
}
