import { api } from '../auth/api';

export interface MedicalSpecialtyItem {
  id: string;
  code: string;
  arabicName: string;
  englishName: string;
  description: string | null;
  classification: string;
  isActive: boolean;
  version: number;
}

export interface ClinicSpecialtyItem {
  id: string;
  clinicId: string;
  specialtyId: string;
  status: 'ACTIVE' | 'INACTIVE';
  isCompatibility: boolean;
  enabledAt: string;
  disabledAt: string | null;
  version: number;
  specialty: MedicalSpecialtyItem;
  branchSpecialties?: BranchSpecialtyItem[];
}

export interface BranchSpecialtyItem {
  id: string;
  clinicId: string;
  branchId: string;
  specialtyId: string;
  status: 'ACTIVE' | 'INACTIVE';
  isCompatibility: boolean;
  enabledAt: string;
  disabledAt: string | null;
  version: number;
  specialty: MedicalSpecialtyItem;
  branch?: {
    id: string;
    code: string;
    nameAr: string;
  };
}

export interface PractitionerProfileItem {
  id: string;
  clinicId: string;
  membershipId: string;
  professionalTitleAr: string;
  professionalTitleEn: string;
  licenseNumber: string | null;
  licensingAuthority: string | null;
  licensingJurisdiction: string | null;
  licenseEffectiveDate: string | null;
  licenseExpirationDate: string | null;
  verificationStatus: 'SELF_REPORTED' | 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED' | 'EXPIRED' | 'SUSPENDED';
  verifiedByMembershipId: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  evidenceReference: string | null;
  isMedicalDirector: boolean;
  version: number;
  membership?: {
    id: string;
    role: string;
    status: string;
    user: {
      id: string;
      name: string;
      email: string;
    };
  };
  verifiedBy?: {
    user: {
      id: string;
      name: string;
    };
  } | null;
  qualifications?: PractitionerSpecialtyItem[];
  clinicalPrivileges?: PractitionerClinicalPrivilegeItem[];
}

export interface PractitionerSpecialtyItem {
  id: string;
  clinicId: string;
  practitionerProfileId: string;
  specialtyId: string;
  qualificationTitle: string;
  qualificationLevel: string;
  status: 'SELF_REPORTED' | 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED' | 'EXPIRED' | 'SUSPENDED';
  effectiveDate: string | null;
  expirationDate: string | null;
  verifiedByMembershipId: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  version: number;
  specialty: MedicalSpecialtyItem;
  practitionerProfile?: PractitionerProfileItem;
}

export interface PractitionerClinicalPrivilegeItem {
  id: string;
  clinicId: string;
  branchId: string | null;
  practitionerProfileId: string;
  specialtyId: string;
  practitionerSpecialtyId: string | null;
  privilegeCode: string;
  scope: 'CLINIC_WIDE' | 'BRANCH_SCOPED';
  status: 'REQUESTED' | 'APPROVED' | 'SUSPENDED' | 'REVOKED' | 'EXPIRED';
  approvedByMembershipId: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  effectiveDate: string;
  expirationDate: string | null;
  isCompatibility: boolean;
  version: number;
  specialty: MedicalSpecialtyItem;
  branch?: {
    id: string;
    code: string;
    nameAr: string;
  } | null;
  practitionerProfile?: PractitionerProfileItem;
}

export interface ApprovalQueueResponse {
  pendingQualifications: PractitionerSpecialtyItem[];
  pendingPrivileges: PractitionerClinicalPrivilegeItem[];
}

// 1. Catalog & Clinic Specialties
export async function listSpecialtiesCatalog(clinicId: string, csrfToken?: string) {
  return api<{ items: MedicalSpecialtyItem[] }>(`clinics/${clinicId}/specialties/catalog`, 'GET', undefined, csrfToken);
}

export async function listClinicSpecialties(clinicId: string, csrfToken?: string) {
  return api<{ items: ClinicSpecialtyItem[] }>(`clinics/${clinicId}/specialties`, 'GET', undefined, csrfToken);
}

export async function enableClinicSpecialty(clinicId: string, code: string, csrfToken?: string) {
  return api<ClinicSpecialtyItem>(`clinics/${clinicId}/specialties/${code}/enable`, 'POST', {}, csrfToken);
}

export async function disableClinicSpecialty(clinicId: string, code: string, csrfToken?: string) {
  return api<ClinicSpecialtyItem>(`clinics/${clinicId}/specialties/${code}/disable`, 'POST', {}, csrfToken);
}

