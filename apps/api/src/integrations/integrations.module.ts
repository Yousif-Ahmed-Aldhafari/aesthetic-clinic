import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import {
  IntegrationsController,
  PaymentWebhooksController,
  PortalPaymentsController,
} from './integrations.controller.js';
import { PatientAuthGuard } from '../portal/patient-auth.guard.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [
    IntegrationsController,
    PaymentWebhooksController,
    PortalPaymentsController,
  ],
  providers: [PatientAuthGuard],
})
export class IntegrationsModule {}
