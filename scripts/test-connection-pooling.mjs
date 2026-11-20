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

console.info('=== Lamssa Phase 9 Step 9.2: PostgreSQL Connection Pooling & Tenant Security Audit ===\n');

// 1. Setup isolated fixtures using migrator client
const migratorPool = new pg.Pool({ connectionString: migratorUrl, max: 2 });
const runtimePool = new pg.Pool({ connectionString: runtimeUrl, max: 1 }); // Force single physical backend connection to test pooling reuse

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
    // Create Clinic A and B
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

    // Create Sessions A and B
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

  const rClient = await runtimePool.connect(); // Acquire the ONLY connection in pool
  try {
    // -------------------------------------------------------------
    // Test 1: Interleaved Transaction Execution on the Exact Same Physical Connection
    // -------------------------------------------------------------
    console.info('\n--- Running Test 1: Interleaved Transaction Isolation on Same Connection ---');

    // Transaction A
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
    console.info('[PASS] Transaction A successfully queried Patient A under FORCE RLS');

    // Verify GUCs were automatically cleared by PostgreSQL because is_local = true was used
    const gucCheck = await rClient.query(`
      SELECT current_setting('lamssa.clinic_id', true) as clinic_id,
             current_setting('lamssa.user_id', true) as user_id,
             current_setting('lamssa.session_id', true) as session_id
    `);
    const { clinic_id, user_id, session_id } = gucCheck.rows[0];
    if (clinic_id || user_id || session_id) {
      throw new Error(`GUC leaked outside transaction: clinic=${clinic_id}, user=${user_id}`);
    }
    console.info('[PASS] GUCs automatically reverted upon COMMIT (zero context leakage on pooled connection)');

    // Transaction B on the same connection
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
    console.info('[PASS] Transaction B on same connection queried Patient B with zero visibility of Patient A');

    // -------------------------------------------------------------
    // Test 2: Context Leakage Without set_config
    // -------------------------------------------------------------
    console.info('\n--- Running Test 2: Unauthenticated Query on Reused Connection ---');
    const unauthRes = await rClient.query('SELECT * FROM public."Patient"');
    if (unauthRes.rowCount !== 0) {
      throw new Error(`Unauthenticated query retrieved ${unauthRes.rowCount} rows! RLS failed.`);
    }
    console.info('[PASS] Unauthenticated query on reused connection returns 0 rows (FORCE RLS denies access)');

    // -------------------------------------------------------------
    // Test 3: Context Spoofing Attempt (User A claims Clinic B)
    // -------------------------------------------------------------
    console.info('\n--- Running Test 3: Tenant Context Spoofing Defense ---');
    await rClient.query('BEGIN');
    // Malicious attempt: User A sets clinic_id = Clinic B with Session A
    await rClient.query(`
      SELECT set_config('lamssa.clinic_id', $1, true),
             set_config('lamssa.user_id', $2, true),
             set_config('lamssa.session_id', $3, true)
    `, [clinicB, userA, sessionA]);

    const spoofRes = await rClient.query('SELECT * FROM public."Patient"');
    await rClient.query('ROLLBACK');

    if (spoofRes.rowCount !== 0) {
      throw new Error(`Context spoofing succeeded! Retrieved ${spoofRes.rowCount} rows`);
    }
    console.info('[PASS] Context spoofing attack rejected: context_allows verified Session & Membership tables');

    // -------------------------------------------------------------
    // Test 4: Rollback Reversion Safety
    // -------------------------------------------------------------
    console.info('\n--- Running Test 4: Rollback Reversion Safety ---');
    await rClient.query('BEGIN');
    await rClient.query(`
      SELECT set_config('lamssa.clinic_id', $1, true),
             set_config('lamssa.user_id', $2, true),
             set_config('lamssa.session_id', $3, true)
    `, [clinicA, userA, sessionA]);
    // Simulate error and ROLLBACK
    await rClient.query('ROLLBACK');

    const rollbackGuc = await rClient.query(`SELECT current_setting('lamssa.clinic_id', true) as clinic_id`);
    if (rollbackGuc.rows[0].clinic_id) {
      throw new Error(`GUC persisted after ROLLBACK: ${rollbackGuc.rows[0].clinic_id}`);
    }
    console.info('[PASS] Rollback cleanly reverted transaction-local GUCs');

    // -------------------------------------------------------------
    // Test 5: Session Revocation Fails Closed Immediately
    // -------------------------------------------------------------
    console.info('\n--- Running Test 5: Session Revocation Validation ---');
    // Revoke Session A using migrator
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
      throw new Error('Revoked session was able to access patient records!');
    }
    console.info('[PASS] Revoked session immediately denied by context_allows (fails closed)');

    // -------------------------------------------------------------
    // Test 6: Role Privilege Boundaries (Runtime Denied DDL)
    // -------------------------------------------------------------
    console.info('\n--- Running Test 6: Runtime Role Privilege Boundary ---');
    try {
      await rClient.query('CREATE TABLE public.test_exploit (id int)');
      throw new Error('Runtime role was able to execute DDL CREATE TABLE!');
    } catch (err) {
      if (err.code === '42501') {
        console.info('[PASS] Runtime role denied DDL CREATE TABLE (SQLSTATE 42501 permission denied)');
      } else {
        throw err;
      }
    }

    try {
      await rClient.query('TRUNCATE public."Patient"');
      throw new Error('Runtime role was able to execute TRUNCATE!');
    } catch (err) {
      if (err.code === '42501') {
        console.info('[PASS] Runtime role denied TRUNCATE (SQLSTATE 42501 permission denied)');
      } else {
        throw err;
      }
    }

    // -------------------------------------------------------------
    // Test 7: Prepared Statement Simulation Across Pooled Requests
    // -------------------------------------------------------------
    console.info('\n--- Running Test 7: Parameterized Queries Across Consecutive Transactions ---');
    // Re-activate session B for testing
    for (let i = 0; i < 5; i++) {
      await rClient.query('BEGIN');
      await rClient.query(`
        SELECT set_config('lamssa.clinic_id', $1, true),
               set_config('lamssa.user_id', $2, true),
               set_config('lamssa.session_id', $3, true)
      `, [clinicB, userB, sessionB]);

      const prepRes = await rClient.query(
        'SELECT id, "fullName", "status" FROM public."Patient" WHERE "status" = $1',
        ['ACTIVE']
      );
      if (prepRes.rowCount !== 1 || prepRes.rows[0].id !== patientB) {
        throw new Error(`Parameterized query iteration ${i} failed`);
      }
      await rClient.query('COMMIT');
    }
    console.info('[PASS] 5 consecutive parameterized transactions executed cleanly on single pooled connection');

    console.info('\n\x1b[32m[SUCCESS]\x1b[0m All 7 PostgreSQL connection pooling and tenant-security tests PASSED!\n');
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
