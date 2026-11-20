export type Laterality = 'RIGHT' | 'LEFT' | 'BILATERAL' | 'AXIAL';

export type AnatomicalRegion =
  | 'CERVICAL_SPINE'
  | 'THORACIC_SPINE'
  | 'LUMBAR_SPINE'
  | 'SACROILIAC_PELVIS'
  | 'SHOULDER'
  | 'ELBOW'
  | 'WRIST_HAND'
  | 'HIP'
  | 'KNEE'
  | 'ANKLE_FOOT';

export type JointIdentifier = AnatomicalRegion;

export type JointMovement =
  | 'FLEXION'
  | 'EXTENSION'
  | 'ABDUCTION'
  | 'ADDUCTION'
  | 'INTERNAL_ROTATION'
  | 'EXTERNAL_ROTATION'
  | 'PRONATION'
  | 'SUPINATION'
  | 'INVERSION'
  | 'EVERSION'
  | 'DORSIFLEXION'
  | 'PLANTARFLEXION'
  | 'LATERAL_FLEXION'
  | 'ELEVATION'
  | 'DEPRESSION';

export type JointMovementType = JointMovement;

export interface FunctionalGoal {
  description: string;
  targetDate?: string;
  achieved?: boolean;
}

export type MotionType = 'ACTIVE' | 'PASSIVE' | 'ACTIVE_ASSISTED';

export type OrthoRecordStatus = 'DRAFT' | 'FINALIZED' | 'ENTERED_IN_ERROR';

export type RehabEpisodeStatus =
  | 'ACTIVE'
  | 'COMPLETED'
  | 'SUSPENDED'
  | 'DISCHARGED'
  | 'CANCELLED';

export interface SpecialManeuverItem {
  name: string;
  result: string; // 'POSITIVE' | 'NEGATIVE' | 'EQUIVOCAL'
  notes?: string;
}

export interface MusculoskeletalExaminationRecord {
  id: string;
  clinicId: string;
  patientId: string;
  encounterId: string;
  examinationDate: string;
  anatomicalRegion: AnatomicalRegion;
  joint: string;
  laterality: Laterality;
  reasonForExam: string;
  historyOfInjury?: string | null;
  tendernessLocations: string[];
  swellingGrade: string;
  deformityNotes?: string | null;
  neurovascularIntact: boolean;
  motorStrengthMrcScale?: number | null;
  sensationFindings?: string | null;
  specialManeuvers?: SpecialManeuverItem[] | null;
  clinicalAssessment?: string | null;
  examinerMembershipId: string;
  status: OrthoRecordStatus;
  errorReason?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface RomDeficitEvaluation {
  measuredDegrees: number;
  normalDegrees: number;
  deficitFromNormalDegrees: number;
  deficitFromNormalPercent: number;
  contralateralDegrees: number | null;
  deficitFromContralateralDegrees: number | null;
  deficitFromContralateralPercent: number | null;
  deficitSeverity: 'NORMAL' | 'MILD' | 'MODERATE' | 'SEVERE';
  functionalImpactDescriptionAr: string;
  functionalImpactDescriptionEn: string;
  clinicalAdvisoryAr: string;
  clinicalAdvisoryEn: string;
}

export interface JointRangeOfMotionRecord {
  id: string;
  clinicId: string;
  patientId: string;
  encounterId: string;
  examId?: string | null;
  anatomicalJoint: string;
  movement: JointMovement;
  laterality: Laterality;
  motionType: MotionType;
  startingDegrees: number;
  endingDegrees: number;
  measurementMethod?: string | null;
  goniometerDevice?: string | null;
  painOnsetDegrees?: number | null;
  painScaleVas?: number | null;
  contralateralDegrees?: number | null;
  notes?: string | null;
  status: OrthoRecordStatus;
  errorReason?: string | null;
  version: number;
  createdAt: string;
  analytics?: RomDeficitEvaluation;
}

export interface PhysiotherapyRehabilitationEpisode {
  id: string;
  clinicId: string;
  patientId: string;
  encounterId?: string | null;
  referringClinicianMembershipId?: string | null;
  rehabilitationGoal: string;
  functionalBaseline: string;
  startDate: string;
  targetEndDate?: string | null;
  visitFrequencyPerWeek?: number | null;
  plannedInterventions: string[];
  status: RehabEpisodeStatus;
  dischargeSummary?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExerciseItem {
  exercise: string;
  sets?: number;
  reps?: number;
  resistanceKg?: number;
  durationMinutes?: number;
}

export interface VasPainDeltaEvaluation {
  preVasPain: number;
  postVasPain: number;
  delta: number;
  clinicalTrend: 'IMPROVED' | 'UNCHANGED' | 'WORSENED';
  descriptionAr: string;
  descriptionEn: string;
  advisoryAlertAr?: string;
  advisoryAlertEn?: string;
}

export interface PhysiotherapySessionRecord {
  id: string;
  clinicId: string;
  patientId: string;
  encounterId: string;
  episodeId?: string | null;
  sessionDurationMinutes: number;
  treatmentModalities: string[];
  exerciseDetails: ExerciseItem[];
  patientReportedTolerance?: string | null;
  preSessionPainVas: number;
  postSessionPainVas: number;
  functionalProgressNotes: string;
  adverseEvents?: string | null;
  status: OrthoRecordStatus;
  errorReason?: string | null;
  version: number;
  createdAt: string;
  painAnalytics?: VasPainDeltaEvaluation;
}

export interface OswestryScoreResult {
  score: number;
  answeredSectionsCount: number;
  totalSections: number;
  disabilityCategory: 'MINIMAL' | 'MODERATE' | 'SEVERE' | 'CRIPPLED' | 'BED_BOUND_OR_EXAGGERATING';
  descriptionAr: string;
  descriptionEn: string;
}

export interface QuickDashScoreResult {
  score: number;
  answeredCount: number;
  descriptionAr: string;
  descriptionEn: string;
}

export interface LysholmKneeScoreResult {
  totalScore: number;
  ratingCategory: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  descriptionAr: string;
  descriptionEn: string;
}
