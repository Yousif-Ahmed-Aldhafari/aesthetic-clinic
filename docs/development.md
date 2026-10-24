# Development setup

Step 1.2 adds the API/database identity foundation. Authentication, private clinic
endpoints, RLS and clinical workflows are not implemented. Use fictional data only.

## Requirements and versions

- Node 24 LTS (`>=24.11 <25`), npm 11; `.nvmrc` selects Node 24.
- PostgreSQL 17 (development Compose pins `postgres:17.11-alpine`) or a compatible
  local service. Docker Compose v2 is optional if PostgreSQL is already installed.
- NestJS core/common/platform-express/testing **12.2.0**, config **12.0.1**, CLI
  **12.0.10**; Prisma CLI/client/adapter-pg **7.10.1**; pg **8.23.1**; TS **5.9.3**.
  Versions are pinned and recorded in the single root npm lockfile. The Prisma
  `latest` registry tag pointed to an 8.x release candidate during inspection;
  this project deliberately uses stable 7.10.1 instead.

The API compiles as native ESM and uses decorator metadata. Prisma's
[`prisma-client` generator](https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators)
has an explicit generated output path and `moduleFormat = "esm"`. PostgreSQL
connections use `@prisma/adapter-pg`, with bounded pool/acquisition timeouts per
the [Prisma adapter documentation](https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/databases-connections/connection-pool).
The CLI datasource URL is in `apps/api/prisma.config.ts`, not the schema, using
the [Prisma 7 configuration API](https://www.prisma.io/docs/orm/v7/reference/prisma-config-reference).
Nest configuration uses a custom validator as supported by
[NestJS configuration](https://docs.nestjs.com/techniques/configuration).

## Install and configure

Run all commands below from the repository root unless stated otherwise:

```bash
nvm use
npm ci
cp .env.example .env
```

npm 11's `allowScripts` list in the root manifest permits only the pinned Prisma
and esbuild setup scripts. Review that list when updating those versions.

Edit `.env`. Set a private `POSTGRES_PASSWORD` and matching `DATABASE_URL` using
your own credentials; URL-encode special characters in the URL. The example
password is deliberately empty and the URL contains an unusable placeholder.
Neither value is an application login. Do not commit `.env` or copy server values
into `apps/web`/`VITE_*` configuration.

API configuration and Prisma CLI both load the root `.env`; shell environment
variables take precedence. Vite stays rooted in `apps/web` and does not consume
the root server configuration. `DATABASE_URL` and a comma-separated list of exact
`CORS_ORIGINS` are required to start the API. Wildcards, paths, and trailing slashes
are rejected. Production mode requires HTTPS origins. The defaults bind the API
to `127.0.0.1:3000`; use `API_HOST`/`API_PORT` to change it explicitly.

## Start PostgreSQL

```bash
npm run db:up
docker compose ps
```

Compose requires credentials via environment interpolation. It binds PostgreSQL
to **127.0.0.1 only**, uses a named `postgres_data` volume, and checks readiness
with `pg_isready`. It is development-only; the image's initialization user is
privileged and must not be reused as a production application role. Before a real
deployment provision separate migration and restricted request roles.

```bash
npm run db:down
```

Normal shutdown preserves the named volume. Do not remove volumes or run database
reset/force-push commands against an existing database. Changing `.env` credentials
does not rewrite credentials in an already initialized volume; coordinate an
explicit credential rotation instead. Avoid printing resolved Compose config
because it includes credentials.

Without Docker, install/start PostgreSQL 17 through your operating system's
normal tooling. Create a dedicated development login and empty `lamssa_dev`
database, using interactive password entry (for example `createuser --pwprompt`
and `createdb --owner` from an authorized local database administrator session).
Keep `listen_addresses` and host access rules local. Point `DATABASE_URL` at that
service and skip `db:up`/`db:down`. Do not change or reset another application's
database. PostgreSQL tooling was not installed in the implementation environment;
the verification record describes which database steps could actually run.

## Generate and apply migrations

```bash
npm run db:generate
npm run db:validate
npm run db:migrate
npm run db:status
npm run db:seed  # Optional: two fictional clinic identities; no users/passwords
```

Generation and validation do not need a live database or a configured URL.
`db:migrate` runs `prisma migrate deploy` to apply the checked-in initial migration
without resetting data. Review the target URL before applying migrations; use a
new dedicated development database for first setup. `db:migrate:dev -- --name ...`
is reserved for creating reviewed future migrations on a disposable development
database (it can require shadow-database privileges); decline any reset prompt
when a database contains data that must be retained. There is no reset/push script.

The initial migration includes additional SQL CHECK constraints and a partial
unique primary-domain index not fully represented in the Prisma schema. Preserve
these in later migrations; validate generated SQL rather than using schema push.

The optional seed requires explicit `NODE_ENV=development` or `test`. It uses a
transaction and stable fixture IDs with create-only upserts; reruns preserve any
changed branding and do not create accounts, passwords, patients or verified
domains. Slug/domain identity collisions fail the transaction rather than
reassigning an existing record. The examples use reserved `.example` hostnames.

## Run the apps

Terminal 1:

```bash
npm run dev
```

Terminal 2:

```bash
npm run dev:api
```

The web command remains Vite on port 5173, with its previous host behavior; use
the **same scheme/hostname/port as before** to retain access to existing demo
localStorage. Moving source files does not migrate, clear or import that storage.
Use `npm run dev:web -- --host 127.0.0.1` when local-only web binding is desired.
The frontend still uses demo data only: it does not call the new API or replace
the displayed clinic identity. Clinic-specific UI, invoices and messaging will be
connected through later authorized feature work.

```bash
curl -i http://127.0.0.1:3000/api/v1/health
curl -i http://127.0.0.1:3000/api/v1/health/ready
curl -i http://127.0.0.1:3000/api/v1/public/clinics/ward-demo/branding
curl -i http://127.0.0.1:3000/api/v1/public/clinics/nour-demo/branding
```

Liveness returns `{"status":"ok"}`. Readiness returns `{"status":"ready"}` after
a successful database query, otherwise a generic Arabic 503. It checks connectivity,
not migration completeness. Branding requires an applied migration and matching
clinic records; missing/suspended/archived clinics return 404, and database failures
return a generic 500. API errors contain a stable code and Arabic message, with no
SQL, stack trace, credentials or private settings. Routes are under `/api/v1` only.

The public branding response is limited to `slug`, `displayName` and nullable
`branding` (`logoUrl`, `primaryColor`, `secondaryColor`, `accentColor`). Legal name,
internal IDs, timezone/currency, domains, users, memberships and password hashes
are excluded. The service selects branding through the identified clinic relation;
query/body clinic IDs and custom hostnames grant no access. Domains are modeled
only: DNS ownership verification, subdomain routing, TLS and hostname-based tenant
resolution are deferred. Public identities are intentionally discoverable.

## Build and test

```bash
npm run build       # Web build, then Prisma generation + API TypeScript compilation
npm run preview     # Existing web production preview command
npm run start:api   # Compiled API; requires environment settings, no automatic migration
npm test            # Configuration and real HTTP tests with a mocked database
npm run test:db     # Live PostgreSQL constraints; skips explicitly without TEST_DATABASE_URL
```

For live database tests, create a **separate empty test database**, apply the same
checked-in migrations to it by supplying its URL as `DATABASE_URL` for the migration
command, and set `TEST_DATABASE_URL` in `.env`. Never use a production URL. The test
requires it to differ from the normal application URL and wraps synthetic inserts
and constraint probes in one transaction that is rolled back. It tests scoped
memberships, independent branding, global slug/email/domain uniqueness, foreign
keys, restricted deletion, color/identity checks and verified-primary-domain rules.
It does not establish authenticated tenant isolation. No lint script exists yet.

Authentication, secure sessions, permissions, membership-derived tenant context,
RLS, audit, backups and production deployment remain release gates. See
[architecture.md](architecture.md) and [implementation-roadmap.md](implementation-roadmap.md).

## Step 1.2 verification record (2026-10-24)

| Command/check | Actual result |
| --- | --- |
| First `npm install --no-audit --no-fund` | Failed with a network `ETIMEDOUT`; retry completed successfully |
| npm install-script setup | Approved the exact pinned Prisma/esbuild versions and rebuilt successfully; initial Prisma binary download failure resolved; no scripts remain unreviewed |
| `npm ci --no-audit --no-fund --prefer-offline` | Passed; 410 packages installed in 21 seconds |
| `npm run db:generate` / `npm run db:validate` | Passed with Prisma 7.10.1 |
| Offline `prisma migrate diff --from-empty --to-schema ... --script` | Generated the migration base; required a temporary syntactically valid datasource URL but did not connect to a database; reviewed SQL checks/index were appended |
| `npm run build` | Passed for both web and API after aligning NestJS 12 and Prisma to native ESM |
| `npm test` | 9 passed, 0 failed; configuration, health/readiness, CORS, input validation, two mocked public identities, field allowlist and safe errors |
| `npm run test:db` | 1 explicitly skipped because TEST_DATABASE_URL is unset; no live constraints claimed as verified |
| `npm run db:up` | Blocked: `docker: not found` (exit 127); local PostgreSQL tools are also absent |
| `npm run db:migrate` with an explicitly unavailable loopback verification URL (`127.0.0.1:1`) | Exit 1, schema-engine connection failure; no migration was applied and no existing database was targeted |
| Compiled API process with temporary non-secret test settings | Started on loopback; actual health returned 200, readiness 503 without PostgreSQL, branding database failure 500, malformed slug 400, and unimplemented patient route 404; all error responses were sanitized |
| Root `npm run dev` / `npm run dev:api` | Both started; Nest watch compilation reported 0 errors and served health; Vite served the Arabic RTL entry point with forwarded host/port arguments |
| Frontend file comparison | All 12 source/HTML/configuration files are byte-identical after moving to apps/web |
| Isolated Chrome production-preview regression | Existing patient/search, appointment/check-in, queue/single-room guard, invoice/payment and reload flows passed; no runtime exceptions; all 13 previous PNG snapshots matched byte-for-byte |
| `git diff --check` / documentation links / ignore rules | Passed; root/nested env files, generated client and build artifacts are ignored; `.env.example` is included |

Browser verification used a new temporary profile, fixed Asia/Aden time and
blocked external fonts to match the Step 1.1 baseline; it never accessed the user's
browser data. Database migration application, persistent two-clinic seed reruns,
actual database-backed branding and live SQL constraint tests remain **unverified
until a local PostgreSQL service is available**. Compose parsing/runtime cannot be
verified without Docker. No real patient records, reset/force-push commands,
commits or pushes were part of Step 1.2.
