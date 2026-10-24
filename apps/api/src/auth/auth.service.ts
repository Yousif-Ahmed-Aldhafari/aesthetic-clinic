import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Environment } from '../config/environment.js';
import { authUserInclude, type AuthRequest, type AuthUser } from './access.js';
import { AuthError } from './auth-error.js';
import { CsrfService } from './csrf.service.js';
import { authorizationHash, digest, equal, secret } from './crypto.js';
import { hashPassword, verifyPassword } from './password.js';
import { LoginLimiter } from './login-limiter.service.js';
import { permissionsFor } from './permissions.js';

@Injectable()
export class AuthService {
  private readonly dummyHash = hashPassword(secret());
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService<Environment, true>,
    private readonly csrf: CsrfService, private readonly limiter: LoginLimiter) {}

  private rawToken(request: AuthRequest): string | undefined {
    const value: unknown = request.cookies?.[this.csrf.sessionCookie];
    return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
  }
  async authenticate(request: AuthRequest, response: Response): Promise<void> {
    const token = this.rawToken(request);
    if (!token) throw new UnauthorizedException();
    const session = await this.prisma.session.findUnique({ where: { tokenHash: digest(token) }, include: { user: { include: authUserInclude } } });
    const now = new Date();
    if (!session || session.revokedAt || session.expiresAt <= now || !equal(session.csrfHash, digest(this.csrf.sessionToken(token))) ||
        now.getTime() - session.lastSeenAt.getTime() > this.config.get('AUTH_IDLE_MINUTES', { infer: true })*60000) {
      if (session && !session.revokedAt) await this.prisma.session.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: now } });
      this.csrf.clearSession(response); throw new AuthError('SESSION_EXPIRED');
    }
    if (session.user.status !== 'ACTIVE' || !equal(session.authorizationHash, authorizationHash(session.user))) {
      await this.prisma.session.updateMany({ where: { userId: session.userId, revokedAt: null }, data: { revokedAt: now } });
      this.csrf.clearSession(response); throw new AuthError('SESSION_EXPIRED');
    }
    request.auth = { user: session.user, session };
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
    await this.limiter.consume(request.ip ?? request.socket.remoteAddress ?? 'unknown', email);
    const user = await this.prisma.user.findUnique({ where: { email }, include: authUserInclude });
    const valid = await verifyPassword(user?.passwordHash ?? await this.dummyHash, password);
    if (!user || !valid || user.status !== 'ACTIVE' || !user.passwordHash) throw new AuthError('AUTH_FAILED');
    const token = secret(), csrfToken = this.csrf.sessionToken(token), now = new Date();
    const expiresAt = new Date(now.getTime()+this.config.get('AUTH_SESSION_HOURS', { infer: true })*3600000);
    const previous = this.rawToken(request);
    const session = await this.prisma.$transaction(async tx => {
      const fresh = await tx.user.findUnique({ where: { id: user.id }, include: authUserInclude });
      if (!fresh || fresh.status !== 'ACTIVE' || fresh.passwordHash !== user.passwordHash) throw new AuthError('AUTH_FAILED');
      if (previous) await tx.session.updateMany({ where: { tokenHash: digest(previous), revokedAt: null }, data: { revokedAt: now } });
      return tx.session.create({ data: { userId: user.id, tokenHash: digest(token), csrfHash: digest(csrfToken), authorizationHash: authorizationHash(fresh), expiresAt } });
    });
    response.cookie(this.csrf.sessionCookie, token, { ...this.csrf.cookieOptions(), expires: expiresAt });
    response.clearCookie(this.csrf.preauthCookie, this.csrf.cookieOptions());
    request.cookies[this.csrf.sessionCookie] = token;
    request.auth = { user, session };
    return this.current(request);
  }
  async logout(request: AuthRequest, response: Response) {
    await this.prisma.session.updateMany({ where: { id: request.auth!.session.id, revokedAt: null }, data: { revokedAt: new Date() } });
    this.csrf.clearSession(response); return { ok: true };
  }
  async rotate(request: AuthRequest, response: Response, clinicId = request.auth!.session.selectedClinicId) {
    const { session, user } = request.auth!;
    const token = secret(), csrfToken = this.csrf.sessionToken(token), now = new Date();
    const next = await this.prisma.$transaction(async tx => {
      const count = await tx.session.updateMany({ where: { id: session.id, revokedAt: null, expiresAt: { gt: now } }, data: { revokedAt: now } });
      if (count.count !== 1) throw new AuthError('SESSION_EXPIRED');
      return tx.session.create({ data: { userId: user.id, tokenHash: digest(token), csrfHash: digest(csrfToken), authorizationHash: session.authorizationHash,
        selectedClinicId: clinicId, expiresAt: session.expiresAt } });
    });
    response.cookie(this.csrf.sessionCookie, token, { ...this.csrf.cookieOptions(), expires: next.expiresAt });
    request.cookies[this.csrf.sessionCookie] = token;
    request.auth = { user, session: next };
    return this.current(request);
  }
  async clinics(userId: string) {
    const memberships = await this.prisma.clinicMembership.findMany({
      where: { userId, status: 'ACTIVE', user: { status: 'ACTIVE' }, clinic: { status: 'ACTIVE' } },
      include: { clinic: { include: { branding: true } } }, orderBy: { clinic: { displayName: 'asc' } },
    });
    return { clinics: memberships.map(m => this.context(m)) };
  }
  async clinic(userId: string, clinicId: string) {
    const membership = await this.prisma.clinicMembership.findFirst({
      where: { clinicId, userId, status: 'ACTIVE', user: { status: 'ACTIVE' }, clinic: { status: 'ACTIVE' } },
      include: { clinic: { include: { branding: true } } },
    });
    if (!membership) throw new NotFoundException();
    return this.context(membership);
  }
  private context(m: { role: AuthUser['memberships'][number]['role']; clinic: { id: string; slug: string; displayName: string; branding: { logoUrl: string | null; primaryColor: string; secondaryColor: string; accentColor: string | null } | null } }) {
    const b = m.clinic.branding;
    return { clinicId: m.clinic.id, slug: m.clinic.slug, displayName: m.clinic.displayName, role: m.role, permissions: permissionsFor(m.role),
      branding: b ? { logoUrl: b.logoUrl, primaryColor: b.primaryColor, secondaryColor: b.secondaryColor, accentColor: b.accentColor } : null };
  }
}
