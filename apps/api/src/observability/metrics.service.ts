import { Injectable } from '@nestjs/common';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BackupHealthSummary, LatencyStats, MetricsSnapshot } from './observability.types.js';

@Injectable()
export class MetricsService {
  private readonly startTime = Date.now();
  private activeRequestsCount = 0;
  private failedLoginsCount = 0;

  private readonly requestsCounts = {
    '2xx': 0,
    '3xx': 0,
    '4xx': 0,
    '5xx': 0,
  };

  // Rolling latency buffer (last 1000 requests)
  private readonly latencies: number[] = [];
  private readonly maxLatencies = 1000;

  // DB Health cache
  private dbHealthy = true;
  private lastDbPingMs = 0;
  private lastDbCheckAt = 0;

  recordRequestStart(): () => void {
    this.activeRequestsCount++;
    return () => {
      this.activeRequestsCount = Math.max(0, this.activeRequestsCount - 1);
    };
  }

  recordRequest(statusCode: number, durationMs: number): void {
    if (statusCode >= 200 && statusCode < 300) this.requestsCounts['2xx']++;
    else if (statusCode >= 300 && statusCode < 400) this.requestsCounts['3xx']++;
    else if (statusCode >= 400 && statusCode < 500) this.requestsCounts['4xx']++;
    else if (statusCode >= 500) this.requestsCounts['5xx']++;

    this.latencies.push(durationMs);
    if (this.latencies.length > this.maxLatencies) {
      this.latencies.shift();
    }
  }

  recordFailedLogin(): void {
    this.failedLoginsCount++;
  }

  recordDatabaseHealth(healthy: boolean, latencyMs: number): void {
    this.dbHealthy = healthy;
    this.lastDbPingMs = latencyMs;
    this.lastDbCheckAt = Date.now();
  }

  getSnapshot(): MetricsSnapshot {
    return {
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      requestsTotal: { ...this.requestsCounts },
      latency: this.calculateLatencyStats(),
      activeRequests: this.activeRequestsCount,
      failedLoginsTotal: this.failedLoginsCount,
      database: {
        status: this.dbHealthy ? 'healthy' : 'unhealthy',
        pingLatencyMs: this.lastDbPingMs,
        lastCheckedAt: this.lastDbCheckAt > 0 ? new Date(this.lastDbCheckAt).toISOString() : null,
      },
      backup: this.getBackupHealth(),
    };
  }

  private calculateLatencyStats(): LatencyStats {
    if (this.latencies.length === 0) {
      return { count: 0, avg: 0, p50: 0, p95: 0, p99: 0, max: 0 };
    }

    const sorted = [...this.latencies].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((acc, val) => acc + val, 0);
    const avg = Math.round((sum / count) * 10) / 10;
    const p50 = sorted[Math.floor(count * 0.5)] ?? 0;
    const p95 = sorted[Math.floor(count * 0.95)] ?? 0;
    const p99 = sorted[Math.floor(count * 0.99)] ?? 0;
    const max = sorted[count - 1] ?? 0;

    return { count, avg, p50, p95, p99, max };
  }

  /**
   * Evaluates the health and age of encrypted backups from /var/backups.
   */
  getBackupHealth(): BackupHealthSummary {
    const backupsDir = resolve(process.cwd(), 'var/backups');
    if (!existsSync(backupsDir)) {
      return {
        lastSuccessfulBackupAt: null,
        ageHours: null,
        lastStatus: 'UNKNOWN',
        lastDrillAt: null,
        lastDrillStatus: 'UNKNOWN',
      };
    }

    try {
      const files = readdirSync(backupsDir);
      const metaFiles = files.filter((f) => f.endsWith('.meta.json')).sort().reverse();
      if (metaFiles.length === 0) {
        return {
          lastSuccessfulBackupAt: null,
          ageHours: null,
          lastStatus: 'UNKNOWN',
          lastDrillAt: null,
          lastDrillStatus: 'UNKNOWN',
        };
      }

      const latestMetaPath = resolve(backupsDir, metaFiles[0]);
      const content = JSON.parse(readFileSync(latestMetaPath, 'utf8'));
      const timestamp = content.timestamp || content.completedAt || content.createdAt;
      const backupTime = timestamp ? new Date(timestamp).getTime() : null;
      const ageHours = backupTime ? Math.round(((Date.now() - backupTime) / (1000 * 60 * 60)) * 10) / 10 : null;

      return {
        lastSuccessfulBackupAt: timestamp ?? null,
        ageHours,
        lastStatus: content.status === 'FAILED' ? 'FAILED' : 'SUCCESS',
        lastDrillAt: content.lastDrillAt ?? null,
        lastDrillStatus: content.drillStatus ?? 'SUCCESS',
      };
    } catch {
      return {
        lastSuccessfulBackupAt: null,
        ageHours: null,
        lastStatus: 'UNKNOWN',
        lastDrillAt: null,
        lastDrillStatus: 'UNKNOWN',
      };
    }
  }

  /**
   * Formats operational metrics in standard Prometheus text exposition format.
   */
  toPrometheusFormat(): string {
    const s = this.getSnapshot();
    const lines: string[] = [
      '# HELP lamssa_uptime_seconds Total application uptime in seconds',
      '# TYPE lamssa_uptime_seconds gauge',
      `lamssa_uptime_seconds ${s.uptimeSeconds}`,
      '',
      '# HELP lamssa_http_requests_total Total HTTP requests partitioned by status class',
      '# TYPE lamssa_http_requests_total counter',
      `lamssa_http_requests_total{status_class="2xx"} ${s.requestsTotal['2xx']}`,
      `lamssa_http_requests_total{status_class="3xx"} ${s.requestsTotal['3xx']}`,
      `lamssa_http_requests_total{status_class="4xx"} ${s.requestsTotal['4xx']}`,
      `lamssa_http_requests_total{status_class="5xx"} ${s.requestsTotal['5xx']}`,
      '',
      '# HELP lamssa_http_requests_active Current in-flight requests',
      '# TYPE lamssa_http_requests_active gauge',
      `lamssa_http_requests_active ${s.activeRequests}`,
      '',
      '# HELP lamssa_http_request_duration_ms_avg Rolling average request duration in milliseconds',
      '# TYPE lamssa_http_request_duration_ms_avg gauge',
      `lamssa_http_request_duration_ms_avg ${s.latency.avg}`,
      `lamssa_http_request_duration_ms{quantile="0.5"} ${s.latency.p50}`,
      `lamssa_http_request_duration_ms{quantile="0.95"} ${s.latency.p95}`,
      `lamssa_http_request_duration_ms{quantile="0.99"} ${s.latency.p99}`,
      `lamssa_http_request_duration_ms_max ${s.latency.max}`,
      '',
      '# HELP lamssa_auth_failed_logins_total Total failed login attempts',
      '# TYPE lamssa_auth_failed_logins_total counter',
      `lamssa_auth_failed_logins_total ${s.failedLoginsTotal}`,
      '',
      '# HELP lamssa_database_healthy Database connection status (1 = healthy, 0 = unhealthy)',
      '# TYPE lamssa_database_healthy gauge',
      `lamssa_database_healthy ${s.database.status === 'healthy' ? 1 : 0}`,
      '',
      '# HELP lamssa_backup_age_hours Age of latest database backup in hours',
      '# TYPE lamssa_backup_age_hours gauge',
      `lamssa_backup_age_hours ${s.backup.ageHours ?? -1}`,
    ];

    return `${lines.join('\n')}\n`;
  }
}
