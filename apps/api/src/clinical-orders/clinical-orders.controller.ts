import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ClinicPermissions, type AuthRequest } from '../auth/access.js';
import { ClinicalOrdersRepository } from '../prisma/clinical-orders.repository.js';
import {
  CreateGeneralClinicalServiceDto,
  UpdateGeneralClinicalServiceDto,
  GeneralClinicalServiceQueryDto,
  CreateClinicalOrderDto,
  UpdateClinicalOrderStatusDto,
  CancelClinicalOrderDto,
  ClinicalOrderQueryDto,
  RecordOrderResultDto,
  VerifyOrderResultDto,
  CorrectOrderResultDto,
  AcknowledgeCriticalResultDto,
  ReleaseResultToPatientDto,
  CreateClinicalDocumentDto,
  UpdateClinicalDocumentDto,
  ClinicalDocumentQueryDto,
  CreateDraftInvoiceForOrderDto,
  CreateDraftInvoiceForGeneralServiceDto,
} from './clinical-orders.dto.js';

interface ClinicRouteParams {
  clinicId: string;
}

interface ClinicServiceRouteParams {
  clinicId: string;
  serviceId: string;
}

interface ClinicOrderRouteParams {
  clinicId: string;
  orderId: string;
}

interface ClinicResultRouteParams {
  clinicId: string;
  resultId: string;
}

interface ClinicDocumentRouteParams {
  clinicId: string;
  documentId: string;
}

@Controller('clinics/:clinicId/clinical')
export class ClinicalOrdersController {
  constructor(private readonly repository: ClinicalOrdersRepository) {}

  // ---------------------------------------------------------------------------
  // 1. GENERAL CLINICAL SERVICES CATALOG
  // ---------------------------------------------------------------------------

  @Post('services')
  @ClinicPermissions('clinical.services.manage')
  createService(
    @Req() req: AuthRequest,
    @Param() params: ClinicRouteParams,
    @Body() dto: CreateGeneralClinicalServiceDto,
  ) {
    return this.repository.createGeneralService(req.auth!.principal, params.clinicId, dto);
  }

  @Patch('services/:serviceId')
  @ClinicPermissions('clinical.services.manage')
  updateService(
    @Req() req: AuthRequest,
    @Param() params: ClinicServiceRouteParams,
    @Body() dto: UpdateGeneralClinicalServiceDto,
  ) {
    return this.repository.updateGeneralService(req.auth!.principal, params.clinicId, params.serviceId, dto);
  }

  @Get('services')
  @ClinicPermissions('clinical.services.read')
  listServices(
    @Req() req: AuthRequest,
    @Param() params: ClinicRouteParams,
    @Query() query: GeneralClinicalServiceQueryDto,
  ) {
    return this.repository.listGeneralServices(req.auth!.principal, params.clinicId, query);
  }

  @Get('services/:serviceId')
  @ClinicPermissions('clinical.services.read')
  getService(
    @Req() req: AuthRequest,
    @Param() params: ClinicServiceRouteParams,
  ) {
    return this.repository.getGeneralServiceById(req.auth!.principal, params.clinicId, params.serviceId);
  }

  // ---------------------------------------------------------------------------
  // 2. CLINICAL ORDERS (LAB, IMAGING, REFERRAL, PROCEDURE)
  // ---------------------------------------------------------------------------

  @Post('orders')
  @ClinicPermissions('clinical.orders.create')
  createOrder(
    @Req() req: AuthRequest,
    @Param() params: ClinicRouteParams,
    @Body() dto: CreateClinicalOrderDto,
  ) {
    return this.repository.createOrder(req.auth!.principal, params.clinicId, dto);
  }

  @Patch('orders/:orderId/status')
  @ClinicPermissions('clinical.orders.update')
  updateOrderStatus(
    @Req() req: AuthRequest,
    @Param() params: ClinicOrderRouteParams,
    @Body() dto: UpdateClinicalOrderStatusDto,
  ) {
    return this.repository.updateOrderStatus(req.auth!.principal, params.clinicId, params.orderId, dto);
  }

  @Post('orders/:orderId/cancel')
  @ClinicPermissions('clinical.orders.cancel')
  cancelOrder(
    @Req() req: AuthRequest,
    @Param() params: ClinicOrderRouteParams,
    @Body() dto: CancelClinicalOrderDto,
  ) {
    return this.repository.cancelOrder(req.auth!.principal, params.clinicId, params.orderId, dto);
  }

  @Get('orders')
  @ClinicPermissions('clinical.orders.read')
  listOrders(
    @Req() req: AuthRequest,
    @Param() params: ClinicRouteParams,
    @Query() query: ClinicalOrderQueryDto,
  ) {
    return this.repository.listOrders(req.auth!.principal, params.clinicId, query);
  }

  @Get('orders/:orderId')
  @ClinicPermissions('clinical.orders.read')
  getOrder(
    @Req() req: AuthRequest,
    @Param() params: ClinicOrderRouteParams,
  ) {
    return this.repository.getOrderById(req.auth!.principal, params.clinicId, params.orderId);
  }

  // ---------------------------------------------------------------------------
  // 3. CLINICAL ORDER RESULTS & VERIFICATION
  // ---------------------------------------------------------------------------

  @Post('orders/:orderId/results')
  @ClinicPermissions('clinical.results.record')
  recordResult(
    @Req() req: AuthRequest,
    @Param() params: ClinicOrderRouteParams,
    @Body() dto: RecordOrderResultDto,
  ) {
    return this.repository.recordResult(req.auth!.principal, params.clinicId, params.orderId, dto);
  }

