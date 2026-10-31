import type { AuditCategory as PrismaAuditCategory, AuditOutcome as PrismaAuditOutcome } from '../generated/prisma/client.js';

export type AuditCategory = PrismaAuditCategory;
export type AuditOutcome = PrismaAuditOutcome;

export interface AuditEventInput {
  clinicId?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  category: AuditCategory;
  targetType?: string | null;
  targetId?: string | null;
  outcome?: AuditOutcome;
  correlationId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AuditQueryFilters {
  category?: AuditCategory;
  action?: string;
  actorId?: string;
  from?: Date;
  to?: Date;
  cursor?: string;
  limit?: number;
}

export interface SanitizedAuditEventDto {
  id: string;
  clinicId: string | null;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  category: AuditCategory;
  targetType: string | null;
  targetId: string | null;
  outcome: AuditOutcome;
  correlationId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

const SENSITIVE_KEY_PATTERN = /(password|token|secret|cookie|credential|card|cvv|pan|authorization|csrf|medicalnotes|diagnosis|clinicalnotes|symptom|prescription|treatmentnote|medication|allerg|assessment|examination|chiefcomplaint|nationalid|passport)/i;

export function sanitizeAuditMetadata(input: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 5 || input === null || typeof input !== 'object') return null;
  if (Array.isArray(input)) {
    return {
      items: input.slice(0, 50).map((item) => {
        if (item === null || item === undefined) return null;
        if (Array.isArray(item)) return sanitizeAuditMetadata({ items: item }, depth + 1);
        if (typeof item === 'object') return sanitizeAuditMetadata(item, depth + 1);
        if (typeof item === 'string') return item.length > 500 ? item.slice(0, 500) + '...[TRUNCATED]' : item;
        return item;
      }),
    };
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      result[key] = '[REDACTED]';
    } else if (value === null || value === undefined) {
      result[key] = null;
    } else if (Array.isArray(value)) {
      result[key] = value.slice(0, 50).map((item) => {
        if (item === null || item === undefined) return null;
        if (typeof item === 'object') return sanitizeAuditMetadata(item, depth + 1);
        if (typeof item === 'string') return item.length > 500 ? item.slice(0, 500) + '...[TRUNCATED]' : item;
        return item;
      });
    } else if (typeof value === 'object') {
      result[key] = sanitizeAuditMetadata(value, depth + 1);
    } else if (typeof value === 'string') {
      result[key] = value.length > 500 ? value.slice(0, 500) + '...[TRUNCATED]' : value;
    } else {
      result[key] = value;
    }
  }
  return result;
}
