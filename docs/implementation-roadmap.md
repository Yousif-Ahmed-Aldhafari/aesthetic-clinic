# Lamssa implementation roadmap

Updated after Step 1.5, 2026-10-24. The user's current scope
supersedes the original separation of workspace/API/database foundation. All
production use remains gated on authentication, isolation and operational controls.

1. **1.1 — Inspect and establish architecture (completed).**
   Recorded the actual frontend state and risks, extracted existing definitions,
   preserved Arabic RTL behavior and demo storage. Committed as `dbb529c`.

2. **1.2 — Workspace, backend, PostgreSQL and clinic identity (completed).**
   Move the frontend intact to `apps/web`; add `apps/api` using NestJS and a single
   npm workspace lockfile. Validate environment/input, constrain CORS, sanitize API
   errors and expose versioned liveness/readiness plus public branding by slug.
   Add development PostgreSQL Compose, Prisma 7 with its pg adapter, initial
   identity migration, optional idempotent fictional clinic seed and tests.
   Entities: Clinic, ClinicBranding, ClinicDomain, User and ClinicMembership.
   Global platform authority is separate from per-clinic roles. No frontend/API
   data integration, authentication, private clinic routes or medical models yet.
   Acceptance: unchanged frontend/storage, build and HTTP checks, Prisma validation
   and migration artifact. Report live migration/test status separately when the
   environment lacks PostgreSQL/Docker. See [development.md](development.md).

   **1.2.1 — Native PostgreSQL verification (completed).** PostgreSQL 16.15 is
   online locally. Development/test migrations are applied; restricted runtime
   permissions, seed idempotency, independent clinic branding, live constraints,
   API readiness and unchanged Arabic frontend flows were verified. Separate
   environment credentials remain private. See the verification record in
   [development.md](development.md). Authentication/RBAC is the next implementation
   step; current public endpoints do not grant private clinic access.

3. **1.3 — Authentication and role-based access control (implemented).**
   Argon2id, explicit local account provisioning, database-backed hashed session
   verifiers, idle/absolute expiry, revocation/rotation, signed/session-bound CSRF,
   exact origins and persistent login limits. Default-deny global guard checks
   active user/clinic/membership and centralized granular permissions on each
   clinic request. Platform authority has no bypass. Arabic RTL login/selection,
   active branding, expired/denied states and labeled unchanged local demos exist.
   Two-clinic HTTP/database tests cover forged context, lifecycle and CSRF. See
   architecture/development for the matrix, commands and executed evidence.
   Recovery/invitations, production identity administration, MFA, scheduled session
   retention and audited support access remain separately scoped follow-up work.

4. **1.4 — Mandatory tenant access and RLS (implemented).**
   Added verified process-local principals, selected-clinic/permission checks in
   interactive tenant transactions, local context settings, FORCE RLS on Clinic,
   ClinicBranding, ClinicDomain and ClinicMembership, immutable ownership and
   restricted runtime grants. Identity/public bootstrap functions have fixed
   projections and hardened ownership/search paths. Maintenance credentials are
   explicit for seed/provisioning; runtime owner misconfiguration fails closed.
   UTC connection configuration fixes the observed adapter expiry mismatch.
   Runtime-role isolation, concurrency, rollback/reuse, auth/public/browser and
   record-preservation checks are recorded in development.md. No patient API yet.

5. **1.5 — Administrative Patient Management (implemented).**
   Added tenant-owned Patient/PatientCounter, clinic-local transactional numbers,
   FORCE RLS, immutable identifiers, restricted runtime grants and explicit status
   changes. Administrative-only DTOs, literal Arabic-normalized prefix search,
   bounded cursor pagination, optimistic versions and safe projections use the
   existing verified tenant boundary. Arabic RTL directory/register/profile/edit
   now persist through the authenticated API; old demos remain separate and intact.
   Runtime database tests and isolated browser journeys cover permissions, CSRF,
   two clinics, concurrency/rollback, stale-response switching and legacy flows.
   No clinical/free-text notes/photos, hard deletion or automatic demo import.
   Change/access audit, durable create idempotency, retention and production
   operational/privacy review remain separate gates before real patient data.

