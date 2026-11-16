import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ClinicPermissions, type AuthRequest } from '../auth/access.js';
import { PatientRepository } from '../prisma/patient.repository.js';
import { ClinicalRepository } from '../prisma/clinical.repository.js';
import { TerminologyService } from './terminology.service.js';
import { FhirR4Mapper } from './fhir/fhir-r4.mapper.js';
import { LabOrderAdapter } from './adapters/lab-order.adapter.js';
import { ImagingAdapter } from './adapters/imaging.adapter.js';
import { PharmacyAdapter } from './adapters/pharmacy.adapter.js';
import { HealthExchangeAdapter } from './adapters/health-exchange.adapter.js';
import {
  ValidateTerminologyDto,
  SimulateAdapterTransmissionDto,
  AdapterSimulationType,
} from './interoperability.dto.js';

interface ClinicParams {
  clinicId: string;
}

interface PatientParams extends ClinicParams {
  patientId: string;
}

interface EncounterParams extends ClinicParams {
  encounterId: string;
}

@Controller('clinics/:clinicId/interoperability')
export class InteroperabilityController {
  private readonly labAdapter = new LabOrderAdapter();
  private readonly imagingAdapter = new ImagingAdapter();
  private readonly pharmacyAdapter = new PharmacyAdapter();
  private readonly ksaExchangeAdapter = new HealthExchangeAdapter('KSA_SEHA_NPHIES');
  private readonly uaeExchangeAdapter = new HealthExchangeAdapter('UAE_MALAFFI_NABIDH');

  constructor(
    private readonly patientRepo: PatientRepository,
    private readonly clinicalRepo: ClinicalRepository,
    private readonly terminologyService: TerminologyService,
  ) {}

  @Get('status')
  @ClinicPermissions('interoperability.read')
  async getInteroperabilityStatus(@Param() params: ClinicParams) {
    return {
      clinicId: params.clinicId,
      standardVersion: 'HL7 FHIR Release 4 (v4.0.1)',
      disclaimers: {
        liveTransmission: 'Live external healthcare transmissions are disabled by default. Real-world activation requires accredited provider contracts and official regulatory authorization.',
        terminologyLicensing: 'SNOMED CT requires commercial affiliate licensing via National Release Centers. ICD-10 and LOINC formats validated locally.',
      },
      adapters: [
        this.labAdapter.getStatus(),
        this.imagingAdapter.getStatus(),
        this.pharmacyAdapter.getStatus(),
        this.ksaExchangeAdapter.getStatus(),
        this.uaeExchangeAdapter.getStatus(),
      ],
    };
  }

  @Post('terminology/validate')
  @ClinicPermissions('interoperability.read')
  async validateTerminology(
    @Param() _params: ClinicParams,
    @Body() dto: ValidateTerminologyDto,
  ) {
    return this.terminologyService.validateCode(dto.system, dto.code);
  }

  @Get('fhir/patient/:patientId')
  @ClinicPermissions('interoperability.read')
  async getFhirPatient(
    @Param() params: PatientParams,
    @Req() req: AuthRequest,
  ) {
    const patient = await this.patientRepo.get(req.auth!.principal, params.clinicId, params.patientId);
    return FhirR4Mapper.toFhirPatient({
      ...patient,
      clinicId: params.clinicId,
    });
  }

  @Get('fhir/encounter/:encounterId')
  @ClinicPermissions('interoperability.read')
  async getFhirEncounter(
    @Param() params: EncounterParams,
    @Req() req: AuthRequest,
  ) {
    const encounter = await this.clinicalRepo.get(req.auth!.principal, params.clinicId, params.encounterId);
    return FhirR4Mapper.toFhirEncounter({
      id: encounter.id,
      clinicId: params.clinicId,
      patientId: encounter.patientId,
      clinicianMembershipId: encounter.clinicianMembershipId,
      status: encounter.status,
      startedAt: encounter.createdAt,
      endedAt: (encounter.status === 'SIGNED' || encounter.status === 'CLOSED') ? encounter.updatedAt : null,
      chiefComplaint: (encounter.notes?.[0]?.content as any)?.chiefComplaint || undefined,
    });
  }

  @Post('adapters/simulate')
  @ClinicPermissions('interoperability.manage')
  async simulateTransmission(
    @Param() _params: ClinicParams,
    @Body() dto: SimulateAdapterTransmissionDto,
  ) {
    let adapter;
    switch (dto.adapterType) {
      case AdapterSimulationType.LAB_ORDER:
        adapter = this.labAdapter;
        break;
      case AdapterSimulationType.IMAGING_ORDER:
        adapter = this.imagingAdapter;
        break;
      case AdapterSimulationType.PHARMACY_PRESCRIPTION:
        adapter = this.pharmacyAdapter;
        break;
      case AdapterSimulationType.HEALTH_EXCHANGE_BUNDLE:
        adapter = this.ksaExchangeAdapter;
        break;
    }

    try {
      // In default state, this will throw because enabled is false
      if (dto.adapterType === AdapterSimulationType.LAB_ORDER) {
        return await (adapter as LabOrderAdapter).submitLabOrder({
          resourceType: 'ServiceRequest',
          id: dto.resourceId || 'simulated-order',
          status: 'active',
          intent: 'order',
          subject: { reference: 'Patient/simulated' },
        });
      }
      return adapter.getStatus();
    } catch (err: any) {
      return {
        simulated: true,
        passedPreconditionCheck: false,
        blockedReason: err.message,
      };
    }
  }
}
