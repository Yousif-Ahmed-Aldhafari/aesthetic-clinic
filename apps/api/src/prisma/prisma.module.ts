import { PrivacyRepository } from './privacy.repository.js';
import { AuditRepository } from './audit.repository.js';
import { ClinicAdministrationRepository } from './clinic-administration.repository.js';
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
import { ClinicalRepository } from './clinical.repository.js';
import { ConsentRepository } from './consent.repository.js';
import { TreatmentRepository } from './treatment.repository.js';
import { ConsentEligibilityService } from '../treatments/consent-eligibility.service.js';
import { ClinicalFollowUpRepository } from './clinical-followup.repository.js';
import { InventoryRepository } from './inventory.repository.js';

@Module({
  providers:[ConsentRepository,ConsentEligibilityService,TreatmentRepository,ClinicalRepository,ClinicalFollowUpRepository,InventoryRepository,AuditRepository,ClinicAdministrationRepository,BillingRepository,QueueRepository,PublicQueueRepository,AppointmentRepository,SchedulingRepository,PatientRepository,PrismaService,IdentityDatabase,TenantDatabaseService,VerifiedSessions,PublicBrandingRepository,ClinicRepository,DatabaseHealthService,PrivacyRepository],
  // Raw Prisma is private to database infrastructure, never exported to features.
  exports:[ConsentRepository,ConsentEligibilityService,TreatmentRepository,ClinicalRepository,ClinicalFollowUpRepository,InventoryRepository,AuditRepository,ClinicAdministrationRepository,BillingRepository,QueueRepository,PublicQueueRepository,AppointmentRepository,SchedulingRepository,PatientRepository,IdentityDatabase,TenantDatabaseService,VerifiedSessions,PublicBrandingRepository,ClinicRepository,DatabaseHealthService,PrivacyRepository],
})
export class PrismaModule {}
