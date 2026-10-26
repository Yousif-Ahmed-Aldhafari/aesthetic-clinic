import { ClinicAdministrationController, PublicAssetController } from './identity/clinic-administration.controller.js';
import { PlatformFoundationController } from './identity/platform-foundation.controller.js';
import { AssetStore, LocalAssetStore } from './identity/asset-store.js';
import { AssetService } from './identity/asset.service.js';
import { DomainVerifier } from './identity/domain-verifier.js';
import { BillingController } from './billing/billing.controller.js';
import { QueueController } from './queue/queue.controller.js';
import { PublicQueueController } from './queue/public-queue.controller.js';
import { QueueStreams } from './queue/queue-streams.js';
import { AppointmentController } from './appointments/appointment.controller.js';
import { SchedulingController } from './appointments/scheduling.controller.js';
import { PatientController } from './patients/patient.controller.js';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';
import { validateEnvironment } from './config/environment.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { HealthController } from './health/health.controller.js';
import { PublicBrandingController } from './clinics/public-branding.controller.js';
import { PublicBrandingService } from './clinics/public-branding.service.js';
import { AuthModule } from './auth/auth.module.js';
import { ClinicContextController } from './clinics/clinic-context.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolve(import.meta.dirname, '../../../.env'),
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      validate: validateEnvironment,
    }),
    PrismaModule,
    AuthModule,
  ],
  controllers: [ClinicAdministrationController,PublicAssetController,PlatformFoundationController,BillingController,QueueController,PublicQueueController,AppointmentController,SchedulingController,PatientController,HealthController, PublicBrandingController, ClinicContextController],
  providers: [LocalAssetStore,{provide:AssetStore,useExisting:LocalAssetStore},AssetService,DomainVerifier,QueueStreams,PublicBrandingService],
})
export class AppModule {}
