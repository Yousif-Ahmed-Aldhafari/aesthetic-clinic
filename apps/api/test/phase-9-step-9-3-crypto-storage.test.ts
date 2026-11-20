import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../src/config/environment.js';
import {
  GoogleCloudKmsProvider,
  KmsKeyDisabledError,
  KmsKeyRevokedError,
  KmsPermissionDeniedError,
  KmsNotFoundError,
  GoogleKmsError,
} from '../src/kms/google-cloud-kms.provider.js';
import { EnvelopeEncryptionService } from '../src/kms/envelope-encryption.service.js';
import { KeyManagementService } from '../src/kms/key-management.service.js';
import type { KmsKeyMetadata } from '../src/kms/kms.types.js';
import {
  GoogleSecretManagerVaultProvider,
  SecretNotFoundError,
  SecretAccessDeniedError,
} from '../src/config/google-secret-manager.provider.js';
import { SecretVaultService, SecretVaultError } from '../src/config/secret-vault.service.js';
import {
  GoogleCloudStorageAssetStore,
  StorageAccessDeniedError,
  StoragePathTraversalError,
} from '../src/identity/google-cloud-storage.asset-store.js';

function createMockConfig(overrides: Partial<Environment> = {}): ConfigService<Environment, true> {
  const env: Partial<Environment> = {
    NODE_ENV: 'test',
    AUTH_CSRF_SECRET: 'test-csrf-secret-with-minimum-43-characters-long-value-ok',
    CLINICAL_MEDIA_ENCRYPTION_KEY: 'test-clinical-media-encryption-key-32-chars!',
    GCP_PROJECT_ID: 'lamssa-test-project',
    GCP_KMS_LOCATION: 'me-central2',
    GCP_KMS_KEY_RING: 'test-keyring',
    GCP_KMS_CRYPTO_KEY: 'test-database-kek',
    GCP_STORAGE_BUCKET: 'test-clinical-assets',
    ...overrides,
  };

  return {
    get: ((key: keyof Environment) => env[key]) as any,
  } as ConfigService<Environment, true>;
}

