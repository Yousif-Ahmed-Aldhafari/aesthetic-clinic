import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PatientPortalController } from './patient-portal.controller.js';
import { PatientAuthGuard } from './patient-auth.guard.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [PatientPortalController],
  providers: [PatientAuthGuard],
  exports: [PatientAuthGuard],
})
export class PatientPortalModule {}
