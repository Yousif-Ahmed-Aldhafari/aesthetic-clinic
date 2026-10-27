import {
  Controller,
  Get,
  Header,
  Headers,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { PublicRoute, Authenticated, type AuthRequest } from '../auth/access.js';
import { DatabaseHealthService } from '../prisma/database-health.service.js';
import { MetricsService } from './metrics.service.js';
import { ErrorTrackerService } from './error-tracker.service.js';
import { AlertingService } from './alerting.service.js';
import { StructuredLoggerService } from './structured-logger.service.js';

@Controller()
export class ObservabilityController {
  constructor(
    private readonly databaseHealth: DatabaseHealthService,
    private readonly metrics: MetricsService,
    private readonly errorTracker: ErrorTrackerService,
    private readonly alerting: AlertingService,
    private readonly logger: StructuredLoggerService,
  ) {}

  // ============================================================
  // PUBLIC HEALTH CHECKS
  // ============================================================

  @Get('health')
  @PublicRoute()
  @Header('Cache-Control', 'no-store')
  liveRoot() {
    return { status: 'ok' };
  }

  @Get('health/live')
  @PublicRoute()
  @Header('Cache-Control', 'no-store')
  live() {
    return { status: 'ok' };
  }

  @Get('health/ready')
  @PublicRoute()
  @Header('Cache-Control', 'no-store')
  async ready() {
    const start = Date.now();
    try {
      await this.databaseHealth.check();
      const pingMs = Date.now() - start;
      this.metrics.recordDatabaseHealth(true, pingMs);
      return {
        status: 'ready',
      };
    } catch {
      this.metrics.recordDatabaseHealth(false, Date.now() - start);
      this.alerting.triggerAlert(
        'DATABASE_DOWN',
        'critical',
        'فشل فحص جاهزية قاعدة البيانات',
        'تعذّر تأكيد صحة الاتصال بقاعدة البيانات في فحص الجاهزية.',
      );
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: { code: 'SERVICE_UNAVAILABLE', message: 'قاعدة البيانات غير متاحة مؤقتًا' },
      });
    }
  }

  // ============================================================
  // PROTECTED METRICS & DIAGNOSTICS
  // ============================================================

  @Get('metrics')
  @PublicRoute() // Custom authentication logic for metrics token or session
  @Header('Cache-Control', 'no-store')
  async getMetrics(
    @Req() req: AuthRequest,
    @Res() res: Response,
    @Headers('x-metrics-key') metricsKey?: string,
    @Query('format') format?: string,
  ) {
    this.assertAuthorizedForOperationalTelemetry(req, metricsKey);

    if (format === 'prometheus' || req.headers.accept?.includes('text/plain')) {
      res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.send(this.metrics.toPrometheusFormat());
      return;
    }

    res.json(this.metrics.getSnapshot());
  }

  @Get('health/diagnostics')
  @Authenticated()
  @Header('Cache-Control', 'no-store')
  getDiagnostics(@Req() req: AuthRequest) {
    this.assertAuthorizedForOperationalTelemetry(req);

    // Evaluate current rules before returning diagnostics
    const activeAlerts = this.alerting.evaluateRules();

    return {
      metrics: this.metrics.getSnapshot(),
      alerts: activeAlerts,
      errorGroups: this.errorTracker.getErrorGroups().slice(0, 20),
      recentLogs: this.logger.getRecentLogs(30),
    };
  }

  @Get('alerts/active')
  @Authenticated()
  @Header('Cache-Control', 'no-store')
  getActiveAlerts(@Req() req: AuthRequest) {
    this.assertAuthorizedForOperationalTelemetry(req);
    return {
      alerts: this.alerting.evaluateRules(),
    };
  }

  private assertAuthorizedForOperationalTelemetry(req: AuthRequest, metricsKey?: string): void {
    // 1. Secret header match (for Prometheus scrapers / external monitoring systems)
    const configuredKey = process.env.METRICS_SECRET_KEY;
    if (configuredKey && metricsKey && metricsKey === configuredKey) {
      return;
    }

    // 2. Authenticated session check
    if (req.auth?.user) {
      const user = req.auth.user;
      const isPlatformAdmin = user.platformRole === 'PLATFORM_ADMIN';
      const isClinicOwnerOrAdmin = user.memberships.some((m) =>
        ['CLINIC_OWNER', 'CLINIC_ADMIN'].includes(m.role) && m.status === 'ACTIVE',
      );

      if (isPlatformAdmin || isClinicOwnerOrAdmin) {
        return;
      }
    }

    throw new UnauthorizedException({
      statusCode: 401,
      error: { code: 'UNAUTHORIZED_METRICS_ACCESS', message: 'مؤشرات الأداء التشغيلية محمية وغير متاحة للعامة' },
    });
  }
}
