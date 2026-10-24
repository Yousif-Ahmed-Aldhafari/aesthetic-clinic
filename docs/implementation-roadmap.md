# Lamssa implementation roadmap

Phase 1 planning baseline, 2026-10-24. Only Step 1.1 is implemented here. All
subsequent steps require separately scoped implementation; no backend, database,
authentication or production security capability is implied by these documents.

Use [architecture.md](architecture.md) for ownership, relationships, roles,
constraints and security decisions. Keep the existing Arabic RTL prototype usable
after every step and use synthetic data throughout development.

1. **1.1 — Inspect and establish architecture (this change).**
   Inspect every source/configuration file and Git state; record actual flows and
   limitations. Extract existing types, demo helpers, common components and forms
   without changing behavior. Add architecture/roadmap documentation and README.
   Acceptance: unchanged storage key/shape and Arabic UI, successful build, no new
   dependencies/backend scaffold, documented verification and remaining risks.

2. **1.2 — Establish the workspace while preserving the frontend.**
   Introduce npm workspaces and move existing web files to `apps/web` as a dedicated
   mechanical change. Retain familiar root `npm run dev`, `build`, and `preview`
   commands; keep one lockfile and review TS/Vite/HTML paths. Establish the location
   and dependency rules for `packages/shared` without publishing demo models as API
   contracts. Record a supported Node version for the eventual API/toolchain.
   Acceptance: clean install in a disposable checkout, root dev/production build
   and preview work, all five sections/forms retain Arabic RTL appearance, and
   same-origin demo data still loads. No automatic storage import or deletion.

3. **1.3 — Backend foundation.**
   Create `apps/api` using NestJS with modular configuration and a proposed
   `/api/v1` REST namespace. Add configuration validation, health/readiness policy,
   structured redacted logs/request IDs, stable errors, global request validation,
   graceful shutdown and API documentation. Add shared transport types/runtime
   validation contracts with a clear build boundary. Select exact supported
   versions/dependencies at implementation time. Keep the browser in demo mode.
   Acceptance: API boots with valid configuration, fails clearly with invalid
   configuration, exposes only an intentionally public non-sensitive health route,
   and has initial CI type/build checks. Domain endpoints stay closed until auth
   and isolation are implemented.

4. **1.4 — PostgreSQL and Prisma data foundation.**
   Design and review Clinic, User, ClinicMembership, Patient and resource models,
   then add operational models alongside their feature slices. Introduce migration
   history, disposable local/test databases, server-only credentials and separate
   least-privileged application/migration roles. Use UUIDs, clinic-owned compound
   foreign keys, scoped uniqueness/indexes, timestamps and version fields. Specify
   UTC instants, clinic business dates, and exact money/currency representation.
   Acceptance: migrations apply to an empty database; a repeatable synthetic seed
   creates two unrelated clinics; constraints reject cross-clinic links; migration
   review and recovery procedures are documented. Never seed from localStorage.

5. **1.5 — Authentication and RBAC.**
   Implement login/logout, session expiry/rotation/revocation, password hashing,
   rate limits and recovery flow. Use the chosen secure cookie strategy with CSRF
   protection and explicit origin policy. Add active clinic memberships and server
   permission checks for clinic admin, receptionist, clinician and accountant;
   platform administration is a separate permission boundary. Map API error codes
   to Arabic UI messages. Store no session secrets in localStorage.
   Acceptance: unauthenticated requests fail, role-denied actions fail, revoked
   sessions/memberships stop working, cookies/CSRF behavior is tested, and hiding a
   button is never the authorization mechanism.

6. **1.6 — Enforce clinic isolation before patient API rollout.**
   Resolve an authorized clinic selection into immutable request context. Require
   it in every tenant repository method and transaction; prevent `clinicId` mass
   assignment and unscoped ID access, including nested/bulk writes, search/counts,
   exports and background work. Add PostgreSQL RLS with transaction-local context,
   tested application-role permissions and a distinct migration role. Scope caches,
   events, storage and audit records as those capabilities appear.
   Acceptance: two-clinic integration tests cover read/create/update/delete,
   relationship injection, swapped clinic selectors, guessed valid IDs, missing
   context and pooled-connection reuse. A user who belongs to both clinics gets
   only the selected clinic's data; a suspended membership is rejected. No real
   clinic pilot proceeds before this gate.

