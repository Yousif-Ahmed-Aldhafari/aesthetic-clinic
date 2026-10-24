import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AccessGuard } from './access.guard.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { CsrfService } from './csrf.service.js';
import { LoginLimiter } from './login-limiter.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [AuthService, CsrfService, LoginLimiter, { provide: APP_GUARD, useClass: AccessGuard }],
})
export class AuthModule {}
