import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import { fixtureDatabase, testUrls } from './database-fixtures.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { KmsClinicController, KmsAdminController } from '../src/kms/kms.controller.js';
import { KeyManagementService } from '../src/kms/key-management.service.js';

const enabled = Boolean(process.env.TEST_DATABASE_URL);
const live = (name: string, fn: () => Promise<void>) => test(name, { skip: !enabled }, fn);

const clinicA = randomUUID();
const clinicB = randomUUID();
const patientA = randomUUID();
const patientB = randomUUID();
const accountA = randomUUID();
const accountB = randomUUID();
const sessionA = randomUUID();
const suffix = randomUUID().slice(0, 8);

let owner: PrismaClient;
let pool: Pool;

before(async () => {
  if (!enabled) return;
  const urls = testUrls();
  owner = fixtureDatabase();
  pool = new Pool({ connectionString: urls.runtime, max: 4, connectionTimeoutMillis: 3000 });

  // Set up 2 test clinics
  await owner.clinic.create({
    data: {
      id: clinicA,
      legalName: 'عيادة أمان 1',
      displayName: 'عيادة أمان 1',
      slug: `sec-a-${suffix}`,
      currency: 'SAR',
    },
  });

  await owner.clinic.create({
    data: {
      id: clinicB,
      legalName: 'عيادة أمان 2',
      displayName: 'عيادة أمان 2',
      slug: `sec-b-${suffix}`,
      currency: 'SAR',
    },
  });

  // Set up Patients & Patient Accounts
  await owner.patient.create({
    data: {
      id: patientA,
      clinicId: clinicA,
      patientNumber: 'P-100001',
      fullName: 'مريض تجربة أمان 1',
      searchName: 'مريض تجربة امان 1',
      gender: 'MALE',
      dateOfBirth: new Date('1990-01-01'),
      status: 'ACTIVE',
      phone: `+96650${Math.floor(1000000 + Math.random() * 9000000)}`,
    },
  });

  await owner.patient.create({
    data: {
      id: patientB,
      clinicId: clinicB,
      patientNumber: 'P-100002',
      fullName: 'مريض تجربة أمان 2',
      searchName: 'مريض تجربة امان 2',
      gender: 'FEMALE',
      dateOfBirth: new Date('1992-02-02'),
      status: 'ACTIVE',
      phone: `+96650${Math.floor(1000000 + Math.random() * 9000000)}`,
    },
  });

  // Patient Accounts in PENDING_ACTIVATION
  await owner.patientAccount.create({
    data: {
      id: accountA,
      clinicId: clinicA,
      patientId: patientA,
      phone: `+96650${Math.floor(1000000 + Math.random() * 9000000)}`,
      passwordHash: 'dummy-placeholder-pending-activation',
      status: 'PENDING_ACTIVATION',
    },
  });

  await owner.patientAccount.create({
    data: {
      id: accountB,
      clinicId: clinicB,
      patientId: patientB,
      phone: `+96650${Math.floor(1000000 + Math.random() * 9000000)}`,
      passwordHash: 'dummy-placeholder-pending-activation',
      status: 'PENDING_ACTIVATION',
    },
  });
});

after(async () => {
  if (owner) {
    await owner.patientPortalAuditEvent.deleteMany({ where: { clinicId: { in: [clinicA, clinicB] } } });
    await owner.patientVerificationToken.deleteMany({ where: { clinicId: { in: [clinicA, clinicB] } } });
    await owner.patientSession.deleteMany({ where: { clinicId: { in: [clinicA, clinicB] } } });
    await owner.patientAccount.deleteMany({ where: { clinicId: { in: [clinicA, clinicB] } } });
    await owner.patient.deleteMany({ where: { clinicId: { in: [clinicA, clinicB] } } });
    await owner.clinic.deleteMany({ where: { id: { in: [clinicA, clinicB] } } });
  }
  await pool?.end();
  await owner?.$disconnect();
});

