import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type {
  IntegrationMode,
  PaymentIntentStatus,
  PaymentProviderCode,
} from '../generated/prisma/client.js';

export const ALLOWED_PAYMENT_INTENT_TRANSITIONS: Readonly<Record<PaymentIntentStatus, readonly PaymentIntentStatus[]>> = {
  CREATED: ['REQUIRES_ACTION', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED'],
  REQUIRES_ACTION: ['PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED'],
  PROCESSING: ['SUCCEEDED', 'FAILED', 'CANCELLED'],
  SUCCEEDED: [],
  FAILED: [],
  CANCELLED: [],
};

export function canTransitionPaymentIntent(from: PaymentIntentStatus, to: PaymentIntentStatus): boolean {
  if (from === to) return true;
  return ALLOWED_PAYMENT_INTENT_TRANSITIONS[from].includes(to);
}

export interface CreateProviderIntentInput {
  clinicId: string;
  invoiceId: string;
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
  mode: IntegrationMode;
  merchantAccountRef?: string | null;
  returnUrl?: string | null;
}

export interface CreateProviderIntentResult {
  providerIntentId: string;
  status: PaymentIntentStatus;
  clientActionUrl: string | null;
  expiresAt: Date;
}

export interface ProviderRefundInput {
  providerIntentId: string;
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
  reason?: string | null;
  mode: IntegrationMode;
}

export interface ProviderRefundResult {
  providerRefundId: string;
  status: 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
}

export interface ProviderPayoutInput {
  payoutNumber: string;
  amountMinor: number;
  currency: string;
  beneficiaryRef: string;
  mode: IntegrationMode;
}

export interface ProviderPayoutResult {
  providerPayoutId: string;
  status: 'SUBMITTED' | 'SETTLED' | 'FAILED';
}

export interface WebhookSignatureCheckInput {
  rawBody: string;
  signatureHeader: string | undefined;
  timestampHeader: string | undefined;
  webhookSecret: string;
  nowMs?: number;
  toleranceSeconds?: number;
}

export interface WebhookSignatureCheckResult {
  ok: boolean;
  reason?: 'MISSING_SIGNATURE' | 'MISSING_TIMESTAMP' | 'INVALID_TIMESTAMP' | 'TIMESTAMP_EXPIRED' | 'INVALID_SIGNATURE';
}

export interface PaymentProviderAdapter {
  readonly providerCode: PaymentProviderCode;
  readonly isExecutionSupported: boolean;
  healthCheck(mode: IntegrationMode): { ok: boolean; status: 'HEALTHY' | 'NOT_CONFIGURED'; message: string };
  createPaymentIntent(input: CreateProviderIntentInput): CreateProviderIntentResult;
  executeRefund(input: ProviderRefundInput): ProviderRefundResult;
  executePayout(input: ProviderPayoutInput): ProviderPayoutResult;
  verifyWebhookSignature(input: WebhookSignatureCheckInput): WebhookSignatureCheckResult;
}

export function computeHmacSha256WebhookSignature(rawBody: string, webhookSecret: string, timestampSec: number): string {
  const signedPayload = `${timestampSec}.${rawBody}`;
  return createHmac('sha256', webhookSecret).update(signedPayload, 'utf8').digest('hex');
}

export function verifyHmacSha256WebhookSignature(input: WebhookSignatureCheckInput): WebhookSignatureCheckResult {
  if (!input.signatureHeader) return { ok: false, reason: 'MISSING_SIGNATURE' };
  if (!input.timestampHeader) return { ok: false, reason: 'MISSING_TIMESTAMP' };

  const timestampSec = Number(input.timestampHeader);
  if (!Number.isFinite(timestampSec) || timestampSec <= 0) {
    return { ok: false, reason: 'INVALID_TIMESTAMP' };
  }

  const nowSec = Math.floor((input.nowMs ?? Date.now()) / 1000);
  const tolerance = input.toleranceSeconds ?? 300;
  if (Math.abs(nowSec - timestampSec) > tolerance) {
    return { ok: false, reason: 'TIMESTAMP_EXPIRED' };
  }

  const normalizedSig = input.signatureHeader.startsWith('sha256=')
    ? input.signatureHeader.slice(7).trim().toLowerCase()
    : input.signatureHeader.trim().toLowerCase();

  if (!/^[0-9a-f]{64}$/.test(normalizedSig)) {
    return { ok: false, reason: 'INVALID_SIGNATURE' };
  }

  const expectedHex = computeHmacSha256WebhookSignature(input.rawBody, input.webhookSecret, timestampSec);
  const actualBuf = Buffer.from(normalizedSig, 'hex');
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) {
    return { ok: false, reason: 'INVALID_SIGNATURE' };
  }
  return { ok: true };
}

