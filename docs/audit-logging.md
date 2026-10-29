# Centralized Audit Logging Architecture & Policy

## 1. Overview & Objectives

Lamssa enforces an immutable, append-only centralized audit trail for operationally and security-sensitive events across all tenant clinics and the platform foundation. The audit logging system guarantees:
- **Traceability**: All authentication, administrative, financial, clinical record changes, scheduling, and queue mutations are recorded with actor, tenant, timestamp, and context.
- **Tenant Isolation**: PostgreSQL Row Level Security (RLS) strictly segregates audit logs per clinic. Clinic administrators and owners can only read audit events for their own tenant.
- **Append-Only Immutability**: Neither normal clinic members nor runtime database roles can modify (`UPDATE`) or delete (`DELETE`) audit records. Immutability is enforced via PostgreSQL trigger and privilege restrictions.
- **Privacy & Redaction (PHI & Secret Hygiene)**: Passwords, authentication tokens, session cookies, CSRF tokens, credit card numbers, CVVs, national identification numbers, and sensitive clinical notes are systematically stripped and redacted before audit records are persisted.
- **Transactional & Out-of-Band Resilience**: Successful business mutations record audit entries atomically inside their interactive tenant transactions. Security-sensitive failures (e.g., failed logins, unauthenticated requests, 403 access denials, and rate-limit violations) are recorded out-of-band via a hardened `SECURITY DEFINER` function without leaking or aborting.

---

## 2. Event Taxonomy & Categories

Audit events are classified into explicit categories using the `AuditCategory` enum:

| Category | Typical Events | Description |
|---|---|---|
| `AUTH` | `auth.login`, `auth.failed_login`, `auth.logout`, `auth.rotate`, `auth.session_revoked` | Authentication lifecycle and session rotations. |
| `IDENTITY` | `identity.profile_update`, `identity.branding_update`, `identity.domain_create`, `identity.domain_verify` | Clinic profile, white-label branding, subdomain, and custom domains. |
| `STAFF` | `staff.invite`, `staff.role_change`, `staff.status_change`, `staff.deactivate` | Clinic membership, role assignment, and administrative lifecycle. |
| `PATIENTS` | `patients.create`, `patients.update`, `patients.status_change` | Administrative patient management (non-PHI demographic updates). |
| `SCHEDULING` | `appointments.create`, `appointments.reschedule`, `appointments.cancel`, `resource.update` | Doctor and room bookings, calendar management, and availability. |
| `QUEUE` | `queue.ticket_issue`, `queue.call_next`, `queue.transfer`, `queue.visit_complete` | Real-time queue ticketing, calling, transfers, and consultations. |
| `FINANCE` | `billing.invoice_issued`, `billing.payment_received`, `billing.payment_reversed`, `billing.invoice_voided` | Invoicing, payments, and refunds (linked to financial audit chain). |
| `SECURITY` | `security.access_denied`, `security.unauthenticated_access`, `security.rate_limited` | 401/403/429 rejections captured by exception filters. |
| `PLATFORM` | `platform.clinic_provision`, `platform.maintenance_lock` | Platform administrator operational actions. |

---

## 3. Data Schema & Model

The `AuditEvent` model is defined in `prisma/schema.prisma` and backed by PostgreSQL table `AuditEvent`:

```prisma
model AuditEvent {
  id            String         @id @default(uuid()) @db.Uuid
  clinicId      String?        @db.Uuid
  actorId       String?        @db.Uuid
  actorEmail    String?        @db.VarChar(255)
  action        String         @db.VarChar(64)
  category      AuditCategory
  targetType    String?        @db.VarChar(64)
  targetId      String?        @db.VarChar(64)
  outcome       AuditOutcome   @default(SUCCESS)
  correlationId String?        @db.VarChar(64)
  ipAddress     String?        @db.VarChar(64)
  userAgent     String?        @db.VarChar(255)
  metadata      Json?
  createdAt     DateTime       @default(now()) @db.Timestamptz(3)

  clinic        Clinic?        @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  actor         User?          @relation(fields: [actorId], references: [id], onDelete: SetNull)

  @@index([clinicId, createdAt(sort: Desc)])
  @@index([clinicId, category, createdAt(sort: Desc)])
  @@index([clinicId, action, createdAt(sort: Desc)])
  @@index([correlationId])
}
```

