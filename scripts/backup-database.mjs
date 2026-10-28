#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import pg from 'pg';
import { encryptBackup } from './backup-crypto.mjs';

const root = resolve(import.meta.dirname, '..');
config({ path: resolve(root, '.env'), quiet: true });

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    target: 'dev',
    outdir: resolve(root, 'var/backups'),
    retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10),
    key: process.env.BACKUP_ENCRYPTION_KEY || '',
    url: '',
  };

  for (const arg of args) {
    if (arg.startsWith('--target=')) options.target = arg.slice(9);
    else if (arg.startsWith('--outdir=')) options.outdir = resolve(root, arg.slice(9));
    else if (arg.startsWith('--retention=')) options.retentionDays = parseInt(arg.slice(12), 10);
    else if (arg.startsWith('--key=')) options.key = arg.slice(6);
    else if (arg.startsWith('--url=')) options.url = arg.slice(6);
  }
  return options;
}

async function collectDatabaseBaseline(connectionString) {
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    // Verify backup user role
    const { rows: userRows } = await client.query('SELECT current_user, session_user');
    const currentUser = userRows[0]?.current_user;

    const unprivilegedAppRoles = new Set(['lamssa_dev_app', 'lamssa_test_app', 'lamssa_app', process.env.RUNTIME_DATABASE_ROLE].filter(Boolean));
    if (unprivilegedAppRoles.has(currentUser)) {
      throw new Error(
        `[Backup Security Abort] Runtime application role '${currentUser}' cannot be used for database backups. ` +
        `Backups must run as the maintenance/migrator owner role (e.g. MIGRATION_DATABASE_URL) to ensure complete capture of RLS-protected tables.`
      );
    }

    // Latest migration and count
    const { rows: migRows } = await client.query(
      'SELECT migration_name, finished_at FROM _prisma_migrations WHERE rolled_back_at IS NULL ORDER BY finished_at DESC'
    );
    const latestMigration = migRows[0]?.migration_name || 'unknown';
    const migrationCount = migRows.length;

    // Discover all public tables dynamically
    const { rows: tableRows } = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);
    const tableNames = tableRows.map((r) => r.tablename);

    const tableCounts = {};
    let totalRows = 0;
    for (const tablename of tableNames) {
      const { rows } = await client.query(`SELECT count(*)::int AS count FROM public."${tablename}"`);
      const count = rows[0]?.count ?? 0;
      tableCounts[tablename] = count;
      totalRows += count;
    }

    // Discover RLS-protected tables
    const { rows: rlsRows } = await client.query(`
      SELECT c.relname AS tablename
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND (c.relrowsecurity OR c.relforcerowsecurity)
      ORDER BY c.relname
    `);
    const rlsTables = rlsRows.map((r) => r.tablename);

    return {
      currentUser,
      latestMigration,
      migrationCount,
      tableNames,
      tableCounts,
      totalRows,
      tableCount: tableNames.length,
      rlsTables,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

function verifyArchiveTableOfContents(plaintextBuffer, baseline, outdir) {
  const tmpFile = resolve(outdir, `.tmp_toc_${randomUUID()}.dump`);
  writeFileSync(tmpFile, plaintextBuffer, { mode: 0o600 });
  try {
    const tocResult = spawnSync('pg_restore', ['-l', tmpFile], {
      maxBuffer: 50 * 1024 * 1024,
    });

    if (tocResult.error) {
      throw new Error(`Failed to inspect archive TOC: ${tocResult.error.message}`);
    }
    if (tocResult.status !== 0) {
      const stderr = tocResult.stderr.toString();
      throw new Error(`pg_restore TOC inspection failed with exit code ${tocResult.status}: ${stderr}`);
    }

    const tocLines = tocResult.stdout.toString('utf8').split('\n');

    // Verify TABLE DATA entries for all public tables
    const tableDataEntries = new Set();
    const policyEntries = [];
    for (const line of tocLines) {
      if (line.includes('TABLE DATA public ')) {
        const match = line.match(/TABLE DATA public ("?[A-Za-z0-9_]+"?)/);
        if (match) {
          tableDataEntries.add(match[1].replace(/"/g, ''));
        }
      } else if (line.includes('POLICY public ')) {
        policyEntries.push(line);
      }
    }

    const missingTables = baseline.tableNames.filter((t) => !tableDataEntries.has(t));
    if (missingTables.length > 0) {
      throw new Error(
        `[Backup Completeness Failure] Archive Table of Contents is missing TABLE DATA for tables: ${missingTables.join(', ')}`
      );
    }

    if (baseline.rlsTables.length > 0 && policyEntries.length === 0) {
      throw new Error('[Backup Completeness Failure] Archive does not contain any RLS security policies.');
    }

    return {
      tocEntriesCount: tocLines.filter((l) => l.trim().length > 0).length,
      tableDataCount: tableDataEntries.size,
      policiesCount: policyEntries.length,
    };
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}

function enforceRetention(outdir, retentionDays) {
  if (retentionDays <= 0) return 0;
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let prunedCount = 0;

  try {
    const files = readdirSync(outdir);
    for (const file of files) {
      if (file.endsWith('.meta.json')) {
        const metaPath = resolve(outdir, file);
        try {
          const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
          const fileTime = new Date(meta.timestamp).getTime();
          if (!isNaN(fileTime) && fileTime < cutoffMs) {
            const dumpPath = metaPath.replace(/\.meta\.json$/, '.dump.enc');
            try { unlinkSync(metaPath); } catch {}
            try { unlinkSync(dumpPath); } catch {}
            prunedCount++;
          }
        } catch {
          const stat = statSync(metaPath);
          if (stat.mtimeMs < cutoffMs) {
            try { unlinkSync(metaPath); } catch {}
            prunedCount++;
          }
        }
      }
    }
  } catch (error) {
    console.warn(`[Retention] Warning: Could not prune old backups: ${error.message}`);
  }
  return prunedCount;
}

export async function runBackup(cliOptions = {}) {
  const startTime = Date.now();
  const options = { ...parseArgs(), ...cliOptions };

  let connectionString = options.url;
  if (!connectionString) {
    if (options.target === 'test') {
      connectionString = process.env.TEST_MIGRATION_DATABASE_URL;
    } else {
      connectionString = process.env.MIGRATION_DATABASE_URL;
    }
  }

  if (!connectionString) {
    throw new Error(`Database connection URL not configured for target: ${options.target}`);
  }

  const encryptionKey = options.key || process.env.BACKUP_ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error('BACKUP_ENCRYPTION_KEY environment variable or --key argument is required for encrypted backups.');
  }

  const dbUrl = new URL(connectionString);
  const database = dbUrl.pathname.replace(/^\//, '');

  console.info(`[Backup] Starting backup for database '${database}' (target: ${options.target})...`);

  // Step 1: Collect comprehensive database baseline
  const baseline = await collectDatabaseBaseline(connectionString);
  console.info(
    `[Backup] Source baseline (${baseline.currentUser}): migration '${baseline.latestMigration}' ` +
    `(${baseline.migrationCount} applied), ${baseline.tableCount} tables, ${baseline.totalRows} total rows, ` +
    `${baseline.rlsTables.length} RLS tables.`
  );

  // Step 2: Execute pg_dump with credentials passed strictly through environment
  const dumpEnv = {
    ...process.env,
    PGHOST: dbUrl.hostname,
    PGPORT: dbUrl.port || '5432',
    PGUSER: dbUrl.username,
    PGPASSWORD: dbUrl.password,
    PGDATABASE: database,
  };

  const dumpResult = spawnSync('pg_dump', ['-Fc', '--enable-row-security'], {
    env: dumpEnv,
    maxBuffer: 500 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (dumpResult.error) {
    throw new Error(`pg_dump process execution failed: ${dumpResult.error.message}`);
  }
  if (dumpResult.status !== 0) {
    const stderr = dumpResult.stderr.toString();
    throw new Error(`pg_dump failed with exit code ${dumpResult.status}: ${stderr}`);
  }

  const plaintextBuffer = dumpResult.stdout;
  if (!plaintextBuffer || plaintextBuffer.length === 0) {
    throw new Error('pg_dump produced empty output buffer.');
  }

  console.info(`[Backup] pg_dump completed: ${plaintextBuffer.length} bytes uncompressed dump.`);

  // Step 3: Ensure directory exists & verify archive Table of Contents before encrypting and writing
  mkdirSync(options.outdir, { recursive: true, mode: 0o700 });
  const tocStats = verifyArchiveTableOfContents(plaintextBuffer, baseline, options.outdir);
  console.info(
    `[Backup] Verified archive TOC: ${tocStats.tocEntriesCount} entries, ` +
    `${tocStats.tableDataCount}/${baseline.tableCount} tables present, ` +
    `${tocStats.policiesCount} RLS policies.`
  );

  // Step 4: Encrypt dump using AES-256-GCM
  const { ciphertext, meta } = encryptBackup(plaintextBuffer, encryptionKey);

  // Step 5: Ensure directory permissions (0700) and atomically write files (0600)
  mkdirSync(options.outdir, { recursive: true, mode: 0o700 });

  const isoTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupId = `backup_${database}_${isoTimestamp}`;
  const dumpFileName = `${backupId}.dump.enc`;
  const metaFileName = `${backupId}.meta.json`;
  const dumpPath = resolve(options.outdir, dumpFileName);
  const metaPath = resolve(options.outdir, metaFileName);

  const fullMeta = {
    backupId,
    timestamp: new Date().toISOString(),
    database,
    target: options.target,
    sourceUser: baseline.currentUser,
    ...meta,
    latestMigration: baseline.latestMigration,
    migrationCount: baseline.migrationCount,
    tableCount: baseline.tableCount,
    totalRows: baseline.totalRows,
    tableCounts: baseline.tableCounts,
    rlsTables: baseline.rlsTables,
    tocStats,
    durationMs: Date.now() - startTime,
    status: 'completed',
  };

  // Atomic file write using temporary files
  const tmpDumpPath = `${dumpPath}.tmp.${randomUUID()}`;
  const tmpMetaPath = `${metaPath}.tmp.${randomUUID()}`;
  try {
    writeFileSync(tmpDumpPath, ciphertext, { mode: 0o600, flag: 'w' });
    writeFileSync(tmpMetaPath, JSON.stringify(fullMeta, null, 2), { mode: 0o600, flag: 'w' });
    renameSync(tmpDumpPath, dumpPath);
    renameSync(tmpMetaPath, metaPath);
  } catch (writeErr) {
    try { unlinkSync(tmpDumpPath); } catch {}
    try { unlinkSync(tmpMetaPath); } catch {}
    throw new Error(`Failed to write backup files atomically: ${writeErr.message}`);
  }

  console.info(`[Backup] Encrypted backup stored: ${dumpPath} (mode 0600)`);
  console.info(`[Backup] Metadata stored: ${metaPath} (mode 0600)`);
  console.info(`[Backup] Ciphertext SHA-256: ${meta.ciphertextSha256}`);

  // Step 6: Enforce retention policy
  const pruned = enforceRetention(options.outdir, options.retentionDays);
  if (pruned > 0) {
    console.info(`[Backup] Retention policy pruned ${pruned} backup(s) older than ${options.retentionDays} day(s).`);
  }

  const totalDuration = Date.now() - startTime;
  console.info(`[Backup] Successfully completed in ${totalDuration}ms.`);

  return {
    backupId,
    dumpPath,
    metaPath,
    meta: fullMeta,
    durationMs: totalDuration,
  };
}

if (process.argv[1] === import.meta.filename) {
  runBackup().catch((error) => {
    console.error(`[Backup Error] ${error.message}`);
    process.exitCode = 1;
  });
}