// 2. Branch Specialties
export async function listBranchSpecialties(clinicId: string, branchId: string, csrfToken?: string) {
  return api<{ items: BranchSpecialtyItem[] }>(`clinics/${clinicId}/branches/${branchId}/specialties`, 'GET', undefined, csrfToken);
}

export async function enableBranchSpecialty(clinicId: string, branchId: string, code: string, csrfToken?: string) {
  return api<BranchSpecialtyItem>(`clinics/${clinicId}/branches/${branchId}/specialties/${code}/enable`, 'POST', {}, csrfToken);
}

export async function disableBranchSpecialty(clinicId: string, branchId: string, code: string, csrfToken?: string) {
  return api<BranchSpecialtyItem>(`clinics/${clinicId}/branches/${branchId}/specialties/${code}/disable`, 'POST', {}, csrfToken);
}

// 3. Practitioner Profiles
export async function listPractitioners(clinicId: string, csrfToken?: string) {
  return api<{ items: PractitionerProfileItem[] }>(`clinics/${clinicId}/practitioners`, 'GET', undefined, csrfToken);
}

export async function getPractitionerProfile(clinicId: string, membershipId: string, csrfToken?: string) {
  return api<PractitionerProfileItem>(`clinics/${clinicId}/practitioners/${membershipId}`, 'GET', undefined, csrfToken);
}

export async function upsertPractitionerProfile(
  clinicId: string,
  input: {
    membershipId: string;
    professionalTitleAr: string;
    professionalTitleEn: string;
    licenseNumber?: string;
    licensingAuthority?: string;
    licensingJurisdiction?: string;
    licenseEffectiveDate?: string;
    licenseExpirationDate?: string;
    evidenceReference?: string;
  },
  csrfToken?: string,
) {
  return api<PractitionerProfileItem>(`clinics/${clinicId}/practitioners`, 'POST', input, csrfToken);
}

export async function designateMedicalDirector(clinicId: string, membershipId: string, csrfToken?: string) {
  return api<PractitionerProfileItem>(`clinics/${clinicId}/practitioners/${membershipId}/designate-medical-director`, 'POST', {}, csrfToken);
}

// 4. Qualifications
export async function addPractitionerQualification(
  clinicId: string,
  membershipId: string,
  input: {
    specialtyCode: string;
    qualificationTitle: string;
    qualificationLevel?: string;
    effectiveDate?: string;
    expirationDate?: string;
  },
  csrfToken?: string,
) {
  return api<PractitionerSpecialtyItem>(`clinics/${clinicId}/practitioners/${membershipId}/qualifications`, 'POST', input, csrfToken);
}

export async function verifyPractitionerQualification(clinicId: string, qualificationId: string, csrfToken?: string) {
  return api<PractitionerSpecialtyItem>(`clinics/${clinicId}/qualifications/${qualificationId}/verify`, 'POST', {}, csrfToken);
}

export async function rejectPractitionerQualification(clinicId: string, qualificationId: string, reason: string, csrfToken?: string) {
  return api<PractitionerSpecialtyItem>(`clinics/${clinicId}/qualifications/${qualificationId}/reject`, 'POST', { reason }, csrfToken);
}

// 5. Clinical Privileges
export async function requestClinicalPrivilege(
  clinicId: string,
  membershipId: string,
  input: {
    specialtyCode: string;
    privilegeCode: string;
    scope?: 'CLINIC_WIDE' | 'BRANCH_SCOPED';
    branchId?: string;
    expirationDate?: string;
  },
  csrfToken?: string,
) {
  return api<PractitionerClinicalPrivilegeItem>(`clinics/${clinicId}/practitioners/${membershipId}/privileges/request`, 'POST', input, csrfToken);
}

export async function approveClinicalPrivilege(clinicId: string, privilegeId: string, csrfToken?: string) {
  return api<PractitionerClinicalPrivilegeItem>(`clinics/${clinicId}/privileges/${privilegeId}/approve`, 'POST', {}, csrfToken);
}

export async function revokeClinicalPrivilege(clinicId: string, privilegeId: string, reason: string, csrfToken?: string) {
  return api<PractitionerClinicalPrivilegeItem>(`clinics/${clinicId}/privileges/${privilegeId}/revoke`, 'POST', { reason }, csrfToken);
}

// 6. Approval Queue
export async function listApprovalQueue(clinicId: string, csrfToken?: string) {
  return api<ApprovalQueueResponse>(`clinics/${clinicId}/privileges/approval-queue`, 'GET', undefined, csrfToken);
}
