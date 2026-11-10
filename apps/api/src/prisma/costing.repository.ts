import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { AuditRepository } from './audit.repository.js';
import { TenantDatabaseService, TenantTransaction } from './tenant-database.service.js';
import { type VerifiedPrincipal } from './verified-sessions.js';
import {
  CreateLandedCostDto,
  ApproveLandedCostDto,
  CostLayerQueryDto,
  ValuationQueryDto,
  CreateValuationSnapshotDto,
  CreateCostAdjustmentDto,
  DecideCostAdjustmentDto,
  InitializeOpeningBalancesDto,
  ApproveOpeningBalancesDto,
} from '../costing/costing.dto.js';
import { currencyScale } from '../billing/money.js';

export function decimalToMinor(val: string | number | Prisma.Decimal | undefined | null, scale = 2): bigint {
  if (val === undefined || val === null) return 0n;
  const d = new Prisma.Decimal(val);
  const factor = new Prisma.Decimal(10 ** scale);
  return BigInt(d.mul(factor).round().toString());
}

export function minorToDecimalString(minor: bigint, scale = 2): string {
  const isNeg = minor < 0n;
  const abs = isNeg ? -minor : minor;
  const factor = 10n ** BigInt(scale);
  const intPart = abs / factor;
  const fracPart = abs % factor;
  const fracStr = fracPart.toString().padStart(scale, '0');
  return `${isNeg ? '-' : ''}${intPart.toString()}.${fracStr}`;
}

