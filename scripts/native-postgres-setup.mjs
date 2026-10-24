import { spawnSync } from 'node:child_process';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(import.meta.dirname, '../.env'), quiet: true });
const definitions = [
  ['MIGRATION_DATABASE_URL', 'lamssa_dev_migrator', 'lamssa_dev'],
  ['DATABASE_URL', 'lamssa_dev_app', 'lamssa_dev'],
  ['TEST_MIGRATION_DATABASE_URL', 'lamssa_test_migrator', 'lamssa_test'],
  ['TEST_DATABASE_URL', 'lamssa_test_app', 'lamssa_test'],
];
const literal = value => `'${value.replaceAll("'", "''")}'`;

try {
  const roles = definitions.map(([key, role, database]) => {
    const url = new URL(process.env[key] ?? '');
    if (url.hostname !== '127.0.0.1' || (url.port || '5432') !== '5432' ||
        decodeURIComponent(url.username) !== role || url.pathname !== `/${database}` || !url.password) {
      throw new Error('Unexpected native database configuration');
    }
    return { role, password: decodeURIComponent(url.password) };
  });
  const names = roles.map(row => literal(row.role)).join(',');
  const sql = [
    "SET log_statement = 'none';", "SET log_min_error_statement = 'panic';",
    "SET password_encryption = 'scram-sha-256';",
    `DO $$ BEGIN
      IF current_setting('listen_addresses') NOT IN ('localhost','127.0.0.1','::1') THEN
        RAISE EXCEPTION 'PostgreSQL must listen on loopback only before native setup';
      END IF;
      IF EXISTS (SELECT FROM pg_roles WHERE rolname IN (${names})) OR
         EXISTS (SELECT FROM pg_database WHERE datname IN ('lamssa_dev','lamssa_test')) THEN
        RAISE EXCEPTION 'Lamssa role/database names already exist; no existing credentials will be replaced';
      END IF;
    END $$;`,
    'BEGIN;',
    ...roles.map(({role,password}) => `CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${literal(password)};`),
    'COMMIT;',
    'CREATE DATABASE lamssa_dev OWNER lamssa_dev_migrator;',
    'CREATE DATABASE lamssa_test OWNER lamssa_test_migrator;',
    ...['dev','test'].flatMap(name => [
      `REVOKE ALL ON DATABASE lamssa_${name} FROM PUBLIC;`,
      `GRANT CONNECT ON DATABASE lamssa_${name} TO lamssa_${name}_app;`,
      `\\connect lamssa_${name}`,
      'REVOKE ALL ON SCHEMA public FROM PUBLIC;',
      `GRANT USAGE ON SCHEMA public TO lamssa_${name}_app;`,
    ]), '',
  ].join('\n');
  // The caller must approve this privileged command. Passwords travel only via stdin;
  // SQL and server errors are not echoed, and existing names fail before any DDL.
  const result = spawnSync('sudo', [
    '-n', '-u', 'postgres', 'psql', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--dbname', 'postgres',
  ], { input: sql, encoding: 'utf8', maxBuffer: 1024 * 1024 });
  if (result.status !== 0) throw new Error('Native provisioning failed');
  console.info('Created new Lamssa development/test databases and four non-administrative roles.');
} catch {
  console.error('Native provisioning failed. No passwords were displayed. Check sudo access, PostgreSQL availability, loopback settings and existing reserved names; do not reset databases.');
  process.exitCode = 1;
}
