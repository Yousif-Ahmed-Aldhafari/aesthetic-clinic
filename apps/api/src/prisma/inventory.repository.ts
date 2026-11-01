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
} from '../inventory/inventory-input.js';
import { validateDecimalString } from '../inventory/inventory-input.js';
import type { VerifiedPrincipal } from './verified-sessions.js';
import { TenantDatabaseService } from './tenant-database.service.js';
import { AuditRepository } from './audit.repository.js';

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
      // Idempotency check
      if (input.idempotencyKey) {
        const existingMovement = await tx.inventoryStockMovement.findUnique({
          where: {
            clinicId_idempotencyKey: { clinicId: c.clinicId, idempotencyKey: input.idempotencyKey },
          },
        });
        if (existingMovement) return clean(existingMovement);
      }

      const qty = toDecimal(input.quantity, 'quantity');
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
      // Idempotency check
      if (input.idempotencyKey) {
        const existingMovement = await tx.inventoryStockMovement.findUnique({
          where: {
            clinicId_idempotencyKey: { clinicId: c.clinicId, idempotencyKey: input.idempotencyKey },
          },
        });
        if (existingMovement) return clean(existingMovement);
      }

      const qty = toDecimal(input.quantity, 'quantity');
      const reasonCode = input.reasonCode || 'PURCHASE_RECEIPT';
      if (!['PURCHASE_RECEIPT', 'RETURN'].includes(reasonCode)) {
        throw new BadRequestException('Reason code must be PURCHASE_RECEIPT or RETURN for stock receipt');
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
      // Idempotency check
      if (input.idempotencyKey) {
        const existingMovement = await tx.inventoryStockMovement.findUnique({
          where: {
            clinicId_idempotencyKey: { clinicId: c.clinicId, idempotencyKey: input.idempotencyKey },
          },
        });
        if (existingMovement) return clean(existingMovement);
      }

      const qty = toDecimal(input.quantity, 'quantity');
      if (!['CLINICAL_USE', 'EXPIRED', 'DAMAGED', 'DISCREPANCY_CORRECTION'].includes(input.reasonCode)) {
        throw new BadRequestException('Invalid issue reason code');
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

      // Idempotency check
      if (input.idempotencyKey) {
        const existingMovement = await tx.inventoryStockMovement.findUnique({
          where: {
            clinicId_idempotencyKey: { clinicId: c.clinicId, idempotencyKey: input.idempotencyKey },
          },
        });
        if (existingMovement) return clean(existingMovement);
      }

      const qty = toDecimal(input.quantity, 'quantity');

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
      // Idempotency check
      if (input.idempotencyKey) {
        const existingMovement = await tx.inventoryStockMovement.findUnique({
          where: {
            clinicId_idempotencyKey: { clinicId: c.clinicId, idempotencyKey: input.idempotencyKey },
          },
        });
        if (existingMovement) return clean(existingMovement);
      }

      if (!input.reasonExplanation || input.reasonExplanation.trim().length < 3) {
        throw new BadRequestException('Reason explanation of at least 3 characters is required for stock adjustments');
      }
      if (!['DISCREPANCY_CORRECTION', 'DAMAGED', 'EXPIRED'].includes(input.reasonCode)) {
        throw new BadRequestException('Invalid adjustment reason code');
      }

      const targetQty = toDecimal(input.targetQuantity, 'targetQuantity', { allowZero: true });

      const product = await tx.inventoryProduct.findFirst({
        where: { id: input.productId, clinicId: c.clinicId },
      });
      if (!product) throw new NotFoundException('PRODUCT_NOT_FOUND');

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
}

