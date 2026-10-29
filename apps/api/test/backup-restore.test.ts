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

const scriptsCandidates = [
  resolve(import.meta.dirname, '../../../scripts'),
  resolve(import.meta.dirname, '../../../../scripts'),
  resolve(process.cwd(), 'scripts'),
  resolve(process.cwd(), '../../scripts'),
];
const scriptsDir = scriptsCandidates.find((d) => existsSync(d)) || resolve(process.cwd(), 'scripts');
const restoreMod = await import(pathToFileURL(resolve(scriptsDir, 'restore-database.mjs')).href);
const { quoteRestoreIdentifier, validateRestoreMetadata, checkExistingRestoreTarget,
  assessRestoredRls, isRestrictedRuntimeRole, verifyRuntimeRestriction } = restoreMod;

test('restore identifiers and sidecar baselines reject SQL fragments and incomplete metadata', () => {
  const metadata = {
    status: 'completed', cipher: 'aes-256-gcm', kdf: 'scrypt', timestamp: new Date().toISOString(),
    latestMigration: '20261027000100_privacy_governance', migrationCount: 15,
    tableCounts: { Patient: 2, User: 1 }, tableCount: 2, totalRows: 3,
    rlsTables: ['Patient'], sourceUser: 'lamssa_test_migrator',
  };
  assert.equal(validateRestoreMetadata(metadata), metadata);
  assert.equal(quoteRestoreIdentifier('lamssa_restore_123'), '"lamssa_restore_123"');
  for (const identifier of ['', 'restore"; DROP DATABASE lamssa_test; --', '../lamssa_test', 'x'.repeat(64)]) {
    assert.throws(() => quoteRestoreIdentifier(identifier), /Unsafe PostgreSQL restore identifier/);
  }
  assert.throws(() => validateRestoreMetadata({ ...metadata, tableCounts: { 'Patient"; SELECT 1; --': 2, User: 1 } }), /Unsafe PostgreSQL restore identifier/);
  assert.throws(() => validateRestoreMetadata({ ...metadata, sourceUser: 'x"; SELECT 1; --' }), /Unsafe PostgreSQL restore identifier/);
  assert.throws(() => validateRestoreMetadata({ ...metadata, tableCounts: {}, tableCount: 0, totalRows: 0 }), /Invalid backup table baseline/);
  assert.throws(() => validateRestoreMetadata({ ...metadata, totalRows: 4 }), /Invalid backup total-row baseline/);
  assert.throws(() => validateRestoreMetadata({ ...metadata, rlsTables: [] }), /Invalid backup RLS baseline/);
  assert.throws(() => validateRestoreMetadata({ ...metadata, rlsTables: ['Absent'] }), /Invalid backup RLS baseline/);
});

test('every existing restore target requires both explicit overwrite safeguards', () => {
  assert.doesNotThrow(() => checkExistingRestoreTarget('isolated_restore', false, {}));
  for (const options of [{}, { forceOverwrite: true }, { confirm: 'isolated_restore' },
    { forceOverwrite: true, confirm: 'another_database' }]) {
    assert.throws(() => checkExistingRestoreTarget('isolated_restore', true, options), /Refusing to overwrite existing database/);
  }
  assert.doesNotThrow(() => checkExistingRestoreTarget('isolated_restore', true,
    { forceOverwrite: true, confirm: 'isolated_restore' }));
});

test('restored RLS must cover the exact baseline including tables with both flags removed', () => {
  const rows = [
    { tablename: 'Patient', relrowsecurity: true, relforcerowsecurity: true },
    { tablename: 'ClinicBranding', relrowsecurity: true, relforcerowsecurity: true },
    { tablename: 'User', relrowsecurity: false, relforcerowsecurity: false },
  ];
  assert.equal(assessRestoredRls(['Patient', 'ClinicBranding'], rows).rlsEnforced, true);
  for (const flags of [{ relrowsecurity: false, relforcerowsecurity: false },
    { relrowsecurity: true, relforcerowsecurity: false }]) {
    const result = assessRestoredRls(['Patient', 'ClinicBranding'], [{ ...rows[0], ...flags }, ...rows.slice(1)]);
    assert.equal(result.rlsEnforced, false);
    assert.deepEqual(result.missingRlsTables, ['Patient']);
  }
  assert.equal(assessRestoredRls(['Patient', 'ClinicBranding'], rows.slice(1)).rlsEnforced, false);
  assert.equal(assessRestoredRls([], []).rlsEnforced, false);
  assert.equal(assessRestoredRls(['Patient'], rows).rlsEnforced, false);
});

