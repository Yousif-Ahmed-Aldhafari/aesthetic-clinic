import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ClinicPermissions, type AuthRequest } from '../auth/access.js';
import { ClinicalFoundationRepository } from '../prisma/clinical-foundation.repository.js';
import type {
  ObservationType,
  ProblemListStatus,
  AllergyClinicalStatus,
  MedicationRecordStatus,
  PrescriptionStatus,
} from '../generated/prisma/client.js';
import {
  RecordObservationDto,
  AmendObservationDto,
  RecordDiagnosisDto,
  AmendDiagnosisDto,
  RecordAllergyDto,
  RecordMedicationDto,
  ReconcileMedicationsDto,
  CreatePrescriptionDraftDto,
  SignPrescriptionDto,
  CancelPrescriptionDto,
} from './clinical-foundation.dto.js';

interface ClinicPatientRouteParams {
  clinicId: string;
  patientId: string;
}

interface ClinicObservationRouteParams {
  clinicId: string;
  observationId: string;
}

interface ClinicDiagnosisRouteParams {
  clinicId: string;
  diagnosisId: string;
}

interface ClinicAllergyRouteParams {
  clinicId: string;
  allergyId: string;
}

interface ClinicPrescriptionRouteParams {
  clinicId: string;
  prescriptionId: string;
}

interface ObservationQueryParams {
  encounterId?: string;
  observationType?: ObservationType;
  pageSize?: string;
  cursor?: string;
}

interface DiagnosisQueryParams {
  encounterId?: string;
  isProblem?: string;
  problemStatus?: ProblemListStatus;
}

interface AllergyQueryParams {
  clinicalStatus?: AllergyClinicalStatus;
}

interface MedicationQueryParams {
  status?: MedicationRecordStatus;
  isReconciled?: string;
}

interface PrescriptionQueryParams {
  encounterId?: string;
  status?: PrescriptionStatus;
}

@Controller('clinics/:clinicId/clinical')
export class ClinicalFoundationController {
  constructor(private readonly repository: ClinicalFoundationRepository) {}

  // ---------------------------------------------------------------------------
  // 1. VITAL SIGNS & OBSERVATIONS
  // ---------------------------------------------------------------------------

  @Post('patients/:patientId/observations')
  @ClinicPermissions('clinical.observations.create')
  recordObservation(
    @Req() req: AuthRequest,
    @Param() params: ClinicPatientRouteParams,
    @Body() dto: RecordObservationDto,
  ) {
    return this.repository.recordObservation(req.auth!.principal, params.clinicId, params.patientId, dto);
  }

  @Patch('observations/:observationId')
  @ClinicPermissions('clinical.observations.update')
  amendObservation(
    @Req() req: AuthRequest,
    @Param() params: ClinicObservationRouteParams,
    @Body() dto: AmendObservationDto,
  ) {
    return this.repository.amendObservation(req.auth!.principal, params.clinicId, params.observationId, dto);
  }

  @Get('patients/:patientId/observations')
  @ClinicPermissions('clinical.observations.read')
  listObservations(
    @Req() req: AuthRequest,
    @Param() params: ClinicPatientRouteParams,
    @Query() query: ObservationQueryParams,
  ) {
    return this.repository.listObservations(req.auth!.principal, params.clinicId, {
      patientId: params.patientId,
      encounterId: query.encounterId,
      observationType: query.observationType,
      pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
      cursor: query.cursor,
    });
  }

  // ---------------------------------------------------------------------------
  // 2. ENCOUNTER DIAGNOSES & PROBLEMS
  // ---------------------------------------------------------------------------

  @Post('patients/:patientId/diagnoses')
  @ClinicPermissions('clinical.diagnoses.create')
  recordDiagnosis(
    @Req() req: AuthRequest,
    @Param() params: ClinicPatientRouteParams,
    @Body() dto: RecordDiagnosisDto,
  ) {
    return this.repository.recordDiagnosis(req.auth!.principal, params.clinicId, params.patientId, dto);
  }

  @Patch('diagnoses/:diagnosisId')
  @ClinicPermissions('clinical.diagnoses.update')
  amendDiagnosis(
    @Req() req: AuthRequest,
    @Param() params: ClinicDiagnosisRouteParams,
    @Body() dto: AmendDiagnosisDto,
  ) {
    return this.repository.amendDiagnosis(req.auth!.principal, params.clinicId, params.diagnosisId, dto);
  }

  @Post('diagnoses/:diagnosisId/confirm')
  @ClinicPermissions('clinical.diagnoses.confirm')
  confirmDiagnosis(
    @Req() req: AuthRequest,
    @Param() params: ClinicDiagnosisRouteParams,
  ) {
    return this.repository.confirmDiagnosis(req.auth!.principal, params.clinicId, params.diagnosisId);
  }

  @Get('patients/:patientId/diagnoses')
  @ClinicPermissions('clinical.diagnoses.read')
  listDiagnoses(
    @Req() req: AuthRequest,
    @Param() params: ClinicPatientRouteParams,
    @Query() query: DiagnosisQueryParams,
  ) {
    return this.repository.listDiagnoses(req.auth!.principal, params.clinicId, {
      patientId: params.patientId,
      encounterId: query.encounterId,
      isProblem: query.isProblem !== undefined ? query.isProblem === 'true' : undefined,
      problemStatus: query.problemStatus,
    });
  }

  // ---------------------------------------------------------------------------
  // 3. ALLERGIES
  // ---------------------------------------------------------------------------

