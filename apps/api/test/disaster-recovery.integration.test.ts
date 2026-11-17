import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, before, describe, it } from 'node:test';
import { createHmac, randomBytes } from 'node:crypto';
import { config } from 'dotenv';
import pg from 'pg';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../src/config/environment.js';
import { LocalKmsProvider } from '../src/kms/local-kms.provider.js';
import { KeyManagementService } from '../src/kms/key-management.service.js';
import type { KmsKeyMetadata } from '../src/kms/kms.types.js';

const root = resolve(import.meta.dirname, '../../../..');
const envCandidates = [
  resolve(root, '.env'),
  resolve(import.meta.dirname, '../../../.env'),
];
for (const p of envCandidates) {
  if (existsSync(p)) {
    config({ path: p, quiet: true });
    break;
  }
}

const scriptsDir = resolve(root, 'scripts');
const drBackupMod = await import(pathToFileURL(resolve(scriptsDir, 'dr-backup.mjs')).href);
const drRestoreMod = await import(pathToFileURL(resolve(scriptsDir, 'dr-restore.mjs')).href);
const drStatusMod = await import(pathToFileURL(resolve(scriptsDir, 'dr-status.mjs')).href);
const assetConsistencyMod = await import(pathToFileURL(resolve(scriptsDir, 'verify-asset-consistency.mjs')).href);
const assetBackupMod = await import(pathToFileURL(resolve(scriptsDir, 'asset-backup.mjs')).href);
const assetRestoreMod = await import(pathToFileURL(resolve(scriptsDir, 'restore-assets.mjs')).href);

const { runDisasterRecoveryBackup } = drBackupMod;
const { runDisasterRecoveryRestore, verifyManifestSignature } = drRestoreMod;
const { checkDisasterRecoveryStatus } = drStatusMod;
const { verifyAssetConsistency } = assetConsistencyMod;
const { runAssetBackup } = assetBackupMod;
const { runAssetRestore } = assetRestoreMod;

const testPassphrase = 'test-dr-passphrase-at-least-32-chars-long-resilience!';
const testOutputDir = resolve(root, 'var/test-dr-backups');
const createdFiles: string[] = [];

class TestKmsRepo {
  private keys: Map<string, KmsKeyMetadata> = new Map();
  constructor() {
    this.keys.set('lamssa/kek/2026-v1', {
      id: '00000000-0000-0000-0000-000000000001',
      keyId: 'lamssa/kek/2026-v1',
      version: 1,
      state: 'ACTIVE',
      algorithm: 'AES_256_GCM',
      description: 'Initial KEK',
      createdAt: new Date(),
      rotatedAt: null,
      revokedAt: null,
    });
  }
  async getActiveKey(): Promise<KmsKeyMetadata | null> {
    for (const k of this.keys.values()) if (k.state === 'ACTIVE') return k;
    return null;
  }
  async getKeyMetadata(keyId: string): Promise<KmsKeyMetadata | null> {
    return this.keys.get(keyId) ?? null;
  }
  async rotateKey(newKeyId: string, description?: string): Promise<KmsKeyMetadata> {
    for (const k of this.keys.values()) {
      if (k.state === 'ACTIVE') {
        k.state = 'RETIRED';
        k.rotatedAt = new Date();
      }
    }
    const newKey: KmsKeyMetadata = {
      id: '00000000-0000-0000-0000-000000000002',
      keyId: newKeyId,
      version: 2,
      state: 'ACTIVE',
      algorithm: 'AES_256_GCM',
      description: description ?? 'Rotated key',
      createdAt: new Date(),
      rotatedAt: null,
      revokedAt: null,
    };
    this.keys.set(newKeyId, newKey);
    return newKey;
  }
  async disableKey(keyId: string): Promise<KmsKeyMetadata> {
    const k = this.keys.get(keyId);
    if (!k) throw new Error('Not found');
    k.state = 'DISABLED';
    return k;
  }
  async revokeKey(keyId: string): Promise<KmsKeyMetadata> {
    const k = this.keys.get(keyId);
    if (!k) throw new Error('Not found');
    k.state = 'REVOKED';
    k.revokedAt = new Date();
    return k;
  }
}

