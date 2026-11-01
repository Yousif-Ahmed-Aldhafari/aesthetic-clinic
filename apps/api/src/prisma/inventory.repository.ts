import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { InventoryError } from '../inventory/inventory-error.js';
import type {
  CreateProductDto,
  UpdateProductDto,
  ProductListQuery,
  CreateLocationDto,
  UpdateLocationDto,
  OpeningBalanceDto,
  ReceiveStockDto,
  IssueStockDto,
  TransferStockDto,
  AdjustStockDto,
  StockBalancesQuery,
  MovementsQuery,
  CreateBatchDto,
  UpdateBatchStatusDto,
  ReceiveBatchStockDto,
  IssueBatchStockDto,
  TransferBatchStockDto,
  RecordClinicalConsumptionDto,
  VoidClinicalConsumptionDto,
  BatchListQuery,
  ExpiryReportQuery,
  ClinicalConsumptionListQuery,
  CreateSupplierDto,
  UpdateSupplierDto,
  SupplierListQuery,
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  SubmitPurchaseOrderDto,
  ApprovePurchaseOrderDto,
  RejectPurchaseOrderDto,
  CancelPurchaseOrderDto,
  PurchaseOrderListQuery,
  ReceiveGoodsDto,
  GoodsReceiptListQuery,
  CreateStockCountDto,
  RecordStockCountItemsDto,
  ReconcileStockCountDto,
  StockCountListQuery,
  InventoryAlertQuery,
  AcknowledgeAlertDto,
} from '../inventory/inventory-input.js';
import {
  validateDecimalString,
  validateDateString,
  isBatchExpired,
  getClinicLocalDateString,
} from '../inventory/inventory-input.js';
import type { VerifiedPrincipal } from './verified-sessions.js';
import { TenantDatabaseService } from './tenant-database.service.js';
import { AuditRepository } from './audit.repository.js';
import { ConsentEligibilityService } from '../treatments/consent-eligibility.service.js';

const toDecimal = (val: unknown, field: string, opts?: { allowZero?: boolean }) =>
  new Prisma.Decimal(validateDecimalString(val, field, opts));

const clean = <T extends object>(value: T): T => JSON.parse(JSON.stringify(value, (_, v) => {
  if (v instanceof Prisma.Decimal) return v.toString();
  return v;
})) as T;

