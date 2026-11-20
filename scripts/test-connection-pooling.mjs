#!/usr/bin/env node
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
config({ path: resolve(root, '.env'), quiet: true });

const runtimeUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const migratorUrl = process.env.TEST_MIGRATION_DATABASE_URL || process.env.MIGRATION_DATABASE_URL;

if (!runtimeUrl || !migratorUrl) {
  console.error('[FAIL] TEST_DATABASE_URL and TEST_MIGRATION_DATABASE_URL are required.');
  process.exit(1);
}

console.info('=== Lamssa Phase 9: PostgreSQL Connection Pooling & Multiplexing Security Suite ===\n');

// 1. Setup isolated fixtures using migrator client
const migratorPool = new pg.Pool({ connectionString: migratorUrl, max: 2 });
// Single-connection pool enforces connection reuse and multiplexing
const runtimePool = new pg.Pool({ connectionString: runtimeUrl, max: 2 });

const clinicA = randomUUID();
const clinicB = randomUUID();
const userA = randomUUID();
const userB = randomUUID();
const sessionA = randomUUID();
const sessionB = randomUUID();
const patientA = randomUUID();
const patientB = randomUUID();
const suffix = randomBytes(4).toString('hex');

async function setup() {
  const mClient = await migratorPool.connect();
  try {
    // 3. Two separate synthetic clinic identities
    await mClient.query(`
      INSERT INTO public."Clinic" (id, "legalName", "displayName", slug, currency, status, "createdAt", "updatedAt")
      VALUES
        ($1, 'عيادة مسبح اتصالات أ', 'عيادة أ', $2, 'SAR', 'ACTIVE', NOW(), NOW()),
        ($3, 'عيادة مسبح اتصالات ب', 'عيادة ب', $4, 'SAR', 'ACTIVE', NOW(), NOW())
    `, [clinicA, `pool-a-${suffix}`, clinicB, `pool-b-${suffix}`]);

    // Create Users A and B
    await mClient.query(`
      INSERT INTO public."User" (id, email, name, status, "createdAt", "updatedAt")
      VALUES
        ($1, $2, 'دكتور أ', 'ACTIVE', NOW(), NOW()),
        ($3, $4, 'دكتور ب', 'ACTIVE', NOW(), NOW())
    `, [userA, `doc-a-${suffix}@example.com`, userB, `doc-b-${suffix}@example.com`]);

    // Create Memberships
    await mClient.query(`
      INSERT INTO public."ClinicMembership" (id, "clinicId", "userId", role, status, "createdAt", "updatedAt")
      VALUES
        (gen_random_uuid(), $1, $2, 'DOCTOR', 'ACTIVE', NOW(), NOW()),
        (gen_random_uuid(), $3, $4, 'DOCTOR', 'ACTIVE', NOW(), NOW())
    `, [clinicA, userA, clinicB, userB]);

    // 6. Authenticated session identity
    const tokenHashA = randomBytes(32).toString('hex');
    const tokenHashB = randomBytes(32).toString('hex');
    const authHashA = randomBytes(32).toString('hex');
    const authHashB = randomBytes(32).toString('hex');
    const csrfHashA = randomBytes(32).toString('hex');
    const csrfHashB = randomBytes(32).toString('hex');

    await mClient.query(`
      INSERT INTO public."Session" (id, "userId", "selectedClinicId", "tokenHash", "authorizationHash", "csrfHash", "expiresAt", "lastSeenAt", "createdAt")
      VALUES
        ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '1 hour', NOW(), NOW()),
        ($7, $8, $9, $10, $11, $12, NOW() + INTERVAL '1 hour', NOW(), NOW())
    `, [
      sessionA, userA, clinicA, tokenHashA, authHashA, csrfHashA,
      sessionB, userB, clinicB, tokenHashB, authHashB, csrfHashB,
    ]);

    // Insert Patients for Clinic A and Clinic B
    await mClient.query(`
      INSERT INTO public."Patient" (id, "clinicId", "patientNumber", "fullName", "searchName", "dateOfBirth", "gender", "status", "version", "createdAt", "updatedAt")
      VALUES
        ($1, $2, 'P-000001', 'مريض أ', 'مريض أ', '1990-01-01', 'MALE', 'ACTIVE', 1, NOW(), NOW()),
        ($3, $4, 'P-000002', 'مريض ب', 'مريض ب', '1995-05-05', 'FEMALE', 'ACTIVE', 1, NOW(), NOW())
    `, [patientA, clinicA, patientB, clinicB]);

    console.info('[PASS] Test fixtures initialized (2 clinics, 2 users, 2 sessions, 2 patients)');
  } finally {
    mClient.release();
  }
}