  @Post('patients/:patientId/allergies')
  @ClinicPermissions('clinical.allergies.create')
  recordAllergy(
    @Req() req: AuthRequest,
    @Param() params: ClinicPatientRouteParams,
    @Body() dto: RecordAllergyDto,
  ) {
    return this.repository.recordAllergy(req.auth!.principal, params.clinicId, params.patientId, dto);
  }

  @Post('allergies/:allergyId/verify')
  @ClinicPermissions('clinical.allergies.verify')
  verifyAllergy(
    @Req() req: AuthRequest,
    @Param() params: ClinicAllergyRouteParams,
  ) {
    return this.repository.verifyAllergy(req.auth!.principal, params.clinicId, params.allergyId);
  }

  @Get('patients/:patientId/allergies')
  @ClinicPermissions('clinical.allergies.read')
  listAllergies(
    @Req() req: AuthRequest,
    @Param() params: ClinicPatientRouteParams,
    @Query() query: AllergyQueryParams,
  ) {
    return this.repository.listAllergies(req.auth!.principal, params.clinicId, {
      patientId: params.patientId,
      clinicalStatus: query.clinicalStatus,
    });
  }

  // ---------------------------------------------------------------------------
  // 4. MEDICATION RECONCILIATION
  // ---------------------------------------------------------------------------

  @Post('patients/:patientId/medications')
  @ClinicPermissions('clinical.medications.create')
  recordMedication(
    @Req() req: AuthRequest,
    @Param() params: ClinicPatientRouteParams,
    @Body() dto: RecordMedicationDto,
  ) {
    return this.repository.recordMedication(req.auth!.principal, params.clinicId, params.patientId, dto);
  }

  @Post('patients/:patientId/medications/reconcile')
  @ClinicPermissions('clinical.medications.reconcile')
  reconcileMedications(
    @Req() req: AuthRequest,
    @Param() params: ClinicPatientRouteParams,
    @Body() dto: ReconcileMedicationsDto,
  ) {
    return this.repository.reconcileMedications(req.auth!.principal, params.clinicId, params.patientId, dto);
  }

  @Get('patients/:patientId/medications')
  @ClinicPermissions('clinical.medications.read')
  listMedications(
    @Req() req: AuthRequest,
    @Param() params: ClinicPatientRouteParams,
    @Query() query: MedicationQueryParams,
  ) {
    return this.repository.listMedications(req.auth!.principal, params.clinicId, {
      patientId: params.patientId,
      status: query.status,
      isReconciled: query.isReconciled !== undefined ? query.isReconciled === 'true' : undefined,
    });
  }

  // ---------------------------------------------------------------------------
  // 5. CONTROLLED PRESCRIPTIONS
  // ---------------------------------------------------------------------------

  @Post('patients/:patientId/prescriptions')
  @ClinicPermissions('clinical.prescriptions.draft')
  createPrescriptionDraft(
    @Req() req: AuthRequest,
    @Param() params: ClinicPatientRouteParams,
    @Body() dto: CreatePrescriptionDraftDto,
  ) {
    return this.repository.createPrescriptionDraft(req.auth!.principal, params.clinicId, params.patientId, dto);
  }

  @Post('prescriptions/:prescriptionId/sign')
  @ClinicPermissions('clinical.prescriptions.sign')
  signPrescription(
    @Req() req: AuthRequest,
    @Param() params: ClinicPrescriptionRouteParams,
    @Body() dto: SignPrescriptionDto,
  ) {
    return this.repository.signPrescription(req.auth!.principal, params.clinicId, params.prescriptionId, dto);
  }

  @Post('prescriptions/:prescriptionId/cancel')
  @ClinicPermissions('clinical.prescriptions.cancel')
  cancelPrescription(
    @Req() req: AuthRequest,
    @Param() params: ClinicPrescriptionRouteParams,
    @Body() dto: CancelPrescriptionDto,
  ) {
    return this.repository.cancelPrescription(req.auth!.principal, params.clinicId, params.prescriptionId, dto);
  }

  @Get('prescriptions/:prescriptionId')
  @ClinicPermissions('clinical.prescriptions.read')
  getPrescription(
    @Req() req: AuthRequest,
    @Param() params: ClinicPrescriptionRouteParams,
  ) {
    return this.repository.getPrescription(req.auth!.principal, params.clinicId, params.prescriptionId);
  }

  @Get('patients/:patientId/prescriptions')
  @ClinicPermissions('clinical.prescriptions.read')
  listPrescriptions(
    @Req() req: AuthRequest,
    @Param() params: ClinicPatientRouteParams,
    @Query() query: PrescriptionQueryParams,
  ) {
    return this.repository.listPrescriptions(req.auth!.principal, params.clinicId, {
      patientId: params.patientId,
      encounterId: query.encounterId,
      status: query.status,
    });
  }

  // ---------------------------------------------------------------------------
  // 6. CLINICAL SUMMARY
  // ---------------------------------------------------------------------------

  @Get('patients/:patientId/summary')
  @ClinicPermissions(
    'clinical.observations.read',
    'clinical.diagnoses.read',
    'clinical.allergies.read',
    'clinical.medications.read',
    'clinical.prescriptions.read',
  )
  getPatientSummary(
    @Req() req: AuthRequest,
    @Param() params: ClinicPatientRouteParams,
  ) {
    return this.repository.getPatientClinicalSummary(req.auth!.principal, params.clinicId, params.patientId);
  }
}
