export type DeliveryMode =
  | 'VAGINAL'
  | 'CESAREAN_PLANNED'
  | 'CESAREAN_EMERGENCY'
  | 'ASSISTED_VACUUM'
  | 'ASSISTED_FORCEPS'
  | 'OTHER';

export type BirthType =
  | 'SINGLETON'
  | 'TWIN'
  | 'TRIPLET'
  | 'HIGHER_ORDER_MULTIPLE';

export type BirthHistorySource =
  | 'PARENT_RECALL'
  | 'BIRTH_CERTIFICATE'
  | 'HOSPITAL_DISCHARGE_SUMMARY'
  | 'IMMUNIZATION_CARD'
  | 'EXTERNAL_EHR';

export interface PediatricBirthHistoryItem {
  id: string;
  clinicId: string;
  patientId: string;
  recordedByMembershipId: string;
  gestationalAgeWeeks: number;
  gestationalAgeDays?: number | null;
  birthWeightGrams?: number | null;
  birthLengthCm?: number | null;
  birthHeadCircumferenceCm?: number | null;
  apgar1Min?: number | null;
  apgar5Min?: number | null;
  apgar10Min?: number | null;
  deliveryMode?: DeliveryMode | null;
  birthType: BirthType;
  birthComplications?: string | null;
  maternalComplications?: string | null;
  nicAdmissionRequired: boolean;
  nicStayDays?: number | null;
  bloodType?: string | null;
  newbornScreeningNotes?: string | null;
  hearingScreeningPassed?: boolean | null;
  congenitalAnomalies?: string | null;
  consanguinity?: boolean | null;
  source: BirthHistorySource;
  notes?: string | null;
  verifiedAt?: string | null;
  version: number;
  amendmentHistory?: Array<{
    amendedAt: string;
    amendedByMembershipId: string;
    amendmentReason: string;
    previousState: Record<string, unknown>;
  }>;
  createdAt: string;
  updatedAt: string;
}

export type CaregiverRelationshipType =
  | 'MOTHER'
  | 'FATHER'
  | 'LEGAL_GUARDIAN'
  | 'GRANDPARENT'
  | 'SIBLING_ADULT'
  | 'FOSTER_PARENT'
  | 'CASE_WORKER'
  | 'OTHER';

export interface PatientCaregiverItem {
  id: string;
  clinicId: string;
  patientId: string;
  recordedByMembershipId: string;
  caregiverName: string;
  caregiverNationalId?: string | null;
  caregiverPhone: string;
  caregiverEmail?: string | null;
  relationshipType: CaregiverRelationshipType;
  hasLegalCustody: boolean;
  hasMedicalConsentAuthority: boolean;
  isEmergencyContact: boolean;
  emergencyPriority?: number | null;
  portalProxyAccess: boolean;
  notes?: string | null;
  isRevoked: boolean;
  revokedAt?: string | null;
  revokedByMembershipId?: string | null;
  revocationReason?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type StatureMeasurementMethod = 'RECUMBENT_LENGTH' | 'STANDING_HEIGHT';
export type MeasurementSource =
  | 'CLINICAL_ENCOUNTER'
  | 'NURSE_TRIAGE'
  | 'COMMUNITY_SCREENING'
  | 'HISTORICAL_RECORD';
export type GrowthRecordStatus = 'DRAFT' | 'FINAL' | 'ENTERED_IN_ERROR';

export interface PediatricGrowthRecordItem {
  id: string;
  clinicId: string;
  patientId: string;
  encounterId?: string | null;
  recordedByMembershipId: string;
  measuredAt: string;
  chronologicalAgeDays: number;
  correctedAgeDays?: number | null;
  gestationalAgeWeeksAtBirth?: number | null;
  weightKg?: number | null;
  statureCm?: number | null;
  statureMethod?: StatureMeasurementMethod | null;
  headCircumferenceCm?: number | null;
  bodyMassIndex?: number | null;
  weightForAgeZScore?: number | null;
  weightForAgePercentile?: number | null;
  lengthForAgeZScore?: number | null;
  lengthForAgePercentile?: number | null;
  headCircumferenceZScore?: number | null;
  headCircumferencePercentile?: number | null;
  bmiForAgeZScore?: number | null;
  bmiForAgePercentile?: number | null;
  measurementSource: MeasurementSource;
  deviceIdentifier?: string | null;
  clinicalNotes?: string | null;
  status: GrowthRecordStatus;
  errorReason?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface MedicationSafetyAlert {
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  code: string;
  titleAr: string;
  titleEn?: string;
  messageAr: string;
  messageEn?: string;
  clinicalRationale?: string;
  evidenceReference?: string;
  requiresPhysicianOverride?: boolean;
}

export interface WeightRecencyCheckResult {
  isAcceptable: boolean;
  ageDays: number;
  ageCohort: string;
  maxAllowedAgeDays: number;
  weightAgeInDays: number | null;
  status: 'CURRENT' | 'STALE' | 'MISSING';
}

export interface PediatricMedicationPreflightResult {
  isSafeToProceed: boolean;
  hasCriticalAlerts: boolean;
  alerts: MedicationSafetyAlert[];
  weightRecency: WeightRecencyCheckResult;
}
