import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateEnvironment } from '../src/config/environment.js';
import { randomBytes } from 'node:crypto';

const valid = {
  AUTH_CSRF_SECRET: randomBytes(48).toString('base64url'),
  DATABASE_URL: 'postgresql://test:private-test-value@127.0.0.1:5432/lamssa_test',
  CORS_ORIGINS: 'http://localhost:5173,http://127.0.0.1:5173',
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
