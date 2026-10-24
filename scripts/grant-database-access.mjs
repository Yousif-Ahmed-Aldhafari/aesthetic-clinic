import { config } from 'dotenv';
import { resolve } from 'node:path';
import pg from 'pg';

config({ path: resolve(import.meta.dirname, '../.env'), quiet: true });
const tables = ['Clinic', 'ClinicBranding', 'ClinicDomain', 'User', 'ClinicMembership'];
try {
  for (const [key, role] of [['MIGRATION_DATABASE_URL','lamssa_dev_app'], ['TEST_MIGRATION_DATABASE_URL','lamssa_test_app']]) {
    if (!process.env[key]) throw new Error('Missing migration URL');
    const client = new pg.Client({ connectionString: process.env[key], connectionTimeoutMillis: 3000 });
    try {
      await client.connect();
      await client.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
      // Deliberately exclude _prisma_migrations and grant no DDL, role membership or grant option.
      await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${tables.map(name=>`public."${name}"`).join(',')} TO ${role}`);
    } finally { await client.end(); }
  }
  console.info('Granted development/test runtime DML access to the five identity tables only.');
} catch {
  console.error('Runtime grants failed. Check migration owners and apply both migrations first; credentials withheld.');
  process.exitCode = 1;
}
