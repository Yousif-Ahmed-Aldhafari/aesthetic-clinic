import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import pg from 'pg';

const envCandidates = [
  resolve(import.meta.dirname, '../../../.env'),
  resolve(import.meta.dirname, '../../../../.env'),
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '../../.env'),
];
for (const p of envCandidates) {
  if (existsSync(p)) {
    config({ path: p, quiet: true });
    break;
  }
}
const enabled = Boolean(process.env.TEST_MIGRATION_DATABASE_URL);
const testPassphrase = 'test-backup-key-for-database-restore-verification-32ch';
const createdFiles: string[] = [];

let runBackup: any;
let runRestore: any;

const clinicIdAlpha = randomUUID();
const clinicIdBeta = randomUUID();
const userIdAlpha = randomUUID();
const userIdBeta = randomUUID();
const patientIdAlpha = randomUUID();
const patientIdBeta = randomUUID();

if (!enabled) {
  test('backup-restore integration tests skipped: no TEST_MIGRATION_DATABASE_URL configured', () => {});
} else {
  before(async () => {
    const scriptsCandidates = [
      resolve(import.meta.dirname, '../../../scripts'),
      resolve(import.meta.dirname, '../../../../scripts'),
      resolve(process.cwd(), 'scripts'),
      resolve(process.cwd(), '../../scripts'),
    ];
    const scriptsDir = scriptsCandidates.find((d) => existsSync(d)) || resolve(process.cwd(), 'scripts');
    const backupScriptPath = resolve(scriptsDir, 'backup-database.mjs');
    const restoreScriptPath = resolve(scriptsDir, 'restore-database.mjs');
    const backupMod = await import(pathToFileURL(backupScriptPath).href);
    const restoreMod = await import(pathToFileURL(restoreScriptPath).href);
    runBackup = backupMod.runBackup;
    runRestore = restoreMod.runRestore;

    // Seed fictional multi-clinic fixtures into lamssa_test
    const client = new pg.Client({ connectionString: process.env.TEST_MIGRATION_DATABASE_URL });
    await client.connect();
    try {
      // 1. Users
      await client.query(`
        INSERT INTO public."User" (id, email, "passwordHash", name, status, "updatedAt")
        VALUES 
          ($1, 'alpha-owner@clinic-fictional.test', 'hash_alpha', 'مدير عيادة ألف', 'ACTIVE', NOW()),
          ($2, 'beta-owner@clinic-fictional.test', 'hash_beta', 'مدير عيادة باء', 'ACTIVE', NOW())
      `, [userIdAlpha, userIdBeta]);

      // 2. Clinics
      await client.query(`
        INSERT INTO public."Clinic" (id, "displayName", "legalName", slug, "contactPhone", "contactEmail", status, currency, timezone, "updatedAt")
        VALUES 
          ($1, 'عيادة النور التجريبية', 'شركة النور لطب التجميل', 'clinic-alpha-backup-verify', '+966500000011', 'alpha@alnoor.test', 'ACTIVE', 'SAR', 'Asia/Riyadh', NOW()),
          ($2, 'عيادة الأمل التجريبية', 'شركة الأمل لطب التجميل', 'clinic-beta-backup-verify', '+966500000022', 'beta@alamal.test', 'ACTIVE', 'SAR', 'Asia/Riyadh', NOW())
      `, [clinicIdAlpha, clinicIdBeta]);

      // 3. Memberships
      await client.query(`
        INSERT INTO public."ClinicMembership" (id, "clinicId", "userId", role, status, "updatedAt")
        VALUES 
          (gen_random_uuid(), $1, $2, 'CLINIC_OWNER', 'ACTIVE', NOW()),
          (gen_random_uuid(), $3, $4, 'CLINIC_OWNER', 'ACTIVE', NOW())
      `, [clinicIdAlpha, userIdAlpha, clinicIdBeta, userIdBeta]);

      // 4. Patients
      await client.query(`
        INSERT INTO public."Patient" (id, "clinicId", "fullName", "searchName", "patientNumber", phone, status, gender, "dateOfBirth", version, "updatedAt")
        VALUES 
          ($1, $2, 'مريضة عيادة ألف', 'مريضة عيادة الف', 'P-000101', '+966551000101', 'ACTIVE', 'FEMALE', '1995-05-15', 1, NOW()),
          ($3, $4, 'مريض عيادة باء', 'مريض عيادة باء', 'P-000202', '+966552000202', 'ACTIVE', 'MALE', '1990-10-20', 1, NOW())
      `, [patientIdAlpha, clinicIdAlpha, patientIdBeta, clinicIdBeta]);

      // 5. Centralized Audit Events
      await client.query(`
        INSERT INTO public."AuditEvent" (id, "clinicId", "actorId", "actorEmail", category, action, outcome, "targetType", "targetId", metadata)
        VALUES 
          (gen_random_uuid(), $1, $2, 'alpha-owner@clinic-fictional.test', 'IDENTITY', 'clinic.profile_updated', 'SUCCESS', 'Clinic', $5, '{"change":"test_alpha"}'),
          (gen_random_uuid(), $3, $4, 'beta-owner@clinic-fictional.test', 'IDENTITY', 'clinic.profile_updated', 'SUCCESS', 'Clinic', $6, '{"change":"test_beta"}')
      `, [clinicIdAlpha, userIdAlpha, clinicIdBeta, userIdBeta, clinicIdAlpha, clinicIdBeta]);
    } finally {
      await client.end().catch(() => {});
    }
  });

  after(async () => {
    // Clean up created backup files
    for (const file of createdFiles) {
      try {
        if (existsSync(file)) unlinkSync(file);
      } catch {}
    }

    // Clean up test fixtures from lamssa_test
    const client = new pg.Client({ connectionString: process.env.TEST_MIGRATION_DATABASE_URL });
    await client.connect();
    try {
      await client.query('DELETE FROM public."AuditEvent" WHERE "clinicId" IN ($1, $2)', [clinicIdAlpha, clinicIdBeta]);
      await client.query('DELETE FROM public."Patient" WHERE id IN ($1, $2)', [patientIdAlpha, patientIdBeta]);
      await client.query('DELETE FROM public."ClinicMembership" WHERE "clinicId" IN ($1, $2)', [clinicIdAlpha, clinicIdBeta]);
      await client.query('DELETE FROM public."Clinic" WHERE id IN ($1, $2)', [clinicIdAlpha, clinicIdBeta]);
      await client.query('DELETE FROM public."ClinicSlugReservation" WHERE slug IN (\'clinic-alpha-backup-verify\', \'clinic-beta-backup-verify\')');
      await client.query('DELETE FROM public."User" WHERE id IN ($1, $2)', [userIdAlpha, userIdBeta]);
    } finally {
      await client.end().catch(() => {});
    }
  });

  test('runBackup creates AES-256-GCM encrypted dump capturing complete multi-clinic data and all public tables', async () => {
    const backupResult = await runBackup({
      target: 'test',
      key: testPassphrase,
    });

    assert(backupResult);
    assert(backupResult.dumpPath);
    assert(backupResult.metaPath);
    createdFiles.push(backupResult.dumpPath, backupResult.metaPath);

    // Verify file existence
    assert(existsSync(backupResult.dumpPath), 'Encrypted dump file must exist');
    assert(existsSync(backupResult.metaPath), 'Metadata file must exist');

    // Verify 0600 permissions
    const dumpStat = statSync(backupResult.dumpPath);
    const metaStat = statSync(backupResult.metaPath);
    assert.equal(dumpStat.mode & 0o777, 0o600, 'Dump file permissions must be 0600');
    assert.equal(metaStat.mode & 0o777, 0o600, 'Meta file permissions must be 0600');

    // Verify metadata contents
    const meta = JSON.parse(readFileSync(backupResult.metaPath, 'utf8'));
    assert.equal(meta.cipher, 'aes-256-gcm');
    assert.equal(meta.kdf, 'scrypt');
    assert.equal(meta.status, 'completed');
    assert(meta.ciphertextSha256);
    assert(meta.plaintextSize > 0);
    assert(meta.ciphertextSize > 0);
    assert.equal(meta.latestMigration, '20261026000600_clinic_mfa_policy_function');
    assert(meta.migrationCount >= 14, 'Must record all applied migrations');

    // Completeness verification: all public tables tracked
    assert(meta.tableCount >= 33, 'Must track all 33+ public tables');
    assert.equal(typeof meta.tableCounts.Clinic, 'number');
    assert.equal(typeof meta.tableCounts.Patient, 'number');
    assert.equal(typeof meta.tableCounts.User, 'number');
    assert.equal(typeof meta.tableCounts.ClinicMembership, 'number');
    assert.equal(typeof meta.tableCounts.AuditEvent, 'number');
    assert(meta.tableCounts.Clinic >= 2, 'Must capture Clinic records from both clinics');
    assert(meta.tableCounts.Patient >= 2, 'Must capture Patient records from both clinics');

    // Verify TOC stats
    assert(meta.tocStats);
    assert(meta.tocStats.tableDataCount >= 33, 'TOC must contain TABLE DATA for all public tables');
    assert(meta.tocStats.policiesCount >= 100, 'TOC must contain RLS security policies');
  });

  test('runBackup security guard rejects unprivileged runtime application users', async () => {
    if (!process.env.TEST_DATABASE_URL) return;

    await assert.rejects(
      runBackup({
        url: process.env.TEST_DATABASE_URL,
        key: testPassphrase,
      }),
      /\[Backup Security Abort\] Runtime application role 'lamssa_test_app' cannot be used for database backups/
    );
  });

  test('runRestore in drill mode verifies decryption, SHA-256, auth tag, and TOC without database mutation', async () => {
    const latestMetaPath = createdFiles.find((f) => f.endsWith('.meta.json'));
    assert(latestMetaPath, 'Metadata file from previous test must exist');

    const restoreResult = await runRestore({
      file: latestMetaPath,
      key: testPassphrase,
      drill: true,
    });

    assert(restoreResult.success);
    assert.equal(restoreResult.mode, 'archive_verification');
    assert(typeof restoreResult.rtoMs === 'number' && restoreResult.rtoMs >= 0);
    assert(typeof restoreResult.rpoMinutes === 'number' && restoreResult.rpoMinutes >= 0);
    assert(restoreResult.verification.migrationMatches);
    assert(restoreResult.verification.tocItemsCount > 0);
  });

  test('runRestore executes genuine restoration into isolated temporary database lamssa_restore_tmp', async () => {
    const latestMetaPath = createdFiles.find((f) => f.endsWith('.meta.json'));
    assert(latestMetaPath, 'Metadata file from previous test must exist');

    try {
      const restoreResult = await runRestore({
        file: latestMetaPath,
        key: testPassphrase,
        targetDb: 'lamssa_restore_tmp',
        drill: false,
        dropAfter: true, // cleans up after test verification
      });

      assert(restoreResult.success);
      assert.equal(restoreResult.mode, 'genuine_restore');
      assert.equal(restoreResult.targetDb, 'lamssa_restore_tmp');
      assert(typeof restoreResult.rtoMs === 'number' && restoreResult.rtoMs > 0);

      // Schema and data verification
      const { verification, runtimeVerification } = restoreResult;
      assert.equal(verification.migrationMatches, true, 'Restored migration must match backup');
      assert.equal(verification.allCountsMatch, true, 'All table row counts must match baseline');
      assert(verification.totalRestoredRows > 0, 'Restored database must contain rows');
      assert.equal(verification.rlsEnforced, true, 'FORCE ROW LEVEL SECURITY must be enforced');
      assert(verification.rlsTablesCount >= 29, 'Must enforce RLS on all tenant tables');
      assert.equal(verification.hasCoreSecurityFunctions, true, 'Core security functions must exist');
      assert.equal(verification.hasPatientConstraints, true, 'Check constraints must exist');

      // Multi-clinic row counts in restored database
      assert(verification.restoredCounts.Clinic >= 2, 'Restored Clinic table must contain both clinics');
      assert(verification.restoredCounts.Patient >= 2, 'Restored Patient table must contain both patients');
      assert(verification.restoredCounts.AuditEvent >= 2, 'Restored AuditEvent table must contain audit records');

      // Runtime user restriction verification
      assert.equal(runtimeVerification.isolationEnforced, true, 'Runtime application role must be blocked without session');
    } catch (err: any) {
      if (err?.code === '42501' && String(err?.message).includes('permission denied to create database')) {
        console.warn('[Real Restore Skipped] PostgreSQL role requires CREATEDB privilege to execute genuine temporary DB restoration.');
        return;
      }
      throw err;
    }
  });

  test('runRestore fails closed with incorrect passphrase', async () => {
    const latestMetaPath = createdFiles.find((f) => f.endsWith('.meta.json'));
    assert(latestMetaPath);

    await assert.rejects(
      runRestore({
        file: latestMetaPath,
        key: 'incorrect-passphrase-attempt',
        drill: true,
      }),
      /authentication tag verification failed/
    );
  });

  test('runRestore safety guard blocks overwriting protected databases without confirmation', async () => {
    const latestMetaPath = createdFiles.find((f) => f.endsWith('.meta.json'));
    assert(latestMetaPath);

    await assert.rejects(
      runRestore({
        file: latestMetaPath,
        key: testPassphrase,
        targetDb: 'lamssa_dev',
      }),
      /\[SAFETY ABORT\] Refusing to overwrite active database 'lamssa_dev'/
    );

    await assert.rejects(
      runRestore({
        file: latestMetaPath,
        key: testPassphrase,
        targetDb: 'lamssa_test',
      }),
      /\[SAFETY ABORT\] Refusing to overwrite active database 'lamssa_test'/
    );
  });
}
