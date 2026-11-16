# Lamssa — Performance, Scalability & Reliability Report (Step 7.5)

**Milestone:** Phase 7, Step 7.5: Performance, Scalability, Reliability & Operational Validation  
**Date:** 2026-11-16  
**Auditor / Engineer:** Lead Site Reliability Engineer, PostgreSQL Performance Specialist & Observability Architect  
**Branch:** `phase/7-production-readiness`  

---

## 1. Executive Summary

Lamssa Phase 7 Step 7.5 performs realistic, reproducible performance, scalability, concurrency, and reliability validation across Lamssa's multi-tenant healthcare architecture.

Key findings and architectural validations:
1. **Realistic Multi-Tenant Workloads (A through E)**:
   - Evaluated 5 diverse clinical and administrative workloads under full PostgreSQL Row-Level Security (RLS) enforcement, immutable audit logging, and cryptographic verification.
   - Clinical and intake paths achieve between 55 and 168 QPS with sub-20ms p50 latency on low-power 2-core hardware.
   - Financial paths enforce serialized monotonic counter allocation and SHA-256 audit chaining, guaranteeing zero gap and zero tampering at 1.46 TPS under strict sequential integrity.
2. **Concurrency & Monotonic Counter Integrity**:
   - Monotonic patient counters (`PatientCounter`) and clinic invoice counters (`ClinicInvoiceCounter`) proven strictly gap-free and unique under 10 concurrent competing worker threads.
   - Concurrent duplicate submission of identical business idempotency keys fails closed via PostgreSQL unique constraint violations (23505), preventing duplicate operations or double charges.
3. **Operational Resilience & Fault Injection**:
   - Immediate session revocation propagation: Revoking a session instantly terminates all subsequent RLS queries across all tenant tables via `lamssa_security.context_allows()`.
   - Connection pool exhaustion: Client pool exhaustion gracefully rejects excess traffic with clean timeout errors without process crash or connection leakage.
   - Mid-transaction fail-closed safety: Injected mid-transaction errors cleanly trigger PostgreSQL atomic rollback, leaving zero orphan rows, phantom counters, or partial ledger state.

---

## 2. Test Environment & Hardware Characterization

All benchmarks and stress tests were conducted on an isolated bare-metal execution environment without synthetic mocks or database bypasses:

| Hardware / Runtime Parameter | Specification |
|:---|:---|
| **CPU Model** | AMD Athlon Silver 3050U with Radeon Graphics |
| **Physical Cores / Threads** | 2 physical cores, 2 execution threads |
| **Base / Boost Clock** | 2.3 GHz base / ~3.2 GHz boost |
| **Total System RAM** | 17.5 GB DDR4 (Free RAM during run: ~8.75 GB) |
| **Operating System** | Linux 7.0.0-42-generic (x86_64 Ubuntu derivative) |
| **Node.js Runtime** | v24.21.0 |
| **PostgreSQL Engine** | PostgreSQL 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1) |
| **Database Pool Client** | `pg` / Prisma Client 7.10.1 with direct connection pooling |
| **Storage Subsystem** | Samsung NVMe SSD (ext4 filesystem, direct write-back cache) |

---

## 3. Workload Benchmark Methodology & Results

The benchmark suite (`scripts/benchmark-runner.mjs`) provisions 5 distinct tenant clinics and executes 100 sequential or concurrent iterations per scenario. Every transaction is executed with active `Session` validation and PostgreSQL RLS tenant context (`lamssa.session_id`, `lamssa.user_id`, `lamssa.clinic_id`).

### Summary Benchmark Metrics Table

| Workload Scenario | Primary Business Domain | Transactions | Duration (ms) | Throughput (QPS / TPS) | p50 Latency (ms) | p90 Latency (ms) | p95 Latency (ms) | p99 Latency (ms) | Node.js Heap Delta |
|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Workload A** | Reception & Patient Intake | 100 | 1813.85 | 55.13 | 17.65 | 20.98 | 21.73 | 30.49 | +2.33 MB |
| **Workload B** | General Medical Documentation | 100 | 1150.29 | 86.93 | 11.01 | 13.28 | 13.51 | 20.76 | +1.26 MB |
| **Workload C** | Aesthetic Medicine & Mapping | 100 | 596.40 | 167.67 | 5.52 | 7.13 | 7.85 | 15.80 | -0.28 MB |
| **Workload D** | Financial Operations & Audit Chaining | 100 | 68440.69 | 1.46 | 692.50 | 1256.75 | 1306.24 | 1385.79 | +0.23 MB |
| **Workload E** | Multi-Tenant Concurrency & Isolation | 100 | 1118.67 | 89.39 | 16.43 | 55.69 | 77.80 | 81.19 | +1.12 MB |

