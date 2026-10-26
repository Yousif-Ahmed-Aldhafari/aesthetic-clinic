# Clinic identity and white-label delivery — Step 1.9

Implemented on `main`, starting clean at `c95606d`. No commit, push, branch,
credential rotation, database reset or browser-data import is part of this step.
Native PostgreSQL, existing sessions/CSRF, clinic permissions, tenant transactions
and FORCE RLS remain mandatory. This is a development foundation, not deployment,
medical privacy or financial compliance certification.

## Ownership and stored information

| Boundary | Records and purpose |
| --- | --- |
| Global identity/security | User, Session, LoginBucket; platformRole is global and never grants clinic permissions |
| Tenant root | Clinic retains its existing id, names, slug, status, timezone and currency; adds nullable English name, clinic phone/email, physical address, paired decimal latitude/longitude and optimistic version |
| Existing tenant metadata | ClinicBranding adds managed logo/favicon asset IDs, favicon URL, approved typography and version. ClinicDomain adds hashed expiring TXT challenge, check/verification timestamps and version. ClinicMembership adds version |
| New tenant metadata | ClinicAsset contains immutable derivative metadata, never image bytes; ClinicSlugReservation retains current/former names; ClinicIdentityState serializes audit sequence allocation; ClinicIdentityAuditEvent stores trigger-generated actor/configuration hashes |
| Financial identity | ClinicBillingProfile remains the separately authorized billing address/registration/tax configuration. Issuance snapshots use its address first, then the clinic physical address |

Contact/location are clinic business details, not patient fields. They are not
returned by public branding. Coordinates are paired, bounded, six-decimal values;
no map provider, geocoding call or arbitrary location URL is introduced. Arabic
display names are required on settings writes; pre-existing stored values remain
untouched. Text is NFC-normalized and bounded; phones normalize Arabic digits,
emails lowercase. Clinical information and patient images remain out of scope.

## Authorization and change rules

| Operation | Clinic owner | Clinic admin | Doctor/receptionist/accountant |
| --- | --- | --- | --- |
| Private profile/domain/audit read; profile/subdomain/domain change | Yes | Yes | No |
| Read selected clinic's public branding settings | Yes | Yes | Yes (existing branding.read) |
| Edit branding/upload/read private drafts/clean old drafts | Yes | Yes | No |
| Staff listing | Yes | Yes | No |
| Change owner/admin/accountant membership | Yes | No | No |
| Assign doctor / suspend existing doctor or receptionist | Yes | Yes | No |
| Newly grant/reactivate receptionist finance permissions | Yes | No | No |
| Activate/suspend eligible membership | Yes | Same restricted targets | No |
| Change clinic lifecycle status | No clinic endpoint | No | No |

No clinic API writes global User identity/status/password/platformRole. Ownership,
membership user IDs, timestamps, clinic lifecycle, arbitrary asset URLs, domain
verification status and routing activation are not browser-writable. Versions are
required for settings, role and verification commands. Cross-clinic IDs return safe
not-found/permission responses, without disclosing another clinic's settings.

Timezone changes require explicit acknowledgment and are blocked once appointments,
weekly availability, exclusions, visits or queue records exist. Currency changes
require acknowledgment and are blocked once any draft/issued invoice exists.
The API returns boolean lock flags through a narrowly scoped SQL function; clinic
admins do not gain finance amounts or invoice access. A historical migration or
currency/timezone correction requires a separately reviewed workflow.

Every tenant transaction acquires a transaction-local shared advisory identity lock;
administration writes acquire the same key exclusively. Thus supported booking,
queue and finance operations cannot race a configuration reinterpretation. Values
originate from verified server session/membership checks. Advisory locks and GUCs
are not cryptographic credentials. In-flight authorized transactions can finish;
subsequent requests recheck sessions/roles. Existing data locks, exclusion constraints
and exact-money financial guards remain independently enforced.

Issued invoices are never rewritten by profile/brand changes. New issuance freezes
the current legal/display names, address, logo URL, colors, typography and timezone;
old documents retain their snapshot. The UI uses the snapshot font for print, not
the clinic's newly selected font. Queue lifecycle and invoice lifecycle stay separate.

## Image validation, storage and publication

Pinned Sharp 0.35.5 is the only new direct dependency (compatible with Node 24).
The multipart endpoint requires session, selected membership, branding.update,
Origin and CSRF before the file interceptor runs. One file/no extra fields, at most
2 MiB; accepted input formats are PNG, JPEG and WebP with matching magic bytes/MIME.
The decoder must identify the same format. Dimensions are 16–4096 each, maximum
4096² pixels; corrupt, animated, SVG, HTML and executable inputs are rejected.

Images are rotated/resized/re-encoded without original metadata: logos become WebP
up to 1024px, favicons PNG up to 128px. Originals are not retained. Server-generated
UUID keys are `clinicUUID/assetUUID.webp` or `.png`; arbitrary filenames/paths and
binary PostgreSQL storage are not accepted. A content SHA-256 is recorded.

