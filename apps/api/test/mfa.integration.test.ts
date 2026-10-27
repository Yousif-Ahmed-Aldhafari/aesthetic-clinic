import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { config } from 'dotenv';
import { configureApp } from '../src/configure-app.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { fixtureDatabase } from './database-fixtures.js';
import { digest } from '../src/auth/crypto.js';
import { base32Decode, generateTotp } from '../src/auth/totp.js';
import { MfaCryptoService } from '../src/auth/mfa-crypto.service.js';
import { provisionUser } from '../scripts/provision-user.js';

config({ path: resolve(import.meta.dirname, '../../../../.env'), quiet: true });
const developmentUrl = process.env.DATABASE_URL;
const testUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(testUrl);
const origin = 'http://localhost:5173';
const password = randomBytes(32).toString('base64url');
const suffix = randomUUID();
const clinicId = randomUUID();
const slug = `mfa-${suffix}`;
let userId: string;
const email = `mfa-owner-${suffix}@example.invalid`;
let app: INestApplication, prisma: PrismaClient, base: string, cryptoService: MfaCryptoService;

class Browser {
  cookies = new Map<string, string>();
  csrf = '';
  async request(path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) {
    const response = await fetch(`${base}/api/v1/${path}`, {
      method,
      headers: {
        Cookie: [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; '),
        ...(method !== 'GET' ? { Origin: origin, 'Content-Type': 'application/json', 'X-CSRF-Token': this.csrf } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0],
        index = pair.indexOf('=');
      this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    return response;
  }
  async preauth() {
    const response = await this.request('auth/csrf');
    this.csrf = ((await response.json()) as { csrfToken: string }).csrfToken;
  }
  async login(pass = password) {
    await this.preauth();
    const response = await this.request('auth/login', 'POST', { email, password: pass });
    if (response.ok) {
      const data = (await response.clone().json()) as Record<string, unknown>;
      if (typeof data.csrfToken === 'string') this.csrf = data.csrfToken;
    }
    return response;
  }
  async loginWithMfa(pass = password) {
    await this.preauth();
    // Reset lastReplayStep for testing multiple rapid logins
    await prisma.userMfa.updateMany({ where: { userId }, data: { lastReplayStep: null } });
    const response = await this.request('auth/login', 'POST', { email, password: pass });
    if (!response.ok) return response;
    const data = (await response.json()) as any;
    if (data.mfaRequired) {
      const dbMfa = await prisma.userMfa.findUniqueOrThrow({ where: { userId } });
      const secretBytes = cryptoService.decryptSecret(dbMfa.totpSecretEnc, dbMfa.totpIv, dbMfa.totpTag);
      const code = generateTotp(secretBytes);
      const verifyRes = await this.request('auth/mfa/verify', 'POST', {
        challengeToken: data.challengeToken,
        code,
      });
      assert.equal(verifyRes.status, 200, await verifyRes.clone().text());
      const vData = (await verifyRes.clone().json()) as any;
      if (typeof vData.csrfToken === 'string') this.csrf = vData.csrfToken;
      return verifyRes;
    } else {
      if (typeof data.csrfToken === 'string') this.csrf = data.csrfToken;
      return response;
    }
  }
  async select(cId = clinicId) {
    const response = await this.request('auth/clinic', 'POST', { clinicId: cId });
    if (response.ok) this.csrf = ((await response.clone().json()) as any).csrfToken;
    return response;
  }
  tokenHash() {
    return digest(this.cookies.get('lamssa_session')!);
  }
}

const live = (name: string, fn: () => Promise<void>) => test(name, { skip: !enabled }, fn);

before(async () => {
  if (!enabled) return;
  const identity = (url: string) => {
    const u = new URL(url);
    return `${u.hostname}:${u.port || 5432}${u.pathname}`;
  };
  assert.notEqual(identity(testUrl!), identity(developmentUrl!), 'Integration tests require a separate database');
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = testUrl;
  process.env.AUTH_CSRF_SECRET = randomBytes(48).toString('base64url');
  process.env.CORS_ORIGINS = origin;
  process.env.AUTH_LOGIN_ACCOUNT_LIMIT = '100';
  process.env.AUTH_LOGIN_IP_LIMIT = '10000';

  const { AppModule } = await import('../src/app.module.js');
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication({ logger: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  prisma = fixtureDatabase();
  cryptoService = new MfaCryptoService(new ConfigService({ AUTH_CSRF_SECRET: process.env.AUTH_CSRF_SECRET }) as any);

  await prisma.clinic.create({
    data: {
      id: clinicId,
      slug,
      legalName: 'عيادة اختبار أمان MFA',
      displayName: 'عيادة التحقق الثنائي',
      currency: 'YER',
      mfaPolicy: 'OWNER_ONLY',
      branding: { create: { primaryColor: '#7854D9' } },
    },
  });

  const result = await provisionUser(prisma, {
    email,
    name: 'مالك العيادة لاختبار MFA',
    password,
    memberships: [{ clinicSlug: slug, role: 'CLINIC_OWNER' }],
  });
  userId = result.id;
});

after(async () => {
  if (prisma) {
    await prisma.mfaRecoveryCode.deleteMany({ where: { mfa: { user: { email: { contains: suffix } } } } });
    await prisma.userMfa.deleteMany({ where: { user: { email: { contains: suffix } } } });
    await prisma.mfaChallenge.deleteMany({ where: { user: { email: { contains: suffix } } } });
    await prisma.session.deleteMany({ where: { user: { email: { contains: suffix } } } });
    await prisma.clinicMembership.deleteMany({ where: { clinicId } });
    await prisma.user.deleteMany({ where: { email: { contains: suffix } } });
    await prisma.clinicBranding.deleteMany({ where: { clinicId } });
    await prisma.clinic.deleteMany({ where: { id: clinicId } });
    await prisma.$disconnect();
  }
  await app?.close();
});

live('Complete MFA enrollment lifecycle: setup, recovery codes, verification, and audit', async () => {
  const b = new Browser();
  const loginRes = await b.login();
  assert.equal(loginRes.status, 200);

  // Check initial MFA status
  const statusBefore = (await (await b.request('auth/mfa/status')).json()) as any;
  assert.equal(statusBefore.enrolled, false);
  assert.equal(statusBefore.status, 'DISABLED');
  assert.equal(statusBefore.required, true);

  // Setup attempt with wrong password fails
  const badSetup = await b.request('auth/mfa/setup', 'POST', { password: 'wrong-password' });
  assert.equal(badSetup.status, 400);

  // Valid setup returns Base32 secret, otpauthUri, and 8 recovery codes
  const setupRes = await b.request('auth/mfa/setup', 'POST', { password });
  assert.equal(setupRes.status, 200);
  const setupData = (await setupRes.json()) as any;
  assert(setupData.base32Secret);
  assert(setupData.otpauthUri.startsWith('otpauth://totp/Lamssa:'));
  assert.equal(setupData.recoveryCodes.length, 8);

  // Verify DB state: PENDING, secret encrypted, 8 hashed recovery codes
  const dbMfa = await prisma.userMfa.findUniqueOrThrow({
    where: { userId },
    include: { recoveryCodes: true },
  });
  assert.equal(dbMfa.status, 'PENDING');
  assert.notEqual(dbMfa.totpSecretEnc, setupData.base32Secret);
  assert.equal(dbMfa.totpIv.length, 24);
  assert.equal(dbMfa.totpTag.length, 32);
  assert.equal(dbMfa.recoveryCodes.length, 8);

  // Verify setup with invalid OTP fails
  const badOtp = await b.request('auth/mfa/verify-setup', 'POST', { code: '000000' });
  assert.equal(badOtp.status, 400);

  // Complete setup with correct OTP
  const secretBytes = base32Decode(setupData.base32Secret);
  const validOtp = generateTotp(secretBytes);
  const goodOtp = await b.request('auth/mfa/verify-setup', 'POST', { code: validOtp });
  assert.equal(goodOtp.status, 200);

  // Status now reports ACTIVE
  const statusAfter = (await (await b.request('auth/mfa/status')).json()) as any;
  assert.equal(statusAfter.enrolled, true);
  assert.equal(statusAfter.status, 'ACTIVE');
  assert.equal(statusAfter.remainingRecoveryCodes, 8);
});

live('Password login with active MFA issues short-lived challenge without session cookie', async () => {
  const b = new Browser();
  await b.preauth();

  // Reset lastReplayStep to allow testing fresh login
  await prisma.userMfa.update({ where: { userId }, data: { lastReplayStep: null } });

  // Login with correct password
  const res = await b.request('auth/login', 'POST', { email, password });
  assert.equal(res.status, 200);
  const data = (await res.json()) as any;

  // MFA challenge is issued
  assert.equal(data.mfaRequired, true);
  assert(data.challengeToken);
  assert.deepEqual(data.methods, ['TOTP', 'RECOVERY']);

  // Crucial security invariant: no session cookie was set!
  assert(!b.cookies.has('lamssa_session'), 'Password-only login must not set session cookie when MFA active');

  // Verify challenge with incorrect code
  const badVerify = await b.request('auth/mfa/verify', 'POST', {
    challengeToken: data.challengeToken,
    code: '123456',
  });
  assert.equal(badVerify.status, 400);

  // Verify challenge with correct TOTP code
  const dbMfa = await prisma.userMfa.findUniqueOrThrow({ where: { userId } });
  const secretBytes = cryptoService.decryptSecret(dbMfa.totpSecretEnc, dbMfa.totpIv, dbMfa.totpTag);
  const validCode = generateTotp(secretBytes);

  const goodVerify = await b.request('auth/mfa/verify', 'POST', {
    challengeToken: data.challengeToken,
    code: validCode,
  });
  assert.equal(goodVerify.status, 200);
  b.csrf = ((await goodVerify.clone().json()) as any).csrfToken;

  // Session cookie is now set!
  assert(b.cookies.has('lamssa_session'));
  assert.equal((await b.request('auth/me')).status, 200);

  // Replay protection: attempting to verify the same challenge again fails
  const replayBrowser = new Browser();
  await replayBrowser.preauth();
  const replayVerify = await replayBrowser.request('auth/mfa/verify', 'POST', {
    challengeToken: data.challengeToken,
    code: validCode,
  });
  assert.equal(replayVerify.status, 401);
});

live('Single-use recovery code unlocks login and marks code consumed', async () => {
  const b = new Browser();
  await b.preauth();

  const loginRes = await b.request('auth/login', 'POST', { email, password });
  const { challengeToken } = (await loginRes.json()) as any;

  // Regenerate recovery codes to get plaintext using authenticated browser
  const regenBrowser = new Browser();
  await regenBrowser.loginWithMfa();
  const regenRes = await regenBrowser.request('auth/mfa/recovery-codes/regenerate', 'POST', { password });
  assert.equal(regenRes.status, 200);
  const { recoveryCodes } = (await regenRes.json()) as any;
  const testCode = recoveryCodes[0];

  // Login with recovery code
  const recoveryVerify = await b.request('auth/mfa/verify', 'POST', {
    challengeToken,
    recoveryCode: testCode,
  });
  assert.equal(recoveryVerify.status, 200);
  assert(b.cookies.has('lamssa_session'));

  // The used code cannot be used again
  const b2 = new Browser();
  await b2.preauth();
  const login2 = await b2.request('auth/login', 'POST', { email, password });
  const { challengeToken: token2 } = (await login2.json()) as any;

  const reuseRes = await b2.request('auth/mfa/verify', 'POST', {
    challengeToken: token2,
    recoveryCode: testCode,
  });
  assert.equal(reuseRes.status, 400);
});

live('Step-up authorization enforces 15-minute verification on sensitive operations', async () => {
  const b = new Browser();
  await b.loginWithMfa();

  // Fresh login is stepped up
  const sessionsBefore = await b.request('auth/sessions');
  assert.equal(sessionsBefore.status, 200);

  // Simulate expired step-up by setting mfaVerifiedAt to 20 minutes ago
  const twentyMinsAgo = new Date(Date.now() - 20 * 60 * 1000);
  await prisma.session.updateMany({
    where: { userId },
    data: { mfaVerifiedAt: twentyMinsAgo },
  });

  // Sensitive operation (regenerate recovery codes) is rejected with 403 MFA_STEP_UP_REQUIRED
  const rejected = await b.request('auth/mfa/recovery-codes/regenerate', 'POST', { password });
  assert.equal(rejected.status, 403);
  const errBody = (await rejected.json()) as any;
  assert.equal(errBody.error.code, 'MFA_STEP_UP_REQUIRED');

  // Submitting password alone to step-up fails closed with 400
  const passwordStepUp = await b.request('auth/mfa/step-up', 'POST', { password } as any);
  assert.equal(passwordStepUp.status, 400);
  const passErr = (await passwordStepUp.json()) as any;
  assert(passErr.error.code === 'INVALID_REQUEST' || passErr.error.code === 'MFA_INVALID_CODE');

  // Step up using TOTP code
  await prisma.userMfa.update({ where: { userId }, data: { lastReplayStep: null } });
  const dbMfa = await prisma.userMfa.findUniqueOrThrow({ where: { userId } });
  const secretBytes = cryptoService.decryptSecret(dbMfa.totpSecretEnc, dbMfa.totpIv, dbMfa.totpTag);
  const stepUpOtp = generateTotp(secretBytes);

  const stepUpRes = await b.request('auth/mfa/step-up', 'POST', { code: stepUpOtp });
  assert.equal(stepUpRes.status, 200);

  // Sensitive operation now succeeds!
  const retryRes = await b.request('auth/mfa/recovery-codes/regenerate', 'POST', { password });
  assert.equal(retryRes.status, 200);
});

live('Concurrent recovery code redemption is strictly atomic under simultaneous requests', async () => {
  const b = new Browser();
  await b.loginWithMfa();
  const dbMfa = await prisma.userMfa.findUniqueOrThrow({ where: { userId } });
  const secretBytes = cryptoService.decryptSecret(dbMfa.totpSecretEnc, dbMfa.totpIv, dbMfa.totpTag);
  const otp = generateTotp(secretBytes);
  await b.request('auth/mfa/step-up', 'POST', { code: otp });

  const regenRes = await b.request('auth/mfa/recovery-codes/regenerate', 'POST', { password });
  assert.equal(regenRes.status, 200);
  const { recoveryCodes } = (await regenRes.json()) as any;
  const raceCode = recoveryCodes[1];

  const b1 = new Browser();
  const b2 = new Browser();
  await b1.preauth();
  await b2.preauth();

  const [login1, login2] = await Promise.all([
    b1.request('auth/login', 'POST', { email, password }),
    b2.request('auth/login', 'POST', { email, password }),
  ]);

  const { challengeToken: token1 } = (await login1.json()) as any;
  const { challengeToken: token2 } = (await login2.json()) as any;

  const [res1, res2] = await Promise.all([
    b1.request('auth/mfa/verify', 'POST', { challengeToken: token1, recoveryCode: raceCode }),
    b2.request('auth/mfa/verify', 'POST', { challengeToken: token2, recoveryCode: raceCode }),
  ]);

  const statuses = [res1.status, res2.status].sort();
  assert.deepEqual(statuses, [200, 400], 'Exactly one request succeeds and the other fails with 400');
});

live('Required-but-unenrolled user cannot perform clinic mutations and receives MFA_SETUP_REQUIRED', async () => {
  const unenrollSuffix = `${suffix}-unenrolled`;
  const unenrollEmail = `unrolled-${unenrollSuffix}@example.invalid`;
  await provisionUser(prisma, {
    email: unenrollEmail,
    name: 'Unenrolled Owner',
    password,
    memberships: [{ clinicSlug: slug, role: 'CLINIC_OWNER' }],
  });

  const b = new Browser();
  await b.preauth();
  const loginRes = await b.request('auth/login', 'POST', { email: unenrollEmail, password });
  assert.equal(loginRes.status, 200);
  const loginData = (await loginRes.json()) as any;
  b.csrf = loginData.csrfToken;

  // Selecting clinic updates session and csrfToken
  const selectRes = await b.select(clinicId);
  assert.equal(selectRes.status, 200);

  // Attempting a privileged operation requiring step-up fails closed with 403 MFA_SETUP_REQUIRED
  const blockedAction = await b.request('auth/mfa/recovery-codes/regenerate', 'POST', { password });
  assert.equal(blockedAction.status, 403);
  const err = (await blockedAction.json()) as any;
  assert.equal(err.error.code, 'MFA_SETUP_REQUIRED');

  // Safe enrollment path remains accessible
  const setupRes = await b.request('auth/mfa/setup', 'POST', { password });
  assert.equal(setupRes.status, 200);
});

live('Session management lists active devices and revokes other sessions', async () => {
  const b1 = new Browser();
  await b1.loginWithMfa();

  const sessionsRes = await b1.request('auth/sessions');
  assert.equal(sessionsRes.status, 200);
  const sessions = (await sessionsRes.json()) as any[];
  assert(sessions.length >= 1);
  assert.equal(typeof sessions[0].isCurrent, 'boolean');
  assert(sessions[0].ipAddress.includes('***'));
  assert(sessions[0].deviceSummary);

  // Revoke other sessions
  const revokeOther = await b1.request('auth/sessions', 'DELETE');
  assert.equal(revokeOther.status, 200);
});

live('MFA disablement requires password and OTP, and cleans up recovery codes', async () => {
  const b = new Browser();
  await b.loginWithMfa();

  await prisma.userMfa.update({ where: { userId }, data: { lastReplayStep: null } });
  const dbMfa = await prisma.userMfa.findUniqueOrThrow({ where: { userId } });
  const secretBytes = cryptoService.decryptSecret(dbMfa.totpSecretEnc, dbMfa.totpIv, dbMfa.totpTag);
  const disableOtp = generateTotp(secretBytes);

  const disableRes = await b.request('auth/mfa/disable', 'POST', {
    password,
    code: disableOtp,
  });
  assert.equal(disableRes.status, 200);

  // Verify in DB
  const disabledMfa = await prisma.userMfa.findUniqueOrThrow({
    where: { userId },
    include: { recoveryCodes: true },
  });
  assert.equal(disabledMfa.status, 'DISABLED');
  assert.equal(disabledMfa.recoveryCodes.length, 0);

  // Next login succeeds with password alone
  const b2 = new Browser();
  const directLogin = await b2.login();
  assert.equal(directLogin.status, 200);
  const directData = (await directLogin.json()) as any;
  assert.equal(directData.mfaRequired, undefined);
  assert(b2.cookies.has('lamssa_session'));
});
