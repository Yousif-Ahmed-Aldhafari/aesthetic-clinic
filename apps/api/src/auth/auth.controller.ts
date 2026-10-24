import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import type { Response } from 'express';
import { Authenticated, PublicRoute, type AuthRequest } from './access.js';
import { AuthService } from './auth.service.js';
import { CsrfService } from './csrf.service.js';

class LoginBody {
  @Transform(({ value }: { value: unknown })=>typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(1) @MaxLength(128) password!: string;
}
class ClinicBody { @IsUUID() clinicId!: string; }

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly csrf: CsrfService) {}
  @Get('csrf') @PublicRoute()
  csrfToken(@Res({ passthrough: true }) response: Response) { return { csrfToken: this.csrf.issuePreauth(response) }; }
  @Post('login') @HttpCode(200) @PublicRoute()
  login(@Req() request: AuthRequest, @Res({ passthrough: true }) response: Response, @Body() body: LoginBody) { return this.auth.login(request, response, body.email, body.password); }
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