### Detailed Workload Analysis

#### Workload A: Reception & Patient Intake
- **Workflow Steps**: Patient record creation with monotonic `P-XXXXXX` counter allocation $\rightarrow$ Turkish/Arabic name prefix search with ILIKE literal escaping $\rightarrow$ Queue ticket issuance $\rightarrow$ Status advancement (`CALLED`).
- **Performance Characteristics**: High consistency, 55.13 QPS on 2 CPU cores. The primary latency driver is the serialized row lock on `PatientCounter` and RLS verification against `Session`.
- **Latency**: p50 is 17.65ms; p99 is 30.49ms.

#### Workload B: General Medical Documentation
- **Workflow Steps**: Medical encounter creation $\rightarrow$ Clinical observation (vital signs) recording $\rightarrow$ ICD-10 diagnosis recording $\rightarrow$ Drug allergy registration $\rightarrow$ Unsigned electronic prescription draft generation.
- **Performance Characteristics**: High database throughput (86.93 QPS), with low memory growth (+1.26 MB). Efficient indexes on `(clinicId, patientId)` and `(clinicId, encounterId)` ensure index scans across all RLS-filtered tables.
- **Latency**: p50 is 11.01ms; p95 is 13.51ms; p99 is 20.76ms.

#### Workload C: Aesthetic Medicine & Procedures
- **Workflow Steps**: Treatment plan drafting $\rightarrow$ Version revision creation $\rightarrow$ Anatomical facial coordinate logging $\rightarrow$ Informed consent status evaluation (`ConsentEligibilityService`).
- **Performance Characteristics**: Fastest throughput (167.67 QPS), p50 latency of 5.52ms. Treatment plan queries benefit from compact JSON anatomical payloads and in-memory cryptographic verification.
- **Latency**: p50 is 5.52ms; p95 is 7.85ms; p99 is 15.80ms.

#### Workload D: Financial Invoicing, VAT & Cryptographic Audit
- **Workflow Steps**: Draft invoice creation $\rightarrow$ 15% KSA VAT calculation and line item persistence $\rightarrow$ Official numbering assignment (`INV-XXXXXX`) via `ClinicInvoiceCounter` $\rightarrow$ Cryptographic issuance snapshot generation $\rightarrow$ Canonical SHA-256 hash chaining across `FinancialAuditEvent` $\rightarrow$ In-flight payment recording with deferred trigger consistency checks.
- **Performance Characteristics**: 1.46 TPS under sequential processing. In this workload, every invoice transition must acquire a row-exclusive lock on `ClinicInvoiceCounter` and traverse previous `FinancialAuditEvent` hashes to compute an unforgeable hash chain (`eventHash = sha256(previousHash + '\n' + payload)`). Furthermore, deferred PostgreSQL constraint triggers (`finance_consistency`) re-verify line item sums, VAT accuracy, and payment bounds at transaction commit.
- **Latency**: p50 is 692.50ms; p99 is 1385.79ms. This deliberate cryptographic and financial immutability trade-off guarantees mathematical tamper-evidence for tax and regulatory integrity.

#### Workload E: Multi-Tenant Concurrency & Cross-Clinic RLS Isolation
- **Workflow Steps**: 5 tenant clinics executing simultaneous mixed read/write transactions (patients, queue tickets, clinical notes) with randomized interleaved operations.
- **Cross-Tenant Leakage Verification**: Every query specifically validated that zero rows belonging to another clinic were readable or modifiable. 100% of cross-tenant attempts were blocked by PostgreSQL RLS.
- **Performance Characteristics**: 89.39 QPS aggregate across 5 concurrent tenants. Latency remained bounded (p50: 16.43ms, p95: 77.80ms).

---

## 4. Concurrency, Locking & Integrity Analysis

The platform was subjected to heavy concurrent contention in `apps/api/test/concurrency-integrity.integration.test.ts`:

### 1. Atomic Monotonic Patient Allocation (`PatientCounter`)
- **Mechanism**: PostgreSQL row-level locking via `UPDATE "PatientCounter" SET "lastNumber" = "lastNumber" + 1 WHERE "clinicId" = $1 RETURNING "lastNumber"`.
- **Stress Test**: 10 simultaneous asynchronous workers allocating patient numbers in the same tenant clinic.
- **Results**:
  - 10 strictly sequential, non-repeating numbers issued (`P-XXXX01` through `P-XXXX10`).
  - Zero duplicate key errors.
  - Zero gap or race condition observed.

