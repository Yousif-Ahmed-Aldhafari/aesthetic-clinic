#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { verifyManifestSignature } from './dr-restore.mjs';

const root = resolve(import.meta.dirname, '..');
config({ path: resolve(root, '.env'), quiet: true });

function parseArgs(args = process.argv.slice(2)) {
  const options = {
    backupDir: resolve(root, 'var/backups'),
    key: process.env.BACKUP_ENCRYPTION_KEY || '',
    json: false,
  };
  for (const arg of args) {
    if (arg.startsWith('--backup-dir=')) options.backupDir = resolve(root, arg.slice(13));
    else if (arg.startsWith('--key=')) options.key = arg.slice(6);
    else if (arg === '--json') options.json = true;
  }
  return options;
}

export function checkDisasterRecoveryStatus(options = {}) {
  const backupDir = resolve(options.backupDir ?? resolve(root, 'var/backups'));
  const key = options.key || process.env.BACKUP_ENCRYPTION_KEY;

  if (!existsSync(backupDir)) {
    return {
      status: 'CRITICAL',
      reason: `Backup directory does not exist: ${backupDir}`,
      timestamp: new Date().toISOString(),
    };
  }

  // 1. Check manifests
  const manifests = readdirSync(backupDir).filter((f) => f.startsWith('dr_manifest_') && f.endsWith('.json'));
  if (manifests.length === 0) {
    return {
      status: 'CRITICAL',
      reason: 'No disaster recovery manifests found in backup directory',
      timestamp: new Date().toISOString(),
      manifestCount: 0,
    };
  }

  manifests.sort((a, b) => {
    const statA = statSync(resolve(backupDir, a));
    const statB = statSync(resolve(backupDir, b));
    return statB.mtimeMs - statA.mtimeMs;
  });

  const latestManifestPath = resolve(backupDir, manifests[0]);
  const manifestRaw = readFileSync(latestManifestPath, 'utf8');
  const manifest = JSON.parse(manifestRaw);

  const manifestAgeMs = Date.now() - new Date(manifest.timestamp).getTime();
  const manifestAgeHours = +(manifestAgeMs / 3600000).toFixed(1);

  // Check manifest HMAC signature if key is provided
  let signatureValid = null;
  if (key) {
    try {
      verifyManifestSignature(manifest, key);
      signatureValid = true;
    } catch {
      signatureValid = false;
    }
  }

  // Check component file existence
  const dbDumpExists = existsSync(resolve(backupDir, manifest.database.dumpFile));
  const dbMetaExists = existsSync(resolve(backupDir, manifest.database.metaFile));
  const assetArchiveExists = existsSync(resolve(backupDir, manifest.assets.archiveFile));
  const assetMetaExists = existsSync(resolve(backupDir, manifest.assets.metaFile));

  const allFilesExist = dbDumpExists && dbMetaExists && assetArchiveExists && assetMetaExists;

  let overallStatus = 'HEALTHY';
  const alerts = [];

  if (!allFilesExist) {
    overallStatus = 'CRITICAL';
    alerts.push('One or more backup component files referenced in latest manifest are missing from storage disk');
  }

  if (signatureValid === false) {
    overallStatus = 'CRITICAL';
    alerts.push('Manifest HMAC-SHA256 signature verification failed (possible tampering or incorrect key)');
  }

  if (manifestAgeHours > 48) {
    overallStatus = 'CRITICAL';
    alerts.push(`Latest backup snapshot is ${manifestAgeHours}h old (> 48h SLA breach)`);
  } else if (manifestAgeHours > 24) {
    if (overallStatus !== 'CRITICAL') overallStatus = 'WARNING';
    alerts.push(`Latest backup snapshot is ${manifestAgeHours}h old (> 24h warning threshold)`);
  }

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    latestManifest: {
      id: manifest.manifestId,
      timestamp: manifest.timestamp,
      environment: manifest.environment,
      ageHours: manifestAgeHours,
      signatureValid,
    },
    database: {
      tables: manifest.database.tableCount,
      totalRows: manifest.database.totalRows,
      migrations: manifest.database.migrationCount,
      rlsTables: manifest.database.rlsTablesCount,
      filesPresent: dbDumpExists && dbMetaExists,
    },
    assets: {
      fileCount: manifest.assets.fileCount,
      totalBytes: manifest.assets.totalBytes,
      filesPresent: assetArchiveExists && assetMetaExists,
    },
    kms: {
      keyCount: manifest.kms.keyCount,
      activeKeys: manifest.kms.activeKeys,
    },
    totalManifestsInStorage: manifests.length,
    alerts,
  };
}

if (process.argv[1] === import.meta.filename) {
  const options = parseArgs();
  const report = checkDisasterRecoveryStatus(options);
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('============================================================');
    console.log(`[DR Operational Readiness] Status: ${report.status}`);
    console.log(`[DR Operational Readiness] Timestamp: ${report.timestamp}`);
    if (report.latestManifest) {
      console.log(`[DR Operational Readiness] Snapshot Age: ${report.latestManifest.ageHours}h | Environment: ${report.latestManifest.environment}`);
      console.log(`[DR Operational Readiness] Database: ${report.database.tables} tables, ${report.database.totalRows} rows, ${report.database.migrations} migrations`);
      console.log(`[DR Operational Readiness] Assets: ${report.assets.fileCount} files, ${report.assets.totalBytes} bytes`);
      console.log(`[DR Operational Readiness] KMS: ${report.kms.keyCount} keys registered`);
      console.log(`[DR Operational Readiness] Signature Valid: ${report.latestManifest.signatureValid ?? 'Not checked (no key provided)'}`);
    } else {
      console.log(`[DR Operational Readiness] Reason: ${report.reason}`);
    }
    if (report.alerts && report.alerts.length > 0) {
      console.log('------------------------------------------------------------');
      console.log('Alerts:');
      for (const alert of report.alerts) {
        console.log(`  - [${report.status}] ${alert}`);
      }
    }
    console.log('============================================================');
  }
  if (report.status === 'CRITICAL') {
    process.exitCode = 1;
  }
}
