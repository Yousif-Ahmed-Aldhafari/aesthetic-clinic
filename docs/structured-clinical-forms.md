# Structured Clinical Forms and Specialty Workspaces

Phase 6 Step 6.5 adds a configurable documentation layer on the shared clinical record. It does not create a second EMR and it does not replace relational allergies, diagnoses, observations, medication histories, prescriptions, aesthetic treatment plans, consents, procedure execution, or photographs.

## Domain model

Migration `20261113000400_structured_clinical_forms` (migration 036) adds four tenant-owned tables:

- `ClinicalFormDefinition` is the stable clinic-owned identity (`stableKey`, localized names, category, specialty, optional general service).
- `ClinicalFormDefinitionVersion` stores one JSON Schema 2020-12 validation contract and one bounded presentation document per version. Versions move `DRAFT -> PUBLISHED -> RETIRED`.
- `ClinicalFormResponse` binds a patient, assigned encounter, exact published version, practitioner membership, specialty, branch, response status, SHA-256 content digest, and finalization evidence.
- `ClinicalFormResponseAmendment` is an append-only correction chain with author, reason, previous digest, corrected data, and new digest.

Published versions remain immutable. A changed template is a new version. Historical responses retain their exact version even after retirement. Finalized response evidence is immutable; amendments do not rewrite `responseData`. SHA-256 supplies application-level tamper evidence and is not described as a certified electronic signature.

## Validation contract

The only supported dialect is `https://json-schema.org/draft/2020-12/schema`, implemented with AJV 8 on the API. Schema validation is authoritative on the server. The browser renderer only improves interaction.

Limits are 64 KiB per validation schema, 32 KiB per presentation document at the database boundary, 256 KiB per response, depth 8, 300 traversed schema nodes, 50 repeating items, 10,000 characters per configured string, and 100 enum values. Root schemas must be closed objects (`additionalProperties: false`). External and local `$ref`, pattern/regular-expression keywords, media decoding keywords, unknown keywords, and executable expressions are rejected. The validator never loads a URL and never evaluates clinic-authored JavaScript.

Supported controlled primitives are short/multiline strings, integer/decimal values, booleans, ISO date/date-time strings, controlled single/multiple selection, nested objects, bounded repeating groups, read-only references, and controlled unit labels. Conditional display is restricted to equality against another response key in the presentation contract; it never controls server authorization or validation.

## Lifecycle

Responses move `DRAFT -> SUBMITTED -> FINALIZED -> AMENDED`. Drafts accept incomplete but structurally valid content. Submission revalidates all required fields. Finalization requires the assigned practitioner, active branch membership, verified specialty qualification, and an approved, unexpired `CLINICAL_ENCOUNTER_DOCUMENT` privilege. Optimistic versions make concurrent publish, save, finalization, and amendment attempts fail closed.

`ENTERED_IN_ERROR` exists in the database lifecycle for a future governed workflow; no endpoint exposes it in this milestone. Hard deletion is unavailable.

## Authorization and isolation

Template administration and confidential response access are separate:

| Capability | Owner/Admin | Doctor with verified specialty privilege | Receptionist | Accountant | Platform admin |
|---|---:|---:|---:|---:|---:|
| List/manage/publish clinic templates | Yes | Read applicable templates only | No | No | No implicit access |
| Read/create/update/finalize/amend responses | No implicit access | Assigned encounter only | No | No | No implicit access |

The API derives clinic, user, membership, selected branch, and permissions from the verified session. Applicability additionally requires active clinic and branch specialty configuration, active branch membership, verified practitioner profile and qualification, approved privilege, and assigned patient encounter. Request identifiers cannot widen access.

All four tables have immutable `clinicId`, same-clinic foreign keys, `ENABLE/FORCE ROW LEVEL SECURITY`, restricted runtime grants, no delete policy, and transaction-local context through `TenantDatabaseService`. Response RLS additionally requires that the active context user owns the author membership. Missing context returns no rows and denies writes. The migration owner has a named maintenance policy; runtime roles are checked for non-superuser/no-BYPASSRLS status.

## Standard templates

The controlled installer supplies synthetic, clinically neutral starting points only for specialties enabled by a clinic:

- adult general medicine consultation;
- basic dermatology skin assessment;
- basic pediatric intake, referencing verified observation IDs rather than inventing measurements or percentiles;
- compatible aesthetic assessment that leaves treatment plans, consent, procedure execution, and photography unchanged.

Answers remain authored form evidence. They are never automatically promoted into a confirmed allergy, diagnosis, prescription, medication record, or observation.

## Arabic UI and terminology

`useTerminology()` maps explicit semantic keys from trusted specialty context. It does not perform raw string replacement. Shared Arabic terms and specific mappings for general medicine, aesthetics, dermatology, pediatrics, and dentistry preserve existing clinic branding and aesthetic language.

The reusable RTL renderer uses controlled React inputs, accessible labels and fieldsets, keyboard-native controls, bounded nested/repeating sections, multi-select controls, Arabic messages, responsive layouts, read-only final views, amendment history, and an unsaved-change warning. Clinical response data is never written to localStorage or sessionStorage. Request scopes cancel or ignore stale clinic, patient, and encounter responses.

## Step 6.4 audit

The document encryption service encrypts on the API using AES-256-GCM. New ciphertext authenticates its tenant-scoped storage key as AAD, while a read-only legacy fallback preserves existing files during key rotation. Authorization precedes decryption. Storage keys and filesystem paths are server-controlled, symlinks are rejected, files use mode 0600, upload signatures and a 25 MiB cap are checked, and failed database/audit transactions remove newly written orphan files. Download responses use no-store, nosniff, sandbox CSP, and an RFC 5987 filename. General audit metadata no longer contains document titles, filenames, clinical text, or patient identifiers.

Limitations remain: files are buffered in API memory; no malware scanner or quarantine service is active; DICOM recognition checks only the preamble and `DICM` marker and does not provide diagnostic-grade validation, image interpretation, or PACS interoperability; coordinated object-store transactions require a future durable outbox/reconciliation worker. Legal holds prevent governed metadata reversal without a reason and there is no document delete API.

Critical diagnostic results remain visible in clinical result lists while acknowledgment is pending. They are not auto-reviewed, and cannot be released to a patient until explicit acknowledgment. Lamssa does not claim continuous clinical monitoring.

General services and diagnostic orders continue through the shared invoice system with idempotency keys, exact minor-unit snapshots, tax/price snapshots, cancelled-order rejection, and issued-invoice immutability. Aesthetic billing remains on the same ledger.

## Privacy, audit, backup, and limits

Clinical form definitions are confidential operational configuration; responses and amendments are `SENSITIVE_PERSONAL`. Audit events record IDs, lifecycle actions, versions, and digests, never response text or patient identifiers in general metadata. Existing administrative exports do not silently include forms. Retention and legal-hold inventory includes the new tables, but automatic clinical deletion remains disabled pending jurisdiction and clinical governance decisions.

PostgreSQL backups cover the four tables. Restore verification checks the migration inventory and FORCE RLS. Template clinical validity, specialty governance, authorship policies beyond assigned encounters, electronic-signature law, retention periods, localization review, and jurisdiction-specific compliance require approved clinical/legal review. Advanced specialty modules remain future work.
