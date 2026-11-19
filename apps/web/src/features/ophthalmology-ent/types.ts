export type VisualAcuityScale =
  | 'SNELLEN_FEET_20_20'
  | 'SNELLEN_METERS_6_6'
  | 'LOGMAR'
  | 'DECIMAL';

export type TonometryMethod =
  | 'GOLDMANN_APPLANATION'
  | 'NON_CONTACT_AIR_PUFF'
  | 'TONOPEN'
  | 'ICARE_REBOUND'
  | 'PERKINS_PORTABLE';

export type TonsilFriedmanGrade =
  | 'GRADE_0_SURGICALLY_ABSENT'
  | 'GRADE_1_WITHIN_PILLARS'
  | 'GRADE_2_EXTENDING_TO_PILLARS'
  | 'GRADE_3_BEYOND_PILLARS'
  | 'GRADE_4_KISSING_TONSILS';

export type TympanogramType =
  | 'TYPE_A_NORMAL_COMPLIANCE'
  | 'TYPE_AS_STIFF_SYSTEM'
  | 'TYPE_AD_HIGH_COMPLIANCE_FLACCID'
  | 'TYPE_B_FLAT_EFFUSION'
  | 'TYPE_C_NEGATIVE_PRESSURE';

export type OphthalmicRecordStatus = 'DRAFT' | 'FINALIZED' | 'ENTERED_IN_ERROR';
export type EntRecordStatus = 'DRAFT' | 'FINALIZED' | 'ENTERED_IN_ERROR';

export interface OphthalmicRefractionRecord {
  id: string;
  clinicId: string;
  patientId: string;
  encounterId: string;
  acuityScale: VisualAcuityScale;
  pupillaryDistanceMm?: number | null;
  odSphereDiopters?: number | null;
  odCylinderDiopters?: number | null;
  odAxisDegrees?: number | null;
  odReadingAddDiopters?: number | null;
  odUncorrectedVisualAcuity?: string | null;
  odCorrectedVisualAcuity?: string | null;
  odPinholeVisualAcuity?: string | null;
  osSphereDiopters?: number | null;
  osCylinderDiopters?: number | null;
  osAxisDegrees?: number | null;
  osReadingAddDiopters?: number | null;
  osUncorrectedVisualAcuity?: string | null;
  osCorrectedVisualAcuity?: string | null;
  osPinholeVisualAcuity?: string | null;
  ouVisualAcuity?: string | null;
  notes?: string | null;
  optometristMembershipId: string;
  status: OphthalmicRecordStatus;
  errorReason?: string | null;
  version: number;
  createdAt: string;
  odSphericalEquivalent?: number | null;
  osSphericalEquivalent?: number | null;
}

export interface IopEvaluation {
  odMmHg: number | null;
  osMmHg: number | null;
  isElevatedOd: boolean;
  isElevatedOs: boolean;
  isHypotonyOd: boolean;
  isHypotonyOs: boolean;
  isAsymmetric: boolean;
  differenceMmHg: number | null;
  advisoryAlertsAr: string[];
  advisoryAlertsEn: string[];
  clinicalDisclaimerAr: string;
  clinicalDisclaimerEn: string;
}

export interface CdrEvaluation {
  odRatio: number | null;
  osRatio: number | null;
  isSuspiciousOd: boolean;
  isSuspiciousOs: boolean;
  isAsymmetric: boolean;
  difference: number | null;
  advisoryAlertsAr: string[];
  advisoryAlertsEn: string[];
}

export interface OphthalmicExaminationRecord {
  id: string;
  clinicId: string;
  patientId: string;
  encounterId: string;
  tonometryMethod: TonometryMethod;
  odIntraocularPressureMmHg?: number | null;
  osIntraocularPressureMmHg?: number | null;
  tonometryTime: string;
  odCorneaFindings?: string | null;
  osCorneaFindings?: string | null;
  odAnteriorChamber?: string | null;
  osAnteriorChamber?: string | null;
  odLensCondition?: string | null;
  osLensCondition?: string | null;
  odCupToDiscRatio?: number | null;
  osCupToDiscRatio?: number | null;
  odMaculaFindings?: string | null;
  osMaculaFindings?: string | null;
  odRetinalPeriphery?: string | null;
  osRetinalPeriphery?: string | null;
  clinicalNotes?: string | null;
  examinerMembershipId: string;
  status: OphthalmicRecordStatus;
  errorReason?: string | null;
  version: number;
  createdAt: string;
  iopEvaluation?: IopEvaluation;
  cdrEvaluation?: CdrEvaluation;
}

export interface EntExaminationRecord {
  id: string;
  clinicId: string;
  patientId: string;
  encounterId: string;
  rightEarCanal?: string | null;
  rightTympanicMembrane?: string | null;
  leftEarCanal?: string | null;
  leftTympanicMembrane?: string | null;
  nasalSeptumDeformity?: string | null;
  turbinateHypertrophy?: string | null;
  nasalPolypsPresent: boolean;
  nasalDischargeDescription?: string | null;
  tonsilSizeGrade: TonsilFriedmanGrade;
  posteriorPharyngealWall?: string | null;
  uvulaPalateSymmetry?: string | null;
  vocalCordMobility?: string | null;
  clinicalNotes?: string | null;
  examinerMembershipId: string;
  status: EntRecordStatus;
  errorReason?: string | null;
  version: number;
  createdAt: string;
}

export interface HearingLossAnalytics {
  ptaDb: number;
  grade: 'NORMAL' | 'MILD' | 'MODERATE' | 'MODERATELY_SEVERE' | 'SEVERE' | 'PROFOUND' | 'COMPLETE';
  type: 'NORMAL' | 'CONDUCTIVE' | 'SENSORINEURAL' | 'MIXED' | 'INDETERMINATE';
  descriptionAr: string;
  descriptionEn: string;
  typeDescriptionAr: string;
  typeDescriptionEn: string;
  airBoneGapMaxDb: number;
}

export interface AudiometryAssessmentRecord {
  id: string;
  clinicId: string;
  patientId: string;
  encounterId: string;
  orderId?: string | null;
  rightAirThresholdsDb: number[];
  leftAirThresholdsDb: number[];
  rightBoneThresholdsDb: number[];
  leftBoneThresholdsDb: number[];
  rightTympanogramType: TympanogramType;
  leftTympanogramType: TympanogramType;
  speechReceptionThresholdDbR?: number | null;
  speechReceptionThresholdDbL?: number | null;
  speechDiscriminationScoreR?: number | null;
  speechDiscriminationScoreL?: number | null;
  clinicalImpression?: string | null;
  audiologistMembershipId: string;
  status: EntRecordStatus;
  errorReason?: string | null;
  version: number;
  createdAt: string;
  analytics?: {
    right: HearingLossAnalytics | null;
    left: HearingLossAnalytics | null;
  };
}
