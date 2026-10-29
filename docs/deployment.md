# Deployment architecture and operations

This Phase 2 Step 2.5 design is repeatable production-oriented configuration, not
evidence that Lamssa has been deployed or is legally ready to process clinical data.

## Topology

```text
Internet -> Caddy (TLS, host allowlist, headers, limits)
              |-> unprivileged Nginx web container (React build)
              |-> non-root NestJS API container
                        |-> PostgreSQL 16 private network (no public port)
                        |-> persistent private clinic-asset volume
Private monitoring network -> API /metrics with a dedicated machine credential
Backup operator -> encrypted DB + encrypted asset archives -> immutable off-site copy
```

For a small launch, use one 2 vCPU/4 GiB application VM, a small managed PostgreSQL
16 instance on a private network, and private S3-compatible object storage. Staging
must use separate accounts, database, secrets, volumes and DNS. Local development keeps
native PostgreSQL and Vite; `compose.yaml` remains development-only.

Entry costs vary by provider, region and support level. A practical initial planning
range is roughly USD 80–300/month for the VM, managed database, modest object storage,
DNS, backup copies and monitoring. This is a budget assumption rather than a quote:
for comparison, current published entry prices include a USD 24/month 2-vCPU/4-GiB
DigitalOcean VM and a USD 15.15/month basic managed database, while AWS Lightsail lists
USD 24/month for a 2-vCPU/4-GiB VM, USD 30/month for its first encrypted managed database
tier and USD 1–5/month object-storage bundles. Review the provider's live
[DigitalOcean VM](https://www.digitalocean.com/pricing/droplets),
[DigitalOcean database](https://www.digitalocean.com/pricing/managed-databases) and
[AWS Lightsail](https://aws.amazon.com/lightsail/pricing/) pricing before approval;
region, redundancy, egress, support, observability and off-site retention can raise the
total materially. Approve data residency before purchase. Scale by moving database and
assets to managed services, then add stateless web/API replicas. In-memory metrics,
alerts, throttles and SSE fan-out need shared external backends before multiple API
replicas.

## Images, networks and staging

- `apps/api/Dockerfile`: pinned Node `24.21.0-bookworm-slim`, separate build/migration/
  runtime stages, production runtime dependencies, non-root user and healthcheck.
- `apps/web/Dockerfile`: Node build plus pinned unprivileged Nginx runtime as UID 101.
- `.dockerignore`: excludes Git, environment files, runtime volumes, backups, tests,
  logs and local builds. Current Vite production output has no source maps.
- `compose.staging.yaml`: PostgreSQL has no published port. Runtime `lamssa_app` is
  distinct from `lamssa_migrator`, remains non-owner/NOBYPASSRLS and FORCE-RLS bound.

```bash
docker build -f apps/api/Dockerfile --target production -t lamssa-api:review .
docker build -f apps/web/Dockerfile --target production -t lamssa-web:review .
docker compose --env-file deploy/staging.env -f compose.staging.yaml config --quiet
docker compose --env-file deploy/staging.env -f compose.staging.yaml build
docker compose --env-file deploy/staging.env -f compose.staging.yaml up migrate
docker compose --env-file deploy/staging.env -f compose.staging.yaml up -d api web proxy
```

Copy `deploy/staging.env.example` to ignored `deploy/staging.env`, replace placeholders
with generated values and never commit it. Production should inject secrets through a
secret manager rather than an env file.

The default local hostname is `staging.lamssa.localhost`, served at
`https://staging.lamssa.localhost:8443`; its CORS origin includes that port. Browsers
resolve `.localhost` to loopback. Use the generated staging CA for trusted verification
without changing the system trust store; `npm run test:deployment-runtime` does this
automatically. If changing the hostname, update `PUBLIC_HOST`, explicit API hosts and
the exact HTTPS CORS origin together. The healthcheck's internal `api` host must stay
allowlisted. Do not run bare `compose config` into a shared log: it interpolates secrets;
use `config --quiet` or inspect a privately stored rendered file.

## TLS, hostnames and custom domains

`deploy/caddy/Caddyfile` is the public-ACME template for the explicitly configured
`PUBLIC_HOST`. Staging uses a local CA and loopback-only ports. Caddy terminates TLS,
overwrites forwarded protocol, limits request bodies to 3 MiB, adds HSTS/security headers
and proxies only `/api/v1`. HSTS deliberately
omits `includeSubDomains`/preload because custom clinic domains may have unrelated hosts.
Set `TRUST_PROXY_HOPS=1`; never expose the API directly to an untrusted proxy chain.

The API may accept exactly one-label `*.PLATFORM_BASE_DOMAIN` hosts, but the stock Caddy
template deliberately obtains a certificate only for `PUBLIC_HOST`: wildcard ACME would
require a separately reviewed DNS provider plugin and credentials. Add every activated
platform subdomain or custom domain explicitly to a reviewed Caddy site block and
`API_ALLOWED_HOSTS`; reload only after syntax and certificate checks. DNS TXT ownership
verification does not activate routing, issue a certificate or authorize clinic access.
Host never selects an authenticated tenant.

The public proxy denies `/metrics`, `/health/diagnostics` and `/alerts/active`.
Prometheus reaches metrics on the private monitoring network using `X-Metrics-Key`.
That key grants metrics only. Diagnostics and alerts require an active
`PLATFORM_ADMIN`; clinic owners/admins receive 403.

## Production configuration and release

Startup requires HTTPS CORS origins, strong CSRF/MFA/monitoring secrets, an absolute
asset path, explicit hosts and one trusted proxy hop. `DATABASE_URL` is runtime-only.
Keep `MIGRATION_DATABASE_URL`, database admin credentials and the backup key outside
the API service. Never expose secrets through `VITE_*`, browser storage or image layers.

Release sequence:

1. Freeze a reviewed commit and build images by immutable digest.
2. Pass the production checklist in isolated CI/staging.
3. Create and verify DB and asset backups, then copy both off-site.
4. Run `prisma migrate status`, then the one-shot migration image. Apply only committed
   `prisma migrate deploy` migrations; never reset or schema-push.
5. Apply restricted grants, start services, wait for readiness, then switch traffic.
6. Exercise fictional login/MFA/clinic/patient/scheduling/queue/billing/privacy journeys.

Rollback application traffic to the prior image digest. Database rollback is a
forward-fix by default. For an incompatible migration, stop writes and restore the
pre-release database and matching asset archive into new targets, verify them, then
switch endpoints. Never improvise an overwrite of the active database.

## Backup, recovery and key custody

Database and assets are separate recovery units:

```bash
BACKUP_ENCRYPTION_KEY="$SECRET" npm run db:backup
BACKUP_ENCRYPTION_KEY="$SECRET" npm run assets:backup
BACKUP_ENCRYPTION_KEY="$SECRET" npm run db:backup:drill
BACKUP_ENCRYPTION_KEY="$SECRET" npm run assets:restore -- --file=/secure/assets.meta.json
```

Asset archives use AES-256-GCM, per-file SHA-256, UUID storage-key validation, symlink
rejection and restore only to a new directory for atomic volume switching. The local
adapter has a 1 GiB in-memory bundle limit; move to streaming/versioned object storage
before reaching it. Keep DB/assets under one recovery manifest and test together.
Off-site transfer, WORM retention and KMS custody remain manual infrastructure gates.

Rotate CSRF/session, MFA, monitoring and backup keys independently. MFA supports a
previous key during rotation. Retain prior backup keys offline until all corresponding
archives expire. A production wrapper should read mounted secret files and expose them
only to the backup process.

## Manual approval gates

Before launch, explicitly approve provider, region/data residency, domain/certificate
activation, privacy/retention terms, backup custodians, incident contacts, alert routes,
RPO/RTO, first production migration and traffic cutover. A jurisdiction-specific legal
and clinical security assessment remains required. Never copy production data to dev.

## Isolated staging and recovery evidence (2026-10-29)

Phase 2 final verification ran on `phase/2-security-reliability`, using Docker Engine
29.9.2 and Compose 5.6.1 on Linux Mint 22.3. Staging used generated synthetic secrets,
fictional records, separate named volumes and a local Caddy CA. Development/test
PostgreSQL and the existing clinic-asset directory were never mounted into staging.
The API has an explicit runtime environment allowlist: database administrator,
migration and backup secrets are absent from its actual container environment.

Final commands and results:

| Check | Actual result |
|---|---|
| `npm run check:boundaries` | Passed |
| `npm run db:validate` / `npm run db:generate` | Passed, Prisma 7.10.1 |
| `npm run build` | Both applications passed |
| `npm test` | 86 passed (16 web + 70 API), zero failed |
| `npm run test:db` | 200 total: 199 passed, zero failed, one explicit skip |
| `npm run test:browser` | 34 journeys passed, zero runtime exceptions |
| `npm audit --omit=dev --audit-level=high` | Zero production dependency vulnerabilities |
| `npm run check:deployment` | Passed |
| `docker compose ... config --quiet` and `build api web migrate` | Passed |
| Actual Caddy production/staging `validate`, Nginx `-t` | Passed |
| `npm run test:deployment-runtime` | 30 read-only checks passed against actual staging |
| Temporary HTTPS business verifier | 35 checks passed |
| Fresh-profile Chrome against staging HTTPS | 10 checks passed, no runtime/CSP violations |
| Recovered application verifier | 16 checks passed |
| `git diff --check` | Passed |

The native restore test is explicitly skipped because its restricted migrator lacks
`CREATEDB`; no privilege was added. A genuine database/assets restoration was separately
completed in independent Docker recovery targets as described below. Browser regression
fixtures used the dedicated native test database; the additional HTTPS/Chrome checks
used only the isolated container database and a new browser profile.

The two initial high-severity npm findings were the NestJS Express adapter and its
Multer dependency. The compatible adapter update to 12.3.2 installs Multer 2.5.0,
addressing [GHSA-q7qp-rjg7-q26m](https://github.com/expressjs/multer/security/advisories/GHSA-q7qp-rjg7-q26m).
NestJS core/common remain 12.2.0. Container installs omit the network advisory query;
the separate CI audit step fails validation on a high-severity production advisory.
A full container OS vulnerability and license review remains a production release gate.

### Actual staging controls

API and web run as UID 1000 and UID 101 respectively with read-only root filesystems.
Their healthchecks pass. Runtime artifacts exclude environment files, tests and local
backup/asset directories. API and PostgreSQL publish no ports. Only proxy
`127.0.0.1:8080` and `127.0.0.1:8443` are published; data/application/monitoring networks
are internal. Nginx has dedicated writable tmpfs paths, including `/tmp`.

All 15 migrations applied to the fresh staging database, and a repeat run found no
pending migrations. Restricted runtime grants completed. Trusted local TLS served the
React app, liveness and readiness. Frontend HTML receives CSP, HSTS, frame, MIME,
referrer and permissions headers. The current CSP permits the existing Google Fonts
origins and HTTPS legacy logos; self-hosting fonts remains a privacy/deployment choice.
Caddy requires TLS SNI and HTTP Host to match using
[`strict_sni_host`](https://caddyserver.com/docs/caddyfile/options#strict_sni_host).
Unknown SNI is rejected; forged Host returns 421. HTTP redirects preserve the path and
use staging's local HTTPS port. These checks did not install a CA into the user's system.

The ordered Caddy route block returns 404 for public metrics, diagnostics and active
alerts, even with the monitoring key. Allowed CORS grants exactly the configured
origin; unlisted origins receive no CORS authorization. Production authentication
uses host-only Secure/HttpOnly/SameSite cookies. CSRF rejection, MFA enrollment/login,
clinic switching, patient registration, booking, arrival, queue service, actual logo
upload/publication, invoice issuance/payment and privacy requests passed over HTTPS.

A staging-only database outage left liveness at 200 and changed readiness to 503;
readiness recovered to 200 after restart. The API stopped gracefully in 395 ms during
the exercise and returned healthy after restart. These timings are local observations,
not a production capacity or availability guarantee.

Final local image IDs (no registry push was performed):

| Image | SHA-256 |
|---|---|
| API | `151cf100735e8a0e1f0581b59a0aac3f1eae5f193a4cd9d6906efb8b77bcdff2` |
| Web | `3be7cf89c7df12ae31f2a8fbe18456f136701ede8785e9390d5795a7f9d906af` |
| Migration | `dee9f7ca3edf69361d95eac111ed0e2e17687ab26ae8042d663c10b97dc17af3` |
| PostgreSQL 16.10 Alpine | `029660641a0cfc575b14f336ba448fb8a75fd595d42e1fa316b9fb4378742297` |
| Caddy 2.10.2 Alpine | `4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d` |

A release must review supported patch versions and record approved registry digests.
These local image IDs are verification evidence, not production release coordinates.

### Paired recovery result and procedure

Writes were frozen by stopping only the staging API. Its asset volume was copied to a
private temporary directory, then the database and asset backups were created under
one paused-write interval. Source access used PostgreSQL's private container address,
without publishing its port. Backups captured 39 tables, 122 rows, 32 FORCE-RLS tables,
151 policies and one published clinic logo. All backup files were mode 0600. The pair
took 525 ms to create.

A fresh independent PostgreSQL container and a new asset directory restored the pair
in 1.243 seconds (database restore and verification: 1.195 seconds). Recovery-point age
rounded to zero minutes because restoration immediately followed the paused snapshot.
This does not establish zero production RPO or point-in-time recovery. Provisioning,
provider startup and production traffic cutover are outside that measured interval.

The restored runtime role successfully connected as non-owner/NOSUPERUSER/NOBYPASSRLS,
with no tenant context, and returned zero Patient rows. Exact migration count and RLS
table coverage matched; restored financial audit hashes, same-clinic branding relation
and logo SHA-256 matched. Recovered MFA, clinic switching/isolation, patients,
appointments, visits/queue, invoices/balances, privacy, audit and public assets passed
16 application checks. Wrong DB/asset keys, corrupted ciphertext, a missing asset and
an unapproved attempt to overwrite the existing recovery target were rejected.

For another recovery exercise:

1. Pause application writers and asset replacement/cleanup; capture both encrypted
   archives and their matching metadata. Protect the sidecar metadata alongside the
   ciphertext; inventories are not independently signed.
2. Provision new recovery targets and roles independently. Restore never grants or
   changes role privileges. Grant the intended restricted runtime role its reviewed
   access before verification; connection denial is a blocker, not proof of RLS.
3. Supply `RESTORE_RUNTIME_DATABASE_URL` for the recovery server, and supply maintenance
   credentials securely. Both must address the same PostgreSQL endpoint. For example,
   with the URLs already injected into the operator's environment:

   ```bash
   node --input-type=module -e '
     const { runRestore } = await import("./scripts/restore-database.mjs");
     await runRestore({ file: process.env.RESTORE_BACKUP_FILE,
       targetUrl: process.env.RESTORE_DATABASE_URL });
   '
   npm run assets:restore -- --file=/secure/paired/assets.meta.json \
     --restore=true --target=/new/recovery/assets
   ```

4. Verify every database asset reference against restored file bytes, financial audit
   hashes, RLS and selected application journeys before switching endpoints.
5. Existing database targets require both destructive-overwrite options and separate
   owner approval. A new asset directory is mandatory. Never overwrite native dev/test
   or production data during a drill.

All temporary staging/recovery containers, volumes, credentials and verification
artifacts are removed after the exercise. The temporary Docker socket group override
must then be revoked by the owner. No public deployment, DNS change, real certificate
issuance, purchase, branch change, merge or push is part of this verification.
