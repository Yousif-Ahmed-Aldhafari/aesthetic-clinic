import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AlertRecord, AlertSeverity } from './observability.types.js';
import { MetricsService } from './metrics.service.js';
import { StructuredLoggerService } from './structured-logger.service.js';

@Injectable()
export class AlertingService {
  private readonly activeAlerts = new Map<string, AlertRecord>();
  private readonly lastFiredAt = new Map<string, number>();
  private readonly cooldownMs = 15 * 60 * 1000; // 15-minute cooldown per alert rule

  constructor(
    private readonly metrics: MetricsService,
    private readonly logger: StructuredLoggerService,
  ) {}

  /**
   * Evaluates all operational health rules against current metrics.
   */
  evaluateRules(): AlertRecord[] {
    const snapshot = this.metrics.getSnapshot();

    // Rule 1: Database Health
    if (snapshot.database.status === 'unhealthy') {
      this.triggerAlert(
        'DATABASE_DOWN',
        'critical',
        'انقطاع الاتصال بقاعدة البيانات',
        'تعذّر الاتصال بقاعدة بيانات PostgreSQL الرئيسية أو نفاد تجمع الاتصالات.',
        { latencyMs: snapshot.database.pingLatencyMs },
      );
    } else {
      this.resolveAlert('DATABASE_DOWN');
    }

    // Rule 2: High 5xx Error Rate
    const total5xx = snapshot.requestsTotal['5xx'];
    if (total5xx >= 10) {
      this.triggerAlert(
        'HIGH_5XX_ERROR_RATE',
        'critical',
        'ارتفاع معدل الأخطاء الداخلية (5xx)',
        `تم تسجيل ${total5xx} أخطاء خادم داخلية خلال فترة التشغيل الحالية.`,
        { total5xx },
      );
    }

    // Rule 3: Backup Stale (> 24 hours)
    if (snapshot.backup.ageHours !== null && snapshot.backup.ageHours > 24) {
      this.triggerAlert(
        'BACKUP_STALE',
        'warning',
        'تقادم النسخ الاحتياطية المشفرة',
        `تجاوز عمر آخر نسخة احتياطية ناجحة ${snapshot.backup.ageHours} ساعة (الحد الأقصى المسموح: 24 ساعة).`,
        { ageHours: snapshot.backup.ageHours },
      );
    } else if (snapshot.backup.ageHours !== null && snapshot.backup.ageHours <= 24) {
      this.resolveAlert('BACKUP_STALE');
    }

    // Rule 4: Backup Run Failed
    if (snapshot.backup.lastStatus === 'FAILED') {
      this.triggerAlert(
        'BACKUP_FAILED',
        'critical',
        'فشل عملية النسخ الاحتياطي الأخيرة',
        'أبلغت آخر محاولة نسخ احتياطي أو تحقق عن وجود فشل في التشفير أو التخزين.',
        { lastSuccessful: snapshot.backup.lastSuccessfulBackupAt },
      );
    } else if (snapshot.backup.lastStatus === 'SUCCESS') {
      this.resolveAlert('BACKUP_FAILED');
    }

    // Rule 5: Authentication Anomaly / Brute-force Spike
    if (snapshot.failedLoginsTotal >= 20) {
      this.triggerAlert(
        'AUTH_BRUTE_FORCE_SPIKE',
        'warning',
        'اشتباه هجوم تخمين كلمات المرور (Brute Force)',
        `تم رصد ${snapshot.failedLoginsTotal} محاولات دخول فاشلة تراكمية تتجاوز المعدل الطبيعي.`,
        { failedCount: snapshot.failedLoginsTotal },
      );
    }

    return Array.from(this.activeAlerts.values());
  }

  triggerAlert(
    ruleId: string,
    severity: AlertSeverity,
    title: string,
    description: string,
    metadata?: Record<string, unknown>,
  ): AlertRecord | null {
    const now = Date.now();
    const lastFired = this.lastFiredAt.get(ruleId) ?? 0;

    // Check deduplication and cooldown
    if (now - lastFired < this.cooldownMs && this.activeAlerts.has(ruleId)) {
      return this.activeAlerts.get(ruleId)!;
    }

    const alert: AlertRecord = {
      id: randomUUID(),
      ruleId,
      severity,
      title,
      description,
      triggeredAt: new Date(now).toISOString(),
      metadata,
    };

    this.activeAlerts.set(ruleId, alert);
    this.lastFiredAt.set(ruleId, now);

    this.logger.warn(`[ALERT_${severity.toUpperCase()}] ${title}: ${description}`, {
      alertId: alert.id,
      ruleId,
      severity,
      ...metadata,
    });

    return alert;
  }

  resolveAlert(ruleId: string): void {
    const alert = this.activeAlerts.get(ruleId);
    if (alert) {
      alert.resolvedAt = new Date().toISOString();
      this.activeAlerts.delete(ruleId);
      this.logger.info(`[ALERT_RESOLVED] ${alert.title}`, { ruleId });
    }
  }

  getActiveAlerts(): AlertRecord[] {
    return Array.from(this.activeAlerts.values());
  }
}