test('runtime verification refuses privileged, inheriting, owning, or unknown database roles', () => {
  const restricted = { rolsuper: false, rolbypassrls: false, rolcreaterole: false,
    owns_application_tables: false, can_assume_bypass_role: false, has_tenant_context: false };
  assert.equal(isRestrictedRuntimeRole(restricted), true);
  for (const flag of Object.keys(restricted)) assert.equal(isRestrictedRuntimeRole({ ...restricted, [flag]: true }), false);
  assert.equal(isRestrictedRuntimeRole(undefined), false);
  assert.equal(isRestrictedRuntimeRole({}), false);
});

test('unrelated runtime endpoints cannot be accepted as recovered database isolation evidence', async () => {
  const result = await verifyRuntimeRestriction('postgresql://recovery:unused@127.0.0.1:1/recovered', false,
    { runtimeUrl: 'postgresql://runtime:unused@127.0.0.1:2/recovered' });
  assert.equal(result.connectionSuccessful, false);
  assert.equal(result.isolationEnforced, false);
  assert.match(result.reason, /does not target the recovery database server/);
});

const clinicIdAlpha = randomUUID();
const clinicIdBeta = randomUUID();
const userIdAlpha = randomUUID();
const userIdBeta = randomUUID();
const patientIdAlpha = randomUUID();
const patientIdBeta = randomUUID();

