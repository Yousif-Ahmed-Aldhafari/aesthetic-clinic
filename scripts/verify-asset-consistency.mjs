#!/usr/bin/env node
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { config } from 'dotenv';
import pg from 'pg';

const root = resolve(import.meta.dirname, '..');
config({ path: resolve(root, '.env'), quiet: true });

function calculateSha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function parseArgs(args = process.argv.slice(2)) {
  const options = {
    target: 'dev',
    url: '',
    assetDir: process.env.ASSET_STORAGE_DIR ?? resolve(root, 'var/clinic-assets'),
    docsDir: resolve(root, 'var/clinic-documents'),
    json: false,
  };
  for (const arg of args) {
    if (arg.startsWith('--target=')) options.target = arg.slice(9);
    else if (arg.startsWith('--url=')) options.url = arg.slice(6);
    else if (arg.startsWith('--asset-dir=')) options.assetDir = resolve(root, arg.slice(12));
    else if (arg.startsWith('--docs-dir=')) options.docsDir = resolve(root, arg.slice(11));
    else if (arg === '--json') options.json = true;
  }
  return options;
}

export async function verifyAssetConsistency(options = {}) {
  const target = options.target ?? 'dev';
  const connectionString =
    options.url ||
    (target === 'test'
      ? process.env.TEST_MIGRATION_DATABASE_URL || process.env.TEST_DATABASE_URL
      : process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL);

  if (!connectionString) {
    throw new Error('Database connection URL is required for asset consistency verification.');
  }

  const assetDir = resolve(options.assetDir ?? process.env.ASSET_STORAGE_DIR ?? resolve(root, 'var/clinic-assets'));
  const docsDir = resolve(options.docsDir ?? resolve(root, 'var/clinic-documents'));

  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
  await client.connect();

  const missingFiles = [];
  const tamperedFiles = [];
  const permissionViolations = [];
  const validFiles = [];

  try {
    // 1. Collect records from DB
    // ClinicalDocument
    const { rows: docRows } = await client.query(`
      SELECT id, "clinicId", "storageKey", "contentSha256", "fileSizeBytes", "documentType"
      FROM public."ClinicalDocument"
      ORDER BY "createdAt" ASC
    `);

    // ClinicalPhoto
    const { rows: photoRows } = await client.query(`
      SELECT id, "clinicId", "storageKey", "thumbnailStorageKey", "sha256Digest"
      FROM public."ClinicalPhoto"
      ORDER BY "takenAt" ASC
    `);

    // ClinicAsset
    const { rows: assetRows } = await client.query(`
      SELECT id, "clinicId", "storageKey", "purpose", "sha256"
      FROM public."ClinicAsset"
    `);

    const expectedKeys = new Map(); // key -> { type, recordId, clinicId, expectedSha256, expectedSize }

    for (const doc of docRows) {
      expectedKeys.set(doc.storageKey, {
        type: 'ClinicalDocument',
        recordId: doc.id,
        clinicId: doc.clinicId,
        expectedSha256: doc.contentSha256,
        expectedSize: Number(doc.fileSizeBytes),
      });
    }

    for (const photo of photoRows) {
      if (photo.storageKey) {
        expectedKeys.set(photo.storageKey, {
          type: 'ClinicalPhoto',
          recordId: photo.id,
          clinicId: photo.clinicId,
          expectedSha256: photo.sha256Digest,
          expectedSize: null,
        });
      }
      if (photo.thumbnailStorageKey) {
        expectedKeys.set(photo.thumbnailStorageKey, {
          type: 'ClinicalPhotoThumbnail',
          recordId: photo.id,
          clinicId: photo.clinicId,
          expectedSha256: null,
          expectedSize: null,
        });
      }
    }

    for (const asset of assetRows) {
      if (asset.storageKey) {
        expectedKeys.set(asset.storageKey, {
          type: 'ClinicAsset',
          recordId: asset.id,
          clinicId: asset.clinicId,
          expectedSha256: asset.sha256?.trim() || null,
          expectedSize: null,
        });
      }
    }

    // 2. Discover all files on disk in assetDir and docsDir
    const diskFiles = new Map(); // key -> absolutePath

    const scanDirectory = (baseDir) => {
      if (!existsSync(baseDir)) return;
      const walk = (currentDir) => {
        const entries = readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = resolve(currentDir, entry.name);
          if (entry.isDirectory()) {
            walk(fullPath);
          } else if (entry.isFile()) {
            const relKey = relative(baseDir, fullPath).split(sep).join('/');
            diskFiles.set(relKey, fullPath);
          }
        }
      };
      walk(baseDir);
    };

    scanDirectory(assetDir);
    scanDirectory(docsDir);

    // 3. Check every expected DB record against disk
    for (const [key, meta] of expectedKeys.entries()) {
      let absolutePath = diskFiles.get(key);

      // Also try direct resolution if not picked up by walk
      if (!absolutePath) {
        const candidateAsset = resolve(assetDir, key);
        const candidateDoc = resolve(docsDir, key);
        if (existsSync(candidateAsset)) absolutePath = candidateAsset;
        else if (existsSync(candidateDoc)) absolutePath = candidateDoc;
      }

      if (!absolutePath || !existsSync(absolutePath)) {
        missingFiles.push({
          key,
          type: meta.type,
          recordId: meta.recordId,
          clinicId: meta.clinicId,
          reason: 'File referenced in database does not exist on storage disk',
        });
        continue;
      }

      // Check permissions
      const stat = statSync(absolutePath);
      const mode = stat.mode & 0o777;
      if (mode !== 0o600 && mode !== 0o640) {
        permissionViolations.push({
          key,
          path: absolutePath,
          mode: mode.toString(8),
          expected: '600 or 640',
        });
      }

      // Read file and verify digest if specified
      const content = readFileSync(absolutePath);
      if (meta.expectedSha256) {
        const actualSha256 = calculateSha256(content);
        if (actualSha256 !== meta.expectedSha256) {
          tamperedFiles.push({
            key,
            type: meta.type,
            recordId: meta.recordId,
            expectedSha256: meta.expectedSha256,
            actualSha256,
            reason: 'File ciphertext SHA-256 digest does not match database record',
          });
          continue;
        }
      }

      validFiles.push({
        key,
        type: meta.type,
        recordId: meta.recordId,
        size: content.length,
      });
    }

    // 4. Identify orphaned files (on disk, not in DB)
    const orphanedFiles = [];
    for (const [key, fullPath] of diskFiles.entries()) {
      // Ignore hidden or temp files
      if (key.includes('/.tmp_') || key.startsWith('.tmp_') || key.endsWith('.tmp')) continue;

      if (!expectedKeys.has(key)) {
        orphanedFiles.push({
          key,
          path: fullPath,
          size: statSync(fullPath).size,
          reason: 'File exists on storage disk but has no corresponding database record',
        });
      }
    }

    const healthy = missingFiles.length === 0 && tamperedFiles.length === 0 && permissionViolations.length === 0;

    return {
      healthy,
      timestamp: new Date().toISOString(),
      target,
      totalDbRecords: expectedKeys.size,
      totalDiskFiles: diskFiles.size,
      verifiedFilesCount: validFiles.length,
      missingCount: missingFiles.length,
      tamperedCount: tamperedFiles.length,
      orphanedCount: orphanedFiles.length,
      permissionViolationsCount: permissionViolations.length,
      missingFiles,
      tamperedFiles,
      orphanedFiles,
      permissionViolations,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

if (process.argv[1] === import.meta.filename) {
  const options = parseArgs();
  verifyAssetConsistency(options)
    .then((result) => {
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log('------------------------------------------------------------');
        console.log(`[Asset Consistency Audit] Target: ${result.target} | Status: ${result.healthy ? 'HEALTHY' : 'DISCREPANCY DETECTED'}`);
        console.log(`[Asset Consistency Audit] DB Records: ${result.totalDbRecords} | Disk Files: ${result.totalDiskFiles} | Verified: ${result.verifiedFilesCount}`);
        console.log(`[Asset Consistency Audit] Missing: ${result.missingCount} | Tampered: ${result.tamperedCount} | Orphaned: ${result.orphanedCount} | Mode Issues: ${result.permissionViolationsCount}`);
        console.log('------------------------------------------------------------');
        if (result.missingFiles.length > 0) {
          console.error('Missing files (in DB, not on disk):', result.missingFiles);
        }
        if (result.tamperedFiles.length > 0) {
          console.error('Tampered files (digest mismatch):', result.tamperedFiles);
        }
        if (result.permissionViolations.length > 0) {
          console.warn('Permission violations (not 0600):', result.permissionViolations);
        }
        if (result.orphanedFiles.length > 0) {
          console.info('Orphaned files (on disk, not in DB):', result.orphanedFiles.length);
        }
      }
      if (!result.healthy) {
        process.exitCode = 1;
      }
    })
    .catch((err) => {
      console.error('[Asset Consistency Error]:', err.message);
      process.exitCode = 1;
    });
}
