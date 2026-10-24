import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AuthUser } from './access.js';

export const secret = () => randomBytes(32).toString('base64url');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const mac = (key: string, value: string) => createHmac('sha256', key).update(value).digest('base64url');
export function equal(a: unknown, b: unknown): boolean {
  return typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
export function authorizationHash(user: AuthUser): string {
  return digest(JSON.stringify([
    user.status, user.passwordHash, user.authVersion, user.platformRole,
    [...user.memberships].sort((a,b)=>a.id.localeCompare(b.id)).map(m=>[m.id,m.clinicId,m.role,m.status,m.clinic.status]),
  ]));
}
