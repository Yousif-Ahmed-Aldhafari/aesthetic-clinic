import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateEnvironment } from '../src/config/environment.js';
import { SecretVaultService, SecretVaultError } from '../src/config/secret-vault.service.js';
import { ProductionSecurityValidationError } from '../src/config/production-security-validator.js';
import { randomBytes } from 'node:crypto';

const valid = {
  AUTH_CSRF_SECRET: randomBytes(48).toString('base64url'),
  DATABASE_URL: 'postgresql://test:private-test-value@127.0.0.1:5432/lamssa_test',
  CORS_ORIGINS: 'http://localhost:5173,http://127.0.0.1:5173',
};

const validProd = {
  ...valid,
  NODE_ENV: 'production',
  CORS_ORIGINS: 'https://clinic.example.com',
  MFA_ENCRYPTION_KEY: randomBytes(32).toString('base64url'),
  CLINICAL_MEDIA_ENCRYPTION_KEY: randomBytes(32).toString('base64url'),
  METRICS_SECRET_KEY: randomBytes(48).toString('base64url'),
  KMS_LOCAL_MASTER_KEY: randomBytes(32).toString('base64url'),
  ASSET_STORAGE_DIR: '/srv/lamssa/assets',
  API_ALLOWED_HOSTS: 'app.example.com',
  TRUST_PROXY_HOPS: '1',
  AUTH_SESSION_HOURS: '8',
  AUTH_IDLE_MINUTES: '30',
};

test('configuration parses explicit origins and safe local defaults', () => {
  const config = validateEnvironment(valid);
  assert.equal(config.API_HOST, '127.0.0.1');
  assert.equal(config.API_PORT, 3000);
  assert.deepEqual(config.CORS_ORIGINS, ['http://localhost:5173', 'http://127.0.0.1:5173']);
});

test('invalid configuration fails without echoing secret values', () => {
  for (const override of [
    { DATABASE_URL: 'private-test-value' }, { DATABASE_URL: 'https://database.example/db' },
    { CORS_ORIGINS: '*' }, { CORS_ORIGINS: 'http://localhost:5173/path' },
    { CORS_ORIGINS: '' }, { API_PORT: '0' }, { API_PORT: '65536' },
    { AUTH_CSRF_SECRET: '' }, { AUTH_SESSION_HOURS: 0 }, { AUTH_IDLE_MINUTES: 1000 }, { TRUST_PROXY_HOPS: 2 },
    { API_HOST: 'untrusted.example' }, { NODE_ENV: 'unknown' },
    { NODE_ENV: 'production', CORS_ORIGINS: 'http://localhost:5173' },
  ]) {
    assert.throws(() => validateEnvironment({ ...valid, ...override }), error => {
      assert(error instanceof Error);
      assert.match(error.message, /^Invalid environment variables:/);
      assert(!error.message.includes('private-test-value'));
      return true;
    });
  }
});

test('production requires MFA_ENCRYPTION_KEY, KMS key, and valid origins', () => {
  const prodConfig = validateEnvironment(validProd);
  assert.equal(prodConfig.NODE_ENV, 'production');
  assert.ok(prodConfig.MFA_ENCRYPTION_KEY);
  assert.ok(prodConfig.CLINICAL_MEDIA_ENCRYPTION_KEY);
  assert.ok(prodConfig.KMS_LOCAL_MASTER_KEY);
});

test('production fails closed without deployment secrets and trusted proxy settings', () => {
  assert.throws(() => validateEnvironment({
    ...valid,
    NODE_ENV: 'production',
    CORS_ORIGINS: 'https://app.example.com',
    MFA_ENCRYPTION_KEY: randomBytes(32).toString('base64url'),
  }), /METRICS_SECRET_KEY.*ASSET_STORAGE_DIR.*TRUST_PROXY_HOPS.*API_ALLOWED_HOSTS/);
});

test('production security validator enforces strict KMS rules', () => {
  // Synthetic KMS is forbidden in production
  assert.throws(() => validateEnvironment({
    ...validProd,
    KMS_PROVIDER: 'synthetic',
  }), (err: unknown) => {
    assert(err instanceof ProductionSecurityValidationError);
    assert(err.violations.includes('SYNTHETIC_KMS_FORBIDDEN_IN_PRODUCTION'));
    return true;
  });

  // Local KMS requires >= 32 chars non-template key in production
  assert.throws(() => validateEnvironment({
    ...validProd,
    KMS_PROVIDER: 'local',
    KMS_LOCAL_MASTER_KEY: 'dev-master-key-not-suitable-for-prod-32chars',
  }), (err: unknown) => {
    assert(err instanceof ProductionSecurityValidationError);
    assert(err.violations.includes('KMS_LOCAL_MASTER_KEY_USES_INSECURE_TEMPLATE'));
    return true;
  });

  // External KMS requires HTTPS endpoint and key ID
  assert.throws(() => validateEnvironment({
    ...validProd,
    KMS_PROVIDER: 'external',
    KMS_EXTERNAL_ENDPOINT: 'http://insecure-kms.example.com',
    KMS_EXTERNAL_KEY_ID: '',
  }), (err: unknown) => {
    assert(err instanceof ProductionSecurityValidationError);
    assert(err.violations.includes('KMS_EXTERNAL_ENDPOINT_MUST_BE_HTTPS'));
    assert(err.violations.includes('KMS_EXTERNAL_KEY_ID_REQUIRED'));
    return true;
  });
});