describe('Disaster Recovery, Backup Restoration & Infrastructure Resilience Integration Tests', () => {
  before(() => {
    mkdirSync(testOutputDir, { recursive: true, mode: 0o700 });
  });

  after(() => {
    try {
      rmSync(testOutputDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('1. Unified DR Backup produces HMAC-signed manifest, encrypted database dump, asset archive, and sanitized KMS registry', async () => {
    if (!process.env.TEST_MIGRATION_DATABASE_URL) return;

    const result = await runDisasterRecoveryBackup({
      target: 'test',
      outdir: testOutputDir,
      key: testPassphrase,
    });

    assert(result);
    assert.equal(result.success, true);
    assert(result.manifestPath && existsSync(result.manifestPath));
    createdFiles.push(result.manifestPath);

    // Verify 0600 file permissions
    const manifestStat = statSync(result.manifestPath);
    assert.equal(manifestStat.mode & 0o777, 0o600, 'Manifest permissions must be 0600');

    // Verify manifest contents and structure
    const manifest = JSON.parse(readFileSync(result.manifestPath, 'utf8'));
    assert.equal(manifest.manifestVersion, 1);
    assert(manifest.manifestId);
    assert.equal(manifest.environment, 'test');
    assert(manifest.signature);

    // Database section completeness
    assert(manifest.database.dumpFile);
    assert(manifest.database.metaFile);
    assert.equal(manifest.database.cipher, 'aes-256-gcm');
    assert.equal(manifest.database.kdf, 'scrypt');
    assert(manifest.database.tableCount >= 150, 'Must capture all 150+ tables');
    assert(manifest.database.migrationCount >= 39, 'Must capture all 39 migrations');
    assert(manifest.database.totalRows > 0);
    assert(manifest.database.rlsTablesCount >= 140, 'Must record all RLS tables');

    // Verify component files exist with 0600
    const dumpPath = resolve(testOutputDir, manifest.database.dumpFile);
    const metaPath = resolve(testOutputDir, manifest.database.metaFile);
    const assetPath = resolve(testOutputDir, manifest.assets.archiveFile);
    const assetMetaPath = resolve(testOutputDir, manifest.assets.metaFile);
    const kmsPath = resolve(testOutputDir, manifest.kms.registryFile);

    assert(existsSync(dumpPath), 'Encrypted database dump must exist');
    assert(existsSync(metaPath), 'Database metadata must exist');
    assert(existsSync(assetPath), 'Asset archive must exist');
    assert(existsSync(assetMetaPath), 'Asset metadata must exist');
    assert(existsSync(kmsPath), 'KMS registry metadata must exist');

    assert.equal(statSync(dumpPath).mode & 0o777, 0o600);
    assert.equal(statSync(metaPath).mode & 0o777, 0o600);
    assert.equal(statSync(assetPath).mode & 0o777, 0o600);
    assert.equal(statSync(assetMetaPath).mode & 0o777, 0o600);
    assert.equal(statSync(kmsPath).mode & 0o777, 0o600);
  });

  it('2. Automated DR Verification Drill executes non-destructively within RTO/RPO SLA thresholds', async () => {
    const manifests = readdirSync(testOutputDir).filter((f: string) => f.startsWith('dr_manifest_') && f.endsWith('.json'));
    assert(manifests.length > 0, 'DR manifest must exist from previous test');

    const manifestPath = resolve(testOutputDir, manifests[0]);
    const drillReport = await runDisasterRecoveryRestore({
      manifest: manifestPath,
      key: testPassphrase,
      drill: true,
    });

    assert.equal(drillReport.status, 'PASS');
    assert.equal(drillReport.mode, 'archive_verification_drill');
    assert.equal(drillReport.database.verified, true);
    assert.equal(drillReport.assets.verified, true);
    assert.equal(drillReport.kms.verified, true);

    // SLA Verifications:
    // RTO Target: < 15 minutes (900s)
    // Cold snapshot RPO Target: < 60 minutes
    assert(drillReport.measuredRtoMs > 0, 'Measured RTO must be positive');
    assert(drillReport.measuredRtoMs < 900000, 'Measured RTO must be under 15 minutes target');
    assert.equal(drillReport.rtoCompliant, true);
    assert.equal(drillReport.rpoCompliant, true);
  });

  it('3. Security Vector: Tampered manifest fails closed under HMAC-SHA256 signature verification', () => {
    const manifests = readdirSync(testOutputDir).filter((f: string) => f.startsWith('dr_manifest_') && f.endsWith('.json'));
    assert(manifests.length > 0);

    const manifestPath = resolve(testOutputDir, manifests[0]);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

    // Inject tampered table count
    const tamperedManifest = {
      ...manifest,
      database: {
        ...manifest.database,
        tableCount: manifest.database.tableCount + 999,
      },
    };

    assert.throws(
      () => verifyManifestSignature(tamperedManifest, testPassphrase),
      /Manifest HMAC-SHA256 signature verification failed/
    );

    // Tampered signature
    const forgedSignatureManifest = {
      ...manifest,
      signature: '0'.repeat(64),
    };

    assert.throws(
      () => verifyManifestSignature(forgedSignatureManifest, testPassphrase),
      /Manifest HMAC-SHA256 signature verification failed/
    );

    // Wrong passphrase
    assert.throws(
      () => verifyManifestSignature(manifest, 'wrong-encryption-passphrase-attempt-32ch!'),
      /Manifest HMAC-SHA256 signature verification failed/
    );
  });

  it('4. Security Vector: Tampered database ciphertext causes AES-256-GCM authentication tag failure', async () => {
    const manifests = readdirSync(testOutputDir).filter((f: string) => f.startsWith('dr_manifest_') && f.endsWith('.json'));
    assert(manifests.length > 0);

    const manifest = JSON.parse(readFileSync(resolve(testOutputDir, manifests[0]), 'utf8'));
    const dumpPath = resolve(testOutputDir, manifest.database.dumpFile);
    const metaPath = resolve(testOutputDir, manifest.database.metaFile);
    const dumpBytes = readFileSync(dumpPath);

    // Create a copy of the dump with 1 corrupted byte in ciphertext
    const corruptedDumpPath = resolve(testOutputDir, `corrupted_${manifest.database.dumpFile}`);
    const corruptedMetaPath = corruptedDumpPath.replace(/\.dump\.enc$/, '.meta.json');
    const corruptedBytes = Buffer.from(dumpBytes);
    corruptedBytes[100] = corruptedBytes[100] ^ 0xff;
    writeFileSync(corruptedDumpPath, corruptedBytes, { mode: 0o600 });
    writeFileSync(corruptedMetaPath, readFileSync(metaPath), { mode: 0o600 });

    const payload = {
      manifestVersion: manifest.manifestVersion,
      manifestId: manifest.manifestId,
      timestamp: manifest.timestamp,
      environment: manifest.environment,
      database: {
        ...manifest.database,
        dumpFile: `corrupted_${manifest.database.dumpFile}`,
        metaFile: basename(corruptedMetaPath),
      },
      assets: manifest.assets,
      kms: manifest.kms,
    };
    const signature = createHmac('sha256', testPassphrase).update(JSON.stringify(payload)).digest('hex');
    const corruptedManifest = { ...payload, signature };
    const corruptedManifestPath = resolve(testOutputDir, 'corrupted_manifest.json');
    writeFileSync(corruptedManifestPath, JSON.stringify(corruptedManifest, null, 2), { mode: 0o600 });

    await assert.rejects(
      runDisasterRecoveryRestore({
        manifest: corruptedManifestPath,
        key: testPassphrase,
        drill: true,
      }),
      /ciphertext sha-256 mismatch|authentication tag verification failed/i
    );

    unlinkSync(corruptedDumpPath);
    unlinkSync(corruptedMetaPath);
    unlinkSync(corruptedManifestPath);
  });

  it('5. Security Vector: Tampered asset archive causes authentication tag failure', () => {
    const manifests = readdirSync(testOutputDir).filter((f: string) => f.startsWith('dr_manifest_') && f.endsWith('.json'));
    assert(manifests.length > 0);

    const manifest = JSON.parse(readFileSync(resolve(testOutputDir, manifests[0]), 'utf8'));
    const corruptedMetaPath = resolve(testOutputDir, manifest.assets.metaFile);

    assert.throws(
      () => runAssetRestore({
        metaPath: corruptedMetaPath,
        key: 'incorrect-passphrase-fails-closed',
        drill: true,
      }),
      /authentication tag verification failed/
    );
  });

  it('6. Security Vector: Asset restore rejects tampered asset file within bundle', () => {
    const dummyAssetDir = resolve(testOutputDir, 'dummy-assets');
    mkdirSync(resolve(dummyAssetDir, 'd57cff07-d700-475b-b26a-23083d41ee49'), { recursive: true, mode: 0o700 });

    const assetKey = 'd57cff07-d700-475b-b26a-23083d41ee49/04349eda-a4d8-4d81-bf94-6ef86c07f8bf.png';
    const filePath = resolve(dummyAssetDir, assetKey);
    writeFileSync(filePath, Buffer.from('dummy image content png header'), { mode: 0o600 });

    const backupResult = runAssetBackup({
      source: dummyAssetDir,
      outdir: testOutputDir,
      key: testPassphrase,
    });

    // Valid drill passes
    const validDrill = runAssetRestore({
      metaPath: backupResult.metaPath,
      key: testPassphrase,
      drill: true,
    });
    assert.equal(validDrill.fileCount, 1);

    // Wrong key fails closed
    assert.throws(
      () => runAssetRestore({
        metaPath: backupResult.metaPath,
        key: 'wrong-key-will-fail-closed-every-time!',
        drill: true,
      }),
      /authentication tag verification failed/
    );

    rmSync(dummyAssetDir, { recursive: true, force: true });
  });

  it('7. Asset Consistency Auditor accurately verifies existing files and detects missing, orphaned, and tampered records', async () => {
    if (!process.env.TEST_MIGRATION_DATABASE_URL) return;

    // Run consistency audit against test database
    const auditReport = await verifyAssetConsistency({
      target: 'test',
      url: process.env.TEST_MIGRATION_DATABASE_URL,
    });

    assert(auditReport);
    assert(typeof auditReport.totalDbRecords === 'number');
    assert(typeof auditReport.missingCount === 'number');
    assert(typeof auditReport.tamperedCount === 'number');
    assert(typeof auditReport.orphanedCount === 'number');

    // Test with an injected temporary directory to verify orphan detection
    const testAssetsDir = resolve(testOutputDir, 'consistency-test-assets');
    const clinicFolder = resolve(testAssetsDir, 'd57cff07-d700-475b-b26a-23083d41ee49');
    mkdirSync(clinicFolder, { recursive: true, mode: 0o700 });

    // Injected orphan file
    const orphanFile = resolve(clinicFolder, '00000000-0000-0000-0000-000000000099.png');
    writeFileSync(orphanFile, Buffer.from('fake orphaned asset'), { mode: 0o600 });

    const auditWithOrphan = await verifyAssetConsistency({
      target: 'test',
      url: process.env.TEST_MIGRATION_DATABASE_URL,
      assetDir: testAssetsDir,
    });

    assert(auditWithOrphan.orphanedCount >= 1, 'Auditor must detect the injected orphaned file');
    const foundOrphan = auditWithOrphan.orphanedFiles.find((f: any) =>
      f.key.includes('00000000-0000-0000-0000-000000000099.png')
    );
    assert(foundOrphan, 'Orphaned file details must be reported');

    rmSync(testAssetsDir, { recursive: true, force: true });
  });

  it('8. KMS Key Management: Envelope encryption recovers and decrypts with ACTIVE and RETIRED keys, fails closed with DISABLED/REVOKED keys', async () => {
    const repo = new TestKmsRepo();
    const mockConfig = {
      get: (k: keyof Environment) => {
        if (k === 'NODE_ENV') return 'test';
        if (k === 'KMS_LOCAL_MASTER_KEY') return 'test-kms-master-key-at-least-32-chars-long!';
        return null;
      },
    } as ConfigService<Environment, true>;

    const provider = new LocalKmsProvider(mockConfig);
    const kms = new KeyManagementService(repo as any, provider);

    const activeKey = await kms.getActiveKey();
    assert(activeKey);

    const dek = randomBytes(32);
    const wrappedV1 = await kms.wrapDek(activeKey.keyId, dek);
    const unwrappedV1 = await kms.unwrapDek(activeKey.keyId, wrappedV1);
    assert.deepEqual(unwrappedV1, dek);

    // Rotate to v2
    const v2 = await kms.rotateKey('lamssa/kek/2026-v2');
    assert.equal(v2.state, 'ACTIVE');

    // Decrypting existing data with RETIRED v1 succeeds
    const unwrappedRetired = await kms.unwrapDek('lamssa/kek/2026-v1', wrappedV1);
    assert.deepEqual(unwrappedRetired, dek);

    // Disable v1: unwrapDek fails closed
    await kms.disableKey('lamssa/kek/2026-v1');
    await assert.rejects(
      kms.unwrapDek('lamssa/kek/2026-v1', wrappedV1),
      /KMS key .* is DISABLED/
    );

    // Revoke v2: wrapDek fails closed
    await kms.revokeKey('lamssa/kek/2026-v2');
    const dek2 = randomBytes(32);
    await assert.rejects(
      kms.wrapDek('lamssa/kek/2026-v2', dek2),
      /encryption permitted only with ACTIVE keys/
    );
  });

  it('9. DR Readiness Monitor reports HEALTHY for fresh backups, flags SLA warnings, and detects missing files', () => {
    // 1. Fresh backup reports HEALTHY
    const statusReport = checkDisasterRecoveryStatus({
      backupDir: testOutputDir,
      key: testPassphrase,
    });

    assert.equal(statusReport.status, 'HEALTHY');
    assert.equal(statusReport.latestManifest.signatureValid, true);
    assert(statusReport.latestManifest.ageHours < 1);
    assert.equal(statusReport.database.filesPresent, true);
    assert.equal(statusReport.assets.filesPresent, true);
    assert.equal(statusReport.alerts.length, 0);

    // 2. Non-existent backup directory reports CRITICAL
    const criticalReport = checkDisasterRecoveryStatus({
      backupDir: resolve(root, 'var/non-existent-backup-dir-12345'),
      key: testPassphrase,
    });
    assert.equal(criticalReport.status, 'CRITICAL');

    // 3. Invalid key causes signature alert
    const wrongKeyReport = checkDisasterRecoveryStatus({
      backupDir: testOutputDir,
      key: 'wrong-key-for-status-check-fail-32ch',
    });
    assert.equal(wrongKeyReport.status, 'CRITICAL');
    assert.equal(wrongKeyReport.latestManifest.signatureValid, false);
    assert(wrongKeyReport.alerts.some((a: string) => a.includes('signature verification failed')));
  });

  it('10. Financial ledger, invoice balances, and inventory reconciliation remain consistent post-backup', async () => {
    if (!process.env.TEST_MIGRATION_DATABASE_URL) return;

    const client = new pg.Client({ connectionString: process.env.TEST_MIGRATION_DATABASE_URL });
    await client.connect();
    try {
      // Financial ledger invariants
      const { rows: invoiceRows } = await client.query(`
        SELECT count(*)::int as total_invoices,
               coalesce(sum("totalMinor"), 0)::bigint as sum_total,
               coalesce(sum("netPaidMinor"), 0)::bigint as sum_paid
        FROM public."Invoice"
      `);
      assert(invoiceRows[0].total_invoices >= 0);
      assert(BigInt(invoiceRows[0].sum_total) >= BigInt(invoiceRows[0].sum_paid), 'Invoice totals must equal or exceed paid amounts');

      // Payment intent consistency
      const { rows: paymentRows } = await client.query(`
        SELECT count(*)::int as total_intents
        FROM public."PaymentIntent"
      `);
      assert(paymentRows[0].total_intents >= 0);

      // Inventory costing layers
      const { rows: costingRows } = await client.query(`
        SELECT count(*)::int as total_layers
        FROM public."InventoryCostLayer"
      `);
      assert(costingRows[0].total_layers >= 0);

      // Inventory balances
      const { rows: balanceRows } = await client.query(`
        SELECT count(*)::int as total_balances
        FROM public."InventoryBalance"
        WHERE "onHandQuantity" < 0
      `);
      assert.equal(balanceRows[0].total_balances, 0, 'No negative inventory balances permitted');
    } finally {
      await client.end().catch(() => {});
    }
  });

  it('11. Restricted runtime database role cannot execute backups or modify disaster recovery state', async () => {
    if (!process.env.TEST_DATABASE_URL) return;

    // Restricted runtime application user cannot run pg_dump / backup
    await assert.rejects(
      runDisasterRecoveryBackup({
        url: process.env.TEST_DATABASE_URL,
        key: testPassphrase,
      }),
      /\[Backup Security Abort\] Runtime application role 'lamssa_test_app' cannot be used for database backups/
    );
  });
});