async function runRuntimeQuery<T = any>(query: string, params: any[] = []): Promise<T[]> {
  const client = await pool.connect();
  try {
    const res = await client.query(query, params);
    return res.rows;
  } finally {
    client.release();
  }
}

// -------------------------------------------------------------
// Vector 1: Forged tenant GUC values without active session
// -------------------------------------------------------------
live('Vector 1: Direct DML on PatientVerificationToken without session is denied', async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Forge clinic_id but no session_id
    await client.query(`SELECT set_config('lamssa.clinic_id', $1, true)`, [clinicA]);

    // Direct INSERT should fail RLS check (tenant_insert requires session_id)
    await assert.rejects(async () => {
      await client.query(
        `INSERT INTO "PatientVerificationToken" ("id", "clinicId", "patientAccountId", "tokenHash", "tokenType", "expiresAt")
         VALUES ($1, $2, $3, $4, 'ACTIVATION', NOW() + INTERVAL '1 hour')`,
        [randomUUID(), clinicA, accountA, randomBytes(32).toString('hex')],
      );
    }, (err: any) => err.code === '42501' || err.message.includes('row-level security'));

    await client.query('ROLLBACK');
  } finally {
    client.release();
  }
});

// -------------------------------------------------------------
// Vector 2 & 3: Unauthenticated bootstrap & Cross-clinic enumeration
// -------------------------------------------------------------
live('Vector 2 & 3: Activation lookup rejects non-existent tokens and isolates clinic data', async () => {
  // Non-existent token lookup returns nothing
  const fakeTokenHash = randomBytes(32).toString('hex');
  const emptyRes = await runRuntimeQuery(
    `SELECT * FROM lamssa_security.portal_activation_lookup($1::text)`,
    [fakeTokenHash],
  );
  assert.equal(emptyRes.length, 0);

  // Mint valid token for clinic A via owner
  const validTokenHashA = randomBytes(32).toString('hex');
  const tokenAId = randomUUID();
  await owner.patientVerificationToken.create({
    data: {
      id: tokenAId,
      clinicId: clinicA,
      patientAccountId: accountA,
      tokenHash: validTokenHashA,
      tokenType: 'ACTIVATION',
      expiresAt: new Date(Date.now() + 3600000),
    },
  });

  // Valid lookup returns clinic A's patient metadata
  const lookupA = await runRuntimeQuery(
    `SELECT * FROM lamssa_security.portal_activation_lookup($1::text)`,
    [validTokenHashA],
  );
  assert.equal(lookupA.length, 1);
  assert.equal(lookupA[0].patientId, patientA);
  assert.equal(lookupA[0].clinicId, clinicA);
});

// -------------------------------------------------------------
// Vector 4: Cross-patient session access
// -------------------------------------------------------------
live('Vector 4: Direct query on PatientSession cannot read other patients sessions', async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Set context to session A
    await client.query(
      `SELECT set_config('lamssa.clinic_id', $1, true), set_config('lamssa.session_id', $2, true)`,
      [clinicA, sessionA],
    );

    const rows = await client.query(`SELECT * FROM "PatientSession" WHERE "clinicId" = $1`, [clinicA]);
    // Can only see sessions matching session_id or nothing if none exist
    for (const r of rows.rows) {
      assert.equal(r.id, sessionA);
    }
    await client.query('ROLLBACK');
  } finally {
    client.release();
  }
});

