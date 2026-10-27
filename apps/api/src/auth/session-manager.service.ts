import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { IdentityDatabase } from '../prisma/identity.database.js';
import { AuditService } from '../audit/audit.service.js';

export function summarizeDevice(userAgent: string | null | undefined): string {
  if (!userAgent) return 'متصفح غير معروف';
  let browser = 'متصفح';
  if (userAgent.includes('Edg/')) browser = 'Edge';
  else if (userAgent.includes('Chrome/')) browser = 'Chrome';
  else if (userAgent.includes('Firefox/')) browser = 'Firefox';
  else if (userAgent.includes('Safari/')) browser = 'Safari';

  let os = 'نظام التشغيل';
  if (userAgent.includes('iPhone') || userAgent.includes('iPad')) os = 'iOS';
  else if (userAgent.includes('Android')) os = 'Android';
  else if (userAgent.includes('Windows')) os = 'Windows';
  else if (userAgent.includes('Macintosh') || userAgent.includes('Mac OS')) os = 'macOS';
  else if (userAgent.includes('Linux')) os = 'Linux';

  return `${browser} على ${os}`;
}

export function maskIpAddress(ip: string | null | undefined): string {
  if (!ip || ip === 'unknown' || ip === '127.0.0.1') return ip === '127.0.0.1' ? '127.0.***.***' : 'مجهول';
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.***.***`;
  }
  if (ip.includes(':')) {
    const parts = ip.split(':');
    if (parts.length >= 2) return `${parts[0]}:${parts[1]}:***`;
  }
  return '***';
}

export interface SessionDto {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  isCurrent: boolean;
  ipAddress: string;
  deviceSummary: string;
  mfaVerifiedAt: string | null;
}

@Injectable()
export class SessionManagerService {
  constructor(
    private readonly prisma: IdentityDatabase,
    @Optional() private readonly audit?: AuditService,
  ) {}

  async listActiveSessions(userId: string, currentSessionId: string): Promise<SessionDto[]> {
    const now = new Date();
    const sessions = await this.prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { lastSeenAt: 'desc' },
    });

    return sessions.map((s) => ({
      id: s.id,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      isCurrent: s.id === currentSessionId,
      ipAddress: maskIpAddress(s.ipAddress),
      deviceSummary: s.deviceSummary || summarizeDevice(s.userAgent),
      mfaVerifiedAt: s.mfaVerifiedAt ? s.mfaVerifiedAt.toISOString() : null,
    }));
  }

  async revokeSession(userId: string, sessionId: string, actorIp?: string | null, actorUserAgent?: string | null): Promise<void> {
    const now = new Date();
    const updated = await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: now },
    });

    if (updated.count === 0) {
      throw new NotFoundException('الجلسة غير موجودة أو تم إنهاؤها مسبقًا');
    }

    await this.audit?.recordDirectSafe({
      action: 'auth.session_revoked',
      category: 'AUTH',
      outcome: 'SUCCESS',
      actorId: userId,
      ipAddress: actorIp ?? null,
      userAgent: actorUserAgent ?? null,
      metadata: { revokedSessionId: sessionId },
    });
  }

  async revokeOtherSessions(userId: string, currentSessionId: string, actorIp?: string | null, actorUserAgent?: string | null): Promise<{ revokedCount: number }> {
    const now = new Date();
    const updated = await this.prisma.session.updateMany({
      where: {
        userId,
        id: { not: currentSessionId },
        revokedAt: null,
      },
      data: { revokedAt: now },
    });

    await this.audit?.recordDirectSafe({
      action: 'auth.other_sessions_revoked',
      category: 'AUTH',
      outcome: 'SUCCESS',
      actorId: userId,
      ipAddress: actorIp ?? null,
      userAgent: actorUserAgent ?? null,
      metadata: { revokedCount: updated.count, retainedSessionId: currentSessionId },
    });

    return { revokedCount: updated.count };
  }
}
