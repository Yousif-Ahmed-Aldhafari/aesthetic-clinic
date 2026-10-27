import { randomUUID } from 'node:crypto';
import { Injectable, Optional } from '@nestjs/common';
import { IdentityDatabase, type AuthUser } from '../prisma/identity.database.js';
import { MfaCryptoService } from './mfa-crypto.service.js';
import { AuthError } from './auth-error.js';
import { digest, secret } from './crypto.js';
import { verifyPassword } from './password.js';
import {
  generateTotpSecret,
  generateOtpauthUri,
  verifyTotp,
  generateRecoveryCodes,
  verifyRecoveryCode,
} from './totp.js';
import { AuditService } from '../audit/audit.service.js';
import { MetricsService } from '../observability/metrics.service.js';

export interface SetupMfaResponse {
  base32Secret: string;
  otpauthUri: string;
  recoveryCodes: string[];
}

@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: IdentityDatabase,
    private readonly crypto: MfaCryptoService,
    @Optional() private readonly audit?: AuditService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  async hasActiveMfa(userId: string): Promise<boolean> {
    const mfa = await this.prisma.userMfa.findUnique({
      where: { userId },
      select: { status: true },
    });
    return mfa?.status === 'ACTIVE';
  }

  async getStatus(userId: string, user: AuthUser, selectedClinicId?: string | null) {
    const mfa = await this.prisma.userMfa.findUnique({
      where: { userId },
      include: {
        recoveryCodes: {
          where: { usedAt: null },
          select: { id: true },
        },
      },
    });

    const isEnrolled = mfa?.status === 'ACTIVE';
    const isRequired = await this.isMfaRequiredForUser(user, selectedClinicId);

    return {
      enrolled: isEnrolled,
      status: mfa?.status ?? 'DISABLED',
      enrolledAt: mfa?.enrolledAt?.toISOString() ?? null,
      remainingRecoveryCodes: mfa?.recoveryCodes?.length ?? 0,
      required: isRequired,
    };
  }

  async isMfaRequiredForUser(user: AuthUser, selectedClinicId?: string | null): Promise<boolean> {
    if (user.platformRole === 'PLATFORM_ADMIN') return true;

    if (selectedClinicId) {
      const membership = user.memberships.find(
        (m) => m.clinicId === selectedClinicId && m.status === 'ACTIVE' && m.clinic.status === 'ACTIVE',
      );
      if (!membership) return false;

      const policy = await this.prisma.clinicMfaPolicy(selectedClinicId);
      if (!policy) return false;

      switch (policy) {
        case 'OWNER_ONLY':
          return membership.role === 'CLINIC_OWNER';
        case 'ADMINS_AND_OWNER':
          return membership.role === 'CLINIC_OWNER' || membership.role === 'CLINIC_ADMIN';
        case 'ALL_STAFF':
          return true;
        case 'OPTIONAL':
          return false;
        default:
          return false;
      }
    }

    return user.memberships.some(
      (m) => m.role === 'CLINIC_OWNER' && m.status === 'ACTIVE' && m.clinic.status === 'ACTIVE',
    );
  }

  async setup(
    userId: string,
    password: string,
    userEmail: string,
    ip?: string | null,
    ua?: string | null,
    correlationId?: string | null,
  ): Promise<SetupMfaResponse> {
    const creds = await this.prisma.credentialsByEmail(userEmail);
    if (!creds || !creds.passwordHash) throw new AuthError('AUTH_FAILED');
    const valid = await verifyPassword(creds.passwordHash, password);
    if (!valid) throw new AuthError('MFA_INVALID_PASSWORD');

    const existing = await this.prisma.userMfa.findUnique({ where: { userId } });
    if (existing && existing.status === 'ACTIVE') {
      throw new AuthError('MFA_ALREADY_ACTIVE');
    }

    const mfaId = existing?.id ?? randomUUID();
    const { secretBytes, base32Secret } = generateTotpSecret(20);
    const { ciphertext, iv, tag } = this.crypto.encryptSecret(secretBytes);
    const { plaintextCodes, hashedCodes } = generateRecoveryCodes(8, mfaId);
    const otpauthUri = generateOtpauthUri(userEmail, base32Secret);

    await this.prisma.transaction(async (tx) => {
      if (existing) {
        await tx.userMfa.update({
          where: { id: existing.id },
          data: {
            totpSecretEnc: ciphertext,
            totpIv: iv,
            totpTag: tag,
            status: 'PENDING',
            enrolledAt: null,
            lastReplayStep: null,
          },
        });
      } else {
        await tx.userMfa.create({
          data: {
            id: mfaId,
            userId,
            totpSecretEnc: ciphertext,
            totpIv: iv,
            totpTag: tag,
            status: 'PENDING',
          },
        });
      }

      await tx.mfaRecoveryCode.deleteMany({ where: { mfaId } });
      await tx.mfaRecoveryCode.createMany({
        data: hashedCodes.map((codeHash) => ({
          mfaId,
          codeHash,
        })),
      });
    });

    await this.audit?.recordDirectSafe({
      action: 'auth.mfa_setup_initiated',
      category: 'AUTH',
      outcome: 'SUCCESS',
      actorId: userId,
      actorEmail: userEmail,
      ipAddress: ip ?? null,
      userAgent: ua ?? null,
      correlationId: correlationId ?? null,
    });

    return {
      base32Secret,
      otpauthUri,
      recoveryCodes: plaintextCodes,
    };
  }

  async verifySetup(
    userId: string,
    otp: string,
    sessionId?: string | null,
    ip?: string | null,
    ua?: string | null,
    correlationId?: string | null,
  ): Promise<{ ok: boolean; enrolledAt: string }> {
    const mfa = await this.prisma.userMfa.findUnique({
      where: { userId },
    });

    if (!mfa || mfa.status !== 'PENDING') {
      throw new AuthError('MFA_NOT_ACTIVE');
    }

    const secretBytes = this.crypto.decryptSecret(mfa.totpSecretEnc, mfa.totpIv, mfa.totpTag);
    const verification = verifyTotp(secretBytes, otp, { stepWindow: 1 });
    if (!verification.valid) {
      throw new AuthError('MFA_INVALID_CODE');
    }

    const now = new Date();
    await this.prisma.transaction(async (tx) => {
      await tx.userMfa.update({
        where: { id: mfa.id },
        data: {
          status: 'ACTIVE',
          enrolledAt: now,
          lastUsedAt: now,
          lastReplayStep: verification.step,
        },
      });

      if (sessionId) {
        await tx.session.updateMany({
          where: { id: sessionId, userId },
          data: { mfaVerifiedAt: now },
        });
      }
    });

    await this.audit?.recordDirectSafe({
      action: 'auth.mfa_enrolled',
      category: 'AUTH',
      outcome: 'SUCCESS',
      actorId: userId,
      ipAddress: ip ?? null,
      userAgent: ua ?? null,
      correlationId: correlationId ?? null,
    });

    return { ok: true, enrolledAt: now.toISOString() };
  }

  async disable(
    userId: string,
    password: string,
    otp: string,
    ip?: string | null,
    ua?: string | null,
    correlationId?: string | null,
  ): Promise<{ ok: boolean }> {
    const user = await this.prisma.userById(userId);
    if (!user || !user.passwordHash) throw new AuthError('AUTH_FAILED');
    const validPass = await verifyPassword(user.passwordHash, password);
    if (!validPass) throw new AuthError('MFA_INVALID_PASSWORD');

    const mfa = await this.prisma.userMfa.findUnique({
      where: { userId },
      include: { recoveryCodes: true },
    });

    if (!mfa || mfa.status !== 'ACTIVE') {
      throw new AuthError('MFA_NOT_ACTIVE');
    }

    let verified = false;
    try {
      const secretBytes = this.crypto.decryptSecret(mfa.totpSecretEnc, mfa.totpIv, mfa.totpTag);
      const v = verifyTotp(secretBytes, otp, { stepWindow: 1, lastReplayStep: mfa.lastReplayStep });
      if (v.valid) verified = true;
    } catch {}

    if (!verified) {
      const found = mfa.recoveryCodes.find((c) => !c.usedAt && verifyRecoveryCode(otp, c.codeHash, mfa.id));
      if (found) verified = true;
    }

    if (!verified) {
      throw new AuthError('MFA_INVALID_CODE');
    }

    await this.prisma.transaction(async (tx) => {
      await tx.mfaRecoveryCode.deleteMany({ where: { mfaId: mfa.id } });
      await tx.userMfa.update({
        where: { id: mfa.id },
        data: {
          status: 'DISABLED',
          totpSecretEnc: '',
          totpIv: '',
          totpTag: '',
          enrolledAt: null,
          lastReplayStep: null,
        },
      });
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { mfaVerifiedAt: null },
      });
    });

    await this.audit?.recordDirectSafe({
      action: 'auth.mfa_disabled',
      category: 'AUTH',
      outcome: 'SUCCESS',
      actorId: userId,
      actorEmail: user.email,
      ipAddress: ip ?? null,
      userAgent: ua ?? null,
      correlationId: correlationId ?? null,
    });

    return { ok: true };
  }

  async regenerateRecoveryCodes(
    userId: string,
    password: string,
    ip?: string | null,
    ua?: string | null,
    correlationId?: string | null,
  ): Promise<{ recoveryCodes: string[] }> {
    const user = await this.prisma.userById(userId);
    if (!user || !user.passwordHash) throw new AuthError('AUTH_FAILED');
    const valid = await verifyPassword(user.passwordHash, password);
    if (!valid) throw new AuthError('MFA_INVALID_PASSWORD');

    const mfa = await this.prisma.userMfa.findUnique({ where: { userId } });
    if (!mfa || mfa.status !== 'ACTIVE') {
      throw new AuthError('MFA_NOT_ACTIVE');
    }

    const { plaintextCodes, hashedCodes } = generateRecoveryCodes(8, mfa.id);

    await this.prisma.transaction(async (tx) => {
      await tx.mfaRecoveryCode.deleteMany({ where: { mfaId: mfa.id } });
      await tx.mfaRecoveryCode.createMany({
        data: hashedCodes.map((codeHash) => ({
          mfaId: mfa.id,
          codeHash,
        })),
      });
    });

    await this.audit?.recordDirectSafe({
      action: 'auth.mfa_recovery_codes_generated',
      category: 'AUTH',
      outcome: 'SUCCESS',
      actorId: userId,
      actorEmail: user.email,
      ipAddress: ip ?? null,
      userAgent: ua ?? null,
      correlationId: correlationId ?? null,
      metadata: { count: plaintextCodes.length },
    });

    return { recoveryCodes: plaintextCodes };
  }

  async createChallenge(userId: string): Promise<string> {
    const challengeToken = secret();
    const tokenHash = digest(challengeToken);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await this.prisma.mfaChallenge.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        attempts: 0,
      },
    });

    return challengeToken;
  }

  async verifyChallenge(
    challengeToken: string,
    code?: string,
    recoveryCode?: string,
    ip?: string | null,
    ua?: string | null,
    correlationId?: string | null,
  ): Promise<{ userId: string; method: 'TOTP' | 'RECOVERY' }> {
    const tokenHash = digest(challengeToken);
    const challenge = await this.prisma.mfaChallenge.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!challenge || challenge.consumedAt || challenge.expiresAt <= new Date()) {
      throw new AuthError('MFA_CHALLENGE_EXPIRED');
    }

    if (challenge.attempts >= 5) {
      throw new AuthError('MFA_CHALLENGE_LOCKED');
    }

    await this.prisma.mfaChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });

    const userMfa = await this.prisma.userMfa.findUnique({
      where: { userId: challenge.userId },
      include: { recoveryCodes: true },
    });

    if (!userMfa || userMfa.status !== 'ACTIVE') {
      throw new AuthError('MFA_NOT_ACTIVE');
    }

    if (code) {
      const secretBytes = this.crypto.decryptSecret(userMfa.totpSecretEnc, userMfa.totpIv, userMfa.totpTag);
      const res = verifyTotp(secretBytes, code, { stepWindow: 1, lastReplayStep: userMfa.lastReplayStep });
      if (res.valid) {
        await this.prisma.transaction(async (tx) => {
          const challengeRes = await tx.mfaChallenge.updateMany({
            where: { id: challenge.id, consumedAt: null },
            data: { consumedAt: new Date() },
          });
          if (challengeRes.count !== 1) throw new AuthError('MFA_CHALLENGE_EXPIRED');

          await tx.userMfa.update({
            where: { id: userMfa.id },
            data: { lastUsedAt: new Date(), lastReplayStep: res.step },
          });
        });

        await this.audit?.recordDirectSafe({
          action: 'auth.login_mfa_success',
          category: 'AUTH',
          outcome: 'SUCCESS',
          actorId: challenge.userId,
          actorEmail: challenge.user.email,
          ipAddress: ip ?? null,
          userAgent: ua ?? null,
          correlationId: correlationId ?? null,
          metadata: { method: 'TOTP' },
        });

        return { userId: challenge.userId, method: 'TOTP' };
      }
    }

    if (recoveryCode) {
      const match = userMfa.recoveryCodes.find((c) => !c.usedAt && verifyRecoveryCode(recoveryCode, c.codeHash, userMfa.id));
      if (match) {
        const redeemed = await this.prisma.transaction(async (tx) => {
          const codeRes = await tx.mfaRecoveryCode.updateMany({
            where: { id: match.id, usedAt: null },
            data: { usedAt: new Date() },
          });
          if (codeRes.count !== 1) return false;

          const challengeRes = await tx.mfaChallenge.updateMany({
            where: { id: challenge.id, consumedAt: null },
            data: { consumedAt: new Date() },
          });
          if (challengeRes.count !== 1) throw new AuthError('MFA_CHALLENGE_EXPIRED');

          await tx.userMfa.update({
            where: { id: userMfa.id },
            data: { lastUsedAt: new Date() },
          });
          return true;
        });

        if (redeemed) {
          await this.audit?.recordDirectSafe({
            action: 'auth.mfa_recovery_code_used',
            category: 'AUTH',
            outcome: 'SUCCESS',
            actorId: challenge.userId,
            actorEmail: challenge.user.email,
            ipAddress: ip ?? null,
            userAgent: ua ?? null,
            correlationId: correlationId ?? null,
            metadata: { recoveryCodeId: match.id },
          });

          return { userId: challenge.userId, method: 'RECOVERY' };
        }
      }
    }

    this.metrics?.recordFailedLogin();
    await this.audit?.recordDirectSafe({
      action: 'auth.mfa_challenge_failed',
      category: 'AUTH',
      outcome: 'FAILURE',
      actorId: challenge.userId,
      actorEmail: challenge.user.email,
      ipAddress: ip ?? null,
      userAgent: ua ?? null,
      correlationId: correlationId ?? null,
      metadata: { reason: 'INVALID_CODE_OR_RECOVERY' },
    });

    throw new AuthError(recoveryCode ? 'RECOVERY_CODE_INVALID' : 'MFA_INVALID_CODE');
  }

  async verifyStepUp(
    sessionId: string,
    userId: string,
    code?: string,
    recoveryCode?: string,
    ip?: string | null,
    ua?: string | null,
    correlationId?: string | null,
  ): Promise<{ ok: boolean; mfaVerifiedAt: string }> {
    const userMfa = await this.prisma.userMfa.findUnique({
      where: { userId },
      include: { recoveryCodes: true },
    });

    if (!userMfa || userMfa.status !== 'ACTIVE') {
      throw new AuthError('MFA_NOT_ACTIVE');
    }

    if (!code && !recoveryCode) {
      throw new AuthError('MFA_INVALID_CODE');
    }

    let verified = false;
    let method: 'TOTP' | 'RECOVERY' = 'TOTP';

    if (code) {
      const secretBytes = this.crypto.decryptSecret(userMfa.totpSecretEnc, userMfa.totpIv, userMfa.totpTag);
      const res = verifyTotp(secretBytes, code, { stepWindow: 1, lastReplayStep: userMfa.lastReplayStep });
      if (res.valid) {
        verified = true;
        await this.prisma.userMfa.update({
          where: { id: userMfa.id },
          data: { lastUsedAt: new Date(), lastReplayStep: res.step },
        });
      }
    } else if (recoveryCode) {
      const matched = userMfa.recoveryCodes.find((c) => !c.usedAt && verifyRecoveryCode(recoveryCode, c.codeHash, userMfa.id));
      if (matched) {
        const redeemed = await this.prisma.transaction(async (tx) => {
          const updateRes = await tx.mfaRecoveryCode.updateMany({
            where: { id: matched.id, usedAt: null },
            data: { usedAt: new Date() },
          });
          if (updateRes.count !== 1) return false;
          await tx.userMfa.update({
            where: { id: userMfa.id },
            data: { lastUsedAt: new Date() },
          });
          return true;
        });
        if (redeemed) {
          verified = true;
          method = 'RECOVERY';
        }
      }
    }

    if (!verified) {
      await this.audit?.recordDirectSafe({
        action: 'auth.step_up_failed',
        category: 'AUTH',
        outcome: 'FAILURE',
        actorId: userId,
        ipAddress: ip ?? null,
        userAgent: ua ?? null,
        correlationId: correlationId ?? null,
        metadata: { reason: 'INVALID_MFA_CREDENTIALS' },
      });
      throw new AuthError(recoveryCode ? 'RECOVERY_CODE_INVALID' : 'MFA_INVALID_CODE');
    }

    const now = new Date();
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { mfaVerifiedAt: now },
    });

    await this.audit?.recordDirectSafe({
      action: 'auth.step_up_success',
      category: 'AUTH',
      outcome: 'SUCCESS',
      actorId: userId,
      ipAddress: ip ?? null,
      userAgent: ua ?? null,
      correlationId: correlationId ?? null,
      metadata: { method, sessionId },
    });

    return { ok: true, mfaVerifiedAt: now.toISOString() };
  }
}
