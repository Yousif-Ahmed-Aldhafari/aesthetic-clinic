import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';
import { validateEnvironment } from './config/environment.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { HealthController } from './health/health.controller.js';
import { PublicBrandingController } from './clinics/public-branding.controller.js';
import { PublicBrandingService } from './clinics/public-branding.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolve(import.meta.dirname, '../../../.env'),
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      validate: validateEnvironment,
    }),
    PrismaModule,
  ],
  controllers: [HealthController, PublicBrandingController],
  providers: [PublicBrandingService],
})
export class AppModule {}
