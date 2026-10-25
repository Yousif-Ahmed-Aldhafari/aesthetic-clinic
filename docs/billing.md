# Persistent billing — Step 1.8

Implemented on `main` by the owner's explicit request. Step 1.7 is present in
`e291522`; its independently rerun starting baseline was 34 unit tests, 109 database
tests and 18 real-browser checks, all passing. No browser records are imported.
This is a production-oriented foundation, not production or tax-compliance certification.

## Stored records and relationships

| Tenant-owned table | Purpose and invariants |
| --- | --- |
| Invoice | Same-clinic patient; optional visit must also belong to that patient. Currency/scale fixed when the draft is created. Nullable number until issuance, unique `(clinicId, number)`. Version, totals and net paid in BIGINT minor units. Draft request UUID/hash, issuance/void retry keys. Frozen recipient and issuer identity at issuance. |
| InvoiceLine | 1–50 ordered service-name/optional administrative-description snapshots, quantity in thousandths, unit price, fixed discount, tax rate and exact derived totals. No clinical information or live-price dependency. Draft lines are explicitly replaced; issued lines cannot be inserted, updated or deleted by runtime. |
| Payment | Immutable manually recorded CASH, BANK_TRANSFER or CARD_MANUAL receipt, actual invoice currency/scale, amount, timestamp and clinic-unique UUID/hash for retries. One payment belongs to exactly one invoice, so no allocation table is needed. No PAN, CVV, account number, card token or free-form bank reference. |
| PaymentReversal | Immutable full erroneous-payment REVERSAL or partial/full REFUND; same-clinic payment **and same invoice**, amount/currency/scale, enumerated administrative reason and idempotency UUID/hash. |
| FinancialAuditEvent | Ordered clinic sequence, verified membership actor, invoice/version or profile event, bounded canonical payload, previous hash, SHA-256 event hash and timestamp. Append-only at runtime. |
| ClinicInvoiceCounter | One row per clinic, last issued number and revision. Native upsert locks it before every financial write, serializing numbering, balance changes and audit append order. |
| ClinicBillingProfile | Optional business address, registration number and tax identifier; versioned, owner/accountant maintained. Existing Clinic legal/display names and branding supply the rest of the issuer snapshot. |

All foreign keys use clinic-scoped composite identities and RESTRICT deletion/update.
The additive unique `(clinicId,id,patientId)` key on Visit makes a mismatched visit
and invoice recipient impossible at the database boundary. An invoice can reference
a completed/cancelled historical visit; attendance never deletes or alters finance.
Active patients are required for new drafts. Existing drafts/historical invoices stay
accessible after patient deactivation; issuance can settle prior administrative services.

Numbers are `INV-000001`, growing to ten digits, scoped to a clinic without a yearly
reset. Drafts consume no number. A failed issue transaction consumes no number;
issued numbers are never reused, including voids. UUID receipt references are
`PAY-<full-payment-UUID>`; they are not derived from row counts or searches.

## Exact currency and rounding policy

Amounts in PostgreSQL are BIGINT minor units; API amounts/totals are **decimal strings**,
never JavaScript floating-point monetary values. The server receives positive/zero
major-unit strings such as `"100.50"`, validates precision and converts with BigInt.
Frontend previews use the same integer formulas; display splits integer/fractional
parts and formats the integer as BigInt, preserving all digits.

Supported scales are explicit: JPY = 0; YER/SAR/AED/USD/EUR/GBP/QAR/EGP = 2;
KWD/BHD/OMR/JOD/TND = 3. Unsupported codes and excess fractional digits fail closed.
Each invoice and payment retains its actual currency and scale. No currency conversion,
cross-currency settlement or sums across currencies occur. Currency changes on Clinic
do not convert existing drafts/invoices. Adding a currency requires updating the
reviewed money policy, SQL check constraint, tests and operational documentation.

Quantities use up to three decimal places, 0.001–1000; tax is an integer 0–10000 basis
points (0–100%). The UI accepts percentage text and converts it to basis points.
For nonnegative integers, round-half-up is `floor((numerator + denominator/2)/denominator)`:

1. `grossMinor = roundHalfUp(unitPriceMinor × quantityMilli, 1000)`.
2. `taxableMinor = grossMinor − fixedLineDiscountMinor` (discount cannot exceed gross).
3. `taxMinor = roundHalfUp(taxableMinor × taxBasisPoints, 10000)`.
4. `lineTotalMinor = taxableMinor + taxMinor`; invoice totals sum the rounded lines.

For example, two units at 100.00, discount 10.00, tax 5% total 199.50; adding a 0.50
line totals exactly 200.00. Each invoice component is capped at 999,999,999,999,999
minor units. There are no negative lines, invoice-wide discounts, inclusive-tax
calculation or automatic tax determination. Operators enter approved rates; operating
market tax rules, statutory numbering, cash rounding, credit notes and mandated
electronic invoices require separate jurisdiction-specific review before real use.

