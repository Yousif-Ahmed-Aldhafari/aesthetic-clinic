# Lamssa implementation roadmap

Updated after the expanded Step 1.2 request, 2026-10-24. The user's current scope
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

3. **1.3 — Authentication and role-based access control.**
   Implement credential provisioning without default passwords, strong password
   hashing, login/logout, secure sessions, expiry/rotation/revocation, CSRF for
   cookie-authenticated writes, rate limits and recovery/invitation flows. An
   invited/null-password user cannot authenticate. Resolve current active user,
   clinic and membership into immutable request context; check server permissions
   for CLINIC_OWNER, CLINIC_ADMIN, DOCTOR, RECEPTIONIST and ACCOUNTANT. Keep global
   PLATFORM_ADMIN out of clinic authorization unless an explicit, scoped and audited
   support-access policy is approved. Add a protected identity/membership endpoint;
   keep only documented health/branding routes intentionally public.
   Acceptance: unauthenticated/forbidden/expired/revoked sessions are tested over
   HTTP; role changes and suspended clinics/memberships take effect promptly;
   credentials and tokens never enter localStorage, logs or public branding.

4. **1.4 — Enforce clinic isolation before patient API rollout.**
   Require validated tenant context in every private repository and transaction.
   Apply clinicId to detail/list/count/search/export, nested relations and bulk
   writes; prevent tenant reassignment and unscoped object-ID access. Add PostgreSQL
   RLS, transaction-local context and separate request/migration credentials before
   a real clinic pilot. Scope caches, jobs, storage and audit as introduced.
   Acceptance: two-clinic tests cover valid foreign-clinic IDs, users in one/both
   clinics with different roles, missing context, changed clinic selectors/hosts,
   suspended memberships, nested writes and pooled-connection reuse. Ownership
   constraints alone are not authorization. Custom hostnames identify, never grant
   access. No patient endpoint opens before this gate.

5. **1.5 — Clinic identity administration and white-label delivery.**
   Add authorized clinic settings/branding changes, IANA timezone/currency policy,
   safe logo handling and publishing rules. Connect the web to public branding
   without mixing its demo data with operational records. Define ownership proof
   before domain verification, subdomain/custom-domain routing and managed TLS.
   Acceptance: themes remain Arabic RTL/accessibility compatible, suspended clinics
   are not published, unique/verified-primary domain constraints hold, and changing
   a host cannot grant private clinic access. Invoice/message branding is applied
   only through each later feature's authorized clinic settings.

6. **1.6 — Patient management vertical slice.**
   Add clinic-scoped administrative patient create/list/detail/update, chart numbers,
   bounded search/pagination, name/phone/note validation and permitted response
   fields. Preserve Arabic input; shared family phones are not unique identities.
   Introduce explicit demo/API mode and loading/error/empty states, with sensitive
   access/change audit. No automatic import from localStorage.
   Acceptance: clinic isolation and validation tests pass and existing demo flows
   remain usable. Clinical notes/photos are deferred.

7. **1.7 — Appointments and clinic resources.**
   Add services, clinicians, rooms and availability; replace free-text references
   with same-clinic resource IDs. Use duration, UTC instants and clinic timezone;
   support rescheduling/cancellation and conditional status/version changes.
   Prevent interval overlaps with reviewed database exclusion rules or serialized
   resource transactions. Acceptance: simultaneous conflicts cannot both succeed;
   clinician/room conflicts, local day boundaries and Arabic errors are tested.

8. **1.8 — Visits and queue consistency.**
   Implement atomic check-in/visit creation, unique visit queue entries and ticket
   counters per clinic/lane/business-date. Lock the lane for call-next, enforce one
   serving patient across day boundaries, and complete visit/appointment together.
   Add idempotency, bounded retries, version conflicts and a carry-over policy.
   Acceptance: concurrent calls, duplicate check-ins, retries and midnight cases
   produce no duplicate tickets or two patients in one room. Start with one lane
   and polling; multi-room/clinician occupancy needs additional constraints.

9. **1.9 — Billing and payments.**
   Add line snapshots, exact money/currency totals, immutable issued numbers unique
   per clinic, auditable payments/partial settlement/reversals, and financial RBAC.
   Define tax/discount/receipt rules for the operating market before implementation.
   Acceptance: idempotent/concurrent payments cannot double-collect, searches never
   change invoice identity, and cross-clinic references are rejected. Render clinic
   branding from authorized settings; preserve historical issued document snapshots.

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
