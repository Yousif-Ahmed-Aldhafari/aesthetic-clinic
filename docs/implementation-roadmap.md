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

6. **1.6 — Appointments and clinic resources.**
   Use persisted Patient via compound (clinicId,patientId) FK and explicit active-patient booking policy. Add services, clinicians, rooms and availability; replace free-text references
   with same-clinic resource IDs. Use duration, UTC instants and clinic timezone;
   support rescheduling/cancellation and conditional status/version changes.
   Prevent interval overlaps with reviewed database exclusion rules or serialized
   resource transactions. Acceptance: simultaneous conflicts cannot both succeed;
   clinician/room conflicts, local day boundaries and Arabic errors are tested.

7. **1.7 — Visits and queue consistency.**
   Implement atomic check-in/visit creation, unique visit queue entries and ticket
   counters per clinic/lane/business-date. Lock the lane for call-next, enforce one
   serving patient across day boundaries, and complete visit/appointment together.
   Add idempotency, bounded retries, version conflicts and a carry-over policy.
   Acceptance: concurrent calls, duplicate check-ins, retries and midnight cases
   produce no duplicate tickets or two patients in one room. Start with one lane
   and polling; multi-room/clinician occupancy needs additional constraints.

8. **1.8 — Billing and payments.**
   Add line snapshots, exact money/currency totals, immutable issued numbers unique
   per clinic, auditable payments/partial settlement/reversals, and financial RBAC.
   Define tax/discount/receipt rules for the operating market before implementation.
   Acceptance: idempotent/concurrent payments cannot double-collect, searches never
   change invoice identity, and cross-clinic references are rejected. Render clinic
   branding from authorized settings; preserve historical issued document snapshots.

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
