#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { config } from 'dotenv';
import { runAssetRestore } from './restore-assets.mjs';

const root = resolve(import.meta.dirname, '..');
config({ path: resolve(root, '.env'), quiet: true });

function parseArgs(args = process.argv.slice(2)) {
  const options = {
    manifest: '',
    key: process.env.BACKUP_ENCRYPTION_KEY || '',
    drill: true,
    restore: false,
    targetDb: 'lamssa_dr_restore_tmp',
    targetAssets: '',
    dropAfter: false,
    forceOverwrite: false,
    confirm: '',
    backupDir: resolve(root, 'var/backups'),
  };

  for (const arg of args) {
    if (arg === '--drill' || arg === '--verify-archive') {
      options.drill = true;
      options.restore = false;
    } else if (arg === '--restore') {
      options.restore = true;
      options.drill = false;
    } else if (arg === '--drop-after') {
      options.dropAfter = true;
    } else if (arg === '--force-destructive-overwrite') {
      options.forceOverwrite = true;
    } else if (arg.startsWith('--manifest=')) {
      options.manifest = resolve(root, arg.slice(11));
    } else if (arg.startsWith('--target-db=')) {
      options.targetDb = arg.slice(12);
    } else if (arg.startsWith('--target-assets=')) {
      options.targetAssets = resolve(root, arg.slice(16));
    } else if (arg.startsWith('--key=')) {
      options.key = arg.slice(6);
    } else if (arg.startsWith('--confirm=')) {
      options.confirm = arg.slice(10);
    } else if (arg.startsWith('--backup-dir=')) {
      options.backupDir = resolve(root, arg.slice(13));
    } else if (!arg.startsWith('--') && !options.manifest) {
      options.manifest = resolve(root, arg);
    }
  }
  return options;
}

function findLatestManifest(backupDir) {
  if (!existsSync(backupDir)) {
    throw new Error(`Backup directory does not exist: ${backupDir}`);
  }
  const files = readdirSync(backupDir).filter((f) => f.startsWith('dr_manifest_') && f.endsWith('.json'));
  if (files.length === 0) {
    throw new Error(`No disaster recovery manifests found in: ${backupDir}`);
  }
  files.sort((a, b) => {
    const statA = statSync(resolve(backupDir, a));
    const statB = statSync(resolve(backupDir, b));
    return statB.mtimeMs - statA.mtimeMs;
  });
  return resolve(backupDir, files[0]);
}

export function verifyManifestSignature(manifestRaw, key) {
  const manifest = typeof manifestRaw === 'string' ? JSON.parse(manifestRaw) : manifestRaw;
  const { signature, ...payload } = manifest;

  if (!signature || typeof signature !== 'string') {
    throw new Error('[DR Security Abort] Manifest is missing cryptographic HMAC signature.');
  }

  const expectedHmac = createHmac('sha256', key).update(JSON.stringify(payload)).digest('hex');

  const bufActual = Buffer.from(signature, 'hex');
  const bufExpected = Buffer.from(expectedHmac, 'hex');

  if (bufActual.length !== bufExpected.length || !timingSafeEqual(bufActual, bufExpected)) {
    throw new Error('[DR Security Abort] Manifest HMAC-SHA256 signature verification failed. Manifest has been tampered with or key is incorrect.');
  }

  return payload;
}