`AssetStore` abstracts put/read/remove. The development adapter uses the ignored
`var/clinic-assets` directory, 0700 directories/0600 files, exclusive writes and
no-follow file reads/writes. Production requires an explicitly configured private,
persistent `ASSET_STORAGE_DIR`; object storage is a future adapter, not implemented.
Backups must include both PostgreSQL and the asset volume.

An uploaded derivative is **private** until an authorized branding save publishes
it. Private preview routes check the selected clinic and permissions; another
clinic cannot retrieve or attach it. Publication is explicit, records an audit
event, and creates the immutable URL `/api/v1/public/branding/assets/:assetId`.
Only a published derivative belonging to an active clinic is publicly served.
Published logos/favicons are intentionally public identity assets, never protected
medical media. Public lookup ignores caller clinic/Host and never exposes storage keys.

Public cache keys are unique asset UUIDs, with content ETag, nosniff and a five-minute
revalidation cache. Private responses remain no-store. Replacement generates a new
URL; removing the current logo detaches it. Previously published derivatives are
retained for historical invoices and cannot be changed/deleted through runtime APIs.
Already cached public images may remain visible briefly after clinic suspension.
Emergency takedown/retention/legal erasure requires an explicit maintenance policy.

Unpublished assets older than 24h may be explicitly cleaned through the authorized
endpoint. Newly uploaded drafts and all published assets are excluded. Filesystem
cleanup failures return an orphan count for maintenance; publication never falls
back to arbitrary local files. A clinic has at most 20 unpublished drafts, 200 total
assets and 50 MiB derivative storage. Published retention/quota expansion needs review.
Filesystem and SQL commits are not a distributed transaction: failed uploads use
compensating file removal, and private orphan reconciliation remains an operational task.

Legacy HTTPS logo URLs remain intact for existing records/prints; the new API cannot
accept another arbitrary external URL or SVG. Legacy URL bytes are not pinned or
archived; replace them explicitly with managed assets when appropriate. The repository's
static default SVG favicon is trusted application source, not a user upload.

## Branding and Arabic delivery

Primary, secondary and optional accent are validated six-digit hex colors. Primary
must contrast with white text at least 4.5:1; secondary with #17243B at least 4.5:1;
accent must work with white or that dark foreground. Existing light accents are
preserved. Typography uses approved TAJAWAL, SYSTEM and NOTO_NASKH font stacks with
Arabic fallbacks, not client-provided CSS/URLs. Installed font availability affects
the exact face; self-hosted font licensing/delivery and a full accessibility audit
remain deployment work.

The Arabic settings modal includes business profile, live branding preview, logo
and favicon upload/replace/remove, reservations/domain status, staff roles and audit
history. Upload preview is separate from the active theme until saving. The chosen
theme reaches the app header/navigation, calendars, reception/doctor screens and
public board. Document title/favicon reset on switch/logout; a generic static icon
provides the fallback. Public boards poll/resynchronize identity as well as queue data.

The generic login is Lamssa-branded. `/?clinic=ward-demo` explicitly retrieves the
approved public clinic identity by slug; Host is never used as tenant selection.
Authentication and membership checks remain independent of that logo/name.
Clinic settings/read/write requests use cancelable request scopes; late responses
cannot reattach the previous clinic's assets. No API identity, contact, invitation,
patient, finance or session information is cached in localStorage/sessionStorage.

## Subdomains and custom domains

Platform reservations normalize NFKC/trim/lowercase ASCII labels, 3–63 characters,
with an explicit reserved-name list. Clinic.slug remains the active identifier;
ClinicSlugReservation retains former names, prevents another clinic taking old
links, permits reselecting one's own name, and limits a clinic to 20 retained names.
Old public URLs do not automatically redirect. Global unique constraints serialize
competing claims; runtime cannot edit/release reservations directly.

The default platform base is `lamssa.localhost`; it is a reservation namespace, not
an enabled DNS/router. Custom domains must be canonical public DNS hostnames, never
URLs, IPs, ports, internal names or names within the platform namespace. Hostname
uniqueness is global, including pending claims. At most 10 domain records per clinic.

Creating/rotating a domain challenge returns a random 256-bit TXT secret once and
stores only its hash and seven-day expiration. Publish it at
`_lamssa-verification.hostname` as `lamssa-verification=<secret>`. Verification is
rate-limited per domain (30s), checks actual matching DNS TXT chunks, handles DNS
failure safely, and revalidates the session/version after the bounded DNS operation.
Rotation invalidates prior proof. TXT resolution never fetches HTTP or connects to
the hostname's A/AAAA address, avoiding a DNS-to-HTTP SSRF/rebinding path.

VERIFIED means ownership proof observed at verifiedAt, **not activated routing**.
All API responses explicitly say routingActive=false; runtime cannot set isPrimary.
Existing verified-primary/check/unique constraints remain. DNS routing, proof renewal,
domain release/dispute recovery, certificates, reverse-proxy host activation and safe
canonical redirects are deferred. Do not repoint production traffic based on this API.

