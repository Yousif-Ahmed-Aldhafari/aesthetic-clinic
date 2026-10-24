import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { config } from 'dotenv';
import { Client } from 'pg';
import { testUrls } from './database-fixtures.js';

config({ path: resolve(import.meta.dirname, '../../../../.env'), quiet: true });
const url = process.env.TEST_DATABASE_URL;

// Explicit opt-in only. All rows are rolled back; deletion probes use fixture IDs only.
test('live PostgreSQL identity, membership and tenant constraints', { skip: !url }, async () => {
  assert.notEqual(url, process.env.DATABASE_URL, 'Use a dedicated TEST_DATABASE_URL');
  if (process.env.DATABASE_URL) {
    const identity = (value: string) => {
      const target = new URL(value);
      return `${target.hostname}:${target.port || '5432'}${target.pathname}`;
    };
    assert.notEqual(identity(url!), identity(process.env.DATABASE_URL), 'Test and development must be different databases, even with different credentials');
  }
  const {owner}=testUrls();
  const runtime=new Client({connectionString:url,connectionTimeoutMillis:3000});
  await runtime.connect();
  try {
    const role=(await runtime.query('SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
    assert.deepEqual(role,{rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolreplication:false,rolbypassrls:false});
    for(const sql of ['CREATE TABLE public."LamssaPermissionProbe" (id integer)','UPDATE public._prisma_migrations SET migration_name=migration_name WHERE false'])await assert.rejects(runtime.query(sql),(e:unknown)=>(e as {code:string}).code==='42501');
  }finally{await runtime.end();}
  // Schema constraint fixtures use the separate owner; runtime RLS/ACL is tested
  // above and in rls.integration, never disabled to provision test rows.
  const client = new Client({ connectionString: owner, connectionTimeoutMillis: 3000 });
  await client.connect();
  try {
    await client.query('BEGIN');
    const a = randomUUID(), b = randomUUID(), user = randomUUID();
    const suffix = randomUUID();
    for (const [id, slug] of [[a, `test-a-${suffix}`], [b, `test-b-${suffix}`]]) {
      await client.query('INSERT INTO "Clinic" ("id", "legalName", "displayName", "slug", "currency", "updatedAt") VALUES ($1, $2, $2, $3, $4, NOW())', [id, 'عيادة اختبار وهمية', slug, 'YER']);
    }
    await client.query('INSERT INTO "User" ("id", "name", "email", "updatedAt") VALUES ($1, $2, $3, NOW())', [user, 'مستخدم اختبار', `${suffix}@example.invalid`]);
    for (const [clinic, role] of [[a, 'CLINIC_OWNER'], [b, 'ACCOUNTANT']]) {
      await client.query('INSERT INTO "ClinicMembership" ("id", "clinicId", "userId", "role", "updatedAt") VALUES ($1,$2,$3,$4,NOW())', [randomUUID(), clinic, user, role]);
    }
    assert.equal((await client.query('SELECT 1 FROM "ClinicMembership" WHERE "userId"=$1', [user])).rowCount, 2);
    for (const [clinic, color] of [[a, '#7854D9'], [b, '#087F8C']]) {
      await client.query('INSERT INTO "ClinicBranding" ("clinicId", "primaryColor", "updatedAt") VALUES ($1,$2,NOW())', [clinic, color]);
    }
    const colors = await client.query('SELECT "primaryColor" FROM "ClinicBranding" WHERE "clinicId" IN ($1,$2)', [a, b]);
    assert.equal(new Set(colors.rows.map(row => row.primaryColor)).size, 2);
    assert.equal((await client.query('SELECT "role" FROM "ClinicMembership" WHERE "clinicId"=$1 AND "userId"=$2', [a, user])).rows[0].role, 'CLINIC_OWNER');
    assert.equal((await client.query('SELECT "role" FROM "ClinicMembership" WHERE "clinicId"=$1 AND "userId"=$2', [b, user])).rows[0].role, 'ACCOUNTANT');
    // A mismatched clinic condition cannot update the other clinic's branding.
    assert.equal((await client.query('UPDATE "ClinicBranding" SET "primaryColor"=$1 WHERE "clinicId"=$2 AND "clinicId"=$3', ['#000000', a, b])).rowCount, 0);

    const rejected = async (sql: string, values: unknown[], expectedCode: string) => {
      await client.query('SAVEPOINT constraint_case');
      try {
        await assert.rejects(client.query(sql, values), error => {
          assert.equal((error as { code: string }).code, expectedCode);
          return true;
        });
      } finally {
        await client.query('ROLLBACK TO SAVEPOINT constraint_case');
        await client.query('RELEASE SAVEPOINT constraint_case');
      }
    };
    await rejected('UPDATE "Clinic" SET "slug"=(SELECT "slug" FROM "Clinic" WHERE "id"=$1) WHERE "id"=$2', [a, b], '23505');
    await rejected('INSERT INTO "User" ("id","name","email","updatedAt") VALUES ($1,$2,$3,NOW())', [randomUUID(), 'مستخدم مكرر', `${suffix}@example.invalid`], '23505');
    await rejected('INSERT INTO "ClinicMembership" ("id","clinicId","userId","role","updatedAt") VALUES ($1,$2,$3,$4,NOW())', [randomUUID(), a, user, 'DOCTOR'], '23505');
    await rejected('INSERT INTO "ClinicMembership" ("id","clinicId","userId","role","updatedAt") VALUES ($1,$2,$3,$4,NOW())', [randomUUID(), randomUUID(), user, 'DOCTOR'], '23503');
    await rejected('INSERT INTO "ClinicBranding" ("clinicId","updatedAt") VALUES ($1,NOW())', [a], '23505');
    await rejected('UPDATE "ClinicBranding" SET "primaryColor"=$1 WHERE "clinicId"=$2', ['invalid', a], '23514');
    await rejected('UPDATE "User" SET "email"=$1 WHERE "id"=$2', ['UPPER@example.invalid', user], '23514');
    await rejected('UPDATE "Clinic" SET "slug"=$1 WHERE "id"=$2', ['Bad_Slug', a], '23514');
    const hostname = `test-${suffix}.example.invalid`;
    await client.query('INSERT INTO "ClinicDomain" ("id","clinicId","hostname","verificationStatus","isPrimary","updatedAt") VALUES ($1,$2,$3,$4,true,NOW())', [randomUUID(), a, hostname, 'VERIFIED']);
    await rejected('INSERT INTO "ClinicDomain" ("id","clinicId","hostname","updatedAt") VALUES ($1,$2,$3,NOW())', [randomUUID(), b, hostname], '23505');
    await rejected('INSERT INTO "ClinicDomain" ("id","clinicId","hostname","verificationStatus","isPrimary","updatedAt") VALUES ($1,$2,$3,$4,true,NOW())', [randomUUID(), a, `other-${hostname}`, 'VERIFIED'], '23505');
    await rejected('INSERT INTO "ClinicDomain" ("id","clinicId","hostname","isPrimary","updatedAt") VALUES ($1,$2,$3,true,NOW())', [randomUUID(), b, `pending-${hostname}`], '23514');
    const sessionId = randomUUID(), tokenHash = 'a'.repeat(64);
    await client.query('INSERT INTO "Session" ("id","userId","tokenHash","csrfHash","authorizationHash","expiresAt") VALUES ($1,$2,$3,$3,$3,NOW()+INTERVAL \'1 hour\')', [sessionId,user,tokenHash]);
    await rejected('INSERT INTO "Session" ("id","userId","tokenHash","csrfHash","authorizationHash","expiresAt") VALUES ($1,$2,$3,$3,$3,NOW()+INTERVAL \'1 hour\')', [randomUUID(),user,tokenHash], '23505');
    await rejected('UPDATE "Session" SET "expiresAt"="createdAt" WHERE "id"=$1', [sessionId], '23514');
    await rejected('UPDATE "Session" SET "selectedClinicId"=$1 WHERE "id"=$2', [randomUUID(),sessionId], '23503');
    await rejected('INSERT INTO "LoginBucket" ("key","attempts","expiresAt") VALUES ($1,0,NOW())', ['b'.repeat(64)], '23514');
    await rejected('DELETE FROM "Clinic" WHERE "id"=$1', [a], '23503');
    await rejected('DELETE FROM "User" WHERE "id"=$1', [user], '23503');
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
});
