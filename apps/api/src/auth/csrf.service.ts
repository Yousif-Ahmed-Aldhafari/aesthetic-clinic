import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import type { Environment } from '../config/environment.js';
import type { AuthRequest } from './access.js';
import { digest, equal, mac, secret } from './crypto.js';
import { AuthError } from './auth-error.js';

@Injectable()
export class CsrfService {
  constructor(private readonly config: ConfigService<Environment, true>) {}
  get production() { return this.config.get('NODE_ENV', { infer: true }) === 'production'; }
  get sessionCookie() { return this.production ? '__Host-lamssa_session' : 'lamssa_session'; }
  get preauthCookie() { return this.production ? '__Host-lamssa_preauth' : 'lamssa_preauth'; }
  get key() { return this.config.get('AUTH_CSRF_SECRET', { infer: true }); }
  cookieOptions(): CookieOptions {
    return { httpOnly: true, secure: this.production, sameSite: 'lax', path: this.production ? '/' : '/api/v1' };
  }
  issuePreauth(response: Response): string {
    const payload = `${Date.now()}.${secret()}`;
    const token = `${payload}.${mac(this.key, `preauth:${payload}`)}`;
    response.cookie(this.preauthCookie, token, { ...this.cookieOptions(), maxAge: 10 * 60 * 1000 });
    return token;
  }
  sessionToken(rawSession: string): string { return mac(this.key, `session-csrf:${rawSession}`); }
  validate(request: AuthRequest, publicRequest: boolean): void {
    const origins = this.config.get('CORS_ORIGINS', { infer: true });
    if (!request.headers.origin || !origins.includes(request.headers.origin) || request.headers['sec-fetch-site'] === 'cross-site') throw new AuthError('CSRF_INVALID');
    const token = request.headers['x-csrf-token'];
    if (typeof token !== 'string' || token.length > 256) throw new AuthError('CSRF_INVALID');
    if (publicRequest) {
      const cookie = request.cookies?.[this.preauthCookie];
      const parts = token.split('.');
      const issued = Number(parts[0]);
      if (!equal(cookie, token) || parts.length !== 3 || !Number.isFinite(issued) || issued > Date.now() || Date.now() - issued > 600000 ||
          !equal(parts[2], mac(this.key, `preauth:${parts[0]}.${parts[1]}`))) throw new AuthError('CSRF_INVALID');
    } else if (!request.auth || !equal(digest(token), request.auth.session.csrfHash)) throw new AuthError('CSRF_INVALID');
  }
  clearSession(response: Response): void { response.clearCookie(this.sessionCookie, this.cookieOptions()); }
}
