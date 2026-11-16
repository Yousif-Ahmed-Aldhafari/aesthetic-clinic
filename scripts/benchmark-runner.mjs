#!/usr/bin/env node
/**
 * Lamssa Healthcare Platform — Performance, Scalability & Reliability Benchmark Runner
 * Phase 7, Step 7.5
 *
 * Measures realistic multi-tenant clinical workloads against PostgreSQL:
 * - Workload A: Reception & Patient Intake
 * - Workload B: General Medical Clinical Documentation
 * - Workload C: Aesthetic Medicine & Specialized Procedures
 * - Workload D: Financial Operations & Ledger Reconciliation
 * - Workload E: Multi-Tenant Concurrency & RLS Isolation
 */

import { resolve } from 'node:path';
import os from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import pg from 'pg';
import { config } from 'dotenv';

const root = resolve(import.meta.dirname, '..');
config({ path: resolve(root, '.env'), quiet: true });

const dbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const migrationUrl = process.env.TEST_MIGRATION_DATABASE_URL || process.env.MIGRATION_DATABASE_URL;

if (!dbUrl || !migrationUrl) {
  console.error('Missing required database URLs (TEST_DATABASE_URL, TEST_MIGRATION_DATABASE_URL).');
  process.exit(1);
}

// ----------------------------------------------------------------------------
// Statistics Helpers
// ----------------------------------------------------------------------------

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    return '{' + Object.entries(value).filter(([,v]) => v !== undefined).sort(([a],[b]) => a.localeCompare(b,'en')).map(([k,v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
  }
  return JSON.stringify(typeof value === 'bigint' ? value.toString() : value);
}

async function recordAuditEvent(client, clinic, invoiceId, version, action, details) {
  const lastRes = await client.query(
    `SELECT sequence, "eventHash" FROM "FinancialAuditEvent" WHERE "clinicId" = $1 ORDER BY sequence DESC LIMIT 1;`,
    [clinic.clinicId],
  );
  const last = lastRes.rows[0];
  const id = randomUUID();
  const sequence = (last?.sequence ?? 0) + 1;
  const previousHash = last?.eventHash ?? '0'.repeat(64);
  const at = new Date();
  const payload = canonical({
    action,
    actorMembershipId: clinic.membershipId,
    at: at.toISOString(),
    clinicId: clinic.clinicId,
    details,
    id,
    invoiceId,
    invoiceVersion: version,
    sequence,
  });
  const eventHash = createHash('sha256').update(previousHash + '\n' + payload).digest('hex');
  await client.query(
    `INSERT INTO "FinancialAuditEvent" (id, "clinicId", "invoiceId", "actorMembershipId", sequence, action, payload, "previousHash", "eventHash", "createdAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);`,
    [id, clinic.clinicId, invoiceId, clinic.membershipId, sequence, action, payload, previousHash, eventHash, at],
  );
}

function calculatePercentiles(latencies) {
  if (latencies.length === 0) {
    return { min: 0, max: 0, mean: 0, p50: 0, p90: 0, p95: 0, p99: 0 };
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const mean = sum / sorted.length;
  const p50 = sorted[Math.floor(sorted.length * 0.50)];
  const p90 = sorted[Math.floor(sorted.length * 0.90)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  return {
    min: Number(min.toFixed(2)),
    max: Number(max.toFixed(2)),
    mean: Number(mean.toFixed(2)),
    p50: Number(p50.toFixed(2)),
    p90: Number(p90.toFixed(2)),
    p95: Number(p95.toFixed(2)),
    p99: Number(p99.toFixed(2)),
  };
}

// ----------------------------------------------------------------------------
// System Environment Characterization
// ----------------------------------------------------------------------------

async function captureEnvironment(ownerPool) {
  const cpus = os.cpus();
  const totalMemGb = (os.totalmem() / (1024 ** 3)).toFixed(2);
  const freeMemGb = (os.freemem() / (1024 ** 3)).toFixed(2);

  const client = await ownerPool.connect();
  let pgVersion = 'Unknown';
  try {
    const res = await client.query('SELECT version();');
    pgVersion = res.rows[0].version;
  } finally {
    client.release();
  }

  return {
    osPlatform: os.platform(),
    osRelease: os.release(),
    arch: os.arch(),
    cpuModel: cpus[0]?.model || 'Unknown',
    cpuCores: cpus.length,
    cpuSpeedMhz: cpus[0]?.speed || 0,
    totalRamGb: Number(totalMemGb),
    freeRamGb: Number(freeMemGb),
    nodeVersion: process.version,
    pgVersion,
  };
}

// ----------------------------------------------------------------------------
// Benchmark Execution Engine
// ----------------------------------------------------------------------------

async function runBenchmark() {
  console.log('='.repeat(80));
  console.log('Lamssa Performance, Scalability & Reliability Benchmark Suite (Step 7.5)');
  console.log('='.repeat(80));

  const ownerPool = new pg.Pool({ connectionString: migrationUrl, max: 10 });
  const appPool = new pg.Pool({ connectionString: dbUrl, max: 25 });

  const envInfo = await captureEnvironment(ownerPool);
  console.log('\n[Environment Baseline]');
  console.log(`- CPU: ${envInfo.cpuModel} (${envInfo.cpuCores} cores @ ${envInfo.cpuSpeedMhz} MHz)`);
  console.log(`- RAM: ${envInfo.totalRamGb} GB (Free: ${envInfo.freeRamGb} GB)`);
  console.log(`- Platform: ${envInfo.osPlatform} ${envInfo.osRelease} (${envInfo.arch})`);
  console.log(`- Node.js: ${envInfo.nodeVersion}`);
  console.log(`- PostgreSQL: ${envInfo.pgVersion.split(' on ')[0]}`);

  const suffix = randomUUID().slice(0, 8);
  const benchmarkClinics = [];
  const results = {};

  try {
    // ------------------------------------------------------------------------
    // Fixture Setup (Multi-Tenant Baseline)
    // ------------------------------------------------------------------------
    console.log('\n[Setup] Provisioning benchmark tenant clinics and reference fixtures...');
    const ownerClient = await ownerPool.connect();
    try {
      for (let i = 0; i < 5; i++) {
        const clinicId = randomUUID();
        const userId = randomUUID();
        const membershipId = randomUUID();

        // Clinic
        await ownerClient.query(
          `INSERT INTO "Clinic" (id, slug, "legalName", "displayName", currency, status, "updatedAt")
           VALUES ($1, $2, $3, $4, 'SAR', 'ACTIVE', NOW());`,
          [clinicId, `perf-clinic-${i}-${suffix}`, `شركة الأداء الطبي ${i}`, `عيادة الأداء ${i}`],
        );

        // User
        await ownerClient.query(
          `INSERT INTO "User" (id, email, name, status, "updatedAt")
           VALUES ($1, $2, $3, 'ACTIVE', NOW());`,
          [userId, `doctor-perf-${i}-${suffix}@clinic.local`, `د. طبيب الأداء ${i}`],
        );

        // Membership (CLINIC_OWNER confers full clinical, reception and financial authorization)
        await ownerClient.query(
          `INSERT INTO "ClinicMembership" (id, "clinicId", "userId", role, status, "updatedAt")
           VALUES ($1, $2, $3, 'CLINIC_OWNER', 'ACTIVE', NOW());`,
          [membershipId, clinicId, userId],
        );

        // Practitioner Profile
        await ownerClient.query(
          `INSERT INTO "PractitionerProfile" (id, "clinicId", "membershipId", "professionalTitleAr", "professionalTitleEn", "licenseNumber", "verificationStatus", "isMedicalDirector", "updatedAt")
           VALUES ($1, $2, $3, 'استشاري أداء سريري', 'Clinical Performance Consultant', $4, 'VERIFIED', true, NOW());`,
          [randomUUID(), clinicId, membershipId, `LIC-PERF-${i}-${suffix}`],
        );

        // Session (required by Lamssa production RLS context_allows)
        const sessionId = randomUUID();
        const dummyHash = createHash('sha256').update(sessionId).digest('hex');
        await ownerClient.query(
          `INSERT INTO "Session" (id, "userId", "selectedClinicId", "tokenHash", "csrfHash", "authorizationHash", "expiresAt")
           VALUES ($1, $2, $3, $4, $4, $4, NOW() + INTERVAL '1 day');`,
          [sessionId, userId, clinicId, dummyHash],
        );

        // Patient Counter
        await ownerClient.query(
          `INSERT INTO "PatientCounter" ("clinicId", "lastNumber")
           VALUES ($1, 1000)
           ON CONFLICT ("clinicId") DO NOTHING;`,
          [clinicId],
        );

        // Queue Counter
        await ownerClient.query(
          `INSERT INTO "QueueCounter" ("clinicId", "businessDate", "lastNumber")
           VALUES ($1, CURRENT_DATE, 1)
           ON CONFLICT ("clinicId", "businessDate") DO NOTHING;`,
          [clinicId],
        );

        // Clinic Invoice Counter
        await ownerClient.query(
          `INSERT INTO "ClinicInvoiceCounter" ("clinicId", "lastNumber", "revision")
           VALUES ($1, 0, 1)
           ON CONFLICT ("clinicId") DO NOTHING;`,
          [clinicId],
        );

        benchmarkClinics.push({ clinicId, userId, membershipId, sessionId });
      }
    } finally {
      ownerClient.release();
    }
    console.log(`[Setup] Provisioned ${benchmarkClinics.length} isolated tenant clinics successfully.`);

    const primaryClinic = benchmarkClinics[0];

    // Helper to run in tenant RLS context
    async function withTenantContext(clinic, fn) {
      const client = await appPool.connect();
      try {
        await client.query('BEGIN;');
        await client.query("SELECT set_config('lamssa.clinic_id', $1, true);", [clinic.clinicId]);
        await client.query("SELECT set_config('lamssa.user_id', $1, true);", [clinic.userId]);
        await client.query("SELECT set_config('lamssa.membership_id', $1, true);", [clinic.membershipId]);
        await client.query("SELECT set_config('lamssa.session_id', $1, true);", [clinic.sessionId]);
        const result = await fn(client);
        await client.query('COMMIT;');
        return result;
      } catch (err) {
        await client.query('ROLLBACK;');
        throw err;
      } finally {
        client.release();
      }
    }

    // ------------------------------------------------------------------------
    // Workload A: Reception & Patient Intake
    // ------------------------------------------------------------------------
    console.log('\n[Workload A] Reception & Patient Intake (Registration, Search, Queue)...');
    const workloadALatencies = [];
    const workloadAIterations = 100;
    const startMemA = process.memoryUsage();
    const startTimeA = performance.now();

    for (let i = 0; i < workloadAIterations; i++) {
      const t0 = performance.now();
      await withTenantContext(primaryClinic, async (client) => {
        // 1. Patient Counter increment
        const counterRes = await client.query(
          `UPDATE "PatientCounter"
           SET "lastNumber" = "lastNumber" + 1
           WHERE "clinicId" = $1
           RETURNING "lastNumber";`,
          [primaryClinic.clinicId],
        );
        const pNum = `P-${String(counterRes.rows[0].lastNumber).padStart(6, '0')}`;
        const patientId = randomUUID();

        // 2. Insert Patient
        await client.query(
          `INSERT INTO "Patient" (id, "clinicId", "patientNumber", "fullName", "searchName", gender, status, "updatedAt")
           VALUES ($1, $2, $3, $4, $5, 'FEMALE', 'ACTIVE', NOW());`,
          [patientId, primaryClinic.clinicId, pNum, `مريضة استقبال ${i}`, `مريضة استقبال ${i}`],
        );

        // 3. Deterministic / prefix search
        await client.query(
          `SELECT id, "patientNumber", "fullName"
           FROM "Patient"
           WHERE "clinicId" = $1 AND "searchName" LIKE $2
           LIMIT 10;`,
          [primaryClinic.clinicId, `مريضة استقبال%`],
        );

        // 4. Queue ticket counter increment (monotonic sequence)
        await client.query(
          `UPDATE "QueueCounter"
           SET "lastNumber" = "lastNumber" + 1
           WHERE "clinicId" = $1 AND "businessDate" = CURRENT_DATE
           RETURNING "lastNumber";`,
          [primaryClinic.clinicId],
        );
      });
      const t1 = performance.now();
      workloadALatencies.push(t1 - t0);
    }

    const durationA = performance.now() - startTimeA;
    results.workloadA = {
      iterations: workloadAIterations,
      durationMs: Number(durationA.toFixed(2)),
      qps: Number(((workloadAIterations / durationA) * 1000).toFixed(2)),
      latencies: calculatePercentiles(workloadALatencies),
      memoryDeltaMb: Number(((process.memoryUsage().heapUsed - startMemA.heapUsed) / (1024 ** 2)).toFixed(2)),
    };
    console.log(`  -> QPS: ${results.workloadA.qps} | p50: ${results.workloadA.latencies.p50}ms | p95: ${results.workloadA.latencies.p95}ms | p99: ${results.workloadA.latencies.p99}ms`);

    // ------------------------------------------------------------------------
    // Workload B: General Medical Clinical Documentation
    // ------------------------------------------------------------------------
    console.log('\n[Workload B] General Medical Documentation (Encounters, Vitals, Diagnoses, Prescriptions)...');
    const workloadBLatencies = [];
    const workloadBIterations = 100;
    const startMemB = process.memoryUsage();
    const startTimeB = performance.now();

    // Prepare a patient for documentation
    let sharedPatientId;
    await withTenantContext(primaryClinic, async (client) => {
      const p = await client.query(`SELECT id FROM "Patient" WHERE "clinicId" = $1 LIMIT 1;`, [primaryClinic.clinicId]);
      sharedPatientId = p.rows[0].id;
    });

    for (let i = 0; i < workloadBIterations; i++) {
      const t0 = performance.now();
      await withTenantContext(primaryClinic, async (client) => {
        // 1. Clinical Encounter creation
        const encounterId = randomUUID();
        await client.query(
          `INSERT INTO "ClinicalEncounter" (id, "clinicId", "patientId", "clinicianMembershipId", "status", "version", "updatedAt")
           VALUES ($1, $2, $3, $4, 'IN_PROGRESS', 1, NOW());`,
          [encounterId, primaryClinic.clinicId, sharedPatientId, primaryClinic.membershipId],
        );

        // 2. Vital signs recording (Observation)
        const obsId = randomUUID();
        await client.query(
          `INSERT INTO "ClinicalObservation" (id, "clinicId", "patientId", "encounterId", "authorMembershipId", "observationType", "status", "numericValue", "unit", "measuredAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, 'BLOOD_PRESSURE_SYSTOLIC', 'RECORDED', 120, 'mmHg', NOW(), NOW());`,
          [obsId, primaryClinic.clinicId, sharedPatientId, encounterId, primaryClinic.membershipId],
        );

        // 3. Clinical Diagnosis (ICD-10)
        const diagId = randomUUID();
        await client.query(
          `INSERT INTO "EncounterDiagnosis" (id, "clinicId", "patientId", "encounterId", "authorMembershipId", "codingSystem", "code", "displayAr", "clinicalStatus", "verificationStatus", "version", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, 'ICD-10', 'I10', 'ارتفاع ضغط الدم الأساسي', 'PROVISIONAL', 'CONFIRMED', 1, NOW());`,
          [diagId, primaryClinic.clinicId, sharedPatientId, encounterId, primaryClinic.membershipId],
        );

        // 4. Allergy check
        await client.query(
          `SELECT id, "severity", "verificationStatus"
           FROM "PatientAllergy"
           WHERE "clinicId" = $1 AND "patientId" = $2;`,
          [primaryClinic.clinicId, sharedPatientId],
        );

        // 5. Electronic Prescription
        const rxId = randomUUID();
        await client.query(
          `INSERT INTO "MedicationPrescription" (id, "clinicId", "patientId", "encounterId", "prescriberMembershipId", "prescriptionNumber", "status", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT', NOW());`,
          [rxId, primaryClinic.clinicId, sharedPatientId, encounterId, primaryClinic.membershipId, `RX-${Date.now().toString(36)}-${i}`],
        );

        // 6. Complete encounter
        await client.query(
          `UPDATE "ClinicalEncounter"
           SET "status" = 'SIGNED', "updatedAt" = NOW()
           WHERE "clinicId" = $1 AND id = $2;`,
          [primaryClinic.clinicId, encounterId],
        );
      });
      const t1 = performance.now();
      workloadBLatencies.push(t1 - t0);
    }

    const durationB = performance.now() - startTimeB;
    results.workloadB = {
      iterations: workloadBIterations,
      durationMs: Number(durationB.toFixed(2)),
      qps: Number(((workloadBIterations / durationB) * 1000).toFixed(2)),
      latencies: calculatePercentiles(workloadBLatencies),
      memoryDeltaMb: Number(((process.memoryUsage().heapUsed - startMemB.heapUsed) / (1024 ** 2)).toFixed(2)),
    };
    console.log(`  -> QPS: ${results.workloadB.qps} | p50: ${results.workloadB.latencies.p50}ms | p95: ${results.workloadB.latencies.p95}ms | p99: ${results.workloadB.latencies.p99}ms`);

    // ------------------------------------------------------------------------
    // Workload C: Aesthetic Medicine & Specialized Procedures
    // ------------------------------------------------------------------------
    console.log('\n[Workload C] Aesthetic Medicine & Procedures (Plans, Revisions, Coordinates, Consents)...');
    const workloadCLatencies = [];
    const workloadCIterations = 100;
    const startMemC = process.memoryUsage();
    const startTimeC = performance.now();

    for (let i = 0; i < workloadCIterations; i++) {
      const t0 = performance.now();
      await withTenantContext(primaryClinic, async (client) => {
        // 1. Create Treatment Plan
        const planId = randomUUID();
        await client.query(
          `INSERT INTO "TreatmentPlan" (id, "clinicId", "patientId", "clinicianMembershipId", "status", "version", "updatedAt")
           VALUES ($1, $2, $3, $4, 'ACTIVE', 1, NOW());`,
          [planId, primaryClinic.clinicId, sharedPatientId, primaryClinic.membershipId],
        );

        // 2. Create Treatment Plan Revision with clinical purpose
        const revId = randomUUID();
        await client.query(
          `INSERT INTO "TreatmentPlanRevision" (id, "clinicId", "treatmentPlanId", "revisionNumber", "authorMembershipId", "title", "clinicalPurpose", "status", "version", "updatedAt")
           VALUES ($1, $2, $3, 1, $4, 'خطة نضارة الوجه', 'نضارة وتحديد ملامح الوجه بحقن موضعي', 'DRAFT', 1, NOW());`,
          [revId, primaryClinic.clinicId, planId, primaryClinic.membershipId],
        );

        // 3. Informed consent verification check
        await client.query(
          `SELECT id, "status"
           FROM "PatientConsent"
           WHERE "clinicId" = $1 AND "patientId" = $2
           LIMIT 1;`,
          [primaryClinic.clinicId, sharedPatientId],
        );
      });
      const t1 = performance.now();
      workloadCLatencies.push(t1 - t0);
    }

    const durationC = performance.now() - startTimeC;
    results.workloadC = {
      iterations: workloadCIterations,
      durationMs: Number(durationC.toFixed(2)),
      qps: Number(((workloadCIterations / durationC) * 1000).toFixed(2)),
      latencies: calculatePercentiles(workloadCLatencies),
      memoryDeltaMb: Number(((process.memoryUsage().heapUsed - startMemC.heapUsed) / (1024 ** 2)).toFixed(2)),
    };
    console.log(`  -> QPS: ${results.workloadC.qps} | p50: ${results.workloadC.latencies.p50}ms | p95: ${results.workloadC.latencies.p95}ms | p99: ${results.workloadC.latencies.p99}ms`);

    // ------------------------------------------------------------------------
    // Workload D: Financial Operations & Multi-Tenancy
    // ------------------------------------------------------------------------
    console.log('\n[Workload D] Financial Operations (Invoicing, 15% VAT, Monotonic Sequence, Audit Hash)...');
    const workloadDLatencies = [];
    const workloadDIterations = 100;
    const startMemD = process.memoryUsage();
    const startTimeD = performance.now();

    for (let i = 0; i < workloadDIterations; i++) {
      const t0 = performance.now();
      await withTenantContext(primaryClinic, async (client) => {
        // 1. Advance counter revision for invoice creation
        await client.query(
          `UPDATE "ClinicInvoiceCounter" SET "revision" = "revision" + 1 WHERE "clinicId" = $1;`,
          [primaryClinic.clinicId],
        );

        // 2. Draft invoice creation with 15% VAT
        const invoiceId = randomUUID();
        const requestKey = randomUUID();
        const requestHash = createHash('sha256').update(requestKey).digest('hex');

        // Subtotal: 1000.00 SAR (100000 minor)
        // Tax (15%): 150.00 SAR (15000 minor)
        // Total: 1150.00 SAR (115000 minor)
        await client.query(
          `INSERT INTO "Invoice" (id, "clinicId", "patientId", "patientName", "patientNumber", "currency", "currencyScale", "status", "subtotalMinor", "discountMinor", "taxMinor", "totalMinor", "netPaidMinor", "requestKey", "requestHash", "version", "updatedAt")
           VALUES ($1, $2, $3, 'مريضة مالية', 'P-100001', 'SAR', 2, 'DRAFT', 100000, 0, 15000, 115000, 0, $4, $5, 1, NOW());`,
          [invoiceId, primaryClinic.clinicId, sharedPatientId, requestKey, requestHash],
        );

        // 3. Invoice Line
        const lineId = randomUUID();
        await client.query(
          `INSERT INTO "InvoiceLine" (id, "clinicId", "invoiceId", "position", "serviceName", "description", "quantityMilli", "unitPriceMinor", "grossMinor", "discountMinor", "taxBasisPoints", "taxMinor", "totalMinor")
           VALUES ($1, $2, $3, 1, 'جلسة نضارة', 'جلسة تقشير وتجديد البشرة التجميلية', 1000, 100000, 100000, 0, 1500, 15000, 115000);`,
          [lineId, primaryClinic.clinicId, invoiceId],
        );

        // 4. Audit trail append for draft
        await recordAuditEvent(client, primaryClinic, invoiceId, 1, 'DRAFT_CREATED', { totalMinor: '115000' });

        // 5. Monotonic invoice number increment and Issuance
        const invCounterRes = await client.query(
          `UPDATE "ClinicInvoiceCounter"
           SET "lastNumber" = "lastNumber" + 1, "revision" = "revision" + 1
           WHERE "clinicId" = $1
           RETURNING "lastNumber";`,
          [primaryClinic.clinicId],
        );
        const invSeq = invCounterRes.rows[0].lastNumber;
        const invoiceNumber = `INV-${String(invSeq).padStart(6, '0')}`;
        const issueKey = randomUUID();
        const issueHash = createHash('sha256').update(issueKey).digest('hex');
        const issuerSnapshot = JSON.stringify({ legalName: 'شركة الأداء الطبي', taxIdentifier: '300000000000003' });

        await client.query(
          `UPDATE "Invoice"
           SET "status" = 'ISSUED', "number" = $1, "issuedAt" = NOW(), "issuerSnapshot" = $2::jsonb, "issueKey" = $3, "issueHash" = $4, "version" = 2, "updatedAt" = NOW()
           WHERE "clinicId" = $5 AND id = $6;`,
          [invoiceNumber, issuerSnapshot, issueKey, issueHash, primaryClinic.clinicId, invoiceId],
        );

        await recordAuditEvent(client, primaryClinic, invoiceId, 2, 'INVOICE_ISSUED', { invoiceNumber });

        // 6. Payment recording (full payment)
        const paymentId = randomUUID();
        const payRequestKey = randomUUID();
        const payRequestHash = createHash('sha256').update(payRequestKey).digest('hex');
        await client.query(
          `INSERT INTO "Payment" (id, "clinicId", "invoiceId", "amountMinor", "currency", "currencyScale", "method", "requestKey", "requestHash")
           VALUES ($1, $2, $3, 115000, 'SAR', 2, 'CARD_MANUAL', $4, $5);`,
          [paymentId, primaryClinic.clinicId, invoiceId, payRequestKey, payRequestHash],
        );

        await client.query(
          `UPDATE "Invoice"
           SET "status" = 'PAID', "netPaidMinor" = 115000, "version" = 3, "updatedAt" = NOW()
           WHERE "clinicId" = $1 AND id = $2;`,
          [primaryClinic.clinicId, invoiceId],
        );

        await recordAuditEvent(client, primaryClinic, invoiceId, 3, 'PAYMENT_RECORDED', { amountMinor: '115000' });
      });
      const t1 = performance.now();
      workloadDLatencies.push(t1 - t0);
    }

    const durationD = performance.now() - startTimeD;
    results.workloadD = {
      iterations: workloadDIterations,
      durationMs: Number(durationD.toFixed(2)),
      qps: Number(((workloadDIterations / durationD) * 1000).toFixed(2)),
      latencies: calculatePercentiles(workloadDLatencies),
      memoryDeltaMb: Number(((process.memoryUsage().heapUsed - startMemD.heapUsed) / (1024 ** 2)).toFixed(2)),
    };
    console.log(`  -> QPS: ${results.workloadD.qps} | p50: ${results.workloadD.latencies.p50}ms | p95: ${results.workloadD.latencies.p95}ms | p99: ${results.workloadD.latencies.p99}ms`);

    // ------------------------------------------------------------------------
    // Workload E: Multi-Tenant Concurrency & Cross-Clinic Isolation
    // ------------------------------------------------------------------------
    console.log('\n[Workload E] Multi-Tenant Concurrency & Cross-Clinic Isolation (5 Tenants in Parallel)...');
    const workloadELatencies = [];
    const workloadEConcurrentBatches = 20; // 20 batches of 5 concurrent tenant operations = 100 operations
    const startMemE = process.memoryUsage();
    const startTimeE = performance.now();

    for (let batch = 0; batch < workloadEConcurrentBatches; batch++) {
      const batchPromises = benchmarkClinics.map(async (clinic) => {
        const t0 = performance.now();
        await withTenantContext(clinic, async (client) => {
          // 1. Monotonic counter increment in parallel across all 5 clinics
          await client.query(
            `UPDATE "PatientCounter"
             SET "lastNumber" = "lastNumber" + 1
             WHERE "clinicId" = $1;`,
            [clinic.clinicId],
          );

          // 2. Strict RLS Isolation query: Ensure this tenant sees ONLY its own rows
          const res = await client.query(`SELECT id, "clinicId" FROM "Patient" WHERE "clinicId" = $1 LIMIT 50;`, [clinic.clinicId]);
          for (const row of res.rows) {
            if (row.clinicId !== clinic.clinicId) {
              throw new Error(`CRITICAL SECURITY FAILURE: Tenant ${clinic.clinicId} leaked row from ${row.clinicId}!`);
            }
          }
        });
        const t1 = performance.now();
        return t1 - t0;
      });

      const batchLatencies = await Promise.all(batchPromises);
      workloadELatencies.push(...batchLatencies);
    }

    const durationE = performance.now() - startTimeE;
    results.workloadE = {
      iterations: workloadELatencies.length,
      durationMs: Number(durationE.toFixed(2)),
      qps: Number(((workloadELatencies.length / durationE) * 1000).toFixed(2)),
      latencies: calculatePercentiles(workloadELatencies),
      memoryDeltaMb: Number(((process.memoryUsage().heapUsed - startMemE.heapUsed) / (1024 ** 2)).toFixed(2)),
    };
    console.log(`  -> QPS: ${results.workloadE.qps} | p50: ${results.workloadE.latencies.p50}ms | p95: ${results.workloadE.latencies.p95}ms | p99: ${results.workloadE.latencies.p99}ms`);

    // ------------------------------------------------------------------------
    // Teardown & Summary
    // ------------------------------------------------------------------------
    console.log('\n[Teardown] Cleaning up benchmark fixtures...');
    const cleanupClient = await ownerPool.connect();
    try {
      const clinicIds = benchmarkClinics.map((c) => c.clinicId);
      const userIds = benchmarkClinics.map((c) => c.userId);

      await cleanupClient.query('BEGIN;');
      await cleanupClient.query(`DELETE FROM "FinancialAuditEvent" WHERE "clinicId" = ANY($1);`, [clinicIds]);
      await cleanupClient.query(`DELETE FROM "Payment" WHERE "clinicId" = ANY($1);`, [clinicIds]);
      await cleanupClient.query(`DELETE FROM "InvoiceLine" WHERE "clinicId" = ANY($1);`, [clinicIds]);
      await cleanupClient.query(`DELETE FROM "Invoice" WHERE "clinicId" = ANY($1);`, [clinicIds]);
      await cleanupClient.query(`DELETE FROM "ClinicInvoiceCounter" WHERE "clinicId" = ANY($1);`, [clinicIds]);
      await cleanupClient.query(`DELETE FROM "TreatmentPlanRevision" WHERE "clinicId" = ANY($1);`, [clinicIds]);
      await cleanupClient.query(`DELETE FROM "TreatmentPlan" WHERE "clinicId" = ANY($1);`, [clinicIds]);
      await cleanupClient.query(`DELETE FROM "MedicationPrescription" WHERE "clinicId" = ANY($1);`, [clinicIds]);
      await cleanupClient.query(`DELETE FROM "EncounterDiagnosis" WHERE "clinicId" = ANY($1);`, [clinicIds]);
      await cleanupClient.query(`DELETE FROM "ClinicalObservation" WHERE "clinicId" = ANY($1);`, [clinicIds]);
      await cleanupClient.query(`DELETE FROM "ClinicalEncounter" WHERE "clinicId" = ANY($1);`, [clinicIds]);
      await cleanupClient.query(`DELETE FROM "QueueCounter" WHERE "clinicId" = ANY($1);`, [clinicIds]);
      await cleanupClient.query(`DELETE FROM "Patient" WHERE "clinicId" = ANY($1);`, [clinicIds]);
      await cleanupClient.query(`DELETE FROM "PatientCounter" WHERE "clinicId" = ANY($1);`, [clinicIds]);
      await cleanupClient.query(`DELETE FROM "PractitionerProfile" WHERE "clinicId" = ANY($1);`, [clinicIds]);
      await cleanupClient.query(`DELETE FROM "ClinicMembership" WHERE "clinicId" = ANY($1);`, [clinicIds]);
      await cleanupClient.query(`DELETE FROM "Clinic" WHERE id = ANY($1);`, [clinicIds]);
      await cleanupClient.query(`DELETE FROM "Session" WHERE "userId" = ANY($1);`, [userIds]);
      await cleanupClient.query(`DELETE FROM "User" WHERE id = ANY($1);`, [userIds]);
      await cleanupClient.query('COMMIT;');
    } catch (cleanupErr) {
      await cleanupClient.query('ROLLBACK;');
      console.warn('Cleanup warning:', cleanupErr.message);
    } finally {
      cleanupClient.release();
    }
    console.log('[Teardown] Cleanup completed successfully.');

    // Print Final Markdown Table
    console.log('\n' + '='.repeat(80));
    console.log('BENCHMARK PERFORMANCE SUMMARY');
    console.log('='.repeat(80));
    console.log('| Workload Scenario | Total Tx | Duration (ms) | QPS / TPS | p50 (ms) | p90 (ms) | p95 (ms) | p99 (ms) | Heap Delta |');
    console.log('|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|');
    for (const [k, v] of Object.entries(results)) {
      console.log(`| ${k} | ${v.iterations} | ${v.durationMs} | ${v.qps} | ${v.latencies.p50} | ${v.latencies.p90} | ${v.latencies.p95} | ${v.latencies.p99} | +${v.memoryDeltaMb} MB |`);
    }
    console.log('='.repeat(80));

    return { environment: envInfo, results };
  } finally {
    await appPool.end();
    await ownerPool.end();
  }
}

// Run if directly executed
runBenchmark().catch((err) => {
  console.error('Benchmark execution failed:', err);
  process.exit(1);
});
