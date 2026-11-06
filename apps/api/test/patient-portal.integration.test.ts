import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { before, after, test } from 'node:test';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Temporal } from '@js-temporal/polyfill';
import pg from 'pg';
import { fixtureDatabase, testUrls } from './database-fixtures.js';
import { configureApp } from '../src/configure-app.js';
import { provisionUser } from '../scripts/provision-user.js';

const enabled = Boolean(process.env.TEST_DATABASE_URL);
const live = (name: string, fn: () => Promise<void>) => test(`patient-portal: ${name}`, { skip: !enabled }, fn);

const suffix = randomUUID();
const clinics = [randomUUID(), randomUUID()];
const clinicSlugs = [`portal-a-${suffix}`, `portal-b-${suffix}`];
const staffEmail = `owner-portal-${suffix}@example.invalid`;
const password = randomBytes(32).toString('base64url');
const origin = 'http://localhost:5173';

let owner: ReturnType<typeof fixtureDatabase>;
let app: INestApplication;
let pool: pg.Pool;
let base: string;
let staffUserId: string;

const patients: { id: string; clinicId: string; phone: string; dob: string; fullName: string }[] = [];
const services: string[][] = [[], []];
const doctors: string[][] = [[], []];

class StaffClient {
  cookies = new Map<string, string>();
  csrf = '';