### Outcomes
- `SUCCESS`: Mutation completed and committed.
- `DENIED`: Access blocked by RBAC or security guards.
- `FAILURE`: Operation rejected due to conflict or validation failure.

---

## 4. Redaction & Privacy Policy

All event metadata passes through `sanitizeAuditMetadata()` before persistence:
1. **Redacted Key Patterns**: Any object property matching `/password|secret|token|hash|cookie|csrf|authorization|card|cvv|pan|nationalid|ssn|diagnosis|treatmentnotes|symptoms|prescription/i` is immediately replaced with `"[REDACTED]"`.
2. **Value Redaction**: Any string value resembling a 13-19 digit credit card number (Luhn candidate) is replaced with `"[REDACTED_CARD]"`.
3. **Payload Truncation**: String fields exceeding 1,024 characters are truncated with an ellipsis to prevent denial-of-service via oversized log bodies.
4. **Depth Bounds**: Recursive sanitization traverses up to 8 levels of nested JSON objects and arrays.

---

## 5. Security Architecture & RLS Enforcement

### Immutability Trigger
```sql
CREATE OR REPLACE FUNCTION lamssa_security.reject_audit_mutation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' AND (current_user = 'lamssa_dev_migrator' OR current_user = 'lamssa_test_migrator' OR current_user = 'postgres') THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Audit records are append-only and immutable' USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON public."AuditEvent"
FOR EACH ROW EXECUTE FUNCTION lamssa_security.reject_audit_mutation();
```

### Row Level Security Policies
- `FORCE ROW LEVEL SECURITY`: Enabled on `AuditEvent` to prevent bypass even if table permissions are modified.
- `tenant_select`: Permits reading rows only where `clinicId` matches `lamssa_security.context_allows("clinicId")`.
- `tenant_insert`: Permits appending records for the active verified tenant context.
- `tenant_update` / `tenant_delete`: Hardcoded to `USING (false) WITH CHECK (false)`.

### Direct Out-of-Band Security Definer
For unauthenticated requests, failed logins, or exceptions outside a valid tenant transaction, `lamssa_security.record_audit_event(...)` executes as `SECURITY DEFINER` with fixed `search_path = pg_catalog, pg_temp`, recording the audit entry safely without elevating application credentials.

---

## 6. Audit API & Frontend Integration

### Protected Endpoint
`GET /api/v1/clinics/:clinicId/audit/events`
- **Guarded**: Requires `audit.read` permission (`CLINIC_OWNER` and `CLINIC_ADMIN`).
- **Filters**:
  - `category`: Filter by `AuditCategory` (e.g. `AUTH`, `FINANCE`, `STAFF`).
  - `action`: Exact action matching.
  - `actorId`: Actor user UUID.
  - `from` / `to`: ISO 8601 date bounds.
- **Keyset Pagination**: Bounded pagination using `pageSize` (default 50, max 100) and `cursor` (event UUID).

### Arabic RTL User Interface
In `ClinicSettings.tsx`:
- Owners and admins can toggle between **Unified Central Audit** and **Identity Hash Chain**.
- Displays Arabic labels, action tags, localized timestamps, actor email, and sanitized JSON metadata modal.

---

## 7. Privileged Administrator Boundaries

While application roles and PostgreSQL runtime users are strictly prohibited from mutating audit records:
- Superusers (`postgres`) and migrator maintenance roles hold database administrative authority required for migrations and maintenance.
- DBA protections are enforced outside the database engine via encrypted off-site backups, write-once storage (WORM), and separation of cloud provider credentials.
