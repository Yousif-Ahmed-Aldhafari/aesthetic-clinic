import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '../generated/prisma/client.js';
import type { Environment } from '../config/environment.js';
import { PrismaService } from './prisma.service.js';
import { IdentityDatabase } from './identity.database.js';
import { TenantDatabaseService } from './tenant-database.service.js';
import { AuditRepository } from './audit.repository.js';
import type { VerifiedPrincipal } from './verified-sessions.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { digest, mac, secret } from '../auth/crypto.js';
import {
  calendarRange,
  localCandidates,
  localView,
  plainDate,
  todayInZone,
  withinWeekly,
  zone,
} from '../appointments/scheduling-time.js';
import {
  clinicTimezone,
  schedulingDatabaseError,
  validatedBooking,
} from './scheduling.helpers.js';
import { SchedulingError } from '../appointments/scheduling-error.js';
import { normalizePhone } from '../patients/patient-input.js';
import type { PatientPrincipal } from '../portal/patient-principal.js';
import type {
  ActivatePatientAccountDto,
  CancelPatientBookingDto,
  CreatePatientBookingDto,
  CreatePortalInvitationDto,
  PatientLoginDto,
  PortalAvailabilityQuery,
  RequestPasswordResetDto,
  ReschedulePatientBookingDto,
  ResetPasswordDto,
} from '../portal/patient-portal.dto.js';

const portalAppointmentProjection = {
  id: true,
  startAt: true,
  endAt: true,
  status: true,
  cancellationReason: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  service: { select: { id: true, name: true, durationMinutes: true } },
  doctor: { select: { id: true, label: true } },
  room: { select: { id: true, label: true } },
} satisfies Prisma.AppointmentSelect;

type PortalAppointmentRow = Prisma.AppointmentGetPayload<{ select: typeof portalAppointmentProjection }>;

const portalAppointmentResponse = (p: PortalAppointmentRow, timeZone: string) => ({
  id: p.id,
  service: p.service,
  doctor: p.doctor,
  room: p.room,
  startAt: p.startAt.toISOString(),
  endAt: p.endAt.toISOString(),
  startLocal: localView(p.startAt, timeZone).local,
  endLocal: localView(p.endAt, timeZone).local,
  startOffset: localView(p.startAt, timeZone).offset,
  endOffset: localView(p.endAt, timeZone).offset,
  timezone: timeZone,
  status: p.status,
  cancellationReason: p.cancellationReason,
  version: p.version,
  createdAt: p.createdAt.toISOString(),
  updatedAt: p.updatedAt.toISOString(),
});

const patientBookingHash = (input: CreatePatientBookingDto, patientId: string) =>
  createHash('sha256')
    .update(
      JSON.stringify({
        patientId,
        serviceId: input.serviceId,
        doctorResourceId: input.doctorResourceId,
        roomResourceId: input.roomResourceId ?? null,
        startLocal: input.startLocal,
        durationMinutes: input.durationMinutes ?? null,
        disambiguation: input.disambiguation ?? 'REJECT',
      }),
    )
    .digest('hex');

