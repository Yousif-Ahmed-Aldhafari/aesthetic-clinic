import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ClinicPermissions,
  PortalRoute,
  PublicRoute,
  RequireStepUp,
  type AuthRequest,
} from '../auth/access.js';
import { PatientAuthGuard } from '../portal/patient-auth.guard.js';
import { CurrentPatient, type PatientPrincipal } from '../portal/patient-principal.js';
import type { PaymentProviderCode } from '../generated/prisma/client.js';
import { IntegrationsRepository } from '../prisma/integrations.repository.js';
import {
  ApproveExternalPayoutDto,
  CreatePaymentIntentDto,
  ExecuteExternalRefundDto,
  PAYMENT_PROVIDER_CODES,
  PrepareExternalPayoutDto,
  PrepareRegulatoryDocumentDto,
  RecordPaymentSettlementDto,
  RunExternalReconciliationDto,
  UpsertProviderConfigurationDto,
  UpsertRegulatoryProfileDto,
  WebhookEventPayloadDto,
} from './integrations.dto.js';

function serializeJson<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') return value.toString() as unknown as T;
  if (value instanceof Date) return value.toISOString() as unknown as T;
  if (Array.isArray(value)) return value.map(serializeJson) as unknown as T;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = serializeJson(v);
    }
    return out as T;
  }
  return value;
}

@Controller('clinics/:clinicId/integrations')
export class IntegrationsController {
  constructor(private readonly repo: IntegrationsRepository) {}

  @Get('providers')
  @ClinicPermissions('integrations.providers.read')
  async listProviders(
    @Req() req: AuthRequest,
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
  ) {
    return serializeJson(await this.repo.listProviderConfigs(req.auth!.principal, clinicId));
  }

  @Put('providers')
  @ClinicPermissions('integrations.providers.manage')
  @RequireStepUp(15)
  async upsertProvider(
    @Req() req: AuthRequest,
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
    @Body() dto: UpsertProviderConfigurationDto,
  ) {
    return serializeJson(await this.repo.upsertProviderConfig(req.auth!.principal, clinicId, dto));
  }

  @Post('providers/:configId/health')
  @ClinicPermissions('integrations.providers.read')
  async checkHealth(
    @Req() req: AuthRequest,
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
    @Param('configId', ParseUUIDPipe) configId: string,
  ) {
    return serializeJson(await this.repo.checkProviderHealth(req.auth!.principal, clinicId, configId));
  }

  @Get('payment-intents')
  @ClinicPermissions('integrations.payments.read')
  async listPaymentIntents(
    @Req() req: AuthRequest,
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
    @Query('invoiceId') invoiceId?: string,
  ) {
    return serializeJson(await this.repo.listPaymentIntents(req.auth!.principal, clinicId, invoiceId));
  }

  @Post('payment-intents')
  @ClinicPermissions('integrations.payments.initiate')
  async createPaymentIntent(
    @Req() req: AuthRequest,
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
    @Body() dto: CreatePaymentIntentDto,
  ) {
    return serializeJson(await this.repo.createPaymentIntent(req.auth!.principal, clinicId, dto));
  }

  @Get('webhook-events')
  @ClinicPermissions('integrations.payments.read')
  async listWebhookEvents(
    @Req() req: AuthRequest,
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
    @Query('status') status?: string,
  ) {
    return serializeJson(await this.repo.listWebhookEvents(req.auth!.principal, clinicId, status));
  }

  @Get('settlements')
  @ClinicPermissions('integrations.reconciliation.read')
  async listSettlements(
    @Req() req: AuthRequest,
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
  ) {
    return serializeJson(await this.repo.listSettlements(req.auth!.principal, clinicId));
  }

  @Post('settlements')
  @ClinicPermissions('integrations.reconciliation.run')
  async recordSettlement(
    @Req() req: AuthRequest,
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
    @Body() dto: RecordPaymentSettlementDto,
  ) {
    return serializeJson(await this.repo.recordSettlement(req.auth!.principal, clinicId, dto));
  }

  @Get('external-refunds')
  @ClinicPermissions('integrations.payments.read')
  async listExternalRefunds(
    @Req() req: AuthRequest,
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
  ) {
    return serializeJson(await this.repo.listExternalRefunds(req.auth!.principal, clinicId));
  }

  @Post('external-refunds')
  @ClinicPermissions('integrations.refunds.execute')
  @RequireStepUp(15)
  async executeExternalRefund(
    @Req() req: AuthRequest,
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
    @Body() dto: ExecuteExternalRefundDto,
  ) {
    return serializeJson(await this.repo.executeExternalRefund(req.auth!.principal, clinicId, dto));
  }

  @Get('external-payouts')
  @ClinicPermissions('integrations.payouts.manage')
  async listExternalPayouts(
    @Req() req: AuthRequest,
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
  ) {
    return serializeJson(await this.repo.listExternalPayouts(req.auth!.principal, clinicId));
  }

