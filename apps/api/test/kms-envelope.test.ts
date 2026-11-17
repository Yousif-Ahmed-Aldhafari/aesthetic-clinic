import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../src/config/environment.js';
import { LocalKmsProvider } from '../src/kms/local-kms.provider.js';
import { ExternalKmsProvider, KmsExternalError } from '../src/kms/external-kms.provider.js';
import { TestKmsProvider } from '../src/kms/test-kms.provider.js';
import { KeyManagementService } from '../src/kms/key-management.service.js';
import { EnvelopeEncryptionService } from '../src/kms/envelope-encryption.service.js';
import { KeyRotationMigrationService } from '../src/kms/key-rotation-migration.service.js';
import type { KmsKeyMetadata } from '../src/kms/kms.types.js';
import { IntegrationCryptoService } from '../src/integrations/integration-crypto.service.js';

function createMockConfig(overrides: Partial<Environment> = {}): ConfigService<Environment, true> {
  const env: Partial<Environment> = {
    NODE_ENV: 'test',
    AUTH_CSRF_SECRET: 'test-csrf-secret-with-minimum-43-characters-long-value-ok',
    KMS_LOCAL_MASTER_KEY: 'test-kms-master-key-at-least-32-chars-long!',
    ...overrides,
  };

  return {
    get: ((key: keyof Environment) => env[key]) as any,
  } as ConfigService<Environment, true>;
}

class InMemoryKmsRepository {
  private keys: Map<string, KmsKeyMetadata> = new Map();
  public migrationAudits: Array<{
    clinicId?: string | null;
    resourceType: string;
    recordId: string;
    sourceKeyId: string;
    targetKeyId: string;
    status: string;
  }> = [];

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
    for (const k of this.keys.values()) {
      if (k.state === 'ACTIVE') return k;
    }
    return null;
  }

  async getKeyMetadata(keyId: string): Promise<KmsKeyMetadata | null> {
    return this.keys.get(keyId) ?? null;
  }

  async listKeys(): Promise<KmsKeyMetadata[]> {
    return Array.from(this.keys.values()).sort((a, b) => b.version - a.version);
  }

  async rotateKey(newKeyId: string, description?: string): Promise<KmsKeyMetadata> {
    const active = await this.getActiveKey();
    if (active) {
      active.state = 'RETIRED';
      active.rotatedAt = new Date();
    }

    const nextVersion = (active?.version ?? 0) + 1;
    const newKey: KmsKeyMetadata = {
      id: `00000000-0000-0000-0000-00000000000${nextVersion}`,
      keyId: newKeyId,
      version: nextVersion,
      state: 'ACTIVE',
      algorithm: 'AES_256_GCM',
      description: description ?? `Rotated active KEK version ${nextVersion}`,
      createdAt: new Date(),
      rotatedAt: null,
      revokedAt: null,
    };
    this.keys.set(newKeyId, newKey);
    return newKey;
  }

  async disableKey(keyId: string): Promise<KmsKeyMetadata> {
    const key = this.keys.get(keyId);
    if (!key) throw new Error('Not found');
    key.state = 'DISABLED';
    return key;
  }

  async revokeKey(keyId: string, reason?: string): Promise<KmsKeyMetadata> {
    const key = this.keys.get(keyId);
    if (!key) throw new Error('Not found');
    key.state = 'REVOKED';
    key.revokedAt = new Date();
    if (reason) key.description = `${key.description ?? ''} [REVOKED: ${reason}]`;
    return key;
  }

  async recordMigrationAudit(data: {
    clinicId?: string | null;
    resourceType: string;
    recordId: string;
    sourceKeyId: string;
    targetKeyId: string;
    status: string;
  }): Promise<void> {
    this.migrationAudits.push(data);
  }

  async getMigrationStatus(clinicId?: string) {
    const filtered = clinicId
      ? this.migrationAudits.filter((a) => a.clinicId === clinicId)
      : this.migrationAudits;
    return {
      totalAudited: filtered.length,
      successful: filtered.filter((a) => a.status === 'SUCCESS').length,
      failed: filtered.filter((a) => a.status === 'FAILED').length,
      recentAudits: filtered.map((a, i) => ({
        id: `audit-${i}`,
        resourceType: a.resourceType,
        recordId: a.recordId,
        sourceKeyId: a.sourceKeyId,
        targetKeyId: a.targetKeyId,
        status: a.status,
        migratedAt: new Date(),
      })),
    };
  }
}

