import { spawnSync } from 'node:child_process';
import { config } from 'dotenv';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
config({ path: resolve(root, '.env'), quiet: true });
const command = process.argv[2];
if (!['migrate', 'status'].includes(command) || !process.env.TEST_MIGRATION_DATABASE_URL || !process.env.TEST_DATABASE_URL) {
  console.error('Specify migrate/status and configure both test database URLs.');
  process.exitCode = 1;
} else {
  const result = spawnSync('npm', ['run', `db:${command}`, '--workspace', '@lamssa/api', '--'], {
    cwd: root, stdio: 'inherit', env: { ...process.env,
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      MIGRATION_DATABASE_URL: process.env.TEST_MIGRATION_DATABASE_URL,
    },
  });
  process.exitCode = result.status ?? 1;
}