The API validates Host against configured trusted hostname values (IPv4/IPv6 supported),
defaults derived from API_HOST/CORS origins and local development localhost. It ignores
Forwarded-Host for identity/links; no Host-derived absolute link/redirect is generated.
Production must set explicit trusted hosts/origins and protect the TLS reverse proxy.
Verified custom domains are never automatically added to trust or cookie scope.

## Staff and platform boundaries

Existing clinic members can be listed and managed without duplicating User identities.
Last-active-owner protection is serialized and enforced in a database trigger, not
only UI. A clinic admin cannot promote themselves, alter owner/admin/accountant
memberships, or grant financial/platform permissions beyond their own authority. Reception includes billing rights absent from CLINIC_ADMIN, so only the owner can newly assign/reactivate that role; admins can suspend it or remove it in favor of doctor. Role/status changes durably revoke
all sessions for the affected User. Other clinic memberships and the account remain;
the user can log in again to their remaining authorized clinics. Linked doctors/resources
retain history; inactive/non-doctor memberships cannot receive new doctor bookings.

Email invitations, delivery, acceptance/recovery and new-user registration are deferred.
The UI states this limitation. Continue explicit local `npm run auth:provision` with
private interactive credentials; maintenance updates increment membership version and
revoke sessions. No known/default passwords or arbitrary global-user email lookup API.

`GET /api/v1/platform/me` is a separate authenticated PLATFORM_ADMIN-only foundation.
It returns only disabled capability flags, never clinic enumeration/private data.
A platform-only account sees a distinct read-only Arabic panel even without memberships.
There is no platform clinic create/activate/suspend endpoint or automatic clinic bypass.
No platform account/credential is provisioned automatically. A full operator workflow
needs controlled provisioning, MFA, scoped command authority, a global append-only audit,
last-owner/onboarding rules, support-access controls and deployment review first.

## Database audit and privileged limits

Four new tables use ENABLE/FORCE RLS with five explicit policies each. The existing
Clinic/Branding/Domain/Membership policies and column grants additionally restrict
writes to owner/admin. Runtime cannot write clinic status/global user IDs, forge
audit records, mutate audit heads, bypass RLS or change published bytes.

Fixed-path SECURITY DEFINER trigger functions validate metadata/role transitions,
publish only owned assets, append audit events and revoke affected sessions. Runtime
and PUBLIC cannot call those trigger functions directly. Narrow read helpers return
only administrative lock flags, approved public branding and published asset metadata.
All functions have fixed pg_catalog/pg_temp paths; no dynamic caller SQL or bypass GUC.
The architecture checker restricts identity writes to the administration repository;
features still cannot import raw Prisma/pg or manufacture verified principals.

Audit contains actor user/membership UUIDs, clinic sequence, action/target/time, changed
field names, before/after hashes and selected role/status/currency/timezone/slug changes.
Contact values, DNS secrets and binaries are not copied into audit payloads. Hashes use
SHA-256(previousHash + newline + exact stored JSON payload); the head/append is transactional.
Runtime can only read safe paginated audit projections. Maintenance operations are a
separate trusted boundary and are not automatically attributed as end-user changes.
There is no external signed/WORM checkpoint; table owners, superusers, compromised
application/runtime SQL or host-level access remain privileged threats. RLS is defense
in depth for supported APIs, not cryptographic proof of arbitrary custom settings.

## API surface

Base: `/api/v1/clinics/:clinicId/identity`. All writes require Origin/CSRF.

| Method / route | Permission / purpose |
| --- | --- |
| GET /profile; PATCH /profile | clinic.settings.read/update; whitelisted private business fields/version/explicit change acknowledgments |
| GET /branding; PATCH /branding | clinic.branding.read/update; approved colors/font/owned nullable asset IDs/version |
| POST /assets/:purpose | clinic.branding.update; LOGO/FAVICON, one validated multipart file |
| GET /assets/:assetId | clinic.branding.update; private own-clinic derivative |
| POST /assets/cleanup | clinic.branding.update; `{confirmUnpublishedOnly:true}` |
| PATCH /subdomain | clinic.settings.update; slug/expectedVersion; reservation only |
| GET /domains; POST /domains | clinic.settings.read/update; bounded list/create hostname |
| POST /domains/:domainId/challenge | clinic.settings.update; expectedVersion; rotate proof |
| POST /domains/:domainId/verify | clinic.settings.update; expectedVersion; DNS proof check |
| GET /members; PATCH /members/:membershipId | staff.read/manage; bounded cursor page; allowed role/status/expectedVersion |
| GET /audit | clinic.settings.read; bounded sequence cursor, action/hash/time only |

Members/audit pageSize is 1–50, default 20. Public routes: existing branding/health/queue,
plus GET `/api/v1/public/branding/assets/:assetId`. No private contact/staff API is public.
Platform foundation uses its own `/api/v1/platform/me` route.

Implementation references: [Sharp input validation and pixel limits](https://sharp.pixelplumbing.com/api-constructor/),
[NestJS guarded multipart uploads](https://docs.nestjs.com/techniques/file-upload),
[Node.js DNS Resolver](https://nodejs.org/docs/latest-v24.x/api/dns.html).
