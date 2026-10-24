import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const url = (role, database) => `postgresql://${role}:${randomBytes(32).toString('base64url')}@127.0.0.1:5432/${database}?schema=public`;
const content = [
  '# Native local PostgreSQL. Private credentials; never commit or print this file.',
  'NODE_ENV=development', 'API_HOST=127.0.0.1', 'API_PORT=3000',
  'CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173',
  `DATABASE_URL=${url('lamssa_dev_app', 'lamssa_dev')}`,
  `MIGRATION_DATABASE_URL=${url('lamssa_dev_migrator', 'lamssa_dev')}`,
  `TEST_DATABASE_URL=${url('lamssa_test_app', 'lamssa_test')}`,
  `TEST_MIGRATION_DATABASE_URL=${url('lamssa_test_migrator', 'lamssa_test')}`, '',
].join('\n');
try {
  writeFileSync(resolve(root, '.env'), content, { mode: 0o600, flag: 'wx' });
  console.info('Created private .env with separate development/test credentials (mode 0600).');
} catch (error) {
  if (error.code === 'EEXIST') console.error('.env already exists; no values were changed. Configure missing native settings explicitly.');
  else console.error('Could not create private .env. Check directory permissions.');
  process.exitCode = 1;
}