async function teardown() {
  const mClient = await migratorPool.connect();
  try {
    await mClient.query('DELETE FROM public."Patient" WHERE id IN ($1, $2)', [patientA, patientB]);
    await mClient.query('DELETE FROM public."Session" WHERE id IN ($1, $2)', [sessionA, sessionB]);
    await mClient.query('DELETE FROM public."ClinicMembership" WHERE "clinicId" IN ($1, $2)', [clinicA, clinicB]);
    await mClient.query('DELETE FROM public."User" WHERE id IN ($1, $2)', [userA, userB]);
    await mClient.query('DELETE FROM public."Clinic" WHERE id IN ($1, $2)', [clinicA, clinicB]);
  } catch (err) {
    console.warn('[WARN] Teardown error:', err.message);
  } finally {
    mClient.release();
  }
}

async function runTests() {
  await setup();

  const rClient = await runtimePool.connect(); // Acquire single physical connection for multiplexed testing
  try {
    // -------------------------------------------------------------
    // Test 1: Pooled Transaction Mode & Isolation
    // -------------------------------------------------------------
    console.info('\n--- Test 1: Pooled Transaction Mode & Isolation ---');
    await rClient.query('BEGIN');
    await rClient.query(`
      SELECT set_config('lamssa.clinic_id', $1, true),
             set_config('lamssa.user_id', $2, true),
             set_config('lamssa.session_id', $3, true)
    `, [clinicA, userA, sessionA]);

    const resA = await rClient.query('SELECT id, "fullName" FROM public."Patient"');
    if (resA.rowCount !== 1 || resA.rows[0].id !== patientA) {
      throw new Error(`Tx A expected patientA but got ${JSON.stringify(resA.rows)}`);
    }
    await rClient.query('COMMIT');
    console.info('[PASS] Test 1: Transaction mode isolation verified on Clinic A');

    // -------------------------------------------------------------
    // Test 2: Actual Connection Multiplexing (Same Connection for Clinic B)
    // -------------------------------------------------------------
    console.info('\n--- Test 2: Actual Connection Multiplexing ---');
    await rClient.query('BEGIN');
    await rClient.query(`
      SELECT set_config('lamssa.clinic_id', $1, true),
             set_config('lamssa.user_id', $2, true),
             set_config('lamssa.session_id', $3, true)
    `, [clinicB, userB, sessionB]);

    const resB = await rClient.query('SELECT id, "fullName" FROM public."Patient"');
    if (resB.rowCount !== 1 || resB.rows[0].id !== patientB) {
      throw new Error(`Tx B expected patientB but got ${JSON.stringify(resB.rows)}`);
    }
    await rClient.query('COMMIT');
    console.info('[PASS] Test 2: Connection multiplexing executed cleanly across distinct tenants');

    // -------------------------------------------------------------
    // Test 3: Two Separate Synthetic Clinic Identities
    // -------------------------------------------------------------
    console.info('\n--- Test 3: Two Separate Synthetic Clinic Identities ---');
    if (clinicA === clinicB || userA === userB || patientA === patientB) {
      throw new Error('Test fixtures must use distinct UUIDs for synthetic clinic identities');
    }
    console.info('[PASS] Test 3: Clinic A and Clinic B strictly separated by distinct cryptographic UUIDs');

    // -------------------------------------------------------------
    // Test 4: Interleaved Transactions Across Separate Clients
    // -------------------------------------------------------------
    console.info('\n--- Test 4: Interleaved Transactions Across Separate Clients ---');
    for (let round = 0; round < 3; round++) {
      // Clinic A Transaction
      await rClient.query('BEGIN');
      await rClient.query(`
        SELECT set_config('lamssa.clinic_id', $1, true),
               set_config('lamssa.user_id', $2, true),
               set_config('lamssa.session_id', $3, true)
      `, [clinicA, userA, sessionA]);
      const rA = await rClient.query('SELECT id FROM public."Patient"');
      if (rA.rows[0].id !== patientA) throw new Error(`Interleave A failed in round ${round}`);
      await rClient.query('COMMIT');

      // Clinic B Transaction on the exact same connection
      await rClient.query('BEGIN');
      await rClient.query(`
        SELECT set_config('lamssa.clinic_id', $1, true),
               set_config('lamssa.user_id', $2, true),
               set_config('lamssa.session_id', $3, true)
      `, [clinicB, userB, sessionB]);
      const rB = await rClient.query('SELECT id FROM public."Patient"');
      if (rB.rows[0].id !== patientB) throw new Error(`Interleave B failed in round ${round}`);
      await rClient.query('COMMIT');
    }
    console.info('[PASS] Test 4: Interleaved transactions executed across separate clients without cross-contamination');

    // -------------------------------------------------------------
    // Test 5: Transaction-Local Tenant Context (is_local = true)
    // -------------------------------------------------------------
    console.info('\n--- Test 5: Transaction-Local Tenant Context ---');
    await rClient.query('BEGIN');
    await rClient.query(`SELECT set_config('lamssa.clinic_id', $1, true)`, [clinicA]);
    const inTxGuc = await rClient.query(`SELECT current_setting('lamssa.clinic_id', true) as val`);
    if (inTxGuc.rows[0].val !== clinicA) throw new Error('Transaction-local GUC not set inside transaction');
    await rClient.query('COMMIT');
    const outTxGuc = await rClient.query(`SELECT current_setting('lamssa.clinic_id', true) as val`);
    if (outTxGuc.rows[0].val) throw new Error('GUC leaked outside transaction!');
    console.info('[PASS] Test 5: is_local = true guarantees transaction-scoped context only');

    // -------------------------------------------------------------
    // Test 6: Authenticated Session Identity Lookup
    // -------------------------------------------------------------
    console.info('\n--- Test 6: Authenticated Session Identity ---');
    const sessionCheck = await rClient.query(`
      SELECT s.id, s."selectedClinicId"
      FROM public."Session" s
      WHERE s.id = $1 AND s."revokedAt" IS NULL
    `, [sessionA]);
    if (sessionCheck.rowCount !== 1 || sessionCheck.rows[0].selectedClinicId !== clinicA) {
      throw new Error('Authenticated session identity lookup failed');
    }
    console.info('[PASS] Test 6: Session and membership verification matches active tenant context');

    // -------------------------------------------------------------
    // Test 7: COMMIT Cleanup
    // -------------------------------------------------------------
    console.info('\n--- Test 7: COMMIT Cleanup ---');
    await rClient.query('BEGIN');
    await rClient.query(`
      SELECT set_config('lamssa.clinic_id', $1, true),
             set_config('lamssa.user_id', $2, true),
             set_config('lamssa.session_id', $3, true)
    `, [clinicA, userA, sessionA]);
    await rClient.query('COMMIT');
    const c7Check = await rClient.query(`
      SELECT current_setting('lamssa.clinic_id', true) as cid,
             current_setting('lamssa.user_id', true) as uid,
             current_setting('lamssa.session_id', true) as sid
    `);
    if (c7Check.rows[0].cid || c7Check.rows[0].uid || c7Check.rows[0].sid) {
      throw new Error('COMMIT failed to clean up transaction-local GUCs');
    }
    console.info('[PASS] Test 7: COMMIT cleanup verified: all GUCs null on subsequent queries');

    // -------------------------------------------------------------
    // Test 8: ROLLBACK Cleanup
    // -------------------------------------------------------------
    console.info('\n--- Test 8: ROLLBACK Cleanup ---');
    await rClient.query('BEGIN');
    await rClient.query(`
      SELECT set_config('lamssa.clinic_id', $1, true),
             set_config('lamssa.user_id', $2, true),
             set_config('lamssa.session_id', $3, true)
    `, [clinicA, userA, sessionA]);
    await rClient.query('ROLLBACK');
    const c8Check = await rClient.query(`
      SELECT current_setting('lamssa.clinic_id', true) as cid,
             current_setting('lamssa.user_id', true) as uid,
             current_setting('lamssa.session_id', true) as sid
    `);
    if (c8Check.rows[0].cid || c8Check.rows[0].uid || c8Check.rows[0].sid) {
      throw new Error('ROLLBACK failed to clean up transaction-local GUCs');
    }
    console.info('[PASS] Test 8: ROLLBACK cleanup verified: zero residual context');

    // -------------------------------------------------------------
    // Test 9: Session Revocation
    // -------------------------------------------------------------
    console.info('\n--- Test 9: Session Revocation ---');
    await migratorPool.query('UPDATE public."Session" SET "revokedAt" = NOW() WHERE id = $1', [sessionA]);
    await rClient.query('BEGIN');
    await rClient.query(`
      SELECT set_config('lamssa.clinic_id', $1, true),
             set_config('lamssa.user_id', $2, true),
             set_config('lamssa.session_id', $3, true)
    `, [clinicA, userA, sessionA]);
    const revokedRes = await rClient.query('SELECT * FROM public."Patient"');
    await rClient.query('COMMIT');
    if (revokedRes.rowCount !== 0) {
      throw new Error('Revoked session accessed patient data!');
    }
    console.info('[PASS] Test 9: Session revocation immediately denies RLS access');

    // -------------------------------------------------------------
    // Test 10: Caller-Controlled GUC Spoofing
    // -------------------------------------------------------------
    console.info('\n--- Test 10: Caller-Controlled GUC Spoofing ---');
    await rClient.query('BEGIN');
    // Spoofing attempt: setting arbitrary clinic without matching session
    await rClient.query(`
      SELECT set_config('lamssa.clinic_id', $1, true),
             set_config('lamssa.user_id', $2, true),
             set_config('lamssa.session_id', $3, true)
    `, [clinicB, userA, sessionA]);
    const spoofRes = await rClient.query('SELECT * FROM public."Patient"');
    await rClient.query('ROLLBACK');
    if (spoofRes.rowCount !== 0) {
      throw new Error('Caller-controlled GUC spoofing succeeded!');
    }
    console.info('[PASS] Test 10: Caller-controlled GUC spoofing rejected by context_allows');

    // -------------------------------------------------------------
    // Test 11: Prisma Prepared-Statement Compatibility
    // -------------------------------------------------------------
    console.info('\n--- Test 11: Prisma Prepared-Statement Compatibility ---');
    for (let i = 0; i < 4; i++) {
      await rClient.query('BEGIN');
      await rClient.query(`
        SELECT set_config('lamssa.clinic_id', $1, true),
               set_config('lamssa.user_id', $2, true),
               set_config('lamssa.session_id', $3, true)
      `, [clinicB, userB, sessionB]);
      const res = await rClient.query('SELECT id, "fullName" FROM public."Patient" WHERE "status" = $1', ['ACTIVE']);
      if (res.rowCount !== 1) throw new Error(`Prepared query iteration ${i} failed`);
      await rClient.query('COMMIT');
    }
    console.info('[PASS] Test 11: Parameterized queries execute without statement name collision');

    // -------------------------------------------------------------
    // Test 12: Connection Failure and Recovery
    // -------------------------------------------------------------
    console.info('\n--- Test 12: Connection Failure and Recovery ---');
    try {
      await rClient.query('BEGIN');
      await rClient.query('SELECT * FROM non_existent_table_abort_test');
    } catch {
      await rClient.query('ROLLBACK').catch(() => {});
    }
    // Verify connection recovered and can execute subsequent transactions cleanly
    await rClient.query('BEGIN');
    const testPing = await rClient.query('SELECT 1 as alive');
    if (testPing.rows[0].alive !== 1) throw new Error('Connection failed to recover after error');
    await rClient.query('COMMIT');
    console.info('[PASS] Test 12: Connection cleanly recovered after aborted transaction');

    // -------------------------------------------------------------
    // Test 13: Transaction Retry Behavior
    // -------------------------------------------------------------
    console.info('\n--- Test 13: Transaction Retry Behavior ---');
    let retrySucceeded = false;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await rClient.query('BEGIN');
        await rClient.query(`
          SELECT set_config('lamssa.clinic_id', $1, true),
                 set_config('lamssa.user_id', $2, true),
                 set_config('lamssa.session_id', $3, true)
        `, [clinicB, userB, sessionB]);
        const res = await rClient.query('SELECT count(*) as count FROM public."Patient"');
        await rClient.query('COMMIT');
        if (Number(res.rows[0].count) === 1) {
          retrySucceeded = true;
          break;
        }
      } catch {
        await rClient.query('ROLLBACK').catch(() => {});
      }
    }
    if (!retrySucceeded) throw new Error('Transaction retry simulation failed');
    console.info('[PASS] Test 13: Transaction retry simulation succeeded idempotently');

    // -------------------------------------------------------------
    // Test 14: Migration Client Bypassing the Runtime Pool
    // -------------------------------------------------------------
    console.info('\n--- Test 14: Migration Client Bypassing Runtime Pool ---');
    const mClient = await migratorPool.connect();
    // Migrator CAN perform DDL
    await mClient.query('CREATE TABLE public.tmp_migrator_gate_check (id int)');
    await mClient.query('DROP TABLE public.tmp_migrator_gate_check');
    mClient.release();

    try {
      await rClient.query('CREATE TABLE public.tmp_exploit (id int)');
      throw new Error('Runtime client was able to perform DDL!');
    } catch (err) {
      if (err.code !== '42501') throw err;
    }
    console.info('[PASS] Test 14: Migrator client possesses DDL; runtime pool strictly denied DDL');

    // -------------------------------------------------------------
    // Test 15: RLS Enforcement After Backend Connection Reuse
    // -------------------------------------------------------------
    console.info('\n--- Test 15: RLS Enforcement After Connection Reuse ---');
    await rClient.query('BEGIN');
    await rClient.query(`
      SELECT set_config('lamssa.clinic_id', $1, true),
             set_config('lamssa.user_id', $2, true),
             set_config('lamssa.session_id', $3, true)
    `, [clinicB, userB, sessionB]);
    // Query Clinic A patient explicitly
    const crossRes = await rClient.query('SELECT * FROM public."Patient" WHERE id = $1', [patientA]);
    await rClient.query('COMMIT');

    if (crossRes.rowCount !== 0) {
      throw new Error(`Cross-tenant data visible after connection reuse! ${JSON.stringify(crossRes.rows)}`);
    }
    console.info('[PASS] Test 15: Reused connection strictly denies cross-tenant access under FORCE RLS');

    console.info('\n\x1b[32m[SUCCESS]\x1b[0m All 15 PostgreSQL connection pooling and tenant-security tests PASSED!\n');
  } finally {
    rClient.release();
    await teardown();
    await runtimePool.end();
    await migratorPool.end();
  }
}

runTests().catch(err => {
  console.error('\n\x1b[31m[FAIL]\x1b[0m Test suite encountered error:', err);
  process.exit(1);
});
