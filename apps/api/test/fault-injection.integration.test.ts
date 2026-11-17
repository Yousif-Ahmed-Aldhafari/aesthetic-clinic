import 'reflect-metadata';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { VerifiedSessions, type VerifiedPrincipal } from '../src/prisma/verified-sessions.js';
import { IdentityDatabase } from '../src/prisma/identity.database.js';
import { authorizationHash } from '../src/auth/crypto.js';
import { testUrls, fixtureDatabase } from './database-fixtures.js';

describe('Reliability, Fault Injection & Operational Resilience Tests', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let pool: pg.Pool;
  let verifiedSessions: VerifiedSessions;
  let identity: IdentityDatabase;

  const suffix = randomUUID().slice(0, 8);
  let clinicId: string;
  let userId: string;
  let membershipId: string;
  let sessionId: string;
  let proof: VerifiedPrincipal;

  before(async () => {
    const urls = testUrls();
    process.env.DATABASE_URL = urls.runtime;
    process.env.NODE_ENV = 'test';
    owner = fixtureDatabase();
    pool = new pg.Pool({ connectionString: urls.runtime, max: 10 });

    const { AppModule } = await import('../src/app.module.js');
    const moduleRef = await NestFactory.createApplicationContext(AppModule, { logger: false });
    app = moduleRef as any;
    verifiedSessions = moduleRef.get(VerifiedSessions);
    identity = moduleRef.get(IdentityDatabase);

    // 1. Clinic
    const clinic = await owner.clinic.create({
      data: {
        slug: `clinic-fault-${suffix}`,
        displayName: 'عيادة اختبار الأعطال',
        legalName: 'شركة اختبار الأعطال المحدودة',
        currency: 'SAR',
        status: 'ACTIVE',
      },
    });
    clinicId = clinic.id;

    // 2. User & Membership
    userId = randomUUID();
    await owner.user.create({
      data: {
        id: userId,
        email: `fault-user-${suffix}@clinic.local`,
        name: 'طبيب اختبار الأعطال',
        status: 'ACTIVE',
      },
    });

    membershipId = randomUUID();
    await owner.clinicMembership.create({
      data: {
        id: membershipId,
        clinicId,
        userId,
        role: 'CLINIC_OWNER',
        status: 'ACTIVE',
      },
    });

    // 3. Session
    sessionId = randomUUID();
    const u = await identity.loadUser(owner, userId);
    const hash = authorizationHash(u!);
    const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
    await owner.session.create({
      data: {
        id: sessionId,
        userId,
        selectedClinicId: clinicId,
        tokenHash: token,
        csrfHash: token,
        authorizationHash: hash,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    proof = verifiedSessions.issue(userId, sessionId);
    assert.ok(proof);
  });

  after(async () => {
    if (owner) {
      await owner.patient.deleteMany({ where: { clinicId } });
      await owner.session.deleteMany({ where: { userId } });
      await owner.clinicMembership.deleteMany({ where: { clinicId } });
      await owner.clinic.deleteMany({ where: { id: clinicId } });
      await owner.user.deleteMany({ where: { id: userId } });
      await owner.$disconnect();
    }
    if (pool) await pool.end();
    if (app) await app.close();
  });

  // ==========================================================================
  // Test 1: Immediate Session Revocation Under Live Execution
  // ==========================================================================

  it('1.1: Revoking a session immediately causes subsequent queries to be denied by RLS', async () => {
    const client = await pool.connect();
    try {
      // 1. Query with active session works
      await client.query('BEGIN;');
      await client.query("SELECT set_config('lamssa.clinic_id', $1, true);", [clinicId]);
      await client.query("SELECT set_config('lamssa.user_id', $1, true);", [userId]);
      await client.query("SELECT set_config('lamssa.membership_id', $1, true);", [membershipId]);
      await client.query("SELECT set_config('lamssa.session_id', $1, true);", [sessionId]);

      const initialRes = await client.query(`SELECT id FROM "Patient" WHERE "clinicId" = $1;`, [clinicId]);
      assert.ok(Array.isArray(initialRes.rows));
      await client.query('COMMIT;');

      // 2. Revoke the session in database
      await owner.session.update({
        where: { id: sessionId },
        data: { revokedAt: new Date() },
      });

      // 3. Query with the revoked session is denied by RLS (0 rows returned or blocked)
      await client.query('BEGIN;');
      await client.query("SELECT set_config('lamssa.clinic_id', $1, true);", [clinicId]);
      await client.query("SELECT set_config('lamssa.user_id', $1, true);", [userId]);
      await client.query("SELECT set_config('lamssa.membership_id', $1, true);", [membershipId]);
      await client.query("SELECT set_config('lamssa.session_id', $1, true);", [sessionId]);

      // Attempting to insert a patient must fail check constraint or RLS
      await assert.rejects(
        async () => {
          await client.query(
            `INSERT INTO "Patient" (id, "clinicId", "patientNumber", "fullName", "searchName", gender, status, "updatedAt")
             VALUES ($1, $2, 'P-888888', 'مريض جلسة ملغاة', 'مريض جلسة ملغاة', 'FEMALE', 'ACTIVE', NOW());`,
            [randomUUID(), clinicId],
          );
        },
        (err: any) => err.code === '42501' || err.message.includes('row-level security') || err.message.includes('check'),
      );
      await client.query('ROLLBACK;');
    } finally {
      client.release();
    }
  });

  // ==========================================================================
  // Test 2: Connection Pool Exhaustion Handling
  // ==========================================================================

  it('2.1: Connection pool exhaustion raises clean timeout error without process crash', async () => {
    // Create an isolated small pool with max=2 and timeout 500ms
    const urls = testUrls();
    const tinyPool = new pg.Pool({
      connectionString: urls.runtime,
      max: 2,
      connectionTimeoutMillis: 500,
    });

    const client1 = await tinyPool.connect();
    const client2 = await tinyPool.connect();

    try {
      // Third connection attempt must time out cleanly
      await assert.rejects(
        async () => {
          await tinyPool.connect();
        },
        (err: any) => err.message.includes('timeout') || err.message.includes('Connection terminated'),
      );
    } finally {
      client1.release();
      client2.release();
      await tinyPool.end();
    }
  });

  // ==========================================================================
  // Test 3: Fail-Closed Transaction Abort (Zero Partial State Bleed)
  // ==========================================================================

  it('3.1: Mid-transaction failure cleanly rolls back with zero orphan state', async () => {
    const client = await pool.connect();
    const uncommittedPatientId = randomUUID();

    try {
      await client.query('BEGIN;');
      await client.query("SELECT set_config('lamssa.clinic_id', $1, true);", [clinicId]);

      // Step 1: Insert patient
      await client.query(
        `INSERT INTO "Patient" (id, "clinicId", "patientNumber", "fullName", "searchName", gender, status, "updatedAt")
         VALUES ($1, $2, 'P-777777', 'مريض فشل المعاملة', 'مريض فشل المعاملة', 'MALE', 'ACTIVE', NOW());`,
        [uncommittedPatientId, clinicId],
      );

      // Step 2: Trigger intentional failure (e.g. division by zero or invalid SQL)
      await client.query('SELECT 1 / 0;');

      await client.query('COMMIT;');
    } catch {
      await client.query('ROLLBACK;');
    } finally {
      client.release();
    }

    // Verify patient was rolled back completely
    const exists = await owner.patient.findUnique({
      where: { id: uncommittedPatientId },
    });
    assert.equal(exists, null, 'Uncommitted patient must not exist after rollback');
  });
});