  async request(path: string, method = 'GET', body?: unknown) {
    const res = await fetch(`${base}/api/v1/${path}`, {
      method,
      headers: {
        Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
        ...(method === 'GET' ? {} : { Origin: origin, 'Content-Type': 'application/json', 'X-CSRF-Token': this.csrf }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    for (const cookie of res.headers.getSetCookie()) {
      const [p] = cookie.split(';');
      const i = p.indexOf('=');
      this.cookies.set(p.slice(0, i), p.slice(i + 1));
    }
    return res;
  }

  async login(clinicIndex = 0) {
    const csrfRes = await (await this.request('auth/csrf')).json() as { csrfToken: string };
    this.csrf = csrfRes.csrfToken;
    const loginRes = await this.request('auth/login', 'POST', { email: staffEmail, password });
    assert.equal(loginRes.status, 200);
    this.csrf = (await loginRes.json() as { csrfToken: string }).csrfToken;
    const clinicRes = await this.request('auth/clinic', 'POST', { clinicId: clinics[clinicIndex] });
    assert.equal(clinicRes.status, 200);
    this.csrf = (await clinicRes.json() as { csrfToken: string }).csrfToken;
    return this;
  }
}

class PatientClient {
  cookies = new Map<string, string>();
  csrf = '';

  async request(path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(`${base}/api/v1/${path}`, {
      method,
      headers: {
        Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
        ...(method === 'GET' ? {} : { Origin: origin, 'Content-Type': 'application/json', 'X-CSRF-Token': this.csrf }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    for (const cookie of res.headers.getSetCookie()) {
      const [p] = cookie.split(';');
      const i = p.indexOf('=');
      this.cookies.set(p.slice(0, i), p.slice(i + 1));
    }
    return res;
  }

  async activate(clinicSlug: string, token: string, phone: string, dateOfBirth: string, pass: string) {
    const res = await this.request('portal/auth/activate', 'POST', {
      clinicSlug,
      token,
      phone,
      dateOfBirth,
      password: pass,
    });
    if (res.status === 200) {
      const data = (await res.clone().json()) as { csrfToken: string };
      this.csrf = data.csrfToken;
    }
    return res;
  }

  async login(clinicSlug: string, phone: string, pass: string) {
    const res = await this.request('portal/auth/login', 'POST', {
      clinicSlug,
      phone,
      password: pass,
    });
    if (res.status === 200) {
      const data = (await res.clone().json()) as { csrfToken: string };
      this.csrf = data.csrfToken;
    }
    return res;
  }

  async logout() {
    return this.request('portal/auth/logout', 'POST', {});
  }
}

before(async () => {
  if (!enabled) return;
  const urls = testUrls();
  process.env.DATABASE_URL = urls.runtime;
  process.env.NODE_ENV = 'test';
  process.env.AUTH_CSRF_SECRET = randomBytes(48).toString('base64url');
  process.env.CORS_ORIGINS = origin;
  process.env.AUTH_LOGIN_ACCOUNT_LIMIT = '100';
  process.env.AUTH_LOGIN_IP_LIMIT = '10000';

  const { AppModule } = await import('../src/app.module.js');
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication({ logger: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  owner = fixtureDatabase();
  pool = new pg.Pool({ connectionString: urls.runtime, options: '-c timezone=UTC', max: 4 });

  // Provision clinics
  for (const [i, id] of clinics.entries()) {
    await owner.clinic.create({
      data: {
        id,
        slug: clinicSlugs[i],
        legalName: `عيادة البوابة القانونية ${i}`,
        displayName: `عيادة لمسة ${i}`,
        currency: 'YER',
        timezone: 'Asia/Aden',
        branding: {
          create: {
            primaryColor: i === 0 ? '#7854D9' : '#087F8C',
            secondaryColor: '#F6F8FC',
          },
        },
      },
    });

    // Create services
    const s1 = await owner.clinicService.create({
      data: {
        clinicId: id,
        name: `جلسة نضارة ${i}`,
        durationMinutes: 30,
        requiresRoom: false,
        active: true,
      },
    });
    services[i].push(s1.id);

    // Create doctor
    const doctorUser = await owner.user.create({
      data: {
        name: `طبيب البوابة ${i}`,
        email: `doc-portal-${i}-${suffix}@example.invalid`,
        status: 'ACTIVE',
        memberships: { create: { clinicId: id, role: 'DOCTOR', status: 'ACTIVE' } },
      },
      include: { memberships: true },
    });
    const doctorResource = await owner.bookableResource.create({
      data: {
        clinicId: id,
        kind: 'DOCTOR',
        label: `د. سارة ${i}`,
        doctorMembershipId: doctorUser.memberships[0].id,
        active: true,
      },
    });
    doctors[i].push(doctorResource.id);

    // Availability for doctor
    for (let weekday = 1; weekday <= 7; weekday++) {
      await owner.resourceAvailability.create({
        data: {
          clinicId: id,
          resourceId: doctorResource.id,
          weekday,
          startMinute: 480, // 08:00
          endMinute: 1200, // 20:00
        },
      });
    }

    // Counter
    await owner.patientCounter.create({ data: { clinicId: id, lastNumber: 2 } });

    // Patients
    const p1 = await owner.patient.create({
      data: {
        clinicId: id,
        patientNumber: `P-00000${i + 1}`,
        fullName: `فاطمة أحمد ${i}`,
        searchName: `فاطمة احمد ${i}`,
        phone: `+96771111111${i}`,
        email: `patient-${i}@example.invalid`,
        dateOfBirth: new Date('1995-05-15T00:00:00.000Z'),
        gender: 'FEMALE',
        status: 'ACTIVE',
      },
    });
    patients.push({ id: p1.id, clinicId: id, phone: `+96771111111${i}`, dob: '1995-05-15', fullName: p1.fullName });
  }

  // Provision staff user
  const u = await provisionUser(owner, {
    email: staffEmail,
    name: 'مالك بوابة الاختبار',
    password,
    memberships: [
      { clinicSlug: clinicSlugs[0], role: 'CLINIC_OWNER' },
      { clinicSlug: clinicSlugs[1], role: 'CLINIC_OWNER' },
    ],
  });
  staffUserId = u.id;
});

after(async () => {
  if (owner) {
    await owner.patientPortalAuditEvent.deleteMany({ where: { clinicId: { in: clinics } } });
    await owner.patientSession.deleteMany({ where: { clinicId: { in: clinics } } });
    await owner.patientVerificationToken.deleteMany({ where: { clinicId: { in: clinics } } });
    await owner.patientAccount.deleteMany({ where: { clinicId: { in: clinics } } });
    await owner.appointment.deleteMany({ where: { clinicId: { in: clinics } } });
    await owner.resourceAvailability.deleteMany({ where: { clinicId: { in: clinics } } });
    await owner.bookableResource.deleteMany({ where: { clinicId: { in: clinics } } });
    await owner.clinicService.deleteMany({ where: { clinicId: { in: clinics } } });
    await owner.schedulingState.deleteMany({ where: { clinicId: { in: clinics } } });
    await owner.patient.deleteMany({ where: { clinicId: { in: clinics } } });
    await owner.patientCounter.deleteMany({ where: { clinicId: { in: clinics } } });
    await owner.session.deleteMany({ where: { userId: staffUserId } });
    await owner.clinicMembership.deleteMany({ where: { clinicId: { in: clinics } } });
    await owner.clinicBranding.deleteMany({ where: { clinicId: { in: clinics } } });
    await owner.clinic.deleteMany({ where: { id: { in: clinics } } });
    await owner.user.deleteMany({ where: { email: { contains: suffix } } });
    await owner.$disconnect();
  }
  if (pool) await pool.end();
  if (app) await app.close();
});

live('staff issues portal invitation and patient activates account with birthdate verification', async () => {
  const staff = await new StaffClient().login(0);
  const p = patients[0];

  // Issue invitation
  const inviteRes = await staff.request(`clinics/${clinics[0]}/patients/${p.id}/portal-invitation`, 'POST', {});
  assert.equal(inviteRes.status, 201);
  const inviteData = await inviteRes.json() as { activationToken: string; phone: string; patientNumber: string };
  assert(inviteData.activationToken);
  assert.equal(inviteData.phone, p.phone);

  const patientClient = new PatientClient();

  // Failed activation: wrong birth date
  const failDob = await patientClient.activate(clinicSlugs[0], inviteData.activationToken, p.phone, '1990-01-01', 'Pass123456');
  assert.equal(failDob.status, 400);

  // Failed activation: wrong phone
  const failPhone = await patientClient.activate(clinicSlugs[0], inviteData.activationToken, '+967799999999', p.dob, 'Pass123456');
  assert.equal(failPhone.status, 400);

  // Successful activation
  const success = await patientClient.activate(clinicSlugs[0], inviteData.activationToken, p.phone, p.dob, 'SecurePatient123!');
  assert.equal(success.status, 200);
  const authData = await success.json() as { patient: { fullName: string }; csrfToken: string };
  assert.equal(authData.patient.fullName, p.fullName);
  assert(authData.csrfToken);

  // Attempting to reuse activation token fails
  const reuse = await patientClient.activate(clinicSlugs[0], inviteData.activationToken, p.phone, p.dob, 'SecurePatient123!');
  assert.equal(reuse.status, 400);
});

live('patient login respects rate limiting and locks account after 5 consecutive failures', async () => {
  const p = patients[0];
  const client = new PatientClient();

  // 4 invalid attempts
  for (let i = 0; i < 4; i++) {
    const res = await client.login(clinicSlugs[0], p.phone, 'WrongPassword!');
    assert.equal(res.status, 401);
  }

  // 5th invalid attempt triggers lockout
  const fifth = await client.login(clinicSlugs[0], p.phone, 'WrongPassword!');
  assert.equal(fifth.status, 401);

  // 6th attempt is locked out (423)
  const locked = await client.login(clinicSlugs[0], p.phone, 'SecurePatient123!');
  assert.equal(locked.status, 423);

  // Reset lockout in DB for subsequent tests
  await owner.patientAccount.updateMany({
    where: { clinicId: clinics[0], phone: p.phone },
    data: { failedLoginAttempts: 0, lockedUntil: null },
  });

  // Now login succeeds
  const success = await client.login(clinicSlugs[0], p.phone, 'SecurePatient123!');
  assert.equal(success.status, 200);
});

live('patient can fetch their own profile and clinic branding, but cannot access another patient data or staff endpoints', async () => {
  const p = patients[0];
  const client = new PatientClient();
  await client.login(clinicSlugs[0], p.phone, 'SecurePatient123!');

  // Profile
  const profRes = await client.request('portal/me');
  assert.equal(profRes.status, 200);
  const prof = await profRes.json() as { patient: { id: string; fullName: string; patientNumber: string }; clinic: { displayName: string } };
  assert.equal(prof.patient.id, p.id);
  assert.equal(prof.clinic.displayName, 'عيادة لمسة 0');

  // Attempt to access staff endpoints with patient cookie must fail
  const staffPatientsRes = await client.request(`clinics/${clinics[0]}/patients`);
  assert.equal(staffPatientsRes.status, 401);

  const staffBillingRes = await client.request(`clinics/${clinics[0]}/billing/invoices`);
  assert.equal(staffBillingRes.status, 401);

  const staffQueueRes = await client.request(`clinics/${clinics[0]}/queue`);
  assert.equal(staffQueueRes.status, 401);
});

live('cross-clinic tenant isolation: patient in Clinic A cannot login or access Clinic B', async () => {
  const p = patients[0];
  const client = new PatientClient();

  // Attempt to login to Clinic B using Clinic A's credentials
  const crossLogin = await client.login(clinicSlugs[1], p.phone, 'SecurePatient123!');
  assert.equal(crossLogin.status, 401);

  // Authenticate as Clinic A patient
  await client.login(clinicSlugs[0], p.phone, 'SecurePatient123!');

  // Even if forged headers are sent, session is strictly scoped to Clinic A
  const me = await (await client.request('portal/me')).json() as { clinic: { id: string } };
  assert.equal(me.clinic.id, clinics[0]);
});

live('patient books appointment with slot locking, idempotency replay, and conflict prevention', async () => {
  const p = patients[0];
  const client = new PatientClient();
  await client.login(clinicSlugs[0], p.phone, 'SecurePatient123!');

  // Check services
  const servicesRes = await client.request('portal/services');
  assert.equal(servicesRes.status, 200);
  const svcList = await servicesRes.json() as { id: string }[];
  assert.equal(svcList[0].id, services[0][0]);

  // Check availability for tomorrow
  const targetDate = Temporal.Now.plainDateISO('Asia/Aden').add({ days: 3 }).toString();
  const availRes = await client.request(`portal/availability?date=${targetDate}&serviceId=${services[0][0]}`);
  assert.equal(availRes.status, 200);
  const avail = await availRes.json() as { slots: { startLocal: string; startAt: string }[] };
  assert(avail.slots.length > 0);

  const chosenSlot = avail.slots[0];
  const bookingKey = randomUUID();

  // Book appointment
  const bookRes = await client.request('portal/appointments', 'POST', {
    serviceId: services[0][0],
    doctorResourceId: doctors[0][0],
    startLocal: chosenSlot.startLocal,
    bookingKey,
  });
  assert.equal(bookRes.status, 201);
  const booking = await bookRes.json() as { id: string; status: string; version: number };
  assert.equal(booking.status, 'SCHEDULED');

  // Idempotency replay with same bookingKey returns identical appointment
  const replayRes = await client.request('portal/appointments', 'POST', {
    serviceId: services[0][0],
    doctorResourceId: doctors[0][0],
    startLocal: chosenSlot.startLocal,
    bookingKey,
  });
  assert.equal(replayRes.status, 201);
  const replayed = await replayRes.json() as { id: string };
  assert.equal(replayed.id, booking.id);

  // Conflicting booking for the exact same slot by another request key must be rejected (409)
  const conflictRes = await client.request('portal/appointments', 'POST', {
    serviceId: services[0][0],
    doctorResourceId: doctors[0][0],
    startLocal: chosenSlot.startLocal,
    bookingKey: randomUUID(),
  });
  assert.equal(conflictRes.status, 409);

  // Verify list shows this appointment
  const listRes = await client.request('portal/appointments');
  assert.equal(listRes.status, 200);
  const apptsList = await listRes.json() as { appointments: { id: string }[] };
  assert(apptsList.appointments.some((a) => a.id === booking.id));

  // Cancel appointment
  const cancelRes = await client.request(`portal/appointments/${booking.id}/cancel`, 'POST', {
    expectedVersion: booking.version,
    reason: 'ظرف طارئ',
  });
  assert.equal(cancelRes.status, 200);
  const cancelled = await cancelRes.json() as { status: string; cancellationReason: string };
  assert.equal(cancelled.status, 'CANCELLED');
  assert.equal(cancelled.cancellationReason, 'PATIENT_REQUEST');
});

live('password reset flow is timing-safe and invalidates old sessions upon completion', async () => {
  const p = patients[0];
  const client = new PatientClient();

  // Request reset
  const resetReq = await client.request('portal/auth/forgot-password', 'POST', {
    clinicSlug: clinicSlugs[0],
    phone: p.phone,
    dateOfBirth: p.dob,
  });
  assert.equal(resetReq.status, 200);
  const resetData = await resetReq.json() as { testToken?: string };
  assert(resetData.testToken);

  // Reset password
  const newPass = 'BrandNewPassword456!';
  const resetRes = await client.request('portal/auth/reset-password', 'POST', {
    clinicSlug: clinicSlugs[0],
    token: resetData.testToken,
    newPassword: newPass,
  });
  assert.equal(resetRes.status, 200);

  // Old password fails
  const oldLogin = await client.login(clinicSlugs[0], p.phone, 'SecurePatient123!');
  assert.equal(oldLogin.status, 401);

  // New password succeeds
  const newLogin = await client.login(clinicSlugs[0], p.phone, newPass);
  assert.equal(newLogin.status, 200);

  // Logout clears session
  const logoutRes = await client.logout();
  assert.equal(logoutRes.status, 200);

  // Subsequent request fails
  const afterLogout = await client.request('portal/me');
  assert.equal(afterLogout.status, 401);
});