test('production security validator enforces session and idle limits', () => {
  // AUTH_SESSION_HOURS > 12 rejected
  assert.throws(() => validateEnvironment({
    ...validProd,
    AUTH_SESSION_HOURS: '16',
  }), (err: unknown) => {
    assert(err instanceof ProductionSecurityValidationError);
    assert(err.violations.includes('AUTH_SESSION_HOURS_EXCEEDS_12_HOUR_MAXIMUM'));
    return true;
  });

  // AUTH_IDLE_MINUTES > 60 rejected
  assert.throws(() => validateEnvironment({
    ...validProd,
    AUTH_IDLE_MINUTES: '90',
  }), (err: unknown) => {
    assert(err instanceof ProductionSecurityValidationError);
    assert(err.violations.includes('AUTH_IDLE_MINUTES_EXCEEDS_60_MINUTE_MAXIMUM'));
    return true;
  });
});

test('platform subdomain wildcard is restricted to the configured base domain', () => {
  const config = validateEnvironment({
    ...valid,
    PLATFORM_BASE_DOMAIN: 'clinics.example.com',
    API_ALLOWED_HOSTS: 'app.example.com,*.clinics.example.com',
  });
  assert.deepEqual(config.API_ALLOWED_HOSTS, ['app.example.com', '*.clinics.example.com']);
  assert.throws(() => validateEnvironment({
    ...valid,
    PLATFORM_BASE_DOMAIN: 'clinics.example.com',
    API_ALLOWED_HOSTS: '*.example.com',
  }), /API_ALLOWED_HOSTS/);
});

test('SecretVaultService retrieves secrets and fails closed when missing', () => {
  const vault = new SecretVaultService();
  const testKey = 'TEST_SECRET_' + randomBytes(8).toString('hex');
  process.env[testKey] = 'super-secret-value-123';

  assert.equal(vault.getSecret(testKey), 'super-secret-value-123');
  assert.equal(vault.getOptionalSecret(testKey), 'super-secret-value-123');

  // Non-existent key throws SecretVaultError
  assert.throws(
    () => vault.getSecret('NON_EXISTENT_KEY_' + randomBytes(8).toString('hex')),
    SecretVaultError,
  );
  assert.equal(
    vault.getOptionalSecret('NON_EXISTENT_KEY_' + randomBytes(8).toString('hex')),
    undefined,
  );

  delete process.env[testKey];
});

test('SecretVaultService masking and log sanitization never leaks plaintext secrets', () => {
  const secret = 'raw-clinical-token-xyz-1234567890';
  const masked = SecretVaultService.maskSecret(secret);
  assert.match(masked, /^\*\*\*\*:[a-f0-9]{8}$/);
  assert(!masked.includes('raw-clinical-token'));

  // Masking unset or null returns [UNSET]
  assert.equal(SecretVaultService.maskSecret(null), '[UNSET]');
  assert.equal(SecretVaultService.maskSecret(undefined), '[UNSET]');

  // Recursive log sanitization
  const logPayload = {
    clinicId: 'clinic-123',
    apiKey: secret,
    user: {
      id: 'user-456',
      password: 'password123',
      sessionToken: 'token-abc',
      nested: {
        authorizationHeader: 'Bearer secret-jwt',
      },
    },
    metadata: {
      safeField: 'normal-value',
    },
  };

  const sanitized = SecretVaultService.sanitizeForLog(logPayload) as typeof logPayload;
  assert.equal(sanitized.clinicId, 'clinic-123');
  assert.equal(sanitized.metadata.safeField, 'normal-value');
  assert.match(sanitized.apiKey, /^\*\*\*\*:[a-f0-9]{8}$/);
  assert.match(sanitized.user.password, /^\*\*\*\*:[a-f0-9]{8}$/);
  assert.match(sanitized.user.sessionToken, /^\*\*\*\*:[a-f0-9]{8}$/);
  assert.match(sanitized.user.nested.authorizationHeader, /^\*\*\*\*:[a-f0-9]{8}$/);

  // Plaintext verification
  const json = JSON.stringify(sanitized);
  assert(!json.includes('super-secret'));
  assert(!json.includes('password123'));
  assert(!json.includes('token-abc'));
  assert(!json.includes('secret-jwt'));
});
