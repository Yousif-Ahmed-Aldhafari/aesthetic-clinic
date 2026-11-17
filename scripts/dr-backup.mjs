#!/usr/bin/env node
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { createHmac, randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import pg from 'pg';
import { runAssetBackup } from './asset-backup.mjs';

const root = resolve(import.meta.dirname, '..');
config({ path: resolve(root, '.env'), quiet: true });

function parseArgs(args = process.argv.slice(2)) {
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

export async function runDisasterRecoveryBackup(options = {}) {
  const target = options.target ?? 'dev';
  const outdir = resolve(options.outdir ?? resolve(root, 'var/backups'));
  const retentionDays = Number(options.retentionDays ?? 30);
  const key = options.key || process.env.BACKUP_ENCRYPTION_KEY;

  if (!key || key.length < 32) {
    throw new Error('BACKUP_ENCRYPTION_KEY is required and must be at least 32 characters for disaster recovery.');
  }

  mkdirSync(outdir, { recursive: true, mode: 0o700 });

  console.info(`[DR Backup] Starting unified disaster recovery backup for environment '${target}'...`);

  // 1. Database backup via backup-database.mjs
  const backupDbMod = await import('./backup-database.mjs');
  const dbBackupResult = await backupDbMod.runBackup({
    target,
    outdir,
    retentionDays,
    key,
    url: options.url,
  });

  const dbMeta = JSON.parse(readFileSync(dbBackupResult.metaPath, 'utf8'));

  // 2. Asset backup via asset-backup.mjs
  console.info('[DR Backup] Capturing encrypted clinic media, static assets, and documents...');
  const assetBackupResult = runAssetBackup({
    outdir,
    retentionDays,
    key,
  });
  const assetMeta = JSON.parse(readFileSync(assetBackupResult.metaPath, 'utf8'));

  // 3. KMS Key Registry snapshot
  console.info('[DR Backup] Exporting KMS Key Registry metadata (sanitized)...');
  const connectionString =
    options.url ||
    (target === 'test'
      ? process.env.TEST_MIGRATION_DATABASE_URL || process.env.TEST_DATABASE_URL
      : process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL);

  let kmsSnapshot = { totalKeys: 0, activeKeys: 0, keys: [] };

  if (connectionString) {
    const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
    try {
      await client.connect();
      // Check if KmsKeyRegistry exists
      const { rows: tableCheck } = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'KmsKeyRegistry'
        ) as exists
      `);
      if (tableCheck[0]?.exists) {
        const { rows } = await client.query(`
          SELECT id, "keyId", version, state, algorithm, description, "createdAt", "rotatedAt", "revokedAt"
          FROM public."KmsKeyRegistry"
          ORDER BY "createdAt" ASC
        `);
        const active = rows.filter((r) => r.state === 'ACTIVE');
        kmsSnapshot = {
          totalKeys: rows.length,
          activeKeys: active.length,
          keys: rows.map((r) => ({
            id: r.id,
            keyId: r.keyId,
            version: r.version,
            state: r.state,
            algorithm: r.algorithm,
            description: r.description,
            createdAt: r.createdAt,
            rotatedAt: r.rotatedAt,
            revokedAt: r.revokedAt,
          })),
        };
      }
    } catch (err) {
      console.warn(`[DR Backup] Notice: Could not read KmsKeyRegistry (${err.message}). Continuing with empty KMS registry.`);
    } finally {
      await client.end().catch(() => {});
    }
  }

  const timestamp = new Date().toISOString();
  const stamp = timestamp.replace(/[:.]/g, '-');
  const kmsMetaPath = resolve(outdir, `kms_registry_${target}_${stamp}.meta.json`);
  writeFileSync(kmsMetaPath, JSON.stringify(kmsSnapshot, null, 2), { mode: 0o600 });
  chmodSync(kmsMetaPath, 0o600);

  // 4. Assemble unified DR Manifest
  const manifestId = randomUUID();
  const manifestData = {
    manifestVersion: 1,
    manifestId,
    timestamp,
    environment: target,
    database: {
      dumpFile: basename(dbBackupResult.dumpPath),
      metaFile: basename(dbBackupResult.metaPath),
      ciphertextSha256: dbMeta.ciphertextSha256,
      cipher: dbMeta.cipher,
      kdf: dbMeta.kdf,
      latestMigration: dbMeta.latestMigration,
      migrationCount: dbMeta.migrationCount,
      tableCount: dbMeta.tableCount,
      totalRows: dbMeta.totalRows,
      rlsTablesCount: dbMeta.rlsTables?.length ?? 0,
    },
    assets: {
      archiveFile: basename(assetBackupResult.archivePath),
      metaFile: basename(assetBackupResult.metaPath),
      ciphertextSha256: assetMeta.ciphertextSha256,
      fileCount: assetMeta.fileCount,
      totalBytes: assetMeta.totalBytes,
    },
    kms: {
      keyCount: kmsSnapshot.totalKeys,
      activeKeys: kmsSnapshot.activeKeys,
      registryFile: basename(kmsMetaPath),
    },
  };

  // 5. Sign manifest with HMAC-SHA256 using backup encryption key
  const manifestPayload = JSON.stringify(manifestData);
  const signature = createHmac('sha256', key).update(manifestPayload).digest('hex');

  const finalManifest = {
    ...manifestData,
    signature,
  };

  const manifestPath = resolve(outdir, `dr_manifest_${target}_${stamp}.json`);
  const tmpManifest = `${manifestPath}.tmp.${randomUUID()}`;

  try {
    writeFileSync(tmpManifest, JSON.stringify(finalManifest, null, 2), { mode: 0o600 });
    chmodSync(tmpManifest, 0o600);
    renameSync(tmpManifest, manifestPath);
  } catch (err) {
    rmSync(tmpManifest, { force: true });
    throw err;
  }

  console.info(`[DR Backup] Unified DR manifest created: ${manifestPath} (mode 0600)`);
  console.info(`[DR Backup] Database: ${manifestData.database.tableCount} tables, ${manifestData.database.totalRows} rows, ${manifestData.database.migrationCount} migrations`);
  console.info(`[DR Backup] Assets: ${manifestData.assets.fileCount} files, ${manifestData.assets.totalBytes} bytes`);
  console.info(`[DR Backup] KMS: ${manifestData.kms.keyCount} registered keys (${manifestData.kms.activeKeys} active)`);
  console.info(`[DR Backup] HMAC Signature: ${signature.slice(0, 16)}...`);

  // 6. Prune old DR manifests
  const cutoff = Date.now() - retentionDays * 86400000;
  for (const name of readdirSync(outdir).filter((n) => n.startsWith(`dr_manifest_${target}_`) && n.endsWith('.json'))) {
    const candidate = resolve(outdir, name);
    if (candidate === manifestPath) continue;
    try {
      const old = JSON.parse(readFileSync(candidate, 'utf8'));
      if (old.timestamp && new Date(old.timestamp).getTime() < cutoff) {
        unlinkSync(candidate);
      }
    } catch {
      // retain malformed files for review
    }
  }

  return {
    success: true,
    manifestPath,
    manifestId,
    timestamp,
    database: manifestData.database,
    assets: manifestData.assets,
    kms: manifestData.kms,
  };
}

if (process.argv[1] === import.meta.filename) {
  const options = parseArgs();
  runDisasterRecoveryBackup(options)
    .then((result) => {
      console.info(JSON.stringify({ status: 'ok', kind: 'dr-backup', ...result }, null, 2));
    })
    .catch((err) => {
      console.error('[DR Backup Error]:', err.message);
      process.exitCode = 1;
    });
}
