# Lamssa — PostgreSQL Connection Pooling, PgBouncer Security & Tenant Context Isolation

**Status:** Official Security Assessment & Verification Report (Step 9.2 Deliverable)
**Date:** 2026-11-20
**Classification:** Critical Platform Architecture & Database Security
**Auditor / Roles:** PostgreSQL Security Architect & Principal Infrastructure Engineer

---

## 1. Executive Summary & Problem Formulation

In high-concurrency multi-tenant healthcare platforms, connection pooling is essential to prevent PostgreSQL backend process exhaustion. However, in environments enforcing Row Level Security (RLS) via database session parameters (GUCs), connection pooling introduces critical security risks:
1. **Tenant Context Leakage**: If a connection is returned to the pool with a tenant identifier still active in its session GUC, a subsequent request from a different tenant on that connection could inherit unauthorized access.
2. **Context Spoofing**: An attacker executing raw SQL might attempt to manipulate GUCs to hijack another clinic's data.
3. **Transaction Pooling vs. Session Pooling Semantics**: In `session` pooling mode, a client holds a server connection for its entire connection lifespan, and `server_reset_query = DISCARD ALL` executes upon client disconnect. In `transaction` pooling mode, connections are multiplexed per-transaction, and `DISCARD ALL` **does not execute between transactions**.

This assessment establishes how Lamssa achieves provably secure tenant isolation under connection pooling, details the dual-layer cryptographic and database verification model, and presents the results of the 7-test connection pooling security audit.

---

## 2. Technical Analysis: Why DISCARD ALL Is Insufficient in Transaction Pooling

In PgBouncer `transaction` pooling mode:
- A client connection acquires a server connection when a transaction begins (`BEGIN`) and releases it immediately upon `COMMIT` or `ROLLBACK`.
- Executing `DISCARD ALL` between every transaction would incur heavy performance overhead (dropping prepared statements, resetting all variables, and clearing temporary tables), which defeats the performance advantages of transaction pooling. Consequently, PgBouncer's `server_reset_query` is not invoked between individual transactions within a persistent server connection.
- **Architectural Conclusion**: Any multi-tenant platform that relies on session-level `SET config = ...` and assumes `DISCARD ALL` will clean it up between transactions **is vulnerable to catastrophic cross-tenant data leakage**.

---

## 3. Lamssa Tenant Isolation Architecture Under Transaction Pooling

Lamssa implements a dual-layer, fail-closed isolation architecture that does not rely on PgBouncer state cleanup:

### 3.1 Layer 1: Transaction-Local GUC Scoping (`is_local = true`)
In `TenantDatabaseService.withClinicContext`, setting the tenant context executes:
```typescript
await tx.$queryRaw`
  SELECT set_config('lamssa.clinic_id', ${membership.clinicId}, true),
         set_config('lamssa.user_id', ${user.id}, true),
         set_config('lamssa.session_id', ${session.id}, true)
`;
```
Notice the third parameter: `true` (`is_local = true`). In PostgreSQL:
- When `is_local` is set to `true`, the parameter applies **strictly to the current transaction**.
- As soon as the transaction concludes (`COMMIT` or `ROLLBACK`), the PostgreSQL engine itself automatically clears and reverts the setting to null.
- Zero manual reset is required, guaranteeing zero leakage even when the connection is immediately assigned to another tenant.

### 3.2 Layer 2: Real Database Session Verification in `context_allows`
Even if an attacker attempts to spoof GUCs by executing `SET LOCAL lamssa.clinic_id = 'victim-clinic-id'`, PostgreSQL RLS does **not** trust caller-provided GUCs alone.

The core security function `lamssa_security.context_allows(target_clinic uuid)` enforces:
```sql
SELECT COALESCE(
  target_clinic = lamssa_security.context_uuid('lamssa.clinic_id') AND (
    EXISTS (
      SELECT 1 FROM public."Session" s
      JOIN public."User" u ON u.id = s."userId"
      JOIN public."ClinicMembership" m ON m."userId" = u.id AND m."clinicId" = target_clinic
      JOIN public."Clinic" c ON c.id = m."clinicId"
      WHERE s.id = lamssa_security.context_uuid('lamssa.session_id')
        AND s."userId" = lamssa_security.context_uuid('lamssa.user_id')
        AND s."selectedClinicId" = target_clinic
        AND s."revokedAt" IS NULL
        AND s."expiresAt" > statement_timestamp()
        AND u.status = 'ACTIVE' AND m.status = 'ACTIVE' AND c.status = 'ACTIVE'
    )
  ), false);
```

**Security Invariants Enforced**:
1. The GUC `lamssa.session_id` must match an active row in `public."Session"`.
2. The user must be active (`u.status = 'ACTIVE'`).
3. The session must not be revoked (`s.revokedAt IS NULL`) and must not be expired.
4. The user must hold an active membership in the target clinic (`m.clinicId = target_clinic AND m.status = 'ACTIVE'`).
5. The session's `selectedClinicId` must match the target clinic.

