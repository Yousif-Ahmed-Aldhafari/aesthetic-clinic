#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import pg from 'pg';
import { decryptBackup } from './backup-crypto.mjs';

const root = resolve(import.meta.dirname, '..');
config({ path: resolve(root, '.env'), quiet: true });

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    file: '',
    targetDb: 'lamssa_restore_tmp',
    targetUrl: '',
    key: process.env.BACKUP_ENCRYPTION_KEY || '',
    drill: false,
    dropAfter: false,
    forceOverwrite: false,
    confirm: '',
    backupDir: resolve(root, 'var/backups'),
  };

  for (const arg of args) {
    if (arg === '--drill' || arg === '--verify-archive') options.drill = true;
    else if (arg === '--drop-after') options.dropAfter = true;
    else if (arg === '--force-destructive-overwrite') options.forceOverwrite = true;
    else if (arg.startsWith('--file=')) options.file = resolve(root, arg.slice(7));
    else if (arg.startsWith('--target-db=')) options.targetDb = arg.slice(12);
    else if (arg.startsWith('--target-url=')) options.targetUrl = arg.slice(13);
    else if (arg.startsWith('--key=')) options.key = arg.slice(6);
    else if (arg.startsWith('--confirm=')) options.confirm = arg.slice(10);
    else if (!arg.startsWith('--') && !options.file) options.file = resolve(root, arg);
  }
  return options;
}

function findLatestBackup(backupDir) {
  if (!existsSync(backupDir)) {
    throw new Error(`Backup directory does not exist: ${backupDir}`);
  }
  const files = readdirSync(backupDir).filter((f) => f.endsWith('.meta.json'));
  if (files.length === 0) {
    throw new Error(`No backup metadata files found in: ${backupDir}`);
  }

  files.sort((a, b) => {
    const statA = statSync(resolve(backupDir, a));
    const statB = statSync(resolve(backupDir, b));
    return statB.mtimeMs - statA.mtimeMs;
  });

  return resolve(backupDir, files[0]);
}

function resolveBackupPaths(fileOption, backupDir) {
  let metaPath = fileOption;
  if (!metaPath) {
    metaPath = findLatestBackup(backupDir);
  } else if (metaPath.endsWith('.dump.enc')) {
    metaPath = metaPath.replace(/\.dump\.enc$/, '.meta.json');
  }

  const dumpPath = metaPath.replace(/\.meta\.json$/, '.dump.enc');
  if (!existsSync(metaPath)) {
    throw new Error(`Backup metadata file not found: ${metaPath}`);
  }
  if (!existsSync(dumpPath)) {
    throw new Error(`Backup ciphertext dump file not found: ${dumpPath}`);
  }

  return { metaPath, dumpPath };
}

// Restore runs with maintenance credentials. Treat sidecar metadata and CLI names
// as untrusted input, even after the ciphertext has authenticated successfully.
export function quoteRestoreIdentifier(value) {
  if (typeof value !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(value)) {
    throw new Error('Unsafe PostgreSQL restore identifier.');
  }
  return `"${value}"`;
}

export function validateRestoreMetadata(meta) {
  if (!meta || meta.status !== 'completed' || meta.cipher !== 'aes-256-gcm' || meta.kdf !== 'scrypt' ||
      !Number.isFinite(Date.parse(meta.timestamp)) ||
      typeof meta.latestMigration !== 'string' || !/^[A-Za-z0-9_]+$/.test(meta.latestMigration) ||
      !Number.isSafeInteger(meta.migrationCount) || meta.migrationCount < 1 ||
      !meta.tableCounts || typeof meta.tableCounts !== 'object' || Array.isArray(meta.tableCounts)) {
    throw new Error('Invalid database backup metadata.');
  }
  const tables = Object.entries(meta.tableCounts);
  if (tables.length === 0 || meta.tableCount !== tables.length) throw new Error('Invalid backup table baseline.');
  let total = 0;
  for (const [table, count] of tables) {
    quoteRestoreIdentifier(table);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid backup row-count baseline.');
    total += count;
  }
  if (!Number.isSafeInteger(total) || total !== meta.totalRows) throw new Error('Invalid backup total-row baseline.');
  if (!Array.isArray(meta.rlsTables) || meta.rlsTables.length === 0 ||
      new Set(meta.rlsTables).size !== meta.rlsTables.length ||
      meta.rlsTables.some((table) => typeof table !== 'string' || !Object.hasOwn(meta.tableCounts, table))) {
    throw new Error('Invalid backup RLS baseline.');
  }
  for (const table of meta.rlsTables) quoteRestoreIdentifier(table);
  if (meta.sourceUser !== undefined) quoteRestoreIdentifier(meta.sourceUser);
  return meta;
}

