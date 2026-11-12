import { api } from '../auth/api';

export interface ClinicBranchItem {
  id: string;
  clinicId: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  operatingHours: Record<string, unknown> | null;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  version: number;
  createdAt: string;
  updatedAt: string;
  _count?: {
    memberships: number;
    resources: number;
    inventoryLocations: number;
  };
}

export interface BranchStaffItem {
  id: string;
  clinicId: string;
  branchId: string;
  membershipId: string;
  isPrimary: boolean;
  active: boolean;
  version: number;
  createdAt: string;
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
}

export interface InterBranchTransferItem {
  id: string;
  clinicId: string;
  transferNumber: string;
  sourceBranchId: string;
  destinationBranchId: string;
  sourceLocationId: string;
  destinationLocationId: string;
  productId: string;
  batchId: string | null;
  quantity: number;
  status: 'PENDING' | 'DISPATCHED' | 'RECEIVED' | 'CANCELLED';
  dispatchedAt: string;
  receivedAt: string | null;
  receivedCondition: string | null;
  discrepancyQuantity: number | null;
  notes: string | null;
  sourceBranch?: { id: string; code: string; nameAr: string };
  destinationBranch?: { id: string; code: string; nameAr: string };
  sourceLocation?: { id: string; code: string; nameAr: string };
  destinationLocation?: { id: string; code: string; nameAr: string };
  product?: { id: string; sku: string; nameAr: string; unit: string };
  batch?: { id: string; batchNumber: string; expirationDate: string } | null;
}

export interface CreateBranchInput {
  code: string;
  nameAr: string;
  nameEn?: string;
  phone?: string;
  email?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  operatingHours?: Record<string, unknown>;
}

export interface UpdateBranchInput {
  nameAr?: string;
  nameEn?: string;
  phone?: string;
  email?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  operatingHours?: Record<string, unknown>;
  status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  expectedVersion: number;
}

export interface AssignStaffInput {
  membershipId: string;
  isPrimary?: boolean;
}

export interface DispatchTransferInput {
  sourceBranchId: string;
  destinationBranchId: string;
  sourceLocationId: string;
  destinationLocationId: string;
  productId: string;
  batchId?: string;
  quantity: number;
  notes?: string;
}

export interface ReceiveTransferInput {
  expectedVersion: number;
  condition?: string;
  discrepancyQuantity?: number;
  notes?: string;
}

export interface CancelTransferInput {
  expectedVersion: number;
  reason: string;
}

export async function listBranches(clinicId: string, csrfToken?: string) {
  return api<{ items: ClinicBranchItem[] }>(`clinics/${clinicId}/branches`, 'GET', undefined, csrfToken);
}

export async function createBranch(clinicId: string, input: CreateBranchInput, csrfToken?: string) {
  return api<ClinicBranchItem>(`clinics/${clinicId}/branches`, 'POST', input, csrfToken);
}

export async function updateBranch(clinicId: string, branchId: string, input: UpdateBranchInput, csrfToken?: string) {
  return api<ClinicBranchItem>(`clinics/${clinicId}/branches/${branchId}`, 'PATCH', input, csrfToken);
}

export async function listBranchStaff(clinicId: string, branchId: string, csrfToken?: string) {
  return api<{ items: BranchStaffItem[] }>(`clinics/${clinicId}/branches/${branchId}/staff`, 'GET', undefined, csrfToken);
}

export async function assignBranchStaff(clinicId: string, branchId: string, input: AssignStaffInput, csrfToken?: string) {
  return api<BranchStaffItem>(`clinics/${clinicId}/branches/${branchId}/staff`, 'POST', input, csrfToken);
}

export async function setPrimaryBranch(clinicId: string, branchId: string, membershipId: string, csrfToken?: string) {
  return api<{ success: boolean }>(`clinics/${clinicId}/branches/${branchId}/staff/${membershipId}/primary`, 'PATCH', {}, csrfToken);
}

export async function removeBranchStaff(clinicId: string, branchId: string, membershipId: string, csrfToken?: string) {
  return api<{ success: boolean }>(`clinics/${clinicId}/branches/${branchId}/staff/${membershipId}`, 'DELETE', undefined, csrfToken);
}

export async function switchBranch(clinicId: string, branchId: string, csrfToken?: string) {
  return api<{
    success: boolean;
    selectedBranchId: string;
    branch: { id: string; code: string; nameAr: string; nameEn?: string; timezone: string };
  }>(`clinics/${clinicId}/branches/switch`, 'POST', { branchId }, csrfToken);
}

export async function listTransfers(clinicId: string, filters?: { branchId?: string; status?: string }, csrfToken?: string) {
  const query = new URLSearchParams();
  if (filters?.branchId) query.set('branchId', filters.branchId);
  if (filters?.status) query.set('status', filters.status);
  const qStr = query.toString() ? `?${query.toString()}` : '';
  return api<{ items: InterBranchTransferItem[] }>(`clinics/${clinicId}/branches/transfers${qStr}`, 'GET', undefined, csrfToken);
}

export async function dispatchTransfer(clinicId: string, input: DispatchTransferInput, csrfToken?: string) {
  return api<InterBranchTransferItem>(`clinics/${clinicId}/branches/transfers/dispatch`, 'POST', input, csrfToken);
}

export async function receiveTransfer(clinicId: string, transferId: string, input: ReceiveTransferInput, csrfToken?: string) {
  return api<InterBranchTransferItem>(`clinics/${clinicId}/branches/transfers/${transferId}/receive`, 'POST', input, csrfToken);
}

export async function cancelTransfer(clinicId: string, transferId: string, input: CancelTransferInput, csrfToken?: string) {
  return api<InterBranchTransferItem>(`clinics/${clinicId}/branches/transfers/${transferId}/cancel`, 'POST', input, csrfToken);
}
