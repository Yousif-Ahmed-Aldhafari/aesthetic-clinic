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

- `apps/api/Dockerfile`: pinned Node `24.11.0-bookworm-slim`, separate build/migration/
  runtime stages, production runtime dependencies, non-root user and healthcheck.
- `apps/web/Dockerfile`: Node build plus pinned unprivileged Nginx runtime as UID 101.
- `.dockerignore`: excludes Git, environment files, runtime volumes, backups, tests,
  logs and local builds. Current Vite production output has no source maps.
- `compose.staging.yaml`: PostgreSQL has no published port. Runtime `lamssa_app` is
  distinct from `lamssa_migrator`, remains non-owner/NOBYPASSRLS and FORCE-RLS bound.

```bash
docker build -f apps/api/Dockerfile --target production -t lamssa-api:review .
docker build -f apps/web/Dockerfile --target production -t lamssa-web:review .
docker compose --env-file deploy/staging.env -f compose.staging.yaml config
docker compose --env-file deploy/staging.env -f compose.staging.yaml build
docker compose --env-file deploy/staging.env -f compose.staging.yaml up migrate
docker compose --env-file deploy/staging.env -f compose.staging.yaml up -d api web proxy
```

Copy `deploy/staging.env.example` to ignored `deploy/staging.env`, replace placeholders
with generated values and never commit it. Production should inject secrets through a
secret manager rather than an env file.

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
