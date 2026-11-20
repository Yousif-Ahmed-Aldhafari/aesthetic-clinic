# Lamssa — Operational Observability, Monitoring & Alerting Guide

**Milestone:** Phase 7, Step 7.5: Performance, Scalability, Reliability & Operational Validation  
**Date:** 2026-11-16  
**Auditor / Architect:** Lead Observability Architect, Healthcare Application Security Engineer & SRE  
**Branch:** `phase/7-production-readiness`  

---

## 1. Overview & Architecture

Lamssa provides comprehensive operational observability designed specifically for multi-tenant medical environments. The observability architecture balances deep visibility into performance, availability, and clinical safety with zero leakage of Protected Health Information (PHI) or Personally Identifiable Information (PII).

Key observability components:
1. **Prometheus Metrics Exposition** (`/api/v1/metrics`): Low-overhead, bounded-cardinality time-series metrics.
2. **Health & Readiness Endpoints** (`/api/v1/health`, `/api/v1/health/ready`): Multi-tier health indicators for load balancers and orchestrators.
3. **Automated Alerting Engine** (`AlertingService`): In-memory alert generation with automatic 15-minute deduplication and resolution tracking.
4. **Error Tracking & Aggregation** (`ErrorTrackerService`): Deterministic SHA-256 fingerprinting of operational errors without stack trace leakage to clients.
5. **Zero-PHI Structured Logging**: Canonical JSON logging with automated recursive redaction and IP truncation.

---

## 2. Prometheus Metrics & Cardinality Safety Boundaries

Prometheus metrics are exposed via `GET /api/v1/metrics`. The endpoint strictly enforces metric label cardinality boundaries to prevent memory exhaustion in high-throughput environments.

### Authentication & Authorization
- **Security Requirement**: Metrics are considered privileged infrastructure telemetry.
- **Allowed Access**:
  - Request with `x-metrics-key` matching `METRICS_API_KEY` environment secret.
  - Authenticated session with `PLATFORM_OPERATOR` role.
  - Clinic administrators, doctors, receptionists, and public visitors are strictly denied (`401 Unauthorized` or `403 Forbidden`).

### Exposed Metrics Inventory

| Metric Name | Type | Description | Labels / Cardinality Bound |
|:---|:---|:---|:---|
| `http_requests_total` | Counter | Total HTTP requests handled by the API | `method` (GET/POST/PATCH/DELETE), `status_class` (2xx, 4xx, 5xx), `route` (normalized pattern) |
| `http_request_duration_seconds` | Histogram | Request execution duration | `route`, `status_class` (Leap buckets: 5ms to 10s) |
| `active_connections` | Gauge | Current live connection count | None |
| `database_pool_active` | Gauge | Active PostgreSQL client pool connections | `pool` (`primary`) |
| `database_pool_idle` | Gauge | Idle PostgreSQL pool connections | `pool` (`primary`) |
| `database_pool_waiting` | Gauge | Pending connection acquisition queue | `pool` (`primary`) |
| `auth_failures_total` | Counter | Failed authentication and login attempts | `reason` (invalid_credentials, locked, mfa_required) |
| `emergency_break_glass_total` | Counter | Emergency medical break-glass invocations | `clinic_id` (UUID) |
| `financial_audit_chain_failures_total` | Counter | Detected SHA-256 financial audit hash mismatches | `clinic_id` |

### Strict Cardinality Safety Controls
To prevent high-cardinality label explosions:
- Dynamic IDs (UUIDs, patient numbers, invoice numbers) are **never** used as metric labels on request counters or latency histograms.
- Dynamic path parameters in routes (e.g., `/api/v1/clinics/:clinicId/patients/:patientId`) are normalized to static pattern tokens before labeling.
- User agents, request IPs, and query parameters are strictly forbidden in metric labels.

---

## 3. Health Monitoring & Readiness Probes

### 1. Liveness Probe (`GET /api/v1/health`)
- **Purpose**: Fast process liveness check for Kubernetes/Docker container orchestrators.
- **Checks**:
  - Node.js event loop responsiveness.
  - Process uptime and memory allocation bounds.
- **Response**: `200 OK` with JSON `{ "status": "ok", "timestamp": "..." }`.

### 2. Readiness Probe (`GET /api/v1/health/ready`)
- **Purpose**: Validates that all dependent backing services are operational before routing client traffic.
- **Checks**:
  - **PostgreSQL Connectivity**: Executes lightweight ping query `SELECT 1`.
  - **Prisma Connection State**: Verifies active connection pool.
  - **KMS Key Availability**: Confirms active cryptographic Master Encryption Key is loaded and usable.
- **Response Status Codes**:
  - `200 OK`: All subsystems ready to serve traffic.
  - `503 Service Unavailable`: Database unreachable or KMS key missing. Prevents requests from failing during startup or recovery.

