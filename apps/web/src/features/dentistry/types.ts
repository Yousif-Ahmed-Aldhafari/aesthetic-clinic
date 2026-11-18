export type DentitionType = 'PERMANENT' | 'PRIMARY' | 'MIXED';

export type ToothNumberingSystem = 'FDI_ISO_3950' | 'UNIVERSAL' | 'PALMER';

export type ToothCondition =
  | 'SOUND'
  | 'CARIES'
  | 'RESTORATION'
  | 'CROWN'
  | 'ROOT_CANAL'
  | 'IMPLANT'
  | 'FRACTURE'
  | 'IMPACTION'
  | 'MISSING_TOOTH'
  | 'EXTRACTION_HISTORY'
  | 'UNERUPTED'
  | 'SUPERNUMERARY'
  | 'OTHER';

export type ToothSurface =
  | 'OCCLUSAL'
  | 'INCISAL'
  | 'MESIAL'
  | 'DISTAL'
  | 'BUCCAL'
  | 'LINGUAL'
  | 'PALATAL';

export type PeriodontalFurcationGrade = 'CLASS_0' | 'CLASS_I' | 'CLASS_II' | 'CLASS_III';

export type ToothMobilityGrade = 'GRADE_0' | 'GRADE_1' | 'GRADE_2' | 'GRADE_3';

export type OdontogramStatus = 'DRAFT' | 'FINALIZED' | 'SUPERSEDED' | 'ENTERED_IN_ERROR';

export type DentalTreatmentStageStatus =
  | 'DRAFT'
  | 'PROPOSED'
  | 'APPROVED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'SUPERSEDED';

export interface DentalToothFindingItem {
  id?: string;
  odontogramId?: string;
  toothNumberFdi: number;
  isSupernumerary?: boolean;
  supernumeraryIdentifier?: string | null;
  isDeciduous?: boolean;
  condition: ToothCondition;
  surfacesAffected: ToothSurface[];
  existingWork?: boolean;
  diagnosisCodeIcd10?: string | null;
  clinicalDescription?: string | null;
  severity?: 'MILD' | 'MODERATE' | 'SEVERE' | null;
  recordedByMembershipId?: string;
  recordedAt?: string;
}

export interface DentalPeriodontalRecordItem {
  id?: string;
  odontogramId?: string;
  toothNumberFdi: number;
  probingDepthsMm: number[]; // 6 sites: [DB, B, MB, DL, L, ML]
  gingivalMarginMm: number[]; // 6 sites: [DB, B, MB, DL, L, ML]
  clinicalAttachmentMm?: number[]; // Calculated CAL = PD + GM
  bleedingOnProbing: boolean[]; // 6 sites
  suppuration: boolean[]; // 6 sites
  furcationGrade?: PeriodontalFurcationGrade;
  mobilityGrade?: ToothMobilityGrade;
  plaquePresent?: boolean;
  notes?: string | null;
  measuredAt?: string;
}

export interface DentalTreatmentStageItem {
  id: string;
  odontogramId: string;
  patientId: string;
  encounterId: string;
  serviceId: string;
  toothNumberFdi?: number | null;
  surfaces: ToothSurface[];
  stageOrder: number;
  status: DentalTreatmentStageStatus;
  clinicalIndication: string;
  procedureNotes?: string | null;
  estimatedCost: string;
  currency: string;
  plannedDentistMembershipId: string;
  plannedDentist?: {
    id: string;
    user: { id: string; name: string; email: string };
  };
  approvedByMembershipId?: string | null;
  approvedAt?: string | null;
  completedAt?: string | null;
  patientConsentId?: string | null;
  invoiceLineId?: string | null;
  version: number;
  service?: {
    id: string;
    code: string;
    nameAr: string;
    nameEn: string;
    basePriceMinor: string;
  };
}

export interface DentalOdontogramItem {
  id: string;
  clinicId: string;
  patientId: string;
  encounterId: string;
  version: number;
  dentistMembershipId: string;
  dentitionType: DentitionType;
  numberingSystem: ToothNumberingSystem;
  status: OdontogramStatus;
  chartType: string;
  generalOralCondition?: string | null;
  softTissueExamination?: string | null;
  occlusionClassification?: string | null;
  temporomandibularJoint?: string | null;
  notes?: string | null;
  finalizedAt?: string | null;
  finalizedByMembershipId?: string | null;
  contentDigest?: string | null;
  supersededById?: string | null;
  amendmentReason?: string | null;
  createdAt: string;
  updatedAt: string;
  findings: DentalToothFindingItem[];
  periodontalRecords: DentalPeriodontalRecordItem[];
  treatmentStages?: DentalTreatmentStageItem[];
}
