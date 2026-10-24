# Development setup

Step 1.5 adds persistent administrative patients to the existing authenticated
tenant/RLS boundary. The Arabic patient directory/register/profile now use the API.
Appointments, queue, invoices and dashboard remain explicitly local demos. Use
fictional data only; clinical records and production operational controls are deferred.

## Step 1.5 patient setup and verification

Use the existing private root `.env`; **no new variable, password, dependency or
system privilege** is needed. Keep runtime and migration URLs separate. From root:

```bash
npm run db:generate
npm run db:validate
npm run db:migrate:test
npm run test:db
npm run db:migrate
npm run db:grant
npm run db:status
npm run db:status:test
npm run check:boundaries
npm run build
npm test
npm run test:db
```

Migration `20261024000400_patients` is additive. Preserve the prior three migration
files/checksums. It adds administrative tables, constraints/indexes, immutable
identity/counter triggers, ENABLE/FORCE RLS and restricted runtime grants atomically.
The SQL pattern indexes/checks/RLS/triggers are intentional: review generated SQL
when extending the Prisma schema, rather than replacing these controls with ORM
schema push/reset. Runtime Patient/PatientCounter access is SELECT/INSERT/UPDATE
only; migration-owner cleanup is restricted to tracked fictional test fixtures.
No seed/import of browser patients occurs. Existing clinic seed remains idempotent.

