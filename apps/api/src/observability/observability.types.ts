export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface StructuredLogEntry {
  timestamp: string; // ISO-8601 UTC
  level: LogLevel;
  message: string;
  requestId: string;
  correlationId?: string | null;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  clinicId?: string | null;
  userId?: string | null;
  ip?: string | null; // Masked for privacy
  error?: {
    code: string;
    message: string;
    fingerprint?: string;
    stack?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface LatencyStats {
  count: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

export interface BackupHealthSummary {
  lastSuccessfulBackupAt: string | null;
  ageHours: number | null;
  lastStatus: 'SUCCESS' | 'FAILED' | 'UNKNOWN';
  lastDrillAt: string | null;
  lastDrillStatus: 'SUCCESS' | 'FAILED' | 'UNKNOWN';
}

export interface MetricsSnapshot {
  timestamp: string;
  uptimeSeconds: number;
  requestsTotal: {
    '2xx': number;
    '3xx': number;
    '4xx': number;
    '5xx': number;
  };
  latency: LatencyStats;
  activeRequests: number;
  failedLoginsTotal: number;
  database: {
    status: 'healthy' | 'unhealthy';
    pingLatencyMs: number;
    lastCheckedAt?: string | null;
  };
  backup: BackupHealthSummary;
}

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface AlertRecord {
  id: string;
  ruleId: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  triggeredAt: string;
  resolvedAt?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ErrorGroupRecord {
  fingerprint: string;
  code: string;
  message: string;
  firstSeenAt: string;
  lastSeenAt: string;
  occurrences: number;
  samplePath?: string;
}
