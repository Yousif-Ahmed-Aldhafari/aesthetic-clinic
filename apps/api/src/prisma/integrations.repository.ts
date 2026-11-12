import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { canonical } from './billing.helpers.js';
import type {
  IntegrationMode,
  InvoiceStatus,
  PaymentIntentStatus,
  PaymentProviderCode,
  Prisma,
  ProviderHealthStatus,
  ReconciliationFindingSeverity,
  ReconciliationFindingType,
  ReconciliationScope,
  WebhookProcessingStatus,
} from '../generated/prisma/client.js';
import type { VerifiedPrincipal } from './verified-sessions.js';
import type { PatientPrincipal } from '../portal/patient-principal.js';
import { TenantDatabaseService, type TenantTransaction } from './tenant-database.service.js';
import { PrismaService } from './prisma.service.js';
import { AuditRepository } from './audit.repository.js';
import { IntegrationCryptoService } from '../integrations/integration-crypto.service.js';
import {
  canTransitionPaymentIntent,
  getPaymentProviderAdapter,
} from '../integrations/payment-provider.adapter.js';
import { getRegulatoryAdapter } from '../integrations/regulatory.adapter.js';
import type {
  ApproveExternalPayoutDto,
  CreatePaymentIntentDto,
  ExecuteExternalRefundDto,
  PrepareExternalPayoutDto,
  PrepareRegulatoryDocumentDto,
  RecordPaymentSettlementDto,
  RunExternalReconciliationDto,
  UpsertProviderConfigurationDto,
  UpsertRegulatoryProfileDto,
  WebhookEventPayloadDto,
} from '../integrations/integrations.dto.js';

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function paidStatus(netPaidMinor: bigint, totalMinor: bigint): InvoiceStatus {
  if (netPaidMinor <= 0n) return 'ISSUED';
  return netPaidMinor >= totalMinor ? 'PAID' : 'PARTIALLY_PAID';
}

