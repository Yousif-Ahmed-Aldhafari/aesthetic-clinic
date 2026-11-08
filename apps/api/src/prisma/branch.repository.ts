import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.js';
import type { VerifiedPrincipal } from './verified-sessions.js';
import { TenantDatabaseService } from './tenant-database.service.js';
import { AuditRepository } from './audit.repository.js';
import type {
  CreateBranchDto,
  UpdateBranchDto,
  AssignStaffBranchDto,
  DispatchTransferDto,
  ReceiveTransferDto,
  CancelTransferDto,
} from '../branches/branch.dto.js';

function toDecimal(val: unknown, field: string): Prisma.Decimal {
  if (typeof val === 'number') return new Prisma.Decimal(val.toFixed(4));
  if (typeof val === 'string' && /^\d+(\.\d{1,4})?$/.test(val)) return new Prisma.Decimal(val);
  throw new BadRequestException(`INVALID_DECIMAL_${field.toUpperCase()}`);
}

const branchSelect = {
  id: true,
  clinicId: true,
  code: true,
  nameAr: true,
  nameEn: true,
  phone: true,
  email: true,
  address: true,
  latitude: true,
  longitude: true,
  timezone: true,
  operatingHours: true,
  status: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      memberships: true,
      resources: true,
      inventoryLocations: true,
    },
  },
} as const;