7. **1.7 — Patient management vertical slice.**
   Build clinic-scoped create/list/detail/update, bounded search/pagination and
   chart-number allocation. Validate names/phones/administrative note lengths;
   normalize searchable values while preserving original Arabic names and input.
   Do not assume shared family phone numbers identify one patient. Introduce the
   web transport boundary, loading/error/empty states and explicit demo/API mode.
   Audit sensitive reads/changes and return only permitted fields.
   Acceptance: current patient creation/search remains usable in Arabic RTL,
   cross-clinic tests pass, browser and server validation agree, and demo records
   are never uploaded automatically. Defer medical notes and images.

8. **1.8 — Appointment and resource management.**
   Add clinic services, clinician profiles, rooms and availability. Replace free
   text relationships with authorized resource IDs and preserve historical display
   snapshots where required. Support booking/rescheduling/cancellation with
   duration, `startsAt`/`endsAt`, valid transitions and optimistic version checks.
   Choose database interval exclusion or resource locks for overlap prevention.
   Acceptance: simultaneous conflicting bookings cannot both succeed; clinician
   and room conflicts, clinic timezone/day boundaries, cancelled bookings and
   Arabic validation errors are covered. The old demo flow still works in demo mode.

9. **1.9 — Visit, check-in and queue consistency.**
   Implement atomic appointment check-in/visit creation and one queue entry per
   visit. Allocate tickets via a per-clinic/lane/business-date counter. Implement
   lane-locked call-next and atomic visit completion with conditional status/version
   changes, partial active-entry uniqueness and idempotent retries. Define carry-over
   policy and authorize every queue action; start with one lane/room and polling.
   Acceptance: concurrent duplicate check-ins, call-next requests and retries cause
   no duplicate tickets, lost transitions or two active patients in one room;
   finishing also updates the appointment. Include midnight/carry-over, empty
   queues, stale clients and tenant isolation in integration tests. Add multiple
   rooms/clinician occupancy only with explicit resource rules.

10. **1.10 — Billing and payments.**
    Add invoice lines, immutable issued numbers unique per clinic, currency and
    exact totals. Replace `paid` mutation with auditable payments, partial payment
    rules and reversal entries; define draft/issued/void and payment transitions.
    Allocate invoice numbers transactionally, scope idempotency keys, restrict
    financial permissions and preserve issued line snapshots. Configure taxes,
    discounts and receipt requirements only after the operating market is defined.
    Acceptance: totals and balances are server-derived, concurrent/retried payments
    do not double-collect, searches never change invoice identity, cross-clinic
    references fail, and Arabic amount/receipt formatting matches clinic settings.

11. **1.11 — Testing, security and release gates.**
    Build tests into each preceding step rather than postponing them here. Add
    domain unit tests, disposable PostgreSQL integration tests, API contract tests,
    two-clinic authorization tests, concurrency tests and browser coverage of the
    complete patient → appointment → arrival → queue → invoice/payment journey.
    Introduce appropriate lint/type/build/CI checks, Arabic RTL desktop/mobile and
    accessibility checks, privacy-aware observability and dependency review.
    Before any real data: demonstrate backup restore, least-privilege deployment,
    redaction and sensitive-access audit, session/CSRF protection, retention and
    incident handling. Resolve hosting jurisdiction, consent and medical-record
    requirements with stakeholders; do not infer compliance from passing tests.
    Acceptance: all gates are evidenced in a release checklist using synthetic
    data; failures block clinic onboarding. Clinical notes/photos/consents require
    their own reviewed design before implementation.

## Migration discipline

- Deliver one verified vertical slice at a time; avoid simultaneous rewrites of
  screens, persistence and business rules.
- Preserve root development commands and Arabic RTL presentation during moves.
- Use explicit demo/API modes; never combine browser demo arrays and server records
  into one operational state. Keep old demo data readable at the same origin.
- Importing any external dataset later requires explicit clinic authorization,
  validated mapping, provenance and rollback planning. No automatic localStorage
  import, reset, clearing or deletion is part of this roadmap execution.
- Record unresolved decisions before their implementation gate: operational region,
  timezone/currency, membership policy, authentication/session details, appointment
  durations, queue day rollover, invoice issuance rules and retention periods.