class SandboxMockPaymentAdapter implements PaymentProviderAdapter {
  readonly providerCode: PaymentProviderCode = 'SANDBOX_MOCK';
  readonly isExecutionSupported = true;

  healthCheck(mode: IntegrationMode) {
    if (mode === 'LIVE') {
      return {
        ok: false,
        status: 'NOT_CONFIGURED' as const,
        message: 'SANDBOX_MOCK cannot operate in LIVE mode.',
      };
    }
    return {
      ok: true,
      status: 'HEALTHY' as const,
      message: 'Deterministic sandbox adapter ready (no live funds moved).',
    };
  }

  createPaymentIntent(input: CreateProviderIntentInput): CreateProviderIntentResult {
    if (input.mode !== 'SANDBOX') {
      throw new Error('SANDBOX_MOCK_ONLY_SUPPORTS_SANDBOX_MODE');
    }
    const digest = createHash('sha256')
      .update(`${input.clinicId}:${input.invoiceId}:${input.idempotencyKey}`)
      .digest('hex')
      .slice(0, 20);
    const providerIntentId = `sbx_pi_${digest}`;
    return {
      providerIntentId,
      status: 'REQUIRES_ACTION',
      clientActionUrl: input.returnUrl
        ? `${input.returnUrl}${input.returnUrl.includes('?') ? '&' : '?'}mockIntent=${providerIntentId}`
        : `/sandbox-checkout/${providerIntentId}`,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    };
  }

  executeRefund(input: ProviderRefundInput): ProviderRefundResult {
    if (input.mode !== 'SANDBOX') {
      throw new Error('SANDBOX_MOCK_ONLY_SUPPORTS_SANDBOX_MODE');
    }
    const digest = createHash('sha256')
      .update(`${input.providerIntentId}:${input.idempotencyKey}`)
      .digest('hex')
      .slice(0, 16);
    return {
      providerRefundId: `sbx_rf_${digest}`,
      status: 'SUCCEEDED',
    };
  }

  executePayout(input: ProviderPayoutInput): ProviderPayoutResult {
    if (input.mode !== 'SANDBOX') {
      throw new Error('SANDBOX_MOCK_ONLY_SUPPORTS_SANDBOX_MODE');
    }
    const digest = createHash('sha256')
      .update(`${input.payoutNumber}:${input.beneficiaryRef}:${input.amountMinor}`)
      .digest('hex')
      .slice(0, 16);
    return {
      providerPayoutId: `sbx_po_${digest}`,
      status: 'SUBMITTED',
    };
  }

  verifyWebhookSignature(input: WebhookSignatureCheckInput): WebhookSignatureCheckResult {
    return verifyHmacSha256WebhookSignature(input);
  }
}

class DisabledProviderStubAdapter implements PaymentProviderAdapter {
  readonly isExecutionSupported = false;

  constructor(readonly providerCode: PaymentProviderCode) {}

  healthCheck() {
    return {
      ok: false,
      status: 'NOT_CONFIGURED' as const,
      message: `Adapter ${this.providerCode} is a disabled-by-default stub in Step 5.5; live credentials and transport are not enabled.`,
    };
  }

  createPaymentIntent(): CreateProviderIntentResult {
    throw new Error(`PROVIDER_ADAPTER_DISABLED:${this.providerCode}`);
  }

  executeRefund(): ProviderRefundResult {
    throw new Error(`PROVIDER_ADAPTER_DISABLED:${this.providerCode}`);
  }

  executePayout(): ProviderPayoutResult {
    throw new Error(`PROVIDER_ADAPTER_DISABLED:${this.providerCode}`);
  }

  verifyWebhookSignature(input: WebhookSignatureCheckInput): WebhookSignatureCheckResult {
    return verifyHmacSha256WebhookSignature(input);
  }
}

const ADAPTER_REGISTRY: Readonly<Record<PaymentProviderCode, PaymentProviderAdapter>> = {
  SANDBOX_MOCK: new SandboxMockPaymentAdapter(),
  MOYASAR: new DisabledProviderStubAdapter('MOYASAR'),
  CHECKOUT_COM: new DisabledProviderStubAdapter('CHECKOUT_COM'),
  STRIPE: new DisabledProviderStubAdapter('STRIPE'),
  REGIONAL_BANK_GATEWAY: new DisabledProviderStubAdapter('REGIONAL_BANK_GATEWAY'),
};

export function getPaymentProviderAdapter(code: PaymentProviderCode): PaymentProviderAdapter {
  return ADAPTER_REGISTRY[code];
}