In two terminals, run `npm run dev` and `npm run dev:api`. Provision a local account
with `npm run auth:provision` (interactive supplied secret; no default password),
then log in at `http://localhost:5173`, choose a clinic, open **المرضى**, and select
**مريض جديد**. Owner/admin/receptionist can register; doctor can read/edit; accountant
cannot read patients. Fields: name required, phone/email/birth date/self-reported
gender optional. No notes/photos/treatment fields. Status changes in the profile
keep the file available through inactive/all filters and direct authorized lookup.
Only use fictional information. See [architecture.md](architecture.md#step-15-administrative-patients)
for exact field contracts and the existing permission matrix.

API under `/api/v1/clinics/:clinicId/patients`:

- GET list: `q` max 60; `status=ACTIVE` default (`INACTIVE`/`ALL` also accepted),
  `pageSize=20` default/max 50, optional `cursor` UUID. Response is
  `{items,pageSize,hasMore,nextCursor}`. No unbounded export/count.
- GET `/:patientId`: projected record, including inactive identities.
- POST: `{fullName,phone?,email?,dateOfBirth?,gender?}`; creates ACTIVE/version 1.
- PATCH `/:patientId`: editable fields plus required numeric `expectedVersion`.
- PATCH `/:patientId/status`: `{status:"ACTIVE"|"INACTIVE",expectedVersion}` only.

Mutations need the existing HttpOnly session and `X-CSRF-Token` with an allowed
Origin. Select the clinic through `/auth/clinic` before accessing it. The URL ID is
never authorization. Unknown fields are rejected; general edits cannot set status,
clinicId, number, id, timestamps or version. Optional nulls clear values. A stale
version returns 409; reopen/reload before resubmitting. Missing/foreign patient IDs
return the same 404. Rate/secret/session behavior is unchanged.

`P-000001` numbering is unique per clinic, allocated in the same row-locked
transaction as insertion. Never reset/delete counters, manually renumber patients,
or infer identity across clinics from a number/name/phone. Prefix search folds
Arabic variants/marks in the internal key only; names preserve their spelling.
Phone formatting/Arabic digits normalize, but country codes are not guessed.
Duplicates are allowed. Search is not fuzzy/substring or identity matching.
No automatic POST retries exist: search after an uncertain network result before
explicitly trying registration again.

Browser API data lives only in memory. Switching clinics aborts requests and
invalidates pending results, then fetches the new clinic. Do not add patient data
to storage, analytics, URL navigation, query persistence or service-worker caches.
Production proxies/observability must redact search queries and bodies, which may
contain identifiers. The old `lamssa-clinic-demo-v1` key remains untouched by API
activity, with no import or rewrite of existing JSON. Demo operations may still
save their own deliberate changes; their patient IDs never become API references.

Optional reproducible Chrome regression:

```bash
npm run test:browser
```

Requires installed Chrome (`CHROME_BIN` may override `/usr/bin/google-chrome`),
PostgreSQL and both test URLs. It builds both apps, compiles tests, starts temporary
API/preview servers on loopback ephemeral ports using **test runtime** credentials,
provisions UUID-tracked fictional test clinics/users with random in-memory passwords,
and uses a fresh temporary browser profile. It never uses your normal browser or
localStorage. Cleanup removes only its tracked fixtures/profile and stops its own
processes. Screenshots contain fictional data in `/tmp/lamssa-step15-browser`.
The default `npm test` also runs three dependency-free frontend request-race tests.

### Troubleshooting patients

- 401: session expired/revoked/privileges changed; sign in again. 403: permission,
  selection or CSRF mismatch; refresh/reselect, never widen grants to resolve it.
- 404: patient is not available in the selected clinic; do not query another tenant
  through a maintenance connection to serve a request.
- 409: stale edit or identifier conflict. Reload/review; do not auto-overwrite.
  An unexpected allocator conflict needs controlled investigation, not counter reset.
- Empty list: ACTIVE filter is default; check inactive/all and prefix search.
  Existing browser demo patients are deliberately not imported; use **مرضى العرض القديم**.
- Missing relation/permission error: apply all migrations in the correct environment
  and `npm run db:grant`; keep runtime non-owner/NOBYPASSRLS.
- On a database outage or uncertain registration result, search when service recovers
  before trying again; no automatic retry can guarantee deduplication yet.

### Executed Step 1.5 checks (2026-10-24)

| Command / check | Actual result |
| --- | --- |
| `npm run db:validate` | Prisma schema valid |
| `npm run db:generate` | Prisma Client 7.10.1 generated |
| `npm run db:migrate:test` then `npm run db:migrate` | `20261024000400_patients` applied in both, without resetting records |
| `npm run db:grant` | Explicit restricted grants applied in both; patient/counter DELETE absent |
| `npm run db:status` / `npm run db:status:test` | Four applied migrations; both schemas up to date |
| `npm run check:boundaries` | Passed; temporary negative feature import was correctly rejected and removed |
| `npm run build` | Both workspaces passed (also repeated by the browser command) |
| `npm test` | 15 API + 3 frontend tests passed; zero failed/skipped |
| `npm run test:db` | 59 passed, zero failed/skipped: prior 39 plus 20 patient API/runtime RLS cases |
| `npm run test:browser` | Real Chrome journey passed; zero runtime exceptions; temporary test processes/fixtures/profile cleaned |
| Development compiled API probe | health 200 `{status:"ok"}`, ready 200 `{status:"ready"}`; Ward/Nour public branding 200; unauthenticated patients 401 |
| Catalog/record audit with both real runtime roles | Both non-owner, NOSUPERUSER/NOBYPASSRLS; six FORCE-RLS tables; Patient/PatientCounter SELECT/INSERT/UPDATE only |
| Post-test maintenance counts | No Patient/PatientCounter rows or patient-test users left in either database; development Ward/Nour branding unchanged |
| `git diff --check` and ignored-file checks | Clean whitespace; `.env`, generated clients and build artifacts ignored; only `.env.example` tracked |

Database cases include registration/read/edit/status, optional contacts/duplicates,
Arabic and literal-wildcard prefix search, stable pagination, ten simultaneous
first-clinic allocations, competing edits (one 200, one 409), failed allocation
rollback, foreign IDs with identical 404s, roles, suspended contexts, malformed/
extra/oversized inputs and POST/PATCH CSRF. Native runtime SQL exercises missing/
invalid context, foreign reads/inserts/updates, immutable identities, counter rewind,
denied DELETE and RLS/policy privileges; concurrent transactions and pooled reuse
cannot expose another clinic's rows. Existing session/login/public tests still pass.

The browser check registers/reloads/edits/activates/deactivates a fictional patient,
checks Arabic validation, loading/empty/offline/error recovery, a second clinic's
branding/patients, doctor create-button denial, and a deliberately delayed old-clinic
response whose transport ignores abort. Existing pretty-printed localStorage stays
**byte-identical** throughout API activity; later deliberate appointment/queue/
invoice demo changes still persist, without any API patient ID/name or secret in
storage. Desktop/mobile screenshots are fictional artifacts under `/tmp`.

Initial TypeScript annotation/conditional errors were corrected before final
checks. A parallel Prisma-generation/compilation attempt conflicted on generated
files; the final successful commands ran sequentially. **Do not run Prisma-generating
build/test commands concurrently in one checkout**: they replace the same generated
client. This is tooling ordering, not a database migration failure.

No new dependencies, environment changes, administrator passwords, real patient
records, database reset/drop, browser migration or commit/push were introduced.
PostgreSQL remains running. Security/change audit, retention, durable create
idempotency, deployment hardening, backup restore, MFA and medical privacy review
remain required before real use.

### Step 1.5 file inventory

Added:

```text
apps/api/prisma/migrations/20261024000400_patients/migration.sql
apps/api/src/patients/patient-input.ts
apps/api/src/patients/patient.controller.ts
apps/api/src/prisma/patient.repository.ts
apps/api/test/patient-input.test.ts
apps/api/test/patients.integration.test.ts
apps/web/src/features/patients/PatientDirectory.tsx
apps/web/src/features/patients/patient-api.ts
apps/web/src/features/patients/patients.css
apps/web/src/features/patients/request-scope.ts
apps/web/test/request-scope.test.mjs
scripts/patients-browser-smoke.mjs
```

Changed:

```text
README.md
package.json
apps/api/package.json
apps/api/prisma/schema.prisma
apps/api/src/app.module.ts
apps/api/src/configure-app.ts
apps/api/src/prisma/prisma.module.ts
apps/api/src/prisma/prisma.service.ts
apps/api/src/prisma/tenant-database.service.ts
apps/api/test/rls.integration.test.ts
apps/web/package.json
apps/web/src/App.tsx
apps/web/src/components/ui.tsx
apps/web/src/features/auth/AuthShell.tsx
apps/web/src/features/auth/api.ts
scripts/grant-database-access.mjs
docs/architecture.md
docs/implementation-roadmap.md
docs/development.md
```

`package-lock.json`, existing migrations, legacy demo models/forms/storage key and
all environment secrets remain unchanged.

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
and receive scoped SELECT on Clinic/ClinicMembership, auth SELECT on User, and
DML on ClinicBranding/ClinicDomain/Session/LoginBucket, SELECT/INSERT/UPDATE on
Patient/PatientCounter (no runtime delete), excluding `_prisma_migrations`.
PUBLIC has no access to either application database/schema; development and test
runtime logins cannot connect to each other's database. Database-level privilege
separation alone does not enforce per-clinic authorization. Step 1.3 adds server
membership/permission checks; Step 1.4 adds selected-clinic transactions and FORCE RLS.

API configuration and Prisma CLI both load the root `.env`; shell environment
variables take precedence. Vite stays rooted in `apps/web` and does not consume
the root server configuration. `DATABASE_URL` and a comma-separated list of exact
`CORS_ORIGINS`, plus a private random `AUTH_CSRF_SECRET`, are required to start the API. Wildcards, paths, and trailing slashes
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
`db:migrate` runs `prisma migrate deploy` to apply the checked-in migrations
without resetting data. Prisma CLI prefers MIGRATION_DATABASE_URL, falling back
to DATABASE_URL for older setups. The API uses DATABASE_URL; seed/provisioning
require the matching local MIGRATION_DATABASE_URL. The test migration/status wrapper selects the test URLs in
child-process environment without printing them. No shadow database, directUrl or
additional Prisma URL is needed for migrate deploy.

After migrating both databases, `db:grant` connects as each migration owner and
reapplies the explicit scoped/read-only/DML allowlist described in Step 1.4. It grants no DDL,
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
The frontend calls the same-origin `/api/v1` Vite proxy for authentication and
clinic identity, and displays selected clinic branding. Workflow records remain
local demo data, shared across selections in that browser. Never enter real patient
information; switching clinics does not copy, clear or import any browser data.

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
npm test            # Permission/CSRF policy, configuration, mocked-database HTTP checks
npm run test:db     # Live PostgreSQL constraints + auth/tenant HTTP integration tests
```

Native setup creates the separate test database and credentials. Apply its
migration with `db:migrate:test`, then run `db:grant` before `test:db`. Existing
setups must explicitly configure both test URLs. Never use a production URL. Tests require a physically different database from the normal application URL.
The original constraint test rolls back synthetic inserts and probes. Auth HTTP
tests commit UUID-tracked fictional fixtures so requests on separate pooled
connections can see them; cleanup removes only those fixture rows in FK order. It tests scoped
memberships, independent branding, global slug/email/domain uniqueness, foreign
keys, restricted deletion, color/identity checks and verified-primary-domain rules.
The test also verifies non-administrative/non-owner role attributes, denied DDL,
denied mutation of migration history, and explicitly clinic-scoped reads/updates.
Auth integration tests verify membership/permission denial and session security.
RLS integration tests use actual runtime credentials to test row filtering, denied
writes, policy/role restrictions, concurrent contexts and connection reuse. The
separate test owner provisions/cleans only tracked fictional fixtures; policies are
never disabled for setup. No general lint script exists; database boundaries are checked.

RLS coverage for future tables, audit, backups, MFA, recovery and production deployment
remain release gates. See
[architecture.md](architecture.md) and [implementation-roadmap.md](implementation-roadmap.md).

## Step 1.4 RLS setup and extension workflow

The existing four private URLs remain unchanged. No new role, password, privileged
system command or database reset is needed. Review the SQL migration before use:

```bash
npm run db:generate
npm run db:validate
npm run db:migrate:test
npm run test:db
npm run db:migrate
npm run db:grant
npm run db:status
npm run db:status:test
npm run db:seed
npm run check:boundaries
npm run build
npm test
npm run test:db
```

Migration `20261024000300_tenant_rls` atomically adds policies/functions/triggers and
tightens existing runtime grants. Applying migrations again is a no-op; `db:grant`
reapplies the explicit least-privilege allowlist, never all future tables. Native
runtime roles retain no schema/policy ownership, BYPASSRLS or owner-role membership.
No migrations were edited after application; all three migration directories must
be retained. This step adds no dependency and changes no frontend source/storage.

Seed and `npm run auth:provision` now need the existing **MIGRATION_DATABASE_URL**,
not runtime write privileges on users/roots/memberships. CLI provisioning still
requires explicit local development mode, secure supplied credentials and optional
`--update-existing`; passwords/default accounts are never seeded. The seed also
checks its runtime/maintenance URLs identify the same loopback `_dev` or `_test`
database for the configured mode. Do not grant app-role writes to bypass a CLI error.
Do not deploy maintenance URLs to production API workers.

All Prisma connections specify `options: '-c timezone=UTC'` at startup. Keep this
in every future client/seed/fixture factory: the installed adapter must be paired
with UTC sessions for consistent timestamptz input/output. The OS and cluster
remain in their prior timezone. Do not rewrite historical timestamps as an
infrastructure fix or use session-global SET for tenant identity.

For future feature repositories, import TenantDatabaseService, then:

```ts
return database.withClinicContext(
  request.auth!.principal, clinicId, ['clinic.branding.read'],
  (tx, context) => tx.clinicBranding.findUnique({
    where: { clinicId: context.clinicId },
    select: { primaryColor: true, secondaryColor: true },
  }),
);
```

The principal is created only after server session verification. Never accept it,
permissions or role claims from request data. Select a clinic with POST
`/api/v1/auth/clinic` first. Every protected operation rechecks active session,
user, membership, clinic, permissions and selected clinic inside its transaction.
The callback receives tenant delegates, not raw SQL/global identity. Explicit
clinicId filters and field projections remain required even with RLS. No network
calls or long work inside transactions; no saving transaction handles for reuse.

When adding a table:

1. Classify ownership; add non-null clinicId and same-clinic compound FKs/uniques
   and indexes as appropriate. Keep immutable ownership.
2. Add a reviewed SQL migration with ENABLE/FORCE RLS, explicit command policies,
   USING/WITH CHECK and owner maintenance policy. Follow the existing nonrecursive
   policy structure; do not add an application bypass role or GUC.
3. Add only needed grants to the allowlist. Root/membership/user mutations are
   currently maintenance-only. Inspect SQL functions/views for fixed projections,
   ownership, PUBLIC privileges, schema qualification and safe search_path.
4. Add a permission-specific repository and server DTO projection. Avoid nested
   global User includes that could expose identity/password fields; authorization
   and field minimization remain separate from row isolation.
5. Add actual-runtime negative tests for missing/invalid/foreign context, writes,
   reassignment, parallel transactions and reused connections. Test maintenance
   only for fixture setup/constraint checks, not as evidence of runtime isolation.
6. Apply to isolated test, verify old auth/public/browser flows, then development;
   inspect migration status/policies/grants and preserve all existing records.

RLS troubleshooting: no protected rows without context is expected. A 403 for a
member may mean the session selected another clinic; explicitly select the target.
A 503 in the tenant boundary can indicate an unsafe owner/admin runtime credential.
Never disable RLS, use row_security=off, grant ownership or add permissive runtime
policies to make a query work. Use the documented context path and test database.
The global identity repository and fixed public/identity functions are intentional
exceptions, documented in architecture.md. Custom settings are not authentication;
arbitrary trusted-runtime SQL remains outside RLS's containment guarantee.

## Step 1.3 authentication setup

New installations receive a random `AUTH_CSRF_SECRET` from `db:env:native`.
For an existing private `.env` missing only this setting, append it without
replacing any credentials:

```bash
node --input-type=module <<'JS'
import {readFile, appendFile, chmod} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
const current = await readFile('.env', 'utf8');
if (!/^AUTH_CSRF_SECRET=/m.test(current)) {
  await appendFile('.env', `\nAUTH_CSRF_SECRET=${randomBytes(48).toString('base64url')}\n`);
  await chmod('.env', 0o600);
}
JS
npm run db:generate
npm run db:validate
npm run db:migrate
npm run db:migrate:test
npm run db:grant
npm run db:status
npm run db:status:test
npm run db:seed
```

If the variable exists but is blank/invalid, edit it privately; do not paste secrets
in chat or replace the whole file. Both migration commands use existing isolated
owner credentials. The API uses runtime credentials; controlled seed/provisioning
use matching local maintenance credentials after Step 1.4. No
reset, force push, database drop or patient migration is required. The new migration
is `20261024000200_auth_sessions`; preserve both migration directories. Runtime
roles need explicit grants on Session/LoginBucket, never DDL or migration-history
access. The seed still creates only fictional Ward/Nour identities, no accounts.

Provision your own local account **interactively**:

```bash
npm run auth:provision
```

Supply your chosen email/name, a membership JSON value such as
`[{"clinicSlug":"ward-demo","role":"CLINIC_OWNER"},{"clinicSlug":"nour-demo","role":"DOCTOR"}]`,
and your own 15–128 character password at the hidden prompt. There is no default
password or unrestricted registration. The command requires `NODE_ENV=development`,
a loopback database URL whose database name ends `_dev`, active existing clinics
and valid clinic roles. It does not grant PLATFORM_ADMIN. A duplicate email fails;
intentional password/role updates use `npm run auth:provision -- --update-existing`
and revoke all that user's sessions. Memberships omitted on update are retained,
not deleted. Suspension/recovery tooling is deferred; do not use this development
command for production administration.

For secure automation, supply `LAMSSA_DEV_EMAIL`, `LAMSSA_DEV_NAME`,
`LAMSSA_DEV_MEMBERSHIPS` (JSON) and `LAMSSA_DEV_PASSWORD` in the child environment
through your secret manager. Do not place passwords in command arguments, shell
history, committed env files or `VITE_*` settings. Interactive input is preferred
locally. Do not share `.env` output or authentication cookies in bug reports.

Start `npm run dev:api` and `npm run dev` in separate terminals. Open the **same
frontend origin used previously** (usually http://localhost:5173), log in, then
choose a clinic. Login no longer opens a demo without a verified session. Selected
name/logo/colors come from the server membership context; invoice/message identity
and custom DNS/TLS integration are deferred. All tabs manipulate labeled local demo
arrays only, for every active demo member, regardless of future API permissions.
Local demo records are not tenant isolated or secured by the login screen.

The browser uses relative `/api/v1` requests. The Vite proxy targets loopback port
3000; production needs an equivalent same-origin HTTPS reverse proxy. CORS origins
must exactly match the browser scheme/host/port. For a production-bundle preview at
4173, explicitly allow it when starting the development API, for example:

```bash
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://127.0.0.1:4173 npm run start:api
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

This overrides only the process configuration, not your private file. A Vite port
auto-increment to 5174 also requires an explicitly allowed origin. Use the previous
port to preserve the localStorage namespace. No session or bearer secret is stored
in localStorage; CSRF tokens are in React memory, cookies HttpOnly.

| Environment setting | Default / requirement |
| --- | --- |
| AUTH_CSRF_SECRET | Required random base64url secret, 43–128 characters; keep stable/private; rotation expires old sessions on use |
| AUTH_SESSION_HOURS | 8, absolute lifetime; allowed 1–24 |
| AUTH_IDLE_MINUTES | 30, allowed 1–120 and within absolute lifetime; successful UI polling counts as activity |
| AUTH_LOGIN_ACCOUNT_LIMIT | 5 attempts per normalized email / 15-minute fixed window, including successful logins |
| AUTH_LOGIN_IP_LIMIT | 30 attempts per server-derived IP / 15-minute fixed window |
| TRUST_PROXY_HOPS | 0; only 1 behind one trusted network-restricted HTTPS proxy |
| CORS_ORIGINS | Exact allowed frontend origins, HTTPS only in production |

In production, auth/private endpoints require HTTPS and Secure `__Host-` cookies.
TLS must terminate at a reviewed proxy with forwarding headers overwritten and
backend access restricted; never trust arbitrary X-Forwarded-For/Proto. The
repository has not deployed or tested a real production TLS environment.

Browser/API authentication flow for other clients: first `GET /api/v1/auth/csrf`
with a cookie jar, then POST login with the same jar, an exact allowed `Origin`,
JSON `{email,password}` and `X-CSRF-Token` from that response. Login returns safe
user fields and a new session CSRF token. Send that token and Origin on every
subsequent POST; clinic selection and explicit rotation replace both cookie and
CSRF value. `/auth/me` restores CSRF after a page reload. Never copy credential
responses or cookie jars to tracked files. Consult the route table/matrix in
[architecture.md](architecture.md).

Authentication troubleshooting:

- **401:** absent, expired, revoked or invalidated session; log in again. Changing
  password, role, membership/user/clinic status or platform authority invalidates
  old sessions; disabled users cannot log in.
- **403 CSRF_INVALID:** check exact Origin, matching cookie/token and frontend
  proxy. A stale token after clinic selection/rotation is invalid. Refresh and
  reauthenticate if necessary; do not disable CSRF or broaden to wildcard origins.
- **403 FORBIDDEN:** active membership lacks the server permission; browser role
  headers and selected clinic do not elevate access. Unknown policies deny access.
- **404 clinic context:** no active membership in an active clinic. Public branding
  and a guessed clinicId/hostname are not proof of membership.
- **429:** wait for the 15-minute fixed window; counters survive API restart. Use
  separate fictional test accounts rather than disabling local protections.
- **Missing Session/LoginBucket or permission denied:** apply the migration to the
  correct database and run `db:grant`; do not grant runtime ownership/superuser.
- **API cannot start:** verify required secret length and database/env settings
  privately. Safe startup errors intentionally withhold raw configuration.

The test database must have both migrations and DML grants. `npm test` runs without
live DB access; `npm run test:db` runs real auth HTTP plus constraint/privilege tests.
Auth tests refuse development DB identity, use random credentials and UUID-scoped
fixture cleanup, and do not seed permanent users. Hashed IP rate buckets may remain
until their short expiry; the limiter removes expired buckets on later login.
No actual patient tables are present. Browser smoke checks use isolated temporary
profiles and fictional records, never your normal browser storage. There is no
frontend unit-test or lint script; strict web compilation and browser journeys
provide the current web verification.

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

## Step 1.4 verification record (2026-10-24)

Started from clean Git at `6452337`. Native PostgreSQL 16.15 was already running.
Audit connected separately with the existing development/test runtime and owner
credentials; no password, role, database, system timezone or cluster configuration
was changed. No new dependency, frontend source edit, commit or push was needed.

| Command/check actually executed | Result |
| --- | --- |
| Role/object audit using pg against all four existing private URLs | Seven application tables; owners distinct from runtime; initially no RLS, functions or views; runtime flags superuser/CREATEDB/CREATEROLE/BYPASSRLS false |
| `npm run db:migrate:test` | Exit 0; tenant_rls applied to isolated test before development |
| `npm run db:migrate` | Exit 0 after test verification; tenant_rls applied to development without reset/drop |
| `npm run db:grant` | Exit 0; scoped/read-only/DML allowlist applied to both runtime roles |
| `npm run db:status` / `npm run db:status:test` | Exit 0; both report three applied migrations and up-to-date schema |
| `npm run db:generate` / `npm run db:validate` | Exit 0; Prisma 7.10.1 generated; schema valid |
| `npm run db:seed` twice, then once after final CLI target checks | Exit 0; maintenance credentials work under FORCE RLS; fictional identities/branding/domains retained |
| Native pg integrity hashes before/after migration and seed | All original Clinic (2), ClinicBranding (2), ClinicDomain (2), User (0), ClinicMembership (0) rows unchanged, including timestamps |
| `npm run check:boundaries` | Exit 0; database imports, SQL and principal minting confined to approved paths; also runs within API build/test compilation; a temporary negative probe importing raw Prisma was rejected and removed |
| `npm run build` | Exit 0; React/Vite and Prisma/Nest TypeScript builds pass |
| `npm test` | 12 passed, 0 failed, 0 skipped |
| `npm run test:db` | 39 passed, 0 failed, 0 skipped: prior 20 auth/constraint cases plus 19 RLS/context/UTC cases |
| Post-migration catalog audit | Four FORCE RLS tables, 20 policies, three immutable-clinic triggers, five hardened functions (three definer); no views; runtime still non-owner/NOBYPASSRLS and no root/user/membership writes |
| `npm run auth:provision` through private child environment | Exit 0 with explicit local maintenance credentials, random supplied password and two fictional memberships |
| `CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://127.0.0.1:4179 npm run start:api` | Compiled API started with runtime credentials |
| `npm run preview -- --host 127.0.0.1 --port 4179 --strictPort` | Production frontend started with same-origin API proxy |
| Direct GET health, readiness, Ward/Nour public branding; proxied readiness | All HTTP 200; expected safe response fields and distinct #7854D9 / #087F8C identities |
| `node /tmp/lamssa-step14-browser.mjs` | PASS: 19 desktop/mobile/form PNGs, zero runtime errors; Arabic RTL/auth/selection/denial/expiry/demo workflows |
| Screenshot comparison to Step 1.3 | 18/19 byte-identical; expired-session PNG differs only in generated fictional email text |
| `node /tmp/lamssa-step13-focus-browser.mjs` | PASS: mobile selection control, CSRF refresh after rotation in another tab, logout |

The first RLS probe run denied valid one-hour test sessions. Native pg versus ORM
comparison diagnosed the existing adapter/Asia-Aden timezone mismatch. No policy
was weakened: startup UTC configuration fixed the actual instant mismatch and a
regression test now compares native/ORM expiry. An early test ConfigService type
annotation was also corrected. All final checks above pass.

Runtime tests deliberately omit application WHERE clauses to prove A/B row
filtering; cover absent/malformed/forged settings, cross-clinic read/write denial,
same-clinic DML, immutable ownership, role/policy/TRUNCATE denial, row_security=off,
owner-role assumptions, hardened function inventory, concurrent physical clients,
same-connection commit/rollback/reuse, fake principals, empty permissions,
transaction rollback, dual selected-clinic permission boundaries, suspended clinic/
membership, revoked session, public projection, seed idempotency and wrong owner
credentials. HTTP tests also verify unselected clinics deny access, scoped root
settings expose only allowed fields, and previous auth/session/CSRF/RBAC remains intact.
After the final test run, Clinic/ClinicBranding/ClinicDomain/User/ClinicMembership/Session
fixture counts are all zero in test; application views are zero.
Fixtures are created/cleaned using the distinct test owner; all isolation and policy
assertions use runtime credentials. Original constraint tests use maintenance only
for constraints, with separate runtime privilege probes. No RLS is disabled for
fixture setup. Temporary browser accounts/sessions/memberships and credential files
are removed by exact fixture identity; normal browser profiles/localStorage are not
accessed. Shared hashed IP rate counters expire normally. Test servers are stopped
after verification; PostgreSQL remains running. Browser artifacts remain outside
Git. No frontend unit-test/general lint command exists.

No claim of production or clinical readiness follows from these checks. See the
architecture's explicit privileged paths, arbitrary-runtime-SQL limitation and
release controls. Step 1.5 is the patient administrative backend, with a new
clinic-scoped model, repository, permission projections and RLS/HTTP negative tests.

## Historical Step 1.3 verification record (2026-10-24)

Verified on the existing native PostgreSQL 16.15 service, Node 24.21.0 and npm
11.19.0. No privileged system changes, Docker, resets, real patient data, commits
or pushes were involved. Existing database secrets were retained; one new random
CSRF signing secret was appended only because it was absent. `.env` remains ignored
and mode `0600`. Argon2 0.45.1 and cookie-parser 1.4.7 are pinned with their lockfile.

| Executed command/check | Final result |
| --- | --- |
| `npm install --no-audit --no-fund --prefer-offline` | Exit 0; 9 packages added; native Argon2 works |
| `npm run db:generate` / `npm run db:validate` | Exit 0; Prisma 7.10.1 client generated and schema valid |
| `npm exec --workspace @lamssa/api -- prisma migrate diff --from-schema /tmp/lamssa-before-auth.prisma --to-schema prisma/schema.prisma --script --output prisma/auth.generated.sql` | Exit 0; additive SQL reviewed, moved into migration with transactional checks; temporary SQL removed |
| `npm run db:migrate` / `npm run db:migrate:test` | Exit 0; auth_sessions migration applied in both existing databases, no reset/drop |
| `npm run db:grant` | Exit 0; explicit seven-table DML allowlist; no new runtime ownership/DDL |
| `npm run db:status` / `npm run db:status:test` | Exit 0; both databases up to date with two migrations |
| `npm run db:seed` | Exit 0; Ward/Nour fictional identities retained; distinct primary colors #7854D9 / #087F8C |
| `npm run build` | Exit 0; strict frontend TypeScript/Vite and Prisma/API TypeScript builds |
| `npm run build:web` after final UI changes | Exit 0; latest bundle generated |
| `npm test` | 12 passed, 0 failed, 0 skipped |
| `npm run test:db` | 20 passed, 0 failed, 0 skipped; real test DB, not development |
| `npm run auth:provision` with private child environment | Exit 0; random supplied credentials and two fictional memberships; test accounts subsequently removed by exact fixture IDs |
| `CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://127.0.0.1:4179 npm run start:api` | Compiled API started on loopback; private credentials not printed |
| `npm run preview -- --host 127.0.0.1 --port 4179 --strictPort` | Production web bundle served with same-origin API proxy |
| Direct GET health / health/ready and proxied health/ready | HTTP 200; `{status:"ok"}` / `{status:"ready"}` |
| Isolated Chrome: `/tmp/lamssa-step13-browser.mjs` | PASS; 19 desktop/mobile/form screenshots, zero runtime exceptions |
| Isolated Chrome: `/tmp/lamssa-step13-focus-browser.mjs` | PASS; mobile clinic switch visible, CSRF refresh following another tab's rotation, successful logout, zero runtime exceptions |
| `git diff --check` and private-value scan | Passed; no current DB passwords or signing secret in 69 tracked/untracked project files; `.env` ignored |

The browser smoke harnesses/screenshots are temporary artifacts outside the repo,
not new test dependencies. They exercise invalid/valid login, two clinic identities,
permission denial, expired sessions, HttpOnly cookies, absence of tokens in
localStorage, all five existing views, all three forms, patient creation/search,
appointment check-in/duplicate prevention, queue single-room transitions, invoice
creation/payment, and unchanged data across reload/selection/logout. Normal user
browser profiles were not accessed. Temporary development users/memberships/sessions
and private browser credential files were removed; temporary API/preview processes
were stopped after verification. The two existing clinic
identities remain. Development contains zero users and zero sessions after cleanup;
provision your own account to log in. Hashed short-lived rate counters are harmless
local development/test infrastructure and expire separately.

Security checks cover valid/invalid/unknown/suspended login, hashed persistence,
absolute/idle expiry, re-login/explicit/selection rotation, replay/logout,
privilege and CSRF-secret invalidation, missing/forged sessions, unmarked default
deny, wrong-clinic 404, dual memberships, doctor permission denial, global platform
no-bypass, suspended user/membership/clinic, forged IDs/roles/slugs, public field
allowlist, Origin/token/Fetch-Metadata CSRF denial, rejected requests not extending
idle time, persistent account/IP throttles, ignored forged forwarding headers,
production plaintext rejection, safe provisioning update and live schema privileges/
constraints. Early assertion mismatches (Argon2 parameter ordering/readiness body)
and a test type error were corrected before these final passing runs.

No frontend unit-test or lint command exists. Real production TLS, RLS, MFA,
recovery/invitations, clinical compliance, audit/retention and release operations
are unverified or deferred. Step 1.4 should establish mandatory scoped repositories,
transaction-local tenant context/RLS defense and isolation tests before patient APIs.

## Historical Step 1.2.1 verification results (2026-10-24)

**Completed:** native PostgreSQL 16.15 is connected; the existing initial migration
is applied to both dedicated databases; the seed and live database tests pass.
The foundation is ready for **Step 1.3 — Authentication and RBAC** development.
At that checkpoint it was not ready for real clinical data: authentication, clinic-level
permissions, RLS, audit and production operational controls remain unimplemented.

The user approved installation, service startup and first-time provisioning. The
tool's initial `sudo -n apt-get update` exited 1 (`a password is required`), so the
user performed the privileged commands locally. The service became available first;
initial logins failed with 28P01 and server logs confirmed the roles were absent.
After the final provisioning command succeeded in the user's terminal, all four
configured logins connected. No existing password was rotated or replaced.

| Command/check | Exact observed result |
| --- | --- |
| `pg_lsclusters` | 16/main, port 5432, online |
| `psql --version` | PostgreSQL 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1) |
| `pg_isready -h 127.0.0.1 -p 5432` | Accepting connections |
| `ss -ltn '( sport = :5432 )'` | Listener on 127.0.0.1:5432 only |
| Four private URL connectivity/role checks | All connected; superuser, CREATEDB, CREATEROLE, replication and BYPASSRLS flags all false |
| Initial schema inspection | Both dedicated public schemas empty before migration |
| `npm run db:migrate` | Applied 20261024000100_clinic_identity to lamssa_dev; exit 0 |
| `npm run db:migrate:test` | Applied the same migration to lamssa_test; exit 0 |
| `npm run db:grant` | Granted runtime CRUD on five identity tables only; exit 0 |
| `npm run db:status` / `npm run db:status:test` | One migration found; both database schemas up to date; exit 0 |
| `npm run db:seed` (twice) | Both exited 0; identical identities/colors/counts after rerun; two clinics, two branding rows, two pending domains, zero users/memberships |
| Runtime permission probes | Both runtimes denied schema CREATE and migration-history UPDATE; actual connections to the other environment's database rejected with 42501 |
| `npm run test:db` | 1 passed, 0 failed, 0 skipped; real PostgreSQL unique/FK/check constraints, scoped membership/branding behavior and restricted permissions |
| Post-test fixture counts | All five test tables empty; fixture transaction rolled back |
| `npm run db:generate` / `npm run db:validate` | Passed with Prisma 7.10.1; exit 0 |
| `npm run build` | Both Vite frontend and NestJS API passed; exit 0 |
| `npm test` | 9 passed, 0 failed, 0 skipped; exit 0 |
| `npm run start:api` then GET /api/v1/health | HTTP 200, {"status":"ok"} |
| GET /api/v1/health/ready | HTTP 200, {"status":"ready"}, using the restricted development runtime login |
| GET /api/v1/public/clinics/ward-demo/branding | HTTP 200; primary color #7854D9; public field allowlist verified against the real database |
| GET /api/v1/public/clinics/nour-demo/branding | HTTP 200; primary color #087F8C; public field allowlist verified against the real database |
| `npm run preview -- --host 127.0.0.1 --port 4179 --strictPort` plus isolated Chrome checks | Existing Arabic RTL workflows passed with no runtime exceptions; all 13 desktop/mobile/form PNGs matched the Step 1.1 baseline byte-for-byte |

The private root `.env` remains ignored and mode 0600. Environment generation used
exclusive creation because no file existed, and refusal-to-overwrite was verified.
No passwords or credential URLs are included in this record. Browser verification
used separate temporary profiles with fixed Asia/Aden time and blocked external
fonts, matching the prior baseline. User browser localStorage was never accessed
or cleared. No real patient data, database resets/drops, or migration force-push
commands were used. Temporary API/preview processes are stopped after verification;
the native PostgreSQL service remains running. Verification does not automatically
commit or push repository changes.

## Historical Step 1.2 verification record (2026-10-24)

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
actual database-backed branding and live SQL constraint tests were unverified at
that point. These database checks are now completed in Step 1.2.1 above. Optional
Compose parsing/runtime remains unverified without Docker. No real patient records, reset/force-push commands,
commits or pushes were part of Step 1.2.