@Injectable()
export class CostingRepository {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditRepository,
  ) {}

  // ==========================================
  // 1. LANDED COST OPERATIONS
  // ==========================================

  async draftLandedCost(proof: VerifiedPrincipal, clinicId: string, input: CreateLandedCostDto) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.costing.manage'], async (tx, c) => {
      const clinic = await tx.clinic.findUniqueOrThrow({ where: { id: c.clinicId }, select: { currency: true } });
      const scale = currencyScale(clinic.currency);

      if (input.idempotencyKey) {
        const existing = await tx.inventoryLandedCost.findFirst({
          where: { clinicId: c.clinicId, allocationNumber: input.idempotencyKey.trim() },
          include: { allocationLines: true },
        });
        if (existing) return this.serializeLandedCost(existing, scale);
      }

      if (!input.goodsReceiptId && !input.purchaseOrderId) {
        throw new BadRequestException('Either goodsReceiptId or purchaseOrderId must be provided');
      }

      // Fetch goods receipt lines
      let grLines: Array<any> = [];
      let purchaseOrderId: string | null = input.purchaseOrderId ?? null;
      let goodsReceiptId: string | null = input.goodsReceiptId ?? null;

      if (goodsReceiptId) {
        const gr = await tx.inventoryGoodsReceipt.findFirst({
          where: { id: goodsReceiptId, clinicId: c.clinicId },
          include: {
            lines: {
              where: { disposition: 'ACCEPTED' },
              include: { product: true, costLayers: true },
            },
          },
        });
        if (!gr) throw new NotFoundException('GOODS_RECEIPT_NOT_FOUND');
        if (gr.lines.length === 0) throw new BadRequestException('Goods receipt has no accepted line items');
        grLines = gr.lines;
        if (!purchaseOrderId && gr.purchaseOrderId) purchaseOrderId = gr.purchaseOrderId;
      } else if (purchaseOrderId) {
        const po = await tx.inventoryPurchaseOrder.findFirst({
          where: { id: purchaseOrderId, clinicId: c.clinicId },
          include: {
            goodsReceipts: {
              include: {
                lines: {
                  where: { disposition: 'ACCEPTED' },
                  include: { product: true, costLayers: true },
                },
              },
            },
          },
        });
        if (!po) throw new NotFoundException('PURCHASE_ORDER_NOT_FOUND');
        grLines = po.goodsReceipts.flatMap((r) => r.lines);
        if (grLines.length === 0) throw new BadRequestException('Purchase order has no accepted goods receipt lines');
      }

      // Convert charges to minor units
      const freightMinor = decimalToMinor(input.freightCost, scale);
      const customsMinor = decimalToMinor(input.customsDuty, scale);
      const insuranceMinor = decimalToMinor(input.insuranceCost, scale);
      const handlingMinor = decimalToMinor(input.handlingCost, scale);
      const otherMinor = decimalToMinor(input.otherCharges, scale);
      const discountMinor = decimalToMinor(input.discountCredit, scale);

      const grossLandedMinor = freightMinor + customsMinor + insuranceMinor + handlingMinor + otherMinor;
      if (discountMinor > grossLandedMinor) {
        throw new BadRequestException('Discount credit cannot exceed total gross landed charges');
      }
      const netLandedChargesMinor = grossLandedMinor - discountMinor;

      // Allocate landed cost deterministically across lines
      const method = input.allocationMethod || 'BY_VALUE';
      let totalWeight = new Prisma.Decimal('0.0000');

      const lineWeights = grLines.map((line) => {
        let w = new Prisma.Decimal('0.0000');
        if (method === 'BY_QUANTITY') {
          w = line.receivedQuantity;
        } else {
          // BY_VALUE: quantity * unitCost
          w = line.receivedQuantity.mul(line.unitCost);
        }
        totalWeight = totalWeight.plus(w);
        return { line, weight: w };
      });

      if (totalWeight.lessThanOrEqualTo(0)) {
        throw new BadRequestException('Total allocation weight must be greater than zero');
      }

      // Integer distribution of minor units
      let allocatedSum = 0n;
      const allocations: Array<{
        goodsReceiptLineId: string;
        costLayerId?: string;
        allocatedAmountMinor: bigint;
        roundingRemainderMinor: bigint;
      }> = [];

      for (let i = 0; i < lineWeights.length; i++) {
        const { line, weight } = lineWeights[i];
        const isLast = i === lineWeights.length - 1;

        let lineAllocMinor = 0n;
        let remainderMinor = 0n;

        if (isLast) {
          // Attribute exact remainder to last line
          lineAllocMinor = netLandedChargesMinor - allocatedSum;
          const nominalAlloc = BigInt(
            new Prisma.Decimal(netLandedChargesMinor.toString())
              .mul(weight)
              .div(totalWeight)
              .floor()
              .toString(),
          );
          remainderMinor = lineAllocMinor - nominalAlloc;
        } else {
          lineAllocMinor = BigInt(
            new Prisma.Decimal(netLandedChargesMinor.toString())
              .mul(weight)
              .div(totalWeight)
              .floor()
              .toString(),
          );
          allocatedSum += lineAllocMinor;
        }

        const costLayer = line.costLayers?.[0];

        allocations.push({
          goodsReceiptLineId: line.id,
          costLayerId: costLayer?.id,
          allocatedAmountMinor: lineAllocMinor,
          roundingRemainderMinor: remainderMinor,
        });
      }

      // Generate sequential allocation number
      const counter = await tx.inventoryLandedCostCounter.upsert({
        where: { clinicId: c.clinicId },
        create: { clinicId: c.clinicId, lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
        select: { lastNumber: true },
      });
      const allocationNumber = `LC-${String(counter.lastNumber).padStart(6, '0')}`;

      const landedCost = await tx.inventoryLandedCost.create({
        data: {
          clinicId: c.clinicId,
          allocationNumber,
          purchaseOrderId,
          goodsReceiptId,
          freightCostMinor: freightMinor,
          customsDutyMinor: customsMinor,
          insuranceCostMinor: insuranceMinor,
          handlingCostMinor: handlingMinor,
          otherChargesMinor: otherMinor,
          discountCreditMinor: discountMinor,
          totalLandedCostMinor: netLandedChargesMinor,
          allocationMethod: method,
          status: 'DRAFT',
          notes: input.notes?.trim() || null,
        },
      });

      if (allocations.length > 0) {
        await tx.inventoryLandedCostAllocationLine.createMany({
          data: allocations.map((a) => ({
            clinicId: c.clinicId,
            landedCostId: landedCost.id,
            goodsReceiptLineId: a.goodsReceiptLineId,
            costLayerId: a.costLayerId,
            allocatedAmountMinor: a.allocatedAmountMinor,
            roundingRemainderMinor: a.roundingRemainderMinor,
          })),
        });
      }

      const fullLandedCost = await tx.inventoryLandedCost.findUniqueOrThrow({
        where: { id: landedCost.id },
        include: {
          allocationLines: {
            include: {
              goodsReceiptLine: {
                include: { product: { select: { id: true, sku: true, nameAr: true, unit: true } } },
              },
            },
          },
        },
      });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'inventory.landed_cost.draft',
          category: 'PLATFORM',
          targetType: 'InventoryLandedCost',
          targetId: landedCost.id,
          outcome: 'SUCCESS',
          metadata: { allocationNumber, totalLandedCostMinor: netLandedChargesMinor.toString() },
        },
        tx,
      );

      return this.serializeLandedCost(fullLandedCost, scale);
    });
  }

  async approveLandedCost(proof: VerifiedPrincipal, clinicId: string, landedCostId: string, input: ApproveLandedCostDto) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.costing.approve'], async (tx, c) => {
      const clinic = await tx.clinic.findUniqueOrThrow({ where: { id: c.clinicId }, select: { currency: true } });
      const scale = currencyScale(clinic.currency);

      const landedCost = await tx.inventoryLandedCost.findFirst({
        where: { id: landedCostId, clinicId: c.clinicId },
        include: {
          allocationLines: {
            include: {
              goodsReceiptLine: true,
              costLayer: true,
            },
          },
        },
      });
      if (!landedCost) throw new NotFoundException('LANDED_COST_NOT_FOUND');
      if (landedCost.status !== 'DRAFT') throw new ConflictException(`Cannot approve landed cost in status ${landedCost.status}`);
      if (landedCost.version !== input.expectedVersion) throw new ConflictException('LANDED_COST_STALE_CONCURRENCY');

      // Update associated cost layers
      for (const allocLine of landedCost.allocationLines) {
        let layer = allocLine.costLayer;

        // If cost layer wasn't linked yet, find it by goodsReceiptLineId
        if (!layer && allocLine.goodsReceiptLineId) {
          layer = await tx.inventoryCostLayer.findFirst({
            where: { clinicId: c.clinicId, goodsReceiptLineId: allocLine.goodsReceiptLineId },
          });
          if (layer) {
            await tx.inventoryLandedCostAllocationLine.update({
              where: { id: allocLine.id },
              data: { costLayerId: layer.id },
            });
          }
        }

        if (layer) {
          // Calculate unit landed cost addition in minor units
          const initialQty = layer.initialQuantity;
          const additionalUnitLandedMinor = BigInt(
            new Prisma.Decimal(allocLine.allocatedAmountMinor.toString())
              .div(initialQty)
              .round()
              .toString(),
          );

          const newUnitLandedCostMinor = layer.unitAcquisitionCostMinor + additionalUnitLandedMinor;
          const newTotalRemainingCostMinor = BigInt(
            layer.remainingQuantity.mul(newUnitLandedCostMinor.toString()).round().toString(),
          );

          await tx.inventoryCostLayer.update({
            where: { id: layer.id },
            data: {
              unitLandedCostMinor: newUnitLandedCostMinor,
              totalRemainingCostMinor: newTotalRemainingCostMinor,
              costStatus: layer.remainingQuantity.equals(0) ? 'EXHAUSTED' : 'VERIFIED',
              version: { increment: 1 },
            },
          });

          // Record cost adjustment movement for audit
          const counter = await tx.inventoryCostMovementCounter.upsert({
            where: { clinicId: c.clinicId },
            create: { clinicId: c.clinicId, lastNumber: 1 },
            update: { lastNumber: { increment: 1 } },
            select: { lastNumber: true },
          });
          const movementNumber = `CM-${String(counter.lastNumber).padStart(6, '0')}`;

          await tx.inventoryCostMovement.create({
            data: {
              clinicId: c.clinicId,
              movementNumber,
              costLayerId: layer.id,
              movementType: 'ADJUSTMENT',
              quantity: layer.remainingQuantity,
              unitCostMinor: newUnitLandedCostMinor,
              totalCostMinor: newTotalRemainingCostMinor,
              notes: `Landed cost allocation applied: ${landedCost.allocationNumber}`,
            },
          });
        }
      }

      const updated = await tx.inventoryLandedCost.update({
        where: { id: landedCost.id },
        data: {
          status: 'APPROVED',
          approvedByMembershipId: c.membershipId,
          approvedAt: new Date(),
          version: { increment: 1 },
        },
        include: {
          allocationLines: {
            include: {
              goodsReceiptLine: {
                include: { product: { select: { id: true, sku: true, nameAr: true, unit: true } } },
              },
            },
          },
        },
      });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'inventory.landed_cost.approve',
          category: 'PLATFORM',
          targetType: 'InventoryLandedCost',
          targetId: updated.id,
          outcome: 'SUCCESS',
          metadata: { allocationNumber: updated.allocationNumber },
        },
        tx,
      );

      return this.serializeLandedCost(updated, scale);
    });
  }

  async getLandedCost(proof: VerifiedPrincipal, clinicId: string, landedCostId: string) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.costing.read'], async (tx, c) => {
      const clinic = await tx.clinic.findUniqueOrThrow({ where: { id: c.clinicId }, select: { currency: true } });
      const scale = currencyScale(clinic.currency);

      const lc = await tx.inventoryLandedCost.findFirst({
        where: { id: landedCostId, clinicId: c.clinicId },
        include: {
          purchaseOrder: { select: { id: true, orderNumber: true } },
          goodsReceipt: { select: { id: true, receiptNumber: true } },
          approvedBy: { select: { id: true, role: true, user: { select: { name: true } } } },
          allocationLines: {
            include: {
              goodsReceiptLine: {
                include: { product: { select: { id: true, sku: true, nameAr: true, unit: true } } },
              },
              costLayer: true,
            },
          },
        },
      });
      if (!lc) throw new NotFoundException('LANDED_COST_NOT_FOUND');
      return this.serializeLandedCost(lc, scale);
    });
  }

  async listLandedCosts(proof: VerifiedPrincipal, clinicId: string) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.costing.read'], async (tx, c) => {
      const clinic = await tx.clinic.findUniqueOrThrow({ where: { id: c.clinicId }, select: { currency: true } });
      const scale = currencyScale(clinic.currency);

      const items = await tx.inventoryLandedCost.findMany({
        where: { clinicId: c.clinicId },
        orderBy: { createdAt: 'desc' },
        include: {
          purchaseOrder: { select: { id: true, orderNumber: true } },
          goodsReceipt: { select: { id: true, receiptNumber: true } },
          approvedBy: { select: { id: true, role: true, user: { select: { name: true } } } },
        },
      });

      return items.map((i) => this.serializeLandedCost(i, scale));
    });
  }

  // ==========================================
  // 2. FIFO COST LAYER OPERATIONS
  // ==========================================

  async listCostLayers(proof: VerifiedPrincipal, clinicId: string, q: CostLayerQueryDto) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.costing.read'], async (tx, c) => {
      const clinic = await tx.clinic.findUniqueOrThrow({ where: { id: c.clinicId }, select: { currency: true } });
      const scale = currencyScale(clinic.currency);

      const where: Prisma.InventoryCostLayerWhereInput = {
        clinicId: c.clinicId,
        ...(q.productId ? { productId: q.productId } : {}),
        ...(q.branchId ? { branchId: q.branchId } : {}),
        ...(q.locationId ? { locationId: q.locationId } : {}),
        ...(q.batchId ? { batchId: q.batchId } : {}),
        ...(q.costStatus ? { costStatus: q.costStatus } : {}),
      };

      const [total, items] = await Promise.all([
        tx.inventoryCostLayer.count({ where }),
        tx.inventoryCostLayer.findMany({
          where,
          orderBy: [{ layerDate: 'asc' }, { id: 'asc' }],
          take: q.limit || 50,
          skip: q.offset || 0,
          include: {
            product: { select: { id: true, sku: true, nameAr: true, unit: true, category: true } },
            branch: { select: { id: true, code: true, nameAr: true } },
            location: { select: { id: true, code: true, nameAr: true } },
            batch: { select: { id: true, batchNumber: true, expirationDate: true, status: true } },
          },
        }),
      ]);

      return {
        total,
        items: items.map((i) => this.serializeCostLayer(i, scale)),
      };
    });
  }

  async listCostMovements(proof: VerifiedPrincipal, clinicId: string, layerId?: string) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.costing.read'], async (tx, c) => {
      const clinic = await tx.clinic.findUniqueOrThrow({ where: { id: c.clinicId }, select: { currency: true } });
      const scale = currencyScale(clinic.currency);

      const items = await tx.inventoryCostMovement.findMany({
        where: {
          clinicId: c.clinicId,
          ...(layerId ? { costLayerId: layerId } : {}),
        },
        orderBy: { occurredAt: 'desc' },
        take: 100,
        include: {
          costLayer: {
            include: { product: { select: { id: true, sku: true, nameAr: true } } },
          },
        },
      });

      return items.map((m) => ({
        ...m,
        quantity: m.quantity.toString(),
        unitCost: minorToDecimalString(m.unitCostMinor, scale),
        totalCost: minorToDecimalString(m.totalCostMinor, scale),
        wasteCost: minorToDecimalString(m.wasteCostMinor, scale),
      }));
    });
  }

  // ==========================================
  // 3. FIFO VALUATION & REPORTING
  // ==========================================

  async getValuationReport(proof: VerifiedPrincipal, clinicId: string, q: ValuationQueryDto) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.costing.read'], async (tx, c) => {
      const clinic = await tx.clinic.findUniqueOrThrow({ where: { id: c.clinicId }, select: { currency: true } });
      const scale = currencyScale(clinic.currency);

      const asOf = q.asOfDate ? new Date(q.asOfDate) : new Date();

      // Scoped active cost layers as-of date
      const where: Prisma.InventoryCostLayerWhereInput = {
        clinicId: c.clinicId,
        layerDate: { lte: asOf },
        remainingQuantity: { gt: 0 },
        costStatus: { not: 'EXHAUSTED' },
        ...(q.branchId ? { branchId: q.branchId } : {}),
        ...(q.productId ? { productId: q.productId } : {}),
        ...(q.category ? { product: { category: q.category } } : {}),
      };

      const layers = await tx.inventoryCostLayer.findMany({
        where,
        include: {
          product: { select: { id: true, sku: true, nameAr: true, category: true, unit: true } },
          branch: { select: { id: true, code: true, nameAr: true } },
          location: { select: { id: true, code: true, nameAr: true } },
          batch: { select: { id: true, batchNumber: true, expirationDate: true, status: true } },
        },
      });

      let totalUnits = new Prisma.Decimal('0.0000');
      let totalValueMinor = 0n;
      let verifiedValueMinor = 0n;
      let unverifiedValueMinor = 0n;
      let expiredValueMinor = 0n;
      let quarantinedValueMinor = 0n;

      const productSummaries = new Map<string, any>();

      for (const l of layers) {
        totalUnits = totalUnits.plus(l.remainingQuantity);
        totalValueMinor += l.totalRemainingCostMinor;

        if (l.costStatus === 'VERIFIED' || l.costStatus === 'ADJUSTED') {
          verifiedValueMinor += l.totalRemainingCostMinor;
        } else {
          unverifiedValueMinor += l.totalRemainingCostMinor;
        }

        if (l.batch) {
          if (l.batch.status === 'EXPIRED') expiredValueMinor += l.totalRemainingCostMinor;
          if (l.batch.status === 'QUARANTINED') quarantinedValueMinor += l.totalRemainingCostMinor;
        }

        // Group by product
        const existingProd = productSummaries.get(l.productId) || {
          productId: l.productId,
          sku: l.product.sku,
          nameAr: l.product.nameAr,
          category: l.product.category,
          unit: l.product.unit,
          totalUnits: new Prisma.Decimal('0.0000'),
          totalValueMinor: 0n,
          layersCount: 0,
        };
        existingProd.totalUnits = existingProd.totalUnits.plus(l.remainingQuantity);
        existingProd.totalValueMinor += l.totalRemainingCostMinor;
        existingProd.layersCount += 1;
        productSummaries.set(l.productId, existingProd);
      }

      // Stock in transit valuation from InterBranchTransfer in DISPATCHED status
      const transitTransfers = await tx.interBranchTransfer.findMany({
        where: {
          clinicId: c.clinicId,
          status: 'DISPATCHED',
          ...(q.branchId ? { sourceBranchId: q.branchId } : {}),
        },
      });

      let transitValueMinor = 0n;
      let transitUnits = new Prisma.Decimal('0.0000');
      for (const t of transitTransfers) {
        transitUnits = transitUnits.plus(t.quantity);
        // Estimate transit value by latest cost layer of that product
        const prodLayer = layers.find((l) => l.productId === t.productId);
        if (prodLayer) {
          transitValueMinor += BigInt(t.quantity.mul(prodLayer.unitLandedCostMinor.toString()).round().toString());
        }
      }

      // Reconciliation discrepancy check: physical on-hand vs FIFO layers
      const physicalBalances = await tx.inventoryBalance.findMany({
        where: {
          clinicId: c.clinicId,
          ...(q.branchId ? { location: { branchId: q.branchId } } : {}),
          ...(q.productId ? { productId: q.productId } : {}),
        },
      });

      let discrepancyCount = 0;
      let discrepancyUnits = new Prisma.Decimal('0.0000');

      for (const [prodId, prodSummary] of productSummaries.entries()) {
        const physUnits = physicalBalances
          .filter((b) => b.productId === prodId)
          .reduce((sum, b) => sum.plus(b.onHandQuantity), new Prisma.Decimal('0.0000'));
        if (!physUnits.equals(prodSummary.totalUnits)) {
          discrepancyCount++;
          discrepancyUnits = discrepancyUnits.plus(physUnits.minus(prodSummary.totalUnits).abs());
        }
      }

      return {
        clinicId: c.clinicId,
        asOfDate: asOf.toISOString(),
        currency: clinic.currency,
        currencyScale: scale,
        valuationMethod: 'FIFO_ACTUAL_LANDED_COST',
        disclaimerAr: 'تقييم المخزون المحاسبي الفعلي قائم على طبقات التكلفة التاريخية وتكلفة الوصول الفعلية (FIFO Landed Cost).',
        disclaimerEn: 'FIFO inventory valuation is based on actual acquisition cost layers and absorbed landed charges.',
        summary: {
          totalOnHandUnits: totalUnits.toFixed(4),
          totalValuation: minorToDecimalString(totalValueMinor, scale),
          totalValuationMinor: totalValueMinor.toString(),
          verifiedValuation: minorToDecimalString(verifiedValueMinor, scale),
          unverifiedValuation: minorToDecimalString(unverifiedValueMinor, scale),
          transitValuation: minorToDecimalString(transitValueMinor, scale),
          quarantinedValuation: minorToDecimalString(quarantinedValueMinor, scale),
          expiredValuation: minorToDecimalString(expiredValueMinor, scale),
          discrepancyCount,
          discrepancyUnits: discrepancyUnits.toFixed(4),
        },
        products: Array.from(productSummaries.values()).map((p) => ({
          ...p,
          totalUnits: p.totalUnits.toFixed(4),
          totalValuation: minorToDecimalString(p.totalValueMinor, scale),
        })),
      };
    });
  }

  async createValuationSnapshot(proof: VerifiedPrincipal, clinicId: string, input: CreateValuationSnapshotDto) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.costing.manage'], async (tx, c) => {
      const report = await this.getValuationReport(proof, clinicId, { branchId: input.branchId });

      const counter = await tx.inventoryValuationSnapshotCounter.upsert({
        where: { clinicId: c.clinicId },
        create: { clinicId: c.clinicId, lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
        select: { lastNumber: true },
      });
      const snapshotNumber = `VS-${String(counter.lastNumber).padStart(6, '0')}`;

      const snapshot = await tx.inventoryValuationSnapshot.create({
        data: {
          clinicId: c.clinicId,
          snapshotNumber,
          branchId: input.branchId,
          totalUnits: new Prisma.Decimal(report.summary.totalOnHandUnits),
          totalValueMinor: BigInt(report.summary.totalValuationMinor),
          verifiedValueMinor: decimalToMinor(report.summary.verifiedValuation, report.currencyScale),
          unverifiedValueMinor: decimalToMinor(report.summary.unverifiedValuation, report.currencyScale),
          transitValueMinor: decimalToMinor(report.summary.transitValuation, report.currencyScale),
          valuationMethod: 'FIFO_ACTUAL_LANDED_COST',
          breakdownJson: report.products,
          discrepancyCount: report.summary.discrepancyCount,
          status: 'PROVISIONAL',
          notes: input.notes?.trim() || null,
        },
      });

      return snapshot;
    });
  }

  // ==========================================
  // 4. BACKFILL & OPENING BALANCES
  // ==========================================

  async initializeOpeningBalances(proof: VerifiedPrincipal, clinicId: string, input: InitializeOpeningBalancesDto) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.costing.manage'], async (tx, c) => {
      const clinic = await tx.clinic.findUniqueOrThrow({ where: { id: c.clinicId }, select: { currency: true } });
      const scale = currencyScale(clinic.currency);

      const defaultCostMinor = input.defaultUnitCost ? decimalToMinor(input.defaultUnitCost, scale) : 0n;

      // Find on-hand balances without cost layers
      const balances = await tx.inventoryBalance.findMany({
        where: {
          clinicId: c.clinicId,
          onHandQuantity: { gt: 0 },
        },
        include: {
          location: true,
          product: true,
        },
      });

      let createdLayersCount = 0;

      for (const bal of balances) {
        const existingLayers = await tx.inventoryCostLayer.findFirst({
          where: {
            clinicId: c.clinicId,
            productId: bal.productId,
            locationId: bal.locationId,
            remainingQuantity: { gt: 0 },
          },
        });

        if (!existingLayers) {
          const totalCostMinor = BigInt(
            bal.onHandQuantity.mul(defaultCostMinor.toString()).round().toString(),
          );

          await tx.inventoryCostLayer.create({
            data: {
              clinicId: c.clinicId,
              productId: bal.productId,
              branchId: bal.location.branchId,
              locationId: bal.locationId,
              initialQuantity: bal.onHandQuantity,
              remainingQuantity: bal.onHandQuantity,
              unitAcquisitionCostMinor: defaultCostMinor,
              unitLandedCostMinor: defaultCostMinor,
              totalRemainingCostMinor: totalCostMinor,
              costStatus: 'UNVERIFIED_COST',
              sourceProvenance: 'OPENING_BALANCE',
              currency: clinic.currency,
            },
          });
          createdLayersCount++;
        }
      }

      return {
        success: true,
        createdLayersCount,
        message: `Provisioned ${createdLayersCount} opening cost layers in UNVERIFIED_COST status.`,
      };
    });
  }

  async approveOpeningBalances(proof: VerifiedPrincipal, clinicId: string, input: ApproveOpeningBalancesDto) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.costing.approve'], async (tx, c) => {
      const where: Prisma.InventoryCostLayerWhereInput = {
        clinicId: c.clinicId,
        costStatus: 'UNVERIFIED_COST',
        sourceProvenance: 'OPENING_BALANCE',
        ...(input.layerIds && input.layerIds.length > 0 ? { id: { in: input.layerIds } } : {}),
      };

      const updated = await tx.inventoryCostLayer.updateMany({
        where,
        data: {
          costStatus: 'VERIFIED',
          version: { increment: 1 },
        },
      });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'inventory.opening_balances.approve',
          category: 'PLATFORM',
          targetType: 'InventoryCostLayer',
          outcome: 'SUCCESS',
          metadata: { approvedCount: updated.count },
        },
        tx,
      );

      return {
        success: true,
        approvedCount: updated.count,
        message: `Approved ${updated.count} opening cost layers to VERIFIED status.`,
      };
    });
  }

  // ==========================================
  // 5. COST ADJUSTMENTS
  // ==========================================

  async createCostAdjustment(proof: VerifiedPrincipal, clinicId: string, input: CreateCostAdjustmentDto) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.costing.manage'], async (tx, c) => {
      const clinic = await tx.clinic.findUniqueOrThrow({ where: { id: c.clinicId }, select: { currency: true } });
      const scale = currencyScale(clinic.currency);

      const layer = await tx.inventoryCostLayer.findFirst({
        where: { id: input.costLayerId, clinicId: c.clinicId },
      });
      if (!layer) throw new NotFoundException('COST_LAYER_NOT_FOUND');

      const newUnitCostMinor = decimalToMinor(input.newUnitLandedCost, scale);
      const deltaUnitCostMinor = newUnitCostMinor - layer.unitLandedCostMinor;
      const totalDeltaMinor = BigInt(
        layer.remainingQuantity.mul(deltaUnitCostMinor.toString()).round().toString(),
      );

      const counter = await tx.inventoryCostAdjustmentCounter.upsert({
        where: { clinicId: c.clinicId },
        create: { clinicId: c.clinicId, lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
        select: { lastNumber: true },
      });
      const adjustmentNumber = `CA-${String(counter.lastNumber).padStart(6, '0')}`;

      const adj = await tx.inventoryCostAdjustment.create({
        data: {
          clinicId: c.clinicId,
          adjustmentNumber,
          costLayerId: layer.id,
          reason: input.reason.trim(),
          previousUnitCostMinor: layer.unitLandedCostMinor,
          newUnitCostMinor,
          deltaUnitCostMinor,
          quantityAffected: layer.remainingQuantity,
          totalDeltaMinor,
          status: 'PENDING',
          notes: input.notes?.trim() || null,
        },
      });

      return adj;
    });
  }

  async decideCostAdjustment(proof: VerifiedPrincipal, clinicId: string, adjustmentId: string, input: DecideCostAdjustmentDto) {
    return this.database.withClinicContext(proof, clinicId, ['inventory.costing.approve'], async (tx, c) => {
      const adj = await tx.inventoryCostAdjustment.findFirst({
        where: { id: adjustmentId, clinicId: c.clinicId },
        include: { costLayer: true },
      });
      if (!adj) throw new NotFoundException('COST_ADJUSTMENT_NOT_FOUND');
      if (adj.status !== 'PENDING') throw new ConflictException(`Adjustment already decided with status ${adj.status}`);

      if (input.decision === 'REJECTED') {
        const updated = await tx.inventoryCostAdjustment.update({
          where: { id: adj.id },
          data: {
            status: 'REJECTED',
            approvedByMembershipId: c.membershipId,
            approvedAt: new Date(),
            notes: input.notes?.trim() || adj.notes,
          },
        });
        return updated;
      }

      // Apply adjustment to cost layer
      const layer = adj.costLayer;
      const newTotalRemainingCostMinor = BigInt(
        layer.remainingQuantity.mul(adj.newUnitCostMinor.toString()).round().toString(),
      );

      await tx.inventoryCostLayer.update({
        where: { id: layer.id },
        data: {
          unitLandedCostMinor: adj.newUnitCostMinor,
          totalRemainingCostMinor: newTotalRemainingCostMinor,
          costStatus: 'ADJUSTED',
          version: { increment: 1 },
        },
      });

      // Record adjustment movement
      const counter = await tx.inventoryCostMovementCounter.upsert({
        where: { clinicId: c.clinicId },
        create: { clinicId: c.clinicId, lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
        select: { lastNumber: true },
      });
      const movementNumber = `CM-${String(counter.lastNumber).padStart(6, '0')}`;

      await tx.inventoryCostMovement.create({
        data: {
          clinicId: c.clinicId,
          movementNumber,
          costLayerId: layer.id,
          movementType: 'ADJUSTMENT',
          quantity: layer.remainingQuantity,
          unitCostMinor: adj.newUnitCostMinor,
          totalCostMinor: newTotalRemainingCostMinor,
          notes: `Cost adjustment approved: ${adj.adjustmentNumber} (${adj.reason})`,
        },
      });

      const updated = await tx.inventoryCostAdjustment.update({
        where: { id: adj.id },
        data: {
          status: 'APPROVED',
          approvedByMembershipId: c.membershipId,
          approvedAt: new Date(),
          notes: input.notes?.trim() || adj.notes,
        },
      });

      return updated;
    });
  }

  // ==========================================
  // 6. INTERNAL INTEGRATION HOOKS (FIFO Engine)
  // ==========================================

  /**
   * Called within transactional boundary when goods receipt is recorded
   */
  async createCostLayerForReceiptLine(
    tx: TenantTransaction,
    clinicId: string,
    params: {
      productId: string;
      branchId?: string | null;
      locationId: string;
      batchId?: string | null;
      goodsReceiptLineId: string;
      receivedQuantity: Prisma.Decimal;
      unitCost: Prisma.Decimal;
      layerDate: Date;
    },
  ) {
    const clinic = await tx.clinic.findUniqueOrThrow({ where: { id: clinicId }, select: { currency: true } });
    const scale = currencyScale(clinic.currency);

    const unitAcquisitionCostMinor = decimalToMinor(params.unitCost, scale);
    const totalRemainingCostMinor = BigInt(
      params.receivedQuantity.mul(unitAcquisitionCostMinor.toString()).round().toString(),
    );

    const layer = await tx.inventoryCostLayer.create({
      data: {
        clinicId,
        productId: params.productId,
        branchId: params.branchId,
        locationId: params.locationId,
        batchId: params.batchId,
        goodsReceiptLineId: params.goodsReceiptLineId,
        layerDate: params.layerDate,
        initialQuantity: params.receivedQuantity,
        remainingQuantity: params.receivedQuantity,
        unitAcquisitionCostMinor,
        unitLandedCostMinor: unitAcquisitionCostMinor,
        totalRemainingCostMinor,
        costStatus: 'VERIFIED',
        sourceProvenance: 'GOODS_RECEIPT',
        currency: clinic.currency,
      },
    });

    // Create receipt cost movement
    const counter = await tx.inventoryCostMovementCounter.upsert({
      where: { clinicId },
      create: { clinicId, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
      select: { lastNumber: true },
    });
    const movementNumber = `CM-${String(counter.lastNumber).padStart(6, '0')}`;

    await tx.inventoryCostMovement.create({
      data: {
        clinicId,
        movementNumber,
        costLayerId: layer.id,
        movementType: 'RECEIPT',
        quantity: params.receivedQuantity,
        unitCostMinor: unitAcquisitionCostMinor,
        totalCostMinor: totalRemainingCostMinor,
        notes: `Goods receipt line ${params.goodsReceiptLineId}`,
      },
    });

    return layer;
  }

  /**
   * Called within transactional boundary when clinical consumption or stock issue occurs
   */
  async allocateFifoConsumption(
    tx: TenantTransaction,
    clinicId: string,
    params: {
      productId: string;
      branchId?: string | null;
      batchId?: string | null;
      quantity: Prisma.Decimal;
      wasteQuantity?: Prisma.Decimal;
      consumptionId?: string;
      stockMovementId?: string;
      notes?: string;
    },
  ) {
    const totalNeeded = params.quantity.plus(params.wasteQuantity || 0);
    if (totalNeeded.lessThanOrEqualTo(0)) return { totalAllocatedCostMinor: 0n, movements: [] };

    // Query eligible active layers
    const layers = await tx.inventoryCostLayer.findMany({
      where: {
        clinicId,
        productId: params.productId,
        remainingQuantity: { gt: 0 },
        costStatus: { in: ['VERIFIED', 'UNVERIFIED_COST', 'ADJUSTED'] },
        ...(params.branchId ? { branchId: params.branchId } : {}),
      },
      orderBy: [{ layerDate: 'asc' }, { id: 'asc' }],
    });

    // If batchId is provided, prioritize layers for that batch, but preserve FIFO within batch
    const sortedLayers = [...layers].sort((a, b) => {
      if (params.batchId) {
        const aMatches = a.batchId === params.batchId;
        const bMatches = b.batchId === params.batchId;
        if (aMatches && !bMatches) return -1;
        if (!aMatches && bMatches) return 1;
      }
      return a.layerDate.getTime() - b.layerDate.getTime();
    });

    let remainingToAllocate = totalNeeded;
    let totalAllocatedCostMinor = 0n;
    let totalWasteCostMinor = 0n;
    const allocatedMovements = [];

    for (const layer of sortedLayers) {
      if (remainingToAllocate.lessThanOrEqualTo(0)) break;

      const takeQty = Prisma.Decimal.min(remainingToAllocate, layer.remainingQuantity);
      const newRemainingQty = layer.remainingQuantity.minus(takeQty);

      const costMinor = BigInt(
        takeQty.mul(layer.unitLandedCostMinor.toString()).round().toString(),
      );
      totalAllocatedCostMinor += costMinor;

      // Apportion waste cost if applicable
      let wasteCostMinor = 0n;
      if (params.wasteQuantity && params.wasteQuantity.greaterThan(0)) {
        const wasteRatio = params.wasteQuantity.div(totalNeeded);
        wasteCostMinor = BigInt(
          takeQty.mul(wasteRatio).mul(layer.unitLandedCostMinor.toString()).round().toString(),
        );
        totalWasteCostMinor += wasteCostMinor;
      }

      const newTotalCostMinor = BigInt(
        newRemainingQty.mul(layer.unitLandedCostMinor.toString()).round().toString(),
      );

      await tx.inventoryCostLayer.update({
        where: { id: layer.id },
        data: {
          remainingQuantity: newRemainingQty,
          totalRemainingCostMinor: newTotalCostMinor,
          costStatus: newRemainingQty.equals(0) ? 'EXHAUSTED' : layer.costStatus,
          version: { increment: 1 },
        },
      });

      const counter = await tx.inventoryCostMovementCounter.upsert({
        where: { clinicId },
        create: { clinicId, lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
        select: { lastNumber: true },
      });
      const movementNumber = `CM-${String(counter.lastNumber).padStart(6, '0')}`;

      const movement = await tx.inventoryCostMovement.create({
        data: {
          clinicId,
          movementNumber,
          costLayerId: layer.id,
          consumptionId: params.consumptionId,
          stockMovementId: params.stockMovementId,
          movementType: params.consumptionId ? 'CONSUMPTION' : 'ISSUE',
          quantity: takeQty,
          unitCostMinor: layer.unitLandedCostMinor,
          totalCostMinor: costMinor,
          wasteCostMinor,
          notes: params.notes || null,
        },
      });
      allocatedMovements.push(movement);

      remainingToAllocate = remainingToAllocate.minus(takeQty);
    }

    return {
      totalAllocatedCostMinor,
      totalWasteCostMinor,
      remainingUnallocatedQty: remainingToAllocate,
      movements: allocatedMovements,
    };
  }

  // ==========================================
  // 7. SERIALIZERS
  // ==========================================

  private serializeLandedCost(lc: any, scale: number) {
    return {
      ...lc,
      freightCost: minorToDecimalString(lc.freightCostMinor, scale),
      customsDuty: minorToDecimalString(lc.customsDutyMinor, scale),
      insuranceCost: minorToDecimalString(lc.insuranceCostMinor, scale),
      handlingCost: minorToDecimalString(lc.handlingCostMinor, scale),
      otherCharges: minorToDecimalString(lc.otherChargesMinor, scale),
      discountCredit: minorToDecimalString(lc.discountCreditMinor, scale),
      totalLandedCost: minorToDecimalString(lc.totalLandedCostMinor, scale),
      allocationLines: lc.allocationLines?.map((line: any) => ({
        ...line,
        allocatedAmount: minorToDecimalString(line.allocatedAmountMinor, scale),
        roundingRemainder: minorToDecimalString(line.roundingRemainderMinor, scale),
      })),
    };
  }

  private serializeCostLayer(l: any, scale: number) {
    return {
      ...l,
      initialQuantity: l.initialQuantity.toString(),
      remainingQuantity: l.remainingQuantity.toString(),
      unitAcquisitionCost: minorToDecimalString(l.unitAcquisitionCostMinor, scale),
      unitLandedCost: minorToDecimalString(l.unitLandedCostMinor, scale),
      totalRemainingCost: minorToDecimalString(l.totalRemainingCostMinor, scale),
    };
  }
}
