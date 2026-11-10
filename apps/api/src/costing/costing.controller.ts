import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ClinicPermissions, type AuthRequest } from '../auth/access.js';
import { CostingRepository } from '../prisma/costing.repository.js';
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
} from './costing.dto.js';

interface ClinicRouteParams {
  clinicId: string;
}

interface ItemRouteParams extends ClinicRouteParams {
  id: string;
}

@Controller('clinics/:clinicId/costing')
export class CostingController {
  constructor(private readonly costing: CostingRepository) {}

  @Get('landed-costs')
  @ClinicPermissions('inventory.costing.read')
  async listLandedCosts(
    @Req() req: AuthRequest,
    @Param() params: ClinicRouteParams,
  ) {
    return this.costing.listLandedCosts(req.auth!.principal, params.clinicId);
  }

  @Post('landed-costs')
  @ClinicPermissions('inventory.costing.manage')
  async draftLandedCost(
    @Req() req: AuthRequest,
    @Param() params: ClinicRouteParams,
    @Body() dto: CreateLandedCostDto,
  ) {
    return this.costing.draftLandedCost(req.auth!.principal, params.clinicId, dto);
  }

  @Get('landed-costs/:id')
  @ClinicPermissions('inventory.costing.read')
  async getLandedCost(
    @Req() req: AuthRequest,
    @Param() params: ItemRouteParams,
  ) {
    return this.costing.getLandedCost(req.auth!.principal, params.clinicId, params.id);
  }

  @Post('landed-costs/:id/approve')
  @ClinicPermissions('inventory.costing.approve')
  async approveLandedCost(
    @Req() req: AuthRequest,
    @Param() params: ItemRouteParams,
    @Body() dto: ApproveLandedCostDto,
  ) {
    return this.costing.approveLandedCost(req.auth!.principal, params.clinicId, params.id, dto);
  }

  @Get('layers')
  @ClinicPermissions('inventory.costing.read')
  async listCostLayers(
    @Req() req: AuthRequest,
    @Param() params: ClinicRouteParams,
    @Query() q: CostLayerQueryDto,
  ) {
    return this.costing.listCostLayers(req.auth!.principal, params.clinicId, q);
  }

  @Get('movements')
  @ClinicPermissions('inventory.costing.read')
  async listCostMovements(
    @Req() req: AuthRequest,
    @Param() params: ClinicRouteParams,
    @Query('layerId') layerId?: string,
  ) {
    return this.costing.listCostMovements(req.auth!.principal, params.clinicId, layerId);
  }

  @Get('valuation')
  @ClinicPermissions('inventory.costing.read')
  async getValuationReport(
    @Req() req: AuthRequest,
    @Param() params: ClinicRouteParams,
    @Query() q: ValuationQueryDto,
  ) {
    return this.costing.getValuationReport(req.auth!.principal, params.clinicId, q);
  }

  @Post('snapshots')
  @ClinicPermissions('inventory.costing.manage')
  async createValuationSnapshot(
    @Req() req: AuthRequest,
    @Param() params: ClinicRouteParams,
    @Body() dto: CreateValuationSnapshotDto,
  ) {
    return this.costing.createValuationSnapshot(req.auth!.principal, params.clinicId, dto);
  }

  @Post('opening-balances')
  @ClinicPermissions('inventory.costing.manage')
  async initializeOpeningBalances(
    @Req() req: AuthRequest,
    @Param() params: ClinicRouteParams,
    @Body() dto: InitializeOpeningBalancesDto,
  ) {
    return this.costing.initializeOpeningBalances(req.auth!.principal, params.clinicId, dto);
  }

  @Post('opening-balances/approve')
  @ClinicPermissions('inventory.costing.approve')
  async approveOpeningBalances(
    @Req() req: AuthRequest,
    @Param() params: ClinicRouteParams,
    @Body() dto: ApproveOpeningBalancesDto,
  ) {
    return this.costing.approveOpeningBalances(req.auth!.principal, params.clinicId, dto);
  }

  @Post('adjustments')
  @ClinicPermissions('inventory.costing.manage')
  async createCostAdjustment(
    @Req() req: AuthRequest,
    @Param() params: ClinicRouteParams,
    @Body() dto: CreateCostAdjustmentDto,
  ) {
    return this.costing.createCostAdjustment(req.auth!.principal, params.clinicId, dto);
  }

  @Patch('adjustments/:id/decide')
  @ClinicPermissions('inventory.costing.approve')
  async decideCostAdjustment(
    @Req() req: AuthRequest,
    @Param() params: ItemRouteParams,
    @Body() dto: DecideCostAdjustmentDto,
  ) {
    return this.costing.decideCostAdjustment(req.auth!.principal, params.clinicId, params.id, dto);
  }
}