export function checkExistingRestoreTarget(targetDb, exists, options) {
  quoteRestoreIdentifier(targetDb);
  if (exists && (!options.forceOverwrite || options.confirm !== targetDb)) {
    throw new Error(
      `[SAFETY ABORT] Refusing to overwrite existing database '${targetDb}'. ` +
      `Pass BOTH --force-destructive-overwrite AND --confirm=${targetDb} only under explicit authorization.`
    );
  }
}

function checkSafetyGuards(targetDb, options) {
  quoteRestoreIdentifier(targetDb);
  const protectedDatabases = ['lamssa_dev', 'lamssa_test'];
  const devUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).pathname.slice(1) : '';
  const testUrl = process.env.TEST_DATABASE_URL ? new URL(process.env.TEST_DATABASE_URL).pathname.slice(1) : '';
  if (devUrl) protectedDatabases.push(devUrl);
  if (testUrl) protectedDatabases.push(testUrl);

  const isProtected = protectedDatabases.includes(targetDb);
  if (isProtected) {
    if (!options.forceOverwrite || options.confirm !== targetDb) {
      throw new Error(
        `[SAFETY ABORT] Refusing to overwrite active database '${targetDb}'. ` +
        `To intentionally overwrite, you must pass BOTH --force-destructive-overwrite AND --confirm=${targetDb}.`
      );
    }
    console.warn(`[SAFETY WARNING] Overwriting protected database '${targetDb}' under explicit authorization.`);
  }
}

export function assessRestoredRls(expectedTables, rows) {
  const protectedRows = rows.filter((row) => row.relrowsecurity || row.relforcerowsecurity);
  const actual = new Map(protectedRows.map((row) => [row.tablename, row]));
  const expected = new Set(expectedTables);
  const missingRlsTables = [...expected].filter((table) => {
    const row = actual.get(table);
    return !row?.relrowsecurity || !row?.relforcerowsecurity;
  });
  const unexpectedRlsTables = [...actual.keys()].filter((table) => !expected.has(table));
  return {
    rlsEnforced: expected.size > 0 && missingRlsTables.length === 0 && unexpectedRlsTables.length === 0,
    rlsTablesCount: protectedRows.length,
    missingRlsTables,
    unexpectedRlsTables,
  };
}