// -------------------------------------------------------------
// Vector 5 & 7: Replay attacks and SECURITY DEFINER parameter abuse
// -------------------------------------------------------------
live('Vector 5 & 7: Activation token replay and parameter abuse are rejected', async () => {
  // Token 1: for testing parameter abuse (mismatched patient ID)
  const tokenHashMismatch = randomBytes(32).toString('hex');
  const tokenIdMismatch = randomUUID();
  await owner.patientVerificationToken.create({
    data: {
      id: tokenIdMismatch,
      clinicId: clinicA,
      patientAccountId: accountA,
      tokenHash: tokenHashMismatch,
      tokenType: 'ACTIVATION',
      expiresAt: new Date(Date.now() + 3600000),
    },
  });

  const sessionTokenHash = randomBytes(32).toString('hex');
  const csrfTokenHash = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 3600000);

  // Calling complete activation with mismatched patientId fails closed
  await assert.rejects(async () => {
    await runRuntimeQuery(
      `SELECT lamssa_security.portal_complete_activation($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::text, $6::text, $7::text, $8::timestamptz, $9::text, $10::text)`,
      [tokenIdMismatch, accountA, clinicA, patientB /* mismatched! */, 'hashed-password-123', sessionTokenHash, csrfTokenHash, expiresAt, '127.0.0.1', 'Mozilla/5.0'],
    );
  }, /Patient account not in pending activation state or patient ID mismatch/);

  // Token 2: for testing valid activation and subsequent replay rejection
  const tokenHashValid = randomBytes(32).toString('hex');
  const tokenIdValid = randomUUID();
  await owner.patientVerificationToken.create({
    data: {
      id: tokenIdValid,
      clinicId: clinicA,
      patientAccountId: accountA,
      tokenHash: tokenHashValid,
      tokenType: 'ACTIVATION',
      expiresAt: new Date(Date.now() + 3600000),
    },
  });

  // Calling with correct parameters succeeds and activates the account
  await runRuntimeQuery(
    `SELECT lamssa_security.portal_complete_activation($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::text, $6::text, $7::text, $8::timestamptz, $9::text, $10::text)`,
    [tokenIdValid, accountA, clinicA, patientA, 'hashed-password-123', sessionTokenHash, csrfTokenHash, expiresAt, '127.0.0.1', 'Mozilla/5.0'],
  );

  // Attempting to REPLAY the consumed token fails closed
  await assert.rejects(async () => {
    await runRuntimeQuery(
      `SELECT lamssa_security.portal_complete_activation($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::text, $6::text, $7::text, $8::timestamptz, $9::text, $10::text)`,
      [tokenIdValid, accountA, clinicA, patientA, 'replayed-password-attempt', sessionTokenHash, csrfTokenHash, expiresAt, '127.0.0.1', 'Mozilla/5.0'],
    );
  }, /Verification token already used, expired, or invalid/);

  // Lookup for consumed token returns 0 rows
  const consumedLookup = await runRuntimeQuery(
    `SELECT * FROM lamssa_security.portal_activation_lookup($1::text)`,
    [tokenHashValid],
  );
  assert.equal(consumedLookup.length, 0);
});

// -------------------------------------------------------------
// Vector 6: Direct SQL credential modification under runtime role
// -------------------------------------------------------------
live('Vector 6: Direct UPDATE on PatientAccount passwordHash under runtime role is restricted', async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Without active clinic session
    const res = await client.query(
      `UPDATE "PatientAccount" SET "passwordHash" = 'hacked' WHERE "id" = $1::uuid`,
      [accountA],
    );
    // Under RLS without tenant context, 0 rows are affected
    assert.equal(res.rowCount, 0);
    await client.query('ROLLBACK');
  } finally {
    client.release();
  }
});

