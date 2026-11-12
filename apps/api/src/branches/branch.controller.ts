import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ClinicPermissions, type AuthRequest } from '../auth/access.js';
import { AuthService } from '../auth/auth.service.js';
import { BranchRepository } from '../prisma/branch.repository.js';
import {
  CreateBranchDto,
  UpdateBranchDto,
  AssignStaffBranchDto,
  SwitchBranchDto,
  DispatchTransferDto,
  ReceiveTransferDto,
  CancelTransferDto,
} from './branch.dto.js';

interface ClinicRouteParams {
  clinicId: string;
}

interface BranchRouteParams extends ClinicRouteParams {
  branchId: string;
}

interface BranchStaffRouteParams extends BranchRouteParams {
  membershipId: string;
}

interface TransferRouteParams extends ClinicRouteParams {
  transferId: string;
}

@Controller('clinics/:clinicId/branches')
export class BranchController {
  constructor(
    private readonly repository: BranchRepository,
    private readonly authService: AuthService,
  ) {}

  @Get()
  @ClinicPermissions('branches.read')
  list(@Req() req: AuthRequest, @Param() params: ClinicRouteParams) {
    return this.repository.listBranches(req.auth!.principal, params.clinicId);
  }

  @Post()
  @ClinicPermissions('branches.manage')
  create(
    @Req() req: AuthRequest,
    @Param() params: ClinicRouteParams,
    @Body() body: CreateBranchDto,
  ) {
    return this.repository.createBranch(req.auth!.principal, params.clinicId, body);
  }

  @Post('switch')
  @ClinicPermissions('branches.read')
  async switch(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
    @Param() params: ClinicRouteParams,
    @Body() body: SwitchBranchDto,
  ) {
    const result = await this.repository.validateBranchSwitch(req.auth!.principal, params.clinicId, body.branchId);
    await this.authService.rotate(req, res, params.clinicId, body.branchId);
    return result;
  }

  // Inter-branch stock transfers
  @Get('transfers')
  @ClinicPermissions('inventory.transfers.read')
  listTransfers(
    @Req() req: AuthRequest,
    @Param() params: ClinicRouteParams,
    @Query('branchId') branchId?: string,
    @Query('status') status?: string,
  ) {
    return this.repository.listTransfers(req.auth!.principal, params.clinicId, {
      branchId,
      status,
    });
  }

  @Post('transfers/dispatch')
  @ClinicPermissions('inventory.transfers.manage')
  dispatchTransfer(
    @Req() req: AuthRequest,
    @Param() params: ClinicRouteParams,
    @Body() body: DispatchTransferDto,
  ) {
    return this.repository.dispatchTransfer(req.auth!.principal, params.clinicId, body);
  }

  @Post('transfers/:transferId/receive')
  @ClinicPermissions('inventory.transfers.manage')
  receiveTransfer(
    @Req() req: AuthRequest,
    @Param() params: TransferRouteParams,
    @Body() body: ReceiveTransferDto,
  ) {
    return this.repository.receiveTransfer(
      req.auth!.principal,
      params.clinicId,
      params.transferId,
      body,
    );
  }

  @Post('transfers/:transferId/cancel')
  @ClinicPermissions('inventory.transfers.manage')
  cancelTransfer(
    @Req() req: AuthRequest,
    @Param() params: TransferRouteParams,
    @Body() body: CancelTransferDto,
  ) {
    return this.repository.cancelTransfer(
      req.auth!.principal,
      params.clinicId,
      params.transferId,
      body,
    );
  }

  @Get(':branchId')
  @ClinicPermissions('branches.read')
  getOne(@Req() req: AuthRequest, @Param() params: BranchRouteParams) {
    return this.repository.getBranch(req.auth!.principal, params.clinicId, params.branchId);
  }

  @Patch(':branchId')
  @ClinicPermissions('branches.manage')
  update(
    @Req() req: AuthRequest,
    @Param() params: BranchRouteParams,
    @Body() body: UpdateBranchDto,
  ) {
    return this.repository.updateBranch(
      req.auth!.principal,
      params.clinicId,
      params.branchId,
      body,
    );
  }

  @Get(':branchId/staff')
  @ClinicPermissions('branches.read')
  listStaff(@Req() req: AuthRequest, @Param() params: BranchRouteParams) {
    return this.repository.listBranchStaff(
      req.auth!.principal,
      params.clinicId,
      params.branchId,
    );
  }

  @Post(':branchId/staff')
  @ClinicPermissions('branches.manage')
  assignStaff(
    @Req() req: AuthRequest,
    @Param() params: BranchRouteParams,
    @Body() body: AssignStaffBranchDto,
  ) {
    return this.repository.assignStaff(
      req.auth!.principal,
      params.clinicId,
      params.branchId,
      body,
    );
  }

  @Delete(':branchId/staff/:membershipId')
  @ClinicPermissions('branches.manage')
  removeStaff(@Req() req: AuthRequest, @Param() params: BranchStaffRouteParams) {
    return this.repository.removeStaff(
      req.auth!.principal,
      params.clinicId,
      params.branchId,
      params.membershipId,
    );
  }

  @Post(':branchId/staff/:membershipId/primary')
  @ClinicPermissions('branches.manage')
  setPrimary(@Req() req: AuthRequest, @Param() params: BranchStaffRouteParams) {
    return this.repository.setPrimaryBranch(
      req.auth!.principal,
      params.clinicId,
      params.branchId,
      params.membershipId,
    );
  }
}
