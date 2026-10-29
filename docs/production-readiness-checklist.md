# Production-readiness checklist

Every item needs dated evidence and an accountable reviewer. Passing software tests is
not legal, clinical or regulatory certification.

## Release evidence

- [ ] Approved release commit; clean staged-file secret and patient-data scan.
- [ ] Install, boundaries, Prisma validate/generate, unit, DB, browser and build pass.
- [ ] Images build from pinned bases; vulnerability/license report reviewed.
- [ ] Compose rendering has no public PostgreSQL port or embedded secrets.
- [ ] Image digests, migration list and rollback image recorded.

## Security and tenancy

- [ ] Production fails closed without secrets, hosts, asset path or proxy trust.
- [ ] Runtime/migration DB roles are distinct; runtime is non-owner/NOBYPASSRLS.
- [ ] Clinic A/B isolation tests pass under actual runtime credentials.
- [ ] Clinic owners/admins cannot access platform metrics, diagnostics or alerts.
- [ ] Metrics is denied publicly and reachable only from private monitoring.
- [ ] TLS verifies Secure/HttpOnly/SameSite cookies, CSRF, CORS, CSP, HSTS and hosts.
- [ ] MFA, step-up, revocation and privilege-change session invalidation pass.

## Recovery and operations

- [ ] Encrypted DB and asset backups are paired and copied off-site immutably.
- [ ] Genuine DB and asset restoration into new isolated targets passes together.
- [ ] Restored RLS, audit chains, invoice snapshots and branding assets verified.
- [ ] RPO/RTO, retention, key rotation and restore owners approved.
- [ ] Staging contains fictional data and separate secrets/DNS/storage only.
- [ ] Restart, graceful shutdown, DB outage/readiness and capacity tests pass.
- [ ] Alerts, on-call contacts, runbooks and maintenance window approved.
- [ ] Custom domains are verified separately from reviewed routing/TLS activation.
- [ ] Provider, cost ceiling, residency, subprocessors and legal/clinical scope approved.
- [ ] Owner approval recorded before production migration and public traffic cutover.

## Phase 2 final verification evidence — 2026-10-29

The following items have local evidence on `phase/2-security-reliability`:

- [x] Boundaries, Prisma validation/generation, build, 86 unit tests, 199 database tests
  and 34 browser journeys passed; one native restore test is explicitly skipped for
  NOCREATEDB. Independent Docker restoration passed separately.
- [x] Compose rendered without a public PostgreSQL port or embedded repository secret;
  production-mode images, non-root application users and read-only roots were inspected.
- [x] Production configuration failed closed in automated tests; runtime and migration
  roles remained distinct and FORCE RLS isolation passed under runtime credentials.
- [x] Clinic roles were denied platform telemetry, public proxy telemetry routes returned
  404, and the dedicated monitoring credential remained API-only.
- [x] Local TLS verified cookies, CSRF, CORS, CSP, HSTS, hostname rejection and proxy
  routing with fictional data.
- [x] Isolated staging restart, graceful shutdown, database-outage readiness and recovery
  transitions passed.
- [x] A paired encrypted database/assets backup restored into independent database and
  asset targets; migrations, 32 FORCE-RLS tables, audit chain, branding relationship and
  asset hash passed. Wrong keys, corruption and missing assets failed closed.

Still required before merge or launch:

- [x] Identified and patched the Multer advisory via the compatible NestJS Express
  adapter update; final production npm audit reported zero vulnerabilities.
- [ ] Review full container OS vulnerabilities, licenses and supported patch versions.
- [ ] Approve a release commit and image digests after the final secret/artifact scan.
- [ ] Configure immutable off-site database and asset retention plus production key
  custody; approve RPO/RTO and demonstrate provider-level point-in-time recovery.
- [ ] Approve provider, region/residency, subprocessors, production DNS/TLS, external
  monitoring/on-call routes, legal/clinical scope and production cutover.