// -------------------------------------------------------------
// Vectors 8, 9, 10, 11: Runtime role cannot escalate, truncate, or run DDL
// -------------------------------------------------------------
live('Vectors 8, 9, 10, 11: Runtime role cannot escalate, truncate, or run DDL', async () => {
  const { owner: ownerUrl } = testUrls();
  const ownerUser = new URL(ownerUrl).username;
  const client = await pool.connect();
  try {
    // Vector 8: SET ROLE escalation denied
    await assert.rejects(async () => {
      await client.query(`SET ROLE postgres`);
    }, (err: any) => err.code === '42501');

    if (ownerUser) {
      await assert.rejects(async () => {
        await client.query(`SET ROLE ${ownerUser}`);
      }, (err: any) => err.code === '42501');
    }

    // Vector 9: CREATE SCHEMA denied
    await assert.rejects(async () => {
      await client.query(`CREATE SCHEMA malicious_schema`);
    }, (err: any) => err.code === '42501');

    // Vector 10: TRUNCATE denied
    await assert.rejects(async () => {
      await client.query(`TRUNCATE "PatientAccount" CASCADE`);
    }, (err: any) => err.code === '42501');

    // Vector 11: DDL DROP/ALTER denied
    await assert.rejects(async () => {
      await client.query(`DROP TABLE "PatientAccount"`);
    }, (err: any) => err.code === '42501');
  } finally {
    client.release();
  }
});

// -------------------------------------------------------------
// Vector 20: No secret leakage through security health endpoints
// -------------------------------------------------------------
test('Vector 20: Security health endpoints never leak keys or secret material', async () => {
  const mockProvider = {
    providerName: 'local',
    healthCheck: async () => ({
      ok: true,
      provider: 'local',
      timestamp: new Date(),
      latencyMs: 1,
      activeKeyId: 'lamssa/kek/2026-v1',
      activeKeyState: 'ACTIVE',
    }),
  };
  const mockRepo = {
    getActiveKey: async () => ({
      id: '00000000-0000-0000-0000-000000000001',
      keyId: 'lamssa/kek/2026-v1',
      version: 1,
      state: 'ACTIVE',
      algorithm: 'AES_256_GCM',
      description: 'Initial KEK',
      createdAt: new Date(),
      rotatedAt: null,
      revokedAt: null,
    }),
    listKeys: async () => [],
  };
  const kms = new KeyManagementService(mockRepo as any, mockProvider as any);
  const migrationMock = {
    getMigrationStatus: async () => ({ totalEnvelopes: 5, migratedEnvelopes: 5, pendingEnvelopes: 0 }),
  };

  const clinicCtrl = new KmsClinicController(kms, migrationMock as any);
  const adminCtrl = new KmsAdminController(kms, migrationMock as any);

  const clinicHealth = await clinicCtrl.getClinicSecurityHealth({} as any, clinicA);
  const adminHealth = await adminCtrl.getSystemSecurityHealth();

  const serializedClinic = JSON.stringify(clinicHealth);
  const serializedAdmin = JSON.stringify(adminHealth);

  assert(!serializedClinic.includes('master-key'));
  assert(!serializedClinic.includes('test-local'));
  assert(!serializedAdmin.includes('master-key'));
  assert(!serializedAdmin.includes('test-local'));
});

// -------------------------------------------------------------
// Vector 26: Patient portal login and recovery happy path
// -------------------------------------------------------------
live('Vector 26: Valid patient login, session recording and logout succeed', async () => {
  // Account A was activated in Vector 5 test. Let's record login success
  const sessionTokenHash = randomBytes(32).toString('hex');
  const csrfTokenHash = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 3600000);

  const loginRes = await runRuntimeQuery(
    `SELECT * FROM lamssa_security.portal_record_login_success($1::uuid, $2::uuid, $3::uuid, $4::text, $5::text, $6::timestamptz, $7::text, $8::text)`,
    [
      clinicA,
      accountA,
      patientA,
      sessionTokenHash,
      csrfTokenHash,
      expiresAt,
      '127.0.0.1',
      'Mozilla/5.0 Testing',
    ],
  );

  assert.equal(loginRes.length, 1);
  const createdSessionId = loginRes[0].sessionId;
  assert.ok(createdSessionId);

  // Logout session
  const logoutRes = await runRuntimeQuery(
    `SELECT lamssa_security.portal_logout($1::uuid, $2::uuid, $3::uuid, $4::uuid)`,
    [createdSessionId, clinicA, accountA, patientA],
  );
  assert.equal(logoutRes[0].portal_logout, true);
});