function sanitizeProviderConfig(row: {
  id: string;
  clinicId: string;
  providerCode: PaymentProviderCode;
  mode: IntegrationMode;
  isEnabled: boolean;
  supportedCurrencies: string[];
  jurisdiction: string;
  capabilities: Prisma.JsonValue;
  encryptedApiKey: string | null;
  encryptedWebhookSecret: string | null;
  keyVersion: number;
  secretFingerprint: string | null;
  healthStatus: ProviderHealthStatus;
  lastHealthCheckedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    clinicId: row.clinicId,
    providerCode: row.providerCode,
    mode: row.mode,
    isEnabled: row.isEnabled,
    supportedCurrencies: row.supportedCurrencies,
    jurisdiction: row.jurisdiction,
    capabilities: row.capabilities,
    hasApiKey: Boolean(row.encryptedApiKey),
    hasWebhookSecret: Boolean(row.encryptedWebhookSecret),
    keyVersion: row.keyVersion,
    secretFingerprint: row.secretFingerprint ? row.secretFingerprint.trim() : null,
    healthStatus: row.healthStatus,
    lastHealthCheckedAt: row.lastHealthCheckedAt,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class IntegrationsRepository {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditRepository,
    private readonly crypto: IntegrationCryptoService,
  ) {}

  // ---------------------------------------------------------------------------
  // 1. Provider Configurations (Encrypted Credentials at Rest)
  // ---------------------------------------------------------------------------
  listProviderConfigs(proof: VerifiedPrincipal, clinicId: string) {
    return this.database.withClinicContext(proof, clinicId, ['integrations.providers.read'], async (tx) => {
      const rows = await tx.paymentProviderConfiguration.findMany({
        where: { clinicId },
        orderBy: [{ providerCode: 'asc' }, { mode: 'asc' }],
      });
      return rows.map(sanitizeProviderConfig);
    });
  }

  upsertProviderConfig(proof: VerifiedPrincipal, clinicId: string, dto: UpsertProviderConfigurationDto) {
    return this.database.withClinicContext(proof, clinicId, ['integrations.providers.manage'], async (tx, ctx) => {
      if (dto.mode === 'LIVE' && dto.providerCode === 'SANDBOX_MOCK') {
        throw new BadRequestException('SANDBOX_MOCK_CANNOT_BE_LIVE');
      }
      const adapter = getPaymentProviderAdapter(dto.providerCode);
      if (dto.mode === 'LIVE' && dto.isEnabled && !adapter.isExecutionSupported) {
        throw new BadRequestException(`PROVIDER_LIVE_ADAPTER_NOT_ENABLED:${dto.providerCode}`);
      }

      const existing = await tx.paymentProviderConfiguration.findUnique({
        where: {
          clinicId_providerCode_mode: {
            clinicId,
            providerCode: dto.providerCode,
            mode: dto.mode,
          },
        },
      });

      const encryptedApiKey = dto.apiKey
        ? this.crypto.encryptSecret(dto.apiKey)
        : existing?.encryptedApiKey ?? null;
      const encryptedWebhookSecret = dto.webhookSecret
        ? this.crypto.encryptSecret(dto.webhookSecret)
        : existing?.encryptedWebhookSecret ?? null;
      const rawFingerprint = dto.apiKey
        ? this.crypto.fingerprintSecret(dto.apiKey)
        : dto.webhookSecret
          ? this.crypto.fingerprintSecret(dto.webhookSecret)
          : existing?.secretFingerprint ?? null;
      const secretFingerprint = rawFingerprint ? rawFingerprint.slice(0, 16).padEnd(16, ' ') : null;

      const capabilities = {
        supportsRefunds: adapter.isExecutionSupported,
        supportsPayouts: adapter.isExecutionSupported,
        supportsWebhooks: true,
      };

      const row = await tx.paymentProviderConfiguration.upsert({
        where: {
          clinicId_providerCode_mode: {
            clinicId,
            providerCode: dto.providerCode,
            mode: dto.mode,
          },
        },
        create: {
          clinicId,
          providerCode: dto.providerCode,
          mode: dto.mode,
          isEnabled: dto.isEnabled,
          supportedCurrencies: dto.supportedCurrencies ?? ['SAR', 'AED', 'USD'],
          jurisdiction: dto.jurisdiction ?? 'SA',
          capabilities,
          encryptedApiKey,
          encryptedWebhookSecret,
          secretFingerprint,
          healthStatus: dto.isEnabled && adapter.isExecutionSupported ? 'HEALTHY' : 'DISABLED',
        },
        update: {
          isEnabled: dto.isEnabled,
          ...(dto.supportedCurrencies ? { supportedCurrencies: dto.supportedCurrencies } : {}),
          ...(dto.jurisdiction ? { jurisdiction: dto.jurisdiction } : {}),
          encryptedApiKey,
          encryptedWebhookSecret,
          secretFingerprint,
          healthStatus: dto.isEnabled && adapter.isExecutionSupported ? 'HEALTHY' : 'DISABLED',
          version: { increment: 1 },
        },
      });

      await this.audit.record(
        {
          clinicId,
          actorId: ctx.userId,
          action: 'integrations.provider.upsert',
          category: 'IDENTITY',
          targetType: 'PaymentProviderConfiguration',
          targetId: row.id,
          outcome: 'SUCCESS',
          metadata: {
            providerCode: row.providerCode,
            mode: row.mode,
            isEnabled: row.isEnabled,
            secretFingerprint: row.secretFingerprint?.trim() ?? null,
          },
        },
        tx,
      );

      return sanitizeProviderConfig(row);
    });
  }

  checkProviderHealth(proof: VerifiedPrincipal, clinicId: string, configId: string) {
    return this.database.withClinicContext(proof, clinicId, ['integrations.providers.read'], async (tx) => {
      const config = await tx.paymentProviderConfiguration.findFirst({
        where: { clinicId, id: configId },
      });
      if (!config) throw new NotFoundException('PROVIDER_CONFIG_NOT_FOUND');

      const adapter = getPaymentProviderAdapter(config.providerCode);
      const check = adapter.healthCheck(config.mode);
      const healthStatus: ProviderHealthStatus = !config.isEnabled
        ? 'DISABLED'
        : check.ok
          ? 'HEALTHY'
          : 'DEGRADED';

      const updated = await tx.paymentProviderConfiguration.update({
        where: { clinicId_id: { clinicId, id: config.id } },
        data: {
          lastHealthCheckedAt: new Date(),
          healthStatus,
        },
      });
      return {
        ...sanitizeProviderConfig(updated),
        health: check,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // 2. Payment Intents (Staff & Patient Portal)
  // ---------------------------------------------------------------------------
  listPaymentIntents(proof: VerifiedPrincipal, clinicId: string, invoiceId?: string) {
    return this.database.withClinicContext(proof, clinicId, ['integrations.payments.read'], async (tx) => {
      return tx.paymentIntent.findMany({
        where: {
          clinicId,
          ...(invoiceId ? { invoiceId } : {}),
        },
        orderBy: [{ createdAt: 'desc' }],
        take: 100,
      });
    });
  }

  createPaymentIntent(proof: VerifiedPrincipal, clinicId: string, dto: CreatePaymentIntentDto) {
    return this.database.withClinicContext(proof, clinicId, ['integrations.payments.initiate'], async (tx, ctx) => {
      return this.createPaymentIntentInTx(tx, clinicId, dto, {
        membershipId: ctx.membershipId,
        userId: ctx.userId,
        patientAccountId: null,
        selectedBranchId: ctx.selectedBranchId ?? null,
      });
    });
  }

  async createPortalPaymentIntent(principal: PatientPrincipal, dto: CreatePaymentIntentDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.prisma.assertRuntimeRole(tx);
      await tx.$queryRaw`
        SELECT set_config('lamssa.clinic_id', ${principal.clinicId}, true),
               set_config('lamssa.patient_id', ${principal.patientId}, true),
               set_config('lamssa.patient_account_id', ${principal.patientAccountId}, true),
               set_config('lamssa.patient_session_id', ${principal.sessionId}, true)
      `;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${'clinic-identity:' + principal.clinicId}, 0))::text`;

      const [invoice] = await tx.$queryRaw<{
        id: string;
        branchId: string | null;
        patientId: string;
        currency: string;
        currencyScale: number;
        status: string;
        totalMinor: bigint;
        netPaidMinor: bigint;
      }[]>`SELECT * FROM lamssa_security.portal_invoice_for_payment(${principal.clinicId}::uuid, ${principal.patientId}::uuid, ${dto.invoiceId}::uuid)`;
      if (!invoice || invoice.patientId !== principal.patientId) {
        throw new ForbiddenException('PORTAL_INVOICE_ACCESS_DENIED');
      }

      return this.createPaymentIntentInTx(
        tx as unknown as TenantTransaction,
        principal.clinicId,
        dto,
        {
          membershipId: null,
          userId: null,
          patientAccountId: principal.patientAccountId,
          selectedBranchId: null,
        },
        invoice,
      );
    }, { maxWait: 5000, timeout: 10000 });
  }

  private async createPaymentIntentInTx(
    tx: TenantTransaction,
    clinicId: string,
    dto: CreatePaymentIntentDto,
    actor: {
      membershipId: string | null;
      userId: string | null;
      patientAccountId: string | null;
      selectedBranchId: string | null;
    },
    preloadedInvoice?: {
      id: string;
      branchId: string | null;
      patientId: string;
      currency: string;
      currencyScale: number;
      status: string;
      totalMinor: bigint;
      netPaidMinor: bigint;
    },
  ) {
    const requestHash = sha256Hex(
      `${clinicId}:${dto.invoiceId}:${dto.providerCode}:${dto.mode ?? 'SANDBOX'}:${dto.amountMinor}:${dto.currency}`,
    );

    const existing = await tx.paymentIntent.findUnique({
      where: {
        clinicId_idempotencyKey: { clinicId, idempotencyKey: dto.idempotencyKey },
      },
    });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException('IDEMPOTENCY_KEY_CONFLICT');
      }
      return existing;
    }

    const invoice =
      preloadedInvoice ??
      (await tx.invoice.findFirst({
        where: { clinicId, id: dto.invoiceId },
      }));
    if (!invoice) throw new NotFoundException('INVOICE_NOT_FOUND');
    if (!['ISSUED', 'PARTIALLY_PAID'].includes(invoice.status)) {
      throw new BadRequestException('INVOICE_NOT_PAYABLE');
    }
    if (invoice.currency !== dto.currency) {
      throw new BadRequestException('INVOICE_CURRENCY_MISMATCH');
    }

    const remainingMinor = invoice.totalMinor - invoice.netPaidMinor;
    if (BigInt(dto.amountMinor) > remainingMinor) {
      throw new BadRequestException('PAYMENT_INTENT_EXCEEDS_OUTSTANDING');
    }

    const mode: IntegrationMode = dto.mode ?? 'SANDBOX';
    const config = await tx.paymentProviderConfiguration.findUnique({
      where: {
        clinicId_providerCode_mode: {
          clinicId,
          providerCode: dto.providerCode,
          mode,
        },
      },
    });
    if (!config || !config.isEnabled) {
      throw new BadRequestException('PAYMENT_PROVIDER_NOT_ENABLED');
    }

    const adapter = getPaymentProviderAdapter(dto.providerCode);
    if (!adapter.isExecutionSupported) {
      throw new BadRequestException(`PROVIDER_ADAPTER_DISABLED:${dto.providerCode}`);
    }

    const providerResult = adapter.createPaymentIntent({
      clinicId,
      invoiceId: invoice.id,
      amountMinor: dto.amountMinor,
      currency: dto.currency,
      idempotencyKey: dto.idempotencyKey,
      mode,
      returnUrl: dto.returnUrl ?? null,
    });

    const intent = await tx.paymentIntent.create({
      data: {
        clinicId,
        branchId: actor.selectedBranchId ?? invoice.branchId ?? null,
        invoiceId: invoice.id,
        patientId: invoice.patientId,
        providerConfigId: config.id,
        providerCode: dto.providerCode,
        mode,
        providerIntentId: providerResult.providerIntentId,
        idempotencyKey: dto.idempotencyKey,
        requestHash,
        status: providerResult.status,
        amountMinor: BigInt(dto.amountMinor),
        currency: invoice.currency,
        currencyScale: invoice.currencyScale,
        checkoutUrl: providerResult.clientActionUrl,
        expiresAt: providerResult.expiresAt,
        initiatedByMembershipId: actor.membershipId,
        initiatedByPatientAccountId: actor.patientAccountId,
      },
    });

    if (actor.userId) {
      await this.audit.record(
        {
          clinicId,
          actorId: actor.userId,
          action: 'integrations.payment_intent.create',
          category: 'FINANCE',
          targetType: 'PaymentIntent',
          targetId: intent.id,
          outcome: 'SUCCESS',
          metadata: {
            invoiceId: invoice.id,
            providerCode: intent.providerCode,
            amountMinor: intent.amountMinor.toString(),
          },
        },
        tx,
      );
    }

    return intent;
  }

  // ---------------------------------------------------------------------------
  // 3. Verified Webhook Ingestion (HMAC-SHA256 + Replay Window + Idempotency)
  // ---------------------------------------------------------------------------
  async ingestPaymentWebhook(
    providerCode: PaymentProviderCode,
    rawBody: string,
    signatureHeader: string | undefined,
    timestampHeader: string | undefined,
    payload: WebhookEventPayloadDto,
  ) {
    const targets = await this.database.resolvePaymentWebhookTarget(providerCode, payload.providerIntentId);
    if (targets.length !== 1) {
      throw new NotFoundException('WEBHOOK_TARGET_NOT_FOUND');
    }
    const target = targets[0];
    if (!target.isEnabled || !target.encryptedWebhookSecret) {
      throw new UnauthorizedException('WEBHOOK_SECRET_NOT_CONFIGURED');
    }

    const webhookSecret = this.crypto.decryptSecret(target.encryptedWebhookSecret);
    const adapter = getPaymentProviderAdapter(providerCode);
    const sigCheck = adapter.verifyWebhookSignature({
      rawBody,
      signatureHeader,
      timestampHeader,
      webhookSecret,
    });
    if (!sigCheck.ok) {
      throw new UnauthorizedException(sigCheck.reason ?? 'INVALID_WEBHOOK_SIGNATURE');
    }

    const rawPayloadHash = sha256Hex(rawBody);
    const eventTimestamp = timestampHeader ? new Date(Number(timestampHeader) * 1000) : null;

    return this.database.withWebhookContext(target.clinicId, target.paymentIntentId, target.webhookTicket, async (_tx, helpers) => {
      const eventRes = await helpers.ingestWebhookEvent({
        providerCode,
        providerEventId: payload.eventId,
        eventType: payload.eventType,
        rawPayloadHash,
        sanitizedPayload: JSON.parse(rawBody) as Prisma.InputJsonValue,
        eventTimestamp,
        signatureVerified: true,
      });

      if (eventRes.duplicate) {
        return {
          duplicate: true,
          eventId: eventRes.eventId,
          processingStatus: eventRes.processingStatus as WebhookProcessingStatus,
        };
      }

      if (payload.amountMinor !== undefined && BigInt(payload.amountMinor) !== target.amountMinor) {
        await helpers.updateWebhookEventStatus(
          eventRes.eventId,
          'DEAD_LETTER',
          `AMOUNT_MISMATCH: expected ${target.amountMinor.toString()}, got ${payload.amountMinor}`,
        );
        return { duplicate: false, eventId: eventRes.eventId, processingStatus: 'DEAD_LETTER', reason: 'AMOUNT_MISMATCH' };
      }

      if (payload.currency !== undefined && payload.currency !== target.currency) {
        await helpers.updateWebhookEventStatus(
          eventRes.eventId,
          'DEAD_LETTER',
          `CURRENCY_MISMATCH: expected ${target.currency}, got ${payload.currency}`,
        );
        return { duplicate: false, eventId: eventRes.eventId, processingStatus: 'DEAD_LETTER', reason: 'CURRENCY_MISMATCH' };
      }

      const nextStatus = this.mapWebhookEventToIntentStatus(payload.eventType);
      if (!nextStatus) {
        await helpers.updateWebhookEventStatus(eventRes.eventId, 'IGNORED_DUPLICATE');
        return { duplicate: false, eventId: eventRes.eventId, processingStatus: 'IGNORED_DUPLICATE' };
      }

      if (!canTransitionPaymentIntent(target.status, nextStatus)) {
        await helpers.updateWebhookEventStatus(
          eventRes.eventId,
          'IGNORED_DUPLICATE',
          `OUT_OF_ORDER_TRANSITION:${target.status}->${nextStatus}`,
        );
        return { duplicate: false, eventId: eventRes.eventId, processingStatus: 'IGNORED_DUPLICATE' };
      }

      if (nextStatus === 'SUCCEEDED' && !target.postedPaymentId) {
        const postRes = await helpers.postWebhookPayment(eventRes.eventId);

        if (!postRes?.posted || !postRes.paymentId) {
          const reason = postRes?.reason ?? 'WEBHOOK_PAYMENT_POST_FAILED';
          await helpers.updateWebhookEventStatus(eventRes.eventId, 'DEAD_LETTER', reason);
          return { duplicate: false, eventId: eventRes.eventId, processingStatus: 'DEAD_LETTER', reason };
        }

        await this.audit.record(
          {
            clinicId: target.clinicId,
            actorId: null,
            action: 'integrations.webhook.payment_posted',
            category: 'FINANCE',
            targetType: 'Payment',
            targetId: postRes.paymentId,
            outcome: 'SUCCESS',
            metadata: {
              invoiceId: target.invoiceId,
              paymentIntentId: target.paymentIntentId,
              amountMinor: target.amountMinor.toString(),
              viaWebhookEventId: eventRes.eventId,
            },
          },
        );

        return {
          duplicate: false,
          eventId: eventRes.eventId,
          processingStatus: 'PROCESSED',
          intentStatus: nextStatus,
        };
      } else if (target.status !== nextStatus) {
        await helpers.updateIntentStatus(
          nextStatus,
          nextStatus === 'FAILED' ? String(payload.data?.failureCode ?? 'PROVIDER_FAILED') : undefined,
          nextStatus === 'FAILED' ? String(payload.data?.failureMessage ?? 'Provider reported failure') : undefined,
        );
      }

      await helpers.updateWebhookEventStatus(eventRes.eventId, 'PROCESSED');
      return {
        duplicate: false,
        eventId: eventRes.eventId,
        processingStatus: 'PROCESSED',
        intentStatus: nextStatus,
      };
    });
  }

  private mapWebhookEventToIntentStatus(eventType: string): PaymentIntentStatus | null {
    switch (eventType) {
      case 'payment.requires_action':
        return 'REQUIRES_ACTION';
      case 'payment.processing':
        return 'PROCESSING';
      case 'payment.succeeded':
        return 'SUCCEEDED';
      case 'payment.failed':
        return 'FAILED';
      case 'payment.cancelled':
        return 'CANCELLED';
      default:
        return null;
    }
  }

  listWebhookEvents(proof: VerifiedPrincipal, clinicId: string, status?: string) {
    return this.database.withClinicContext(proof, clinicId, ['integrations.payments.read'], async (tx) => {
      return tx.paymentProviderEvent.findMany({
        where: {
          clinicId,
          ...(status ? { processingStatus: status as never } : {}),
        },
        orderBy: [{ createdAt: 'desc' }],
        take: 100,
      });
    });
  }

  // ---------------------------------------------------------------------------
  // 4. Settlements, External Refunds & Payouts (With Segregation of Duties)
  // ---------------------------------------------------------------------------
  listSettlements(proof: VerifiedPrincipal, clinicId: string) {
    return this.database.withClinicContext(proof, clinicId, ['integrations.reconciliation.read'], async (tx) => {
      return tx.paymentSettlement.findMany({
        where: { clinicId },
        orderBy: [{ settledAt: 'desc' }],
        take: 100,
      });
    });
  }

  recordSettlement(proof: VerifiedPrincipal, clinicId: string, dto: RecordPaymentSettlementDto) {
    return this.database.withClinicContext(proof, clinicId, ['integrations.reconciliation.run'], async (tx) => {
      const config = await tx.paymentProviderConfiguration.findFirst({
        where: { clinicId, id: dto.providerConfigId },
      });
      if (!config) throw new NotFoundException('PROVIDER_CONFIG_NOT_FOUND');
      if (dto.grossAmountMinor - dto.feeAmountMinor !== dto.netAmountMinor) {
        throw new BadRequestException('SETTLEMENT_NET_ARITHMETIC_MISMATCH');
      }
      return tx.paymentSettlement.create({
        data: {
          clinicId,
          providerConfigId: config.id,
          providerCode: config.providerCode,
          providerSettlementId: dto.providerSettlementId,
          grossAmountMinor: BigInt(dto.grossAmountMinor),
          feeAmountMinor: BigInt(dto.feeAmountMinor),
          netAmountMinor: BigInt(dto.netAmountMinor),
          currency: dto.currency,
          currencyScale: dto.currencyScale ?? 2,
          settledAt: new Date(dto.settledAt),
          bankReference: dto.bankReference ?? null,
          isExternallyVerified: Boolean(dto.bankReference),
        },
      });
    });
  }

  listExternalRefunds(proof: VerifiedPrincipal, clinicId: string) {
    return this.database.withClinicContext(proof, clinicId, ['integrations.payments.read'], async (tx) => {
      return tx.externalRefund.findMany({
        where: { clinicId },
        orderBy: [{ createdAt: 'desc' }],
        take: 100,
      });
    });
  }

  executeExternalRefund(proof: VerifiedPrincipal, clinicId: string, dto: ExecuteExternalRefundDto) {
    return this.database.withClinicContext(proof, clinicId, ['integrations.refunds.execute'], async (tx, ctx) => {
      const requestHash = sha256Hex(`${clinicId}:${dto.refundRequestId}:${dto.paymentIntentId}`);
      const existing = await tx.externalRefund.findUnique({
        where: { clinicId_idempotencyKey: { clinicId, idempotencyKey: dto.idempotencyKey } },
      });
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new ConflictException('IDEMPOTENCY_KEY_CONFLICT');
        }
        return existing;
      }

      const refundReq = await tx.refundRequest.findFirst({
        where: { clinicId, id: dto.refundRequestId },
      });
      if (!refundReq) throw new NotFoundException('REFUND_REQUEST_NOT_FOUND');
      if (refundReq.status !== 'APPROVED') {
        throw new BadRequestException('REFUND_REQUEST_NOT_APPROVED');
      }

      const intent = await tx.paymentIntent.findFirst({
        where: { clinicId, id: dto.paymentIntentId },
      });
      if (!intent || intent.status !== 'SUCCEEDED' || !intent.postedPaymentId) {
        throw new BadRequestException('PAYMENT_INTENT_NOT_REFUNDABLE');
      }
      if (refundReq.invoiceId !== intent.invoiceId) {
        throw new BadRequestException('REFUND_INVOICE_MISMATCH');
      }
      if (refundReq.requestedAmountMinor > intent.amountMinor) {
        throw new BadRequestException('REFUND_EXCEEDS_INTENT_AMOUNT');
      }

      const adapter = getPaymentProviderAdapter(intent.providerCode);
      if (!adapter.isExecutionSupported) {
        throw new BadRequestException(`PROVIDER_ADAPTER_DISABLED:${intent.providerCode}`);
      }

      const providerResult = adapter.executeRefund({
        providerIntentId: intent.providerIntentId ?? intent.id,
        amountMinor: Number(refundReq.requestedAmountMinor),
        currency: intent.currency,
        idempotencyKey: dto.idempotencyKey,
        reason: dto.reason ?? refundReq.reason,
        mode: intent.mode,
      });

      const reversal = await tx.paymentReversal.create({
        data: {
          clinicId,
          invoiceId: intent.invoiceId,
          paymentId: intent.postedPaymentId,
          amountMinor: refundReq.requestedAmountMinor,
          currency: intent.currency,
          currencyScale: intent.currencyScale,
          kind: 'REFUND',
          reason: 'PATIENT_REFUND',
          requestKey: randomUUID(),
          requestHash,
        },
      });

      const invoice = await tx.invoice.findUniqueOrThrow({
        where: { clinicId_id: { clinicId, id: intent.invoiceId } },
      });
      const newNetPaid = invoice.netPaidMinor - refundReq.requestedAmountMinor;
      const updatedInvoice = await tx.invoice.update({
        where: { clinicId_id: { clinicId, id: invoice.id } },
        data: {
          netPaidMinor: newNetPaid,
          status: paidStatus(newNetPaid, invoice.totalMinor),
          version: { increment: 1 },
        },
      });

      await tx.refundRequest.update({
        where: { clinicId_id: { clinicId, id: refundReq.id } },
        data: {
          status: 'SETTLED',
          settledByMembershipId: ctx.membershipId,
          settledAt: new Date(),
          version: { increment: 1 },
        },
      });

      const last = await tx.financialAuditEvent.findFirst({
        where: { clinicId },
        orderBy: { sequence: 'desc' },
        select: { sequence: true, eventHash: true },
      });
      const seq = (last?.sequence ?? 0) + 1;
      const prevHash = last?.eventHash ?? '0'.repeat(64);
      const at = new Date();
      const auditId = randomUUID();
      const payloadStr = canonical({
        id: auditId,
        clinicId,
        invoiceId: invoice.id,
        actorMembershipId: ctx.membershipId,
        sequence: seq,
        action: 'PAYMENT_REFUNDED',
        at: at.toISOString(),
        invoiceVersion: updatedInvoice.version,
        details: {
          refundRequestId: refundReq.id,
          reversalId: reversal.id,
          providerRefundId: providerResult.providerRefundId,
          amountMinor: refundReq.requestedAmountMinor.toString(),
        },
      });
      const eventHash = createHash('sha256').update(`${prevHash}\n${payloadStr}`).digest('hex');
      await tx.financialAuditEvent.create({
        data: {
          id: auditId,
          clinicId,
          invoiceId: invoice.id,
          actorMembershipId: ctx.membershipId,
          sequence: seq,
          action: 'PAYMENT_REFUNDED',
          payload: payloadStr,
          previousHash: prevHash,
          eventHash,
          createdAt: at,
        },
      });

      return tx.externalRefund.create({
        data: {
          clinicId,
          refundRequestId: refundReq.id,
          paymentIntentId: intent.id,
          paymentReversalId: reversal.id,
          providerConfigId: intent.providerConfigId,
          providerCode: intent.providerCode,
          mode: intent.mode,
          providerRefundId: providerResult.providerRefundId,
          idempotencyKey: dto.idempotencyKey,
          requestHash,
          status: providerResult.status,
          amountMinor: refundReq.requestedAmountMinor,
          currency: intent.currency,
          currencyScale: intent.currencyScale,
          initiatedByMembershipId: ctx.membershipId,
        },
      });
    });
  }

  listExternalPayouts(proof: VerifiedPrincipal, clinicId: string) {
    return this.database.withClinicContext(proof, clinicId, ['integrations.payouts.manage'], async (tx) => {
      return tx.externalPayout.findMany({
        where: { clinicId },
        orderBy: [{ createdAt: 'desc' }],
        take: 100,
      });
    });
  }

  prepareExternalPayout(proof: VerifiedPrincipal, clinicId: string, dto: PrepareExternalPayoutDto) {
    return this.database.withClinicContext(proof, clinicId, ['integrations.payouts.manage'], async (tx, ctx) => {
      const existing = await tx.externalPayout.findUnique({
        where: { clinicId_idempotencyKey: { clinicId, idempotencyKey: dto.idempotencyKey } },
      });
      if (existing) {
        if (existing.commissionSettlementId !== dto.commissionSettlementId) {
          throw new ConflictException('IDEMPOTENCY_KEY_CONFLICT');
        }
        return existing;
      }

      const settlement = await tx.practitionerCommissionSettlement.findFirst({
        where: { clinicId, id: dto.commissionSettlementId },
      });
      if (!settlement) throw new NotFoundException('COMMISSION_SETTLEMENT_NOT_FOUND');

      const config = await tx.paymentProviderConfiguration.findFirst({
        where: { clinicId, id: dto.providerConfigId },
      });
      if (!config) throw new NotFoundException('PROVIDER_CONFIG_NOT_FOUND');

      const counter = await tx.externalPayoutCounter.upsert({
        where: { clinicId },
        create: { clinicId, lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
      });
      const payoutNumber = `PO-${String(counter.lastNumber).padStart(5, '0')}`;

      return tx.externalPayout.create({
        data: {
          clinicId,
          payoutNumber,
          commissionSettlementId: settlement.id,
          providerConfigId: config.id,
          providerCode: config.providerCode,
          mode: config.mode,
          status: 'PREPARED',
          amountMinor: settlement.netSettledMinor,
          currency: settlement.currency,
          currencyScale: settlement.currencyScale,
          idempotencyKey: dto.idempotencyKey,
          preparedByMembershipId: ctx.membershipId,
        },
      });
    });
  }

  approveExternalPayout(
    proof: VerifiedPrincipal,
    clinicId: string,
    payoutId: string,
    dto: ApproveExternalPayoutDto,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['integrations.payouts.manage'], async (tx, ctx) => {
      const payout = await tx.externalPayout.findFirst({
        where: { clinicId, id: payoutId },
      });
      if (!payout) throw new NotFoundException('EXTERNAL_PAYOUT_NOT_FOUND');
      if (payout.status !== 'PREPARED') {
        throw new BadRequestException('PAYOUT_NOT_IN_PREPARED_STATE');
      }
      if (payout.preparedByMembershipId === ctx.membershipId) {
        throw new ForbiddenException('SEGREGATION_OF_DUTIES_VIOLATION');
      }

      let providerPayoutId: string | null = null;
      let status: 'APPROVED' | 'SUBMITTED' = 'APPROVED';
      if (dto.submitSandbox) {
        if (payout.mode !== 'SANDBOX') {
          throw new BadRequestException('LIVE_AUTO_PAYOUT_DISABLED');
        }
        if (!payout.providerCode) {
          throw new BadRequestException('PAYOUT_PROVIDER_NOT_SET');
        }
        const adapter = getPaymentProviderAdapter(payout.providerCode);
        if (!adapter.isExecutionSupported) {
          throw new BadRequestException(`PROVIDER_ADAPTER_DISABLED:${payout.providerCode}`);
        }
        const res = adapter.executePayout({
          payoutNumber: payout.payoutNumber,
          amountMinor: Number(payout.amountMinor),
          currency: payout.currency,
          beneficiaryRef: payout.commissionSettlementId,
          mode: payout.mode,
        });
        providerPayoutId = res.providerPayoutId;
        status = 'SUBMITTED';
      }

      return tx.externalPayout.update({
        where: { clinicId_id: { clinicId, id: payout.id } },
        data: {
          status,
          providerPayoutId,
          approvedByMembershipId: ctx.membershipId,
          approvedAt: new Date(),
          submittedAt: status === 'SUBMITTED' ? new Date() : null,
          version: { increment: 1 },
        },
      });
    });
  }

  // ---------------------------------------------------------------------------
  // 5. External Reconciliation Engine (Read-Only Ledger Comparison)
  // ---------------------------------------------------------------------------
  listReconciliationRuns(proof: VerifiedPrincipal, clinicId: string) {
    return this.database.withClinicContext(proof, clinicId, ['integrations.reconciliation.read'], async (tx) => {
      return tx.externalReconciliationRun.findMany({
        where: { clinicId },
        include: { findings: true },
        orderBy: [{ createdAt: 'desc' }],
        take: 25,
      });
    });
  }

  runExternalReconciliation(proof: VerifiedPrincipal, clinicId: string, dto: RunExternalReconciliationDto) {
    return this.database.withClinicContext(proof, clinicId, ['integrations.reconciliation.run'], async (tx, ctx) => {
      const periodStart = new Date(dto.periodStart);
      const periodEnd = new Date(dto.periodEnd);
      const scope: ReconciliationScope = dto.scope ?? 'PAYMENT_PROVIDER';

      const intents = await tx.paymentIntent.findMany({
        where: {
          clinicId,
          createdAt: { gte: periodStart, lte: periodEnd },
          ...(dto.providerCode ? { providerCode: dto.providerCode } : {}),
        },
      });
      const settlements = await tx.paymentSettlement.findMany({
        where: { clinicId, settledAt: { gte: periodStart, lte: periodEnd } },
      });
      const payouts = await tx.externalPayout.findMany({
        where: { clinicId, createdAt: { gte: periodStart, lte: periodEnd } },
      });
      const refunds = await tx.externalRefund.findMany({
        where: { clinicId, createdAt: { gte: periodStart, lte: periodEnd } },
      });

      const counter = await tx.externalReconciliationRunCounter.upsert({
        where: { clinicId },
        create: { clinicId, lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
      });
      const runNumber = `REC-${String(counter.lastNumber).padStart(5, '0')}`;

      const findings: Array<{
        findingType: ReconciliationFindingType;
        severity: ReconciliationFindingSeverity;
        entityType: string;
        entityId: string;
        expectedAmountMinor?: bigint;
        actualAmountMinor?: bigint;
        currency?: string;
        descriptionAr: string;
        descriptionEn: string;
      }> = [];

      const providerTxMap = new Map(
        (dto.providerTransactions ?? []).map((item) => [item.providerIntentId, item]),
      );

      for (const intent of intents) {
        if (intent.status === 'SUCCEEDED' && !intent.postedPaymentId) {
          findings.push({
            findingType: 'INTERNAL_PAYMENT_MISSING',
            severity: 'CRITICAL',
            entityType: 'PaymentIntent',
            entityId: intent.id,
            expectedAmountMinor: intent.amountMinor,
            actualAmountMinor: 0n,
            currency: intent.currency,
            descriptionAr: `نية الدفع الناجحة ${intent.providerIntentId ?? intent.id} لا تحتوي على قيد سداد داخلي.`,
            descriptionEn: `Succeeded intent ${intent.providerIntentId ?? intent.id} has no posted internal Payment.`,
          });
        }
        const ext = intent.providerIntentId ? providerTxMap.get(intent.providerIntentId) : undefined;
        if (intent.status === 'SUCCEEDED' && dto.providerTransactions && !ext) {
          findings.push({
            findingType: 'PROVIDER_PAYMENT_MISSING',
            severity: 'WARNING',
            entityType: 'PaymentIntent',
            entityId: intent.id,
            expectedAmountMinor: intent.amountMinor,
            actualAmountMinor: 0n,
            currency: intent.currency,
            descriptionAr: `العملية ${intent.providerIntentId ?? intent.id} مفقودة في كشف مزود الدفع.`,
            descriptionEn: `Internal succeeded intent ${intent.providerIntentId ?? intent.id} missing from provider statement.`,
          });
        } else if (ext) {
          if (ext.currency !== intent.currency) {
            findings.push({
              findingType: 'CURRENCY_MISMATCH',
              severity: 'CRITICAL',
              entityType: 'PaymentIntent',
              entityId: intent.id,
              currency: intent.currency,
              descriptionAr: `اختلاف العملة للعملية ${ext.providerIntentId}: داخلياً ${intent.currency} وخارجياً ${ext.currency}.`,
              descriptionEn: `Currency mismatch for ${ext.providerIntentId}: internal ${intent.currency} vs provider ${ext.currency}.`,
            });
          } else if (BigInt(ext.amountMinor) !== intent.amountMinor) {
            findings.push({
              findingType: 'AMOUNT_MISMATCH',
              severity: 'CRITICAL',
              entityType: 'PaymentIntent',
              entityId: intent.id,
              expectedAmountMinor: intent.amountMinor,
              actualAmountMinor: BigInt(ext.amountMinor),
              currency: intent.currency,
              descriptionAr: `اختلاف المبلغ للعملية ${ext.providerIntentId}: داخلياً ${intent.amountMinor.toString()} وخارجياً ${ext.amountMinor}.`,
              descriptionEn: `Amount mismatch for ${ext.providerIntentId}: internal ${intent.amountMinor.toString()} vs provider ${ext.amountMinor}.`,
            });
          }
          providerTxMap.delete(ext.providerIntentId);
        }
      }

      for (const [, unmatchedExt] of providerTxMap) {
        findings.push({
          findingType: 'INTERNAL_PAYMENT_MISSING',
          severity: 'CRITICAL',
          entityType: 'ProviderTransaction',
          entityId: unmatchedExt.providerIntentId,
          expectedAmountMinor: 0n,
          actualAmountMinor: BigInt(unmatchedExt.amountMinor),
          currency: unmatchedExt.currency,
          descriptionAr: `معاملة المزود ${unmatchedExt.providerIntentId} غير موجودة في السجل الداخلي.`,
          descriptionEn: `Provider transaction ${unmatchedExt.providerIntentId} has no matching internal PaymentIntent.`,
        });
      }

      const bankMap = new Map((dto.bankStatements ?? []).map((b) => [b.bankReference, b]));
      for (const s of settlements) {
        if (s.bankReference && dto.bankStatements) {
          const bankRow = bankMap.get(s.bankReference);
          if (!bankRow) {
            findings.push({
              findingType: 'SETTLEMENT_FEE_VARIANCE',
              severity: 'WARNING',
              entityType: 'PaymentSettlement',
              entityId: s.id,
              expectedAmountMinor: s.netAmountMinor,
              actualAmountMinor: 0n,
              currency: s.currency,
              descriptionAr: `المرجع البنكي ${s.bankReference} للتسوية ${s.providerSettlementId} مفقود في كشف البنك.`,
              descriptionEn: `Settlement ${s.providerSettlementId} bank reference ${s.bankReference} missing from bank statement.`,
            });
          } else if (BigInt(bankRow.netAmountMinor) !== s.netAmountMinor) {
            findings.push({
              findingType: 'SETTLEMENT_FEE_VARIANCE',
              severity: 'CRITICAL',
              entityType: 'PaymentSettlement',
              entityId: s.id,
              expectedAmountMinor: s.netAmountMinor,
              actualAmountMinor: BigInt(bankRow.netAmountMinor),
              currency: s.currency,
              descriptionAr: `صافي التسوية ${s.providerSettlementId} (${s.netAmountMinor.toString()}) يختلف عن البنك (${bankRow.netAmountMinor}).`,
              descriptionEn: `Settlement ${s.providerSettlementId} net ${s.netAmountMinor.toString()} differs from bank ${bankRow.netAmountMinor}.`,
            });
          }
        }
      }

      for (const p of payouts) {
        if (p.status === 'SUBMITTED' && !p.bankReference) {
          findings.push({
            findingType: 'PAYOUT_UNVERIFIED',
            severity: 'WARNING',
            entityType: 'ExternalPayout',
            entityId: p.id,
            expectedAmountMinor: p.amountMinor,
            currency: p.currency,
            descriptionAr: `الدفعة ${p.payoutNumber} مرسلة دون مرجع تسوية بنكي.`,
            descriptionEn: `Payout ${p.payoutNumber} is SUBMITTED without bank settlement reference.`,
          });
        }
      }

      for (const r of refunds) {
        if (r.status === 'FAILED') {
          findings.push({
            findingType: 'REFUND_STATUS_MISMATCH',
            severity: 'CRITICAL',
            entityType: 'ExternalRefund',
            entityId: r.id,
            expectedAmountMinor: r.amountMinor,
            currency: r.currency,
            descriptionAr: `فشل الاسترداد الخارجي ${r.id} لدى مزود الدفع.`,
            descriptionEn: `External refund ${r.id} failed at provider.`,
          });
        }
      }

      const internalPostedTotalMinor = intents
        .filter((i) => i.status === 'SUCCEEDED' && i.postedPaymentId)
        .reduce((acc, i) => acc + i.amountMinor, 0n);
      const providerReportedTotalMinor = (dto.providerTransactions ?? []).reduce(
        (acc, t) => acc + BigInt(t.amountMinor),
        0n,
      );
      const bankSettledTotalMinor = (dto.bankStatements ?? []).reduce(
        (acc, b) => acc + BigInt(b.netAmountMinor),
        0n,
      );

      return tx.externalReconciliationRun.create({
        data: {
          clinicId,
          runNumber,
          scope,
          providerCode: dto.providerCode ?? null,
          periodStart,
          periodEnd,
          status: findings.length > 0 ? 'COMPLETED_WITH_FINDINGS' : 'COMPLETED',
          totalChecked: intents.length + settlements.length + payouts.length + refunds.length,
          discrepancyCount: findings.length,
          summaryJson: {
            internalPostedTotalMinor: internalPostedTotalMinor.toString(),
            providerReportedTotalMinor: providerReportedTotalMinor.toString(),
            bankSettledTotalMinor: bankSettledTotalMinor.toString(),
          },
          executedByMembershipId: ctx.membershipId,
          findings: {
            create: findings.map((f) => ({
              findingType: f.findingType,
              severity: f.severity,
              entityType: f.entityType,
              entityId: f.entityId,
              expectedAmountMinor: f.expectedAmountMinor ?? null,
              actualAmountMinor: f.actualAmountMinor ?? null,
              currency: f.currency ?? null,
              descriptionAr: f.descriptionAr,
              descriptionEn: f.descriptionEn,
            })),
          },
        },
        include: { findings: true },
      });
    });
  }

  // ---------------------------------------------------------------------------
  // 6. Jurisdiction-Aware Regulatory Integration Foundations
  // ---------------------------------------------------------------------------
  getRegulatoryProfile(proof: VerifiedPrincipal, clinicId: string) {
    return this.database.withClinicContext(proof, clinicId, ['integrations.regulatory.read'], async (tx) => {
      return tx.clinicRegulatoryProfile.findUnique({ where: { clinicId } });
    });
  }

  upsertRegulatoryProfile(proof: VerifiedPrincipal, clinicId: string, dto: UpsertRegulatoryProfileDto) {
    return this.database.withClinicContext(proof, clinicId, ['integrations.regulatory.manage'], async (tx, ctx) => {
      const profile = await tx.clinicRegulatoryProfile.upsert({
        where: { clinicId },
        create: {
          clinicId,
          countryCode: dto.countryCode,
          framework: dto.framework,
          taxRegistrationNumber: dto.taxRegistrationNumber ?? null,
          invoiceNumberingPrefix: dto.invoiceNumberingPrefix ?? null,
          isEInvoicingEnabled: dto.isEInvoicingEnabled,
          sandboxMode: dto.sandboxMode,
        },
        update: {
          countryCode: dto.countryCode,
          framework: dto.framework,
          taxRegistrationNumber: dto.taxRegistrationNumber ?? null,
          invoiceNumberingPrefix: dto.invoiceNumberingPrefix ?? null,
          isEInvoicingEnabled: dto.isEInvoicingEnabled,
          sandboxMode: dto.sandboxMode,
          version: { increment: 1 },
        },
      });

      await this.audit.record(
        {
          clinicId,
          actorId: ctx.userId,
          action: 'integrations.regulatory_profile.upsert',
          category: 'IDENTITY',
          targetType: 'ClinicRegulatoryProfile',
          targetId: profile.clinicId,
          outcome: 'SUCCESS',
          metadata: {
            framework: profile.framework,
            sandboxMode: profile.sandboxMode,
            isEInvoicingEnabled: profile.isEInvoicingEnabled,
          },
        },
        tx,
      );

      return profile;
    });
  }

  listRegulatoryDocuments(proof: VerifiedPrincipal, clinicId: string) {
    return this.database.withClinicContext(proof, clinicId, ['integrations.regulatory.read'], async (tx) => {
      return tx.regulatoryDocument.findMany({
        where: { clinicId },
        include: { submissions: { include: { events: true } } },
        orderBy: [{ createdAt: 'desc' }],
        take: 100,
      });
    });
  }

  prepareRegulatoryDocument(proof: VerifiedPrincipal, clinicId: string, dto: PrepareRegulatoryDocumentDto) {
    return this.database.withClinicContext(proof, clinicId, ['integrations.regulatory.manage'], async (tx, ctx) => {
      const profile = await tx.clinicRegulatoryProfile.findUnique({ where: { clinicId } });
      if (!profile) throw new BadRequestException('REGULATORY_PROFILE_NOT_CONFIGURED');

      const clinic = await tx.clinic.findUniqueOrThrow({ where: { id: clinicId } });
      const inv = await tx.invoice.findFirst({ where: { clinicId, id: dto.invoiceId } });
      if (!inv) throw new NotFoundException('INVOICE_NOT_FOUND');

      const counter = await tx.regulatoryDocumentCounter.upsert({
        where: { clinicId },
        create: { clinicId, lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
      });
      const prefix = profile.invoiceNumberingPrefix || 'REG';
      const documentNumber = `${prefix}-${String(counter.lastNumber).padStart(6, '0')}`;

      const adapter = getRegulatoryAdapter(profile.framework);
      const prepared = adapter.prepareDocument({
        clinicId,
        framework: profile.framework,
        countryCode: profile.countryCode,
        documentType: dto.documentType,
        documentNumber,
        taxRegistrationNumber: profile.taxRegistrationNumber ?? 'UNCONFIGURED',
        legalEntityName: clinic.legalName ?? clinic.displayName,
        currency: inv.currency,
        netMinor: Number(inv.subtotalMinor - inv.discountMinor),
        taxMinor: Number(inv.taxMinor),
        grossMinor: Number(inv.totalMinor),
        issuedAtIso: new Date().toISOString(),
        invoiceNumber: inv.number,
        invoiceId: inv.id,
      });

      return tx.regulatoryDocument.create({
        data: {
          clinicId,
          invoiceId: inv.id,
          documentNumber,
          documentType: dto.documentType,
          framework: profile.framework,
          countryCode: profile.countryCode,
          canonicalHash: prepared.canonicalHash,
          payloadJson: prepared.payloadJson as Prisma.InputJsonValue,
          status: 'VALIDATED_LOCALLY',
          isImmutable: true,
          createdByMembershipId: ctx.membershipId,
        },
      });
    });
  }

  submitRegulatoryDocument(proof: VerifiedPrincipal, clinicId: string, documentId: string) {
    return this.database.withClinicContext(proof, clinicId, ['integrations.regulatory.manage'], async (tx, ctx) => {
      const doc = await tx.regulatoryDocument.findFirst({
        where: { clinicId, id: documentId },
      });
      if (!doc) throw new NotFoundException('REGULATORY_DOCUMENT_NOT_FOUND');

      const profile = await tx.clinicRegulatoryProfile.findUnique({ where: { clinicId } });
      const mode: IntegrationMode = !profile || profile.sandboxMode ? 'SANDBOX' : 'LIVE';

      const adapter = getRegulatoryAdapter(doc.framework);
      const outcome = adapter.submitDocument(
        {
          canonicalHash: doc.canonicalHash,
          payloadJson: doc.payloadJson as Record<string, unknown>,
        },
        mode,
      );

      await tx.regulatoryDocument.update({
        where: { clinicId_id: { clinicId, id: doc.id } },
        data: { status: outcome.status },
      });

      const submission = await tx.regulatorySubmission.create({
        data: {
          clinicId,
          documentId: doc.id,
          framework: doc.framework,
          mode,
          status: outcome.status,
          externalReferenceId: outcome.externalReferenceId,
          responseSummary: {
            responseCode: outcome.responseCode,
            responseMessage: outcome.responseMessage,
            disclaimer: outcome.disclaimer,
          },
          submittedByMembershipId: ctx.membershipId,
        },
      });

      const ev = await tx.regulatorySubmissionEvent.create({
        data: {
          clinicId,
          submissionId: submission.id,
          eventType: outcome.status,
          status: outcome.status,
          detailsJson: { disclaimer: outcome.disclaimer },
        },
      });

      return { ...submission, events: [ev] };
    });
  }
}