const staffSelect = {
  id: true,
  clinicId: true,
  branchId: true,
  membershipId: true,
  isPrimary: true,
  active: true,
  version: true,
  createdAt: true,
  membership: {
    select: {
      id: true,
      role: true,
      status: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  },
} as const;

@Injectable()
export class BranchRepository {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditRepository,
  ) {}

  // ---------------------------------------------------------------------------
  // Branches CRUD
  // ---------------------------------------------------------------------------

  async listBranches(proof: VerifiedPrincipal, clinicId: string) {
    return this.database.withClinicContext(proof, clinicId, ['branches.read'], async (tx, c) => {
      const isManagement = c.permissions.includes('branches.manage');
      const where: Prisma.ClinicBranchWhereInput = { clinicId: c.clinicId };

      if (!isManagement) {
        // Staff members see either their assigned branches or active branches
        const myAssignments = await tx.branchMembership.findMany({
          where: { clinicId: c.clinicId, membershipId: c.membershipId, active: true },
          select: { branchId: true },
        });
        const assignedBranchIds = myAssignments.map((a) => a.branchId);

        if (assignedBranchIds.length > 0) {
          where.OR = [
            { id: { in: assignedBranchIds } },
            { status: 'ACTIVE' },
          ];
        } else {
          where.status = 'ACTIVE';
        }
      }

      const branches = await tx.clinicBranch.findMany({
        where,
        select: branchSelect,
        orderBy: [{ code: 'asc' }],
      });

      return {
        items: branches.map((b) => ({
          ...b,
          latitude: b.latitude ? Number(b.latitude) : null,
          longitude: b.longitude ? Number(b.longitude) : null,
        })),
      };
    });
  }

  async getBranch(proof: VerifiedPrincipal, clinicId: string, branchId: string) {
    return this.database.withClinicContext(proof, clinicId, ['branches.read'], async (tx, c) => {
      const branch = await tx.clinicBranch.findFirst({
        where: { id: branchId, clinicId: c.clinicId },
        select: branchSelect,
      });

      if (!branch) throw new NotFoundException('BRANCH_NOT_FOUND');

      return {
        ...branch,
        latitude: branch.latitude ? Number(branch.latitude) : null,
        longitude: branch.longitude ? Number(branch.longitude) : null,
      };
    });
  }

  async createBranch(proof: VerifiedPrincipal, clinicId: string, input: CreateBranchDto) {
    return this.database.withClinicContext(proof, clinicId, ['branches.manage'], async (tx, c) => {
      const code = input.code.trim().toUpperCase();
      // Check code uniqueness within clinic
      const existing = await tx.clinicBranch.findFirst({
        where: { clinicId: c.clinicId, code },
      });
      if (existing) throw new ConflictException('BRANCH_CODE_ALREADY_EXISTS');

      const clinic = await tx.clinic.findUniqueOrThrow({
        where: { id: c.clinicId },
        select: { timezone: true },
      });

      const branch = await tx.clinicBranch.create({
        data: {
          clinicId: c.clinicId,
          code,
          nameAr: input.nameAr,
          nameEn: input.nameEn ?? null,
          phone: input.phone ?? null,
          email: input.email ?? null,
          address: input.address ?? null,
          timezone: input.timezone ?? clinic.timezone,
          operatingHours: (input.operatingHours as Prisma.InputJsonValue) ?? undefined,
          status: 'ACTIVE',
        },
        select: branchSelect,
      });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'clinic.branch.create',
          category: 'PLATFORM',
          targetType: 'ClinicBranch',
          targetId: branch.id,
          outcome: 'SUCCESS',
          metadata: { code: branch.code, nameAr: branch.nameAr },
        },
        tx,
      );

      return {
        ...branch,
        latitude: branch.latitude ? Number(branch.latitude) : null,
        longitude: branch.longitude ? Number(branch.longitude) : null,
      };
    });
  }

  async updateBranch(proof: VerifiedPrincipal, clinicId: string, branchId: string, input: UpdateBranchDto) {
    return this.database.withClinicContext(proof, clinicId, ['branches.manage'], async (tx, c) => {
      const branch = await tx.clinicBranch.findFirst({
        where: { id: branchId, clinicId: c.clinicId },
      });
      if (!branch) throw new NotFoundException('BRANCH_NOT_FOUND');

      if (branch.version !== input.expectedVersion) {
        throw new ConflictException('BRANCH_STALE_CONCURRENCY');
      }

      const updated = await tx.clinicBranch.update({
        where: { clinicId_id: { clinicId: c.clinicId, id: branchId } },
        data: {
          nameAr: input.nameAr ?? branch.nameAr,
          nameEn: input.nameEn !== undefined ? input.nameEn : branch.nameEn,
          phone: input.phone !== undefined ? input.phone : branch.phone,
          email: input.email !== undefined ? input.email : branch.email,
          address: input.address !== undefined ? input.address : branch.address,
          timezone: input.timezone ?? branch.timezone,
          operatingHours: input.operatingHours !== undefined ? (input.operatingHours as Prisma.InputJsonValue) : branch.operatingHours ?? undefined,
          status: input.status ?? branch.status,
          version: { increment: 1 },
        },
        select: branchSelect,
      });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'clinic.branch.update',
          category: 'PLATFORM',
          targetType: 'ClinicBranch',
          targetId: updated.id,
          outcome: 'SUCCESS',
          metadata: { code: updated.code, changes: input },
        },
        tx,
      );

      return {
        ...updated,
        latitude: updated.latitude ? Number(updated.latitude) : null,
        longitude: updated.longitude ? Number(updated.longitude) : null,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Staff Assignments
  // ---------------------------------------------------------------------------

  async listBranchStaff(proof: VerifiedPrincipal, clinicId: string, branchId: string) {
    return this.database.withClinicContext(proof, clinicId, ['branches.read'], async (tx, c) => {
      const branch = await tx.clinicBranch.findFirst({
        where: { id: branchId, clinicId: c.clinicId },
      });
      if (!branch) throw new NotFoundException('BRANCH_NOT_FOUND');

      const staff = await tx.branchMembership.findMany({
        where: { clinicId: c.clinicId, branchId },
        select: staffSelect,
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      });

      return {
        branchId,
        items: staff.map((s) => ({
          id: s.id,
          membershipId: s.membershipId,
          isPrimary: s.isPrimary,
          active: s.active,
          version: s.version,
          role: s.membership.role,
          status: s.membership.status,
          userName: s.membership.user.name,
          userEmail: s.membership.user.email,
        })),
      };
    });
  }

  async assignStaff(proof: VerifiedPrincipal, clinicId: string, branchId: string, input: AssignStaffBranchDto) {
    return this.database.withClinicContext(proof, clinicId, ['branches.manage'], async (tx, c) => {
      const branch = await tx.clinicBranch.findFirst({
        where: { id: branchId, clinicId: c.clinicId },
      });
      if (!branch) throw new NotFoundException('BRANCH_NOT_FOUND');

      const membership = await tx.clinicMembership.findFirst({
        where: { id: input.membershipId, clinicId: c.clinicId, status: 'ACTIVE' },
        include: { user: true },
      });
      if (!membership) throw new NotFoundException('MEMBERSHIP_NOT_FOUND_OR_INACTIVE');

      const isPrimary = input.isPrimary ?? false;

      // If assigning as primary, remove primary status from other branches for this staff
      if (isPrimary) {
        await tx.branchMembership.updateMany({
          where: { clinicId: c.clinicId, membershipId: input.membershipId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      const assignment = await tx.branchMembership.upsert({
        where: {
          clinicId_branchId_membershipId: {
            clinicId: c.clinicId,
            branchId,
            membershipId: input.membershipId,
          },
        },
        create: {
          clinicId: c.clinicId,
          branchId,
          membershipId: input.membershipId,
          isPrimary,
          active: true,
        },
        update: {
          isPrimary,
          active: true,
          version: { increment: 1 },
        },
        select: staffSelect,
      });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'clinic.branch.staff_assign',
          category: 'PLATFORM',
          targetType: 'BranchMembership',
          targetId: assignment.id,
          outcome: 'SUCCESS',
          metadata: { branchId, membershipId: input.membershipId, isPrimary },
        },
        tx,
      );

      return {
        id: assignment.id,
        branchId: assignment.branchId,
        membershipId: assignment.membershipId,
        isPrimary: assignment.isPrimary,
        active: assignment.active,
        userName: assignment.membership.user.name,
        userEmail: assignment.membership.user.email,
        role: assignment.membership.role,
      };
    });
  }

  async removeStaff(proof: VerifiedPrincipal, clinicId: string, branchId: string, membershipId: string) {
    return this.database.withClinicContext(proof, clinicId, ['branches.manage'], async (tx, c) => {
      const assignment = await tx.branchMembership.findFirst({
        where: { clinicId: c.clinicId, branchId, membershipId },
      });
      if (!assignment) throw new NotFoundException('BRANCH_MEMBERSHIP_NOT_FOUND');

      // Deactivate assignment preserving history
      await tx.branchMembership.update({
        where: { clinicId_id: { clinicId: c.clinicId, id: assignment.id } },
        data: { active: false, isPrimary: false, version: { increment: 1 } },
      });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'clinic.branch.staff_remove',
          category: 'PLATFORM',
          targetType: 'BranchMembership',
          targetId: assignment.id,
          outcome: 'SUCCESS',
          metadata: { branchId, membershipId },
        },
        tx,
      );

      return { success: true };
    });
  }

  async setPrimaryBranch(proof: VerifiedPrincipal, clinicId: string, branchId: string, membershipId: string) {
    return this.database.withClinicContext(proof, clinicId, ['branches.manage'], async (tx, c) => {
      const assignment = await tx.branchMembership.findFirst({
        where: { clinicId: c.clinicId, branchId, membershipId, active: true },
      });
      if (!assignment) throw new NotFoundException('ACTIVE_BRANCH_MEMBERSHIP_NOT_FOUND');

      await tx.branchMembership.updateMany({
        where: { clinicId: c.clinicId, membershipId, isPrimary: true },
        data: { isPrimary: false },
      });

      const updated = await tx.branchMembership.update({
        where: { clinicId_id: { clinicId: c.clinicId, id: assignment.id } },
        data: { isPrimary: true, version: { increment: 1 } },
        select: staffSelect,
      });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'clinic.branch.set_primary',
          category: 'PLATFORM',
          targetType: 'BranchMembership',
          targetId: updated.id,
          outcome: 'SUCCESS',
          metadata: { branchId, membershipId },
        },
        tx,
      );

      return { success: true, branchId, membershipId };
    });
  }

  // ---------------------------------------------------------------------------
  // Branch Switching
  // ---------------------------------------------------------------------------

  async validateBranchSwitch(proof: VerifiedPrincipal, clinicId: string, branchId: string) {
    return this.database.withClinicContext(proof, clinicId, ['branches.read'], async (tx, c) => {
      const branch = await tx.clinicBranch.findFirst({
        where: { id: branchId, clinicId: c.clinicId, status: 'ACTIVE' },
      });
      if (!branch) throw new NotFoundException('ACTIVE_BRANCH_NOT_FOUND');

      const isManagement = c.permissions.includes('branches.manage');
      if (!isManagement) {
        const assignment = await tx.branchMembership.findFirst({
          where: { clinicId: c.clinicId, branchId, membershipId: c.membershipId, active: true },
        });
        if (!assignment) throw new ForbiddenException('NOT_ASSIGNED_TO_BRANCH');
      }

      return {
        success: true,
        selectedBranchId: branchId,
        branch: {
          id: branch.id,
          code: branch.code,
          nameAr: branch.nameAr,
          nameEn: branch.nameEn,
          timezone: branch.timezone,
        },
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Inter-Branch Stock Transfers
  // ---------------------------------------------------------------------------

  async listTransfers(
    proof: VerifiedPrincipal,
    clinicId: string,
    filter?: { branchId?: string; status?: string },
  ) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.transfers.read'], async (tx, c) => {
      const where: Prisma.InterBranchTransferWhereInput = { clinicId: c.clinicId };

      if (filter?.branchId) {
        where.OR = [
          { sourceBranchId: filter.branchId },
          { destinationBranchId: filter.branchId },
        ];
      }

      if (filter?.status) {
        where.status = filter.status as Prisma.EnumInterBranchTransferStatusFilter<'InterBranchTransfer'>;
      }

      const transfers = await tx.interBranchTransfer.findMany({
        where,
        include: {
          sourceBranch: { select: { id: true, code: true, nameAr: true } },
          destinationBranch: { select: { id: true, code: true, nameAr: true } },
          sourceLocation: { select: { id: true, code: true, nameAr: true } },
          destinationLocation: { select: { id: true, code: true, nameAr: true } },
          product: { select: { id: true, sku: true, nameAr: true, unit: true } },
          batch: { select: { id: true, batchNumber: true, expirationDate: true } },
        },
        orderBy: [{ createdAt: 'desc' }],
        take: 100,
      });

      return {
        items: transfers.map((t) => ({
          ...t,
          quantity: t.quantity.toString(),
        })),
      };
    });
  }

  async dispatchTransfer(proof: VerifiedPrincipal, clinicId: string, input: DispatchTransferDto) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.transfers.manage'], async (tx, c) => {
      if (input.sourceBranchId === input.destinationBranchId) {
        throw new BadRequestException('SOURCE_AND_DESTINATION_BRANCH_MUST_DIFFER');
      }
      if (input.sourceLocationId === input.destinationLocationId) {
        throw new BadRequestException('SOURCE_AND_DESTINATION_LOCATION_MUST_DIFFER');
      }

      const qty = toDecimal(input.quantity, 'quantity');
      if (qty.lessThanOrEqualTo(0)) throw new BadRequestException('QUANTITY_MUST_BE_POSITIVE');

      // Verify source & destination branches belong to clinic
      const [srcBranch, dstBranch] = await Promise.all([
        tx.clinicBranch.findFirst({ where: { id: input.sourceBranchId, clinicId: c.clinicId, status: 'ACTIVE' } }),
        tx.clinicBranch.findFirst({ where: { id: input.destinationBranchId, clinicId: c.clinicId, status: 'ACTIVE' } }),
      ]);
      if (!srcBranch) throw new NotFoundException('SOURCE_BRANCH_NOT_FOUND_OR_INACTIVE');
      if (!dstBranch) throw new NotFoundException('DESTINATION_BRANCH_NOT_FOUND_OR_INACTIVE');

      // Verify locations belong to respective branches
      const [srcLoc, dstLoc] = await Promise.all([
        tx.inventoryLocation.findFirst({ where: { id: input.sourceLocationId, clinicId: c.clinicId, branchId: srcBranch.id, isActive: true } }),
        tx.inventoryLocation.findFirst({ where: { id: input.destinationLocationId, clinicId: c.clinicId, branchId: dstBranch.id, isActive: true } }),
      ]);
      if (!srcLoc) throw new NotFoundException('SOURCE_LOCATION_NOT_FOUND_OR_NOT_IN_BRANCH');
      if (!dstLoc) throw new NotFoundException('DESTINATION_LOCATION_NOT_FOUND_OR_NOT_IN_BRANCH');

      // Verify product
      const product = await tx.inventoryProduct.findFirst({
        where: { id: input.productId, clinicId: c.clinicId, isActive: true },
      });
      if (!product) throw new NotFoundException('PRODUCT_NOT_FOUND_OR_INACTIVE');

      // If batch tracked, verify batch
      if (product.requiresBatchTracking && !input.batchId) {
        throw new BadRequestException('BATCH_TRACKED_PRODUCT_REQUIRES_BATCH_ID');
      }

      // Check on-hand balance at source location
      const srcBalance = await tx.inventoryBalance.findUnique({
        where: {
          clinicId_productId_locationId: {
            clinicId: c.clinicId,
            productId: product.id,
            locationId: srcLoc.id,
          },
        },
      });

      if (!srcBalance || srcBalance.onHandQuantity.lessThan(qty)) {
        throw new ConflictException('INSUFFICIENT_STOCK_AT_SOURCE_LOCATION');
      }

      // Deduct from source balance
      const newSrcOnHand = srcBalance.onHandQuantity.minus(qty);
      const updated = await tx.inventoryBalance.updateMany({
        where: {
          id: srcBalance.id,
          clinicId: c.clinicId,
          version: srcBalance.version,
          onHandQuantity: { gte: qty },
        },
        data: {
          onHandQuantity: newSrcOnHand,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException('CONCURRENT_MODIFICATION_INSUFFICIENT_STOCK');
      }

      // Record stock movement (TRANSFER_OUT)
      await tx.inventoryStockMovement.create({
        data: {
          clinicId: c.clinicId,
          productId: product.id,
          locationId: srcLoc.id,
          sourceLocationId: dstLoc.id,
          batchId: input.batchId ?? null,
          movementType: 'TRANSFER_OUT',
          quantity: qty.negated(),
          balanceAfter: newSrcOnHand,
          reasonCode: 'INTERNAL_TRANSFER',
          reasonExplanation: `Inter-branch dispatch to ${dstBranch.nameAr} (${dstBranch.code})`,
          actorMembershipId: c.membershipId,
        },
      });

      // Generate unique transferNumber
      const transferNumber = `TRF-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`;

      const transfer = await tx.interBranchTransfer.create({
        data: {
          clinicId: c.clinicId,
          transferNumber,
          sourceBranchId: srcBranch.id,
          destinationBranchId: dstBranch.id,
          sourceLocationId: srcLoc.id,
          destinationLocationId: dstLoc.id,
          productId: product.id,
          batchId: input.batchId ?? null,
          quantity: qty,
          status: 'DISPATCHED',
          dispatchedAt: new Date(),
          dispatchedByMembershipId: c.membershipId,
          notes: input.notes ?? null,
        },
        include: {
          sourceBranch: { select: { id: true, code: true, nameAr: true } },
          destinationBranch: { select: { id: true, code: true, nameAr: true } },
          sourceLocation: { select: { id: true, code: true, nameAr: true } },
          destinationLocation: { select: { id: true, code: true, nameAr: true } },
          product: { select: { id: true, sku: true, nameAr: true, unit: true } },
        },
      });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'inventory.transfer.dispatch',
          category: 'PLATFORM',
          targetType: 'InterBranchTransfer',
          targetId: transfer.id,
          outcome: 'SUCCESS',
          metadata: {
            transferNumber,
            quantity: qty.toString(),
            sourceBranch: srcBranch.code,
            destinationBranch: dstBranch.code,
          },
        },
        tx,
      );

      return {
        ...transfer,
        quantity: transfer.quantity.toString(),
      };
    });
  }

  async receiveTransfer(proof: VerifiedPrincipal, clinicId: string, transferId: string, input: ReceiveTransferDto) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.transfers.manage'], async (tx, c) => {
      const transfer = await tx.interBranchTransfer.findFirst({
        where: { id: transferId, clinicId: c.clinicId },
      });
      if (!transfer) throw new NotFoundException('TRANSFER_NOT_FOUND');

      if (transfer.status !== 'DISPATCHED') {
        throw new ConflictException(`CANNOT_RECEIVE_TRANSFER_IN_STATUS_${transfer.status}`);
      }

      if (transfer.version !== input.expectedVersion) {
        throw new ConflictException('TRANSFER_STALE_CONCURRENCY');
      }

      // Upsert target balance at destination location
      let dstBalance = await tx.inventoryBalance.findUnique({
        where: {
          clinicId_productId_locationId: {
            clinicId: c.clinicId,
            productId: transfer.productId,
            locationId: transfer.destinationLocationId,
          },
        },
      });

      if (!dstBalance) {
        dstBalance = await tx.inventoryBalance.create({
          data: {
            clinicId: c.clinicId,
            productId: transfer.productId,
            locationId: transfer.destinationLocationId,
            onHandQuantity: new Prisma.Decimal('0.0000'),
          },
        });
      }

      const newDstOnHand = dstBalance.onHandQuantity.plus(transfer.quantity);
      await tx.inventoryBalance.update({
        where: { id: dstBalance.id },
        data: {
          onHandQuantity: newDstOnHand,
          version: { increment: 1 },
        },
      });

      // Record stock movement (TRANSFER_IN)
      await tx.inventoryStockMovement.create({
        data: {
          clinicId: c.clinicId,
          productId: transfer.productId,
          locationId: transfer.destinationLocationId,
          sourceLocationId: transfer.sourceLocationId,
          batchId: transfer.batchId,
          movementType: 'TRANSFER_IN',
          quantity: transfer.quantity,
          balanceAfter: newDstOnHand,
          reasonCode: 'INTERNAL_TRANSFER',
          reasonExplanation: `Inter-branch receipt: ${transfer.transferNumber}`,
          actorMembershipId: c.membershipId,
        },
      });

      // Update transfer record to RECEIVED
      const updated = await tx.interBranchTransfer.update({
        where: { clinicId_id: { clinicId: c.clinicId, id: transfer.id } },
        data: {
          status: 'RECEIVED',
          receivedAt: new Date(),
          receivedByMembershipId: c.membershipId,
          notes: input.notes !== undefined ? input.notes : transfer.notes,
          version: { increment: 1 },
        },
      });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'inventory.transfer.receive',
          category: 'PLATFORM',
          targetType: 'InterBranchTransfer',
          targetId: updated.id,
          outcome: 'SUCCESS',
          metadata: { transferNumber: transfer.transferNumber },
        },
        tx,
      );

      return {
        ...updated,
        quantity: updated.quantity.toString(),
      };
    });
  }

  async cancelTransfer(proof: VerifiedPrincipal, clinicId: string, transferId: string, input: CancelTransferDto) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.transfers.manage'], async (tx, c) => {
      const transfer = await tx.interBranchTransfer.findFirst({
        where: { id: transferId, clinicId: c.clinicId },
      });
      if (!transfer) throw new NotFoundException('TRANSFER_NOT_FOUND');

      if (transfer.status !== 'DISPATCHED' && transfer.status !== 'PENDING') {
        throw new ConflictException(`CANNOT_CANCEL_TRANSFER_IN_STATUS_${transfer.status}`);
      }

      if (transfer.version !== input.expectedVersion) {
        throw new ConflictException('TRANSFER_STALE_CONCURRENCY');
      }

      // If already dispatched, revert stock back to source location
      if (transfer.status === 'DISPATCHED') {
        const srcBalance = await tx.inventoryBalance.findUnique({
          where: {
            clinicId_productId_locationId: {
              clinicId: c.clinicId,
              productId: transfer.productId,
              locationId: transfer.sourceLocationId,
            },
          },
        });

        if (srcBalance) {
          const revertedOnHand = srcBalance.onHandQuantity.plus(transfer.quantity);
          await tx.inventoryBalance.update({
            where: { id: srcBalance.id },
            data: {
              onHandQuantity: revertedOnHand,
              version: { increment: 1 },
            },
          });

          await tx.inventoryStockMovement.create({
            data: {
              clinicId: c.clinicId,
              productId: transfer.productId,
              locationId: transfer.sourceLocationId,
              sourceLocationId: transfer.destinationLocationId,
              batchId: transfer.batchId,
              movementType: 'TRANSFER_IN',
              quantity: transfer.quantity,
              balanceAfter: revertedOnHand,
              reasonCode: 'DISCREPANCY_CORRECTION',
              reasonExplanation: `Cancelled inter-branch transfer: ${transfer.transferNumber}`,
              actorMembershipId: c.membershipId,
            },
          });
        }
      }

      const updated = await tx.interBranchTransfer.update({
        where: { clinicId_id: { clinicId: c.clinicId, id: transfer.id } },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledByMembershipId: c.membershipId,
          notes: input.reason ? `${transfer.notes ? transfer.notes + ' | ' : ''}Cancelled: ${input.reason}` : transfer.notes,
          version: { increment: 1 },
        },
      });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'inventory.transfer.cancel',
          category: 'PLATFORM',
          targetType: 'InterBranchTransfer',
          targetId: updated.id,
          outcome: 'SUCCESS',
          metadata: { transferNumber: transfer.transferNumber },
        },
        tx,
      );

      return {
        ...updated,
        quantity: updated.quantity.toString(),
      };
    });
  }
}
