# Development setup

Step 1.2 adds the API/database identity foundation. Authentication, private clinic
endpoints, RLS and clinical workflows are not implemented. Use fictional data only.

## Requirements and versions

- Node 24 LTS (`>=24.11 <25`), npm 11; `.nvmrc` selects Node 24.
- Native PostgreSQL **16** from Linux Mint 22.3 / Ubuntu 24.04 repositories is the
  preferred local setup (candidate 16.15 at inspection). Optional Docker Compose
  uses PostgreSQL 17; both use the existing PostgreSQL schema and pg adapter.
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
npm run db:env:native
```

npm 11's `allowScripts` list in the root manifest permits only the pinned Prisma
and esbuild setup scripts. Review that list when updating those versions.

`db:env:native` creates a root `.env` with cryptographically random, distinct
credentials and mode `0600`. It refuses to overwrite any existing `.env`. Existing
setups must add only missing settings deliberately; never replace existing secrets.
Do not print the file, put passwords in shell history/arguments, or commit it.
No server values belong in `apps/web` or `VITE_*` variables.

| Variable | Native role / purpose |
| --- | --- |
| DATABASE_URL | lamssa_dev_app: runtime DML in lamssa_dev |
| MIGRATION_DATABASE_URL | lamssa_dev_migrator: owns only the development database/schema |
| TEST_DATABASE_URL | lamssa_test_app: integration-test DML in lamssa_test |
| TEST_MIGRATION_DATABASE_URL | lamssa_test_migrator: owns only the test database/schema |

The four roles have no superuser, create-database, create-role, replication or
RLS-bypass privileges. Runtime roles own no database/schema, cannot create tables,
and receive CRUD only on the five identity tables, excluding `_prisma_migrations`.
PUBLIC has no access to either application database/schema; development and test
runtime logins cannot connect to each other's database. Database-level privilege
separation does not enforce per-clinic authorization; Authentication/RBAC and RLS
are still future work.

API configuration and Prisma CLI both load the root `.env`; shell environment
variables take precedence. Vite stays rooted in `apps/web` and does not consume
the root server configuration. `DATABASE_URL` and a comma-separated list of exact
`CORS_ORIGINS` are required to start the API. Wildcards, paths, and trailing slashes
are rejected. Production mode requires HTTPS origins. The defaults bind the API
to `127.0.0.1:3000`; use `API_HOST`/`API_PORT` to change it explicitly.

## Native PostgreSQL on Linux Mint (preferred)

Inspection found only `libpq5`, no server/client packages, no PostgreSQL service,
and no port-5432 listener. Mint 22.3 uses Ubuntu's `noble` repositories; its native
PostgreSQL 16 package is sufficient. No PGDG repository or Docker is required.
See the [official Ubuntu installation guidance](https://www.postgresql.org/download/linux/ubuntu/).

Installation, service changes and initial role/database creation require explicit
user approval. These are the exact commands for this machine, run in an interactive
terminal if sudo needs a password:

```bash
sudo apt-get update
sudo apt-get install --yes --no-install-recommends postgresql-16 postgresql-client-16
sudo systemctl start postgresql@16-main
node scripts/native-postgres-setup.mjs
```

The package normally initializes the standard `16/main` cluster. The setup script
executes `sudo -n -u postgres psql --no-psqlrc --set ON_ERROR_STOP=1 --dbname postgres`,
sending private credentials through stdin only. It checks loopback listening and
refuses if any reserved role/database already exists, before issuing DDL. It creates
only new Lamssa databases/roles and never resets databases or rotates existing
passwords. Existing setups require an explicit administrator review instead of
rerunning first-time provisioning. A partial setup failure may leave newly created
objects; inspect them rather than dropping or altering them blindly.

```bash
pg_lsclusters
pg_isready -h 127.0.0.1 -p 5432
systemctl status postgresql@16-main --no-pager
```

Normal service control, when explicitly authorized:

```bash
sudo systemctl start postgresql@16-main
sudo systemctl stop postgresql@16-main
```

Stopping the cluster affects every database in it; coordinate with other local
users/services. Do not change `listen_addresses` to `*`, open firewall ports, or
replace `pg_hba.conf` with trust authentication. Default Ubuntu loopback TCP/SCRAM
and local postgres peer authentication are sufficient. No system-startup policy
or authentication rules are changed by the repository scripts.

## Optional Docker alternative

Do not start Docker PostgreSQL and the native cluster on the same port. The native
`.env` does not contain Docker initialization credentials. For a separate Docker
setup, configure the example POSTGRES_* values privately and matching runtime/
migration URLs before using:

```bash
npm run db:up
docker compose ps
npm run db:down
```

Compose binds to 127.0.0.1 only and retains its named `postgres_data` volume on
normal shutdown. Its initialization user is privileged; separate runtime roles
are required before using the least-privilege database tests. Changing environment
values does not rotate an already initialized volume's credentials. Never remove
volumes or run reset/force-push commands to fix configuration problems.

## Generate and apply migrations

```bash
npm run db:generate
npm run db:validate
npm run db:migrate
npm run db:status
npm run db:migrate:test
npm run db:status:test
npm run db:grant
npm run db:seed  # Optional: two fictional clinic identities; no users/passwords
```

Generation and validation do not need a live database or a configured URL.
`db:migrate` runs `prisma migrate deploy` to apply the checked-in initial migration
without resetting data. Prisma CLI prefers MIGRATION_DATABASE_URL, falling back
to DATABASE_URL for older setups. The runtime Prisma adapter and seed continue
using DATABASE_URL. The test migration/status wrapper selects the test URLs in
child-process environment without printing them. No shadow database, directUrl or
additional Prisma URL is needed for migrate deploy.

After migrating both databases, `db:grant` connects as each migration owner and
grants its runtime role CRUD on the five named tables only. It grants no DDL,
role membership, grant option or migration-history access. Run this again when
explicitly adding authorized tables in later steps; do not grant all future tables
by default. Native test permissions follow [PostgreSQL GRANT](https://www.postgresql.org/docs/16/sql-grant.html)
and [restricted role attributes](https://www.postgresql.org/docs/16/sql-createrole.html).

Review the target database before applying migrations; use a new dedicated
local database for first setup. `db:migrate:dev -- --name ...`
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

Native setup creates the separate test database and credentials. Apply its
migration with `db:migrate:test`, then run `db:grant` before `test:db`. Existing
setups must explicitly configure both test URLs. Never use a production URL. The test
requires it to differ from the normal application URL and wraps synthetic inserts
and constraint probes in one transaction that is rolled back. It tests scoped
memberships, independent branding, global slug/email/domain uniqueness, foreign
keys, restricted deletion, color/identity checks and verified-primary-domain rules.
The test also verifies non-administrative/non-owner role attributes, denied DDL,
denied mutation of migration history, and explicitly clinic-scoped reads/updates.
It does not establish authenticated tenant isolation or prevent arbitrary unscoped
queries before RLS/auth exist. No lint script exists yet.

Authentication, secure sessions, permissions, membership-derived tenant context,
RLS, audit, backups and production deployment remain release gates. See
[architecture.md](architecture.md) and [implementation-roadmap.md](implementation-roadmap.md).

## Native troubleshooting

- **sudo requires a password:** run the approved installation/service/setup commands
  in your local interactive terminal. The agent uses `sudo -n` and cannot enter
  your password. Do not send passwords through chat. The setup helper should run
  immediately after an interactive sudo command so its sudo authentication is cached.
- **Connection refused:** inspect `pg_lsclusters`, `pg_isready -h 127.0.0.1 -p 5432`
  and `systemctl status postgresql@16-main --no-pager`. Start the approved cluster
  with `sudo systemctl start postgresql@16-main`; do not initialize another cluster
  over an existing data directory. The generated native URLs expect port 5432.
- **Peer authentication failure:** administration uses the operating-system postgres
  account (`sudo -u postgres psql`). Application roles use TCP to 127.0.0.1 with
  SCRAM passwords. Do not change local authentication to trust or use the postgres
  account as an application login.
- **Password authentication failure:** check that the local role/database targets
  match the private settings. Preserve existing secrets and inspect shell-variable
  overrides without printing values. Do not rerun the environment generator to
  replace passwords; it intentionally refuses an existing file.
- **Reserved names already exist:** first-time setup aborts without rotating any
  credentials. Have the local administrator inspect those roles/databases and
  establish provenance. Never drop an existing database merely to unblock setup.
- **Permission denied for a schema/table:** use migration-owner URLs for migrations,
  apply both databases' migrations, then run `npm run db:grant`. Runtime URLs must
  remain non-owner credentials. Do not grant superuser, database/schema ownership,
  public CREATE, or access to `_prisma_migrations` to make the application run.
- **Prisma reports a nonempty or divergent database:** stop and review the target
  and migration history. No reset, schema push, baseline or force command is part
  of this setup. `migrate deploy` requires no shadow database or CREATEDB privilege.
- **Tests fail the role/permission assertions:** ensure TEST_DATABASE_URL is the
  restricted test runtime role, not its owner or an initialization administrator.
  All fixture inserts/constraint probes roll back and do not seed test accounts.
- **Readiness is 503:** first verify TCP/database permissions; `/health` is liveness
  only. Readiness does not prove migrations are current, so also run both migration
  status commands. Inspect server logs locally without sharing credentials or SQL
  containing secrets.

## Step 1.2.1 verification progress (2026-10-24)

The user approved native package installation, service startup and first-time
database/role provisioning. The tool's `sudo -n apt-get update` attempt exited 1
with `sudo: a password is required`; the chained install/start commands did not
execute. No package, service, database or existing password was changed by that
failed command. Subsequent inspection found the native PostgreSQL 16/main cluster
online on port 5432, and `pg_isready` reported accepting connections. All four
configured Lamssa logins still failed with PostgreSQL authentication code 28P01;
first-time role/database provisioning has not yet been verified. Do not replace
passwords or assume the existing roles/databases are safe to overwrite.

A new private root `.env` was created only because none existed, using exclusive
creation and mode 0600; its four passwords were not printed. Existing secrets are
never replaced. Native helper syntax, Prisma generation/validation, both application
builds and all nine configuration/HTTP tests pass. The frontend sources remain
byte-identical, and all 13 desktop/mobile/form snapshots and the existing demo
workflow checks match the previous baseline. Live migrations, seed, integration tests and healthy readiness must
be recorded after the local terminal setup completes; they are not yet claimed.

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
