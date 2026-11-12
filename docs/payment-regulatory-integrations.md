# Lamssa Payment Gateway, Banking & Regulatory Integration Foundations (Phase 5, Step 5.5)

## 1. Overview & Safety Boundaries

Step 5.5 introduces provider-neutral payment orchestration, verified webhook ingestion, external financial reconciliation, payout evidence tracking, and jurisdiction-aware regulatory e-invoicing foundations for Lamssa.

**Hard safety boundaries:**
- **No live funds or live regulatory filings** are executed in Step 5.5.
- Only `SANDBOX_MOCK` executes deterministic sandbox flows; `MOYASAR`, `CHECKOUT_COM`, `STRIPE`, and `REGIONAL_BANK_GATEWAY` are **disabled-by-default stubs** (`isExecutionSupported = false`).
- **Single source of financial truth**: External payment intents and webhooks never create a parallel ledger. Confirmed `SUCCEEDED` intents transactionally post into `Payment`, update `Invoice.netPaidMinor` / `Invoice.status`, and append to the hash-chained `FinancialAuditEvent` log.
- **No cardholder PAN/CVV storage**: Lamssa never accepts, processes, or stores raw card numbers or CVV codes.

---

## 2. Database Schema, RLS & Immutability

All 15 new tables (`PaymentProviderConfiguration`, `PaymentIntent`, `PaymentProviderEvent`, `PaymentSettlement`, `ExternalRefund`, `ExternalPayout`, `ExternalReconciliationRun`, `ExternalReconciliationFinding`, `ClinicRegulatoryProfile`, `RegulatoryDocument`, `RegulatorySubmission`, `RegulatorySubmissionEvent`, and 3 sequence counters) are clinic-owned (`clinicId`), protected by:
- `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` (`lamssa_security.context_allows("clinicId")`)
- Composite foreign keys (`(clinicId, id)`) preventing cross-tenant references
- `immutable_clinic` triggers preventing `clinicId` reassignment
- Immutability triggers on `PaymentSettlement`, `RegulatorySubmissionEvent`, `RegulatoryDocument` (when `isImmutable = true`), `PaymentIntent` core financial fields, and `PaymentProviderEvent` raw evidence fields.

---

## 3. Encrypted Provider Credentials

`IntegrationCryptoService` (`apps/api/src/integrations/integration-crypto.service.ts`) derives a 256-bit key using HKDF-SHA256 from `INTEGRATION_SECRETS_ENCRYPTION_KEY` (with optional `INTEGRATION_SECRETS_ENCRYPTION_KEY_PREVIOUS` for zero-downtime key rotation) and encrypts provider API keys and webhook secrets using AES-256-GCM (`v1:<ivHex>:<tagHex>:<ciphertextBase64>`).

API responses and audit logs return only `hasApiKey`, `hasWebhookSecret`, and a truncated `secretFingerprint` — never plaintext or ciphertext secrets.

---

## 4. PaymentIntent Lifecycle & Webhook Security

### State Machine
`CREATED` → `REQUIRES_ACTION` / `PROCESSING` → `SUCCEEDED` | `FAILED` | `CANCELLED` (terminal). Out-of-order regressions (e.g., `SUCCEEDED` → `PROCESSING`) are safely recorded as `IGNORED_DUPLICATE`.

### Verified Webhook Boundary (`POST /api/v1/webhooks/payments/:providerCode`)
1. `lamssa_security.resolve_payment_webhook_target(providerCode, providerIntentId)` (`SECURITY DEFINER`, `SET search_path = pg_catalog, pg_temp`) resolves the target `(clinicId, paymentIntentId, providerConfigId, encryptedWebhookSecret)` only for enabled providers and active clinics.
2. `verifyHmacSha256WebhookSignature` checks `x-lamssa-signature` (`sha256=<hex>` over `${timestamp}.${rawBody}`) using `timingSafeEqual` and enforces a 300-second replay window on `x-lamssa-timestamp`.
3. `TenantDatabaseService.withWebhookContext(clinicId, paymentIntentId, ...)` binds `lamssa.clinic_id` and `lamssa.webhook_intent_id` transaction-locally, verified by `lamssa_security.context_allows`.
4. A `SELECT ... FOR UPDATE` row lock on `PaymentIntent` serializes concurrent webhook deliveries.
5. Amount or currency mismatches are quarantined as `DEAD_LETTER` without posting any `Payment`.

---

## 5. External Refunds, Payouts & Reconciliation

- **External Refunds**: Require an `APPROVED` `RefundRequest`, `@RequireStepUp(15)`, and `integrations.refunds.execute`. Execution creates a `PaymentReversal`, updates `Invoice.netPaidMinor`, settles the `RefundRequest`, and appends a `FinancialAuditEvent`.
- **External Payouts**: Linked to `PractitionerCommissionSettlement`. Approval enforces **segregation of duties** (`approvedByMembershipId !== preparedByMembershipId`) and `@RequireStepUp(15)`. Live automatic disbursement is disabled.
- **External Reconciliation**: Read-only comparison across `INTERNAL_LEDGER`, `PAYMENT_PROVIDER`, and `BANK_STATEMENT`, producing typed findings (`PROVIDER_PAYMENT_MISSING`, `INTERNAL_PAYMENT_MISSING`, `AMOUNT_MISMATCH`, `CURRENCY_MISMATCH`, `DUPLICATE_PROVIDER_EVENT`, `REFUND_STATUS_MISMATCH`, `PAYOUT_UNVERIFIED`, `SETTLEMENT_FEE_VARIANCE`) without mutating ledger balances.

---

## 6. Regulatory Integration Foundations (ZATCA / Tax)

`ClinicRegulatoryProfile` and `RegulatoryDocument` / `RegulatorySubmission` / `RegulatorySubmissionEvent` provide jurisdiction-aware canonical payload generation (`SA_ZATCA`, `AE_FTA`, `GENERIC_TAX_INVOICE`) with SHA-256 canonical hashing (`isImmutable = true`).

- In `SANDBOX` mode, `submitRegulatoryDocument` records `MOCK_SUBMITTED` with an explicit disclaimer that **no live ZATCA Fatoora Phase 2 clearance or government tax filing was performed**.
- In `LIVE` mode, `submitRegulatoryDocument` records `NOT_CONFIGURED` until a certified Phase 2 transport adapter is enabled.

---

## 7. Step 5.4 Inventory Costing Policy Clarification

The inventory costing engine (`apps/api/src/prisma/costing.repository.ts` and `inventory.repository.ts`) implements **Branch-Scoped Specific-Batch-First FIFO (Hybrid Cost Flow)**:
- When a physical `batchId` is specified in clinical consumption, active cost layers matching that `batchId` within the location's branch are depleted first (`layerDate ASC, id ASC`), falling back to oldest branch layers.
- Physical `InventoryClinicalConsumption.batchId` is never overwritten by accounting attribution.
- Exact minor-unit conservation is enforced on final layer depletion (`newTotalCostMinor = 0n`, absorbing rounding remainders) and on 100% inter-branch transfers.
