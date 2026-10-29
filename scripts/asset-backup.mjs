import { mkdirSync, readdirSync, readFileSync, renameSync, lstatSync, writeFileSync, chmodSync, rmSync, unlinkSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { encryptBackup, calculateSha256 } from './backup-crypto.mjs';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const SAFE_KEY = new RegExp(`^${UUID}/${UUID}\\.(?:png|webp)$`, 'i');
const MAX_BUNDLE_BYTES = 1024 * 1024 * 1024;

function collect(root) {
  const files = [];
  let totalBytes = 0;
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Asset backup refuses symbolic links: ${entry.name}`);
      if (entry.isDirectory()) { walk(absolute); continue; }
      if (!entry.isFile()) throw new Error(`Asset backup accepts regular files only: ${entry.name}`);
      if (lstatSync(absolute).nlink !== 1) throw new Error(`Asset backup refuses hard-linked files: ${entry.name}`);
      const key = relative(root, absolute).split(sep).join('/');
      if (!SAFE_KEY.test(key)) throw new Error(`Asset backup found an unexpected storage key: ${key}`);
      const content = readFileSync(absolute);
      totalBytes += content.length;
      if (totalBytes > MAX_BUNDLE_BYTES) throw new Error('Asset backup exceeds the 1 GiB local-adapter safety limit. Migrate to object storage.');
      files.push({ key, size: content.length, sha256: calculateSha256(content), content: content.toString('base64') });
    }
  };
  walk(root);
  files.sort((a, b) => a.key.localeCompare(b.key));
  return { files, totalBytes };
}

export function runAssetBackup(options = {}) {
  const source = resolve(options.source ?? process.env.ASSET_STORAGE_DIR ?? 'var/clinic-assets');
  const outdir = resolve(options.outdir ?? process.env.BACKUP_OUTPUT_DIR ?? 'var/backups');
  const key = options.key ?? process.env.BACKUP_ENCRYPTION_KEY;
  const retentionDays = Number(options.retentionDays ?? process.env.BACKUP_RETENTION_DAYS ?? 30);
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) throw new Error('BACKUP_RETENTION_DAYS must be between 1 and 3650.');
  if (!key) throw new Error('BACKUP_ENCRYPTION_KEY is required for encrypted asset backups.');
  const sourceStat = lstatSync(source, { throwIfNoEntry: false });
  if (!sourceStat?.isDirectory() || sourceStat.isSymbolicLink()) throw new Error('ASSET_STORAGE_DIR must be a real existing directory, not a link.');
  mkdirSync(outdir, { recursive: true, mode: 0o700 });
  const { files, totalBytes } = collect(source);
  const createdAt = new Date().toISOString();
  const plaintext = Buffer.from(JSON.stringify({ version: 1, createdAt, files }), 'utf8');
  const encrypted = encryptBackup(plaintext, key);
  const stamp = createdAt.replace(/[:.]/g, '-');
  const id = `assets_${stamp}`;
  const archivePath = resolve(outdir, `${id}.assets.enc`);
  const metaPath = resolve(outdir, `${id}.assets.meta.json`);
  const tempArchive = `${archivePath}.tmp.${randomUUID()}`;
  const tempMeta = `${metaPath}.tmp.${randomUUID()}`;
  const metadata = {
    version: 1, kind: 'clinic-assets', createdAt, fileCount: files.length, totalBytes,
    archiveFile: `${id}.assets.enc`, ...encrypted.meta,
  };
  try {
    writeFileSync(tempArchive, encrypted.ciphertext, { mode: 0o600, flag: 'wx' });
    writeFileSync(tempMeta, `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    chmodSync(tempArchive, 0o600); chmodSync(tempMeta, 0o600);
    renameSync(tempArchive, archivePath); renameSync(tempMeta, metaPath);
  } catch (error) {
    rmSync(tempArchive, { force: true }); rmSync(tempMeta, { force: true });
    throw error;
  }
  const cutoff=Date.now()-retentionDays*86400000;
  let pruned=0;
  for(const name of readdirSync(outdir).filter(name=>name.endsWith('.assets.meta.json'))){
    const candidate=resolve(outdir,name);
    if(candidate===metaPath)continue;
    try{
      const old=JSON.parse(readFileSync(candidate,'utf8'));
      if(old.kind==='clinic-assets'&&new Date(old.createdAt).getTime()<cutoff&&basenameOnly(old.archiveFile)){
        unlinkSync(resolve(outdir,old.archiveFile));unlinkSync(candidate);pruned++;
      }
    }catch{/* retain malformed/unpaired files for operator review */}
  }
  return { archivePath, metaPath, fileCount: files.length, totalBytes, pruned };
}

function basenameOnly(value){return typeof value==='string'&&value.length>0&&!value.includes('/')&&!value.includes('\\');}

if (process.argv[1] === import.meta.filename) {
  try {
    const result = runAssetBackup();
    console.info(JSON.stringify({ status: 'ok', kind: 'clinic-assets', fileCount: result.fileCount, totalBytes: result.totalBytes }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Asset backup failed.');
    process.exitCode = 1;
  }
}