if (!enabled) {
  test('backup-restore integration tests', { skip: 'No TEST_MIGRATION_DATABASE_URL configured' }, () => {});
} else {
  before(async () => {
    const backupScriptPath = resolve(scriptsDir, 'backup-database.mjs');
    const backupMod = await import(pathToFileURL(backupScriptPath).href);
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
    assert.equal(meta.latestMigration, '20261029000200_clinical_integrity_hardening');
    assert(meta.migrationCount >= 17, 'Must record all applied migrations');

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

  test('recovered runtime verification proves a real restricted connection sees no patients without tenant context', async (t) => {
    if (!process.env.TEST_DATABASE_URL) return t.skip('No TEST_DATABASE_URL configured');
    const result = await verifyRuntimeRestriction(process.env.TEST_MIGRATION_DATABASE_URL, true,
      { runtimeUrl: process.env.TEST_DATABASE_URL });
    assert.equal(result.connectionSuccessful, true);
    assert.equal(result.roleRestricted, true);
    assert.equal(result.visibleRowsWithoutSession, 0);
    assert.equal(result.isolationEnforced, true);
  });

  test('same-endpoint invalid runtime credentials fail closed instead of proving RLS', async (t) => {
    if (!process.env.TEST_DATABASE_URL) return t.skip('No TEST_DATABASE_URL configured');
    const invalidRuntimeUrl = new URL(process.env.TEST_DATABASE_URL);
    invalidRuntimeUrl.password = randomUUID();
    const result = await verifyRuntimeRestriction(process.env.TEST_MIGRATION_DATABASE_URL, true,
      { runtimeUrl: invalidRuntimeUrl.toString() });
    assert.equal(result.connectionSuccessful, false);
    assert.equal(result.isolationEnforced, false);
    assert.equal(result.errorCode, '28P01');
  });

  test('using the migration owner as recovery runtime fails even if no-context row counts could be zero', async () => {
    const result = await verifyRuntimeRestriction(process.env.TEST_MIGRATION_DATABASE_URL, true,
      { runtimeUrl: process.env.TEST_MIGRATION_DATABASE_URL });
    assert.equal(result.connectionSuccessful, true);
    assert.equal(result.roleRestricted, false);
    assert.equal(result.isolationEnforced, false);
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
    assert.equal(restoreResult.verification.migrationVerified, false, 'Archive inspection must not claim database migration verification');
    assert(restoreResult.verification.tocItemsCount > 0);
  });

  test('runRestore executes genuine restoration into an isolated temporary database', async (t) => {
    const latestMetaPath = createdFiles.find((f) => f.endsWith('.meta.json'));
    assert(latestMetaPath, 'Metadata file from previous test must exist');
    const targetDb = `lamssa_restore_verify_${randomUUID().replaceAll('-', '')}`;
    const expectedMetadata = JSON.parse(readFileSync(latestMetaPath, 'utf8'));

    // Restricted native migration accounts intentionally cannot create databases.
    // Report absent genuine-restore evidence as a skip, not a passing assertion.
    const preflight = new pg.Client({ connectionString: process.env.TEST_MIGRATION_DATABASE_URL });
    await preflight.connect();
    try {
      const { rows: [role] } = await preflight.query('SELECT rolsuper, rolcreatedb FROM pg_roles WHERE rolname = current_user');
      if (!role?.rolsuper && !role?.rolcreatedb) return t.skip('Migration role has no CREATEDB; genuine recovery requires an isolated recovery operator');
    } finally { await preflight.end().catch(() => {}); }

    try {
      const restoreResult = await runRestore({
        file: latestMetaPath,
        key: testPassphrase,
        targetDb,
        drill: false,
        dropAfter: true, // cleans up after test verification
      });

      assert(restoreResult.success);
      assert.equal(restoreResult.mode, 'genuine_restore');
      assert.equal(restoreResult.targetDb, targetDb);
      assert(typeof restoreResult.rtoMs === 'number' && restoreResult.rtoMs > 0);

      // Schema and data verification
      const { verification, runtimeVerification } = restoreResult;
      assert.equal(verification.migrationMatches, true, 'Restored migration must match backup');
      assert.equal(verification.allCountsMatch, true, 'All table row counts must match baseline');
      assert(verification.totalRestoredRows > 0, 'Restored database must contain rows');
      assert.equal(verification.rlsEnforced, true, 'FORCE ROW LEVEL SECURITY must be enforced');
      assert.equal(verification.rlsTablesCount, expectedMetadata.rlsTables.length, 'All baseline RLS tables must be restored');
      assert.equal(verification.migrationCount, expectedMetadata.migrationCount, 'All baseline migrations must be restored');
      assert.equal(verification.hasCoreSecurityFunctions, true, 'Core security functions must exist');
      assert.equal(verification.hasPatientConstraints, true, 'Check constraints must exist');

      // Multi-clinic row counts in restored database
      assert(verification.restoredCounts.Clinic >= 2, 'Restored Clinic table must contain both clinics');
      assert(verification.restoredCounts.Patient >= 2, 'Restored Patient table must contain both patients');
      assert(verification.restoredCounts.AuditEvent >= 2, 'Restored AuditEvent table must contain audit records');

      // Runtime user restriction verification
      assert.equal(runtimeVerification.connectionSuccessful, true, 'RLS verification requires a real runtime connection');
      assert.equal(runtimeVerification.roleRestricted, true, 'Runtime role must be non-owner without elevated privileges');
      assert.equal(runtimeVerification.visibleRowsWithoutSession, 0);
      assert.equal(runtimeVerification.isolationEnforced, true, 'Runtime application role must be blocked without session');
    } catch (err: any) {
      if (err?.code === '42501' && String(err?.message).includes('permission denied to create database')) {
        return t.skip('PostgreSQL denied CREATEDB; genuine temporary restoration was not verified');
      }
      if (err?.code === 'RESTORE_RUNTIME_VERIFICATION_BLOCKED' &&
          err.runtimeVerification?.connectionSuccessful === false && err.runtimeVerification?.errorCode === '42501') {
        return t.skip('Recovery runtime role lacks CONNECT; database restored but runtime isolation was not verified');
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