  @Get('orders/:orderId/results')
  @ClinicPermissions('clinical.results.read')
  listOrderResults(
    @Req() req: AuthRequest,
    @Param() params: ClinicOrderRouteParams,
  ) {
    return this.repository.listResultsForOrder(req.auth!.principal, params.clinicId, params.orderId);
  }

  @Post('results/:resultId/verify')
  @ClinicPermissions('clinical.results.verify')
  verifyResult(
    @Req() req: AuthRequest,
    @Param() params: ClinicResultRouteParams,
    @Body() dto: VerifyOrderResultDto,
  ) {
    return this.repository.verifyResult(req.auth!.principal, params.clinicId, params.resultId, dto);
  }

  @Post('results/:resultId/correct')
  @ClinicPermissions('clinical.results.record')
  correctResult(
    @Req() req: AuthRequest,
    @Param() params: ClinicResultRouteParams,
    @Body() dto: CorrectOrderResultDto,
  ) {
    return this.repository.correctResult(req.auth!.principal, params.clinicId, params.resultId, dto);
  }

  @Post('results/:resultId/acknowledge-critical')
  @ClinicPermissions('clinical.results.record')
  acknowledgeCriticalResult(
    @Req() req: AuthRequest,
    @Param() params: ClinicResultRouteParams,
    @Body() dto: AcknowledgeCriticalResultDto,
  ) {
    return this.repository.acknowledgeCriticalResult(req.auth!.principal, params.clinicId, params.resultId, dto);
  }

  @Post('results/:resultId/release')
  @ClinicPermissions('clinical.results.release')
  releaseResult(
    @Req() req: AuthRequest,
    @Param() params: ClinicResultRouteParams,
    @Body() dto: ReleaseResultToPatientDto,
  ) {
    return this.repository.releaseResultToPatient(req.auth!.principal, params.clinicId, params.resultId, dto);
  }

  // ---------------------------------------------------------------------------
  // 4. SECURE MEDICAL DOCUMENTS
  // ---------------------------------------------------------------------------

  @Post('documents')
  @ClinicPermissions('clinical.documents.upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024, files: 1 } }))
  async uploadDocument(
    @Req() req: AuthRequest,
    @Param() params: ClinicRouteParams,
    @UploadedFile() file: { buffer: Buffer; mimetype?: string; originalname?: string } | undefined,
    @Body() dto: CreateClinicalDocumentDto,
  ) {
    let fileBuffer: Buffer;
    if (file && Buffer.isBuffer(file.buffer)) {
      fileBuffer = file.buffer;
      if (!dto.fileName && file.originalname) {
        dto.fileName = file.originalname;
      }
      if (!dto.mimeType && file.mimetype) {
        dto.mimeType = file.mimetype;
      }
    } else if (dto.fileBase64) {
      fileBuffer = Buffer.from(dto.fileBase64, 'base64');
    } else {
      throw new BadRequestException('Either a multipart file or fileBase64 string must be provided');
    }

    return this.repository.uploadDocument(req.auth!.principal, params.clinicId, dto, fileBuffer);
  }

  @Patch('documents/:documentId')
  @ClinicPermissions('clinical.documents.manage')
  updateDocument(
    @Req() req: AuthRequest,
    @Param() params: ClinicDocumentRouteParams,
    @Body() dto: UpdateClinicalDocumentDto,
  ) {
    return this.repository.updateDocument(req.auth!.principal, params.clinicId, params.documentId, dto);
  }

  @Get('documents/:documentId')
  @ClinicPermissions('clinical.documents.read')
  getDocumentMetadata(
    @Req() req: AuthRequest,
    @Param() params: ClinicDocumentRouteParams,
  ) {
    return this.repository.getDocumentMetadata(req.auth!.principal, params.clinicId, params.documentId);
  }

  @Get('documents/:documentId/download')
  @ClinicPermissions('clinical.documents.read')
  async downloadDocument(
    @Req() req: AuthRequest,
    @Param() params: ClinicDocumentRouteParams,
    @Res({ passthrough: true }) res: Response,
  ) {
    const doc = await this.repository.downloadDocument(req.auth!.principal, params.clinicId, params.documentId);

    res.set({
      'Content-Type': doc.mimeType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(doc.fileName)}"`,
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
      'ETag': `"${doc.contentSha256}"`,
    });

    return new StreamableFile(doc.buffer);
  }

  @Get('documents')
  @ClinicPermissions('clinical.documents.read')
  listDocuments(
    @Req() req: AuthRequest,
    @Param() params: ClinicRouteParams,
    @Query() query: ClinicalDocumentQueryDto,
  ) {
    return this.repository.listDocuments(req.auth!.principal, params.clinicId, query);
  }

  // ---------------------------------------------------------------------------
  // 5. BILLING INTEGRATION
  // ---------------------------------------------------------------------------

  @Post('billing/draft-invoice-service')
  @ClinicPermissions('invoices.create')
  createDraftInvoiceForService(
    @Req() req: AuthRequest,
    @Param() params: ClinicRouteParams,
    @Body() dto: CreateDraftInvoiceForGeneralServiceDto,
  ) {
    return this.repository.createDraftInvoiceForGeneralService(req.auth!.principal, params.clinicId, dto);
  }

  @Post('billing/draft-invoice-order')
  @ClinicPermissions('invoices.create')
  createDraftInvoiceForOrder(
    @Req() req: AuthRequest,
    @Param() params: ClinicRouteParams,
    @Body() dto: CreateDraftInvoiceForOrderDto,
  ) {
    return this.repository.createDraftInvoiceForOrder(req.auth!.principal, params.clinicId, dto);
  }
}