---

## 4. Alerting Thresholds & Operational Rules

The built-in `AlertingService` continuously monitors telemetry and raises operational alerts according to predefined severity thresholds:

| Rule ID | Alert Severity | Trigger Condition | Automated Resolution Condition | Recommended Action |
|:---|:---:|:---|:---|:---|
| `HIGH_5XX_ERROR_RATE` | **Critical** | $> 5\%$ of requests return 5xx over a 5-minute sliding window | 5xx error rate drops below $1\%$ for 5 consecutive minutes | Inspect error tracker logs, database connection pool, and application restarts. |
| `DB_POOL_SATURATION` | **Warning** / **Critical** | Active pool connections $\ge 90\%$ for $> 30$ seconds; Waiting clients $> 5$ | Active pool drops below $70\%$; Queue clears | Check for slow queries, long-running uncommitted transactions, or connection leaks. |
| `AUTH_BRUTE_FORCE_SPIKE` | **Warning** | $> 20$ failed logins from an IP or targeting an account in 5 minutes | Zero failed attempts for 15 minutes | Verify rate limiter is enforcing IP throttling; inspect IP against threat feeds. |
| `EMERGENCY_BREAK_GLASS_SPIKE`| **Warning** | $> 3$ break-glass emergency accesses in a clinic within 1 hour | N/A (Manual Medical Director audit required) | Notify clinic Medical Director; ensure patient safety and clinical justification audit. |
| `FINANCIAL_HASH_MISMATCH` | **Critical** | Any failure in `FinancialAuditEvent` SHA-256 chain verification | N/A (Requires immediate security triage) | Freeze invoice updates; conduct forensic database audit for unauthorized modifications. |

---

## 5. Privacy & Zero-PHI Logging Enforcement

Operational logs are structured as single-line JSON objects output to `stdout`. Every log event is processed through rigorous automated sanitization pipelines:

### 1. Recursive Data Redaction (`redactSensitiveData`)
The logging interceptor and logger services automatically redact all sensitive fields across request bodies, query parameters, responses, and error objects:
- **Credentials & Keys**: `password`, `token`, `secret`, `authorization`, `cookie`, `apiKey`, `refreshToken`.
- **Protected Health Information (PHI)**: `patientName`, `fullName`, `nationalId`, `iqama`, `phone`, `email`, `medicalHistory`, `clinicalNotes`, `diagnosis`, `prescription`.
- **Financial Details**: `cardNumber`, `cvv`, `iban`, `accountNumber`.

### 2. Network Privacy Preservation
- Client IP addresses are never logged in full:
  - IPv4 addresses are truncated to `/24` subnet masks (e.g., `192.168.1.0/24`).
  - IPv6 addresses are truncated to `/64` prefix blocks.

### 3. Verification & Compliance
- Automatic unit tests (`observability.test.js`) and database integration tests verify that attempting to log objects containing PHI or credentials outputs `[REDACTED]` or `[FILTERED]`.
- Integration adapters (`base.adapter.ts`) sanitize all outbound request/response payloads before writing operational logs, guaranteeing zero-PHI transmission to log aggregators.

---

## 6. Phase 9 Enterprise Observability & Alert Routing Evolution (Step 9.1 & Step 9.5)

### Baseline Audit Finding: In-Memory Alerting Limitation
An independent audit of `apps/api/src/observability/alerting.service.ts` in Step 9.1 confirms that alert records are stored strictly in an in-memory `Map<string, AlertRecord>`. Consequently:
1. Active alert states and 15-minute deduplication tracking do not survive application container restarts.
2. Alert notifications are not dispatched to external channels (PagerDuty, Opsgenie, Webhook, SMS, Slack).
3. Alert delivery cannot be claimed as operationally effective until a live external delivery path is configured and tested.

### Target Architecture (Step 9.5 Deliverables)
- **Durable Alert Dispatch Engine**: `AlertingService` will be enhanced with an `AlertDispatcherService` supporting multi-channel webhook dispatch with retry queues, exponential backoff, and dead-letter logging.
- **Prometheus Alertmanager Integration**: Decouple metric evaluation from the application runtime by exporting standard Prometheus rules (`alerts.yaml`) evaluated independently by Alertmanager.
- **On-Call Escalation Matrix**: Critical alerts (P1: DB failure, RLS violation, KMS error, financial hash mismatch) route directly to PagerDuty/Opsgenie with automated phone/SMS paging. Warning alerts (P2) route to dedicated Slack/Teams operations channels.
- **Centralized Log Pipeline**: Ingestion sidecars (Fluentbit/Vector) streaming JSON logs from container `stdout` over TLS to managed OpenSearch / Loki / CloudWatch, combined with real-time DLP scanning.