## Lifecycle and transaction rules

`DRAFT → ISSUED → PARTIALLY_PAID → PAID`. Net receipts after refunds determine the
current issued state; a full refund/reversal can return PAID to ISSUED. This does not
rewrite issuance. Drafts are retained; there is no delete endpoint.

Issue takes a snapshot of recipient name/number, legal/display names, optional
address/registration/tax identifier, logo URL, colors and clinic timezone. Financial
lines, totals, currency, number and issuer/recipient snapshot become immutable.
The logo **URL** is frozen; replacing bytes at that URL can change later rendering.
Archival PDF/logo asset pinning and signed document storage remain future work.

Payments require a fresh expected invoice version and an idempotency UUID. The
clinic counter lock serializes concurrent writes before reading the balance. Excess
payments and stale edits return 409. Retries of an identical accepted request return
the existing payment plus the current invoice; the old version does not double-charge.
Changed payload with an existing key returns 409. Scope keys: draft/payment/reversal
are clinic-wide per record kind; issue/void keys belong to one invoice action.

REFUND records money already returned manually, up to the payment's remaining
amount. REVERSAL records a whole erroneous payment only if it has never been refunded.
At most 100 corrections are permitted per payment. Corrections reopen the outstanding
balance and preserve original receipt history; external money movement is not performed.
Only owner/accountant can correct payments. A refund is not a clinical or queue action.

VOID is allowed only for an issued, entirely unpaid invoice with **no payment history**,
even if a previous payment was fully reversed. It requires an enumerated reason and
retains number, snapshots and history. Drafts cannot jump directly to VOID.

Database invoker guards reject snapshot mutation, tenant reassignment and invalid
versions/transitions. Deferred constraint triggers verify line counts/formulas,
invoice totals, net ledger sums, payment currency, valid status and an audit event
for the invoice's final version at commit. Payment/reversal INSERT locks its invoice
independently of the application mutex. There are no runtime financial history deletes.
Summary uses a repeatable-read authorized tenant transaction so all grouped totals
come from one snapshot; it separates currency buckets and excludes draft/void invoices.
`unpaidMinor` is the full total of ISSUED invoices with zero net receipts;
`outstandingMinor` includes remaining balances of partially paid invoices as well.

## Authorization and RLS

| Permission / operation | Owner | Accountant | Receptionist | Clinic admin / doctor |
| --- | --- | --- | --- | --- |
| invoices.read | Yes | Yes | Yes | No |
| invoices.create (draft/edit, minimal recipient/visit lookup) | Yes | Yes | Yes | No |
| invoices.issue | Yes | Yes | Yes | No |
| payments.record | Yes | Yes | Yes | No |
| invoices.manage (void, settings, audit projection) | Yes | Yes | No | No |
| payments.reverse | Yes | Yes | No | No |
| reports.read + invoices.read (financial summary) | Yes | Yes | No | No |

No platform-admin bypass. Accountants receive only ID/name/number from billing
recipient lookup and ID/check-in instant from visit lookup, not general patient,
appointment or queue API access. No contact details or clinical records are returned.
Clinic admins retain their previous operational permissions and have no implied finance role.

Every private operation passes AccessGuard, cookie session/CSRF checks, fresh verified
membership and `TenantDatabaseService.withClinicContext`. It sets transaction-local
context, never session-global settings. No feature receives raw SQL or unrestricted
Prisma. Browser clinicId, UUIDs, hostnames and role headers prove nothing.

All seven tables use ENABLE/FORCE RLS with explicit command policies and maintenance
owner policy. `finance_allows(uuid,boolean)` is a fixed-path **SECURITY INVOKER** helper
on top of existing context validation and active membership: owner/accountant or
receptionist; restricted profile/reversal writes and Invoice VOID transitions require owner/accountant. Audit INSERT also binds its actor to the context membership. Doctor and
clinic-admin sessions see no finance rows even under actual runtime SQL credentials.
There is no new SECURITY DEFINER function or public financial endpoint.

Runtime grants: Invoice/counter/profile SELECT/INSERT/UPDATE; lines SELECT/INSERT/DELETE
(guarded draft replacement only); payment/reversal/audit SELECT/INSERT only. UPDATE/DELETE
on history and ownership/policy changes remain denied. `finance_guard` and
`finance_consistency` are fixed-path invoker triggers with PUBLIC execution revoked.
SQL finance role rules intentionally mirror application RBAC: review both when changing roles.
The existing architecture checker remains part of builds/test compilation.

## API contracts

