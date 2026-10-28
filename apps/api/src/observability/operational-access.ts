import { createHash, timingSafeEqual } from 'node:crypto';
type OperationalUser = { status: string; platformRole: string | null };

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

export function validMonitoringCredential(presented: string | undefined, configured: string | undefined): boolean {
  if (!presented || !configured || configured.length < 32 || presented.length > 512) return false;
  return timingSafeEqual(digest(presented), digest(configured));
}

export function isPlatformOperator(user: OperationalUser | undefined): boolean {
  return user?.status === 'ACTIVE' && user.platformRole === 'PLATFORM_ADMIN';
}
