import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { AccessGuard } from './access.guard.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { CsrfService } from './csrf.service.js';
import { LoginLimiter } from './login-limiter.service.js';
import { MfaCryptoService } from './mfa-crypto.service.js';
import { MfaService } from './mfa.service.js';
import { SessionManagerService } from './session-manager.service.js';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    CsrfService,
    LoginLimiter,
    MfaCryptoService,
    MfaService,
    SessionManagerService,
    { provide: APP_GUARD, useClass: AccessGuard },
  ],
  exports: [AuthService, CsrfService, MfaService, SessionManagerService],
})
export class AuthModule {}
