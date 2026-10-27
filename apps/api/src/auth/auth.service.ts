import { Injectable, NotFoundException, Optional, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { IdentityDatabase } from '../prisma/identity.database.js';
import { VerifiedSessions, type VerifiedPrincipal } from '../prisma/verified-sessions.js';
import { PublicBrandingRepository } from '../prisma/public-branding.repository.js';
import type { Environment } from '../config/environment.js';
import { type AuthRequest } from './access.js';
import { AuthError } from './auth-error.js';
import { CsrfService } from './csrf.service.js';
import { authorizationHash, digest, equal, secret } from './crypto.js';
import { hashPassword, verifyPassword } from './password.js';
import { LoginLimiter } from './login-limiter.service.js';
import { permissionsFor } from './permissions.js';
import { AuditService } from '../audit/audit.service.js';
import { MfaService } from './mfa.service.js';
import { summarizeDevice } from './session-manager.service.js';

@Injectable()
export class AuthService {
  private readonly dummyHash = hashPassword(secret());
  constructor(
    private readonly prisma: IdentityDatabase,
    private readonly config: ConfigService<Environment, true>,
    private readonly csrf: CsrfService,
    private readonly limiter: LoginLimiter,
    private readonly verified: VerifiedSessions,
    private readonly branding: PublicBrandingRepository,
    @Optional() private readonly audit?: AuditService,
    @Optional() private readonly mfa?: MfaService,
  ) {}

  private rawToken(request: AuthRequest): string | undefined {
    const value: unknown = request.cookies?.[this.csrf.sessionCookie];
    return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
  }
  async authenticate(request: AuthRequest, response: Response): Promise<void> {
    const token = this.rawToken(request);
    if (!token) throw new UnauthorizedException();
    const session = await this.prisma.session.findUnique({ where: { tokenHash: digest(token) } });
    const now = new Date();
    if (!session || session.revokedAt || session.expiresAt <= now || !equal(session.csrfHash, digest(this.csrf.sessionToken(token))) ||
        now.getTime() - session.lastSeenAt.getTime() > this.config.get('AUTH_IDLE_MINUTES', { infer: true })*60000) {
      if (session && !session.revokedAt) await this.prisma.session.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: now } });
      this.csrf.clearSession(response); throw new AuthError('SESSION_EXPIRED');
    }
    const user=await this.prisma.userById(session.userId);
    if (!user || user.status !== 'ACTIVE' || !equal(session.authorizationHash, authorizationHash(user))) {
      await this.prisma.session.updateMany({ where: { userId: session.userId, revokedAt: null }, data: { revokedAt: now } });
      this.csrf.clearSession(response); throw new AuthError('SESSION_EXPIRED');
    }
    request.auth = { user: user!, session, principal:this.verified.issue(session.userId,session.id) };
  }
  async recordActivity(request: AuthRequest): Promise<void> {
    const now = new Date();
    const touched = await this.prisma.session.updateMany({ where: { id: request.auth!.session.id, revokedAt: null, expiresAt: { gt: now },
      lastSeenAt: { gt: new Date(now.getTime()-this.config.get('AUTH_IDLE_MINUTES', { infer: true })*60000) } }, data: { lastSeenAt: now } });
    if (touched.count !== 1) throw new AuthError('SESSION_EXPIRED');
  }
  current(request: AuthRequest) {
    if (!request.auth) throw new UnauthorizedException();
    const { user, session } = request.auth;
    return { user: { id: user.id, name: user.name, email: user.email }, selectedClinicId: session.selectedClinicId,
      csrfToken: this.csrf.sessionToken(this.rawToken(request)!), expiresAt: session.expiresAt.toISOString() };
  }
  async login(request: AuthRequest, response: Response, email: string, password: string) {
    const ip = request.ip ?? request.socket?.remoteAddress ?? 'unknown';
    const correlationId = typeof request.headers?.['x-correlation-id'] === 'string'
      ? request.headers['x-correlation-id']
      : typeof request.headers?.['x-request-id'] === 'string'
      ? request.headers['x-request-id']
      : null;
    const userAgent = typeof request.headers?.['user-agent'] === 'string' ? request.headers['user-agent'] : null;

    await this.limiter.consume(ip, email);
    const user = await this.prisma.credentialsByEmail(email);
    const valid = await verifyPassword(user?.passwordHash ?? await this.dummyHash, password);
    if (!user || !valid || user.status !== 'ACTIVE' || !user.passwordHash) {
      await this.audit?.recordDirectSafe({
        action: 'auth.failed_login',
        category: 'AUTH',
        outcome: 'FAILURE',
        actorEmail: email,
        ipAddress: ip,
        userAgent,
        correlationId,
        metadata: { email, reason: 'INVALID_CREDENTIALS' },
      });
      throw new AuthError('AUTH_FAILED');
    }

    if (this.mfa && (await this.mfa.hasActiveMfa(user.id))) {
      const challengeToken = await this.mfa.createChallenge(user.id);
      await this.audit?.recordDirectSafe({
        action: 'auth.mfa_challenge_issued',
        category: 'AUTH',
        outcome: 'SUCCESS',
        actorId: user.id,
        actorEmail: user.email,
        ipAddress: ip,
        userAgent,
        correlationId,
      });
      return {
        mfaRequired: true,
        challengeToken,
        methods: ['TOTP', 'RECOVERY'],
      };
    }

    const token = secret(), csrfToken = this.csrf.sessionToken(token), now = new Date();
    const expiresAt = new Date(now.getTime()+this.config.get('AUTH_SESSION_HOURS', { infer: true })*3600000);
    const previous = this.rawToken(request);
    const {session,user:authenticatedUser} = await this.prisma.transaction(async tx => {
      const fresh = await tx.userById(user.id);
      if (!fresh || fresh.status !== 'ACTIVE' || fresh.passwordHash !== user.passwordHash) throw new AuthError('AUTH_FAILED');
      if (previous) await tx.session.updateMany({ where: { tokenHash: digest(previous), revokedAt: null }, data: { revokedAt: now } });
      const session=await tx.session.create({ data: {
        userId: user.id,
        tokenHash: digest(token),
        csrfHash: digest(csrfToken),
        authorizationHash: authorizationHash(fresh),
        expiresAt,
        mfaVerifiedAt: null,
        userAgent,
        ipAddress: ip,
        deviceSummary: summarizeDevice(userAgent),
      } });
      return {session,user:fresh};
    });
    response.cookie(this.csrf.sessionCookie, token, { ...this.csrf.cookieOptions(), expires: expiresAt });
    response.clearCookie(this.csrf.preauthCookie, this.csrf.cookieOptions());
    request.cookies[this.csrf.sessionCookie] = token;
    request.auth = { user:authenticatedUser, session, principal:this.verified.issue(user.id,session.id) };

    await this.audit?.recordDirectSafe({
      action: 'auth.login',
      category: 'AUTH',
      outcome: 'SUCCESS',
      actorId: user.id,
      actorEmail: user.email,
      ipAddress: ip,
      userAgent,
      correlationId,
      metadata: { sessionId: session.id },
    });

    return this.current(request);
  }
  async verifyMfaLogin(
    request: AuthRequest,
    response: Response,
    challengeToken: string,
    code?: string,
    recoveryCode?: string,
  ) {
    if (!this.mfa) throw new AuthError('MFA_NOT_ACTIVE');
    const ip = request.ip ?? request.socket?.remoteAddress ?? 'unknown';
    const correlationId = typeof request.headers?.['x-correlation-id'] === 'string'
      ? request.headers['x-correlation-id']
      : typeof request.headers?.['x-request-id'] === 'string'
      ? request.headers['x-request-id']
      : null;
    const userAgent = typeof request.headers?.['user-agent'] === 'string' ? request.headers['user-agent'] : null;

    const { userId, method } = await this.mfa.verifyChallenge(challengeToken, code, recoveryCode, ip, userAgent, correlationId);
    const user = await this.prisma.userById(userId);
    if (!user || user.status !== 'ACTIVE') throw new AuthError('AUTH_FAILED');

    const token = secret(), csrfToken = this.csrf.sessionToken(token), now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.get('AUTH_SESSION_HOURS', { infer: true }) * 3600000);
    const previous = this.rawToken(request);

    const { session, user: authenticatedUser } = await this.prisma.transaction(async (tx) => {
      const fresh = await tx.userById(user.id);
      if (!fresh || fresh.status !== 'ACTIVE') throw new AuthError('AUTH_FAILED');
      if (previous) await tx.session.updateMany({ where: { tokenHash: digest(previous), revokedAt: null }, data: { revokedAt: now } });
      const session = await tx.session.create({
        data: {
          userId: user.id,
          tokenHash: digest(token),
          csrfHash: digest(csrfToken),
          authorizationHash: authorizationHash(fresh),
          expiresAt,
          mfaVerifiedAt: now,
          userAgent,
          ipAddress: ip,
          deviceSummary: summarizeDevice(userAgent),
        },
      });
      return { session, user: fresh };
    });

    response.cookie(this.csrf.sessionCookie, token, { ...this.csrf.cookieOptions(), expires: expiresAt });
    response.clearCookie(this.csrf.preauthCookie, this.csrf.cookieOptions());
    request.cookies[this.csrf.sessionCookie] = token;
    request.auth = { user: authenticatedUser, session, principal: this.verified.issue(user.id, session.id) };

    await this.audit?.recordDirectSafe({
      action: 'auth.login',
      category: 'AUTH',
      outcome: 'SUCCESS',
      actorId: user.id,
      actorEmail: user.email,
      ipAddress: ip,
      userAgent,
      correlationId,
      metadata: { sessionId: session.id, mfaMethod: method },
    });

    return this.current(request);
  }
  async logout(request: AuthRequest, response: Response) {
    const session = request.auth?.session;
    const user = request.auth?.user;
    await this.prisma.session.updateMany({ where: { id: session!.id, revokedAt: null }, data: { revokedAt: new Date() } });
    this.csrf.clearSession(response);

    await this.audit?.recordDirectSafe({
      clinicId: session?.selectedClinicId ?? null,
      action: 'auth.logout',
      category: 'AUTH',
      outcome: 'SUCCESS',
      actorId: user?.id ?? null,
      actorEmail: user?.email ?? null,
      ipAddress: request.ip ?? request.socket?.remoteAddress ?? null,
      userAgent: typeof request.headers?.['user-agent'] === 'string' ? request.headers['user-agent'] : null,
      metadata: { sessionId: session?.id },
    });

    return { ok: true };
  }
  async rotate(request: AuthRequest, response: Response, clinicId = request.auth!.session.selectedClinicId) {
    const { session, user } = request.auth!;
    const token = secret(), csrfToken = this.csrf.sessionToken(token), now = new Date();
    const userAgent = typeof request.headers?.['user-agent'] === 'string' ? request.headers['user-agent'] : session.userAgent;
    const ip = request.ip ?? request.socket?.remoteAddress ?? session.ipAddress;
    const next = await this.prisma.transaction(async tx => {
      const count = await tx.session.updateMany({ where: { id: session.id, revokedAt: null, expiresAt: { gt: now } }, data: { revokedAt: now } });
      if (count.count !== 1) throw new AuthError('SESSION_EXPIRED');
      return tx.session.create({ data: {
        userId: user.id,
        tokenHash: digest(token),
        csrfHash: digest(csrfToken),
        authorizationHash: session.authorizationHash,
        selectedClinicId: clinicId,
        expiresAt: session.expiresAt,
        mfaVerifiedAt: session.mfaVerifiedAt,
        userAgent,
        ipAddress: ip,
        deviceSummary: summarizeDevice(userAgent),
      } });
    });
    response.cookie(this.csrf.sessionCookie, token, { ...this.csrf.cookieOptions(), expires: next.expiresAt });
    request.cookies[this.csrf.sessionCookie] = token;
    request.auth = { user, session: next, principal:this.verified.issue(user.id,next.id) };

    await this.audit?.recordDirectSafe({
      clinicId: clinicId ?? null,
      action: 'auth.rotate',
      category: 'AUTH',
      outcome: 'SUCCESS',
      actorId: user.id,
      actorEmail: user.email,
      ipAddress: request.ip ?? request.socket?.remoteAddress ?? null,
      userAgent: typeof request.headers?.['user-agent'] === 'string' ? request.headers['user-agent'] : null,
      metadata: { previousSessionId: session.id, nextSessionId: next.id },
    });

    return this.current(request);
  }
  // Narrow identity/bootstrap projection. Public branding is fetched through its
  // dedicated allowlist function, not a bypass mode on tenant repositories.
  async clinics(proof:VerifiedPrincipal) {
    const {userId}=this.verified.require(proof);
    const user=await this.prisma.userById(userId);
    if(!user || user.status!=='ACTIVE')throw new UnauthorizedException();
    const memberships=user.memberships.filter(m=>m.status==='ACTIVE' && m.clinic.status==='ACTIVE');
    const clinics=await Promise.all(memberships.map(m=>this.selectionContext(proof,m.clinicId)));
    return {clinics:clinics.sort((a,b)=>a.displayName.localeCompare(b.displayName))};
  }
  async selectionContext(proof:VerifiedPrincipal,clinicId:string) {
    const {userId}=this.verified.require(proof);
    const user=await this.prisma.userById(userId);
    if(!user || user.status!=='ACTIVE')throw new UnauthorizedException();
    const m=user.memberships.find(m=>m.clinicId===clinicId && m.status==='ACTIVE' && m.clinic.status==='ACTIVE');
    if(!m)throw new NotFoundException();
    const publicIdentity=await this.branding.bySlug(m.clinic.slug);
    return {clinicId:m.clinicId,slug:m.clinic.slug,displayName:m.clinic.displayName,role:m.role,permissions:permissionsFor(m.role),branding:publicIdentity.branding};
  }
}
