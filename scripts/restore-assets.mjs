import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { calculateSha256, decryptBackup } from './backup-crypto.mjs';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const SAFE_KEY = new RegExp(`^${UUID}/${UUID}\\.(?:png|webp)$`, 'i');

export function runAssetRestore(options = {}) {
  const metaPath = resolve(options.metaPath ?? '');
  const key = options.key ?? process.env.BACKUP_ENCRYPTION_KEY;
  if (!options.metaPath || !key) throw new Error('Asset metadata path and BACKUP_ENCRYPTION_KEY are required.');
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  if (meta.kind !== 'clinic-assets' || meta.version !== 1 || basename(meta.archiveFile) !== meta.archiveFile) {
    throw new Error('Unsupported or unsafe asset backup metadata.');
  }
  const archive = readFileSync(resolve(dirname(metaPath), meta.archiveFile));
  const bundle = JSON.parse(decryptBackup(archive, key, meta).toString('utf8'));
  if (bundle.version !== 1 || !Array.isArray(bundle.files) || bundle.files.length !== meta.fileCount) {
    throw new Error('Asset backup manifest is inconsistent.');
  }
  const seen = new Set();
  let totalBytes = 0;
  for (const file of bundle.files) {
    if (!file || typeof file.key !== 'string' || !SAFE_KEY.test(file.key) || seen.has(file.key)) throw new Error('Unsafe or duplicate asset key.');
    const content = Buffer.from(file.content, 'base64');
    if (content.length !== file.size || calculateSha256(content) !== file.sha256) throw new Error(`Asset integrity check failed: ${file.key}`);
    totalBytes += content.length; seen.add(file.key);
  }
  if (totalBytes !== meta.totalBytes) throw new Error('Asset backup byte count is inconsistent.');
  if (options.drill !== false) return { mode: 'verification', fileCount: seen.size, totalBytes };
  const target = resolve(options.target ?? '');
  if (!options.target || statSync(target, { throwIfNoEntry: false })) throw new Error('Asset restore target must be a new, non-existing directory.');
  const stage = resolve(dirname(target), `.${basename(target)}.restore-${randomUUID()}`);
  mkdirSync(stage, { recursive: false, mode: 0o700 });
  try {
    for (const file of bundle.files) {
      const destination = resolve(stage, file.key);
      mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
      writeFileSync(destination, Buffer.from(file.content, 'base64'), { flag: 'wx', mode: 0o600 });
      chmodSync(destination, 0o600);
    }
    renameSync(stage, target);
  } catch (error) {
    rmSync(stage, { recursive: true, force: true });
    throw error;
  }
  return { mode: 'restore', target, fileCount: seen.size, totalBytes };
}

if (process.argv[1] === import.meta.filename) {
  const args = Object.fromEntries(process.argv.slice(2).map((arg) => arg.split('=', 2)));
  try {
    const result = runAssetRestore({ metaPath: args['--file'], target: args['--target'], drill: args['--restore'] !== 'true' });
    console.info(JSON.stringify({ status: 'ok', ...result }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Asset restore failed.');
    process.exitCode = 1;
  }
}
