import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IntegrationCryptoService } from '../src/integrations/integration-crypto.service.js';
import {
  canTransitionPaymentIntent,
  computeHmacSha256WebhookSignature,
  getPaymentProviderAdapter,
  verifyHmacSha256WebhookSignature,
} from '../src/integrations/payment-provider.adapter.js';
import { getRegulatoryAdapter } from '../src/integrations/regulatory.adapter.js';
import { permissionsFor } from '../src/auth/permissions.js';

describe('Step 5.5 Integrations Policy & Security Unit Tests', () => {
  it('encrypts and decrypts provider secrets with AES-256-GCM and generates safe fingerprints', () => {
    const crypto = new IntegrationCryptoService();
    const secret = 'sk_sandbox_super_secret_1234567890';
    const encrypted = crypto.encryptSecret(secret);
    assert.ok(encrypted.startsWith('v1:'));
    assert.ok(!encrypted.includes(secret));
    assert.equal(crypto.decryptSecret(encrypted), secret);

    const fp = crypto.fingerprintSecret(secret);
    assert.ok(fp.includes('****'));
    assert.ok(!fp.includes(secret));
  });

  it('enforces valid PaymentIntent state transitions and rejects out-of-order regressions', () => {
    assert.equal(canTransitionPaymentIntent('CREATED', 'REQUIRES_ACTION'), true);
    assert.equal(canTransitionPaymentIntent('REQUIRES_ACTION', 'SUCCEEDED'), true);
    assert.equal(canTransitionPaymentIntent('PROCESSING', 'SUCCEEDED'), true);
    assert.equal(canTransitionPaymentIntent('SUCCEEDED', 'SUCCEEDED'), true);

    assert.equal(canTransitionPaymentIntent('SUCCEEDED', 'PROCESSING'), false);
    assert.equal(canTransitionPaymentIntent('SUCCEEDED', 'FAILED'), false);
    assert.equal(canTransitionPaymentIntent('CANCELLED', 'SUCCEEDED'), false);
    assert.equal(canTransitionPaymentIntent('FAILED', 'SUCCEEDED'), false);
  });

  it('verifies HMAC-SHA256 webhook signatures and rejects expired or tampered payloads', () => {
    const secret = 'whsec_test_secret_123456';
    const rawBody = JSON.stringify({ eventId: 'evt_1', eventType: 'payment.succeeded', providerIntentId: 'sbx_pi_1' });
    const nowSec = 1_750_000_000;
    const sig = computeHmacSha256WebhookSignature(rawBody, secret, nowSec);

    const valid = verifyHmacSha256WebhookSignature({
      rawBody,
      signatureHeader: `sha256=${sig}`,
      timestampHeader: String(nowSec),
      webhookSecret: secret,
      nowMs: (nowSec + 10) * 1000,
    });
    assert.equal(valid.ok, true);

    const tampered = verifyHmacSha256WebhookSignature({
      rawBody: rawBody.replace('evt_1', 'evt_2'),
      signatureHeader: `sha256=${sig}`,
      timestampHeader: String(nowSec),
      webhookSecret: secret,
      nowMs: (nowSec + 10) * 1000,
    });
    assert.equal(tampered.ok, false);
    assert.equal(tampered.reason, 'INVALID_SIGNATURE');

    const expired = verifyHmacSha256WebhookSignature({
      rawBody,
      signatureHeader: `sha256=${sig}`,
      timestampHeader: String(nowSec - 600),
      webhookSecret: secret,
      nowMs: nowSec * 1000,
    });
    assert.equal(expired.ok, false);
    assert.equal(expired.reason, 'TIMESTAMP_EXPIRED');
  });

  it('keeps live payment provider adapters disabled by default and deterministic in SANDBOX_MOCK', () => {
    const sandbox = getPaymentProviderAdapter('SANDBOX_MOCK');
    assert.equal(sandbox.isExecutionSupported, true);
    assert.equal(sandbox.healthCheck('LIVE').ok, false);

    for (const code of ['MOYASAR', 'CHECKOUT_COM', 'STRIPE', 'REGIONAL_BANK_GATEWAY'] as const) {
      const stub = getPaymentProviderAdapter(code);
      assert.equal(stub.isExecutionSupported, false);
      assert.equal(stub.healthCheck('LIVE').status, 'NOT_CONFIGURED');
      assert.throws(() =>
        stub.createPaymentIntent({
          clinicId: '00000000-0000-0000-0000-000000000001',
          invoiceId: '00000000-0000-0000-0000-000000000002',
          amountMinor: 1000,
          currency: 'SAR',
          idempotencyKey: '00000000-0000-0000-0000-000000000003',
          mode: 'LIVE',
        }),
      );
    }
  });

  it('marks SA_ZATCA regulatory adapter as MOCK_SUBMITTED in sandbox and NOT_CONFIGURED in live mode', () => {
    const zatca = getRegulatoryAdapter('SA_ZATCA');
    const doc = zatca.prepareDocument({
      clinicId: '00000000-0000-0000-0000-000000000001',
      framework: 'SA_ZATCA',
      countryCode: 'SA',
      documentType: 'TAX_INVOICE',
      documentNumber: 'ZAT-000001',
      taxRegistrationNumber: '300000000000003',
      legalEntityName: 'Lamssa Clinic',
      currency: 'SAR',
      netMinor: 10000,
      taxMinor: 1500,
      grossMinor: 11500,
      issuedAtIso: '2026-11-12T12:00:00.000Z',
      invoiceNumber: 'INV-0001',
      invoiceId: '00000000-0000-0000-0000-000000000002',
    });
    assert.equal(doc.canonicalHash.length, 64);

    const sandboxOutcome = zatca.submitDocument(doc, 'SANDBOX');
    assert.equal(sandboxOutcome.status, 'MOCK_SUBMITTED');
    assert.ok(sandboxOutcome.disclaimer.includes('NOT cleared'));

    const liveOutcome = zatca.submitDocument(doc, 'LIVE');
    assert.equal(liveOutcome.status, 'NOT_CONFIGURED');
  });

  it('scopes integrations RBAC permissions strictly by clinic role', () => {
    const owner = permissionsFor('CLINIC_OWNER');
    const accountant = permissionsFor('ACCOUNTANT');
    const receptionist = permissionsFor('RECEPTIONIST');
    const doctor = permissionsFor('DOCTOR');

    assert.ok(owner.includes('integrations.providers.manage'));
    assert.ok(accountant.includes('integrations.reconciliation.run'));
    assert.equal(accountant.includes('integrations.providers.manage'), false);
    assert.ok(receptionist.includes('integrations.payments.initiate'));
    assert.equal(receptionist.includes('integrations.refunds.execute'), false);
    assert.equal(doctor.some((p) => p.startsWith('integrations.')), false);
  });
});