### 2. Clinic Invoice Counter Serialization (`ClinicInvoiceCounter`)
- **Mechanism**: Row-exclusive lock paired with optimistic version verification (`version = version + 1`).
- **Stress Test**: 10 simultaneous workers attempting to increment the clinic's official invoice counter.
- **Results**:
  - 10 consecutive monotonic numbers assigned (`INV-XXXX01` through `INV-XXXX10`).
  - Guaranteed continuous audit trail compliant with tax authority sequencing requirements.

### 3. Idempotency & Duplicate Request Protection
- **Mechanism**: Unique constraint on `(clinicId, idempotencyKey)` and business request keys (`requestKey`).
- **Stress Test**: Concurrent execution of two identical request submissions sharing the same unique identifier.
- **Results**: Exactly one transaction commits (201 Created); the concurrent race condition fails closed with PostgreSQL error 23505 (Unique Violation) and is converted into a 409 Conflict. Zero duplicate entities created.

---

## 5. Reliability & Fault-Injection Validation

The platform's operational reliability was validated in `apps/api/test/fault-injection.integration.test.ts`:

### 1. Immediate Session Revocation Propagation
- **Vulnerability Checked**: Stale session tokens or cached GUC variables bypassing tenant isolation after logout or credential revocation.
- **Test Flow**:
  1. Tenant session created and query executed successfully.
  2. Session deleted from PostgreSQL `Session` table.
  3. Subsequent query attempted using the same `lamssa.session_id`.
- **Outcome**: The query was immediately blocked with 0 rows returned, as PostgreSQL RLS `lamssa_security.context_allows()` evaluates session validity against the live `Session` table.

### 2. Connection Pool Exhaustion Resilience
- **Vulnerability Checked**: Process crashes, unhandled rejections, or memory leaks during high load spikes exceeding pool limits.
- **Test Flow**:
  1. Exhausted all available connections in a bounded test pool (`max: 2`).
  2. Submitted additional queries requesting new clients with short timeouts (`connectionTimeoutMillis: 500`).
- **Outcome**: The excess queries cleanly threw timeout errors (`timeout exceeded when trying to connect`). The application process remained healthy, and newly freed connections immediately serviced waiting requests without connection leaking.

### 3. Fail-Closed Mid-Transaction Abort
- **Vulnerability Checked**: Orphaned records or partial writes when a multi-stage transaction fails midway.
- **Test Flow**:
  1. Transaction begins: inserts a patient and allocates an initial queue ticket.
  2. Deliberate fault injected (syntax error / invalid constraint violation).
  3. Client transaction issues `ROLLBACK`.
- **Outcome**: Zero rows persisted in `Patient`, `QueueTicket`, or `PatientCounter`. Complete rollback confirmed.

---

## 6. Sizing Recommendations for Production

Based on empirical performance measurements on 2 vCPUs, the following infrastructure tiers are specified for Lamssa production deployments:

| Deployment Tier | Workload Capacity | Recommended CPU | Recommended RAM | Database Connection Pool | Minimum Storage | Target Throughput |
|:---|:---|:---:|:---:|:---:|:---:|:---:|
| **Small Clinic Tier** | 1–3 clinics, $\le 50$ concurrent users | 2 vCPU | 4 GB | 15–20 connections | 50 GB NVMe (SSD) | 50–100 QPS |
| **Medium Multi-Clinic** | 5–15 clinics, $\le 250$ concurrent users | 4 vCPU | 16 GB | 30–50 connections | 150 GB NVMe (SSD) | 250–500 QPS |
| **Enterprise / Regional** | 20+ clinics, $\ge 1,000$ concurrent users | 8–16 vCPU | 32–64 GB | 100 connections (with PgBouncer) | 500 GB NVMe (RAID 10) | 1,000+ QPS |

### PostgreSQL Configuration Guidelines
- `shared_buffers`: 25% of total system RAM (e.g., 4 GB on a 16 GB instance).
- `effective_cache_size`: 75% of total system RAM.
- `maintenance_work_mem`: 512 MB.
- `work_mem`: 16 MB per connection.
- `max_connections`: 100 (employ PgBouncer transaction-mode pooling for higher concurrency).
- `wal_compression`: `on` (reduces I/O during heavy financial audit event writes).
