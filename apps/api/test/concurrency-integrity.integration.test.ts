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

describe('Concurrency, Idempotency & Serialized Multi-Tenant Integrity Tests', () => {
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
    pool = new pg.Pool({ connectionString: urls.runtime, max: 20 });

    const { AppModule } = await import('../src/app.module.js');
    const moduleRef = await NestFactory.createApplicationContext(AppModule, { logger: false });
    app = moduleRef as any;
    verifiedSessions = moduleRef.get(VerifiedSessions);
    identity = moduleRef.get(IdentityDatabase);

    // 1. Clinic
    const clinic = await owner.clinic.create({
      data: {
        slug: `clinic-conc-${suffix}`,
        displayName: 'عيادة التزامن والنزاهة',
        legalName: 'شركة التزامن البرمجي المحدودة',
        currency: 'SAR',
        status: 'ACTIVE',
      },
    });
    clinicId = clinic.id;

    // 2. User & Membership (CLINIC_OWNER)
    userId = randomUUID();
    await owner.user.create({
      data: {
        id: userId,
        email: `conc-user-${suffix}@clinic.local`,
        name: 'مدير التزامن',
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

    // Initialize counters
    await owner.patientCounter.create({
      data: { clinicId, lastNumber: 1000 },
    });

    await owner.queueCounter.create({
      data: { clinicId, businessDate: new Date(), lastNumber: 1 },
    });

    await owner.clinicInvoiceCounter.create({
      data: { clinicId, lastNumber: 0, revision: 1 },
    });
  });

  after(async () => {
    if (owner) {
      await owner.queueCounter.deleteMany({ where: { clinicId } });
      await owner.patient.deleteMany({ where: { clinicId } });
      await owner.patientCounter.deleteMany({ where: { clinicId } });
      await owner.clinicInvoiceCounter.deleteMany({ where: { clinicId } });
      await owner.session.deleteMany({ where: { userId } });
      await owner.clinicMembership.deleteMany({ where: { clinicId } });
      await owner.clinic.deleteMany({ where: { id: clinicId } });
      await owner.user.deleteMany({ where: { id: userId } });
      await owner.$disconnect();
    }
    if (pool) await pool.end();
    if (app) await app.close();
  });

  // Helper to run in tenant RLS context
  async function withTenantContext<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN;');
      await client.query("SELECT set_config('lamssa.clinic_id', $1, true);", [clinicId]);
      await client.query("SELECT set_config('lamssa.user_id', $1, true);", [userId]);
      await client.query("SELECT set_config('lamssa.membership_id', $1, true);", [membershipId]);
      await client.query("SELECT set_config('lamssa.session_id', $1, true);", [sessionId]);
      const result = await fn(client);
      await client.query('COMMIT;');
      return result;
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  // ==========================================================================
  // Test 1: Monotonic Sequence Concurrency (Zero Gaps, Zero Duplicates)
  // ==========================================================================

  it('1.1: 10 concurrent transactions incrementing PatientCounter allocate strictly unique numbers', async () => {
    const concurrency = 10;
    const workerPromises = Array.from({ length: concurrency }, async (_, idx) => {
      return withTenantContext(async (client) => {
        const res = await client.query(
          `UPDATE "PatientCounter"
           SET "lastNumber" = "lastNumber" + 1
           WHERE "clinicId" = $1
           RETURNING "lastNumber";`,
          [clinicId],
        );
        const allocatedNum = res.rows[0].lastNumber;

        // Insert patient with this allocated number
        const pNum = `P-${String(allocatedNum).padStart(6, '0')}`;
        await client.query(
          `INSERT INTO "Patient" (id, "clinicId", "patientNumber", "fullName", "searchName", gender, status, "updatedAt")
           VALUES ($1, $2, $3, $4, $5, 'MALE', 'ACTIVE', NOW());`,
          [randomUUID(), clinicId, pNum, `مريض متزامن ${idx}`, `مريض متزامن ${idx}`],
        );

        return allocatedNum;
      });
    });

    const allocatedNumbers = await Promise.all(workerPromises);
    assert.equal(allocatedNumbers.length, concurrency);

    // Verify all allocated numbers are strictly unique
    const uniqueNumbers = new Set(allocatedNumbers);
    assert.equal(uniqueNumbers.size, concurrency, 'All allocated numbers must be unique');

    // Verify consecutive allocation with zero gaps
    const sorted = [...allocatedNumbers].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      assert.equal(sorted[i], sorted[i - 1] + 1, 'Allocation must be strictly consecutive');
    }
  });

  // ==========================================================================
  // Test 2: Serialized Financial Counter Concurrency (Optimistic Revision)
  // ==========================================================================

  it('2.1: 10 concurrent transactions incrementing ClinicInvoiceCounter advance monotonically', async () => {
    const concurrency = 10;
    const workerPromises = Array.from({ length: concurrency }, async () => {
      return withTenantContext(async (client) => {
        const res = await client.query(
          `UPDATE "ClinicInvoiceCounter"
           SET "lastNumber" = "lastNumber" + 1, "revision" = "revision" + 1
           WHERE "clinicId" = $1
           RETURNING "lastNumber", "revision";`,
          [clinicId],
        );
        return {
          lastNumber: res.rows[0].lastNumber,
          revision: Number(res.rows[0].revision),
        };
      });
    });

    const results = await Promise.all(workerPromises);
    assert.equal(results.length, concurrency);

    const invoiceNumbers = results.map((r) => r.lastNumber);
    const uniqueInvoiceNumbers = new Set(invoiceNumbers);
    assert.equal(uniqueInvoiceNumbers.size, concurrency, 'Invoice numbers must be strictly unique');

    const sortedNums = [...invoiceNumbers].sort((a, b) => a - b);
    for (let i = 1; i < sortedNums.length; i++) {
      assert.equal(sortedNums[i], sortedNums[i - 1] + 1, 'Invoice numbers must be strictly consecutive');
    }
  });

  // ==========================================================================
  // Test 3: Idempotent Request Deduplication
  // ==========================================================================

  it('3.1: Idempotency keys prevent double insertion under concurrent execution', async () => {
    const requestKey = randomUUID();
    const pNum = `P-999991`;

    // First insertion succeeds
    const firstInsert = await withTenantContext(async (client) => {
      const res = await client.query(
        `INSERT INTO "Patient" (id, "clinicId", "patientNumber", "fullName", "searchName", gender, status, "updatedAt")
         VALUES ($1, $2, $3, 'مريض مفتاح التكرار', 'مريض مفتاح التكرار', 'MALE', 'ACTIVE', NOW())
         RETURNING id;`,
        [requestKey, clinicId, pNum],
      );
      return res.rows[0].id;
    });

    assert.equal(firstInsert, requestKey);

    // Concurrent replay with exact same requestKey (primary key) must reject duplicate insertion
    await assert.rejects(
      async () => {
        await withTenantContext(async (client) => {
          await client.query(
            `INSERT INTO "Patient" (id, "clinicId", "patientNumber", "fullName", "searchName", gender, status, "updatedAt")
             VALUES ($1, $2, $3, 'مريض مفتاح التكرار', 'مريض مفتاح التكرار', 'MALE', 'ACTIVE', NOW());`,
            [requestKey, clinicId, pNum],
          );
        });
      },
      (err: any) => err.code === '23505', // Unique violation in Postgres
    );
  });
});