  @Post('external-payouts')
  @ClinicPermissions('integrations.payouts.manage')
  async prepareExternalPayout(
    @Req() req: AuthRequest,
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
    @Body() dto: PrepareExternalPayoutDto,
  ) {
    return serializeJson(await this.repo.prepareExternalPayout(req.auth!.principal, clinicId, dto));
  }

  @Post('external-payouts/:payoutId/approve')
  @ClinicPermissions('integrations.payouts.manage')
  @RequireStepUp(15)
  async approveExternalPayout(
    @Req() req: AuthRequest,
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
    @Param('payoutId', ParseUUIDPipe) payoutId: string,
    @Body() dto: ApproveExternalPayoutDto,
  ) {
    return serializeJson(await this.repo.approveExternalPayout(req.auth!.principal, clinicId, payoutId, dto));
  }

  @Get('reconciliation-runs')
  @ClinicPermissions('integrations.reconciliation.read')
  async listReconciliationRuns(
    @Req() req: AuthRequest,
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
  ) {
    return serializeJson(await this.repo.listReconciliationRuns(req.auth!.principal, clinicId));
  }

  @Post('reconciliation-runs')
  @ClinicPermissions('integrations.reconciliation.run')
  async runExternalReconciliation(
    @Req() req: AuthRequest,
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
    @Body() dto: RunExternalReconciliationDto,
  ) {
    return serializeJson(await this.repo.runExternalReconciliation(req.auth!.principal, clinicId, dto));
  }

  @Get('regulatory/profile')
  @ClinicPermissions('integrations.regulatory.read')
  async getRegulatoryProfile(
    @Req() req: AuthRequest,
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
  ) {
    return serializeJson(await this.repo.getRegulatoryProfile(req.auth!.principal, clinicId));
  }

  @Put('regulatory/profile')
  @ClinicPermissions('integrations.regulatory.manage')
  @RequireStepUp(15)
  async upsertRegulatoryProfile(
    @Req() req: AuthRequest,
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
    @Body() dto: UpsertRegulatoryProfileDto,
  ) {
    return serializeJson(await this.repo.upsertRegulatoryProfile(req.auth!.principal, clinicId, dto));
  }

  @Get('regulatory/documents')
  @ClinicPermissions('integrations.regulatory.read')
  async listRegulatoryDocuments(
    @Req() req: AuthRequest,
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
  ) {
    return serializeJson(await this.repo.listRegulatoryDocuments(req.auth!.principal, clinicId));
  }

  @Post('regulatory/documents')
  @ClinicPermissions('integrations.regulatory.manage')
  async prepareRegulatoryDocument(
    @Req() req: AuthRequest,
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
    @Body() dto: PrepareRegulatoryDocumentDto,
  ) {
    return serializeJson(await this.repo.prepareRegulatoryDocument(req.auth!.principal, clinicId, dto));
  }

  @Post('regulatory/documents/:documentId/submit')
  @ClinicPermissions('integrations.regulatory.manage')
  @RequireStepUp(15)
  async submitRegulatoryDocument(
    @Req() req: AuthRequest,
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return serializeJson(await this.repo.submitRegulatoryDocument(req.auth!.principal, clinicId, documentId));
  }
}

@PublicRoute()
@Controller('webhooks/payments')
export class PaymentWebhooksController {
  constructor(private readonly repo: IntegrationsRepository) {}

  @Post(':providerCode')
  @HttpCode(200)
  async handleWebhook(
    @Param('providerCode') providerCodeRaw: string,
    @Headers('x-lamssa-signature') signatureHeader: string | undefined,
    @Headers('x-lamssa-timestamp') timestampHeader: string | undefined,
    @Req() req: Request & { rawBody?: Buffer },
    @Body() payload: WebhookEventPayloadDto,
  ) {
    if (!PAYMENT_PROVIDER_CODES.includes(providerCodeRaw as PaymentProviderCode)) {
      throw new BadRequestException('UNSUPPORTED_PAYMENT_PROVIDER');
    }
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(payload);
    return serializeJson(
      await this.repo.ingestPaymentWebhook(
        providerCodeRaw as PaymentProviderCode,
        rawBody,
        signatureHeader,
        timestampHeader,
        payload,
      ),
    );
  }
}

@PortalRoute()
@UseGuards(PatientAuthGuard)
@Controller('portal/payments')
export class PortalPaymentsController {
  constructor(private readonly repo: IntegrationsRepository) {}

  @Post('intents')
  async createPortalIntent(
    @CurrentPatient() principal: PatientPrincipal,
    @Body() dto: CreatePaymentIntentDto,
  ) {
    return serializeJson(await this.repo.createPortalPaymentIntent(principal, dto));
  }
}