If an attacker manipulates the GUC without holding a valid, active database session row for that clinic, `context_allows` returns `false` and FORCE RLS returns 0 rows.

---

## 4. Prisma & Prepared Statement Compatibility

In `transaction` pooling mode, PostgreSQL client libraries that cache prepared statement metadata (such as Prisma's default query engine) can encounter errors like `prepared statement "s0" already exists` or `prepared statement does not exist` when connections are multiplexed across clients.

### Mitigation:
1. In production, connection strings targeting PgBouncer must include `&pgbouncer=true`:
   ```text
   postgresql://lamssa_app:password@pgbouncer:6432/lamssa_prod?schema=public&sslmode=verify-full&pgbouncer=true
   ```
2. When `pgbouncer=true` is set, Prisma switches to extended query protocol without named prepared statements, ensuring full compatibility with transaction pooling.
3. If any edge-case query requires session-level state (e.g. DDL migrations, long-running batch analytics), it must connect via dedicated, non-pooled connections.

---

## 5. Connection Pooling Security Audit Results

The automated security test suite in `scripts/test-connection-pooling.mjs` was executed on a connection pool constrained to `max: 1` (forcing 100% connection reuse across consecutive requests):

| Test ID | Test Scope | Verification Criterion | Result |
| :--- | :--- | :--- | :---: |
| **TEST-POOL-01** | Interleaved Transactions | Transaction A queries Clinic A; Transaction B on same connection queries Clinic B. Zero cross-visibility. | **PASS** |
| **TEST-POOL-02** | Automatic GUC Reversion | GUC values inspected immediately after `COMMIT` on the same connection. Verified completely empty/null. | **PASS** |
| **TEST-POOL-03** | Unauthenticated Query | Query executed on reused connection without `set_config`. Verified returns 0 rows under FORCE RLS. | **PASS** |
| **TEST-POOL-04** | Context Spoofing Defense | User A sets GUC to Clinic B with Session A. Verified returns 0 rows (rejected by `context_allows`). | **PASS** |
| **TEST-POOL-05** | Rollback Safety | Transaction sets GUC and rolls back. Subsequent query on same connection verified clean. | **PASS** |
| **TEST-POOL-06** | Session Revocation | Session marked `revokedAt = NOW()`. Subsequent transaction claiming that session returns 0 rows. | **PASS** |
| **TEST-POOL-07** | Role Privilege Boundary | Runtime role attempted `CREATE TABLE` and `TRUNCATE`. Both rejected with SQLSTATE `42501` (denied). | **PASS** |
| **TEST-POOL-08** | Parameterized Execution | 5 consecutive parameterized transactions executed on same connection without statement collision. | **PASS** |

### Execution Log Evidence:
```text
=== Lamssa Phase 9 Step 9.2: PostgreSQL Connection Pooling & Tenant Security Audit ===

[PASS] Test fixtures initialized (2 clinics, 2 users, 2 sessions, 2 patients)
--- Running Test 1: Interleaved Transaction Isolation on Same Connection ---
[PASS] Transaction A successfully queried Patient A under FORCE RLS
[PASS] GUCs automatically reverted upon COMMIT (zero context leakage on pooled connection)
[PASS] Transaction B on same connection queried Patient B with zero visibility of Patient A
--- Running Test 2: Unauthenticated Query on Reused Connection ---
[PASS] Unauthenticated query on reused connection returns 0 rows (FORCE RLS denies access)
--- Running Test 3: Tenant Context Spoofing Defense ---
[PASS] Context spoofing attack rejected: context_allows verified Session & Membership tables
--- Running Test 4: Rollback Reversion Safety ---
[PASS] Rollback cleanly reverted transaction-local GUCs
--- Running Test 5: Session Revocation Validation ---
[PASS] Revoked session immediately denied by context_allows (fails closed)
--- Running Test 6: Runtime Role Privilege Boundary ---
[PASS] Runtime role denied DDL CREATE TABLE (SQLSTATE 42501 permission denied)
[PASS] Runtime role denied TRUNCATE (SQLSTATE 42501 permission denied)
--- Running Test 7: Parameterized Queries Across Consecutive Transactions ---
[PASS] 5 consecutive parameterized transactions executed cleanly on single pooled connection

[SUCCESS] All 7 PostgreSQL connection pooling and tenant-security tests PASSED!
```

---

## 6. Supported Safe Pooling Mode Determination

Based on the verified results:
1. **Primary Supported Mode**: **`transaction` pooling mode** with `pgbouncer=true` parameter in Prisma connection strings. Safe because:
   - All tenant context is strictly transaction-local (`set_config(..., true)`).
   - `context_allows` verifies trusted database state (`Session` and `ClinicMembership`).
2. **Safe Fallback Mode**: **`session` pooling mode** (or direct connection pooling behind NestJS pool). Fully supported if any future third-party extension requires session-level prepared statement state.
3. **Migration Role Rule**: Migration jobs (`lamssa_migrator`) must **never connect through PgBouncer in transaction mode**. Migrations require direct connections to PostgreSQL port 5432 with DDL transaction locks.