All routes are `/api/v1/clinics/:clinicId/billing`, cookie authenticated, selected-clinic
scoped; all POST/PATCH routes require Origin and CSRF. UUID/body/query whitelist is strict.
Money is string input; output minor-unit amounts are strings. Foreign and missing IDs
produce the same generic 404; safe financial conflicts use Arabic messages and 409.

| Method / path | Permission / behavior |
| --- | --- |
| GET /invoices | invoices.read; pageSize 1–50 (20 default), cursor, q ≤60, status; descending createdAt/id |
| GET /invoices/:invoiceId | invoices.read; allowlisted invoice and ≤50 lines |
| POST /invoices | invoices.create; patientId, optional visitId, requestKey, lines |
| PATCH /invoices/:invoiceId | invoices.create; expectedVersion, replacement lines; drafts only |
| POST /invoices/:invoiceId/issue | invoices.issue; expectedVersion, requestKey |
| POST /invoices/:invoiceId/void | invoices.manage; expectedVersion, requestKey, reason |
| GET /invoices/:invoiceId/payments | invoices.read; bounded cursor page; ≤100 corrections per payment |
| POST /invoices/:invoiceId/payments | payments.record; expectedVersion, requestKey, amount, method |
| POST /invoices/:invoiceId/payments/:paymentId/reversals | payments.reverse; expectedVersion, requestKey, amount, kind, reason |
| GET /invoices/:invoiceId/audit | invoices.manage; bounded sequence page; safe action/hash/timestamp projection |
| GET /summary | invoices.read + reports.read; all-time currency-separated aggregate |
| GET /profile | invoices.read; current legal identity, currency/scale/timezone and billing profile |
| PATCH /profile | invoices.manage; expectedVersion (1 for first save), optional business fields |
| GET /patients | invoices.create; bounded name/number search with minimal active recipient fields |
| GET /visits?patientId=... | invoices.create; bounded same-patient historical visit identifiers |

Names are NFC-normalized on entry; invoice search matches the stored snapshot spelling
(case-insensitive literal substring) or number prefix. Recipient search uses the existing
Arabic administrative search normalization; saved names/snapshots are never rewritten.
Line fields: serviceName ≤120, description ≤240, quantity/price/discount decimal strings,
taxBasisPoints integer. IDs, totals, currency, status, timestamps and number are not writable.

## Audit integrity and operational limits

Each supported financial transaction appends a membership-attributed event. Payload
version 1 is UTF-8 JSON with sorted object keys, no whitespace, BigInt represented as
strings and an ISO timestamp. `eventHash = SHA256(previousHash + "\n" + payload)`;
first previousHash is 64 zeros. Event payload includes ID, clinic, invoice, actor,
sequence, action, time, invoice version and bounded financial details/snapshot hashes.
SQL verifies the chain link, hash and matching identity fields on insertion.

Application/runtime cannot update/delete old ledger/audit rows. This detects edits
when verifying persisted chains and prevents silent changes through supported APIs.
It is **not** a cryptographic guarantee against a compromised owner/superuser, runtime
SQL compromise able to append fabricated actions, or full-chain rewrite by privileged
maintenance. There is no external signed checkpoint, WORM archive, full accounting
general ledger, dual approval, reconciliation or production retention policy yet.
Owner credentials remain offline maintenance/test-only, never API runtime credentials.

## Arabic UI and extension rules

The existing invoices navigation now opens the API directory, status/name/number
filters, paginated records, multi-line draft editor, issue review, payment history,
manual payment/refund/void forms and business settings. Authorized owners/accountants
see all-time collected, fully unpaid and outstanding totals by currency. Issued invoice
and receipt layouts are Arabic RTL, responsive, branded from the frozen identity and
printable to A4/PDF. Drafts have no official printed invoice number.

RequestScope gates cover lists, details, history, settings and writes. Switching clinic
unmounts the workspace, aborts requests and ignores late results even if abort is ignored.
No API financial/patient/session data is written to localStorage/sessionStorage.
Ambiguous financial requests retain their request UUID and freeze the submitted form;
retry sends the same body. The user is prompted to review history before a new action.
Legacy invoices remain behind “الفواتير التجريبية القديمة”, unchanged and never imported.

Future gateway/webhook handlers must use this tenant boundary and durable idempotency,
not directly mutate paid flags or issued lines. Review money policy, same-clinic FKs,
append-only grants, audit events, RLS and runtime-credential concurrency tests with each
new financial model. Queue completion/cancellation must remain financially independent.

Design references: [PostgreSQL exact numeric/integer types](https://www.postgresql.org/docs/16/datatype-numeric.html),
[PostgreSQL row locking](https://www.postgresql.org/docs/16/explicit-locking.html),
[Prisma 7 BigInt and JSON serialization](https://www.prisma.io/docs/orm/v7/prisma-client/special-fields-and-types).