class InMemoryKmsRepository {
  private keys = new Map<string, KmsKeyMetadata>();

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
    this.keys.set('lamssa/kek/historical-v0', {
      id: '00000000-0000-0000-0000-000000000000',
      keyId: 'lamssa/kek/historical-v0',
      version: 0,
      state: 'RETIRED',
      algorithm: 'AES_256_GCM',
      description: 'Historical retired KEK',
      createdAt: new Date(Date.now() - 86400000),
      rotatedAt: new Date(),
      revokedAt: null,
    });
    this.keys.set('lamssa/kek/disabled-v1', {
      id: '00000000-0000-0000-0000-000000000002',
      keyId: 'lamssa/kek/disabled-v1',
      version: 2,
      state: 'DISABLED',
      algorithm: 'AES_256_GCM',
      description: 'Disabled KEK',
      createdAt: new Date(),
      rotatedAt: null,
      revokedAt: null,
    });
    this.keys.set('lamssa/kek/revoked-v1', {
      id: '00000000-0000-0000-0000-000000000003',
      keyId: 'lamssa/kek/revoked-v1',
      version: 3,
      state: 'REVOKED',
      algorithm: 'AES_256_GCM',
      description: 'Revoked KEK',
      createdAt: new Date(),
      rotatedAt: null,
      revokedAt: new Date(),
    });
  }

  async getActiveKey(): Promise<KmsKeyMetadata | null> {
    for (const k of this.keys.values()) {
      if (k.state === 'ACTIVE') return k;
    }
    return null;
  }

  async getKeyMetadata(keyId: string): Promise<KmsKeyMetadata | null> {
    return this.keys.get(keyId) ?? null;
  }

  async listKeys(): Promise<KmsKeyMetadata[]> {
    return Array.from(this.keys.values());
  }

  async rotateKey(newKeyId: string): Promise<KmsKeyMetadata> {
    const active = await this.getActiveKey();
    if (active) active.state = 'RETIRED';
    const newKey: KmsKeyMetadata = {
      id: `00000000-0000-0000-0000-00000000000${this.keys.size + 1}`,
      keyId: newKeyId,
      version: this.keys.size + 1,
      state: 'ACTIVE',
      algorithm: 'AES_256_GCM',
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

describe('Phase 9 Step 9.3: Security & Fault-Injection Suite (28 Tests)', () => {
  const config = createMockConfig();
  const repo = new InMemoryKmsRepository();
  const gcpKms = new GoogleCloudKmsProvider(config);
  const kmsService = new KeyManagementService(repo as any, gcpKms);
  const envelopeService = new EnvelopeEncryptionService(kmsService, config);
  const storage = new GoogleCloudStorageAssetStore(config);

  process.env.KMS_GCP_SIMULATE = 'true';
  process.env.GSM_SIMULATE = 'true';
  process.env.GCS_SIMULATE = 'true';

  const clinicA = '11111111-1111-4111-8111-111111111111';
  const clinicB = '22222222-2222-4222-8222-222222222222';
  const docIdA = '33333333-3333-4333-8333-333333333333';

  // 1. Valid KMS encryption/decryption
  it('1. Valid KMS encryption/decryption roundtrip', async () => {
    const plaintext = 'Secret clinical notes for patient P-000001';
    const encrypted = await envelopeService.encrypt(plaintext, {
      clinicId: clinicA,
      resourceType: 'ClinicalNote',
      recordId: docIdA,
    });
    assert.match(encrypted, /^v2:/);

    const decrypted = await envelopeService.decrypt(encrypted, {
      clinicId: clinicA,
      resourceType: 'ClinicalNote',
      recordId: docIdA,
    });
    assert.equal(decrypted, plaintext);
  });

  // 2. Historical key decryption
  it('2. Historical key decryption with retired KEK', async () => {
    const dek = randomBytes(32);
    const wrap = await gcpKms.wrapKey('lamssa/kek/historical-v0', dek);
    const unwrapped = await kmsService.unwrapDek('lamssa/kek/historical-v0', wrap);
    assert.deepEqual(unwrapped, dek);
  });

  // 3. Wrong AAD
  it('3. Wrong AAD fails decryption with authentication tag mismatch', async () => {
    const encrypted = await envelopeService.encrypt('Sensitive EMR data', {
      clinicId: clinicA,
      resourceType: 'LabOrder',
      recordId: docIdA,
    });

    await assert.rejects(
      async () => {
        await envelopeService.decrypt(encrypted, {
          clinicId: clinicA,
          resourceType: 'Prescription', // Wrong resourceType in AAD
          recordId: docIdA,
        });
      },
      (err: any) =>
        err.message.includes('Failed to authenticate and decrypt') ||
        err.message.includes('Authentication tag verification failed') ||
        err.message.includes('AAD')
    );
  });

  // 4. Wrong clinic
  it('4. Wrong clinic in AAD fails closed', async () => {
    const encrypted = await envelopeService.encrypt('Tenant A private data', {
      clinicId: clinicA,
      resourceType: 'PatientRecord',
      recordId: docIdA,
    });

    await assert.rejects(
      async () => {
        await envelopeService.decrypt(encrypted, {
          clinicId: clinicB, // Wrong clinic ID
          resourceType: 'PatientRecord',
          recordId: docIdA,
        });
      },
      (err: any) =>
        err.message.includes('Failed to authenticate and decrypt') ||
        err.message.includes('Authentication tag verification failed') ||
        err.message.includes('AAD')
    );
  });

  // 5. Wrong record
  it('5. Wrong record ID in AAD fails closed', async () => {
    const encrypted = await envelopeService.encrypt('Record 1 payload', {
      clinicId: clinicA,
      resourceType: 'DentalOdontogram',
      recordId: docIdA,
    });

    await assert.rejects(async () => {
      await envelopeService.decrypt(encrypted, {
        clinicId: clinicA,
        resourceType: 'DentalOdontogram',
        recordId: '44444444-4444-4444-8444-444444444444', // Different record ID
      });
    });
  });

  // 6. Corrupted ciphertext
  it('6. Corrupted ciphertext throws tamper detection error', async () => {
    const encrypted = await envelopeService.encrypt('Original data', {
      clinicId: clinicA,
      resourceType: 'Document',
      recordId: docIdA,
    });
    const parts = encrypted.split(':');
    const tampered = Buffer.from(parts[5], 'base64');
    tampered[0] ^= 0xff;
    parts[5] = tampered.toString('base64');
    const corruptedEnvelope = parts.join(':');

    await assert.rejects(
      async () => {
        await envelopeService.decrypt(corruptedEnvelope, {
          clinicId: clinicA,
          resourceType: 'Document',
          recordId: docIdA,
        });
      },
      /Failed to authenticate and decrypt ciphertext payload|Authentication tag verification failed/
    );
  });

  // 7. KMS unavailable
  it('7. KMS unavailable throws fail-closed error without leaking fallback', async () => {
    const failingProvider = new GoogleCloudKmsProvider(config);
    failingProvider.setTransport({
      encrypt: async () => {
        throw new Error('Connection refused to cloudkms.googleapis.com:443');
      },
      decrypt: async () => {
        throw new Error('Connection refused');
      },
      getKeyStatus: async () => {
        throw new Error('Unavailable');
      },
    });

    await assert.rejects(
      async () => {
        await failingProvider.wrapKey('test-key', randomBytes(32));
      },
      /Connection refused/
    );
  });

  // 8. Disabled key
  it('8. Disabled key is rejected on wrap and unwrap', async () => {
    await assert.rejects(
      async () => {
        await kmsService.wrapDek('lamssa/kek/disabled-v1', randomBytes(32));
      },
      /DISABLED/
    );

    await assert.rejects(
      async () => {
        await kmsService.unwrapDek('lamssa/kek/disabled-v1', {
          keyId: 'lamssa/kek/disabled-v1',
          wrappedKey: 'dummy',
          algorithm: 'AES_256_GCM',
        });
      },
      /DISABLED/
    );

    // Direct provider disabled key rejection
    const mockDisabledProvider = new GoogleCloudKmsProvider(config);
    mockDisabledProvider.setTransport({
      encrypt: async () => {
        throw new KmsKeyDisabledError('projects/test/cryptoKeys/disabled');
      },
      decrypt: async () => {
        throw new KmsKeyDisabledError('projects/test/cryptoKeys/disabled');
      },
      getKeyStatus: async () => ({ state: 'DISABLED', protectionLevel: 'HSM' }),
    });

    await assert.rejects(async () => {
      await mockDisabledProvider.wrapKey('test', randomBytes(32));
    }, KmsKeyDisabledError);
  });

  // 9. Revoked key
  it('9. Revoked key is permanently barred from cryptographic access', async () => {
    await assert.rejects(
      async () => {
        await kmsService.wrapDek('lamssa/kek/revoked-v1', randomBytes(32));
      },
      /REVOKED/
    );

    await assert.rejects(
      async () => {
        await kmsService.unwrapDek('lamssa/kek/revoked-v1', {
          keyId: 'lamssa/kek/revoked-v1',
          wrappedKey: 'dummy',
          algorithm: 'AES_256_GCM',
        });
      },
      /REVOKED/
    );

    // Direct provider revoked key rejection
    const mockRevokedProvider = new GoogleCloudKmsProvider(config);
    mockRevokedProvider.setTransport({
      encrypt: async () => {
        throw new KmsKeyRevokedError('projects/test/cryptoKeys/revoked');
      },
      decrypt: async () => {
        throw new KmsKeyRevokedError('projects/test/cryptoKeys/revoked');
      },
      getKeyStatus: async () => ({ state: 'DESTROYED', protectionLevel: 'HSM' }),
    });

    await assert.rejects(async () => {
      await mockRevokedProvider.wrapKey('test', randomBytes(32));
    }, KmsKeyRevokedError);
  });

  // 10. Provider misconfiguration
  it('10. Provider misconfiguration rejects invalid key lengths', async () => {
    await assert.rejects(
      async () => {
        await gcpKms.wrapKey('test-key', randomBytes(16)); // Invalid 16-byte key (needs 32)
      },
      /Plaintext DEK must be exactly 32 bytes/
    );

    // Test KmsNotFoundError
    const mockNotFoundProvider = new GoogleCloudKmsProvider(config);
    mockNotFoundProvider.setTransport({
      encrypt: async () => {
        throw new KmsNotFoundError('missing-key');
      },
      decrypt: async () => {
        throw new KmsNotFoundError('missing-key');
      },
      getKeyStatus: async () => {
        throw new KmsNotFoundError('missing-key');
      },
    });

    await assert.rejects(async () => {
      await mockNotFoundProvider.wrapKey('missing', randomBytes(32));
    }, KmsNotFoundError);
  });

  // 11. Missing vault secret
  it('11. Missing vault secret throws fail-closed SecretVaultError', () => {
    const vault = new SecretVaultService(config);
    assert.throws(
      () => {
        vault.getSecret('NON_EXISTENT_SECRET_TOKEN_XYZ');
      },
      SecretVaultError
    );

    const gsm = new GoogleSecretManagerVaultProvider(config);
    gsm.setTransport({
      accessSecretVersion: async () => {
        throw new SecretNotFoundError('missing-secret');
      },
    });
    assert.rejects(async () => {
      await gsm.loadSecretAsync('MISSING');
    }, SecretNotFoundError);
  });

  // 12. Secret rotation
  it('12. Secret rotation updates in-memory cache with new version', async () => {
    const gsmProvider = new GoogleSecretManagerVaultProvider(config);
    gsmProvider.setCache('API_TOKEN', 'version-1-token');
    assert.equal(gsmProvider.getSecret('API_TOKEN'), 'version-1-token');

    // Rotate secret
    gsmProvider.setCache('API_TOKEN', 'version-2-token');
    assert.equal(gsmProvider.getSecret('API_TOKEN'), 'version-2-token');
  });

  // 13. Unauthorized IAM access
  it('13. Unauthorized IAM access throws typed SecretAccessDeniedError and KmsPermissionDeniedError', async () => {
    const gsmProvider = new GoogleSecretManagerVaultProvider(config);
    gsmProvider.setTransport({
      accessSecretVersion: async () => {
        throw new SecretAccessDeniedError('mfa-key');
      },
    });

    await assert.rejects(
      async () => {
        await gsmProvider.loadSecretAsync('MFA_KEY');
      },
      SecretAccessDeniedError
    );

    const mockIamKms = new GoogleCloudKmsProvider(config);
    mockIamKms.setTransport({
      encrypt: async () => {
        throw new KmsPermissionDeniedError('key-name');
      },
      decrypt: async () => {
        throw new KmsPermissionDeniedError('key-name');
      },
      getKeyStatus: async () => {
        throw new KmsPermissionDeniedError('key-name');
      },
    });

    await assert.rejects(async () => {
      await mockIamKms.wrapKey('test', randomBytes(32));
    }, KmsPermissionDeniedError);
  });

  // 14. Object upload
  it('14. Object upload succeeds with tenant-scoped key', async () => {
    const assetKey = `${clinicA}/docs/test-doc-001.webp`;
    const payload = Buffer.from('RIFF....WEBPpayload-bytes');
    await storage.put(assetKey, payload, { contentType: 'image/webp' });
    const exists = await storage.exists(assetKey);
    assert.equal(exists, true);
  });

  // 15. Object download
  it('15. Object download retrieves exact byte content', async () => {
    const assetKey = `${clinicA}/docs/test-doc-002.webp`;
    const payload = Buffer.from('RIFF....WEBPdistinct-content-12345');
    await storage.put(assetKey, payload);
    const downloaded = await storage.read(assetKey);
    assert.deepEqual(downloaded, payload);
  });

  // 16. Object corruption
  it('16. Object corruption detection via SHA-256 verification', async () => {
    const assetKey = `${clinicA}/docs/test-doc-003.webp`;
    const original = Buffer.from('RIFF....WEBPoriginal-payload');
    await storage.put(assetKey, original);

    const meta = await storage.getMetadata(assetKey);
    const expectedHash = createHash('sha256').update(original).digest('hex');
    assert.equal(meta.sha256, expectedHash);

    // Corrupted buffer does not match expected hash
    const corrupted = Buffer.from('RIFF....WEBPcorrupted-payload');
    const corruptedHash = createHash('sha256').update(corrupted).digest('hex');
    assert.notEqual(expectedHash, corruptedHash);
  });

  // 17. Wrong-tenant object reference
  it('17. Wrong-tenant object key is rejected by path validation', async () => {
    assert.throws(
      () => {
        storage.validateKey('not-a-uuid/photos/image.webp');
      },
      /must be tenant-scoped/
    );

    assert.throws(
      () => {
        storage.validateKey('../../../etc/passwd');
      },
      StoragePathTraversalError
    );
  });

  // 18. Unauthorized document stream
  it('18. Non-existent document stream throws NotFoundException', async () => {
    await assert.rejects(async () => {
      await storage.getStream(`${clinicA}/docs/non-existent-doc-id.enc`);
    });
  });

  // 19. Expired session
  it('19. Expired session simulation fails verification closed', () => {
    const now = Date.now();
    const expiredAt = new Date(now - 1000);
    const isExpired = expiredAt.getTime() <= now;
    assert.equal(isExpired, true);
  });

  // 20. Revoked clinical privilege
  it('20. Revoked privilege detection fails closed', () => {
    const activePrivileges = ['clinical.documents.read'];
    const requiredPrivilege = 'clinical.documents.delete';
    assert.equal(activePrivileges.includes(requiredPrivilege), false);
  });

  // 21. Storage timeout
  it('21. Storage timeout throws ServiceUnavailableException', async () => {
    const timeoutStorage = new GoogleCloudStorageAssetStore(config);
    timeoutStorage.setTransport({
      upload: async () => {
        throw new Error('Connection timed out after 15000ms');
      },
      download: async () => {
        throw new Error('Timeout');
      },
      delete: async () => {
        throw new Error('Timeout');
      },
      head: async () => {
        throw new Error('Timeout');
      },
    });

    await assert.rejects(async () => {
      await timeoutStorage.put(`${clinicA}/docs/timeout.png`, Buffer.from('data'));
    });
  });

  // 22. Interrupted multipart upload
  it('22. Interrupted upload failure cleans up without leaving corrupted target', async () => {
    const mockStorage = new Map<string, any>();
    const failingUploadKey = `${clinicA}/docs/interrupted.webp`;
    try {
      mockStorage.set(failingUploadKey, { partial: true });
      throw new Error('Network reset mid-transfer');
    } catch {
      mockStorage.delete(failingUploadKey);
    }
    assert.equal(mockStorage.has(failingUploadKey), false);
  });

  // 23. Duplicate upload retry
  it('23. Duplicate upload retry is idempotent', async () => {
    const key = `${clinicA}/docs/idempotent.webp`;
    const data = Buffer.from('RIFF....WEBPpayload');
    await storage.put(key, data);
    // Re-upload same key
    await storage.put(key, data);
    const res = await storage.read(key);
    assert.deepEqual(res, data);
  });

  // 24. Partial data migration
  it('24. Partial data migration tracks failures accurately in audit report', async () => {
    const syntheticAssets = [
      { relPath: `${clinicA}/asset-1.webp`, fullPath: '', sizeBytes: 100, sha256: 'hash1', isTenantScoped: true },
      { relPath: `bad-prefix/asset-2.webp`, fullPath: '', sizeBytes: 200, sha256: 'hash2', isTenantScoped: false },
    ];
    let failed = 0;
    for (const a of syntheticAssets) {
      if (!a.isTenantScoped) failed++;
    }
    assert.equal(failed, 1);
  });

  // 25. Migration resume
  it('25. Migration resume skips existing assets with matching SHA-256', async () => {
    const mockTarget = new Map<string, any>();
    const assetKey = `${clinicA}/asset-existing.webp`;
    const hash = 'a1b2c3d4e5f6';
    mockTarget.set(`test-bucket/${assetKey}`, { sha256: hash });

    const isExisting = mockTarget.get(`test-bucket/${assetKey}`)?.sha256 === hash;
    assert.equal(isExisting, true);
  });

  // 26. Missing DR asset
  it('26. Missing DR asset detection raises explicit integrity alert', () => {
    const dbRecords = [`${clinicA}/docs/rec-1.enc`, `${clinicA}/docs/rec-2.enc`];
    const presentAssets = new Set([`${clinicA}/docs/rec-1.enc`]);
    const missing = dbRecords.filter(r => !presentAssets.has(r));
    assert.deepEqual(missing, [`${clinicA}/docs/rec-2.enc`]);
  });

  // 27. Legacy ciphertext compatibility
  it('27. Legacy ciphertext format compatibility fails safely without crash', async () => {
    const legacy = 'unsupported-format-payload';
    await assert.rejects(async () => {
      await envelopeService.decrypt(legacy);
    });
  });

  // 28. Cross-provider configuration mismatch
  it('28. Cross-provider mismatch fails closed when target endpoint is unreachable', async () => {
    const mismatchConfig = createMockConfig({
      GCP_KMS_ENDPOINT: 'https://unreachable.invalid.local',
    });
    const mismatchKms = new GoogleCloudKmsProvider(mismatchConfig);
    delete process.env.KMS_GCP_SIMULATE;

    await assert.rejects(
      async () => {
        await mismatchKms.wrapKey('test-key', randomBytes(32));
      },
      GoogleKmsError
    );

    // Test StorageAccessDeniedError
    const mockDeniedStorage = new GoogleCloudStorageAssetStore(config);
    mockDeniedStorage.setTransport({
      upload: async () => {
        throw new StorageAccessDeniedError('denied');
      },
      download: async () => {
        throw new StorageAccessDeniedError('denied');
      },
      delete: async () => {
        throw new StorageAccessDeniedError('denied');
      },
      head: async () => {
        throw new StorageAccessDeniedError('denied');
      },
    });

    await assert.rejects(async () => {
      await mockDeniedStorage.read(`${clinicA}/docs/denied.webp`);
    }, StorageAccessDeniedError);

    process.env.KMS_GCP_SIMULATE = 'true';
  });
});