@Injectable()
export class InventoryRepository {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditRepository,
    private readonly consentEligibility: ConsentEligibilityService,
  ) {}

  // ---------------------------------------------------------------------------
  // Product Catalog
  // ---------------------------------------------------------------------------

  async listProducts(proof: VerifiedPrincipal, clinicId: string, q: ProductListQuery) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.products.read'], async (tx, c) => {
      const take = Math.min(Math.max(q.limit ?? 50, 1), 100);
      const where: Prisma.InventoryProductWhereInput = {
        clinicId: c.clinicId,
        ...(q.category ? { category: q.category } : {}),
        ...(q.isActive !== undefined ? { isActive: q.isActive } : {}),
        ...(q.search
          ? {
              OR: [
                { sku: { contains: q.search.trim(), mode: 'insensitive' } },
                { nameAr: { contains: q.search.trim(), mode: 'insensitive' } },
                { nameEn: { contains: q.search.trim(), mode: 'insensitive' } },
              ],
            }
          : {}),
      };

      const rows = await tx.inventoryProduct.findMany({
        where,
        orderBy: [{ nameAr: 'asc' }, { id: 'asc' }],
        take: take + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
        include: {
          balances: {
            select: {
              locationId: true,
              onHandQuantity: true,
              location: { select: { id: true, code: true, nameAr: true } },
            },
          },
        },
      });

      const items = rows.slice(0, take);
      return {
        items: clean(items),
        nextCursor: rows.length > take ? items.at(-1)!.id : null,
      };
    });
  }

  async getProduct(proof: VerifiedPrincipal, clinicId: string, productId: string) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.products.read'], async (tx, c) => {
      const product = await tx.inventoryProduct.findFirst({
        where: { id: productId, clinicId: c.clinicId },
        include: {
          balances: {
            include: {
              location: {
                select: { id: true, code: true, nameAr: true, type: true },
              },
            },
          },
        },
      });
      if (!product) throw new NotFoundException('PRODUCT_NOT_FOUND');
      return clean(product);
    });
  }

  async createProduct(proof: VerifiedPrincipal, clinicId: string, input: CreateProductDto) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.products.manage'], async (tx, c) => {
      const sku = input.sku.trim();
      const nameAr = input.nameAr.trim();
      if (sku.length < 2 || nameAr.length < 2) {
        throw new BadRequestException('SKU and Arabic name must be at least 2 characters');
      }

      const existing = await tx.inventoryProduct.findFirst({
        where: { clinicId: c.clinicId, sku },
        select: { id: true },
      });
      if (existing) {
        throw new InventoryError('INVENTORY_DUPLICATE_SKU');
      }

      const reorderThreshold = input.reorderThreshold
        ? toDecimal(input.reorderThreshold, 'reorderThreshold', { allowZero: true })
        : new Prisma.Decimal('0.0000');

      // Injectables require batch tracking by default unless explicitly false
      const requiresBatchTracking = input.requiresBatchTracking !== undefined
        ? input.requiresBatchTracking
        : input.category === 'INJECTABLE';

      const row = await tx.inventoryProduct.create({
        data: {
          clinicId: c.clinicId,
          sku,
          nameAr,
          nameEn: input.nameEn?.trim() || null,
          category: input.category,
          description: input.description?.trim() || null,
          unit: input.unit,
          requiresBatchTracking,
          reorderThreshold,
          isActive: input.isActive ?? true,
        },
      });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'inventory.product.create',
          category: 'PLATFORM',
          targetType: 'InventoryProduct',
          targetId: row.id,
          outcome: 'SUCCESS',
          metadata: { sku: row.sku, category: row.category },
        },
        tx,
      );

      return clean(row);
    });
  }

  async updateProduct(proof: VerifiedPrincipal, clinicId: string, productId: string, input: UpdateProductDto) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.products.manage'], async (tx, c) => {
      const existing = await tx.inventoryProduct.findFirst({
        where: { id: productId, clinicId: c.clinicId },
      });
      if (!existing) throw new NotFoundException('PRODUCT_NOT_FOUND');
      if (existing.version !== input.expectedVersion) throw new ConflictException('CONCURRENT_MODIFICATION');

      const data: Prisma.InventoryProductUpdateInput = {
        version: { increment: 1 },
      };

      if (input.nameAr !== undefined) {
        const trimmed = input.nameAr.trim();
        if (trimmed.length < 2) throw new BadRequestException('Arabic name must be at least 2 characters');
        data.nameAr = trimmed;
      }
      if (input.nameEn !== undefined) data.nameEn = input.nameEn.trim() || null;
      if (input.category !== undefined) data.category = input.category;
      if (input.description !== undefined) data.description = input.description.trim() || null;
      if (input.unit !== undefined) data.unit = input.unit;
      if (input.requiresBatchTracking !== undefined) data.requiresBatchTracking = input.requiresBatchTracking;
      if (input.isActive !== undefined) data.isActive = input.isActive;
      if (input.reorderThreshold !== undefined) {
        data.reorderThreshold = toDecimal(input.reorderThreshold, 'reorderThreshold', { allowZero: true });
      }

      const updated = await tx.inventoryProduct.updateMany({
        where: { id: productId, clinicId: c.clinicId, version: input.expectedVersion },
        data,
      });
      if (updated.count !== 1) throw new ConflictException('CONCURRENT_MODIFICATION');

      const row = await tx.inventoryProduct.findUniqueOrThrow({ where: { id: productId } });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'inventory.product.update',
          category: 'PLATFORM',
          targetType: 'InventoryProduct',
          targetId: row.id,
          outcome: 'SUCCESS',
          metadata: { sku: row.sku, version: row.version },
        },
        tx,
      );

      return clean(row);
    });
  }

  // ---------------------------------------------------------------------------
  // Stock Locations
  // ---------------------------------------------------------------------------

  async listLocations(proof: VerifiedPrincipal, clinicId: string) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.locations.read'], async (tx, c) => {
      const rows = await tx.inventoryLocation.findMany({
        where: { clinicId: c.clinicId },
        orderBy: [{ isActive: 'desc' }, { nameAr: 'asc' }, { id: 'asc' }],
        include: {
          _count: {
            select: { balances: true },
          },
        },
      });
      return clean(rows);
    });
  }

  async getLocation(proof: VerifiedPrincipal, clinicId: string, locationId: string) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.locations.read'], async (tx, c) => {
      const loc = await tx.inventoryLocation.findFirst({
        where: { id: locationId, clinicId: c.clinicId },
        include: {
          balances: {
            include: {
              product: {
                select: { id: true, sku: true, nameAr: true, unit: true, category: true },
              },
            },
          },
        },
      });
      if (!loc) throw new NotFoundException('LOCATION_NOT_FOUND');
      return clean(loc);
    });
  }

  async createLocation(proof: VerifiedPrincipal, clinicId: string, input: CreateLocationDto) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.locations.manage'], async (tx, c) => {
      const code = input.code.trim();
      const nameAr = input.nameAr.trim();
      if (code.length < 2 || nameAr.length < 2) {
        throw new BadRequestException('Code and Arabic name must be at least 2 characters');
      }

      const existing = await tx.inventoryLocation.findFirst({
        where: { clinicId: c.clinicId, code },
        select: { id: true },
      });
      if (existing) throw new InventoryError('INVENTORY_DUPLICATE_CODE');

      const row = await tx.inventoryLocation.create({
        data: {
          clinicId: c.clinicId,
          code,
          nameAr,
          nameEn: input.nameEn?.trim() || null,
          type: input.type || 'MAIN_STORE',
          description: input.description?.trim() || null,
          isActive: input.isActive ?? true,
        },
      });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'inventory.location.create',
          category: 'PLATFORM',
          targetType: 'InventoryLocation',
          targetId: row.id,
          outcome: 'SUCCESS',
          metadata: { code: row.code, type: row.type },
        },
        tx,
      );

      return clean(row);
    });
  }

  async updateLocation(proof: VerifiedPrincipal, clinicId: string, locationId: string, input: UpdateLocationDto) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.locations.manage'], async (tx, c) => {
      const existing = await tx.inventoryLocation.findFirst({
        where: { id: locationId, clinicId: c.clinicId },
      });
      if (!existing) throw new NotFoundException('LOCATION_NOT_FOUND');
      if (existing.version !== input.expectedVersion) throw new ConflictException('CONCURRENT_MODIFICATION');

      const data: Prisma.InventoryLocationUpdateInput = {
        version: { increment: 1 },
      };

      if (input.nameAr !== undefined) {
        const trimmed = input.nameAr.trim();
        if (trimmed.length < 2) throw new BadRequestException('Arabic name must be at least 2 characters');
        data.nameAr = trimmed;
      }
      if (input.nameEn !== undefined) data.nameEn = input.nameEn.trim() || null;
      if (input.type !== undefined) data.type = input.type;
      if (input.description !== undefined) data.description = input.description.trim() || null;
      if (input.isActive !== undefined) data.isActive = input.isActive;

      const updated = await tx.inventoryLocation.updateMany({
        where: { id: locationId, clinicId: c.clinicId, version: input.expectedVersion },
        data,
      });
      if (updated.count !== 1) throw new ConflictException('CONCURRENT_MODIFICATION');

      const row = await tx.inventoryLocation.findUniqueOrThrow({ where: { id: locationId } });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'inventory.location.update',
          category: 'PLATFORM',
          targetType: 'InventoryLocation',
          targetId: row.id,
          outcome: 'SUCCESS',
          metadata: { code: row.code, version: row.version },
        },
        tx,
      );

      return clean(row);
    });
  }

  // ---------------------------------------------------------------------------
  // Stock Movements & Ledger Operations
  // ---------------------------------------------------------------------------

  async postOpeningBalance(proof: VerifiedPrincipal, clinicId: string, input: OpeningBalanceDto) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.stock.adjust'], async (tx, c) => {
      const qty = toDecimal(input.quantity, 'quantity');

      // Idempotency check with payload verification
      if (input.idempotencyKey) {
        const existingMovement = await tx.inventoryStockMovement.findUnique({
          where: {
            clinicId_idempotencyKey: { clinicId: c.clinicId, idempotencyKey: input.idempotencyKey },
          },
        });
        if (existingMovement) {
          if (
            existingMovement.productId !== input.productId ||
            existingMovement.locationId !== input.locationId ||
            !existingMovement.quantity.equals(qty) ||
            existingMovement.movementType !== 'OPENING_BALANCE'
          ) {
            throw new InventoryError('INVENTORY_IDEMPOTENCY_CONFLICT');
          }
          return clean(existingMovement);
        }
      }
      const product = await tx.inventoryProduct.findFirst({
        where: { id: input.productId, clinicId: c.clinicId, isActive: true },
      });
      if (!product) throw new NotFoundException('PRODUCT_NOT_FOUND_OR_INACTIVE');

      const location = await tx.inventoryLocation.findFirst({
        where: { id: input.locationId, clinicId: c.clinicId, isActive: true },
      });
      if (!location) throw new NotFoundException('LOCATION_NOT_FOUND_OR_INACTIVE');

      // Opening balance is only allowed if no previous movements exist for this product at this location
      const existingMovementCount = await tx.inventoryStockMovement.count({
        where: { clinicId: c.clinicId, productId: product.id, locationId: location.id },
      });
      if (existingMovementCount > 0) {
        throw new InventoryError('INVENTORY_OPENING_BALANCE_EXISTS');
      }

      // Create or update balance record
      let balance = await tx.inventoryBalance.findUnique({
        where: {
          clinicId_productId_locationId: {
            clinicId: c.clinicId,
            productId: product.id,
            locationId: location.id,
          },
        },
      });

      if (!balance) {
        balance = await tx.inventoryBalance.create({
          data: {
            clinicId: c.clinicId,
            productId: product.id,
            locationId: location.id,
            onHandQuantity: qty,
          },
        });
      } else {
        if (!balance.onHandQuantity.isZero()) {
          throw new InventoryError('INVENTORY_OPENING_BALANCE_EXISTS');
        }
        balance = await tx.inventoryBalance.update({
          where: { id: balance.id },
          data: { onHandQuantity: qty, version: { increment: 1 } },
        });
      }

      const movement = await tx.inventoryStockMovement.create({
        data: {
          clinicId: c.clinicId,
          productId: product.id,
          locationId: location.id,
          movementType: 'OPENING_BALANCE',
          quantity: qty,
          balanceAfter: qty,
          reasonCode: 'INITIAL_COUNT',
          actorMembershipId: c.membershipId,
          idempotencyKey: input.idempotencyKey || null,
        },
      });

      await tx.inventoryBalance.update({
        where: { id: balance.id },
        data: { lastMovementId: movement.id },
      });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'inventory.stock.opening_balance',
          category: 'PLATFORM',
          targetType: 'InventoryStockMovement',
          targetId: movement.id,
          outcome: 'SUCCESS',
          metadata: { productId: product.id, locationId: location.id, quantity: qty.toString() },
        },
        tx,
      );

      return clean(movement);
    });
  }

  async receiveStock(proof: VerifiedPrincipal, clinicId: string, input: ReceiveStockDto) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.stock.receive'], async (tx, c) => {
      const qty = toDecimal(input.quantity, 'quantity');
      const reasonCode = input.reasonCode || 'PURCHASE_RECEIPT';
      if (!['PURCHASE_RECEIPT', 'RETURN'].includes(reasonCode)) {
        throw new BadRequestException('Reason code must be PURCHASE_RECEIPT or RETURN for stock receipt');
      }

      // Idempotency check with payload verification
      if (input.idempotencyKey) {
        const existingMovement = await tx.inventoryStockMovement.findUnique({
          where: {
            clinicId_idempotencyKey: { clinicId: c.clinicId, idempotencyKey: input.idempotencyKey },
          },
        });
        if (existingMovement) {
          if (
            existingMovement.productId !== input.productId ||
            existingMovement.locationId !== input.locationId ||
            !existingMovement.quantity.equals(qty) ||
            existingMovement.reasonCode !== reasonCode ||
            existingMovement.movementType !== 'RECEIPT'
          ) {
            throw new InventoryError('INVENTORY_IDEMPOTENCY_CONFLICT');
          }
          return clean(existingMovement);
        }
      }

      const product = await tx.inventoryProduct.findFirst({
        where: { id: input.productId, clinicId: c.clinicId, isActive: true },
      });
      if (!product) throw new NotFoundException('PRODUCT_NOT_FOUND_OR_INACTIVE');

      const location = await tx.inventoryLocation.findFirst({
        where: { id: input.locationId, clinicId: c.clinicId, isActive: true },
      });
      if (!location) throw new NotFoundException('LOCATION_NOT_FOUND_OR_INACTIVE');

      // Upsert balance
      let balance = await tx.inventoryBalance.findUnique({
        where: {
          clinicId_productId_locationId: {
            clinicId: c.clinicId,
            productId: product.id,
            locationId: location.id,
          },
        },
      });

      if (!balance) {
        balance = await tx.inventoryBalance.create({
          data: {
            clinicId: c.clinicId,
            productId: product.id,
            locationId: location.id,
            onHandQuantity: new Prisma.Decimal('0.0000'),
          },
        });
      }

      const newBalance = balance.onHandQuantity.plus(qty);

      const updated = await tx.inventoryBalance.updateMany({
        where: { id: balance.id, clinicId: c.clinicId, version: balance.version },
        data: {
          onHandQuantity: newBalance,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new ConflictException('CONCURRENT_MODIFICATION');

      const movement = await tx.inventoryStockMovement.create({
        data: {
          clinicId: c.clinicId,
          productId: product.id,
          locationId: location.id,
          movementType: 'RECEIPT',
          quantity: qty,
          balanceAfter: newBalance,
          reasonCode,
          reasonExplanation: input.reasonExplanation?.trim() || null,
          actorMembershipId: c.membershipId,
          idempotencyKey: input.idempotencyKey || null,
        },
      });

      await tx.inventoryBalance.update({
        where: { id: balance.id },
        data: { lastMovementId: movement.id },
      });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'inventory.stock.receive',
          category: 'PLATFORM',
          targetType: 'InventoryStockMovement',
          targetId: movement.id,
          outcome: 'SUCCESS',
          metadata: { productId: product.id, locationId: location.id, quantity: qty.toString(), reasonCode },
        },
        tx,
      );

      return clean(movement);
    });
  }

  async issueStock(proof: VerifiedPrincipal, clinicId: string, input: IssueStockDto) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.stock.issue'], async (tx, c) => {
      const qty = toDecimal(input.quantity, 'quantity');
      if (!['CLINICAL_USE', 'EXPIRED', 'DAMAGED', 'DISCREPANCY_CORRECTION'].includes(input.reasonCode)) {
        throw new BadRequestException('Invalid issue reason code');
      }

      // Idempotency check with payload verification
      if (input.idempotencyKey) {
        const existingMovement = await tx.inventoryStockMovement.findUnique({
          where: {
            clinicId_idempotencyKey: { clinicId: c.clinicId, idempotencyKey: input.idempotencyKey },
          },
        });
        if (existingMovement) {
          if (
            existingMovement.productId !== input.productId ||
            existingMovement.locationId !== input.locationId ||
            !existingMovement.quantity.equals(qty.negated()) ||
            existingMovement.reasonCode !== input.reasonCode ||
            existingMovement.movementType !== 'ISSUE'
          ) {
            throw new InventoryError('INVENTORY_IDEMPOTENCY_CONFLICT');
          }
          return clean(existingMovement);
        }
      }

      const product = await tx.inventoryProduct.findFirst({
        where: { id: input.productId, clinicId: c.clinicId },
      });
      if (!product) throw new NotFoundException('PRODUCT_NOT_FOUND');

      // CRITICAL REGULATORY BOUNDARY FOR STEP 4.1:
      // Injectables and regulated products requiring batch tracking CANNOT be consumed
      // clinically through generic issue. Step 4.2 provides batch/expiry traceability.
      if (product.requiresBatchTracking && input.reasonCode === 'CLINICAL_USE') {
        throw new InventoryError('INVENTORY_BATCH_TRACKING_REQUIRED');
      }

      if (input.reasonCode !== 'CLINICAL_USE' && (!input.reasonExplanation || input.reasonExplanation.trim().length < 3)) {
        throw new BadRequestException('Reason explanation of at least 3 characters is required for waste/adjustment issue');
      }

      const location = await tx.inventoryLocation.findFirst({
        where: { id: input.locationId, clinicId: c.clinicId },
      });
      if (!location) throw new NotFoundException('LOCATION_NOT_FOUND');

      const balance = await tx.inventoryBalance.findUnique({
        where: {
          clinicId_productId_locationId: {
            clinicId: c.clinicId,
            productId: product.id,
            locationId: location.id,
          },
        },
      });

      if (!balance || balance.onHandQuantity.lessThan(qty)) {
        throw new InventoryError('INVENTORY_INSUFFICIENT_STOCK');
      }

      const newBalance = balance.onHandQuantity.minus(qty);

      const updated = await tx.inventoryBalance.updateMany({
        where: {
          id: balance.id,
          clinicId: c.clinicId,
          version: balance.version,
          onHandQuantity: { gte: qty },
        },
        data: {
          onHandQuantity: newBalance,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException('CONCURRENT_MODIFICATION_OR_INSUFFICIENT_STOCK');
      }

      // Quantity is stored as negative for outbound ISSUE
      const movement = await tx.inventoryStockMovement.create({
        data: {
          clinicId: c.clinicId,
          productId: product.id,
          locationId: location.id,
          movementType: 'ISSUE',
          quantity: qty.negated(),
          balanceAfter: newBalance,
          reasonCode: input.reasonCode,
          reasonExplanation: input.reasonExplanation?.trim() || null,
          actorMembershipId: c.membershipId,
          idempotencyKey: input.idempotencyKey || null,
        },
      });

      await tx.inventoryBalance.update({
        where: { id: balance.id },
        data: { lastMovementId: movement.id },
      });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'inventory.stock.issue',
          category: 'PLATFORM',
          targetType: 'InventoryStockMovement',
          targetId: movement.id,
          outcome: 'SUCCESS',
          metadata: {
            productId: product.id,
            locationId: location.id,
            quantity: qty.toString(),
            reasonCode: input.reasonCode,
          },
        },
        tx,
      );

      return clean(movement);
    });
  }

  async transferStock(proof: VerifiedPrincipal, clinicId: string, input: TransferStockDto) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.stock.transfer'], async (tx, c) => {
      if (input.sourceLocationId === input.targetLocationId) {
        throw new InventoryError('INVENTORY_SAME_LOCATION_TRANSFER');
      }

      const qty = toDecimal(input.quantity, 'quantity');

      // Idempotency check with payload verification
      if (input.idempotencyKey) {
        const existingMovement = await tx.inventoryStockMovement.findUnique({
          where: {
            clinicId_idempotencyKey: { clinicId: c.clinicId, idempotencyKey: input.idempotencyKey },
          },
        });
        if (existingMovement) {
          if (
            existingMovement.productId !== input.productId ||
            existingMovement.locationId !== input.sourceLocationId ||
            existingMovement.sourceLocationId !== input.targetLocationId ||
            !existingMovement.quantity.equals(qty.negated()) ||
            existingMovement.movementType !== 'TRANSFER_OUT'
          ) {
            throw new InventoryError('INVENTORY_IDEMPOTENCY_CONFLICT');
          }
          const transferIn = await tx.inventoryStockMovement.findUnique({
            where: {
              clinicId_idempotencyKey: { clinicId: c.clinicId, idempotencyKey: `${input.idempotencyKey}:in` },
            },
          });
          return clean({ transferOut: existingMovement, transferIn });
        }
      }

      const product = await tx.inventoryProduct.findFirst({
        where: { id: input.productId, clinicId: c.clinicId, isActive: true },
      });
      if (!product) throw new NotFoundException('PRODUCT_NOT_FOUND_OR_INACTIVE');

      const sourceLocation = await tx.inventoryLocation.findFirst({
        where: { id: input.sourceLocationId, clinicId: c.clinicId },
      });
      if (!sourceLocation) throw new NotFoundException('SOURCE_LOCATION_NOT_FOUND');

      const targetLocation = await tx.inventoryLocation.findFirst({
        where: { id: input.targetLocationId, clinicId: c.clinicId, isActive: true },
      });
      if (!targetLocation) throw new NotFoundException('TARGET_LOCATION_NOT_FOUND_OR_INACTIVE');

      // Check source balance
      const sourceBalance = await tx.inventoryBalance.findUnique({
        where: {
          clinicId_productId_locationId: {
            clinicId: c.clinicId,
            productId: product.id,
            locationId: sourceLocation.id,
          },
        },
      });

      if (!sourceBalance || sourceBalance.onHandQuantity.lessThan(qty)) {
        throw new InventoryError('INVENTORY_INSUFFICIENT_STOCK');
      }

      // Ensure target balance exists
      let targetBalance = await tx.inventoryBalance.findUnique({
        where: {
          clinicId_productId_locationId: {
            clinicId: c.clinicId,
            productId: product.id,
            locationId: targetLocation.id,
          },
        },
      });

      if (!targetBalance) {
        targetBalance = await tx.inventoryBalance.create({
          data: {
            clinicId: c.clinicId,
            productId: product.id,
            locationId: targetLocation.id,
            onHandQuantity: new Prisma.Decimal('0.0000'),
          },
        });
      }

      const newSourceOnHand = sourceBalance.onHandQuantity.minus(qty);
      const newTargetOnHand = targetBalance.onHandQuantity.plus(qty);

      // Decrement source with optimistic/concurrency check
      const sourceUpdated = await tx.inventoryBalance.updateMany({
        where: {
          id: sourceBalance.id,
          clinicId: c.clinicId,
          version: sourceBalance.version,
          onHandQuantity: { gte: qty },
        },
        data: {
          onHandQuantity: newSourceOnHand,
          version: { increment: 1 },
        },
      });
      if (sourceUpdated.count !== 1) {
        throw new ConflictException('CONCURRENT_MODIFICATION_OR_INSUFFICIENT_SOURCE_STOCK');
      }

      // Increment target balance
      const targetUpdated = await tx.inventoryBalance.updateMany({
        where: {
          id: targetBalance.id,
          clinicId: c.clinicId,
          version: targetBalance.version,
        },
        data: {
          onHandQuantity: newTargetOnHand,
          version: { increment: 1 },
        },
      });
      if (targetUpdated.count !== 1) {
        throw new ConflictException('CONCURRENT_MODIFICATION_AT_TARGET');
      }

      // Create opposing movement rows atomically
      const transferOut = await tx.inventoryStockMovement.create({
        data: {
          clinicId: c.clinicId,
          productId: product.id,
          locationId: sourceLocation.id,
          sourceLocationId: targetLocation.id,
          movementType: 'TRANSFER_OUT',
          quantity: qty.negated(),
          balanceAfter: newSourceOnHand,
          reasonCode: 'INTERNAL_TRANSFER',
          reasonExplanation: input.reasonExplanation?.trim() || null,
          actorMembershipId: c.membershipId,
          idempotencyKey: input.idempotencyKey || null,
        },
      });

      const transferIn = await tx.inventoryStockMovement.create({
        data: {
          clinicId: c.clinicId,
          productId: product.id,
          locationId: targetLocation.id,
          sourceLocationId: sourceLocation.id,
          movementType: 'TRANSFER_IN',
          quantity: qty,
          balanceAfter: newTargetOnHand,
          reasonCode: 'INTERNAL_TRANSFER',
          reasonExplanation: input.reasonExplanation?.trim() || null,
          actorMembershipId: c.membershipId,
          // Suffix or null for target leg to avoid unique idempotency conflict with source leg
          idempotencyKey: input.idempotencyKey ? `${input.idempotencyKey}:in` : null,
        },
      });

      await tx.inventoryBalance.update({
        where: { id: sourceBalance.id },
        data: { lastMovementId: transferOut.id },
      });
      await tx.inventoryBalance.update({
        where: { id: targetBalance.id },
        data: { lastMovementId: transferIn.id },
      });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'inventory.stock.transfer',
          category: 'PLATFORM',
          targetType: 'InventoryStockMovement',
          targetId: transferOut.id,
          outcome: 'SUCCESS',
          metadata: {
            productId: product.id,
            sourceLocationId: sourceLocation.id,
            targetLocationId: targetLocation.id,
            quantity: qty.toString(),
          },
        },
        tx,
      );

      return clean({ transferOut, transferIn });
    });
  }

  async adjustStock(proof: VerifiedPrincipal, clinicId: string, input: AdjustStockDto) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.stock.adjust'], async (tx, c) => {
      const targetQty = toDecimal(input.targetQuantity, 'targetQuantity', { allowZero: true });

      // Idempotency check with payload verification
      if (input.idempotencyKey) {
        const existingMovement = await tx.inventoryStockMovement.findUnique({
          where: {
            clinicId_idempotencyKey: { clinicId: c.clinicId, idempotencyKey: input.idempotencyKey },
          },
        });
        if (existingMovement) {
          if (
            existingMovement.productId !== input.productId ||
            existingMovement.locationId !== input.locationId ||
            !existingMovement.balanceAfter.equals(targetQty) ||
            existingMovement.reasonCode !== input.reasonCode ||
            existingMovement.movementType !== 'ADJUSTMENT'
          ) {
            throw new InventoryError('INVENTORY_IDEMPOTENCY_CONFLICT');
          }
          return clean(existingMovement);
        }
      }

      if (!input.reasonExplanation || input.reasonExplanation.trim().length < 3) {
        throw new BadRequestException('Reason explanation of at least 3 characters is required for stock adjustments');
      }
      if (!['DISCREPANCY_CORRECTION', 'DAMAGED', 'EXPIRED'].includes(input.reasonCode)) {
        throw new BadRequestException('Invalid adjustment reason code');
      }

      const product = await tx.inventoryProduct.findFirst({
        where: { id: input.productId, clinicId: c.clinicId },
      });
      if (!product) throw new NotFoundException('PRODUCT_NOT_FOUND');

      // Products requiring batch tracking cannot escape traceability through generic adjustment
      if (product.requiresBatchTracking) {
        throw new InventoryError('INVENTORY_BATCH_REQUIRED_FOR_PRODUCT');
      }

      const location = await tx.inventoryLocation.findFirst({
        where: { id: input.locationId, clinicId: c.clinicId },
      });
      if (!location) throw new NotFoundException('LOCATION_NOT_FOUND');

      let balance = await tx.inventoryBalance.findUnique({
        where: {
          clinicId_productId_locationId: {
            clinicId: c.clinicId,
            productId: product.id,
            locationId: location.id,
          },
        },
      });

      if (!balance) {
        balance = await tx.inventoryBalance.create({
          data: {
            clinicId: c.clinicId,
            productId: product.id,
            locationId: location.id,
            onHandQuantity: new Prisma.Decimal('0.0000'),
          },
        });
      }

      const delta = targetQty.minus(balance.onHandQuantity);
      if (delta.isZero()) {
        return clean({ message: 'NO_CHANGE_NEEDED', currentBalance: balance.onHandQuantity.toString() });
      }

      const updated = await tx.inventoryBalance.updateMany({
        where: {
          id: balance.id,
          clinicId: c.clinicId,
          version: balance.version,
        },
        data: {
          onHandQuantity: targetQty,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new ConflictException('CONCURRENT_MODIFICATION');

      const movement = await tx.inventoryStockMovement.create({
        data: {
          clinicId: c.clinicId,
          productId: product.id,
          locationId: location.id,
          movementType: 'ADJUSTMENT',
          quantity: delta,
          balanceAfter: targetQty,
          reasonCode: input.reasonCode,
          reasonExplanation: input.reasonExplanation.trim(),
          actorMembershipId: c.membershipId,
          idempotencyKey: input.idempotencyKey || null,
        },
      });

      await tx.inventoryBalance.update({
        where: { id: balance.id },
        data: { lastMovementId: movement.id },
      });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'inventory.stock.adjust',
          category: 'PLATFORM',
          targetType: 'InventoryStockMovement',
          targetId: movement.id,
          outcome: 'SUCCESS',
          metadata: {
            productId: product.id,
            locationId: location.id,
            delta: delta.toString(),
            targetQuantity: targetQty.toString(),
            reasonCode: input.reasonCode,
          },
        },
        tx,
      );

      return clean(movement);
    });
  }

  // ---------------------------------------------------------------------------
  // Balances, Movements, and Ledger Reconciliation
  // ---------------------------------------------------------------------------

  async listBalances(proof: VerifiedPrincipal, clinicId: string, q: StockBalancesQuery) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.stock.read'], async (tx, c) => {
      const rows = await tx.inventoryBalance.findMany({
        where: {
          clinicId: c.clinicId,
          ...(q.locationId ? { locationId: q.locationId } : {}),
          ...(q.productId ? { productId: q.productId } : {}),
        },
        include: {
          product: {
            select: {
              id: true,
              sku: true,
              nameAr: true,
              nameEn: true,
              category: true,
              unit: true,
              reorderThreshold: true,
              requiresBatchTracking: true,
              isActive: true,
            },
          },
          location: {
            select: {
              id: true,
              code: true,
              nameAr: true,
              type: true,
              isActive: true,
            },
          },
        },
        orderBy: [{ product: { nameAr: 'asc' } }, { location: { nameAr: 'asc' } }],
      });

      let items = rows;
      if (q.lowStockOnly) {
        items = items.filter((b) => b.onHandQuantity.lessThanOrEqualTo(b.product.reorderThreshold));
      }

      return clean(
        items.map((b) => ({
          ...b,
          isLowStock: b.onHandQuantity.lessThanOrEqualTo(b.product.reorderThreshold),
        })),
      );
    });
  }

  async listMovements(proof: VerifiedPrincipal, clinicId: string, q: MovementsQuery) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.movements.read'], async (tx, c) => {
      const take = Math.min(Math.max(q.limit ?? 50, 1), 100);
      const rows = await tx.inventoryStockMovement.findMany({
        where: {
          clinicId: c.clinicId,
          ...(q.productId ? { productId: q.productId } : {}),
          ...(q.locationId ? { locationId: q.locationId } : {}),
          ...(q.movementType ? { movementType: q.movementType } : {}),
        },
        include: {
          product: { select: { id: true, sku: true, nameAr: true, unit: true } },
          location: { select: { id: true, code: true, nameAr: true } },
          sourceLocation: { select: { id: true, code: true, nameAr: true } },
          actor: { select: { id: true, user: { select: { name: true, email: true } } } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: take + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      });

      const items = rows.slice(0, take);
      return {
        items: clean(items),
        nextCursor: rows.length > take ? items.at(-1)!.id : null,
      };
    });
  }

  async reconcileLedger(proof: VerifiedPrincipal, clinicId: string) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.reconcile'], async (tx, c) => {
      // Fetch all recorded balances for this clinic
      const balances = await tx.inventoryBalance.findMany({
        where: { clinicId: c.clinicId },
        include: {
          product: { select: { sku: true, nameAr: true } },
          location: { select: { code: true, nameAr: true } },
        },
      });

      // Aggregate all movements for this clinic by productId and locationId
      const movementSums = await tx.inventoryStockMovement.groupBy({
        by: ['productId', 'locationId'],
        where: { clinicId: c.clinicId },
        _sum: {
          quantity: true,
        },
      });

      const movementMap = new Map<string, Prisma.Decimal>();
      for (const item of movementSums) {
        const key = `${item.productId}:${item.locationId}`;
        movementMap.set(key, item._sum.quantity || new Prisma.Decimal('0.0000'));
      }

      const discrepancies: Array<{
        productId: string;
        locationId: string;
        productSku: string;
        productNameAr: string;
        locationCode: string;
        balanceQuantity: string;
        ledgerSumQuantity: string;
        difference: string;
      }> = [];

      for (const b of balances) {
        const key = `${b.productId}:${b.locationId}`;
        const sumFromMovements = movementMap.get(key) || new Prisma.Decimal('0.0000');
        if (!b.onHandQuantity.equals(sumFromMovements)) {
          discrepancies.push({
            productId: b.productId,
            locationId: b.locationId,
            productSku: b.product.sku,
            productNameAr: b.product.nameAr,
            locationCode: b.location.code,
            balanceQuantity: b.onHandQuantity.toString(),
            ledgerSumQuantity: sumFromMovements.toString(),
            difference: b.onHandQuantity.minus(sumFromMovements).toString(),
          });
        }
      }

      const result = {
        status: discrepancies.length === 0 ? ('RECONCILED' as const) : ('DISCREPANCY_DETECTED' as const),
        verifiedAt: new Date().toISOString(),
        totalItemsChecked: balances.length,
        discrepancies,
      };

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'inventory.ledger.reconcile',
          category: 'PLATFORM',
          targetType: 'InventoryLedger',
          targetId: c.clinicId,
          outcome: result.status === 'RECONCILED' ? 'SUCCESS' : 'FAILURE',
          metadata: {
            totalItemsChecked: result.totalItemsChecked,
            discrepancyCount: discrepancies.length,
          },
        },
        tx,
      );

      return result;
    });
  }

  // ---------------------------------------------------------------------------
  // Batch / Lot Management
  // ---------------------------------------------------------------------------

  async createBatch(proof: VerifiedPrincipal, clinicId: string, input: CreateBatchDto) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.batches.manage'], async (tx, c) => {
      if (!input.batchNumber || input.batchNumber.trim().length < 2) {
        throw new BadRequestException('Batch number must be at least 2 characters');
      }
      const expDateStr = validateDateString(input.expirationDate, 'expirationDate');
      const initQty = toDecimal(input.initialQuantity, 'initialQuantity');

      const product = await tx.inventoryProduct.findFirst({
        where: { id: input.productId, clinicId: c.clinicId },
      });
      if (!product) throw new NotFoundException('PRODUCT_NOT_FOUND');

      const clinic = await tx.clinic.findUnique({
        where: { id: c.clinicId },
        select: { timezone: true },
      });
      const tz = clinic?.timezone || 'Asia/Aden';

      if (isBatchExpired(expDateStr, tz)) {
        throw new InventoryError('INVENTORY_BATCH_EXPIRED');
      }

      const existingBatch = await tx.inventoryBatch.findUnique({
        where: {
          clinicId_productId_batchNumber: {
            clinicId: c.clinicId,
            productId: input.productId,
            batchNumber: input.batchNumber.trim(),
          },
        },
      });
      if (existingBatch) {
        throw new InventoryError('INVENTORY_DUPLICATE_BATCH');
      }

      const batch = await tx.inventoryBatch.create({
        data: {
          clinicId: c.clinicId,
          productId: input.productId,
          batchNumber: input.batchNumber.trim(),
          expirationDate: new Date(expDateStr + 'T00:00:00Z'),
          status: 'AVAILABLE',
          initialQuantity: initQty,
          manufacturerName: input.manufacturerName?.trim() || null,
          supplierName: input.supplierName?.trim() || null,
        },
      });

      if (input.locationId) {
        const location = await tx.inventoryLocation.findFirst({
          where: { id: input.locationId, clinicId: c.clinicId },
        });
        if (!location) throw new NotFoundException('LOCATION_NOT_FOUND');

        let balance = await tx.inventoryBalance.findUnique({
          where: {
            clinicId_productId_locationId: {
              clinicId: c.clinicId,
              productId: input.productId,
              locationId: input.locationId,
            },
          },
        });
        const prevOnHand = balance ? balance.onHandQuantity : new Prisma.Decimal('0.0000');
        const newOnHand = prevOnHand.plus(initQty);

        const movement = await tx.inventoryStockMovement.create({
          data: {
            clinicId: c.clinicId,
            productId: input.productId,
            locationId: input.locationId,
            batchId: batch.id,
            movementType: 'OPENING_BALANCE',
            quantity: initQty,
            balanceAfter: newOnHand,
            reasonCode: 'INITIAL_COUNT',
            reasonExplanation: `Batch ${batch.batchNumber} opening balance`,
            actorMembershipId: c.membershipId,
            idempotencyKey: input.idempotencyKey || null,
          },
        });

        if (balance) {
          await tx.inventoryBalance.update({
            where: { id: balance.id },
            data: {
              onHandQuantity: newOnHand,
              lastMovementId: movement.id,
              version: { increment: 1 },
            },
          });
        } else {
          await tx.inventoryBalance.create({
            data: {
              clinicId: c.clinicId,
              productId: input.productId,
              locationId: input.locationId,
              onHandQuantity: newOnHand,
              lastMovementId: movement.id,
            },
          });
        }

        await tx.inventoryBatchBalance.create({
          data: {
            clinicId: c.clinicId,
            batchId: batch.id,
            productId: input.productId,
            locationId: input.locationId,
            onHandQuantity: initQty,
          },
        });
      }

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'inventory.batch.create',
          category: 'PLATFORM',
          targetType: 'InventoryBatch',
          targetId: batch.id,
          outcome: 'SUCCESS',
          metadata: {
            productId: input.productId,
            batchNumber: batch.batchNumber,
            expirationDate: expDateStr,
            initialQuantity: initQty.toString(),
          },
        },
        tx,
      );

      return clean(batch);
    });
  }

  async listBatches(proof: VerifiedPrincipal, clinicId: string, q: BatchListQuery) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.batches.read'], async (tx, c) => {
      const take = Math.min(Math.max(q.limit ?? 50, 1), 100);
      const clinic = await tx.clinic.findUnique({
        where: { id: c.clinicId },
        select: { timezone: true },
      });
      const tz = clinic?.timezone || 'Asia/Aden';

      const where: Prisma.InventoryBatchWhereInput = {
        clinicId: c.clinicId,
        ...(q.productId ? { productId: q.productId } : {}),
        ...(q.status ? { status: q.status } : {}),
        ...(q.expiringBefore
          ? { expirationDate: { lte: new Date(q.expiringBefore + 'T00:00:00Z') } }
          : {}),
        ...(q.search
          ? {
              OR: [
                { batchNumber: { contains: q.search.trim(), mode: 'insensitive' } },
                { product: { sku: { contains: q.search.trim(), mode: 'insensitive' } } },
                { product: { nameAr: { contains: q.search.trim(), mode: 'insensitive' } } },
              ],
            }
          : {}),
      };

      const rows = await tx.inventoryBatch.findMany({
        where,
        take: take + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
        orderBy: [{ expirationDate: 'asc' }, { createdAt: 'desc' }],
        include: {
          product: {
            select: { id: true, sku: true, nameAr: true, nameEn: true, unit: true, category: true },
          },
          batchBalances: {
            select: {
              locationId: true,
              onHandQuantity: true,
              location: { select: { id: true, code: true, nameAr: true } },
            },
          },
        },
      });

      const hasMore = rows.length > take;
      const items = hasMore ? rows.slice(0, take) : rows;
      const nextCursor = hasMore ? items[items.length - 1].id : null;

      const mapped = items.map((b) => {
        const totalOnHand = b.batchBalances.reduce(
          (acc, bb) => acc.plus(bb.onHandQuantity),
          new Prisma.Decimal('0.0000'),
        );
        const isExpired = isBatchExpired(b.expirationDate, tz);
        return {
          ...b,
          totalOnHandQuantity: totalOnHand.toString(),
          isExpired,
        };
      });

      return clean({ items: mapped, nextCursor });
    });
  }

  async getBatch(proof: VerifiedPrincipal, clinicId: string, batchId: string) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.batches.read'], async (tx, c) => {
      const clinic = await tx.clinic.findUnique({
        where: { id: c.clinicId },
        select: { timezone: true },
      });
      const tz = clinic?.timezone || 'Asia/Aden';

      const batch = await tx.inventoryBatch.findFirst({
        where: { id: batchId, clinicId: c.clinicId },
        include: {
          product: true,
          batchBalances: {
            include: { location: true },
          },
          movements: {
            take: 20,
            orderBy: { createdAt: 'desc' },
            include: {
              location: { select: { code: true, nameAr: true } },
              actor: { select: { user: { select: { name: true } } } },
            },
          },
        },
      });
      if (!batch) throw new NotFoundException('BATCH_NOT_FOUND');

      const totalOnHand = batch.batchBalances.reduce(
        (acc, bb) => acc.plus(bb.onHandQuantity),
        new Prisma.Decimal('0.0000'),
      );

      return clean({
        ...batch,
        totalOnHandQuantity: totalOnHand.toString(),
        isExpired: isBatchExpired(batch.expirationDate, tz),
      });
    });
  }

  async updateBatchStatus(
    proof: VerifiedPrincipal,
    clinicId: string,
    batchId: string,
    input: UpdateBatchStatusDto,
  ) {
    const requiredPermission =
      input.status === 'QUARANTINED'
        ? 'inventory.batches.quarantine'
        : input.status === 'RECALLED'
          ? 'inventory.batches.recall'
          : 'inventory.batches.manage';

    return this.database.withClinicContext(proof, clinicId, [requiredPermission], async (tx, c) => {
      const batch = await tx.inventoryBatch.findFirst({
        where: { id: batchId, clinicId: c.clinicId },
      });
      if (!batch) throw new NotFoundException('BATCH_NOT_FOUND');

      if (batch.status === 'RECALLED') {
        throw new InventoryError('INVENTORY_BATCH_IMMUTABLE_STATUS');
      }

      const clinic = await tx.clinic.findUnique({
        where: { id: c.clinicId },
        select: { timezone: true },
      });
      const tz = clinic?.timezone || 'Asia/Aden';

      if (input.status === 'AVAILABLE') {
        if (isBatchExpired(batch.expirationDate, tz)) {
          throw new InventoryError('INVENTORY_BATCH_EXPIRED');
        }
        if (batch.status === 'EXPIRED') {
          throw new InventoryError('INVENTORY_BATCH_IMMUTABLE_STATUS');
        }
      }

      if (input.status === 'QUARANTINED') {
        if (!input.reason || input.reason.trim().length < 3) {
          throw new BadRequestException('Quarantine reason of at least 3 characters is required');
        }
        const updated = await tx.inventoryBatch.update({
          where: { id: batch.id },
          data: {
            status: 'QUARANTINED',
            quarantinedAt: new Date(),
            quarantineReason: input.reason.trim(),
            version: { increment: 1 },
          },
        });
        await this.audit.record(
          {
            clinicId: c.clinicId,
            actorId: c.userId,
            action: 'inventory.batch.quarantine',
            category: 'PLATFORM',
            targetType: 'InventoryBatch',
            targetId: batch.id,
            outcome: 'SUCCESS',
            metadata: { reason: input.reason.trim() },
          },
          tx,
        );
        return clean(updated);
      }

      if (input.status === 'RECALLED') {
        if (!input.reason || input.reason.trim().length < 3) {
          throw new BadRequestException('Recall reason of at least 3 characters is required');
        }
        const updated = await tx.inventoryBatch.update({
          where: { id: batch.id },
          data: {
            status: 'RECALLED',
            recalledAt: new Date(),
            recallReason: input.reason.trim(),
            version: { increment: 1 },
          },
        });
        await this.audit.record(
          {
            clinicId: c.clinicId,
            actorId: c.userId,
            action: 'inventory.batch.recall',
            category: 'PLATFORM',
            targetType: 'InventoryBatch',
            targetId: batch.id,
            outcome: 'SUCCESS',
            metadata: { reason: input.reason.trim() },
          },
          tx,
        );
        return clean(updated);
      }

      const updated = await tx.inventoryBatch.update({
        where: { id: batch.id },
        data: {
          status: 'AVAILABLE',
          quarantinedAt: null,
          quarantineReason: null,
          version: { increment: 1 },
        },
      });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'inventory.batch.release_to_available',
          category: 'PLATFORM',
          targetType: 'InventoryBatch',
          targetId: batch.id,
          outcome: 'SUCCESS',
        },
        tx,
      );

      return clean(updated);
    });
  }

  async getExpiryReport(proof: VerifiedPrincipal, clinicId: string, q: ExpiryReportQuery) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.batches.read'], async (tx, c) => {
      const clinic = await tx.clinic.findUnique({
        where: { id: c.clinicId },
        select: { timezone: true },
      });
      const tz = clinic?.timezone || 'Asia/Aden';
      const days = q.daysThreshold ?? 60;

      const now = new Date();
      const todayStr = getClinicLocalDateString(now, tz);
      const cutoffDate = new Date(now.getTime() + days * 86400000);
      const cutoffStr = getClinicLocalDateString(cutoffDate, tz);

      const batches = await tx.inventoryBatch.findMany({
        where: {
          clinicId: c.clinicId,
          ...(q.productId ? { productId: q.productId } : {}),
          status: { in: ['AVAILABLE', 'QUARANTINED', 'EXPIRED'] },
          expirationDate: { lte: new Date(cutoffStr + 'T23:59:59Z') },
        },
        include: {
          product: {
            select: { id: true, sku: true, nameAr: true, nameEn: true, unit: true, category: true },
          },
          batchBalances: {
            where: {
              ...(q.locationId ? { locationId: q.locationId } : {}),
              onHandQuantity: { gt: 0 },
            },
            include: { location: { select: { id: true, code: true, nameAr: true } } },
          },
        },
        orderBy: { expirationDate: 'asc' },
      });

      const activeBatches = batches.filter((b) => b.batchBalances.length > 0);

      const items = activeBatches.map((b) => {
        const totalOnHand = b.batchBalances.reduce(
          (acc, bb) => acc.plus(bb.onHandQuantity),
          new Prisma.Decimal('0.0000'),
        );
        const expStr = b.expirationDate.toISOString().slice(0, 10);
        const isExpired = todayStr > expStr;

        const diffMs = new Date(expStr + 'T00:00:00Z').getTime() - new Date(todayStr + 'T00:00:00Z').getTime();
        const daysRemaining = Math.round(diffMs / 86400000);

        let riskLevel: 'EXPIRED' | 'CRITICAL' | 'WARNING' | 'NORMAL';
        if (isExpired || daysRemaining < 0) riskLevel = 'EXPIRED';
        else if (daysRemaining <= 7) riskLevel = 'CRITICAL';
        else if (daysRemaining <= 30) riskLevel = 'WARNING';
        else riskLevel = 'NORMAL';

        return {
          id: b.id,
          batchNumber: b.batchNumber,
          productId: b.productId,
          product: b.product,
          status: b.status,
          expirationDate: expStr,
          isExpired,
          daysRemaining,
          riskLevel,
          totalOnHandQuantity: totalOnHand.toString(),
          locationBalances: b.batchBalances.map((bb) => ({
            locationId: bb.locationId,
            locationCode: bb.location.code,
            locationNameAr: bb.location.nameAr,
            onHandQuantity: bb.onHandQuantity.toString(),
          })),
        };
      });

      return clean({
        clinicTimezone: tz,
        evaluatedAt: todayStr,
        daysThreshold: days,
        totalBatches: items.length,
        items,
      });
    });
  }

  async receiveBatchStock(proof: VerifiedPrincipal, clinicId: string, input: ReceiveBatchStockDto) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.stock.receive'], async (tx, c) => {
      const qty = toDecimal(input.quantity, 'quantity');

      if (input.idempotencyKey) {
        const existingMovement = await tx.inventoryStockMovement.findUnique({
          where: {
            clinicId_idempotencyKey: { clinicId: c.clinicId, idempotencyKey: input.idempotencyKey },
          },
        });
        if (existingMovement) {
          if (
            existingMovement.productId !== input.productId ||
            existingMovement.locationId !== input.locationId ||
            existingMovement.batchId !== input.batchId ||
            !existingMovement.quantity.equals(qty) ||
            existingMovement.movementType !== 'RECEIPT'
          ) {
            throw new InventoryError('INVENTORY_IDEMPOTENCY_CONFLICT');
          }
          return clean(existingMovement);
        }
      }

      const product = await tx.inventoryProduct.findFirst({
        where: { id: input.productId, clinicId: c.clinicId },
      });
      if (!product) throw new NotFoundException('PRODUCT_NOT_FOUND');

      const batch = await tx.inventoryBatch.findFirst({
        where: { id: input.batchId, clinicId: c.clinicId },
      });
      if (!batch) throw new NotFoundException('BATCH_NOT_FOUND');
      if (batch.productId !== input.productId) {
        throw new InventoryError('INVENTORY_BATCH_MISMATCH');
      }

      if (batch.status === 'RECALLED') {
        throw new InventoryError('INVENTORY_BATCH_RECALLED');
      }

      const clinic = await tx.clinic.findUnique({
        where: { id: c.clinicId },
        select: { timezone: true },
      });
      const tz = clinic?.timezone || 'Asia/Aden';

      if (batch.status === 'EXPIRED' || isBatchExpired(batch.expirationDate, tz)) {
        throw new InventoryError('INVENTORY_BATCH_EXPIRED');
      }

      const location = await tx.inventoryLocation.findFirst({
        where: { id: input.locationId, clinicId: c.clinicId },
      });
      if (!location) throw new NotFoundException('LOCATION_NOT_FOUND');

      let balance = await tx.inventoryBalance.findUnique({
        where: {
          clinicId_productId_locationId: {
            clinicId: c.clinicId,
            productId: input.productId,
            locationId: input.locationId,
          },
        },
      });
      const prevBal = balance ? balance.onHandQuantity : new Prisma.Decimal('0.0000');
      const newBal = prevBal.plus(qty);

      const movement = await tx.inventoryStockMovement.create({
        data: {
          clinicId: c.clinicId,
          productId: input.productId,
          locationId: input.locationId,
          batchId: batch.id,
          movementType: 'RECEIPT',
          quantity: qty,
          balanceAfter: newBal,
          reasonCode: input.reasonCode || 'PURCHASE_RECEIPT',
          reasonExplanation: input.reasonExplanation || `Batch ${batch.batchNumber} receipt`,
          actorMembershipId: c.membershipId,
          idempotencyKey: input.idempotencyKey || null,
        },
      });

      if (balance) {
        await tx.inventoryBalance.update({
          where: { id: balance.id },
          data: {
            onHandQuantity: newBal,
            lastMovementId: movement.id,
            version: { increment: 1 },
          },
        });
      } else {
        await tx.inventoryBalance.create({
          data: {
            clinicId: c.clinicId,
            productId: input.productId,
            locationId: input.locationId,
            onHandQuantity: newBal,
            lastMovementId: movement.id,
          },
        });
      }

      let batchBalance = await tx.inventoryBatchBalance.findUnique({
        where: {
          clinicId_locationId_batchId: {
            clinicId: c.clinicId,
            locationId: input.locationId,
            batchId: batch.id,
          },
        },
      });

      if (batchBalance) {
        await tx.inventoryBatchBalance.update({
          where: { id: batchBalance.id },
          data: {
            onHandQuantity: batchBalance.onHandQuantity.plus(qty),
            version: { increment: 1 },
          },
        });
      } else {
        await tx.inventoryBatchBalance.create({
          data: {
            clinicId: c.clinicId,
            batchId: batch.id,
            productId: input.productId,
            locationId: input.locationId,
            onHandQuantity: qty,
          },
        });
      }

      if (batch.status === 'DEPLETED') {
        await tx.inventoryBatch.update({
          where: { id: batch.id },
          data: { status: 'AVAILABLE', version: { increment: 1 } },
        });
      }

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'inventory.stock.receive_batch',
          category: 'PLATFORM',
          targetType: 'InventoryStockMovement',
          targetId: movement.id,
          outcome: 'SUCCESS',
          metadata: {
            batchId: batch.id,
            batchNumber: batch.batchNumber,
            productId: input.productId,
            locationId: input.locationId,
            quantity: qty.toString(),
          },
        },
        tx,
      );

      return clean(movement);
    });
  }

  async issueBatchStock(proof: VerifiedPrincipal, clinicId: string, input: IssueBatchStockDto) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.stock.issue'], async (tx, c) => {
      const qty = toDecimal(input.quantity, 'quantity');

      if (input.idempotencyKey) {
        const existingMovement = await tx.inventoryStockMovement.findUnique({
          where: {
            clinicId_idempotencyKey: { clinicId: c.clinicId, idempotencyKey: input.idempotencyKey },
          },
        });
        if (existingMovement) {
          if (
            existingMovement.productId !== input.productId ||
            existingMovement.locationId !== input.locationId ||
            existingMovement.batchId !== input.batchId ||
            !existingMovement.quantity.equals(qty.negated()) ||
            existingMovement.reasonCode !== input.reasonCode ||
            existingMovement.movementType !== 'ISSUE'
          ) {
            throw new InventoryError('INVENTORY_IDEMPOTENCY_CONFLICT');
          }
          return clean(existingMovement);
        }
      }

      const product = await tx.inventoryProduct.findFirst({
        where: { id: input.productId, clinicId: c.clinicId },
      });
      if (!product) throw new NotFoundException('PRODUCT_NOT_FOUND');

      const batch = await tx.inventoryBatch.findFirst({
        where: { id: input.batchId, clinicId: c.clinicId },
      });
      if (!batch) throw new NotFoundException('BATCH_NOT_FOUND');
      if (batch.productId !== input.productId) {
        throw new InventoryError('INVENTORY_BATCH_MISMATCH');
      }

      const clinic = await tx.clinic.findUnique({
        where: { id: c.clinicId },
        select: { timezone: true },
      });
      const tz = clinic?.timezone || 'Asia/Aden';

      if (batch.status === 'QUARANTINED') {
        throw new InventoryError('INVENTORY_BATCH_QUARANTINED');
      }
      if (batch.status === 'RECALLED') {
        throw new InventoryError('INVENTORY_BATCH_RECALLED');
      }
      if (batch.status === 'EXPIRED' || isBatchExpired(batch.expirationDate, tz)) {
        throw new InventoryError('INVENTORY_BATCH_EXPIRED');
      }

      const location = await tx.inventoryLocation.findFirst({
        where: { id: input.locationId, clinicId: c.clinicId },
      });
      if (!location) throw new NotFoundException('LOCATION_NOT_FOUND');

      const batchBalance = await tx.inventoryBatchBalance.findUnique({
        where: {
          clinicId_locationId_batchId: {
            clinicId: c.clinicId,
            locationId: input.locationId,
            batchId: batch.id,
          },
        },
      });
      if (!batchBalance || batchBalance.onHandQuantity.lessThan(qty)) {
        throw new InventoryError('INVENTORY_INSUFFICIENT_STOCK');
      }

      const balance = await tx.inventoryBalance.findUnique({
        where: {
          clinicId_productId_locationId: {
            clinicId: c.clinicId,
            productId: input.productId,
            locationId: input.locationId,
          },
        },
      });
      if (!balance || balance.onHandQuantity.lessThan(qty)) {
        throw new InventoryError('INVENTORY_INSUFFICIENT_STOCK');
      }

      const newBal = balance.onHandQuantity.minus(qty);
      const newBatchBal = batchBalance.onHandQuantity.minus(qty);

      const movement = await tx.inventoryStockMovement.create({
        data: {
          clinicId: c.clinicId,
          productId: input.productId,
          locationId: input.locationId,
          batchId: batch.id,
          movementType: 'ISSUE',
          quantity: qty.negated(),
          balanceAfter: newBal,
          reasonCode: input.reasonCode,
          reasonExplanation: input.reasonExplanation || `Batch ${batch.batchNumber} issue`,
          actorMembershipId: c.membershipId,
          idempotencyKey: input.idempotencyKey || null,
        },
      });

      await tx.inventoryBalance.update({
        where: { id: balance.id },
        data: {
          onHandQuantity: newBal,
          lastMovementId: movement.id,
          version: { increment: 1 },
        },
      });

      await tx.inventoryBatchBalance.update({
        where: { id: batchBalance.id },
        data: {
          onHandQuantity: newBatchBal,
          version: { increment: 1 },
        },
      });

      const allBalances = await tx.inventoryBatchBalance.aggregate({
        where: { clinicId: c.clinicId, batchId: batch.id },
        _sum: { onHandQuantity: true },
      });
      const totalRemaining = allBalances._sum.onHandQuantity || new Prisma.Decimal('0.0000');
      if (totalRemaining.isZero()) {
        await tx.inventoryBatch.update({
          where: { id: batch.id },
          data: { status: 'DEPLETED', version: { increment: 1 } },
        });
      }

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'inventory.stock.issue_batch',
          category: 'PLATFORM',
          targetType: 'InventoryStockMovement',
          targetId: movement.id,
          outcome: 'SUCCESS',
          metadata: {
            batchId: batch.id,
            productId: input.productId,
            locationId: input.locationId,
            quantity: qty.negated().toString(),
            reasonCode: input.reasonCode,
          },
        },
        tx,
      );

      return clean(movement);
    });
  }

  async transferBatchStock(proof: VerifiedPrincipal, clinicId: string, input: TransferBatchStockDto) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.stock.transfer'], async (tx, c) => {
      if (input.sourceLocationId === input.targetLocationId) {
        throw new InventoryError('INVENTORY_SAME_LOCATION_TRANSFER');
      }

      const qty = toDecimal(input.quantity, 'quantity');

      if (input.idempotencyKey) {
        const existingOut = await tx.inventoryStockMovement.findUnique({
          where: {
            clinicId_idempotencyKey: { clinicId: c.clinicId, idempotencyKey: `${input.idempotencyKey}:out` },
          },
        });
        if (existingOut) {
          if (
            existingOut.productId !== input.productId ||
            existingOut.locationId !== input.sourceLocationId ||
            existingOut.batchId !== input.batchId ||
            !existingOut.quantity.equals(qty.negated())
          ) {
            throw new InventoryError('INVENTORY_IDEMPOTENCY_CONFLICT');
          }
          const existingIn = await tx.inventoryStockMovement.findUnique({
            where: {
              clinicId_idempotencyKey: { clinicId: c.clinicId, idempotencyKey: `${input.idempotencyKey}:in` },
            },
          });
          return clean({ transferOut: existingOut, transferIn: existingIn });
        }
      }

      const product = await tx.inventoryProduct.findFirst({
        where: { id: input.productId, clinicId: c.clinicId },
      });
      if (!product) throw new NotFoundException('PRODUCT_NOT_FOUND');

      const batch = await tx.inventoryBatch.findFirst({
        where: { id: input.batchId, clinicId: c.clinicId },
      });
      if (!batch) throw new NotFoundException('BATCH_NOT_FOUND');
      if (batch.productId !== input.productId) {
        throw new InventoryError('INVENTORY_BATCH_MISMATCH');
      }

      if (batch.status === 'RECALLED') {
        throw new InventoryError('INVENTORY_BATCH_RECALLED');
      }

      const [sourceLoc, targetLoc] = await Promise.all([
        tx.inventoryLocation.findFirst({ where: { id: input.sourceLocationId, clinicId: c.clinicId } }),
        tx.inventoryLocation.findFirst({ where: { id: input.targetLocationId, clinicId: c.clinicId } }),
      ]);
      if (!sourceLoc) throw new NotFoundException('SOURCE_LOCATION_NOT_FOUND');
      if (!targetLoc) throw new NotFoundException('TARGET_LOCATION_NOT_FOUND');

      const sourceBatchBal = await tx.inventoryBatchBalance.findUnique({
        where: {
          clinicId_locationId_batchId: {
            clinicId: c.clinicId,
            locationId: input.sourceLocationId,
            batchId: batch.id,
          },
        },
      });
      if (!sourceBatchBal || sourceBatchBal.onHandQuantity.lessThan(qty)) {
        throw new InventoryError('INVENTORY_INSUFFICIENT_STOCK');
      }

      const sourceBal = await tx.inventoryBalance.findUnique({
        where: {
          clinicId_productId_locationId: {
            clinicId: c.clinicId,
            productId: input.productId,
            locationId: input.sourceLocationId,
          },
        },
      });
      if (!sourceBal || sourceBal.onHandQuantity.lessThan(qty)) {
        throw new InventoryError('INVENTORY_INSUFFICIENT_STOCK');
      }

      let targetBal = await tx.inventoryBalance.findUnique({
        where: {
          clinicId_productId_locationId: {
            clinicId: c.clinicId,
            productId: input.productId,
            locationId: input.targetLocationId,
          },
        },
      });
      const targetPrev = targetBal ? targetBal.onHandQuantity : new Prisma.Decimal('0.0000');
      const targetNewBal = targetPrev.plus(qty);
      const sourceNewBal = sourceBal.onHandQuantity.minus(qty);

      const outKey = input.idempotencyKey ? `${input.idempotencyKey}:out` : null;
      const transferOut = await tx.inventoryStockMovement.create({
        data: {
          clinicId: c.clinicId,
          productId: input.productId,
          locationId: input.sourceLocationId,
          sourceLocationId: input.targetLocationId,
          batchId: batch.id,
          movementType: 'TRANSFER_OUT',
          quantity: qty.negated(),
          balanceAfter: sourceNewBal,
          reasonCode: 'INTERNAL_TRANSFER',
          reasonExplanation: input.reasonExplanation || `Batch ${batch.batchNumber} transfer to ${targetLoc.code}`,
          actorMembershipId: c.membershipId,
          idempotencyKey: outKey,
        },
      });

      await tx.inventoryBalance.update({
        where: { id: sourceBal.id },
        data: {
          onHandQuantity: sourceNewBal,
          lastMovementId: transferOut.id,
          version: { increment: 1 },
        },
      });

      await tx.inventoryBatchBalance.update({
        where: { id: sourceBatchBal.id },
        data: {
          onHandQuantity: sourceBatchBal.onHandQuantity.minus(qty),
          version: { increment: 1 },
        },
      });

      const inKey = input.idempotencyKey ? `${input.idempotencyKey}:in` : null;
      const transferIn = await tx.inventoryStockMovement.create({
        data: {
          clinicId: c.clinicId,
          productId: input.productId,
          locationId: input.targetLocationId,
          sourceLocationId: input.sourceLocationId,
          batchId: batch.id,
          movementType: 'TRANSFER_IN',
          quantity: qty,
          balanceAfter: targetNewBal,
          reasonCode: 'INTERNAL_TRANSFER',
          reasonExplanation: input.reasonExplanation || `Batch ${batch.batchNumber} transfer from ${sourceLoc.code}`,
          actorMembershipId: c.membershipId,
          idempotencyKey: inKey,
        },
      });

      if (targetBal) {
        await tx.inventoryBalance.update({
          where: { id: targetBal.id },
          data: {
            onHandQuantity: targetNewBal,
            lastMovementId: transferIn.id,
            version: { increment: 1 },
          },
        });
      } else {
        await tx.inventoryBalance.create({
          data: {
            clinicId: c.clinicId,
            productId: input.productId,
            locationId: input.targetLocationId,
            onHandQuantity: targetNewBal,
            lastMovementId: transferIn.id,
          },
        });
      }

      let targetBatchBal = await tx.inventoryBatchBalance.findUnique({
        where: {
          clinicId_locationId_batchId: {
            clinicId: c.clinicId,
            locationId: input.targetLocationId,
            batchId: batch.id,
          },
        },
      });

      if (targetBatchBal) {
        await tx.inventoryBatchBalance.update({
          where: { id: targetBatchBal.id },
          data: {
            onHandQuantity: targetBatchBal.onHandQuantity.plus(qty),
            version: { increment: 1 },
          },
        });
      } else {
        await tx.inventoryBatchBalance.create({
          data: {
            clinicId: c.clinicId,
            batchId: batch.id,
            productId: input.productId,
            locationId: input.targetLocationId,
            onHandQuantity: qty,
          },
        });
      }

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'inventory.stock.transfer_batch',
          category: 'PLATFORM',
          targetType: 'InventoryStockMovement',
          targetId: transferOut.id,
          outcome: 'SUCCESS',
          metadata: {
            batchId: batch.id,
            productId: input.productId,
            sourceLocationId: input.sourceLocationId,
            targetLocationId: input.targetLocationId,
            quantity: qty.toString(),
          },
        },
        tx,
      );

      return clean({ transferOut, transferIn });
    });
  }

  // ---------------------------------------------------------------------------
  // Clinical Consumption & Consent Gate
  // ---------------------------------------------------------------------------

  async recordClinicalConsumption(
    proof: VerifiedPrincipal,
    clinicId: string,
    input: RecordClinicalConsumptionDto,
  ) {
    return this.database.withClinicContext(
      proof,
      clinicId,
      ['clinical.inventory-consumption.record'],
      async (tx, c) => {
        const qty = toDecimal(input.quantity, 'quantity');
        const wasteQty = input.wasteQuantity
          ? toDecimal(input.wasteQuantity, 'wasteQuantity', { allowZero: true })
          : new Prisma.Decimal('0.0000');
        const totalDeduction = qty.plus(wasteQty);

        if (input.idempotencyKey) {
          const existing = await tx.inventoryClinicalConsumption.findUnique({
            where: {
              clinicId_idempotencyKey: {
                clinicId: c.clinicId,
                idempotencyKey: input.idempotencyKey,
              },
            },
          });
          if (existing) {
            if (
              existing.procedureExecutionId !== input.procedureExecutionId ||
              existing.productId !== input.productId ||
              existing.batchId !== input.batchId ||
              existing.locationId !== input.locationId ||
              !existing.quantity.equals(qty) ||
              !existing.wasteQuantity.equals(wasteQty)
            ) {
              throw new InventoryError('INVENTORY_IDEMPOTENCY_CONFLICT');
            }
            return clean(existing);
          }
        }

        const procedure = await tx.procedureExecution.findFirst({
          where: { id: input.procedureExecutionId, clinicId: c.clinicId },
        });
        if (!procedure) {
          throw new InventoryError('INVENTORY_PROCEDURE_NOT_FOUND');
        }

        if (
          procedure.clinicianMembershipId !== c.membershipId &&
          c.role !== 'CLINIC_OWNER' &&
          c.role !== 'CLINIC_ADMIN'
        ) {
          throw new InventoryError('INVENTORY_CLINICIAN_MISMATCH');
        }

        const consent = await this.consentEligibility.check(
          c.clinicId,
          procedure.patientId,
          procedure.id,
          tx,
        );
        if (!consent.eligible) {
          throw new InventoryError('INVENTORY_CONSENT_REQUIRED');
        }

        const product = await tx.inventoryProduct.findFirst({
          where: { id: input.productId, clinicId: c.clinicId },
        });
        if (!product) throw new NotFoundException('PRODUCT_NOT_FOUND');

        const batch = await tx.inventoryBatch.findFirst({
          where: { id: input.batchId, clinicId: c.clinicId },
        });
        if (!batch) throw new NotFoundException('BATCH_NOT_FOUND');
        if (batch.productId !== input.productId) {
          throw new InventoryError('INVENTORY_BATCH_MISMATCH');
        }

        const clinic = await tx.clinic.findUnique({
          where: { id: c.clinicId },
          select: { timezone: true },
        });
        const tz = clinic?.timezone || 'Asia/Aden';

        if (batch.status === 'QUARANTINED') {
          throw new InventoryError('INVENTORY_BATCH_QUARANTINED');
        }
        if (batch.status === 'RECALLED') {
          throw new InventoryError('INVENTORY_BATCH_RECALLED');
        }
        if (batch.status === 'EXPIRED' || isBatchExpired(batch.expirationDate, tz)) {
          throw new InventoryError('INVENTORY_BATCH_EXPIRED');
        }
        if (batch.status === 'DEPLETED') {
          throw new InventoryError('INVENTORY_BATCH_DEPLETED');
        }

        const location = await tx.inventoryLocation.findFirst({
          where: { id: input.locationId, clinicId: c.clinicId },
        });
        if (!location) throw new NotFoundException('LOCATION_NOT_FOUND');

        const batchBalance = await tx.inventoryBatchBalance.findUnique({
          where: {
            clinicId_locationId_batchId: {
              clinicId: c.clinicId,
              locationId: input.locationId,
              batchId: batch.id,
            },
          },
        });
        if (!batchBalance || batchBalance.onHandQuantity.lessThan(totalDeduction)) {
          throw new InventoryError('INVENTORY_INSUFFICIENT_STOCK');
        }

        const balance = await tx.inventoryBalance.findUnique({
          where: {
            clinicId_productId_locationId: {
              clinicId: c.clinicId,
              productId: input.productId,
              locationId: input.locationId,
            },
          },
        });
        if (!balance || balance.onHandQuantity.lessThan(totalDeduction)) {
          throw new InventoryError('INVENTORY_INSUFFICIENT_STOCK');
        }

        const newBal = balance.onHandQuantity.minus(totalDeduction);
        const newBatchBal = batchBalance.onHandQuantity.minus(totalDeduction);

        const movement = await tx.inventoryStockMovement.create({
          data: {
            clinicId: c.clinicId,
            productId: input.productId,
            locationId: input.locationId,
            batchId: batch.id,
            movementType: 'ISSUE',
            quantity: totalDeduction.negated(),
            balanceAfter: newBal,
            reasonCode: 'CLINICAL_USE',
            reasonExplanation: `Clinical consumption for procedure ${procedure.id}` + (input.notes ? `: ${input.notes}` : ''),
            actorMembershipId: c.membershipId,
            idempotencyKey: input.idempotencyKey ? `${input.idempotencyKey}:mov` : null,
          },
        });

        await tx.inventoryBalance.update({
          where: { id: balance.id },
          data: {
            onHandQuantity: newBal,
            lastMovementId: movement.id,
            version: { increment: 1 },
          },
        });

        await tx.inventoryBatchBalance.update({
          where: { id: batchBalance.id },
          data: {
            onHandQuantity: newBatchBal,
            version: { increment: 1 },
          },
        });

        const consumption = await tx.inventoryClinicalConsumption.create({
          data: {
            clinicId: c.clinicId,
            procedureExecutionId: procedure.id,
            productId: input.productId,
            batchId: batch.id,
            locationId: input.locationId,
            quantity: qty,
            wasteQuantity: wasteQty,
            unit: input.unit || product.unit,
            status: 'RECORDED',
            notes: input.notes?.trim() || null,
            movementId: movement.id,
            actorMembershipId: c.membershipId,
            idempotencyKey: input.idempotencyKey || null,
          },
        });

        const allBalances = await tx.inventoryBatchBalance.aggregate({
          where: { clinicId: c.clinicId, batchId: batch.id },
          _sum: { onHandQuantity: true },
        });
        const totalRemaining = allBalances._sum.onHandQuantity || new Prisma.Decimal('0.0000');
        if (totalRemaining.isZero()) {
          await tx.inventoryBatch.update({
            where: { id: batch.id },
            data: { status: 'DEPLETED', version: { increment: 1 } },
          });
        }

        await this.audit.record(
          {
            clinicId: c.clinicId,
            actorId: c.userId,
            action: 'inventory.clinical_consumption.record',
            category: 'PLATFORM',
            targetType: 'InventoryClinicalConsumption',
            targetId: consumption.id,
            outcome: 'SUCCESS',
            metadata: {
              procedureExecutionId: procedure.id,
              batchId: batch.id,
              batchNumber: batch.batchNumber,
              productId: input.productId,
              quantity: qty.toString(),
              wasteQuantity: wasteQty.toString(),
            },
          },
          tx,
        );

        return clean(consumption);
      },
    );
  }

  async voidClinicalConsumption(
    proof: VerifiedPrincipal,
    clinicId: string,
    consumptionId: string,
    input: VoidClinicalConsumptionDto,
  ) {
    return this.database.withClinicContext(
      proof,
      clinicId,
      ['clinical.inventory-consumption.record'],
      async (tx, c) => {
        if (!input.reason || input.reason.trim().length < 3) {
          throw new BadRequestException('Void reason of at least 3 characters is required');
        }

        const consumption = await tx.inventoryClinicalConsumption.findFirst({
          where: { id: consumptionId, clinicId: c.clinicId },
          include: { batch: true },
        });
        if (!consumption) {
          throw new NotFoundException('CONSUMPTION_NOT_FOUND');
        }

        if (consumption.status === 'VOIDED') {
          throw new InventoryError('INVENTORY_CONSUMPTION_ALREADY_VOIDED');
        }

        const restockAction = input.restockAction || 'NO_RESTOCK';
        let returnMovement: { id: string; quantity: Prisma.Decimal } | null = null;

        if (restockAction === 'RESTOCK_UNOPENED') {
          const clinic = await tx.clinic.findUnique({
            where: { id: c.clinicId },
            select: { timezone: true },
          });
          const tz = clinic?.timezone || 'Asia/Aden';

          if (consumption.batch.status === 'RECALLED') {
            throw new InventoryError('INVENTORY_BATCH_RECALLED');
          }
          if (
            consumption.batch.status === 'EXPIRED' ||
            isBatchExpired(consumption.batch.expirationDate, tz)
          ) {
            throw new InventoryError('INVENTORY_BATCH_EXPIRED');
          }

          let restockQty = consumption.quantity;
          if (input.restockQuantity) {
            const parsed = toDecimal(input.restockQuantity, 'restockQuantity');
            if (parsed.greaterThan(consumption.quantity)) {
              throw new BadRequestException('Restock quantity cannot exceed original administered quantity');
            }
            restockQty = parsed;
          }

          if (restockQty.greaterThan(new Prisma.Decimal('0.0000'))) {
            const balance = await tx.inventoryBalance.findUnique({
              where: {
                clinicId_productId_locationId: {
                  clinicId: c.clinicId,
                  productId: consumption.productId,
                  locationId: consumption.locationId,
                },
              },
            });
            const prevBal = balance ? balance.onHandQuantity : new Prisma.Decimal('0.0000');
            const newBal = prevBal.plus(restockQty);

            const m = await tx.inventoryStockMovement.create({
              data: {
                clinicId: c.clinicId,
                productId: consumption.productId,
                locationId: consumption.locationId,
                batchId: consumption.batchId,
                movementType: 'RECEIPT',
                quantity: restockQty,
                balanceAfter: newBal,
                reasonCode: 'RETURN',
                reasonExplanation: `Void clinical consumption (restock unopened): ${input.reason.trim()}`,
                actorMembershipId: c.membershipId,
                idempotencyKey: input.idempotencyKey ? `${input.idempotencyKey}:void` : null,
              },
            });
            returnMovement = m;

            if (balance) {
              await tx.inventoryBalance.update({
                where: { id: balance.id },
                data: {
                  onHandQuantity: newBal,
                  lastMovementId: m.id,
                  version: { increment: 1 },
                },
              });
            } else {
              await tx.inventoryBalance.create({
                data: {
                  clinicId: c.clinicId,
                  productId: consumption.productId,
                  locationId: consumption.locationId,
                  onHandQuantity: newBal,
                  lastMovementId: m.id,
                },
              });
            }

            const batchBalance = await tx.inventoryBatchBalance.findUnique({
              where: {
                clinicId_locationId_batchId: {
                  clinicId: c.clinicId,
                  locationId: consumption.locationId,
                  batchId: consumption.batchId,
                },
              },
            });

            if (batchBalance) {
              await tx.inventoryBatchBalance.update({
                where: { id: batchBalance.id },
                data: {
                  onHandQuantity: batchBalance.onHandQuantity.plus(restockQty),
                  version: { increment: 1 },
                },
              });
            } else {
              await tx.inventoryBatchBalance.create({
                data: {
                  clinicId: c.clinicId,
                  batchId: consumption.batchId,
                  productId: consumption.productId,
                  locationId: consumption.locationId,
                  onHandQuantity: restockQty,
                },
              });
            }

            if (
              consumption.batch.status === 'DEPLETED' &&
              !isBatchExpired(consumption.batch.expirationDate, tz)
            ) {
              await tx.inventoryBatch.update({
                where: { id: consumption.batch.id },
                data: { status: 'AVAILABLE', version: { increment: 1 } },
              });
            }
          }
        }

        const voided = await tx.inventoryClinicalConsumption.update({
          where: { id: consumption.id },
          data: {
            status: 'VOIDED',
            voidedAt: new Date(),
            voidReason: input.reason.trim(),
            voidedByUserId: c.userId,
            voidMovementId: returnMovement?.id || null,
            version: { increment: 1 },
          },
        });

        await this.audit.record(
          {
            clinicId: c.clinicId,
            actorId: c.userId,
            action: 'inventory.clinical_consumption.void',
            category: 'PLATFORM',
            targetType: 'InventoryClinicalConsumption',
            targetId: consumption.id,
            outcome: 'SUCCESS',
            metadata: {
              reason: input.reason.trim(),
              restockAction,
              restoredQuantity: returnMovement ? returnMovement.quantity.toString() : '0.0000',
            },
          },
          tx,
        );

        return clean(voided);
      },
    );
  }

  async listClinicalConsumptions(
    proof: VerifiedPrincipal,
    clinicId: string,
    q: ClinicalConsumptionListQuery,
  ) {
    return this.database.withClinicContext(
      proof,
      clinicId,
      ['inventory.clinical-consumption.read'],
      async (tx, c) => {
        const take = Math.min(Math.max(q.limit ?? 50, 1), 100);
        const where: Prisma.InventoryClinicalConsumptionWhereInput = {
          clinicId: c.clinicId,
          ...(q.procedureExecutionId ? { procedureExecutionId: q.procedureExecutionId } : {}),
          ...(q.productId ? { productId: q.productId } : {}),
          ...(q.batchId ? { batchId: q.batchId } : {}),
        };

        const rows = await tx.inventoryClinicalConsumption.findMany({
          where,
          take: take + 1,
          ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
          orderBy: { createdAt: 'desc' },
          include: {
            product: { select: { id: true, sku: true, nameAr: true, unit: true } },
            batch: { select: { id: true, batchNumber: true, expirationDate: true, status: true } },
            location: { select: { id: true, code: true, nameAr: true } },
            actor: { select: { user: { select: { name: true } } } },
          },
        });

        const hasMore = rows.length > take;
        const items = hasMore ? rows.slice(0, take) : rows;
        const nextCursor = hasMore ? items[items.length - 1].id : null;

        const canViewClinical = c.permissions.includes('clinical.procedures.read');
        const sanitized = items.map((row) => {
          if (!canViewClinical) {
            return {
              id: row.id,
              procedureExecutionId: row.procedureExecutionId,
              productId: row.productId,
              product: row.product,
              batchId: row.batchId,
              batch: row.batch,
              locationId: row.locationId,
              location: row.location,
              quantity: row.quantity.toString(),
              wasteQuantity: row.wasteQuantity.toString(),
              unit: row.unit,
              status: row.status,
              createdAt: row.createdAt,
            };
          }
          return row;
        });

        return clean({ items: sanitized, nextCursor });
      },
    );
  }

  async getProcedureConsumptions(
    proof: VerifiedPrincipal,
    clinicId: string,
    procedureExecutionId: string,
  ) {
    return this.database.withClinicContext(
      proof,
      clinicId,
      ['inventory.clinical-consumption.read'],
      async (tx, c) => {
        const rows = await tx.inventoryClinicalConsumption.findMany({
          where: { clinicId: c.clinicId, procedureExecutionId },
          orderBy: { createdAt: 'desc' },
          include: {
            product: { select: { id: true, sku: true, nameAr: true, unit: true } },
            batch: { select: { id: true, batchNumber: true, expirationDate: true, status: true } },
            location: { select: { id: true, code: true, nameAr: true } },
            actor: { select: { user: { select: { name: true } } } },
          },
        });

        return clean(rows);
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Step 4.3: Suppliers Management
  // ---------------------------------------------------------------------------

  async createSupplier(proof: VerifiedPrincipal, clinicId: string, input: CreateSupplierDto) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.suppliers.manage'], async (tx, c) => {
      const code = input.code.trim().toUpperCase();
      const nameAr = input.nameAr.trim();
      if (code.length < 2) throw new BadRequestException('Supplier code must be at least 2 characters');
      if (nameAr.length < 2) throw new BadRequestException('Supplier nameAr must be at least 2 characters');

      const existing = await tx.inventorySupplier.findFirst({
        where: { clinicId: c.clinicId, code },
      });
      if (existing) throw new InventoryError('INVENTORY_DUPLICATE_SUPPLIER_CODE');

      const supplier = await tx.inventorySupplier.create({
        data: {
          clinicId: c.clinicId,
          code,
          nameAr,
          nameEn: input.nameEn?.trim() || null,
          contactPerson: input.contactPerson?.trim() || null,
          email: input.email?.trim() || null,
          phone: input.phone?.trim() || null,
          address: input.address?.trim() || null,
          taxNumber: input.taxNumber?.trim() || null,
          commercialRegister: input.commercialRegister?.trim() || null,
          notes: input.notes?.trim() || null,
        },
      });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'inventory.supplier.create',
          category: 'PLATFORM',
          targetType: 'InventorySupplier',
          targetId: supplier.id,
          outcome: 'SUCCESS',
          metadata: { code, nameAr },
        },
        tx,
      );

      return clean(supplier);
    });
  }

  async updateSupplier(
    proof: VerifiedPrincipal,
    clinicId: string,
    supplierId: string,
    input: UpdateSupplierDto,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.suppliers.manage'], async (tx, c) => {
      const existing = await tx.inventorySupplier.findFirst({
        where: { id: supplierId, clinicId: c.clinicId },
      });
      if (!existing) throw new InventoryError('INVENTORY_SUPPLIER_NOT_FOUND');

      if (existing.version !== input.expectedVersion) {
        throw new InventoryError('INVENTORY_CONCURRENT_MODIFICATION');
      }

      const updated = await tx.inventorySupplier.update({
        where: { id: supplierId },
        data: {
          nameAr: input.nameAr ? input.nameAr.trim() : undefined,
          nameEn: input.nameEn !== undefined ? (input.nameEn?.trim() || null) : undefined,
          contactPerson: input.contactPerson !== undefined ? (input.contactPerson?.trim() || null) : undefined,
          email: input.email !== undefined ? (input.email?.trim() || null) : undefined,
          phone: input.phone !== undefined ? (input.phone?.trim() || null) : undefined,
          address: input.address !== undefined ? (input.address?.trim() || null) : undefined,
          taxNumber: input.taxNumber !== undefined ? (input.taxNumber?.trim() || null) : undefined,
          commercialRegister: input.commercialRegister !== undefined ? (input.commercialRegister?.trim() || null) : undefined,
          status: input.status,
          notes: input.notes !== undefined ? (input.notes?.trim() || null) : undefined,
          version: { increment: 1 },
        },
      });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'inventory.supplier.update',
          category: 'PLATFORM',
          targetType: 'InventorySupplier',
          targetId: updated.id,
          outcome: 'SUCCESS',
          metadata: { version: updated.version },
        },
        tx,
      );

      return clean(updated);
    });
  }

  async getSupplier(proof: VerifiedPrincipal, clinicId: string, supplierId: string) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.suppliers.read'], async (tx, c) => {
      const supplier = await tx.inventorySupplier.findFirst({
        where: { id: supplierId, clinicId: c.clinicId },
        include: {
          _count: {
            select: { purchaseOrders: true, batches: true },
          },
        },
      });
      if (!supplier) throw new InventoryError('INVENTORY_SUPPLIER_NOT_FOUND');
      return clean(supplier);
    });
  }

  async listSuppliers(proof: VerifiedPrincipal, clinicId: string, q: SupplierListQuery) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.suppliers.read'], async (tx, c) => {
      const take = Math.min(Math.max(q.limit ?? 50, 1), 100);
      const where: Prisma.InventorySupplierWhereInput = {
        clinicId: c.clinicId,
        ...(q.status ? { status: q.status } : {}),
        ...(q.search
          ? {
              OR: [
                { code: { contains: q.search.trim(), mode: 'insensitive' } },
                { nameAr: { contains: q.search.trim(), mode: 'insensitive' } },
                { nameEn: { contains: q.search.trim(), mode: 'insensitive' } },
                { contactPerson: { contains: q.search.trim(), mode: 'insensitive' } },
                { phone: { contains: q.search.trim(), mode: 'insensitive' } },
              ],
            }
          : {}),
      };

      const items = await tx.inventorySupplier.findMany({
        where,
        take: take + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      });

      let nextCursor: string | undefined;
      if (items.length > take) {
        const next = items.pop()!;
        nextCursor = next.id;
      }

      return clean({ items, nextCursor });
    });
  }

  // ---------------------------------------------------------------------------
  // Step 4.3: Purchase Orders
  // ---------------------------------------------------------------------------

  async createPurchaseOrder(proof: VerifiedPrincipal, clinicId: string, input: CreatePurchaseOrderDto) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.purchase-orders.create'], async (tx, c) => {
      if (!input.lines || input.lines.length === 0) {
        throw new BadRequestException('Purchase order must contain at least one line item');
      }

      const supplier = await tx.inventorySupplier.findFirst({
        where: { id: input.supplierId, clinicId: c.clinicId },
      });
      if (!supplier) throw new InventoryError('INVENTORY_SUPPLIER_NOT_FOUND');
      if (supplier.status !== 'ACTIVE') throw new InventoryError('INVENTORY_SUPPLIER_INACTIVE');

      const location = await tx.inventoryLocation.findFirst({
        where: { id: input.destinationLocationId, clinicId: c.clinicId },
      });
      if (!location) throw new NotFoundException('LOCATION_NOT_FOUND');
      if (!location.isActive) throw new BadRequestException('Destination location is inactive');

      // Atomic order number generation
      const counter = await tx.inventoryPurchaseOrderCounter.upsert({
        where: { clinicId: c.clinicId },
        create: { clinicId: c.clinicId, lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
        select: { lastNumber: true },
      });
      const orderNumber = `PO-${String(counter.lastNumber).padStart(6, '0')}`;

      // Validate products and compute exact line totals
      let subtotal = new Prisma.Decimal('0.0000');
      let taxAmount = new Prisma.Decimal('0.0000');

      const linesData = [];
      let lineNumber = 1;

      for (const line of input.lines) {
        const product = await tx.inventoryProduct.findFirst({
          where: { id: line.productId, clinicId: c.clinicId },
        });
        if (!product) throw new NotFoundException(`Product ${line.productId} not found`);
        if (!product.isActive) throw new BadRequestException(`Product ${product.sku} is inactive`);

        const orderedQty = toDecimal(line.orderedQuantity, `lines[${lineNumber - 1}].orderedQuantity`);
        const unitCost = toDecimal(line.unitCost, `lines[${lineNumber - 1}].unitCost`, { allowZero: true });
        const taxRate = line.taxRate ? toDecimal(line.taxRate, `lines[${lineNumber - 1}].taxRate`, { allowZero: true }) : new Prisma.Decimal('0.1500');

        const lineSubtotal = orderedQty.mul(unitCost);
        const lineTax = lineSubtotal.mul(taxRate);
        const lineTotal = lineSubtotal.plus(lineTax);

        subtotal = subtotal.plus(lineSubtotal);
        taxAmount = taxAmount.plus(lineTax);

        linesData.push({
          clinicId: c.clinicId,
          lineNumber,
          productId: product.id,
          orderedQuantity: orderedQty,
          unitCost,
          taxRate,
          totalCost: lineTotal,
          notes: line.notes?.trim() || null,
        });

        lineNumber++;
      }

      const totalAmount = subtotal.plus(taxAmount);

      const createdPo = await tx.inventoryPurchaseOrder.create({
        data: {
          clinicId: c.clinicId,
          orderNumber,
          supplierId: supplier.id,
          destinationLocationId: location.id,
          status: 'DRAFT',
          orderDate: new Date(),
          expectedDeliveryDate: input.expectedDeliveryDate ? validateDateString(input.expectedDeliveryDate, 'expectedDeliveryDate') : null,
          currency: input.currency.trim().toUpperCase(),
          subtotal,
          taxAmount,
          totalAmount,
          notes: input.notes?.trim() || null,
          createdByMembershipId: c.membershipId,
        },
      });

      if (linesData.length > 0) {
        await tx.inventoryPurchaseOrderLine.createMany({
          data: linesData.map((line) => ({
            ...line,
            purchaseOrderId: createdPo.id,
          })),
        });
      }

      const po = await tx.inventoryPurchaseOrder.findFirstOrThrow({
        where: { id: createdPo.id, clinicId: c.clinicId },
        include: {
          supplier: { select: { id: true, code: true, nameAr: true } },
          destinationLocation: { select: { id: true, code: true, nameAr: true } },
          lines: {
            include: {
              product: { select: { id: true, sku: true, nameAr: true, unit: true, requiresBatchTracking: true } },
            },
            orderBy: { lineNumber: 'asc' },
          },
        },
      });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'inventory.purchase_order.create',
          category: 'PLATFORM',
          targetType: 'InventoryPurchaseOrder',
          targetId: po.id,
          outcome: 'SUCCESS',
          metadata: { orderNumber, totalAmount: totalAmount.toString(), linesCount: linesData.length },
        },
        tx,
      );

      return clean(po);
    });
  }

  async updatePurchaseOrder(
    proof: VerifiedPrincipal,
    clinicId: string,
    poId: string,
    input: UpdatePurchaseOrderDto,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.purchase-orders.create'], async (tx, c) => {
      const existing = await tx.inventoryPurchaseOrder.findFirst({
        where: { id: poId, clinicId: c.clinicId },
        include: { lines: true },
      });
      if (!existing) throw new InventoryError('INVENTORY_PURCHASE_ORDER_NOT_FOUND');
      if (existing.status !== 'DRAFT') throw new InventoryError('INVENTORY_PURCHASE_ORDER_NOT_DRAFT');
      if (existing.version !== input.expectedVersion) throw new InventoryError('INVENTORY_CONCURRENT_MODIFICATION');

      let subtotal = existing.subtotal;
      let taxAmount = existing.taxAmount;
      let totalAmount = existing.totalAmount;

      if (input.lines && input.lines.length > 0) {
        // Delete old lines
        await tx.inventoryPurchaseOrderLine.deleteMany({
          where: { clinicId: c.clinicId, purchaseOrderId: poId },
        });

        subtotal = new Prisma.Decimal('0.0000');
        taxAmount = new Prisma.Decimal('0.0000');
        let lineNumber = 1;

        for (const line of input.lines) {
          const product = await tx.inventoryProduct.findFirst({
            where: { id: line.productId, clinicId: c.clinicId },
          });
          if (!product) throw new NotFoundException(`Product ${line.productId} not found`);

          const orderedQty = toDecimal(line.orderedQuantity, `lines[${lineNumber - 1}].orderedQuantity`);
          const unitCost = toDecimal(line.unitCost, `lines[${lineNumber - 1}].unitCost`, { allowZero: true });
          const taxRate = line.taxRate ? toDecimal(line.taxRate, `lines[${lineNumber - 1}].taxRate`, { allowZero: true }) : new Prisma.Decimal('0.1500');

          const lineSubtotal = orderedQty.mul(unitCost);
          const lineTax = lineSubtotal.mul(taxRate);
          const lineTotal = lineSubtotal.plus(lineTax);

          subtotal = subtotal.plus(lineSubtotal);
          taxAmount = taxAmount.plus(lineTax);

          await tx.inventoryPurchaseOrderLine.create({
            data: {
              clinicId: c.clinicId,
              purchaseOrderId: poId,
              lineNumber,
              productId: product.id,
              orderedQuantity: orderedQty,
              unitCost,
              taxRate,
              totalCost: lineTotal,
              notes: line.notes?.trim() || null,
            },
          });
          lineNumber++;
        }

        totalAmount = subtotal.plus(taxAmount);
      }

      const updated = await tx.inventoryPurchaseOrder.update({
        where: { id: poId },
        data: {
          supplierId: input.supplierId,
          destinationLocationId: input.destinationLocationId,
          currency: input.currency ? input.currency.trim().toUpperCase() : undefined,
          expectedDeliveryDate: input.expectedDeliveryDate ? validateDateString(input.expectedDeliveryDate, 'expectedDeliveryDate') : undefined,
          notes: input.notes !== undefined ? (input.notes?.trim() || null) : undefined,
          subtotal,
          taxAmount,
          totalAmount,
          version: { increment: 1 },
        },
        include: {
          supplier: { select: { id: true, code: true, nameAr: true } },
          destinationLocation: { select: { id: true, code: true, nameAr: true } },
          lines: {
            include: {
              product: { select: { id: true, sku: true, nameAr: true, unit: true, requiresBatchTracking: true } },
            },
            orderBy: { lineNumber: 'asc' },
          },
        },
      });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'inventory.purchase_order.update',
          category: 'PLATFORM',
          targetType: 'InventoryPurchaseOrder',
          targetId: updated.id,
          outcome: 'SUCCESS',
          metadata: { version: updated.version, totalAmount: totalAmount.toString() },
        },
        tx,
      );

      return clean(updated);
    });
  }

  async submitPurchaseOrder(
    proof: VerifiedPrincipal,
    clinicId: string,
    poId: string,
    input: SubmitPurchaseOrderDto,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.purchase-orders.submit'], async (tx, c) => {
      const existing = await tx.inventoryPurchaseOrder.findFirst({
        where: { id: poId, clinicId: c.clinicId },
      });
      if (!existing) throw new InventoryError('INVENTORY_PURCHASE_ORDER_NOT_FOUND');
      if (existing.status !== 'DRAFT') throw new InventoryError('INVENTORY_PURCHASE_ORDER_NOT_DRAFT');
      if (existing.version !== input.expectedVersion) throw new InventoryError('INVENTORY_CONCURRENT_MODIFICATION');

      const updated = await tx.inventoryPurchaseOrder.update({
        where: { id: poId },
        data: {
          status: 'SUBMITTED',
          notes: input.notes !== undefined ? (input.notes?.trim() || null) : existing.notes,
          version: { increment: 1 },
        },
      });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'inventory.purchase_order.submit',
          category: 'PLATFORM',
          targetType: 'InventoryPurchaseOrder',
          targetId: updated.id,
          outcome: 'SUCCESS',
          metadata: { orderNumber: existing.orderNumber },
        },
        tx,
      );

      return clean(updated);
    });
  }

  async approvePurchaseOrder(
    proof: VerifiedPrincipal,
    clinicId: string,
    poId: string,
    input: ApprovePurchaseOrderDto,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.purchase-orders.approve'], async (tx, c) => {
      const existing = await tx.inventoryPurchaseOrder.findFirst({
        where: { id: poId, clinicId: c.clinicId },
      });
      if (!existing) throw new InventoryError('INVENTORY_PURCHASE_ORDER_NOT_FOUND');
      if (existing.status !== 'SUBMITTED' && existing.status !== 'DRAFT') {
        throw new BadRequestException('Only draft or submitted purchase orders can be approved');
      }
      if (existing.version !== input.expectedVersion) throw new InventoryError('INVENTORY_CONCURRENT_MODIFICATION');

      const updated = await tx.inventoryPurchaseOrder.update({
        where: { id: poId },
        data: {
          status: 'APPROVED',
          approvedByMembershipId: c.membershipId,
          approvedAt: new Date(),
          version: { increment: 1 },
        },
      });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'inventory.purchase_order.approve',
          category: 'PLATFORM',
          targetType: 'InventoryPurchaseOrder',
          targetId: updated.id,
          outcome: 'SUCCESS',
          metadata: { orderNumber: existing.orderNumber, approvedBy: c.membershipId },
        },
        tx,
      );

      return clean(updated);
    });
  }

  async rejectPurchaseOrder(
    proof: VerifiedPrincipal,
    clinicId: string,
    poId: string,
    input: RejectPurchaseOrderDto,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.purchase-orders.approve'], async (tx, c) => {
      if (!input.reason || input.reason.trim().length < 3) {
        throw new BadRequestException('Rejection reason of at least 3 characters is required');
      }

      const existing = await tx.inventoryPurchaseOrder.findFirst({
        where: { id: poId, clinicId: c.clinicId },
      });
      if (!existing) throw new InventoryError('INVENTORY_PURCHASE_ORDER_NOT_FOUND');
      if (existing.status !== 'SUBMITTED' && existing.status !== 'DRAFT') {
        throw new BadRequestException('Only draft or submitted purchase orders can be rejected');
      }
      if (existing.version !== input.expectedVersion) throw new InventoryError('INVENTORY_CONCURRENT_MODIFICATION');

      const updated = await tx.inventoryPurchaseOrder.update({
        where: { id: poId },
        data: {
          status: 'REJECTED',
          rejectionReason: input.reason.trim(),
          closedAt: new Date(),
          version: { increment: 1 },
        },
      });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'inventory.purchase_order.reject',
          category: 'PLATFORM',
          targetType: 'InventoryPurchaseOrder',
          targetId: updated.id,
          outcome: 'SUCCESS',
          metadata: { orderNumber: existing.orderNumber, reason: input.reason.trim() },
        },
        tx,
      );

      return clean(updated);
    });
  }

  async cancelPurchaseOrder(
    proof: VerifiedPrincipal,
    clinicId: string,
    poId: string,
    input: CancelPurchaseOrderDto,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.purchase-orders.cancel'], async (tx, c) => {
      if (!input.reason || input.reason.trim().length < 3) {
        throw new BadRequestException('Cancellation reason of at least 3 characters is required');
      }

      const existing = await tx.inventoryPurchaseOrder.findFirst({
        where: { id: poId, clinicId: c.clinicId },
      });
      if (!existing) throw new InventoryError('INVENTORY_PURCHASE_ORDER_NOT_FOUND');
      if (
        existing.status === 'RECEIVED' ||
        existing.status === 'PARTIALLY_RECEIVED' ||
        existing.status === 'CLOSED'
      ) {
        throw new InventoryError('INVENTORY_PURCHASE_ORDER_CANNOT_CANCEL');
      }
      if (existing.version !== input.expectedVersion) throw new InventoryError('INVENTORY_CONCURRENT_MODIFICATION');

      const updated = await tx.inventoryPurchaseOrder.update({
        where: { id: poId },
        data: {
          status: 'CANCELLED',
          cancellationReason: input.reason.trim(),
          closedAt: new Date(),
          version: { increment: 1 },
        },
      });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'inventory.purchase_order.cancel',
          category: 'PLATFORM',
          targetType: 'InventoryPurchaseOrder',
          targetId: updated.id,
          outcome: 'SUCCESS',
          metadata: { orderNumber: existing.orderNumber, reason: input.reason.trim() },
        },
        tx,
      );

      return clean(updated);
    });
  }

  async getPurchaseOrder(proof: VerifiedPrincipal, clinicId: string, poId: string) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.purchase-orders.read'], async (tx, c) => {
      const po = await tx.inventoryPurchaseOrder.findFirst({
        where: { id: poId, clinicId: c.clinicId },
        include: {
          supplier: true,
          destinationLocation: true,
          createdBy: { select: { id: true, user: { select: { name: true, email: true } } } },
          approvedBy: { select: { id: true, user: { select: { name: true, email: true } } } },
          lines: {
            include: {
              product: { select: { id: true, sku: true, nameAr: true, unit: true, requiresBatchTracking: true } },
            },
            orderBy: { lineNumber: 'asc' },
          },
          goodsReceipts: {
            orderBy: { receiptDate: 'desc' },
            include: {
              lines: true,
            },
          },
        },
      });
      if (!po) throw new InventoryError('INVENTORY_PURCHASE_ORDER_NOT_FOUND');
      return clean(po);
    });
  }

  async listPurchaseOrders(proof: VerifiedPrincipal, clinicId: string, q: PurchaseOrderListQuery) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.purchase-orders.read'], async (tx, c) => {
      const take = Math.min(Math.max(q.limit ?? 50, 1), 100);
      const where: Prisma.InventoryPurchaseOrderWhereInput = {
        clinicId: c.clinicId,
        ...(q.supplierId ? { supplierId: q.supplierId } : {}),
        ...(q.status ? { status: q.status } : {}),
        ...(q.destinationLocationId ? { destinationLocationId: q.destinationLocationId } : {}),
        ...(q.search
          ? {
              OR: [
                { orderNumber: { contains: q.search.trim(), mode: 'insensitive' } },
                { notes: { contains: q.search.trim(), mode: 'insensitive' } },
              ],
            }
          : {}),
      };

      const items = await tx.inventoryPurchaseOrder.findMany({
        where,
        take: take + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
        orderBy: { createdAt: 'desc' },
        include: {
          supplier: { select: { id: true, code: true, nameAr: true } },
          destinationLocation: { select: { id: true, code: true, nameAr: true } },
          _count: { select: { lines: true, goodsReceipts: true } },
        },
      });

      let nextCursor: string | undefined;
      if (items.length > take) {
        const next = items.pop()!;
        nextCursor = next.id;
      }

      return clean({ items, nextCursor });
    });
  }

  // ---------------------------------------------------------------------------
  // Step 4.3: Goods Receiving
  // ---------------------------------------------------------------------------

  async receiveGoods(proof: VerifiedPrincipal, clinicId: string, input: ReceiveGoodsDto) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.goods-receipt.record'], async (tx, c) => {
      if (!input.lines || input.lines.length === 0) {
        throw new BadRequestException('Goods receipt must contain at least one line item');
      }

      const po = await tx.inventoryPurchaseOrder.findFirst({
        where: { id: input.purchaseOrderId, clinicId: c.clinicId },
        include: { lines: { include: { product: true } } },
      });
      if (!po) throw new InventoryError('INVENTORY_PURCHASE_ORDER_NOT_FOUND');
      if (po.status !== 'APPROVED' && po.status !== 'PARTIALLY_RECEIVED') {
        throw new InventoryError('INVENTORY_PURCHASE_ORDER_NOT_APPROVED');
      }

      const destLocId = input.destinationLocationId || po.destinationLocationId;
      const location = await tx.inventoryLocation.findFirst({
        where: { id: destLocId, clinicId: c.clinicId },
      });
      if (!location) throw new NotFoundException('LOCATION_NOT_FOUND');
      if (!location.isActive) throw new BadRequestException('Destination location is inactive');

      // Atomic receipt counter
      const counter = await tx.inventoryGoodsReceiptCounter.upsert({
        where: { clinicId: c.clinicId },
        create: { clinicId: c.clinicId, lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
        select: { lastNumber: true },
      });
      const receiptNumber = `GR-${String(counter.lastNumber).padStart(6, '0')}`;

      const receiptLinesData = [];

      for (const line of input.lines) {
        const poLine = po.lines.find((l) => l.id === line.purchaseOrderLineId);
        if (!poLine) throw new BadRequestException(`Line ${line.purchaseOrderLineId} does not belong to purchase order ${po.orderNumber}`);

        const recvQty = toDecimal(line.receivedQuantity, 'receivedQuantity', { allowZero: true });
        const rejQty = line.rejectedQuantity
          ? toDecimal(line.rejectedQuantity, 'rejectedQuantity', { allowZero: true })
          : new Prisma.Decimal('0.0000');

        // Check over-receipt against PO line
        if (poLine.receivedQuantity.plus(recvQty).greaterThan(poLine.orderedQuantity)) {
          throw new InventoryError('INVENTORY_GOODS_RECEIPT_OVER_RECEIPT');
        }

        const disposition = line.disposition || 'ACCEPTED';
        let batchId: string | null = null;

        // If product requires batch tracking, validate batch and expiry
        if (poLine.product.requiresBatchTracking) {
          if (!line.batchNumber || line.batchNumber.trim().length < 2) {
            throw new InventoryError('INVENTORY_BATCH_REQUIRED_FOR_PRODUCT');
          }
          if (!line.expirationDate) {
            throw new BadRequestException('Expiration date is required for batch-tracked product delivery');
          }

          const batchNumber = line.batchNumber.trim().toUpperCase();
          const expDateStr = validateDateString(line.expirationDate, 'expirationDate');
          const expDate = new Date(`${expDateStr}T00:00:00.000Z`);

          let batch = await tx.inventoryBatch.findFirst({
            where: {
              clinicId: c.clinicId,
              productId: poLine.productId,
              batchNumber,
            },
          });

          if (batch) {
            if (batch.status === 'RECALLED') {
              throw new InventoryError('INVENTORY_BATCH_RECALLED');
            }
          } else {
            batch = await tx.inventoryBatch.create({
              data: {
                clinicId: c.clinicId,
                productId: poLine.productId,
                batchNumber,
                expirationDate: expDate,
                initialQuantity: recvQty,
                supplierId: po.supplierId,
                status: disposition === 'QUARANTINED' ? 'QUARANTINED' : 'AVAILABLE',
              },
            });
          }
          batchId = batch.id;
        }

        let movementId: string | null = null;

        // Post stock movement if quantity accepted > 0
        if (recvQty.greaterThan(new Prisma.Decimal('0.0000')) && disposition === 'ACCEPTED') {
          const balance = await tx.inventoryBalance.findUnique({
            where: {
              clinicId_productId_locationId: {
                clinicId: c.clinicId,
                productId: poLine.productId,
                locationId: destLocId,
              },
            },
          });
          const prevBal = balance ? balance.onHandQuantity : new Prisma.Decimal('0.0000');
          const newBal = prevBal.plus(recvQty);

          const movement = await tx.inventoryStockMovement.create({
            data: {
              clinicId: c.clinicId,
              productId: poLine.productId,
              locationId: destLocId,
              batchId,
              movementType: 'RECEIPT',
              quantity: recvQty,
              balanceAfter: newBal,
              reasonCode: 'PURCHASE_RECEIPT',
              reasonExplanation: `Goods receipt ${receiptNumber} against ${po.orderNumber}`,
              actorMembershipId: c.membershipId,
              idempotencyKey: input.idempotencyKey ? `${input.idempotencyKey}:${poLine.id}` : null,
            },
          });
          movementId = movement.id;

          if (balance) {
            await tx.inventoryBalance.update({
              where: { id: balance.id },
              data: {
                onHandQuantity: newBal,
                lastMovementId: movement.id,
                version: { increment: 1 },
              },
            });
          } else {
            await tx.inventoryBalance.create({
              data: {
                clinicId: c.clinicId,
                productId: poLine.productId,
                locationId: destLocId,
                onHandQuantity: newBal,
                lastMovementId: movement.id,
              },
            });
          }

          if (batchId) {
            const batchBal = await tx.inventoryBatchBalance.findUnique({
              where: {
                clinicId_locationId_batchId: {
                  clinicId: c.clinicId,
                  locationId: destLocId,
                  batchId,
                },
              },
            });
            if (batchBal) {
              await tx.inventoryBatchBalance.update({
                where: { id: batchBal.id },
                data: {
                  onHandQuantity: batchBal.onHandQuantity.plus(recvQty),
                  version: { increment: 1 },
                },
              });
            } else {
              await tx.inventoryBatchBalance.create({
                data: {
                  clinicId: c.clinicId,
                  locationId: destLocId,
                  batchId,
                  productId: poLine.productId,
                  onHandQuantity: recvQty,
                },
              });
            }
          }
        }

        receiptLinesData.push({
          clinicId: c.clinicId,
          purchaseOrderLineId: poLine.id,
          productId: poLine.productId,
          batchId,
          locationId: destLocId,
          receivedQuantity: recvQty,
          rejectedQuantity: rejQty,
          rejectionReason: line.rejectionReason?.trim() || null,
          unitCost: poLine.unitCost,
          disposition,
          movementId,
        });

        // Increment PO line received quantity
        await tx.inventoryPurchaseOrderLine.update({
          where: { id: poLine.id },
          data: {
            receivedQuantity: poLine.receivedQuantity.plus(recvQty),
          },
        });
      }

      // Re-fetch all PO lines to evaluate completion
      const updatedPoLines = await tx.inventoryPurchaseOrderLine.findMany({
        where: { purchaseOrderId: po.id },
      });
      const allFullyReceived = updatedPoLines.every((l) =>
        l.receivedQuantity.greaterThanOrEqualTo(l.orderedQuantity),
      );

      await tx.inventoryPurchaseOrder.update({
        where: { id: po.id },
        data: {
          status: allFullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED',
          version: { increment: 1 },
        },
      });

      const createdReceipt = await tx.inventoryGoodsReceipt.create({
        data: {
          clinicId: c.clinicId,
          receiptNumber,
          purchaseOrderId: po.id,
          supplierId: po.supplierId,
          destinationLocationId: destLocId,
          supplierDeliveryNote: input.deliveryNoteNumber?.trim() || null,
          notes: input.notes?.trim() || null,
          receiverMembershipId: c.membershipId,
        },
      });

      if (receiptLinesData.length > 0) {
        await tx.inventoryGoodsReceiptLine.createMany({
          data: receiptLinesData.map((l) => ({
            ...l,
            receiptId: createdReceipt.id,
          })),
        });
      }

      const goodsReceipt = await tx.inventoryGoodsReceipt.findFirstOrThrow({
        where: { id: createdReceipt.id, clinicId: c.clinicId },
        include: {
          supplier: { select: { id: true, code: true, nameAr: true } },
          destinationLocation: { select: { id: true, code: true, nameAr: true } },
          lines: {
            include: {
              product: { select: { id: true, sku: true, nameAr: true, unit: true } },
              batch: { select: { id: true, batchNumber: true, expirationDate: true } },
            },
          },
        },
      });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'inventory.goods_receipt.create',
          category: 'PLATFORM',
          targetType: 'InventoryGoodsReceipt',
          targetId: goodsReceipt.id,
          outcome: 'SUCCESS',
          metadata: { receiptNumber, purchaseOrderId: po.id, orderNumber: po.orderNumber },
        },
        tx,
      );

      return clean(goodsReceipt);
    });
  }

  async getGoodsReceipt(proof: VerifiedPrincipal, clinicId: string, receiptId: string) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.goods-receipt.read'], async (tx, c) => {
      const receipt = await tx.inventoryGoodsReceipt.findFirst({
        where: { id: receiptId, clinicId: c.clinicId },
        include: {
          supplier: true,
          destinationLocation: true,
          purchaseOrder: { select: { id: true, orderNumber: true, status: true } },
          receiver: { select: { id: true, user: { select: { name: true, email: true } } } },
          lines: {
            include: {
              product: { select: { id: true, sku: true, nameAr: true, unit: true } },
              batch: { select: { id: true, batchNumber: true, expirationDate: true } },
            },
          },
        },
      });
      if (!receipt) throw new InventoryError('INVENTORY_GOODS_RECEIPT_NOT_FOUND');
      return clean(receipt);
    });
  }

  async listGoodsReceipts(proof: VerifiedPrincipal, clinicId: string, q: GoodsReceiptListQuery) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.goods-receipt.read'], async (tx, c) => {
      const take = Math.min(Math.max(q.limit ?? 50, 1), 100);
      const where: Prisma.InventoryGoodsReceiptWhereInput = {
        clinicId: c.clinicId,
        ...(q.purchaseOrderId ? { purchaseOrderId: q.purchaseOrderId } : {}),
        ...(q.supplierId ? { supplierId: q.supplierId } : {}),
        ...(q.destinationLocationId ? { destinationLocationId: q.destinationLocationId } : {}),
      };

      const items = await tx.inventoryGoodsReceipt.findMany({
        where,
        take: take + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
        orderBy: { receiptDate: 'desc' },
        include: {
          supplier: { select: { id: true, code: true, nameAr: true } },
          destinationLocation: { select: { id: true, code: true, nameAr: true } },
          purchaseOrder: { select: { id: true, orderNumber: true } },
          _count: { select: { lines: true } },
        },
      });

      let nextCursor: string | undefined;
      if (items.length > take) {
        const next = items.pop()!;
        nextCursor = next.id;
      }

      return clean({ items, nextCursor });
    });
  }

  // ---------------------------------------------------------------------------
  // Step 4.3: Physical Stocktaking & Reconciliations
  // ---------------------------------------------------------------------------

  async createStockCount(proof: VerifiedPrincipal, clinicId: string, input: CreateStockCountDto) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.stock-counts.manage'], async (tx, c) => {
      const location = await tx.inventoryLocation.findFirst({
        where: { id: input.locationId, clinicId: c.clinicId },
      });
      if (!location) throw new NotFoundException('LOCATION_NOT_FOUND');
      if (!location.isActive) throw new BadRequestException('Location is inactive');

      const counter = await tx.inventoryStockCountCounter.upsert({
        where: { clinicId: c.clinicId },
        create: { clinicId: c.clinicId, lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
        select: { lastNumber: true },
      });
      const countNumber = `SC-${String(counter.lastNumber).padStart(6, '0')}`;

      // Snapshot system stock
      const balances = await tx.inventoryBalance.findMany({
        where: {
          clinicId: c.clinicId,
          locationId: location.id,
          ...(input.productIds && input.productIds.length > 0 ? { productId: { in: input.productIds } } : {}),
        },
        include: { product: true },
      });

      const batchBalances = await tx.inventoryBatchBalance.findMany({
        where: {
          clinicId: c.clinicId,
          locationId: location.id,
          ...(input.productIds && input.productIds.length > 0 ? { productId: { in: input.productIds } } : {}),
        },
      });

      const itemsData = [];

      // For batch-tracked products, create count item per batch balance
      const batchTrackedProductIds = new Set<string>();
      for (const bb of batchBalances) {
        batchTrackedProductIds.add(bb.productId);
        itemsData.push({
          clinicId: c.clinicId,
          productId: bb.productId,
          batchId: bb.batchId,
          systemQuantity: bb.onHandQuantity,
          countedQuantity: bb.onHandQuantity,
          varianceQuantity: new Prisma.Decimal('0.0000'),
        });
      }

      // For non-batch products (or products without batch balances)
      for (const b of balances) {
        if (!batchTrackedProductIds.has(b.productId)) {
          itemsData.push({
            clinicId: c.clinicId,
            productId: b.productId,
            batchId: null,
            systemQuantity: b.onHandQuantity,
            countedQuantity: b.onHandQuantity,
            varianceQuantity: new Prisma.Decimal('0.0000'),
          });
        }
      }

      const createdCount = await tx.inventoryStockCount.create({
        data: {
          clinicId: c.clinicId,
          countNumber,
          locationId: location.id,
          status: 'DRAFT',
          notes: input.notes?.trim() || null,
          counterMembershipId: c.membershipId,
        },
      });

      if (itemsData.length > 0) {
        await tx.inventoryStockCountItem.createMany({
          data: itemsData.map((item) => ({
            ...item,
            stockCountId: createdCount.id,
          })),
        });
      }

      const stockCount = await tx.inventoryStockCount.findFirstOrThrow({
        where: { id: createdCount.id, clinicId: c.clinicId },
        include: {
          location: { select: { id: true, code: true, nameAr: true } },
          items: {
            include: {
              product: { select: { id: true, sku: true, nameAr: true, unit: true } },
              batch: { select: { id: true, batchNumber: true, expirationDate: true } },
            },
          },
        },
      });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'inventory.stock_count.create',
          category: 'PLATFORM',
          targetType: 'InventoryStockCount',
          targetId: stockCount.id,
          outcome: 'SUCCESS',
          metadata: { countNumber, locationId: location.id, itemsCount: itemsData.length },
        },
        tx,
      );

      return clean(stockCount);
    });
  }

  async recordStockCountItems(
    proof: VerifiedPrincipal,
    clinicId: string,
    countId: string,
    input: RecordStockCountItemsDto,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.stock-counts.manage'], async (tx, c) => {
      const existing = await tx.inventoryStockCount.findFirst({
        where: { id: countId, clinicId: c.clinicId },
        include: { items: true },
      });
      if (!existing) throw new InventoryError('INVENTORY_STOCK_COUNT_NOT_FOUND');
      if (existing.status === 'RECONCILED' || existing.status === 'CANCELLED') {
        throw new InventoryError('INVENTORY_STOCK_COUNT_NOT_DRAFT');
      }
      if (existing.version !== input.expectedVersion) throw new InventoryError('INVENTORY_CONCURRENT_MODIFICATION');

      for (const itemInput of input.items) {
        const counted = toDecimal(itemInput.countedQuantity, 'countedQuantity', { allowZero: true });

        // Match existing item or create new item in this count
        const matched = existing.items.find(
          (i) => i.productId === itemInput.productId && i.batchId === (itemInput.batchId || null),
        );

        if (matched) {
          const variance = counted.minus(matched.systemQuantity);
          await tx.inventoryStockCountItem.update({
            where: { id: matched.id },
            data: {
              countedQuantity: counted,
              varianceQuantity: variance,
              discrepancyReason: itemInput.discrepancyReason?.trim() || null,
            },
          });
        } else {
          // New item observed during count
          const variance = counted;
          await tx.inventoryStockCountItem.create({
            data: {
              clinicId: c.clinicId,
              stockCountId: countId,
              productId: itemInput.productId,
              batchId: itemInput.batchId || null,
              systemQuantity: new Prisma.Decimal('0.0000'),
              countedQuantity: counted,
              varianceQuantity: variance,
              discrepancyReason: itemInput.discrepancyReason?.trim() || null,
            },
          });
        }
      }

      const updated = await tx.inventoryStockCount.update({
        where: { id: countId },
        data: {
          status: 'SUBMITTED',
          version: { increment: 1 },
        },
        include: {
          location: { select: { id: true, code: true, nameAr: true } },
          items: {
            include: {
              product: { select: { id: true, sku: true, nameAr: true, unit: true } },
              batch: { select: { id: true, batchNumber: true, expirationDate: true } },
            },
          },
        },
      });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'inventory.stock_count.record_items',
          category: 'PLATFORM',
          targetType: 'InventoryStockCount',
          targetId: updated.id,
          outcome: 'SUCCESS',
          metadata: { countNumber: existing.countNumber, itemsUpdated: input.items.length },
        },
        tx,
      );

      return clean(updated);
    });
  }

  async reconcileStockCount(
    proof: VerifiedPrincipal,
    clinicId: string,
    countId: string,
    input: ReconcileStockCountDto,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.stock-counts.approve'], async (tx, c) => {
      const count = await tx.inventoryStockCount.findFirst({
        where: { id: countId, clinicId: c.clinicId },
        include: { items: true },
      });
      if (!count) throw new InventoryError('INVENTORY_STOCK_COUNT_NOT_FOUND');
      if (count.status === 'RECONCILED') throw new InventoryError('INVENTORY_STOCK_COUNT_ALREADY_RECONCILED');
      if (count.status === 'CANCELLED') throw new BadRequestException('Cannot reconcile a cancelled stock count');
      if (count.version !== input.expectedVersion) throw new InventoryError('INVENTORY_CONCURRENT_MODIFICATION');

      let adjustmentsCount = 0;

      for (const item of count.items) {
        if (!item.countedQuantity) continue;
        const diff = item.varianceQuantity;

        if (diff && !diff.equals(new Prisma.Decimal('0.0000'))) {
          adjustmentsCount++;
          const balance = await tx.inventoryBalance.findUnique({
            where: {
              clinicId_productId_locationId: {
                clinicId: c.clinicId,
                productId: item.productId,
                locationId: count.locationId,
              },
            },
          });
          const prevBal = balance ? balance.onHandQuantity : new Prisma.Decimal('0.0000');
          const newBal = prevBal.plus(diff);

          if (newBal.lessThan(new Prisma.Decimal('0.0000'))) {
            throw new InventoryError('INVENTORY_INSUFFICIENT_STOCK');
          }

          const isPositive = diff.greaterThan(new Prisma.Decimal('0.0000'));
          const movementType = isPositive ? 'RECEIPT' : 'ISSUE';

          const movement = await tx.inventoryStockMovement.create({
            data: {
              clinicId: c.clinicId,
              productId: item.productId,
              locationId: count.locationId,
              batchId: item.batchId,
              movementType,
              quantity: diff,
              balanceAfter: newBal,
              reasonCode: 'DISCREPANCY_CORRECTION',
              reasonExplanation: `Stock count ${count.countNumber} discrepancy adjustment: ${item.discrepancyReason || 'Physical variance'}`,
              actorMembershipId: c.membershipId,
              idempotencyKey: input.idempotencyKey ? `${input.idempotencyKey}:${item.id}` : null,
            },
          });

          await tx.inventoryStockCountItem.update({
            where: { id: item.id },
            data: { movementId: movement.id },
          });

          if (balance) {
            await tx.inventoryBalance.update({
              where: { id: balance.id },
              data: {
                onHandQuantity: newBal,
                lastMovementId: movement.id,
                version: { increment: 1 },
              },
            });
          } else {
            await tx.inventoryBalance.create({
              data: {
                clinicId: c.clinicId,
                productId: item.productId,
                locationId: count.locationId,
                onHandQuantity: newBal,
                lastMovementId: movement.id,
              },
            });
          }

          if (item.batchId) {
            const batchBal = await tx.inventoryBatchBalance.findUnique({
              where: {
                clinicId_locationId_batchId: {
                  clinicId: c.clinicId,
                  locationId: count.locationId,
                  batchId: item.batchId,
                },
              },
            });
            const prevBatchBal = batchBal ? batchBal.onHandQuantity : new Prisma.Decimal('0.0000');
            const newBatchBal = prevBatchBal.plus(diff);

            if (batchBal) {
              await tx.inventoryBatchBalance.update({
                where: { id: batchBal.id },
                data: {
                  onHandQuantity: newBatchBal,
                  version: { increment: 1 },
                },
              });
            } else {
              await tx.inventoryBatchBalance.create({
                data: {
                  clinicId: c.clinicId,
                  locationId: count.locationId,
                  batchId: item.batchId,
                  productId: item.productId,
                  onHandQuantity: newBatchBal,
                },
              });
            }
          }
        }
      }

      const reconciled = await tx.inventoryStockCount.update({
        where: { id: countId },
        data: {
          status: 'RECONCILED',
          approvedByMembershipId: c.membershipId,
          approvedAt: new Date(),
          notes: input.notes !== undefined ? (input.notes?.trim() || null) : count.notes,
          version: { increment: 1 },
        },
      });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'inventory.stock_count.reconcile',
          category: 'PLATFORM',
          targetType: 'InventoryStockCount',
          targetId: reconciled.id,
          outcome: 'SUCCESS',
          metadata: { countNumber: count.countNumber, adjustmentsCount },
        },
        tx,
      );

      return clean(reconciled);
    });
  }

  async getStockCount(proof: VerifiedPrincipal, clinicId: string, countId: string) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.stock-counts.read'], async (tx, c) => {
      const count = await tx.inventoryStockCount.findFirst({
        where: { id: countId, clinicId: c.clinicId },
        include: {
          location: true,
          counter: { select: { id: true, user: { select: { name: true, email: true } } } },
          approvedBy: { select: { id: true, user: { select: { name: true, email: true } } } },
          items: {
            include: {
              product: { select: { id: true, sku: true, nameAr: true, unit: true } },
              batch: { select: { id: true, batchNumber: true, expirationDate: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      if (!count) throw new InventoryError('INVENTORY_STOCK_COUNT_NOT_FOUND');
      return clean(count);
    });
  }

  async listStockCounts(proof: VerifiedPrincipal, clinicId: string, q: StockCountListQuery) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.stock-counts.read'], async (tx, c) => {
      const take = Math.min(Math.max(q.limit ?? 50, 1), 100);
      const where: Prisma.InventoryStockCountWhereInput = {
        clinicId: c.clinicId,
        ...(q.locationId ? { locationId: q.locationId } : {}),
        ...(q.status ? { status: q.status } : {}),
      };

      const items = await tx.inventoryStockCount.findMany({
        where,
        take: take + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
        orderBy: { createdAt: 'desc' },
        include: {
          location: { select: { id: true, code: true, nameAr: true } },
          counter: { select: { id: true, user: { select: { name: true } } } },
          _count: { select: { items: true } },
        },
      });

      let nextCursor: string | undefined;
      if (items.length > take) {
        const next = items.pop()!;
        nextCursor = next.id;
      }

      return clean({ items, nextCursor });
    });
  }

  // ---------------------------------------------------------------------------
  // Step 4.3: Inventory Alerts & Operational Notifications
  // ---------------------------------------------------------------------------

  async getInventoryAlerts(proof: VerifiedPrincipal, clinicId: string, q: InventoryAlertQuery) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.alerts.read'], async (tx, c) => {
      const clinic = await tx.clinic.findUnique({
        where: { id: c.clinicId },
        select: { timezone: true },
      });
      const tz = clinic?.timezone || 'Asia/Aden';
      const todayStr = getClinicLocalDateString(new Date(), tz);
      const in30Days = new Date(Date.now() + 30 * 86400000);
      const in30DaysStr = in30Days.toISOString().slice(0, 10);

      const acknowledgments = await tx.inventoryAlertAcknowledgment.findMany({
        where: { clinicId: c.clinicId },
      });
      const ackMap = new Map<string, { acknowledgedAt: Date; dismissedUntil: Date | null }>();
      for (const ack of acknowledgments) {
        ackMap.set(ack.alertKey, {
          acknowledgedAt: ack.acknowledgedAt,
          dismissedUntil: ack.dismissedUntil,
        });
      }

      const isSnoozed = (alertType: string, targetType: string, targetId: string) => {
        const ack = ackMap.get(`${alertType}:${targetType}:${targetId}`);
        if (!ack || !ack.dismissedUntil) return false;
        return ack.dismissedUntil > new Date();
      };

      const alerts: Array<{
        id: string;
        alertType: 'LOW_STOCK' | 'OUT_OF_STOCK' | 'NEAR_EXPIRY' | 'EXPIRED' | 'QUARANTINED_BATCH' | 'PENDING_PO';
        severity: 'CRITICAL' | 'WARNING' | 'INFO';
        targetType: 'PRODUCT' | 'BATCH' | 'PURCHASE_ORDER';
        targetId: string;
        titleAr: string;
        messageAr: string;
        currentValue: string;
        thresholdValue?: string;
        createdAt: string;
      }> = [];

      // 1. Low stock & Out of stock
      const products = await tx.inventoryProduct.findMany({
        where: { clinicId: c.clinicId, isActive: true },
        include: {
          balances: {
            where: q.locationId ? { locationId: q.locationId } : undefined,
          },
        },
      });

      for (const p of products) {
        const totalOnHand = p.balances.reduce(
          (sum, b) => sum.plus(b.onHandQuantity),
          new Prisma.Decimal('0.0000'),
        );

        if (totalOnHand.equals(new Prisma.Decimal('0.0000'))) {
          if (!isSnoozed('OUT_OF_STOCK', 'PRODUCT', p.id)) {
            alerts.push({
              id: `OUT_OF_STOCK:${p.id}`,
              alertType: 'OUT_OF_STOCK',
              severity: 'CRITICAL',
              targetType: 'PRODUCT',
              targetId: p.id,
              titleAr: `نفاد المخزون: ${p.nameAr}`,
              messageAr: `نفد مخزون الصنف ${p.nameAr} (${p.sku}) بالكامل. الرصيد الحالي: 0.`,
              currentValue: '0.0000',
              thresholdValue: p.reorderThreshold ? p.reorderThreshold.toString() : '0.0000',
              createdAt: todayStr,
            });
          }
        } else if (p.reorderThreshold && totalOnHand.lessThanOrEqualTo(p.reorderThreshold)) {
          if (!isSnoozed('LOW_STOCK', 'PRODUCT', p.id)) {
            alerts.push({
              id: `LOW_STOCK:${p.id}`,
              alertType: 'LOW_STOCK',
              severity: 'WARNING',
              targetType: 'PRODUCT',
              targetId: p.id,
              titleAr: `مستوى مخزون منخفض: ${p.nameAr}`,
              messageAr: `وصل رصيد ${p.nameAr} إلى ${totalOnHand.toString()} ${p.unit} وهو أقل من أو يساوي حد إعادة الطلب (${p.reorderThreshold.toString()}).`,
              currentValue: totalOnHand.toString(),
              thresholdValue: p.reorderThreshold.toString(),
              createdAt: todayStr,
            });
          }
        }
      }

      // 2. Near expiry & Expired
      const batches = await tx.inventoryBatch.findMany({
        where: {
          clinicId: c.clinicId,
          status: { in: ['AVAILABLE', 'QUARANTINED', 'EXPIRED'] },
        },
        include: {
          product: { select: { id: true, sku: true, nameAr: true, unit: true } },
          batchBalances: {
            where: q.locationId ? { locationId: q.locationId } : undefined,
          },
        },
      });

      for (const b of batches) {
        const batchTotalOnHand = b.batchBalances.reduce(
          (sum, bal) => sum.plus(bal.onHandQuantity),
          new Prisma.Decimal('0.0000'),
        );
        if (batchTotalOnHand.lessThanOrEqualTo(new Prisma.Decimal('0.0000'))) continue;

        const expStr = b.expirationDate.toISOString().slice(0, 10);

        if (expStr < todayStr) {
          if (!isSnoozed('EXPIRED', 'BATCH', b.id)) {
            alerts.push({
              id: `EXPIRED:${b.id}`,
              alertType: 'EXPIRED',
              severity: 'CRITICAL',
              targetType: 'BATCH',
              targetId: b.id,
              titleAr: `دفعة منتهية الصلاحية: ${b.product.nameAr}`,
              messageAr: `انتهت صلاحية تشغيلة رقم ${b.batchNumber} لصنف ${b.product.nameAr} بتاريخ ${expStr}. الكمية المتبقية: ${batchTotalOnHand.toString()}.`,
              currentValue: batchTotalOnHand.toString(),
              thresholdValue: expStr,
              createdAt: todayStr,
            });
          }
        } else if (expStr <= in30DaysStr && b.status === 'AVAILABLE') {
          if (!isSnoozed('NEAR_EXPIRY', 'BATCH', b.id)) {
            alerts.push({
              id: `NEAR_EXPIRY:${b.id}`,
              alertType: 'NEAR_EXPIRY',
              severity: 'WARNING',
              targetType: 'BATCH',
              targetId: b.id,
              titleAr: `اقتراب انتهاء الصلاحية: ${b.product.nameAr}`,
              messageAr: `تنتهي صلاحية تشغيلة ${b.batchNumber} لصنف ${b.product.nameAr} خلال 30 يومًا (${expStr}). الرصيد: ${batchTotalOnHand.toString()}.`,
              currentValue: batchTotalOnHand.toString(),
              thresholdValue: expStr,
              createdAt: todayStr,
            });
          }
        }

        // Quarantined batches
        if (b.status === 'QUARANTINED') {
          if (!isSnoozed('QUARANTINED_BATCH', 'BATCH', b.id)) {
            alerts.push({
              id: `QUARANTINED_BATCH:${b.id}`,
              alertType: 'QUARANTINED_BATCH',
              severity: 'WARNING',
              targetType: 'BATCH',
              targetId: b.id,
              titleAr: `دفعة قيد الحجر الصحي: ${b.product.nameAr}`,
              messageAr: `التشغيلة ${b.batchNumber} لصنف ${b.product.nameAr} موضوعة تحت الحجر الصحي. الكمية: ${batchTotalOnHand.toString()}.`,
              currentValue: batchTotalOnHand.toString(),
              createdAt: todayStr,
            });
          }
        }
      }

      // 3. Pending POs
      const pendingPOs = await tx.inventoryPurchaseOrder.findMany({
        where: {
          clinicId: c.clinicId,
          status: 'SUBMITTED',
        },
        include: {
          supplier: { select: { id: true, nameAr: true } },
        },
      });

      for (const po of pendingPOs) {
        if (!isSnoozed('PENDING_PO', 'PURCHASE_ORDER', po.id)) {
          alerts.push({
            id: `PENDING_PO:${po.id}`,
            alertType: 'PENDING_PO',
            severity: 'INFO',
            targetType: 'PURCHASE_ORDER',
            targetId: po.id,
            titleAr: `أمر شراء بانتظار الاعتماد: ${po.orderNumber}`,
            messageAr: `أمر الشراء ${po.orderNumber} الموجه للمورد ${po.supplier.nameAr} بإجمالي ${po.totalAmount.toString()} ${po.currency} بانتظار الاعتماد.`,
            currentValue: po.totalAmount.toString(),
            createdAt: po.orderDate.toISOString().slice(0, 10),
          });
        }
      }

      const filteredAlerts = q.type ? alerts.filter((a) => a.alertType === q.type) : alerts;

      return clean({
        summary: {
          total: filteredAlerts.length,
          critical: filteredAlerts.filter((a) => a.severity === 'CRITICAL').length,
          warning: filteredAlerts.filter((a) => a.severity === 'WARNING').length,
          info: filteredAlerts.filter((a) => a.severity === 'INFO').length,
        },
        items: filteredAlerts,
      });
    });
  }

  async acknowledgeAlert(proof: VerifiedPrincipal, clinicId: string, input: AcknowledgeAlertDto) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.alerts.acknowledge'], async (tx, c) => {
      const dismissedUntil = input.snoozedUntil ? new Date(input.snoozedUntil) : null;
      const alertKey = `${input.alertType}:${input.targetType}:${input.targetId}`;

      const existing = await tx.inventoryAlertAcknowledgment.findFirst({
        where: {
          clinicId: c.clinicId,
          alertKey,
        },
      });

      let ack;
      if (existing) {
        ack = await tx.inventoryAlertAcknowledgment.update({
          where: { id: existing.id },
          data: {
            dismissedUntil,
            notes: input.notes?.trim() || null,
            acknowledgedByMembershipId: c.membershipId,
            acknowledgedAt: new Date(),
            version: { increment: 1 },
          },
        });
      } else {
        ack = await tx.inventoryAlertAcknowledgment.create({
          data: {
            clinicId: c.clinicId,
            alertKey,
            dismissedUntil,
            notes: input.notes?.trim() || null,
            acknowledgedByMembershipId: c.membershipId,
          },
        });
      }

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'inventory.alert.acknowledge',
          category: 'PLATFORM',
          targetType: 'InventoryAlertAcknowledgment',
          targetId: ack.id,
          outcome: 'SUCCESS',
          metadata: { alertType: input.alertType, targetType: input.targetType, targetId: input.targetId },
        },
        tx,
      );

      return clean(ack);
    });
  }
}