6. **1.6 — Appointments and clinic resources (implemented).**
   Implemented ClinicService, BookableResource, ResourceAvailability, ResourceTimeOff,
   SchedulingState, and Appointment using compound `(clinicId, id)` keys referencing persisted
   active Patients and ClinicMemberships. Enforced doctor and room conflict prevention with
   native PostgreSQL GiST exclusion constraints (`btree_gist` extension), serialized clinic
   transaction locking, and optimistic concurrency versioning. Preserved idempotency keys and
   request hashes. Handled clinic-local time and DST gaps/disambiguation via Temporal. Terminal
   cancellations and no-shows release reservations, while completed and arrived records remain
   immutable. Added full Arabic RTL appointment calendar (day/week/list views), doctor lanes,
   resource settings, and advisory availability. Enforced FORCE RLS across all six tables with
   restricted runtime permissions. Verified through 81 live database tests, 32 unit tests, and
   browser regression. Zero regressions on existing patient management or authentication.

7. **1.7 — Persistent visits and live queues (implemented).**
   Five RLS-protected models, clinic/day transactional numbering and same-clinic FKs.
   Atomic scheduled check-in and idempotent explicit reconciliation of old ARRIVED
   appointments; active walk-ins, duplicate-visit prevention, FIFO call-next with durable
   replay keys and doctor/room partial unique claim indexes across date boundaries.
   Versioned recall/start/complete/absence/cancel/transfer actions synchronize linked
   appointments. Doctor access is limited to the membership-linked resource; receptionist
   service completion and accountant queue access are denied. Arabic reception/doctor
   screens, retained history and opt-in anonymous number-only board use reauthorized SSE
   invalidations plus REST resynchronization. Original local demo remains separate.
   Verification details and current constraints: [development](development.md), [queue](queue.md).

8. **1.8 — Billing and payments — implemented.**
   Seven tenant-owned RLS tables, same-patient visit linkage, clinic-unique transactional
   numbers, exact minor-unit/quantity/discount/tax arithmetic and frozen issued identity
   and line snapshots. Versioned, idempotent manual payments/partial settlement/refunds
   and full erroneous-payment reversals retain an append-only hash-chained audit trail.
   Safe void policy forbids any payment history. Finance RBAC separates owner/accountant,
   reception and clinical/operational roles; SQL policies reinforce those boundaries.
   Arabic directory/editor/payment history, business identity settings, currency-separated
   totals and branded RTL A4 invoice/receipt printing use protected APIs. Legacy invoices
   stay separate. See [billing](billing.md) and actual [verification](development.md).
   Real-market statutory tax/e-invoice rules, credit notes, external gateways/webhooks,
   archival, reconciliation and privileged audit checkpoints remain separate work.

9. **1.9 — Clinic identity administration and white-label delivery.**
   Add authorized clinic settings/branding changes, IANA timezone/currency policy,
   safe logo handling and publishing rules. Extend the selected-clinic branding already shown by Step 1.3 without mixing
   demo data with operational records. Define ownership proof
   before domain verification, subdomain/custom-domain routing and managed TLS.
   Acceptance: themes remain Arabic RTL/accessibility compatible, suspended clinics
   are not published, unique/verified-primary domain constraints hold, and changing
   a host cannot grant private clinic access. Invoice/message branding is applied
   only through each later feature's authorized clinic settings.

10. **1.10 — Testing, security and release gates.**
    Add tests throughout the steps above, not only here: domain unit tests, real
    PostgreSQL constraints, API contracts, role/tenant negative cases, concurrency
    and full Arabic RTL desktop/mobile browser journeys. Add lint/CI and privacy-
    aware observability. Before real data, demonstrate backup restore, restricted
    deployment roles, audit/redaction, retention, incident response and session/CSRF
    controls. Resolve jurisdiction/hosting/consent requirements with stakeholders.
    Clinical records, consent and protected media need their own reviewed scope.

## Migration discipline

- Preserve root development commands and the browser origin used for demo storage.
- Use explicit demo/API modes and never merge local arrays into server records.
- Never reset, clear or auto-import localStorage as part of infrastructure work.
- Apply reviewed migrations; do not reset or force-push an existing database.
- Test with fictional records. Imports later require clinic authorization, validated
  mapping, provenance and rollback planning.
- Document what was actually run, including skipped database tests and deployment
  gates; a successful build does not establish production tenant security.
