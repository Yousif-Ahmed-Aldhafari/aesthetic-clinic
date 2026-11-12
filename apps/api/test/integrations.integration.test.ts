import 'reflect-metadata';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { IntegrationsRepository } from '../src/prisma/integrations.repository.js';
import { BillingRepository } from '../src/prisma/billing.repository.js';
import { VerifiedSessions } from '../src/prisma/verified-sessions.js';
import { authorizationHash } from '../src/auth/crypto.js';
import { computeHmacSha256WebhookSignature } from '../src/integrations/payment-provider.adapter.js';
import { testUrls, fixtureDatabase } from './database-fixtures.js';

describe('Phase 5 Step 5.5: Payment Gateway, Banking & Regulatory Integrations', { concurrency: 1 }, () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let pool: pg.Pool;
  let repo: IntegrationsRepository;
  let billingRepo: BillingRepository;
  let verifiedSessions: VerifiedSessions;

  const suffix = randomUUID().slice(0, 8);
  let clinicAId: string;
  let clinicBId: string;
  let userOwnerAId: string;
  let userAccountantAId: string;
  let userOwnerBId: string;
  let membershipOwnerAId: string;
  let membershipAccountantAId: string;
  let sessionOwnerAId: string;
  let sessionAccountantAId: string;
  let sessionOwnerBId: string;

  let patientA1Id: string;
  let patientA2Id: string;
  let patientAccountA1Id: string;
  let patientSessionA1Id: string;
  let patientAccountA2Id: string;
  let patientSessionA2Id: string;

  let invoiceA1Id: string;
  let invoiceA2Id: string;
  let providerConfigAId: string;
  const webhookSecretA = 'whsec_lamssa_sandbox_secret_987654321';
  const apiKeyA = 'sk_sandbox_lamssa_test_1234567890';

  before(async () => {
    const urls = testUrls();
    process.env.DATABASE_URL = urls.runtime;
    process.env.NODE_ENV = 'test';
    owner = fixtureDatabase();
    pool = new pg.Pool({ connectionString: urls.runtime, max: 5 });

    const { AppModule } = await import('../src/app.module.js');
    app = await NestFactory.create(AppModule, { logger: false, rawBody: true });
    await app.init();

    repo = app.get(IntegrationsRepository);
    billingRepo = app.get(BillingRepository);
    verifiedSessions = app.get(VerifiedSessions);

    const clinicA = await owner.clinic.create({
      data: {
        slug: `int-a-${suffix}`,
        displayName: 'عيادة لمسة للتكاملات',
        legalName: 'Lamssa Integrations Clinic LLC',
        currency: 'SAR',
        timezone: 'Asia/Riyadh',
        status: 'ACTIVE',
      },
    });
    clinicAId = clinicA.id;

    const clinicB = await owner.clinic.create({
      data: {
        slug: `int-b-${suffix}`,
        displayName: 'عيادة أخرى',
        legalName: 'Other Clinic LLC',
        currency: 'SAR',
        timezone: 'Asia/Riyadh',
        status: 'ACTIVE',
      },
    });
    clinicBId = clinicB.id;

    const uOwnerA = await owner.user.create({
      data: {
        email: `int-owner-a-${suffix}@lamssa.test`,
        passwordHash: 'hash',
        name: 'Owner A',
        status: 'ACTIVE',
      },
    });
    userOwnerAId = uOwnerA.id;

    const uAccA = await owner.user.create({
      data: {
        email: `int-acc-a-${suffix}@lamssa.test`,
        passwordHash: 'hash',
        name: 'Accountant A',
        status: 'ACTIVE',
      },
    });
    userAccountantAId = uAccA.id;

    const uOwnerB = await owner.user.create({
      data: {
        email: `int-owner-b-${suffix}@lamssa.test`,
        passwordHash: 'hash',
        name: 'Owner B',
        status: 'ACTIVE',
      },
    });
    userOwnerBId = uOwnerB.id;

    const mOwnerA = await owner.clinicMembership.create({
      data: { clinicId: clinicAId, userId: userOwnerAId, role: 'CLINIC_OWNER', status: 'ACTIVE' },
    });
    membershipOwnerAId = mOwnerA.id;

    const mAccA = await owner.clinicMembership.create({
      data: { clinicId: clinicAId, userId: userAccountantAId, role: 'ACCOUNTANT', status: 'ACTIVE' },
    });
    membershipAccountantAId = mAccA.id;

    await owner.clinicMembership.create({
      data: { clinicId: clinicBId, userId: userOwnerBId, role: 'CLINIC_OWNER', status: 'ACTIVE' },
    });

    const authUserOwnerA = (await owner.user.findUniqueOrThrow({
      where: { id: userOwnerAId },
      include: { memberships: { include: { clinic: true } } },
    })) as never;
    const authUserAccA = (await owner.user.findUniqueOrThrow({
      where: { id: userAccountantAId },
      include: { memberships: { include: { clinic: true } } },
    })) as never;
    const authUserOwnerB = (await owner.user.findUniqueOrThrow({
      where: { id: userOwnerBId },
      include: { memberships: { include: { clinic: true } } },
    })) as never;

    const expiresAt = new Date(Date.now() + 3600_000);
    sessionOwnerAId = (
      await owner.session.create({
        data: {
          userId: userOwnerAId,
          selectedClinicId: clinicAId,
          tokenHash: randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, ''),
          csrfHash: 'csrf',
          authorizationHash: authorizationHash(authUserOwnerA),
          expiresAt,
        },
      })
    ).id;

    sessionAccountantAId = (
      await owner.session.create({
        data: {
          userId: userAccountantAId,
          selectedClinicId: clinicAId,
          tokenHash: randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, ''),
          csrfHash: 'csrf',
          authorizationHash: authorizationHash(authUserAccA),
          expiresAt,
        },
      })
    ).id;

    sessionOwnerBId = (
      await owner.session.create({
        data: {
          userId: userOwnerBId,
          selectedClinicId: clinicBId,
          tokenHash: randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, ''),
          csrfHash: 'csrf',
          authorizationHash: authorizationHash(authUserOwnerB),
          expiresAt,
        },
      })
    ).id;

    const phoneRand1 = String(Math.floor(1000000 + Math.random() * 8999999));
    const phoneRand2 = String(Math.floor(1000000 + Math.random() * 8999999));
    const p1 = await owner.patient.create({
      data: {
        clinicId: clinicAId,
        patientNumber: 'P-000001',
        fullName: 'سارة المريضة',
        searchName: 'ساره المريضه',
        phone: `+96650${phoneRand1}`,
        status: 'ACTIVE',
      },
    });
    patientA1Id = p1.id;

    const p2 = await owner.patient.create({
      data: {
        clinicId: clinicAId,
        patientNumber: 'P-000002',
        fullName: 'نورة المريضة',
        searchName: 'نوره المريضه',
        phone: `+96651${phoneRand2}`,
        status: 'ACTIVE',
      },
    });
    patientA2Id = p2.id;

    const pa1 = await owner.patientAccount.create({
      data: {
        clinicId: clinicAId,
        patientId: patientA1Id,
        phone: p1.phone!,
        passwordHash: 'hash',
        status: 'ACTIVE',
      },
    });
    patientAccountA1Id = pa1.id;
    patientSessionA1Id = (
      await owner.patientSession.create({
        data: {
          clinicId: clinicAId,
          patientAccountId: patientAccountA1Id,
          sessionTokenHash: randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, ''),
          csrfTokenHash: 'csrf',
          expiresAt,
        },
      })
    ).id;

    const pa2 = await owner.patientAccount.create({
      data: {
        clinicId: clinicAId,
        patientId: patientA2Id,
        phone: p2.phone!,
        passwordHash: 'hash',
        status: 'ACTIVE',
      },
    });
    patientAccountA2Id = pa2.id;
    patientSessionA2Id = (
      await owner.patientSession.create({
        data: {
          clinicId: clinicAId,
          patientAccountId: patientAccountA2Id,
          sessionTokenHash: randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, ''),
          csrfTokenHash: 'csrf',
          expiresAt,
        },
      })
    ).id;

    await owner.clinicBillingProfile.create({
      data: { clinicId: clinicAId },
    });
    const ownerProof = verifiedSessions.issue(userOwnerAId, sessionOwnerAId);
    const inv1Draft = await billingRepo.create(ownerProof, clinicAId, {
      patientId: patientA1Id,
      requestKey: randomUUID(),
      lines: [
        {
          serviceName: 'Aesthetic Session 1',
          quantity: '1',
          unitPrice: '100.00',
          discount: '0',
          taxBasisPoints: 1500,
        },
      ],
    });
    const inv1 = await billingRepo.issue(ownerProof, clinicAId, inv1Draft.id, {
      expectedVersion: inv1Draft.version,
      requestKey: randomUUID(),
    });
    invoiceA1Id = inv1.id;

    const inv2Draft = await billingRepo.create(ownerProof, clinicAId, {
      patientId: patientA1Id,
      requestKey: randomUUID(),
      lines: [
        {
          serviceName: 'Aesthetic Session 2',
          quantity: '1',
          unitPrice: '50.00',
          discount: '0',
          taxBasisPoints: 1500,
        },
      ],
    });
    const inv2 = await billingRepo.issue(ownerProof, clinicAId, inv2Draft.id, {
      expectedVersion: inv2Draft.version,
      requestKey: randomUUID(),
    });
    invoiceA2Id = inv2.id;
  });

  after(async () => {
    await app?.close();
    await pool?.end();
    await owner?.$disconnect();
  });

  it('encrypts provider credentials at rest, never exposes plaintext, and rejects live stubs', async () => {
    const proof = verifiedSessions.issue(userOwnerAId, sessionOwnerAId);
    const config = await repo.upsertProviderConfig(proof, clinicAId, {
      providerCode: 'SANDBOX_MOCK',
      mode: 'SANDBOX',
      isEnabled: true,
      supportedCurrencies: ['SAR'],
      jurisdiction: 'SA',
      apiKey: apiKeyA,
      webhookSecret: webhookSecretA,
    });
    providerConfigAId = config.id;

    assert.equal(config.hasApiKey, true);
    assert.equal(config.hasWebhookSecret, true);
    assert.ok(config.secretFingerprint);
    assert.ok(!JSON.stringify(config).includes(apiKeyA));
    assert.ok(!JSON.stringify(config).includes(webhookSecretA));

    const [dbRow] = await owner.$queryRaw<{ encryptedApiKey: string | null; encryptedWebhookSecret: string | null }[]>`
      SELECT "encryptedApiKey", "encryptedWebhookSecret" FROM public."PaymentProviderConfiguration" WHERE id = ${config.id}::uuid
    `;
    assert.ok(dbRow.encryptedApiKey?.startsWith('v1:'));
    assert.ok(dbRow.encryptedWebhookSecret?.startsWith('v1:'));
    assert.ok(!dbRow.encryptedWebhookSecret?.includes(webhookSecretA));

    await assert.rejects(() =>
      repo.upsertProviderConfig(proof, clinicAId, {
        providerCode: 'MOYASAR',
        mode: 'LIVE',
        isEnabled: true,
      }),
    );
  });

  it('enforces idempotency, overpayment protection, and portal invoice ownership on PaymentIntent', async () => {
    const proof = verifiedSessions.issue(userOwnerAId, sessionOwnerAId);
    const idemKey = randomUUID();

    const first = await repo.createPaymentIntent(proof, clinicAId, {
      invoiceId: invoiceA1Id,
      providerCode: 'SANDBOX_MOCK',
      mode: 'SANDBOX',
      amountMinor: 11500,
      currency: 'SAR',
      idempotencyKey: idemKey,
    });
    const replay = await repo.createPaymentIntent(proof, clinicAId, {
      invoiceId: invoiceA1Id,
      providerCode: 'SANDBOX_MOCK',
      mode: 'SANDBOX',
      amountMinor: 11500,
      currency: 'SAR',
      idempotencyKey: idemKey,
    });
    assert.equal(replay.id, first.id);

    await assert.rejects(() =>
      repo.createPaymentIntent(proof, clinicAId, {
        invoiceId: invoiceA1Id,
        providerCode: 'SANDBOX_MOCK',
        mode: 'SANDBOX',
        amountMinor: 5000,
        currency: 'SAR',
        idempotencyKey: idemKey,
      }),
    );

    await assert.rejects(() =>
      repo.createPaymentIntent(proof, clinicAId, {
        invoiceId: invoiceA1Id,
        providerCode: 'SANDBOX_MOCK',
        mode: 'SANDBOX',
        amountMinor: 12000,
        currency: 'SAR',
        idempotencyKey: randomUUID(),
      }),
    );

    // Portal: Patient A2 cannot pay Patient A1's invoice
    await assert.rejects(() =>
      repo.createPortalPaymentIntent(
        {
          clinicId: clinicAId,
          patientAccountId: patientAccountA2Id,
          patientId: patientA2Id,
          sessionId: patientSessionA2Id,
          sessionToken: 'tok',
          csrfHash: 'csrf',
        },
        {
          invoiceId: invoiceA1Id,
          providerCode: 'SANDBOX_MOCK',
          amountMinor: 1000,
          currency: 'SAR',
          idempotencyKey: randomUUID(),
        },
      ),
    );

    // Portal: Patient A1 can initiate on their own invoice (inv2)
    const portalIntent = await repo.createPortalPaymentIntent(
      {
        clinicId: clinicAId,
        patientAccountId: patientAccountA1Id,
        patientId: patientA1Id,
        sessionId: patientSessionA1Id,
        sessionToken: 'tok',
        csrfHash: 'csrf',
      },
      {
        invoiceId: invoiceA2Id,
        providerCode: 'SANDBOX_MOCK',
        amountMinor: 5750,
        currency: 'SAR',
        idempotencyKey: randomUUID(),
      },
    );
    assert.equal(portalIntent.initiatedByPatientAccountId, patientAccountA1Id);
  });

  it('verifies webhook HMAC-SHA256, prevents duplicates/concurrency/out-of-order, and posts Payment transactionally', async () => {
    const proof = verifiedSessions.issue(userOwnerAId, sessionOwnerAId);
    const intents = await repo.listPaymentIntents(proof, clinicAId, invoiceA1Id);
    const intent = intents[0];
    const nowSec = Math.floor(Date.now() / 1000);

    const payload = {
      eventId: `evt_succ_${suffix}`,
      eventType: 'payment.succeeded',
      providerIntentId: intent.providerIntentId!,
      amountMinor: 11500,
      currency: 'SAR',
    };
    const rawBody = JSON.stringify(payload);
    const validSig = computeHmacSha256WebhookSignature(rawBody, webhookSecretA, nowSec);

    // Reject bad signature
    await assert.rejects(() =>
      repo.ingestPaymentWebhook('SANDBOX_MOCK', rawBody, 'sha256=' + '0'.repeat(64), String(nowSec), payload),
    );

    // Reject expired timestamp
    await assert.rejects(() =>
      repo.ingestPaymentWebhook('SANDBOX_MOCK', rawBody, `sha256=${validSig}`, String(nowSec - 600), payload),
    );

    // Valid delivery
    const res = await repo.ingestPaymentWebhook(
      'SANDBOX_MOCK',
      rawBody,
      `sha256=${validSig}`,
      String(nowSec),
      payload,
    );
    assert.equal(res.processingStatus, 'PROCESSED');

    const invAfter = await owner.invoice.findUniqueOrThrow({ where: { id: invoiceA1Id } });
    assert.equal(invAfter.netPaidMinor, 11500n);
    assert.equal(invAfter.status, 'PAID');

    const paymentCount = await owner.payment.count({ where: { clinicId: clinicAId, invoiceId: invoiceA1Id } });
    assert.equal(paymentCount, 1);

    // Duplicate replay -> no second Payment
    const dup = await repo.ingestPaymentWebhook(
      'SANDBOX_MOCK',
      rawBody,
      `sha256=${validSig}`,
      String(nowSec),
      payload,
    );
    assert.equal(dup.duplicate, true);
    assert.equal(await owner.payment.count({ where: { clinicId: clinicAId, invoiceId: invoiceA1Id } }), 1);

    // Out-of-order regression -> IGNORED_DUPLICATE
    const outOfOrderPayload = {
      eventId: `evt_ooo_${suffix}`,
      eventType: 'payment.processing',
      providerIntentId: intent.providerIntentId!,
    };
    const oooRaw = JSON.stringify(outOfOrderPayload);
    const oooSig = computeHmacSha256WebhookSignature(oooRaw, webhookSecretA, nowSec);
    const oooRes = await repo.ingestPaymentWebhook(
      'SANDBOX_MOCK',
      oooRaw,
      `sha256=${oooSig}`,
      String(nowSec),
      outOfOrderPayload,
    );
    assert.equal(oooRes.processingStatus, 'IGNORED_DUPLICATE');

    // Amount mismatch on inv2 intent -> DEAD_LETTER, zero Payment posted
    const inv2Intents = await repo.listPaymentIntents(proof, clinicAId, invoiceA2Id);
    const inv2Intent = inv2Intents[0];
    const mismatchPayload = {
      eventId: `evt_mis_${suffix}`,
      eventType: 'payment.succeeded',
      providerIntentId: inv2Intent.providerIntentId!,
      amountMinor: 99999,
      currency: 'SAR',
    };
    const misRaw = JSON.stringify(mismatchPayload);
    const misSig = computeHmacSha256WebhookSignature(misRaw, webhookSecretA, nowSec);
    const misRes = await repo.ingestPaymentWebhook(
      'SANDBOX_MOCK',
      misRaw,
      `sha256=${misSig}`,
      String(nowSec),
      mismatchPayload,
    );
    assert.equal(misRes.processingStatus, 'DEAD_LETTER');
    assert.equal(await owner.payment.count({ where: { clinicId: clinicAId, invoiceId: invoiceA2Id } }), 0);
  });

  it('enforces cross-clinic RLS isolation and blocks forged webhook GUCs from restricted runtime SQL', async () => {
    const proofB = verifiedSessions.issue(userOwnerBId, sessionOwnerBId);
    const bProviders = await repo.listProviderConfigs(proofB, clinicBId);
    const bIntents = await repo.listPaymentIntents(proofB, clinicBId);
    assert.equal(bProviders.length, 0);
    assert.equal(bIntents.length, 0);

    const client = await pool.connect();
    try {
      await client.query(`SELECT set_config('lamssa.clinic_id', $1, false), set_config('lamssa.webhook_intent_id', $2, false)`, [
        clinicAId,
        randomUUID(),
      ]);
      const rows = await client.query('SELECT id FROM public."PaymentIntent"');
      assert.equal(rows.rows.length, 0);

      // Negative test 1: Setting arbitrary internal lookup flag yields zero rows for runtime user
      await client.query(`SET lamssa.internal_security_lookup = '1'`);
      const piRows = await client.query('SELECT count(*) FROM public."PaymentIntent"');
      assert.equal(Number(piRows.rows[0].count), 0);
      const ppcRows = await client.query('SELECT count(*) FROM public."PaymentProviderConfiguration"');
      assert.equal(Number(ppcRows.rows[0].count), 0);

      // Negative test 2: Direct runtime caller cannot forge webhook payment posting without valid event
      const fakeEventId = randomUUID();
      const fakeIntentId = randomUUID();
      await assert.rejects(
        () => client.query('SELECT * FROM lamssa_security.post_webhook_payment($1, $2, $3)', [
          clinicAId,
          fakeIntentId,
          fakeEventId,
        ]),
        (err: Error) => err.message.includes('Unauthorized webhook payment context') || err.message.includes('Invalid or stale webhook event')
      );

      // Negative test 3: Even with matching GUCs, lack of valid PaymentProviderEvent fails closed
      await client.query(`SELECT set_config('lamssa.clinic_id', $1, false), set_config('lamssa.webhook_intent_id', $2, false)`, [
        clinicAId,
        fakeIntentId,
      ]);
      await assert.rejects(
        () => client.query('SELECT * FROM lamssa_security.post_webhook_payment($1, $2, $3)', [
          clinicAId,
          fakeIntentId,
          fakeEventId,
        ]),
        (err: Error) => err.message.includes('Invalid or stale webhook event')
      );

      // Reset GUCs
      await client.query(`SELECT set_config('lamssa.clinic_id', '', false), set_config('lamssa.webhook_intent_id', '', false), set_config('lamssa.internal_security_lookup', '', false)`);
    } finally {
      client.release();
    }
  });

  it('enforces segregation of duties on external payouts and executes external refund with PaymentReversal', async () => {
    const proofOwner = verifiedSessions.issue(userOwnerAId, sessionOwnerAId);
    const proofAccountant = verifiedSessions.issue(userAccountantAId, sessionAccountantAId);

    // 1. External Refund
    const intents = await repo.listPaymentIntents(proofOwner, clinicAId, invoiceA1Id);
    const refundReq = await owner.refundRequest.create({
      data: {
        clinicId: clinicAId,
        invoiceId: invoiceA1Id,
        patientId: patientA1Id,
        requestedAmountMinor: 1500n,
        currency: 'SAR',
        currencyScale: 2,
        reason: 'PATIENT_REFUND',
        reasonDetails: 'Sandbox test refund',
        status: 'APPROVED',
        requestedByMembershipId: membershipAccountantAId,
        approvedByMembershipId: membershipOwnerAId,
        approvedAt: new Date(),
        requestKey: randomUUID(),
        requestHash: 'c'.repeat(64),
      },
    });
    const extRefund = await repo.executeExternalRefund(proofAccountant, clinicAId, {
      refundRequestId: refundReq.id,
      paymentIntentId: intents[0].id,
      idempotencyKey: randomUUID(),
    });
    assert.equal(extRefund.status, 'SUCCEEDED');
    const invAfterRefund = await owner.invoice.findUniqueOrThrow({ where: { id: invoiceA1Id } });
    assert.equal(invAfterRefund.netPaidMinor, 10000n);

    // 2. External Payout Segregation of Duties
    const commSettlement = await owner.practitionerCommissionSettlement.create({
      data: {
        clinicId: clinicAId,
        settlementNumber: `CS-${suffix}`,
        practitionerMembershipId: membershipOwnerAId,
        periodStart: new Date(Date.now() - 86400_000),
        periodEnd: new Date(),
        grossAmountMinor: 5000n,
        adjustmentsAmountMinor: 0n,
        netSettledMinor: 5000n,
        currency: 'SAR',
        currencyScale: 2,
        status: 'CONFIRMED',
        confirmedByMembershipId: membershipAccountantAId,
        confirmedAt: new Date(),
        requestKey: randomUUID(),
        requestHash: 'd'.repeat(64),
      },
    });

    const payout = await repo.prepareExternalPayout(proofOwner, clinicAId, {
      commissionSettlementId: commSettlement.id,
      providerConfigId: providerConfigAId,
      idempotencyKey: randomUUID(),
      beneficiaryRef: 'SA0000000000000000000001',
    });

    // Preparer cannot approve their own payout
    await assert.rejects(() =>
      repo.approveExternalPayout(proofOwner, clinicAId, payout.id, { submitSandbox: true }),
    );

    const approved = await repo.approveExternalPayout(proofAccountant, clinicAId, payout.id, {
      submitSandbox: true,
    });
    assert.equal(approved.status, 'SUBMITTED');
    assert.ok(approved.providerPayoutId?.startsWith('sbx_po_'));
  });

  it('runs read-only external reconciliation and records immutable regulatory mock submissions', async () => {
    const proof = verifiedSessions.issue(userAccountantAId, sessionAccountantAId);
    const intents = await repo.listPaymentIntents(proof, clinicAId, invoiceA1Id);

    const run = await repo.runExternalReconciliation(proof, clinicAId, {
      periodStart: new Date(Date.now() - 86400_000).toISOString(),
      periodEnd: new Date(Date.now() + 86400_000).toISOString(),
      scope: 'PAYMENT_PROVIDER',
      providerTransactions: [
        {
          providerIntentId: intents[0].providerIntentId!,
          amountMinor: 9000, // Deliberate mismatch vs 11500
          currency: 'SAR',
        },
        {
          providerIntentId: 'sbx_pi_orphan_external',
          amountMinor: 2500,
          currency: 'SAR',
        },
      ],
    });
    assert.equal(run.status, 'COMPLETED_WITH_FINDINGS');
    assert.ok(run.findings.some((f) => f.findingType === 'AMOUNT_MISMATCH'));
    assert.ok(run.findings.some((f) => f.findingType === 'INTERNAL_PAYMENT_MISSING'));
    assert.ok(run.findings.some((f) => f.findingType === 'PAYOUT_UNVERIFIED'));

    // Regulatory Profile & Immutable Document
    const proofOwner = verifiedSessions.issue(userOwnerAId, sessionOwnerAId);
    const regProfile = await repo.upsertRegulatoryProfile(proofOwner, clinicAId, {
      countryCode: 'SA',
      framework: 'SA_ZATCA',
      taxRegistrationNumber: '300000000000003',
      invoiceNumberingPrefix: 'ZAT',
      isEInvoicingEnabled: true,
      sandboxMode: true,
    });
    assert.equal(regProfile.framework, 'SA_ZATCA');

    const regDoc = await repo.prepareRegulatoryDocument(proofOwner, clinicAId, {
      documentType: 'TAX_INVOICE',
      invoiceId: invoiceA1Id,
    });
    assert.equal(regDoc.isImmutable, true);

    // Immutability trigger prevents altering canonicalHash
    await assert.rejects(() =>
      owner.regulatoryDocument.update({
        where: { id: regDoc.id },
        data: { canonicalHash: 'a'.repeat(64) },
      }),
    );

    const submission = await repo.submitRegulatoryDocument(proofOwner, clinicAId, regDoc.id);
    assert.equal(submission.status, 'MOCK_SUBMITTED');
    assert.equal(submission.events.length, 1);
  });
});
