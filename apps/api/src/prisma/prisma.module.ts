import { BillingRepository } from './billing.repository.js';
import { QueueRepository } from './queue.repository.js';
import { PublicQueueRepository } from './public-queue.repository.js';
import { AppointmentRepository } from './appointment.repository.js';
import { SchedulingRepository } from './scheduling.repository.js';
import { PatientRepository } from './patient.repository.js';
import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { IdentityDatabase } from './identity.database.js';
import { TenantDatabaseService } from './tenant-database.service.js';
import { VerifiedSessions } from './verified-sessions.js';
import { PublicBrandingRepository } from './public-branding.repository.js';
import { ClinicRepository } from './clinic.repository.js';
import { DatabaseHealthService } from './database-health.service.js';

@Module({
  providers:[BillingRepository,QueueRepository,PublicQueueRepository,AppointmentRepository,SchedulingRepository,PatientRepository,PrismaService,IdentityDatabase,TenantDatabaseService,VerifiedSessions,PublicBrandingRepository,ClinicRepository,DatabaseHealthService],
  // Raw Prisma is private to database infrastructure, never exported to features.
  exports:[BillingRepository,QueueRepository,PublicQueueRepository,AppointmentRepository,SchedulingRepository,PatientRepository,IdentityDatabase,TenantDatabaseService,VerifiedSessions,PublicBrandingRepository,ClinicRepository,DatabaseHealthService],
})
export class PrismaModule {}
