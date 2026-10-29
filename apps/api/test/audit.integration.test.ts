import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { after, before, test } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { config } from 'dotenv';
import pg from 'pg';
import { configureApp } from '../src/configure-app.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { fixtureDatabase, testUrls } from './database-fixtures.js';
import { provisionUser } from '../scripts/provision-user.js';
import { AuditService } from '../src/audit/audit.service.js';

config({ path: resolve(import.meta.dirname, '../../../../.env'), quiet: true });
const enabled = Boolean(process.env.TEST_DATABASE_URL);
const origin = 'http://localhost:5173';
const password = randomBytes(32).toString('base64url');
const suffix = randomUUID();
const clinicIds = [randomUUID(), randomUUID()];
const slugs = [`audit-a-${suffix}`, `audit-b-${suffix}`];
const userIds: string[] = [];
const accounts = ['owner-a', 'owner-b', 'doctor-a'].map((name) => `${name}-${suffix}@example.invalid`);

let app: INestApplication;
let prisma: PrismaClient;
let base: string;

class Browser {
  cookies = new Map<string, string>();
  csrf = '';

  async request(path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) {
    const response = await fetch(`${base}/api/v1/${path}`, {
      method,
      headers: {
        Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
        ...(method !== 'GET' ? { Origin: origin, 'Content-Type': 'application/json', 'X-CSRF-Token': this.csrf } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0];
      const index = pair.indexOf('=');
      this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    return response;
  }

  async preauth() {
    const response = await this.request('auth/csrf');
    this.csrf = (await response.json() as { csrfToken: string }).csrfToken;
  }

  async login(accountIndex: number, pass = password) {
    await this.preauth();
    const response = await this.request('auth/login', 'POST', { email: accounts[accountIndex], password: pass });
    if (response.ok) {
      const data = await response.clone().json() as { csrfToken: string };
      this.csrf = data.csrfToken;
    }
    return response;
  }

  async select(clinicIndex: number) {
    const response = await this.request('auth/clinic', 'POST', { clinicId: clinicIds[clinicIndex] });
    if (response.ok) {
      const data = await response.clone().json() as { csrfToken: string };
      this.csrf = data.csrfToken;
    }
    return response;
  }

  async logout() {
    return this.request('auth/logout', 'POST', {});
  }
}

if (!enabled) {
  test('audit integration tests skipped: no TEST_DATABASE_URL configured', () => {});
} else {
  before(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.AUTH_CSRF_SECRET = randomBytes(48).toString('base64url');
    process.env.CORS_ORIGINS = origin;
    process.env.AUTH_LOGIN_ACCOUNT_LIMIT = '100';
    process.env.AUTH_LOGIN_IP_LIMIT = '10000';

    const { AppModule } = await import('../src/app.module.js');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();

    prisma = fixtureDatabase();

    // Provision Clinic A and Clinic B with branding
    for (const [i, id] of clinicIds.entries()) {
      await prisma.clinic.create({
        data: {
          id,
          slug: slugs[i],
          legalName: `Clinic Legal ${i + 1}`,
          displayName: `Clinic ${i + 1}`,
          currency: 'SAR',
          address: 'Riyadh',
          timezone: 'Asia/Riyadh',
          branding: {
            create: {
              primaryColor: i === 0 ? '#7854D9' : '#087F8C',
            },
          },
        },
      });
    }

    // Provision Users
    const res0 = await provisionUser(prisma, { email: accounts[0], name: 'Owner A', password, memberships: [{ clinicSlug: slugs[0], role: 'CLINIC_OWNER' }] });
    userIds.push(res0.id);
    const res1 = await provisionUser(prisma, { email: accounts[1], name: 'Owner B', password, memberships: [{ clinicSlug: slugs[1], role: 'CLINIC_OWNER' }] });
    userIds.push(res1.id);
    const res2 = await provisionUser(prisma, { email: accounts[2], name: 'Doctor A', password, memberships: [{ clinicSlug: slugs[0], role: 'DOCTOR' }] });
    userIds.push(res2.id);
  });

  after(async () => {
    if (app) await app.close();
    if (prisma) {
      await prisma.auditEvent.deleteMany({ where: { clinicId: { in: clinicIds } } }).catch(() => {});
      await prisma.session.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
      await prisma.clinicMembership.deleteMany({ where: { clinicId: { in: clinicIds } } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});
      await prisma.clinicBranding.deleteMany({ where: { clinicId: { in: clinicIds } } }).catch(() => {});
      await prisma.clinic.deleteMany({ where: { id: { in: clinicIds } } }).catch(() => {});
      await prisma.$disconnect().catch(() => {});
    }
  });

  test('audit events are recorded on successful and failed login, and logout', async () => {
    const browser = new Browser();

    // 1. Failed login returns 401
    const failRes = await browser.login(0, 'WrongPassword123!');
    assert.equal(failRes.status, 401);

    // 2. Successful login returns 200
    const successRes = await browser.login(0);
    assert.equal(successRes.status, 200);

    // Select Clinic A
    const selectRes = await browser.select(0);
    assert.equal(selectRes.status, 200);

    // 3. Logout returns 200
    const logoutRes = await browser.logout();
    assert.equal(logoutRes.status, 200);

    // Verify events directly in DB
    const events = await prisma.auditEvent.findMany({
      where: { actorEmail: accounts[0] },
      orderBy: { createdAt: 'asc' },
    });

    assert(events.length >= 3, `Expected at least 3 audit events, found ${events.length}`);
    const failedEvent = events.find((e) => e.action === 'auth.failed_login');
    const loginEvent = events.find((e) => e.action === 'auth.login');
    const logoutEvent = events.find((e) => e.action === 'auth.logout');

    assert(failedEvent, 'auth.failed_login event must exist');
    assert.equal(failedEvent.outcome, 'FAILURE');
    assert.equal(failedEvent.category, 'AUTH');

    assert(loginEvent, 'auth.login event must exist');
    assert.equal(loginEvent.outcome, 'SUCCESS');

    assert(logoutEvent, 'auth.logout event must exist');
    assert.equal(logoutEvent.outcome, 'SUCCESS');
  });

  test('security access denial (403) is logged out-of-band with actor context', async () => {
    const browser = new Browser();
    const loginRes = await browser.login(2); // Login as DOCTOR
    assert.equal(loginRes.status, 200);
    await browser.select(0); // Select Clinic A

    // Doctor attempts to access clinic settings/audit (requires audit.read / CLINIC_OWNER or CLINIC_ADMIN)
    const deniedRes = await browser.request(`clinics/${clinicIds[0]}/audit/events`);
    assert.equal(deniedRes.status, 403);

    // Small delay to allow asynchronous safe filter audit event commit
    await new Promise((r) => setTimeout(r, 150));

    // Verify security.access_denied event was recorded
    const securityEvents = await prisma.auditEvent.findMany({
      where: {
        action: 'security.access_denied',
        actorEmail: accounts[2],
      },
    });

    assert(securityEvents.length > 0, 'security.access_denied event must be recorded');
    const event = securityEvents[0];
    assert.equal(event.category, 'SECURITY');
    assert.equal(event.outcome, 'DENIED');
  });

  test('audit events endpoint enforces tenant isolation between clinics', async () => {
    const auditService = app.get(AuditService);
    // Explicitly record an event for Clinic A and Clinic B
    await auditService.recordDirectSafe({
      clinicId: clinicIds[0],
      action: 'identity.profile_update',
      category: 'IDENTITY',
      actorEmail: accounts[0],
    });
    await auditService.recordDirectSafe({
      clinicId: clinicIds[1],
      action: 'identity.profile_update',
      category: 'IDENTITY',
      actorEmail: accounts[1],
    });

    const browserA = new Browser();
    const loginA = await browserA.login(0); // Clinic A Owner
    assert.equal(loginA.status, 200);
    await browserA.select(0);

    const browserB = new Browser();
    const loginB = await browserB.login(1); // Clinic B Owner
    assert.equal(loginB.status, 200);
    await browserB.select(1);

    // Query Clinic A audit events as Clinic A Owner
    const resA = await browserA.request(`clinics/${clinicIds[0]}/audit/events`);
    assert.equal(resA.status, 200);
    const dataA = await resA.json() as { events: Array<{ clinicId: string | null }> };
    assert(Array.isArray(dataA.events));
    assert(dataA.events.length > 0);
    for (const item of dataA.events) {
      if (item.clinicId) {
        assert.equal(item.clinicId, clinicIds[0], 'Clinic A owner must only see Clinic A events');
      }
    }

    // Clinic A Owner attempts to access Clinic B audit events -> Forbidden / NotFound
    const crossRes = await browserA.request(`clinics/${clinicIds[1]}/audit/events`);
    assert([403, 404].includes(crossRes.status), 'Cross-tenant access must be rejected');

    // Query Clinic B audit events as Clinic B Owner
    const resB = await browserB.request(`clinics/${clinicIds[1]}/audit/events`);
    assert.equal(resB.status, 200);
    const dataB = await resB.json() as { events: Array<{ clinicId: string | null }> };
    assert(Array.isArray(dataB.events));
    assert(dataB.events.length > 0);
    for (const item of dataB.events) {
      if (item.clinicId) {
        assert.equal(item.clinicId, clinicIds[1], 'Clinic B owner must only see Clinic B events');
      }
    }
  });

  test('audit endpoint supports category and action filtering and keyset pagination', async () => {
    const auditService = app.get(AuditService);
    await auditService.recordDirectSafe({
      clinicId: clinicIds[0],
      action: 'auth.login',
      category: 'AUTH',
      actorEmail: accounts[0],
    });
    await auditService.recordDirectSafe({
      clinicId: clinicIds[0],
      action: 'patients.create',
      category: 'PATIENTS',
      actorEmail: accounts[0],
    });

    const browser = new Browser();
    await browser.login(0);
    await browser.select(0);

    // Filter by category=AUTH
    const authCategoryRes = await browser.request(`clinics/${clinicIds[0]}/audit/events?category=AUTH`);
    assert.equal(authCategoryRes.status, 200);
    const authData = await authCategoryRes.json() as { events: Array<{ category: string }> };
    assert(authData.events.length > 0);
    for (const item of authData.events) {
      assert.equal(item.category, 'AUTH');
    }

    // Filter by action=auth.login
    const actionRes = await browser.request(`clinics/${clinicIds[0]}/audit/events?action=auth.login`);
    assert.equal(actionRes.status, 200);
    const actionData = await actionRes.json() as { events: Array<{ action: string }> };
    assert(actionData.events.length > 0);
    for (const item of actionData.events) {
      assert.equal(item.action, 'auth.login');
    }

    // Bounded limit pagination
    const pagedRes = await browser.request(`clinics/${clinicIds[0]}/audit/events?limit=1`);
    assert.equal(pagedRes.status, 200);
    const pagedData = await pagedRes.json() as { events: unknown[]; nextCursor: string | null };
    assert.equal(pagedData.events.length, 1);
  });

  test('runtime database role cannot UPDATE or DELETE AuditEvent records (append-only enforcement)', async () => {
    const { runtime } = testUrls();
    const runtimeClient = new pg.Client({ connectionString: runtime });
    await runtimeClient.connect();

    try {
      // Find an existing audit event id
      const { rows } = await runtimeClient.query('SELECT id FROM public."AuditEvent" LIMIT 1');
      if (rows.length > 0) {
        const targetId = rows[0].id;

        // Try UPDATE
        await assert.rejects(
          runtimeClient.query('UPDATE public."AuditEvent" SET action = \'tampered\' WHERE id = $1', [targetId]),
          /permission denied|Audit events are immutable/i
        );

        // Try DELETE
        await assert.rejects(
          runtimeClient.query('DELETE FROM public."AuditEvent" WHERE id = $1', [targetId]),
          /permission denied|Audit events are immutable/i
        );
      }
    } finally {
      await runtimeClient.end().catch(() => {});
    }
  });
}
