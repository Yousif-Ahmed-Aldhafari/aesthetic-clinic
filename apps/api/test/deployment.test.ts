import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
const scriptsRoot=resolve(process.cwd(),'../../scripts');
const {runAssetBackup}=await import(pathToFileURL(resolve(scriptsRoot,'asset-backup.mjs')).href) as typeof import('../../../scripts/asset-backup.mjs');
const {runAssetRestore}=await import(pathToFileURL(resolve(scriptsRoot,'restore-assets.mjs')).href) as typeof import('../../../scripts/restore-assets.mjs');

test('encrypted clinic asset backup verifies and restores exact bytes into a new volume', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'lamssa-assets-'));
  const source = resolve(root, 'source'), outdir = resolve(root, 'backups'), target = resolve(root, 'restored');
  const clinicId = randomUUID(), assetId = randomUUID(), key = randomBytes(48).toString('base64url');
  const asset = Buffer.from('synthetic-webp-test-bytes');
  mkdirSync(resolve(source, clinicId), { recursive: true });
  writeFileSync(resolve(source, clinicId, `${assetId}.webp`), asset);
  try {
    const backup = runAssetBackup({ source, outdir, key });
    assert.equal(backup.fileCount, 1);
    assert.equal(readFileSync(backup.archivePath).includes(asset), false, 'archive must not contain plaintext asset bytes');
    assert.deepEqual(runAssetRestore({ metaPath: backup.metaPath, key }), { mode: 'verification', fileCount: 1, totalBytes: asset.length });
    const restored = runAssetRestore({ metaPath: backup.metaPath, target, key, drill: false });
    assert.equal(restored.mode, 'restore');
    assert.deepEqual(readFileSync(resolve(target, clinicId, `${assetId}.webp`)), asset);
    assert.throws(() => runAssetRestore({ metaPath: backup.metaPath, target: resolve(root, 'wrong'), key: 'wrong-key', drill: false }), /authentication tag verification failed/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('asset backup refuses symlinks and unexpected storage keys', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'lamssa-assets-'));
  const source = resolve(root, 'source'), outdir = resolve(root, 'backups'), clinicId = randomUUID();
  mkdirSync(resolve(source, clinicId), { recursive: true });
  writeFileSync(resolve(root, 'outside'), 'private');
  symlinkSync(resolve(root, 'outside'), resolve(source, clinicId, `${randomUUID()}.png`));
  try { assert.throws(() => runAssetBackup({ source, outdir, key: randomBytes(48).toString('base64url') }), /symbolic links/); }
  finally { rmSync(root, { recursive: true, force: true }); }
});
