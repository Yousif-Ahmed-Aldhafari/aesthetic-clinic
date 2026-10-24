import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { IdentityDatabase } from './identity.database.js';
import { TenantDatabaseService } from './tenant-database.service.js';
import { VerifiedSessions } from './verified-sessions.js';
import { PublicBrandingRepository } from './public-branding.repository.js';
import { ClinicRepository } from './clinic.repository.js';
import { DatabaseHealthService } from './database-health.service.js';

@Module({
  providers:[PrismaService,IdentityDatabase,TenantDatabaseService,VerifiedSessions,PublicBrandingRepository,ClinicRepository,DatabaseHealthService],
  // Raw Prisma is private to database infrastructure, never exported to features.
  exports:[IdentityDatabase,TenantDatabaseService,VerifiedSessions,PublicBrandingRepository,ClinicRepository,DatabaseHealthService],
})
export class PrismaModule {}