async function verifyRestoredDatabase(targetConnectionString, meta) {
  const client = new pg.Client({ connectionString: targetConnectionString });
  await client.connect();

  try {
    // 1. Verify migrations
    const { rows: migRows } = await client.query(
      'SELECT migration_name FROM _prisma_migrations WHERE rolled_back_at IS NULL ORDER BY finished_at DESC'
    );
    const restoredMigration = migRows[0]?.migration_name;
    const migrationCount = migRows.length;
    const migrationMatches = restoredMigration === meta.latestMigration && migrationCount === meta.migrationCount;

    // 2. Verify all table row counts match baseline
    const restoredCounts = {};
    let totalRestoredRows = 0;
    const countMismatches = [];

    const expectedCounts = meta.tableCounts || {};
    for (const [table, expected] of Object.entries(expectedCounts)) {
      try {
        const { rows } = await client.query(`SELECT count(*)::int AS count FROM public.${quoteRestoreIdentifier(table)}`);
        const count = rows[0]?.count ?? 0;
        restoredCounts[table] = count;
        totalRestoredRows += count;
        if (count !== expected) {
          countMismatches.push({ table, expected, got: count });
        }
      } catch (err) {
        restoredCounts[table] = -1;
        countMismatches.push({ table, expected, got: -1, error: err.message });
      }
    }

    // 3. Verify RLS policies and FORCE ROW LEVEL SECURITY
    const { rows: rlsRows } = await client.query(`
      SELECT c.relname AS tablename, c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      ORDER BY c.relname
    `);
    const rlsVerification = assessRestoredRls(meta.rlsTables, rlsRows);

    // 4. Verify triggers
    const { rows: triggerRows } = await client.query(`
      SELECT DISTINCT trigger_name, event_object_table
      FROM information_schema.triggers
      WHERE trigger_schema = 'public' AND trigger_name = 'immutable_clinic'
    `);

    // 5. Verify security functions in lamssa_security via system catalog pg_proc
    const { rows: funcRows } = await client.query(`
      SELECT p.proname AS routine_name
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'lamssa_security'
    `);
    const securityFunctions = funcRows.map((r) => r.routine_name);
    const hasCoreFunctions = ['context_allows', 'reject_clinic_reassignment'].every((f) =>
      securityFunctions.includes(f)
    );

    // 6. Verify constraints
    const { rows: constraintRows } = await client.query(`
      SELECT conname, contype
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND conname = 'patient_values'
    `);
    const hasPatientConstraints = constraintRows.length > 0;

    const allCountsMatch = countMismatches.length === 0;

    return {
      migrationMatches,
      restoredMigration,
      expectedMigration: meta.latestMigration,
      migrationCount,
      allCountsMatch,
      countMismatches,
      restoredCounts,
      totalRestoredRows,
      ...rlsVerification,
      triggersCount: triggerRows.length,
      hasCoreSecurityFunctions: hasCoreFunctions,
      hasPatientConstraints,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

export function isRestrictedRuntimeRole(role) {
  return Boolean(role && role.rolsuper === false && role.rolbypassrls === false &&
    role.rolcreaterole === false && role.owns_application_tables === false &&
    role.can_assume_bypass_role === false && role.has_tenant_context === false);
}

export async function verifyRuntimeRestriction(targetConnectionString, isTestTarget = false, options = {}) {
  const targetUrl = new URL(targetConnectionString);
  const isTest = isTestTarget || targetUrl.pathname.includes('test');

  // The operator may point at a dedicated recovery cluster whose runtime role
  // is not the development/test role. Never rewrite only the database name on
  // an unrelated host and report that connection failure as RLS evidence.
  const appUrl = options.runtimeUrl || process.env.RESTORE_RUNTIME_DATABASE_URL || (isTest
    ? process.env.TEST_DATABASE_URL
    : process.env.DATABASE_URL);

  if (!appUrl) return { skipped: true, connectionSuccessful: false, isolationEnforced: false, reason: 'No recovery runtime database URL configured' };

  const parsedAppUrl = new URL(appUrl);
  const endpoint = (url) => `${url.hostname}:${url.port || '5432'}`;
  if (endpoint(parsedAppUrl) !== endpoint(targetUrl)) {
    return { skipped: true, connectionSuccessful: false, isolationEnforced: false, reason: 'Runtime verification URL does not target the recovery database server' };
  }
  parsedAppUrl.pathname = targetUrl.pathname; // point to targetDb
  const appClient = new pg.Client({ connectionString: parsedAppUrl.toString(), connectionTimeoutMillis: 3000 });

  let connectionSuccessful = false;
  try {
    await appClient.connect();
    connectionSuccessful = true;
    const { rows: [role] } = await appClient.query(`
      SELECT r.rolname, r.rolsuper, r.rolbypassrls, r.rolcreaterole,
        EXISTS (
          SELECT FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname IN ('public', 'lamssa_security') AND c.relkind IN ('r', 'p')
            AND pg_has_role(current_user, c.relowner, 'MEMBER')
        ) AS owns_application_tables,
        EXISTS (
          SELECT FROM pg_roles privileged
          WHERE (privileged.rolsuper OR privileged.rolbypassrls)
            AND pg_has_role(current_user, privileged.oid, 'MEMBER')
        ) AS can_assume_bypass_role,
        (COALESCE(current_setting('lamssa.clinic_id', true), '') <> '' OR
          COALESCE(current_setting('lamssa.user_id', true), '') <> '' OR
          COALESCE(current_setting('lamssa.session_id', true), '') <> '') AS has_tenant_context
      FROM pg_roles r WHERE r.rolname = current_user
    `);
    const roleRestricted = isRestrictedRuntimeRole(role);
    if (!roleRestricted) {
      return { runtimeRole: role?.rolname, connectionSuccessful, roleRestricted: false,
        isolationEnforced: false, reason: 'Recovery runtime role is elevated, owns application tables, or already has tenant context' };
    }
    // Query tenant table without session token -> must return 0 rows under RLS
    const { rows } = await appClient.query('SELECT count(*)::int AS count FROM public."Patient"');
    const visibleCount = rows[0]?.count;
    return {
      runtimeRole: role.rolname,
      connectionSuccessful,
      roleRestricted,
      isolationEnforced: visibleCount === 0,
      visibleRowsWithoutSession: visibleCount,
    };
  } catch (err) {
    // A connection denial, network error, or failed query is absence of evidence.
    // It must never be reported as a successful RLS verification.
    return {
      runtimeRole: decodeURIComponent(parsedAppUrl.username),
      connectionSuccessful,
      isolationEnforced: false,
      errorCode: err.code,
      reason: connectionSuccessful ? 'Runtime isolation query failed' : 'Runtime verification connection failed',
    };
  } finally {
    await appClient.end().catch(() => {});
  }
}

export async function runRestore(cliOptions = {}) {
  const rtoStartTime = Date.now();
  const options = { ...parseArgs(), ...cliOptions };

  const { metaPath, dumpPath } = resolveBackupPaths(options.file, options.backupDir);
  console.info(`[Restore] Loading metadata from: ${metaPath}`);
  console.info(`[Restore] Loading dump from: ${dumpPath}`);

  const meta = validateRestoreMetadata(JSON.parse(readFileSync(metaPath, 'utf8')));
  const ciphertextBuffer = readFileSync(dumpPath);

  let targetConnectionString = options.targetUrl;
  let targetDbName = options.targetDb;

  if (targetConnectionString) {
    const parsed = new URL(targetConnectionString);
    targetDbName = decodeURIComponent(parsed.pathname.slice(1));
  } else {
    const isTestOrTmp = options.targetDb?.includes('test') || options.targetDb?.includes('tmp') || meta.target === 'test';
    const baseMigrationUrl = isTestOrTmp && process.env.TEST_MIGRATION_DATABASE_URL
      ? process.env.TEST_MIGRATION_DATABASE_URL
      : process.env.MIGRATION_DATABASE_URL;

    if (!baseMigrationUrl) {
      throw new Error('MIGRATION_DATABASE_URL is required to construct target restore connection.');
    }
    const parsed = new URL(baseMigrationUrl);
    parsed.pathname = `/${targetDbName}`;
    targetConnectionString = parsed.toString();
  }

  quoteRestoreIdentifier(targetDbName);
  // Pre-restore safety guards
  if (!options.drill) {
    checkSafetyGuards(targetDbName, options);
  }

  const key = options.key || process.env.BACKUP_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('BACKUP_ENCRYPTION_KEY environment variable or --key argument is required for decrypting backups.');
  }

  // Step 1: Pre-decryption integrity verification & AES-256-GCM decryption
  console.info('[Restore] Verifying ciphertext SHA-256 and AES-256-GCM authentication tag...');
  const decryptedBuffer = decryptBackup(ciphertextBuffer, key, meta);
  console.info(`[Restore] Integrity verified successfully. Decrypted ${decryptedBuffer.length} bytes.`);

  // Write temporary dump file for pg_restore (0600 mode)
  const tmpDumpFile = resolve(options.backupDir, `.tmp_restore_${randomUUID()}.dump`);
  writeFileSync(tmpDumpFile, decryptedBuffer, { mode: 0o600 });

  try {
    // Step 2: Validate archive Table of Contents (TOC)
    console.info('[Restore] Inspecting archive table of contents (TOC)...');
    const tocResult = spawnSync('pg_restore', ['-l', tmpDumpFile], {
      maxBuffer: 50 * 1024 * 1024,
    });

    if (tocResult.error) {
      throw new Error(`Failed to inspect archive TOC: ${tocResult.error.message}`);
    }
    if (tocResult.status !== 0) {
      throw new Error(`pg_restore TOC inspection failed: ${tocResult.stderr.toString()}`);
    }

    const tocLines = tocResult.stdout.toString().split('\n').filter((l) => l.trim().length > 0);
    console.info(`[Restore] Archive TOC valid: ${tocLines.length} items present.`);

    const backupTime = new Date(meta.timestamp).getTime();
    const rpoMinutes = Math.round((Date.now() - backupTime) / (1000 * 60));

    // MODE A: Archive Verification Drill
    if (options.drill) {
      const rtoMs = Date.now() - rtoStartTime;
      console.info('------------------------------------------------------------');
      console.info('[Archive Verification Drill] Cryptographic integrity and TOC structure verified.');
      console.info('[Archive Verification Drill] No database was created, restored, or modified.');
      console.info(`[Archive Verification Drill] RTO (Archive Validation): ${rtoMs}ms (${(rtoMs / 1000).toFixed(2)}s)`);
      console.info(`[Archive Verification Drill] RPO (Recovery Point Age): ${rpoMinutes} minute(s)`);
      console.info('------------------------------------------------------------');

      return {
        success: true,
        mode: 'archive_verification',
        rtoMs,
        rpoMinutes,
        verification: {
          migrationVerified: false,
          expectedMigration: meta.latestMigration,
          expectedCounts: meta.tableCounts,
          tocItemsCount: tocLines.length,
        },
      };
    }

    // MODE B: Genuine pg_restore into isolated target database
    console.info(`[Real Restore] Preparing target database '${targetDbName}'...`);
    const adminUrl = new URL(targetConnectionString);
    adminUrl.pathname = '/postgres'; // Connect to maintenance postgres database for DB management
    const adminClient = new pg.Client({ connectionString: adminUrl.toString() });
    await adminClient.connect();

    let targetCreated = false;
    try {
      const { rows: dbRows } = await adminClient.query(
        'SELECT datname FROM pg_database WHERE datname = $1',
        [targetDbName]
      );
      checkExistingRestoreTarget(targetDbName, dbRows.length > 0, options);
      if (dbRows.length === 0) {
        console.info(`[Real Restore] Creating isolated target database '${targetDbName}'...`);
        await adminClient.query(`CREATE DATABASE ${quoteRestoreIdentifier(targetDbName)}`);
        targetCreated = true;
        console.info(`[Real Restore] Database '${targetDbName}' created.`);
      } else {
        console.info(`[Real Restore] Target database '${targetDbName}' already exists.`);
      }
    } finally {
      await adminClient.end().catch(() => {});
    }

    // Execute pg_restore into target database
    const targetUrlParsed = new URL(targetConnectionString);
    const restoreEnv = {
      ...process.env,
      PGHOST: targetUrlParsed.hostname,
      PGPORT: targetUrlParsed.port || '5432',
      PGUSER: decodeURIComponent(targetUrlParsed.username),
      PGPASSWORD: decodeURIComponent(targetUrlParsed.password),
      PGDATABASE: targetDbName,
    };

    console.info(`[Real Restore] Executing pg_restore into '${targetDbName}'...`);
    const restoreResult = spawnSync(
      'pg_restore',
      ['-d', targetDbName, '--no-owner', '--clean', '--if-exists', '--single-transaction', '--exit-on-error', tmpDumpFile],
      {
        env: restoreEnv,
        maxBuffer: 200 * 1024 * 1024,
      }
    );

    if (restoreResult.error) {
      throw new Error(`pg_restore execution failed: ${restoreResult.error.message}`);
    }
    const stderrStr = restoreResult.stderr.toString();
    if (restoreResult.status !== 0) {
      throw new Error(
        `[Real Restore] pg_restore failed with fatal exit code ${restoreResult.status}: ${stderrStr}`
      );
    }
    if (stderrStr.includes('pg_restore: error:')) {
      throw new Error(`[Real Restore] pg_restore reported error: ${stderrStr}`);
    }
    console.info('[Real Restore] pg_restore completed cleanly (exit 0).');

    // Step 3: Deep Verification of restored database
    console.info(`[Real Restore] Verifying schema, data, RLS, and constraints in '${targetDbName}'...`);
    // Verify the database that was actually restored. Ambient development/test
    // credentials may point at another PostgreSQL server and must never be used
    // as evidence for this recovery target.
    const verifyUrl = new URL(targetConnectionString);
    verifyUrl.pathname = `/${targetDbName}`;
    const verifyConnectionString = verifyUrl.toString();

    const verification = await verifyRestoredDatabase(verifyConnectionString, meta);

    if (!verification.migrationMatches) {
      throw new Error(
        `[Restore Verification Failed] Migration mismatch: expected '${meta.latestMigration}', got '${verification.restoredMigration}'.`
      );
    }
    if (!verification.allCountsMatch) {
      throw new Error(
        `[Restore Verification Failed] Row count mismatch: ${JSON.stringify(verification.countMismatches)}`
      );
    }
    if (!verification.rlsEnforced) {
      throw new Error('[Restore Verification Failed] FORCE ROW LEVEL SECURITY not fully enforced on all tenant tables.');
    }
    if (!verification.hasCoreSecurityFunctions) {
      throw new Error('[Restore Verification Failed] Core security functions missing in lamssa_security schema.');
    }
    if (!verification.hasPatientConstraints) {
      throw new Error('[Restore Verification Failed] Patient validation constraints missing.');
    }

    // Step 4: Verify application runtime role restriction post-restore
    console.info('[Real Restore] Verifying application runtime role access isolation...');
    const runtimeVerification = await verifyRuntimeRestriction(targetConnectionString, meta.target === 'test');
    if (!runtimeVerification.connectionSuccessful || !runtimeVerification.roleRestricted || !runtimeVerification.isolationEnforced) {
      const error = new Error(`[Restore Security Failed] Runtime RLS verification was not proven: ${
        runtimeVerification.reason ?? 'runtime role could read protected rows without tenant context'
      }.`);
      error.code = 'RESTORE_RUNTIME_VERIFICATION_BLOCKED';
      error.runtimeVerification = runtimeVerification;
      throw error;
    }

    const rtoMs = Date.now() - rtoStartTime;

    console.info('============================================================');
    console.info(`[Real Restore] SUCCESS: Database '${targetDbName}' fully restored and verified.`);
    console.info(`[Real Restore] Total restored rows: ${verification.totalRestoredRows} across ${Object.keys(verification.restoredCounts).length} tables.`);
    console.info(`[Real Restore] RLS tables verified: ${verification.rlsTablesCount} with FORCE ROW LEVEL SECURITY.`);
    console.info(`[Real Restore] Runtime access isolation: verified (${runtimeVerification.runtimeRole || 'app'} blocked without session).`);
    console.info(`[RTO Metric] Genuine Restore Recovery Time: ${rtoMs}ms (${(rtoMs / 1000).toFixed(2)}s)`);
    console.info(`[RPO Metric] Recovery Point Age: ${rpoMinutes} minute(s)`);
    console.info('============================================================');

    // Drop temporary database if requested
    if (options.dropAfter && targetCreated) {
      console.info(`[Real Restore] Cleaning up temporary database '${targetDbName}'...`);
      const dropClient = new pg.Client({ connectionString: adminUrl.toString() });
      await dropClient.connect();
      try {
        await dropClient.query(`
          SELECT pg_terminate_backend(pid)
          FROM pg_stat_activity
          WHERE datname = $1 AND pid <> pg_backend_pid()
        `, [targetDbName]);
        await dropClient.query(`DROP DATABASE ${quoteRestoreIdentifier(targetDbName)}`);
        console.info(`[Real Restore] Temporary database '${targetDbName}' dropped.`);
      } finally {
        await dropClient.end().catch(() => {});
      }
    }

    return {
      success: true,
      mode: 'genuine_restore',
      targetDb: targetDbName,
      rtoMs,
      rpoMinutes,
      verification,
      runtimeVerification,
    };
  } finally {
    if (existsSync(tmpDumpFile)) {
      rmSync(tmpDumpFile, { force: true });
    }
  }
}

if (process.argv[1] === import.meta.filename) {
  runRestore().catch((error) => {
    console.error(`[Restore Error] ${error.message}`);
    process.exitCode = 1;
  });
}