describe('Phase 7 Step 7.1 KMS Architecture & Cryptographic Key Lifecycle', () => {
  describe('LocalKmsProvider', () => {
    it('wraps and unwraps 32-byte DEKs using AES-256-GCM authenticated wrapping', async () => {
      const config = createMockConfig();
      const localKms = new LocalKmsProvider(config);

      const testDek = randomBytes(32);
      const keyId = 'lamssa/kek/2026-v1';

      const wrapped = await localKms.wrapKey(keyId, testDek);
      assert.equal(wrapped.keyId, keyId);
      assert.equal(wrapped.algorithm, 'AES_256_GCM');
      assert.ok(wrapped.wrappedKey.length > 0);
      assert.ok(wrapped.iv);
      assert.ok(wrapped.tag);

      const unwrapped = await localKms.unwrapKey(keyId, wrapped);
      assert.deepEqual(unwrapped, testDek);
    });

    it('rejects DEKs of invalid lengths', async () => {
      const config = createMockConfig();
      const localKms = new LocalKmsProvider(config);

      await assert.rejects(
        localKms.wrapKey('lamssa/kek/2026-v1', randomBytes(16)),
        /Plaintext DEK must be exactly 32 bytes/,
      );
    });

    it('passes end-to-end health check probe', async () => {
      const config = createMockConfig();
      const localKms = new LocalKmsProvider(config);
      const health = await localKms.healthCheck();

      assert.equal(health.ok, true);
      assert.equal(health.provider, 'local');
      assert.ok(health.latencyMs >= 0);
    });
  });

  describe('ExternalKmsProvider (Fail-Closed)', () => {
    it('fails closed and rejects wrapping when external endpoint is not configured', async () => {
      const config = createMockConfig({ KMS_EXTERNAL_ENDPOINT: undefined });
      const externalKms = new ExternalKmsProvider(config);

      await assert.rejects(
        externalKms.wrapKey('lamssa/kek/ext-v1', randomBytes(32)),
        (err: unknown) => {
          assert.ok(err instanceof KmsExternalError);
          assert.ok(err.message.includes('Failing closed'));
          return true;
        },
      );
    });

    it('fails closed and rejects unwrapping when external endpoint is not configured', async () => {
      const config = createMockConfig({ KMS_EXTERNAL_ENDPOINT: undefined });
      const externalKms = new ExternalKmsProvider(config);

      await assert.rejects(
        externalKms.unwrapKey('lamssa/kek/ext-v1', {
          keyId: 'lamssa/kek/ext-v1',
          wrappedKey: 'dummy',
          algorithm: 'AES_256_GCM',
        }),
        (err: unknown) => {
          assert.ok(err instanceof KmsExternalError);
          assert.ok(err.message.includes('Failing closed'));
          return true;
        },
      );
    });
  });

  describe('TestKmsProvider (Synthetic Fault Injection)', () => {
    it('injects wrap and unwrap errors on demand', async () => {
      const config = createMockConfig();
      const testKms = new TestKmsProvider(config);

      testKms.simulateFailure('wrap', new Error('Simulated AWS KMS 500 error'));
      await assert.rejects(
        testKms.wrapKey('test-key', randomBytes(32)),
        /Simulated AWS KMS 500 error/,
      );

      testKms.reset();
      const dek = randomBytes(32);
      const wrapped = await testKms.wrapKey('test-key', dek);
      assert.ok(wrapped.wrappedKey);

      testKms.simulateFailure('unwrap', new Error('Simulated Cloud KMS timeout'));
      await assert.rejects(
        testKms.unwrapKey('test-key', wrapped),
        /Simulated Cloud KMS timeout/,
      );

      testKms.reset();
      const unwrapped = await testKms.unwrapKey('test-key', wrapped);
      assert.deepEqual(unwrapped, dek);
    });

    it('injects emergency revocation drill for a specific keyId', async () => {
      const config = createMockConfig();
      const testKms = new TestKmsProvider(config);

      testKms.simulateEmergencyRevocation('compromised-key-v1');
      await assert.rejects(
        testKms.wrapKey('compromised-key-v1', randomBytes(32)),
        /emergency revocation/,
      );
    });
  });

  describe('KeyManagementService Key Lifecycle Enforcement', () => {
    it('enforces ACTIVE state for encryption and allows RETIRED for decryption', async () => {
      const repo = new InMemoryKmsRepository();
      const config = createMockConfig();
      const provider = new LocalKmsProvider(config);
      const kms = new KeyManagementService(repo as any, provider);

      // 1. Initial key is ACTIVE (v1)
      const activeKey = await kms.getActiveKey();
      assert.equal(activeKey.keyId, 'lamssa/kek/2026-v1');
      assert.equal(activeKey.state, 'ACTIVE');

      const dek = randomBytes(32);
      const wrappedV1 = await kms.wrapDek(activeKey.keyId, dek);
      const unwrappedV1 = await kms.unwrapDek(activeKey.keyId, wrappedV1);
      assert.deepEqual(unwrappedV1, dek);

      // 2. Rotate to v2 -> v1 becomes RETIRED, v2 becomes ACTIVE
      const v2 = await kms.rotateKey('lamssa/kek/2026-v2', 'Yearly rotation');
      assert.equal(v2.keyId, 'lamssa/kek/2026-v2');
      assert.equal(v2.version, 2);
      assert.equal(v2.state, 'ACTIVE');

      const v1Metadata = await kms.getKeyMetadata('lamssa/kek/2026-v1');
      assert.equal(v1Metadata?.state, 'RETIRED');

      // 3. Encrypting with RETIRED v1 is REJECTED
      await assert.rejects(
        kms.wrapDek('lamssa/kek/2026-v1', randomBytes(32)),
        /encryption permitted only with ACTIVE keys/,
      );

      // 4. Decrypting existing data with RETIRED v1 is STILL PERMITTED
      const unwrappedRetired = await kms.unwrapDek('lamssa/kek/2026-v1', wrappedV1);
      assert.deepEqual(unwrappedRetired, dek);

      // 5. Encrypting with new ACTIVE v2 SUCCEEDS
      const dek2 = randomBytes(32);
      const wrappedV2 = await kms.wrapDek(v2.keyId, dek2);
      const unwrappedV2 = await kms.unwrapDek(v2.keyId, wrappedV2);
      assert.deepEqual(unwrappedV2, dek2);
    });

    it('rejects both wrapping and unwrapping when a key is DISABLED or REVOKED', async () => {
      const repo = new InMemoryKmsRepository();
      const config = createMockConfig();
      const provider = new LocalKmsProvider(config);
      const kms = new KeyManagementService(repo as any, provider);

      const activeKey = await kms.getActiveKey();
      const dek = randomBytes(32);
      const wrapped = await kms.wrapDek(activeKey.keyId, dek);

      // Disable the key
      await kms.disableKey(activeKey.keyId);
      await assert.rejects(
        kms.wrapDek(activeKey.keyId, randomBytes(32)),
        /encryption permitted only with ACTIVE keys/,
      );
      await assert.rejects(
        kms.unwrapDek(activeKey.keyId, wrapped),
        /KMS key .* is DISABLED/,
      );

      // Revoke the key
      await kms.revokeKey(activeKey.keyId, 'Compromise drill');
      await assert.rejects(
        kms.wrapDek(activeKey.keyId, randomBytes(32)),
        /encryption permitted only with ACTIVE keys/,
      );
      await assert.rejects(
        kms.unwrapDek(activeKey.keyId, wrapped),
        /KMS key .* is REVOKED/,
      );
    });
  });

  describe('EnvelopeEncryptionService', () => {
    it('encrypts and decrypts payloads with AES-256-GCM and cryptographic context AAD', async () => {
      const repo = new InMemoryKmsRepository();
      const config = createMockConfig();
      const provider = new LocalKmsProvider(config);
      const kms = new KeyManagementService(repo as any, provider);
      const envelope = new EnvelopeEncryptionService(kms, config);

      const plaintext = 'Dr. Fatima verified confidential aesthetic treatment notes';
      const context = {
        clinicId: 'b43cfbf6-1a14-4d48-a56e-bfdadd1806cd',
        resourceType: 'ClinicalDocument',
        recordId: 'doc-001',
      };

      const encrypted = await envelope.encrypt(plaintext, context);
      assert.ok(encrypted.startsWith('v2:'));
      assert.ok(!encrypted.includes(plaintext));

      const decrypted = await envelope.decrypt(encrypted, context);
      assert.equal(decrypted, plaintext);
    });

    it('rejects tampered ciphertext envelopes', async () => {
      const repo = new InMemoryKmsRepository();
      const config = createMockConfig();
      const provider = new LocalKmsProvider(config);
      const kms = new KeyManagementService(repo as any, provider);
      const envelope = new EnvelopeEncryptionService(kms, config);

      const plaintext = 'Confidential payload';
      const context = {
        clinicId: 'b43cfbf6-1a14-4d48-a56e-bfdadd1806cd',
        resourceType: 'PaymentProviderConfiguration',
        recordId: 'cfg-001',
      };

      const encrypted = await envelope.encrypt(plaintext, context);
      const parts = encrypted.split(':');
      // Tamper with ciphertext
      parts[5] = Buffer.from('adversary-tampered-content').toString('base64');
      const tampered = parts.join(':');

      await assert.rejects(
        envelope.decrypt(tampered, context),
        /Failed to authenticate and decrypt/,
      );
    });

    it('rejects cross-tenant or mismatched AAD context attempts', async () => {
      const repo = new InMemoryKmsRepository();
      const config = createMockConfig();
      const provider = new LocalKmsProvider(config);
      const kms = new KeyManagementService(repo as any, provider);
      const envelope = new EnvelopeEncryptionService(kms, config);

      const plaintext = 'Secret clinic credentials';
      const clinicA = {
        clinicId: '11111111-1111-1111-1111-111111111111',
        resourceType: 'PaymentCredentials',
        recordId: 'cred-1',
      };
      const clinicB = {
        clinicId: '22222222-2222-2222-2222-222222222222',
        resourceType: 'PaymentCredentials',
        recordId: 'cred-1',
      };

      const encryptedForA = await envelope.encrypt(plaintext, clinicA);

      // Attempting to decrypt with Clinic B context fails AAD authentication
      await assert.rejects(
        envelope.decrypt(encryptedForA, clinicB),
        /Failed to authenticate and decrypt/,
      );
    });

    it('supports backward-compatibility fallback decryption for legacy v1 ciphertexts', async () => {
      const repo = new InMemoryKmsRepository();
      const config = createMockConfig();
      const provider = new LocalKmsProvider(config);
      const kms = new KeyManagementService(repo as any, provider);
      const envelope = new EnvelopeEncryptionService(kms, config);

      // Create a legacy v1 ciphertext using IntegrationCryptoService
      const legacyCrypto = new IntegrationCryptoService(config);
      const secret = 'stripe_sk_test_legacy_12345';
      const legacyCiphertext = legacyCrypto.encryptSecret(secret);
      assert.ok(legacyCiphertext.startsWith('v1:'));
      assert.equal(envelope.isLegacyFormat(legacyCiphertext), true);

      // Decrypt using EnvelopeEncryptionService legacy fallback
      const decrypted = await envelope.decrypt(legacyCiphertext);
      assert.equal(decrypted, secret);
    });
  });

  describe('KeyRotationMigrationService', () => {
    it('migrates legacy v1 ciphertext to active v2 KEK envelope and logs audit', async () => {
      const repo = new InMemoryKmsRepository();
      const config = createMockConfig();
      const provider = new LocalKmsProvider(config);
      const kms = new KeyManagementService(repo as any, provider);
      const envelope = new EnvelopeEncryptionService(kms, config);
      const migration = new KeyRotationMigrationService(repo as any, envelope, kms);

      // Legacy secret
      const legacyCrypto = new IntegrationCryptoService(config);
      const originalSecret = 'moyasar_sec_sandbox_legacy_key';
      const legacyCiphertext = legacyCrypto.encryptSecret(originalSecret);

      const clinicId = 'b43cfbf6-1a14-4d48-a56e-bfdadd1806cd';
      const result = await migration.migrateRecord(
        clinicId,
        'PaymentProviderConfiguration',
        'cfg-001',
        legacyCiphertext,
      );

      assert.equal(result.migrated, true);
      assert.equal(result.sourceKeyId, 'legacy-v1-direct');
      assert.equal(result.targetKeyId, 'lamssa/kek/2026-v1');
      assert.ok(result.newCiphertext?.startsWith('v2:'));

      // Verify the new ciphertext decrypts to the original secret
      const decrypted = await envelope.decrypt(result.newCiphertext!, {
        clinicId,
        resourceType: 'PaymentProviderConfiguration',
        recordId: 'cfg-001',
      });
      assert.equal(decrypted, originalSecret);

      // Verify migration audit log
      assert.equal(repo.migrationAudits.length, 1);
      assert.equal(repo.migrationAudits[0].resourceType, 'PaymentProviderConfiguration');
      assert.equal(repo.migrationAudits[0].status, 'SUCCESS');
      assert.equal(repo.migrationAudits[0].sourceKeyId, 'legacy-v1-direct');
      assert.equal(repo.migrationAudits[0].targetKeyId, 'lamssa/kek/2026-v1');

      // Attempting to migrate again skips since it's already on active key
      const secondAttempt = await migration.migrateRecord(
        clinicId,
        'PaymentProviderConfiguration',
        'cfg-001',
        result.newCiphertext!,
      );
      assert.equal(secondAttempt.migrated, false);
      assert.equal(repo.migrationAudits.length, 1);
    });
  });
});