export async function runDisasterRecoveryRestore(options = {}) {
  const backupDir = resolve(options.backupDir ?? resolve(root, 'var/backups'));
  const manifestPath = options.manifest ? resolve(options.manifest) : findLatestManifest(backupDir);
  const key = options.key || process.env.BACKUP_ENCRYPTION_KEY;
  const isDrill = options.drill !== false && !options.restore;

  if (!key || key.length < 32) {
    throw new Error('BACKUP_ENCRYPTION_KEY is required and must be at least 32 characters for disaster recovery.');
  }

  if (!existsSync(manifestPath)) {
    throw new Error(`Disaster recovery manifest not found: ${manifestPath}`);
  }

  const manifestContent = readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestContent);

  console.info(`[DR Restore] Loading manifest: ${manifestPath}`);
  console.info(`[DR Restore] Manifest ID: ${manifest.manifestId} | Created: ${manifest.timestamp} | Mode: ${isDrill ? 'DRILL (Archive Verification)' : 'GENUINE RESTORE'}`);

  // 1. Verify manifest signature
  verifyManifestSignature(manifest, key);
  console.info('[DR Restore] Manifest cryptographic HMAC-SHA256 signature verified successfully.');

  const manifestDir = dirname(manifestPath);

  // 2. Resolve component paths
  const dbMetaPath = resolve(manifestDir, manifest.database.metaFile);
  const dbDumpPath = resolve(manifestDir, manifest.database.dumpFile);
  const assetMetaPath = resolve(manifestDir, manifest.assets.metaFile);
  const assetArchivePath = resolve(manifestDir, manifest.assets.archiveFile);
  const kmsMetaPath = resolve(manifestDir, manifest.kms.registryFile);

  if (!existsSync(dbMetaPath) || !existsSync(dbDumpPath)) {
    throw new Error(`Database backup artifacts missing from manifest bundle: ${dbMetaPath} or ${dbDumpPath}`);
  }
  if (!existsSync(assetMetaPath) || !existsSync(assetArchivePath)) {
    throw new Error(`Asset backup artifacts missing from manifest bundle: ${assetMetaPath} or ${assetArchivePath}`);
  }

  const startTime = performance.now();

  // 3. Drill mode: non-destructive verification
  if (isDrill) {
    console.info('[DR Restore] Commencing non-destructive Disaster Recovery Verification Drill...');

    // A. Database archive verification
    const restoreDbMod = await import('./restore-database.mjs');
    const dbResult = await restoreDbMod.runRestore({
      file: dbMetaPath,
      key,
      drill: true,
    });

    if (!dbResult.success) {
      throw new Error(`Database archive verification failed: ${dbResult.error || 'Unknown error'}`);
    }

    // B. Asset archive verification
    const assetResult = runAssetRestore({
      metaPath: assetMetaPath,
      key,
      drill: true,
    });

    // C. KMS Key Registry check
    let kmsValid = false;
    let kmsKeysCount = 0;
    if (existsSync(kmsMetaPath)) {
      const kmsData = JSON.parse(readFileSync(kmsMetaPath, 'utf8'));
      kmsKeysCount = kmsData.totalKeys ?? 0;
      kmsValid = true;
    }

    const endTime = performance.now();
    const rtoMs = Math.round(endTime - startTime);
    const rpoMinutes = Math.max(0, Math.round((Date.now() - new Date(manifest.timestamp).getTime()) / 60000));

    // Target SLAs
    const targetRtoMs = 15 * 60 * 1000; // 15 minutes
    const targetRpoMinutes = 60; // 1 hour for cold snapshot

    const drillReport = {
      status: 'PASS',
      mode: 'archive_verification_drill',
      manifestId: manifest.manifestId,
      manifestTimestamp: manifest.timestamp,
      measuredRtoMs: rtoMs,
      measuredRtoSeconds: (rtoMs / 1000).toFixed(2),
      measuredRpoMinutes: rpoMinutes,
      rtoCompliant: rtoMs < targetRtoMs,
      rpoCompliant: rpoMinutes <= targetRpoMinutes,
      targets: {
        targetRtoMinutes: 15,
        targetRpoMinutes: 60,
      },
      database: {
        verified: true,
        cipher: manifest.database.cipher,
        tableCount: manifest.database.tableCount,
        totalRows: manifest.database.totalRows,
        migrationCount: manifest.database.migrationCount,
        rlsTablesCount: manifest.database.rlsTablesCount,
        tocItems: dbResult.verification.tocItemsCount,
      },
      assets: {
        verified: true,
        fileCount: assetResult.fileCount,
        totalBytes: assetResult.totalBytes,
      },
      kms: {
        verified: kmsValid,
        keyCount: kmsKeysCount,
      },
    };

    console.info('------------------------------------------------------------');
    console.info(`[DR Drill Result] Status: ${drillReport.status}`);
    console.info(`[DR Drill Result] RTO Measured: ${drillReport.measuredRtoSeconds}s (Target: < 15 min, Compliant: ${drillReport.rtoCompliant})`);
    console.info(`[DR Drill Result] RPO Measured: ${drillReport.measuredRpoMinutes} min (Target: < 60 min, Compliant: ${drillReport.rpoCompliant})`);
    console.info(`[DR Drill Result] Database: ${drillReport.database.tableCount} tables, ${drillReport.database.totalRows} rows, ${drillReport.database.rlsTablesCount} RLS tables`);
    console.info(`[DR Drill Result] Assets: ${drillReport.assets.fileCount} files, ${drillReport.assets.totalBytes} bytes`);
    console.info(`[DR Drill Result] KMS: ${drillReport.kms.keyCount} keys`);
    console.info('------------------------------------------------------------');

    return drillReport;
  }

  // 4. Genuine restoration mode
  console.info('[DR Restore] Commencing genuine restoration into isolated infrastructure...');
  const targetDb = options.targetDb || `lamssa_dr_${manifest.manifestId.replaceAll('-', '')}`;

  const restoreDbMod = await import('./restore-database.mjs');
  const dbRestoreResult = await restoreDbMod.runRestore({
    file: dbMetaPath,
    key,
    targetDb,
    drill: false,
    dropAfter: options.dropAfter,
    forceOverwrite: options.forceOverwrite,
    confirm: options.confirm,
  });

  let assetRestoreResult = null;
  if (options.targetAssets) {
    assetRestoreResult = runAssetRestore({
      metaPath: assetMetaPath,
      key,
      target: options.targetAssets,
      drill: false,
    });
  }

  const endTime = performance.now();
  const rtoMs = Math.round(endTime - startTime);

  return {
    status: 'PASS',
    mode: 'genuine_restore',
    manifestId: manifest.manifestId,
    measuredRtoMs: rtoMs,
    targetDb,
    targetAssets: options.targetAssets,
    database: dbRestoreResult,
    assets: assetRestoreResult,
  };
}

if (process.argv[1] === import.meta.filename) {
  const options = parseArgs();
  runDisasterRecoveryRestore(options)
    .then((result) => {
      console.info(JSON.stringify({ status: 'ok', kind: 'dr-restore', ...result }, null, 2));
    })
    .catch((err) => {
      console.error('[DR Restore Error]:', err.message);
      process.exitCode = 1;
    });
}