@Injectable()
export class PatientPortalRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityDatabase,
    private readonly tenantDb: TenantDatabaseService,
    private readonly audit: AuditRepository,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  private patientCsrfToken(rawSession: string): string {
    return mac(this.config.get('AUTH_CSRF_SECRET', { infer: true }), `patient-session-csrf:${rawSession}`);
  }

  async getClinicBySlug(slug: string) {
    const [row] = await this.prisma.$queryRaw<
      { id: string; slug: string; displayName: string; timezone: string; currency: string; status: string }[]
    >`SELECT * FROM lamssa_security.portal_clinic_by_slug(${slug})`;
    if (!row || row.status !== 'ACTIVE') return null;
    return row;
  }

  // -------------------------------------------------------------------------
  // Staff Initiated: Portal Invitation
  // -------------------------------------------------------------------------
  async createInvitation(
    proof: VerifiedPrincipal,
    clinicId: string,
    patientId: string,
    input: CreatePortalInvitationDto,
  ) {
    return this.tenantDb.withClinicContext(proof, clinicId, ['patients.update'], async (tx, c) => {
      const patient = await tx.patient.findFirst({
        where: { id: patientId, clinicId: c.clinicId },
        select: { id: true, patientNumber: true, fullName: true, phone: true, email: true, status: true, dateOfBirth: true },
      });
      if (!patient) throw new NotFoundException('PATIENT_NOT_FOUND');
      if (patient.status !== 'ACTIVE') throw new BadRequestException('INACTIVE_PATIENT');

      const phone = input.phone ? normalizePhone(input.phone) : (patient.phone ? normalizePhone(patient.phone) : null);
      if (!phone) throw new BadRequestException('PATIENT_PHONE_REQUIRED');

      const email = input.email ? input.email.trim().toLowerCase() : (patient.email ? patient.email.trim().toLowerCase() : null);

      // Check if phone is already used by another patient in this clinic
      const existingAccount = await tx.patientAccount.findFirst({
        where: { clinicId: c.clinicId, phone, patientId: { not: patientId } },
        select: { id: true },
      });
      if (existingAccount) throw new ConflictException('PHONE_ALREADY_REGISTERED');

      const rawToken = randomBytes(32).toString('base64url');
      const tokenHash = digest(rawToken);
      const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours

      // Generate placeholder password hash until activation
      const tempHash = await hashPassword(randomBytes(32).toString('hex'));

      const account = await tx.patientAccount.upsert({
        where: { clinicId_patientId: { clinicId: c.clinicId, patientId } },
        create: {
          clinicId: c.clinicId,
          patientId,
          phone,
          email,
          passwordHash: tempHash,
          status: 'PENDING_ACTIVATION',
        },
        update: {
          phone,
          email: email ?? undefined,
          status: 'PENDING_ACTIVATION',
          failedLoginAttempts: 0,
          lockedUntil: null,
          version: { increment: 1 },
        },
        select: { id: true },
      });

      // Revoke any previous unused tokens
      await tx.patientVerificationToken.deleteMany({
        where: { clinicId: c.clinicId, patientAccountId: account.id, tokenType: 'ACTIVATION', usedAt: null },
      });

      await tx.patientVerificationToken.create({
        data: {
          clinicId: c.clinicId,
          patientAccountId: account.id,
          tokenType: 'ACTIVATION',
          tokenHash,
          expiresAt,
        },
      });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'portal.invitation_created',
          category: 'CLINICAL',
          targetType: 'PatientAccount',
          targetId: account.id,
          outcome: 'SUCCESS',
          metadata: { patientId, phone },
        },
        tx,
      );

      return {
        patientId: patient.id,
        patientNumber: patient.patientNumber,
        fullName: patient.fullName,
        phone,
        email,
        activationToken: rawToken, // Provided for dev/test and SMS/email dispatch
        expiresAt: expiresAt.toISOString(),
      };
    });
  }

  // -------------------------------------------------------------------------
  // Public / Patient Auth: Activation
  // -------------------------------------------------------------------------
  async activateAccount(input: ActivatePatientAccountDto, ipAddress?: string, userAgent?: string) {
    const clinic = await this.getClinicBySlug(input.clinicSlug);
    if (!clinic) throw new NotFoundException('CLINIC_NOT_FOUND');

    const tokenHash = digest(input.token);
    const [token] = await this.prisma.$queryRaw<
      {
        tokenId: string;
        clinicId: string;
        patientAccountId: string;
        patientId: string;
        tokenType: string;
        expiresAt: Date;
        usedAt: Date | null;
        accountStatus: string;
        patientStatus: string;
        fullName: string;
        phone: string;
        dateOfBirth: Date;
        email: string | null;
        patientNumber: string;
        clinicSlug: string;
        clinicDisplayName: string;
      }[]
    >`SELECT * FROM lamssa_security.portal_activation_lookup(${tokenHash})`;

    if (
      !token ||
      token.clinicId !== clinic.id ||
      token.tokenType !== 'ACTIVATION' ||
      token.usedAt !== null ||
      new Date(token.expiresAt) <= new Date()
    ) {
      throw new BadRequestException('INVALID_OR_EXPIRED_TOKEN');
    }

    if (token.patientStatus !== 'ACTIVE') throw new BadRequestException('INACTIVE_PATIENT');

    // Secure verification check: phone and date of birth must match patient record
    const normalizedInputPhone = normalizePhone(input.phone);
    const normalizedPatientPhone = token.phone ? normalizePhone(token.phone) : '';
    const patientDob = token.dateOfBirth ? new Date(token.dateOfBirth).toISOString().slice(0, 10) : '';

    if (normalizedInputPhone !== normalizedPatientPhone || input.dateOfBirth !== patientDob) {
      throw new BadRequestException('PATIENT_VERIFICATION_MISMATCH');
    }

    const passwordHash = await hashPassword(input.password);
    const now = new Date();

    await this.prisma.patientVerificationToken.update({
      where: { id: token.tokenId },
      data: { usedAt: now },
    });

    await this.prisma.patientAccount.update({
      where: { id: token.patientAccountId },
      data: {
        passwordHash,
        status: 'ACTIVE',
        phoneVerifiedAt: now,
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: now,
        version: { increment: 1 },
      },
    });

    const rawSession = secret();
    const sessionTokenHash = digest(rawSession);
    const csrfToken = this.patientCsrfToken(rawSession);
    const csrfTokenHash = digest(csrfToken);
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    await this.prisma.patientSession.create({
      data: {
        clinicId: clinic.id,
        patientAccountId: token.patientAccountId,
        sessionTokenHash,
        csrfTokenHash,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        expiresAt,
      },
    });

    await this.prisma.patientPortalAuditEvent.create({
      data: {
        clinicId: clinic.id,
        patientAccountId: token.patientAccountId,
        patientId: token.patientId,
        action: 'portal.account_activated',
        targetType: 'PatientAccount',
        targetId: token.patientAccountId,
        outcome: 'SUCCESS',
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      },
    });

    return {
      rawSession,
      csrfToken,
      expiresAt: expiresAt.toISOString(),
      patient: {
        id: token.patientId,
        patientNumber: token.patientNumber,
        fullName: token.fullName,
        phone: token.phone,
        email: token.email,
      },
      clinic: {
        id: clinic.id,
        slug: clinic.slug,
        displayName: clinic.displayName,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Public / Patient Auth: Login
  // -------------------------------------------------------------------------
  async login(input: PatientLoginDto, ipAddress?: string, userAgent?: string) {
    const clinic = await this.getClinicBySlug(input.clinicSlug);
    if (!clinic) throw new NotFoundException('CLINIC_NOT_FOUND');

    // Rate limit per IP and per (clinic + phone)
    const now = Date.now();
    const window = Math.floor(now / 900000);
    const normalizedPhone = normalizePhone(input.phone);
    const ipLimit = Number(this.config.get('AUTH_LOGIN_IP_LIMIT', { infer: true }) ?? 50);
    const accountLimit = Number(this.config.get('AUTH_LOGIN_ACCOUNT_LIMIT', { infer: true }) ?? 100);

    for (const [kind, value, limit] of [
      ['ip', ipAddress || 'unknown', ipLimit],
      ['portal-phone', `${clinic.id}:${normalizedPhone}`, accountLimit],
    ] as const) {
      const key = digest(`${kind}:${value}:${window}`);
      const bucket = await this.identity.loginBucket.upsert({
        where: { key },
        create: { key, expiresAt: new Date((window + 1) * 900000) },
        update: { attempts: { increment: 1 } },
      });
      if (bucket.attempts > limit) {
        throw new HttpException('RATE_LIMITED', 429);
      }
    }

    const [account] = await this.prisma.$queryRaw<
      {
        accountId: string;
        clinicId: string;
        patientId: string;
        passwordHash: string;
        status: string;
        failedLoginAttempts: number;
        lockedUntil: Date | null;
        fullName: string;
        phone: string;
        email: string | null;
        patientNumber: string;
        clinicSlug: string;
        clinicDisplayName: string;
      }[]
    >`SELECT * FROM lamssa_security.portal_login_lookup(${clinic.id}::uuid, ${normalizedPhone})`;

    // Constant time dummy hash comparison on non-existent account to prevent enumeration
    if (!account) {
      await verifyPassword('$argon2id$v=19$m=65536,t=3,p=1$c29tZXNhbHQAAAAAAAAAAA$q7/2Wq+bC1+8nLgU9m7yHQ', input.password);
      throw new UnauthorizedException('INVALID_CREDENTIALS');
    }

    if (account.status === 'PENDING_ACTIVATION') {
      throw new UnauthorizedException('ACCOUNT_NOT_ACTIVATED');
    }
    if (account.status === 'SUSPENDED') {
      throw new UnauthorizedException('ACCOUNT_SUSPENDED');
    }

    if (account.lockedUntil && new Date(account.lockedUntil) > new Date()) {
      throw new HttpException('ACCOUNT_LOCKED', 423);
    }

    const valid = await verifyPassword(account.passwordHash, input.password);
    if (!valid) {
      const failed = account.failedLoginAttempts + 1;
      const lockedUntil = failed >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await this.prisma.patientAccount.update({
        where: { id: account.accountId },
        data: {
          failedLoginAttempts: failed,
          lockedUntil,
        },
      });

      await this.prisma.patientPortalAuditEvent.create({
        data: {
          clinicId: clinic.id,
          patientAccountId: account.accountId,
          patientId: account.patientId,
          action: 'portal.login_failed',
          targetType: 'PatientAccount',
          targetId: account.accountId,
          outcome: 'FAILURE',
          metadata: { failedAttempts: failed, locked: Boolean(lockedUntil) },
          ipAddress: ipAddress ?? null,
          userAgent: userAgent ?? null,
        },
      });

      throw new UnauthorizedException('INVALID_CREDENTIALS');
    }

    // Success: reset failed attempts
    const nowDate = new Date();
    await this.prisma.patientAccount.update({
      where: { id: account.accountId },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: nowDate,
      },
    });

    const rawSession = secret();
    const sessionTokenHash = digest(rawSession);
    const csrfToken = this.patientCsrfToken(rawSession);
    const csrfTokenHash = digest(csrfToken);
    const expiresAt = new Date(nowDate.getTime() + 24 * 60 * 60 * 1000);

    await this.prisma.patientSession.create({
      data: {
        clinicId: clinic.id,
        patientAccountId: account.accountId,
        sessionTokenHash,
        csrfTokenHash,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        expiresAt,
      },
    });

    await this.prisma.patientPortalAuditEvent.create({
      data: {
        clinicId: clinic.id,
        patientAccountId: account.accountId,
        patientId: account.patientId,
        action: 'portal.login_success',
        targetType: 'PatientAccount',
        targetId: account.accountId,
        outcome: 'SUCCESS',
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      },
    });

    return {
      rawSession,
      csrfToken,
      expiresAt: expiresAt.toISOString(),
      patient: {
        id: account.patientId,
        patientNumber: account.patientNumber,
        fullName: account.fullName,
        phone: account.phone,
        email: account.email,
      },
      clinic: {
        id: clinic.id,
        slug: clinic.slug,
        displayName: clinic.displayName,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Session Validation
  // -------------------------------------------------------------------------
  async validateSession(rawSession: string): Promise<PatientPrincipal | null> {
    const sessionTokenHash = digest(rawSession);
    const session = await this.prisma.patientSession.findUnique({
      where: { sessionTokenHash },
      include: {
        patientAccount: {
          select: { id: true, patientId: true, status: true, clinicId: true },
        },
      },
    });

    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt <= new Date() ||
      session.patientAccount.status !== 'ACTIVE'
    ) {
      return null;
    }

    // Touch lastSeenAt periodically
    if (Date.now() - session.lastSeenAt.getTime() > 60000) {
      await this.prisma.patientSession.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date() },
      }).catch(() => {});
    }

    return {
      clinicId: session.clinicId,
      patientAccountId: session.patientAccountId,
      patientId: session.patientAccount.patientId,
      sessionId: session.id,
      sessionToken: rawSession,
      csrfHash: session.csrfTokenHash,
    };
  }

  // -------------------------------------------------------------------------
  // Patient Auth: Logout
  // -------------------------------------------------------------------------
  async logout(principal: PatientPrincipal) {
    await this.prisma.patientSession.update({
      where: { id: principal.sessionId },
      data: { revokedAt: new Date() },
    });

    await this.prisma.patientPortalAuditEvent.create({
      data: {
        clinicId: principal.clinicId,
        patientAccountId: principal.patientAccountId,
        patientId: principal.patientId,
        action: 'portal.logout',
        targetType: 'PatientSession',
        targetId: principal.sessionId,
        outcome: 'SUCCESS',
      },
    });
  }

  // -------------------------------------------------------------------------
  // Password Reset Flow
  // -------------------------------------------------------------------------
  async requestPasswordReset(input: RequestPasswordResetDto) {
    const clinic = await this.getClinicBySlug(input.clinicSlug);
    if (!clinic) return { success: true };

    const normalizedPhone = normalizePhone(input.phone);
    const [account] = await this.prisma.$queryRaw<
      {
        accountId: string;
        clinicId: string;
        patientId: string;
        dateOfBirth: Date | null;
        accountStatus: string;
      }[]
    >`SELECT * FROM lamssa_security.portal_reset_lookup(${clinic.id}::uuid, ${normalizedPhone})`;

    // Timing-safe: always return { success: true }
    if (!account || account.accountStatus !== 'ACTIVE') {
      return { success: true };
    }

    const patientDob = account.dateOfBirth ? new Date(account.dateOfBirth).toISOString().slice(0, 10) : '';
    if (patientDob !== input.dateOfBirth) {
      return { success: true };
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = digest(rawToken);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await this.prisma.patientVerificationToken.deleteMany({
      where: { clinicId: clinic.id, patientAccountId: account.accountId, tokenType: 'PASSWORD_RESET', usedAt: null },
    });

    await this.prisma.patientVerificationToken.create({
      data: {
        clinicId: clinic.id,
        patientAccountId: account.accountId,
        tokenType: 'PASSWORD_RESET',
        tokenHash,
        expiresAt,
      },
    });

    // In non-production, return test token for test verification
    const isDev = this.config.get('NODE_ENV', { infer: true }) !== 'production';
    return { success: true, ...(isDev ? { testToken: rawToken } : {}) };
  }

  async resetPassword(input: ResetPasswordDto) {
    const clinic = await this.getClinicBySlug(input.clinicSlug);
    if (!clinic) throw new BadRequestException('INVALID_TOKEN');

    const tokenHash = digest(input.token);
    const token = await this.prisma.patientVerificationToken.findUnique({
      where: { tokenHash },
      include: { patientAccount: true },
    });

    if (
      !token ||
      token.clinicId !== clinic.id ||
      token.tokenType !== 'PASSWORD_RESET' ||
      token.usedAt !== null ||
      token.expiresAt <= new Date()
    ) {
      throw new BadRequestException('INVALID_TOKEN');
    }

    const passwordHash = await hashPassword(input.newPassword);
    const now = new Date();

    await this.prisma.patientVerificationToken.update({
      where: { id: token.id },
      data: { usedAt: now },
    });

    await this.prisma.patientAccount.update({
      where: { id: token.patientAccountId },
      data: {
        passwordHash,
        failedLoginAttempts: 0,
        lockedUntil: null,
        version: { increment: 1 },
      },
    });

    // Revoke all existing sessions on password reset
    await this.prisma.patientSession.updateMany({
      where: { patientAccountId: token.patientAccountId, revokedAt: null },
      data: { revokedAt: now },
    });

    await this.prisma.patientPortalAuditEvent.create({
      data: {
        clinicId: clinic.id,
        patientAccountId: token.patientAccountId,
        action: 'portal.password_reset',
        targetType: 'PatientAccount',
        targetId: token.patientAccountId,
        outcome: 'SUCCESS',
      },
    });

    return { success: true };
  }

  // -------------------------------------------------------------------------
  // Database Transaction with Patient Security Context & Advisory Lock
  // -------------------------------------------------------------------------
  private async withPatientContext<T>(
    principal: PatientPrincipal,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        await this.prisma.assertRuntimeRole(tx);
        await tx.$queryRaw`
          SELECT set_config('lamssa.clinic_id', ${principal.clinicId}, true),
                 set_config('lamssa.patient_id', ${principal.patientId}, true),
                 set_config('lamssa.patient_account_id', ${principal.patientAccountId}, true),
                 set_config('lamssa.patient_session_id', ${principal.sessionId}, true)
        `;
        await tx.$queryRaw`
          SELECT pg_advisory_xact_lock_shared(hashtextextended(${'clinic-identity:' + principal.clinicId}, 0))::text
        `;
        return work(tx);
      },
      { maxWait: 5000, timeout: 10000 },
    );
  }

  // -------------------------------------------------------------------------
  // Patient Profile & Clinic Public Info
  // -------------------------------------------------------------------------
  async getPublicClinic(slug: string) {
    const clinic = await this.getClinicBySlug(slug);
    if (!clinic) throw new NotFoundException('CLINIC_NOT_FOUND');
    const branding = await this.prisma.$queryRaw<
      { logoUrl: string | null; primaryColor: string; secondaryColor: string; accentColor: string | null; faviconUrl: string | null; typography: string }[]
    >`SELECT "logoUrl", "primaryColor", "secondaryColor", "accentColor", "faviconUrl", typography FROM lamssa_security.public_branding_details(${slug})`;
    const b = branding[0] ?? null;
    return {
      id: clinic.id,
      slug: clinic.slug,
      displayName: clinic.displayName,
      timezone: clinic.timezone,
      branding: b ? {
        logoUrl: b.logoUrl,
        primaryColor: b.primaryColor,
        secondaryColor: b.secondaryColor,
        accentColor: b.accentColor,
        faviconUrl: b.faviconUrl,
        typography: b.typography,
      } : null,
    };
  }

  async getProfile(principal: PatientPrincipal) {
    return this.withPatientContext(principal, async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: principal.patientId, clinicId: principal.clinicId },
        select: {
          id: true,
          patientNumber: true,
          fullName: true,
          phone: true,
          email: true,
          dateOfBirth: true,
          gender: true,
          status: true,
        },
      });
      if (!patient) throw new NotFoundException('PATIENT_NOT_FOUND');

      const clinic = await tx.clinic.findFirst({
        where: { id: principal.clinicId },
        select: {
          id: true,
          slug: true,
          displayName: true,
          timezone: true,
          branding: {
            select: {
              logoUrl: true,
              primaryColor: true,
              secondaryColor: true,
              accentColor: true,
              faviconUrl: true,
              typography: true,
            },
          },
        },
      });

      return {
        patient: {
          id: patient.id,
          patientNumber: patient.patientNumber,
          fullName: patient.fullName,
          phone: patient.phone,
          email: patient.email,
          dateOfBirth: patient.dateOfBirth ? patient.dateOfBirth.toISOString().slice(0, 10) : null,
          gender: patient.gender,
        },
        clinic,
      };
    });
  }

  // -------------------------------------------------------------------------
  // Catalog & Availability
  // -------------------------------------------------------------------------
  async listServices(principal: PatientPrincipal) {
    return this.withPatientContext(principal, async (tx) => {
      return tx.clinicService.findMany({
        where: { clinicId: principal.clinicId, active: true },
        select: { id: true, name: true, durationMinutes: true, requiresRoom: true },
        orderBy: { name: 'asc' },
      });
    });
  }

  async listDoctors(principal: PatientPrincipal) {
    return this.withPatientContext(principal, async (tx) => {
      return tx.bookableResource.findMany({
        where: {
          clinicId: principal.clinicId,
          kind: 'DOCTOR',
          active: true,
          doctorMembership: { role: 'DOCTOR', status: 'ACTIVE', user: { status: 'ACTIVE' } },
        },
        select: { id: true, label: true },
        orderBy: { label: 'asc' },
      });
    });
  }

  async getAvailability(principal: PatientPrincipal, q: PortalAvailabilityQuery) {
    return this.withPatientContext(principal, async (tx) => {
      const timeZone = zone(await clinicTimezone(tx as any, principal.clinicId));
      const date = plainDate(q.date);
      const range = calendarRange(q.date, date.add({ days: 1 }).toString(), timeZone);

      const service = await tx.clinicService.findFirst({
        where: { id: q.serviceId, clinicId: principal.clinicId, active: true },
        select: { id: true, name: true, durationMinutes: true, requiresRoom: true },
      });
      if (!service) throw new NotFoundException('SERVICE_NOT_FOUND');

      let doctorId = q.doctorResourceId;
      if (!doctorId) {
        // Pick first active doctor if none specified
        const firstDoctor = await tx.bookableResource.findFirst({
          where: { clinicId: principal.clinicId, kind: 'DOCTOR', active: true, doctorMembership: { role: 'DOCTOR', status: 'ACTIVE', user: { status: 'ACTIVE' } } },
          select: { id: true },
        });
        if (!firstDoctor) return { timezone: timeZone, date: q.date, slots: [] };
        doctorId = firstDoctor.id;
      }

      const doctor = await tx.bookableResource.findFirst({
        where: { id: doctorId, clinicId: principal.clinicId, kind: 'DOCTOR', active: true },
        select: { id: true, label: true },
      });
      if (!doctor) throw new NotFoundException('DOCTOR_NOT_FOUND');

      const room = service.requiresRoom
        ? await tx.bookableResource.findFirst({
            where: { clinicId: principal.clinicId, kind: 'ROOM', active: true },
            select: { id: true },
          })
        : null;

      if (service.requiresRoom && !room) {
        return { timezone: timeZone, date: q.date, slots: [] };
      }

      const ids = [doctor.id, ...(room ? [room.id] : [])];
      const duration = service.durationMinutes;

      const weekly = await tx.resourceAvailability.findMany({
        where: { clinicId: principal.clinicId, resourceId: { in: ids } },
        take: 57,
      });
      const windowEnd = new Date(range.endAt.getTime() + 480 * 60000);

      const blocks = await tx.resourceTimeOff.findMany({
        where: { clinicId: principal.clinicId, resourceId: { in: ids }, active: true, startAt: { lt: windowEnd }, endAt: { gt: range.startAt } },
        select: { resourceId: true, startAt: true, endAt: true },
        take: 1001,
      });

      const bookings = await tx.appointment.findMany({
        where: {
          clinicId: principal.clinicId,
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
          OR: [{ doctorResourceId: doctor.id }, ...(room ? [{ roomResourceId: room.id }] : [])],
          startAt: { lt: windowEnd },
          endAt: { gt: range.startAt },
        },
        select: { startAt: true, endAt: true },
        take: 1001,
      });

      const slots = [];
      const horizon = plainDate(q.date).since(plainDate(todayInZone(timeZone))).days;
      if (horizon < 0 || horizon > 366) return { timezone: timeZone, date: q.date, slots: [] };

      for (let minute = 0; minute < 1440; minute += 15) {
        const local = `${q.date}T${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
        const candidates = localCandidates(local, timeZone);
        for (const [index, z] of candidates.entries()) {
          const startAt = new Date(z.epochMilliseconds);
          const endAt = new Date(z.epochMilliseconds + duration * 60000);
          if (startAt.getTime() < Date.now()) continue;
          if (!ids.every((id) => withinWeekly(startAt, endAt, timeZone, weekly.filter((w) => w.resourceId === id)))) continue;
          if ([...blocks, ...bookings].some((b) => b.startAt < endAt && b.endAt > startAt)) continue;
          slots.push({
            startAt: startAt.toISOString(),
            endAt: endAt.toISOString(),
            startLocal: local,
            endLocal: localView(endAt, timeZone).local,
            offset: z.offset,
            disambiguation: candidates.length > 1 ? (index ? 'LATER' : 'EARLIER') : 'REJECT',
          });
        }
      }

      slots.sort((a, b) => a.startAt.localeCompare(b.startAt));
      return { timezone: timeZone, date: q.date, slots };
    });
  }

  // -------------------------------------------------------------------------
  // Appointment Self-Service: Booking
  // -------------------------------------------------------------------------
  async bookAppointment(principal: PatientPrincipal, input: CreatePatientBookingDto) {
    try {
      return await this.withPatientContext(principal, async (tx) => {
        // Coordinate concurrency with clinic scheduling state mutex
        await tx.schedulingState.upsert({
          where: { clinicId: principal.clinicId },
          create: { clinicId: principal.clinicId },
          update: { revision: { increment: 1 } },
          select: { clinicId: true },
        });

        const hash = patientBookingHash(input, principal.patientId);
        const existing = await tx.appointment.findFirst({
          where: { clinicId: principal.clinicId, bookingKey: input.bookingKey },
          select: { ...portalAppointmentProjection, requestHash: true },
        });

        const timeZone = await clinicTimezone(tx as any, principal.clinicId);
        if (existing) {
          if (existing.requestHash !== hash) throw new SchedulingError('IDEMPOTENCY_CONFLICT');
          return portalAppointmentResponse(existing, timeZone);
        }

        // Validate booking using established scheduling engine
        const times = await validatedBooking(tx as any, principal.clinicId, principal.patientId, input);

        const appointment = await tx.appointment.create({
          data: {
            clinicId: principal.clinicId,
            patientId: principal.patientId,
            serviceId: input.serviceId,
            doctorResourceId: input.doctorResourceId,
            roomResourceId: input.roomResourceId ?? null,
            startAt: times.startAt,
            endAt: times.endAt,
            bookingKey: input.bookingKey,
            requestHash: hash,
            status: 'SCHEDULED',
          },
          select: portalAppointmentProjection,
        });

        await tx.patientPortalAuditEvent.create({
          data: {
            clinicId: principal.clinicId,
            patientAccountId: principal.patientAccountId,
            patientId: principal.patientId,
            action: 'portal.appointment_booked',
            targetType: 'Appointment',
            targetId: appointment.id,
            outcome: 'SUCCESS',
            metadata: {
              serviceId: input.serviceId,
              doctorResourceId: input.doctorResourceId,
              startAt: times.startAt.toISOString(),
            },
          },
        });

        return portalAppointmentResponse(appointment, times.timeZone);
      });
    } catch (error) {
      return schedulingDatabaseError(error);
    }
  }

  // -------------------------------------------------------------------------
  // Appointment Self-Service: List
  // -------------------------------------------------------------------------
  async listAppointments(principal: PatientPrincipal) {
    return this.withPatientContext(principal, async (tx) => {
      const timeZone = await clinicTimezone(tx as any, principal.clinicId);
      const rows = await tx.appointment.findMany({
        where: { clinicId: principal.clinicId, patientId: principal.patientId },
        select: portalAppointmentProjection,
        orderBy: [{ startAt: 'desc' }, { id: 'desc' }],
        take: 100,
      });

      return {
        timezone: timeZone,
        appointments: rows.map((p) => portalAppointmentResponse(p, timeZone)),
      };
    });
  }

  // -------------------------------------------------------------------------
  // Appointment Self-Service: Reschedule
  // -------------------------------------------------------------------------
  async rescheduleAppointment(
    principal: PatientPrincipal,
    appointmentId: string,
    input: ReschedulePatientBookingDto,
  ) {
    try {
      return await this.withPatientContext(principal, async (tx) => {
        await tx.schedulingState.upsert({
          where: { clinicId: principal.clinicId },
          create: { clinicId: principal.clinicId },
          update: { revision: { increment: 1 } },
          select: { clinicId: true },
        });

        const current = await tx.appointment.findFirst({
          where: { id: appointmentId, clinicId: principal.clinicId, patientId: principal.patientId },
          select: portalAppointmentProjection,
        });
        if (!current) throw new NotFoundException('APPOINTMENT_NOT_FOUND');

        if (current.version !== input.expectedVersion) throw new SchedulingError('STALE_VERSION');
        if (!['SCHEDULED', 'CONFIRMED'].includes(current.status)) throw new SchedulingError('INVALID_TRANSITION');

        // Check policy: cannot reschedule within 2 hours of appointment
        if (current.startAt.getTime() - Date.now() < 2 * 60 * 60 * 1000) {
          throw new BadRequestException('RESCHEDULE_WINDOW_EXPIRED');
        }

        const times = await validatedBooking(tx as any, principal.clinicId, principal.patientId, input);

        const updated = await tx.appointment.update({
          where: {
            clinicId_id: { clinicId: principal.clinicId, id: appointmentId },
            version: input.expectedVersion,
          },
          data: {
            serviceId: input.serviceId,
            doctorResourceId: input.doctorResourceId,
            roomResourceId: input.roomResourceId ?? null,
            startAt: times.startAt,
            endAt: times.endAt,
            status: 'SCHEDULED',
            version: { increment: 1 },
          },
          select: portalAppointmentProjection,
        });

        await tx.patientPortalAuditEvent.create({
          data: {
            clinicId: principal.clinicId,
            patientAccountId: principal.patientAccountId,
            patientId: principal.patientId,
            action: 'portal.appointment_rescheduled',
            targetType: 'Appointment',
            targetId: updated.id,
            outcome: 'SUCCESS',
            metadata: {
              version: updated.version,
              startAt: times.startAt.toISOString(),
            },
          },
        });

        return portalAppointmentResponse(updated, times.timeZone);
      });
    } catch (error) {
      return schedulingDatabaseError(error);
    }
  }

  // -------------------------------------------------------------------------
  // Appointment Self-Service: Cancel
  // -------------------------------------------------------------------------
  async cancelAppointment(
    principal: PatientPrincipal,
    appointmentId: string,
    input: CancelPatientBookingDto,
  ) {
    try {
      return await this.withPatientContext(principal, async (tx) => {
        await tx.schedulingState.upsert({
          where: { clinicId: principal.clinicId },
          create: { clinicId: principal.clinicId },
          update: { revision: { increment: 1 } },
          select: { clinicId: true },
        });

        const current = await tx.appointment.findFirst({
          where: { id: appointmentId, clinicId: principal.clinicId, patientId: principal.patientId },
          select: portalAppointmentProjection,
        });
        if (!current) throw new NotFoundException('APPOINTMENT_NOT_FOUND');

        if (current.version !== input.expectedVersion) throw new SchedulingError('STALE_VERSION');
        if (!['SCHEDULED', 'CONFIRMED'].includes(current.status)) throw new SchedulingError('INVALID_TRANSITION');

        // Cannot cancel past appointments
        if (current.startAt.getTime() < Date.now()) {
          throw new BadRequestException('PAST_APPOINTMENT_CANNOT_BE_CANCELLED');
        }

        const updated = await tx.appointment.update({
          where: {
            clinicId_id: { clinicId: principal.clinicId, id: appointmentId },
            version: input.expectedVersion,
          },
          data: {
            status: 'CANCELLED',
            cancellationReason: 'PATIENT_REQUEST',
            version: { increment: 1 },
          },
          select: portalAppointmentProjection,
        });

        await tx.patientPortalAuditEvent.create({
          data: {
            clinicId: principal.clinicId,
            patientAccountId: principal.patientAccountId,
            patientId: principal.patientId,
            action: 'portal.appointment_cancelled',
            targetType: 'Appointment',
            targetId: updated.id,
            outcome: 'SUCCESS',
            metadata: { reason: input.reason ?? null, version: updated.version },
          },
        });

        const timeZone = await clinicTimezone(tx as any, principal.clinicId);
        return portalAppointmentResponse(updated, timeZone);
      });
    } catch (error) {
      return schedulingDatabaseError(error);
    }
  }
}
