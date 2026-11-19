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
import { PatientPortalRepository } from './patient-portal.repository.js';
import { BranchRepository } from './branch.repository.js';
import { CostingRepository } from './costing.repository.js';
import { IntegrationCryptoService } from '../integrations/integration-crypto.service.js';
import { IntegrationsRepository } from './integrations.repository.js';
import { SpecialtyRepository } from './specialty.repository.js';
import { ClinicalFoundationRepository } from './clinical-foundation.repository.js';
import { ClinicalOrdersRepository } from './clinical-orders.repository.js';
import { ClinicalDocumentCryptoService } from '../clinical-orders/clinical-document-crypto.service.js';
import { ClinicalFormsRepository } from './clinical-forms.repository.js';
import { ClinicalFormValidationService } from '../clinical-forms/clinical-form-validation.service.js';
import { KmsRepository } from './kms.repository.js';
import { ClinicalGovernanceRepository } from './clinical-governance.repository.js';
import { DentistryRepository } from './dentistry.repository.js';
import { PediatricsRepository } from './pediatrics.repository.js';
import { ObGynRepository } from './obgyn.repository.js';
import { OphthalmologyEntRepository } from './ophthalmology-ent.repository.js';

@Module({
  providers:[OphthalmologyEntRepository,ObGynRepository,PediatricsRepository,DentistryRepository,ClinicalGovernanceRepository,KmsRepository,ClinicalFormValidationService,ClinicalFormsRepository,ClinicalDocumentCryptoService,ClinicalOrdersRepository,ClinicalFoundationRepository,SpecialtyRepository,CostingRepository,ConsentRepository,ConsentEligibilityService,TreatmentRepository,ClinicalRepository,ClinicalFollowUpRepository,InventoryRepository,PatientPortalRepository,BranchRepository,IntegrationCryptoService,IntegrationsRepository,AuditRepository,ClinicAdministrationRepository,BillingRepository,QueueRepository,PublicQueueRepository,AppointmentRepository,SchedulingRepository,PatientRepository,PrismaService,IdentityDatabase,TenantDatabaseService,VerifiedSessions,PublicBrandingRepository,ClinicRepository,DatabaseHealthService,PrivacyRepository],
  // Raw Prisma is private to database infrastructure, never exported to features.
  exports:[OphthalmologyEntRepository,ObGynRepository,PediatricsRepository,DentistryRepository,ClinicalGovernanceRepository,KmsRepository,ClinicalFormValidationService,ClinicalFormsRepository,ClinicalDocumentCryptoService,ClinicalOrdersRepository,ClinicalFoundationRepository,SpecialtyRepository,CostingRepository,ConsentRepository,ConsentEligibilityService,TreatmentRepository,ClinicalRepository,ClinicalFollowUpRepository,InventoryRepository,PatientPortalRepository,BranchRepository,IntegrationCryptoService,IntegrationsRepository,AuditRepository,ClinicAdministrationRepository,BillingRepository,QueueRepository,PublicQueueRepository,AppointmentRepository,SchedulingRepository,PatientRepository,IdentityDatabase,TenantDatabaseService,VerifiedSessions,PublicBrandingRepository,ClinicRepository,DatabaseHealthService,PrivacyRepository],
})
export class PrismaModule {}
