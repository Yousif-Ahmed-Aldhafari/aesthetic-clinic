export type PregnancyEpisodeStatus =
  | 'ACTIVE'
  | 'COMPLETED'
  | 'TERMINATED'
  | 'TRANSFERRED_OUT'
  | 'ENTERED_IN_ERROR';

export type DatingMethod =
  | 'LMP_CERTAIN'
  | 'LMP_UNCERTAIN'
  | 'ULTRASOUND_FIRST_TRIMESTER'
  | 'ULTRASOUND_SECOND_TRIMESTER'
  | 'CLINICAL_ESTIMATE'
  | 'ASSISTED_REPRODUCTION';

export type FetalPresentation =
  | 'CEPHALIC'
  | 'BREECH'
  | 'TRANSVERSE'
  | 'OBLIQUE'
  | 'UNSTABLE';

export type DeliveryOutcome =
  | 'LIVE_BIRTH_SPONTANEOUS_VAGINAL'
  | 'LIVE_BIRTH_ASSISTED_VAGINAL'
  | 'LIVE_BIRTH_CESAREAN_PLANNED'
  | 'LIVE_BIRTH_CESAREAN_EMERGENCY'
  | 'STILLBIRTH'
  | 'MISCARRIAGE_EARLY'
  | 'MISCARRIAGE_LATE'
  | 'ECTOPIC_PREGNANCY'
  | 'MOLAR_PREGNANCY'
  | 'MEDICAL_TERMINATION'
  | 'OTHER';

export type GynecologicalExamType =
  | 'GENERAL_PELVIC'
  | 'CERVICAL_SCREENING'
  | 'COLPOSCOPY'
  | 'VULVAR_EXAMINATION'
  | 'ULTRASOUND_TRANSVAGINAL'
  | 'POST_OPERATIVE'
  | 'OTHER';

export type ObGynRecordStatus =
  | 'DRAFT'
  | 'FINALIZED'
  | 'ENTERED_IN_ERROR';

export type DeliveryMode =
  | 'VAGINAL'
  | 'CESAREAN_PLANNED'
  | 'CESAREAN_EMERGENCY'
  | 'ASSISTED_VACUUM'
  | 'ASSISTED_FORCEPS'
  | 'OTHER';

export interface PregnancyEpisodeItem {
  id: string;
  clinicId: string;
  patientId: string;
  episodeNumber: number;
  status: PregnancyEpisodeStatus;
  gravidity: number;
  parity: number;
  termDeliveries: number;
  pretermDeliveries: number;
  abortions: number;
  livingChildren: number;
  multipleGestationCount: number;
  lastMenstrualPeriodDate?: string | null;
  lmpCertainty: boolean;
  ultrasoundDatingDate?: string | null;
  crownRumpLengthMm?: number | null;
  biparietalDiameterMm?: number | null;
  ultrasoundEstimatedGestationalDays?: number | null;
  estimatedDueDate: string;
  datingMethod: DatingMethod;
  datingRationale?: string | null;
  datingReviewedByMembershipId?: string | null;
  datingReviewedAt?: string | null;
  isDatingFinalized: boolean;
  bloodGroupRh?: string | null;
  rhAntibodyScreenPositive: boolean;
  highRiskFlag: boolean;
  highRiskJustification?: string | null;
  outcomeDate?: string | null;
  outcomeSummary?: string | null;
  finalizedByMembershipId?: string | null;
  finalizedAt?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface AntenatalVisitRecordItem {
  id: string;
  clinicId: string;
  patientId: string;
  pregnancyEpisodeId: string;
  encounterId: string;
  recordedByMembershipId: string;
  visitDate: string;
  gestationalAgeWeeks: number;
  gestationalAgeDays: number;
  systolicBp: number;
  diastolicBp: number;
  weightKg?: number | null;
  fundalHeightCm?: number | null;
  fetalHeartRateBpm?: number | null;
  fetalPresentation?: FetalPresentation | null;
  fetalMovementPresent: boolean;
  urineProtein?: string | null;
  urineGlucose?: string | null;
  peripheralEdema?: string | null;
  clinicalNotes?: string | null;
  managementPlan?: string | null;
  nextVisitRecommendedWeeks?: number | null;
  diagnosticOrderIds: string[];
  imagingDocumentIds: string[];
  status: ObGynRecordStatus;
  errorReason?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  recordedBy?: {
    id: string;
    user?: {
      id: string;
      name: string;
    };
  };
}

export interface ObstetricHistoryItem {
  id: string;
  clinicId: string;
  patientId: string;
  recordedByMembershipId: string;
  pregnancyNumber: number;
  yearOfDelivery?: number | null;
  gestationalAgeWeeks?: number | null;
  deliveryOutcome: DeliveryOutcome;
  deliveryMode: DeliveryMode;
  birthWeightGrams?: number | null;
  babyGender?: 'MALE' | 'FEMALE' | 'OTHER' | 'UNDISCLOSED' | null;
  anesthesiaType?: string | null;
  previousUterineSurgery: boolean;
  uterineSurgeryDetails?: string | null;
  complications?: string | null;
  neonatalOutcome?: string | null;
  notes?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface GynecologicalExaminationItem {
  id: string;
  clinicId: string;
  patientId: string;
  encounterId: string;
  examinerMembershipId: string;
  examinationDate: string;
  examinationType: GynecologicalExamType;
  isConfidential: boolean;
  indicationsSymptoms?: string | null;
  lastMenstrualPeriodDate?: string | null;
  menstrualCycleDays?: number | null;
  menstrualFlowDurationDays?: number | null;
  dysmenorrheaReported: boolean;
  abnormalBleedingPattern?: string | null;
  externalGenitaliaFindings?: string | null;
  speculumExaminationFindings?: string | null;
  bimanualExaminationFindings?: string | null;
  cervicalScreeningSampleCollected: boolean;
  cervicalScreeningTestType?: string | null;
  chaperonePresent: boolean;
  chaperoneNameOrId?: string | null;
  clinicalAssessment?: string | null;
  managementPlan?: string | null;
  consentEvidenceId?: string | null;
  linkedDocumentIds: string[];
  status: ObGynRecordStatus;
  errorReason?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  examiner?: {
    id: string;
    user?: {
      id: string;
      name: string;
    };
  };
}
