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
