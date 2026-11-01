import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ClinicPermissions, type AuthRequest } from '../auth/access.js';
import { InventoryRepository } from '../prisma/inventory.repository.js';
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
} from './inventory-input.js';

@Controller('clinics/:clinicId/inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryRepository) {}

  // Products
  @Get('products')
  @ClinicPermissions('inventory.products.read')
  listProducts(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Query() query: ProductListQuery,
  ) {
    return this.inventory.listProducts(req.auth!.principal, clinicId, query);
  }

  @Get('products/:productId')
  @ClinicPermissions('inventory.products.read')
  getProduct(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('productId') productId: string,
  ) {
    return this.inventory.getProduct(req.auth!.principal, clinicId, productId);
  }

  @Post('products')
  @ClinicPermissions('inventory.products.manage')
  createProduct(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Body() body: CreateProductDto,
  ) {
    return this.inventory.createProduct(req.auth!.principal, clinicId, body);
  }

  @Patch('products/:productId')
  @ClinicPermissions('inventory.products.manage')
  updateProduct(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('productId') productId: string,
    @Body() body: UpdateProductDto,
  ) {
    return this.inventory.updateProduct(req.auth!.principal, clinicId, productId, body);
  }

  // Locations
  @Get('locations')
  @ClinicPermissions('inventory.locations.read')
  listLocations(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
  ) {
    return this.inventory.listLocations(req.auth!.principal, clinicId);
  }

  @Get('locations/:locationId')
  @ClinicPermissions('inventory.locations.read')
  getLocation(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('locationId') locationId: string,
  ) {
    return this.inventory.getLocation(req.auth!.principal, clinicId, locationId);
  }

  @Post('locations')
  @ClinicPermissions('inventory.locations.manage')
  createLocation(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Body() body: CreateLocationDto,
  ) {
    return this.inventory.createLocation(req.auth!.principal, clinicId, body);
  }

  @Patch('locations/:locationId')
  @ClinicPermissions('inventory.locations.manage')
  updateLocation(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('locationId') locationId: string,
    @Body() body: UpdateLocationDto,
  ) {
    return this.inventory.updateLocation(req.auth!.principal, clinicId, locationId, body);
  }

  // Stock Operations
  @Post('stock/opening-balance')
  @ClinicPermissions('inventory.stock.adjust')
  postOpeningBalance(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Body() body: OpeningBalanceDto,
    @Headers('x-idempotency-key') headerIdempotency?: string,
  ) {
    const idempotencyKey = body.idempotencyKey || headerIdempotency;
    return this.inventory.postOpeningBalance(req.auth!.principal, clinicId, { ...body, idempotencyKey });
  }

  @Post('stock/receive')
  @ClinicPermissions('inventory.stock.receive')
  receiveStock(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Body() body: ReceiveStockDto,
    @Headers('x-idempotency-key') headerIdempotency?: string,
  ) {
    const idempotencyKey = body.idempotencyKey || headerIdempotency;
    return this.inventory.receiveStock(req.auth!.principal, clinicId, { ...body, idempotencyKey });
  }

  @Post('stock/issue')
  @ClinicPermissions('inventory.stock.issue')
  issueStock(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Body() body: IssueStockDto,
    @Headers('x-idempotency-key') headerIdempotency?: string,
  ) {
    const idempotencyKey = body.idempotencyKey || headerIdempotency;
    return this.inventory.issueStock(req.auth!.principal, clinicId, { ...body, idempotencyKey });
  }

  @Post('stock/transfer')
  @ClinicPermissions('inventory.stock.transfer')
  transferStock(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Body() body: TransferStockDto,
    @Headers('x-idempotency-key') headerIdempotency?: string,
  ) {
    const idempotencyKey = body.idempotencyKey || headerIdempotency;
    return this.inventory.transferStock(req.auth!.principal, clinicId, { ...body, idempotencyKey });
  }

  @Post('stock/adjust')
  @ClinicPermissions('inventory.stock.adjust')
  adjustStock(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Body() body: AdjustStockDto,
    @Headers('x-idempotency-key') headerIdempotency?: string,
  ) {
    const idempotencyKey = body.idempotencyKey || headerIdempotency;
    return this.inventory.adjustStock(req.auth!.principal, clinicId, { ...body, idempotencyKey });
  }

  @Get('stock/balances')
  @ClinicPermissions('inventory.stock.read')
  listBalances(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Query() query: StockBalancesQuery,
  ) {
    return this.inventory.listBalances(req.auth!.principal, clinicId, query);
  }

  @Get('stock/movements')
  @ClinicPermissions('inventory.movements.read')
  listMovements(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Query() query: MovementsQuery,
  ) {
    return this.inventory.listMovements(req.auth!.principal, clinicId, query);
  }

  @Post('stock/reconcile')
  @ClinicPermissions('inventory.reconcile')
  reconcileLedger(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
  ) {
    return this.inventory.reconcileLedger(req.auth!.principal, clinicId);
  }

  // Batches
  @Get('batches')
  @ClinicPermissions('inventory.batches.read')
  listBatches(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Query() query: BatchListQuery,
  ) {
    return this.inventory.listBatches(req.auth!.principal, clinicId, query);
  }

  @Get('batches/expiry-report')
  @ClinicPermissions('inventory.batches.read')
  getExpiryReport(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Query() query: ExpiryReportQuery,
  ) {
    return this.inventory.getExpiryReport(req.auth!.principal, clinicId, query);
  }

  @Get('batches/:batchId')
  @ClinicPermissions('inventory.batches.read')
  getBatch(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('batchId') batchId: string,
  ) {
    return this.inventory.getBatch(req.auth!.principal, clinicId, batchId);
  }

  @Post('batches')
  @ClinicPermissions('inventory.batches.manage')
  createBatch(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Body() body: CreateBatchDto,
    @Headers('x-idempotency-key') headerIdempotency?: string,
  ) {
    const idempotencyKey = body.idempotencyKey || headerIdempotency;
    return this.inventory.createBatch(req.auth!.principal, clinicId, { ...body, idempotencyKey });
  }

  @Patch('batches/:batchId/status')
  @ClinicPermissions('inventory.batches.read')
  updateBatchStatus(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('batchId') batchId: string,
    @Body() body: UpdateBatchStatusDto,
  ) {
    return this.inventory.updateBatchStatus(req.auth!.principal, clinicId, batchId, body);
  }

  @Post('batches/:batchId/quarantine')
  @ClinicPermissions('inventory.batches.quarantine')
  quarantineBatch(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('batchId') batchId: string,
    @Body() body: { reason: string },
  ) {
    return this.inventory.updateBatchStatus(req.auth!.principal, clinicId, batchId, {
      status: 'QUARANTINED',
      reason: body.reason,
    });
  }

  @Post('batches/:batchId/recall')
  @ClinicPermissions('inventory.batches.recall')
  recallBatch(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('batchId') batchId: string,
    @Body() body: { reason: string },
  ) {
    return this.inventory.updateBatchStatus(req.auth!.principal, clinicId, batchId, {
      status: 'RECALLED',
      reason: body.reason,
    });
  }

  @Post('batches/:batchId/release')
  @ClinicPermissions('inventory.batches.manage')
  releaseBatch(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('batchId') batchId: string,
  ) {
    return this.inventory.updateBatchStatus(req.auth!.principal, clinicId, batchId, {
      status: 'AVAILABLE',
    });
  }

  @Post('batches/receive')
  @ClinicPermissions('inventory.stock.receive')
  receiveBatchStock(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Body() body: ReceiveBatchStockDto,
    @Headers('x-idempotency-key') headerIdempotency?: string,
  ) {
    const idempotencyKey = body.idempotencyKey || headerIdempotency;
    return this.inventory.receiveBatchStock(req.auth!.principal, clinicId, { ...body, idempotencyKey });
  }

  @Post('batches/issue')
  @ClinicPermissions('inventory.stock.issue')
  issueBatchStock(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Body() body: IssueBatchStockDto,
    @Headers('x-idempotency-key') headerIdempotency?: string,
  ) {
    const idempotencyKey = body.idempotencyKey || headerIdempotency;
    return this.inventory.issueBatchStock(req.auth!.principal, clinicId, { ...body, idempotencyKey });
  }

  @Post('batches/transfer')
  @ClinicPermissions('inventory.stock.transfer')
  transferBatchStock(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Body() body: TransferBatchStockDto,
    @Headers('x-idempotency-key') headerIdempotency?: string,
  ) {
    const idempotencyKey = body.idempotencyKey || headerIdempotency;
    return this.inventory.transferBatchStock(req.auth!.principal, clinicId, { ...body, idempotencyKey });
  }

  // Clinical Consumption
  @Post('clinical-consumption')
  @ClinicPermissions('clinical.inventory-consumption.record')
  recordClinicalConsumption(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Body() body: RecordClinicalConsumptionDto,
    @Headers('x-idempotency-key') headerIdempotency?: string,
  ) {
    const idempotencyKey = body.idempotencyKey || headerIdempotency;
    return this.inventory.recordClinicalConsumption(req.auth!.principal, clinicId, {
      ...body,
      idempotencyKey,
    });
  }

  @Post('clinical-consumption/:consumptionId/void')
  @ClinicPermissions('clinical.inventory-consumption.record')
  voidClinicalConsumption(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('consumptionId') consumptionId: string,
    @Body() body: VoidClinicalConsumptionDto,
    @Headers('x-idempotency-key') headerIdempotency?: string,
  ) {
    const idempotencyKey = body.idempotencyKey || headerIdempotency;
    return this.inventory.voidClinicalConsumption(req.auth!.principal, clinicId, consumptionId, {
      ...body,
      idempotencyKey,
    });
  }

  @Get('clinical-consumption')
  @ClinicPermissions('inventory.clinical-consumption.read')
  listClinicalConsumptions(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Query() query: ClinicalConsumptionListQuery,
  ) {
    return this.inventory.listClinicalConsumptions(req.auth!.principal, clinicId, query);
  }

  @Get('clinical-consumption/procedure/:procedureExecutionId')
  @ClinicPermissions('inventory.clinical-consumption.read')
  getProcedureConsumptions(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('procedureExecutionId') procedureExecutionId: string,
  ) {
    return this.inventory.getProcedureConsumptions(req.auth!.principal, clinicId, procedureExecutionId);
  }

  // Suppliers
  @Post('suppliers')
  @ClinicPermissions('inventory.suppliers.manage')
  createSupplier(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Body() body: CreateSupplierDto,
  ) {
    return this.inventory.createSupplier(req.auth!.principal, clinicId, body);
  }

  @Patch('suppliers/:supplierId')
  @ClinicPermissions('inventory.suppliers.manage')
  updateSupplier(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('supplierId') supplierId: string,
    @Body() body: UpdateSupplierDto,
  ) {
    return this.inventory.updateSupplier(req.auth!.principal, clinicId, supplierId, body);
  }

  @Get('suppliers/:supplierId')
  @ClinicPermissions('inventory.suppliers.read')
  getSupplier(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('supplierId') supplierId: string,
  ) {
    return this.inventory.getSupplier(req.auth!.principal, clinicId, supplierId);
  }

  @Get('suppliers')
  @ClinicPermissions('inventory.suppliers.read')
  listSuppliers(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Query() query: SupplierListQuery,
  ) {
    return this.inventory.listSuppliers(req.auth!.principal, clinicId, query);
  }

  // Purchase Orders
  @Post('purchase-orders')
  @ClinicPermissions('inventory.purchase-orders.create')
  createPurchaseOrder(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Body() body: CreatePurchaseOrderDto,
  ) {
    return this.inventory.createPurchaseOrder(req.auth!.principal, clinicId, body);
  }

  @Patch('purchase-orders/:poId')
  @ClinicPermissions('inventory.purchase-orders.create')
  updatePurchaseOrder(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('poId') poId: string,
    @Body() body: UpdatePurchaseOrderDto,
  ) {
    return this.inventory.updatePurchaseOrder(req.auth!.principal, clinicId, poId, body);
  }

  @Post('purchase-orders/:poId/submit')
  @ClinicPermissions('inventory.purchase-orders.submit')
  submitPurchaseOrder(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('poId') poId: string,
    @Body() body: SubmitPurchaseOrderDto,
  ) {
    return this.inventory.submitPurchaseOrder(req.auth!.principal, clinicId, poId, body);
  }

  @Post('purchase-orders/:poId/approve')
  @ClinicPermissions('inventory.purchase-orders.approve')
  approvePurchaseOrder(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('poId') poId: string,
    @Body() body: ApprovePurchaseOrderDto,
  ) {
    return this.inventory.approvePurchaseOrder(req.auth!.principal, clinicId, poId, body);
  }

  @Post('purchase-orders/:poId/reject')
  @ClinicPermissions('inventory.purchase-orders.approve')
  rejectPurchaseOrder(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('poId') poId: string,
    @Body() body: RejectPurchaseOrderDto,
  ) {
    return this.inventory.rejectPurchaseOrder(req.auth!.principal, clinicId, poId, body);
  }

  @Post('purchase-orders/:poId/cancel')
  @ClinicPermissions('inventory.purchase-orders.cancel')
  cancelPurchaseOrder(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('poId') poId: string,
    @Body() body: CancelPurchaseOrderDto,
  ) {
    return this.inventory.cancelPurchaseOrder(req.auth!.principal, clinicId, poId, body);
  }

  @Get('purchase-orders/:poId')
  @ClinicPermissions('inventory.purchase-orders.read')
  getPurchaseOrder(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('poId') poId: string,
  ) {
    return this.inventory.getPurchaseOrder(req.auth!.principal, clinicId, poId);
  }

  @Get('purchase-orders')
  @ClinicPermissions('inventory.purchase-orders.read')
  listPurchaseOrders(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Query() query: PurchaseOrderListQuery,
  ) {
    return this.inventory.listPurchaseOrders(req.auth!.principal, clinicId, query);
  }

  // Goods Receipts
  @Post('goods-receipts')
  @ClinicPermissions('inventory.goods-receipt.record')
  receiveGoods(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Body() body: ReceiveGoodsDto,
    @Headers('x-idempotency-key') headerIdempotency?: string,
  ) {
    const idempotencyKey = body.idempotencyKey || headerIdempotency;
    return this.inventory.receiveGoods(req.auth!.principal, clinicId, {
      ...body,
      idempotencyKey,
    });
  }

  @Get('goods-receipts/:receiptId')
  @ClinicPermissions('inventory.goods-receipt.read')
  getGoodsReceipt(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('receiptId') receiptId: string,
  ) {
    return this.inventory.getGoodsReceipt(req.auth!.principal, clinicId, receiptId);
  }

  @Get('goods-receipts')
  @ClinicPermissions('inventory.goods-receipt.read')
  listGoodsReceipts(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Query() query: GoodsReceiptListQuery,
  ) {
    return this.inventory.listGoodsReceipts(req.auth!.principal, clinicId, query);
  }

  // Stock Counts
  @Post('stock-counts')
  @ClinicPermissions('inventory.stock-counts.manage')
  createStockCount(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Body() body: CreateStockCountDto,
  ) {
    return this.inventory.createStockCount(req.auth!.principal, clinicId, body);
  }

  @Post('stock-counts/:countId/items')
  @ClinicPermissions('inventory.stock-counts.manage')
  recordStockCountItems(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('countId') countId: string,
    @Body() body: RecordStockCountItemsDto,
  ) {
    return this.inventory.recordStockCountItems(req.auth!.principal, clinicId, countId, body);
  }

  @Post('stock-counts/:countId/reconcile')
  @ClinicPermissions('inventory.stock-counts.approve')
  reconcileStockCount(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('countId') countId: string,
    @Body() body: ReconcileStockCountDto,
    @Headers('x-idempotency-key') headerIdempotency?: string,
  ) {
    const idempotencyKey = body.idempotencyKey || headerIdempotency;
    return this.inventory.reconcileStockCount(req.auth!.principal, clinicId, countId, {
      ...body,
      idempotencyKey,
    });
  }

  @Get('stock-counts/:countId')
  @ClinicPermissions('inventory.stock-counts.read')
  getStockCount(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('countId') countId: string,
  ) {
    return this.inventory.getStockCount(req.auth!.principal, clinicId, countId);
  }

  @Get('stock-counts')
  @ClinicPermissions('inventory.stock-counts.read')
  listStockCounts(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Query() query: StockCountListQuery,
  ) {
    return this.inventory.listStockCounts(req.auth!.principal, clinicId, query);
  }

  // Inventory Alerts
  @Get('alerts')
  @ClinicPermissions('inventory.alerts.read')
  getInventoryAlerts(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Query() query: InventoryAlertQuery,
  ) {
    return this.inventory.getInventoryAlerts(req.auth!.principal, clinicId, query);
  }

  @Post('alerts/acknowledge')
  @ClinicPermissions('inventory.alerts.acknowledge')
  acknowledgeAlert(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Body() body: AcknowledgeAlertDto,
  ) {
    return this.inventory.acknowledgeAlert(req.auth!.principal, clinicId, body);
  }
}

