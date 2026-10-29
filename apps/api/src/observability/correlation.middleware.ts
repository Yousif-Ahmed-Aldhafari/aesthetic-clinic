import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { StructuredLoggerService } from './structured-logger.service.js';
import { MetricsService } from './metrics.service.js';
import type { AuthRequest } from '../auth/access.js';
import { requestId as safeRequestId } from './request-id.js';

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  constructor(
    private readonly logger: StructuredLoggerService,
    private readonly metrics: MetricsService,
  ) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now();
    const decrementActive = this.metrics.recordRequestStart();

    // Extract or generate Request ID and Correlation ID
    const requestId = safeRequestId(req.headers['x-request-id']);
    const correlationId = safeRequestId(req.headers['x-correlation-id'], requestId);

    // Attach to request object and response headers
    (req as unknown as { requestId: string; correlationId: string }).requestId = requestId;
    (req as unknown as { requestId: string; correlationId: string }).correlationId = correlationId;

    res.setHeader('X-Request-Id', requestId);
    res.setHeader('X-Correlation-Id', correlationId);

    res.on('finish', () => {
      decrementActive();
      const durationMs = Date.now() - start;
      const statusCode = res.statusCode;

      this.metrics.recordRequest(statusCode, durationMs);

      // Do not log health poll pings on 200 unless debug to avoid log volume flood
      if (req.originalUrl === '/api/v1/health' && statusCode === 200) {
        return;
      }

      const authReq = req as AuthRequest;
      const clinicId = authReq.clinicContext?.clinicId ?? authReq.auth?.session?.selectedClinicId ?? null;
      const userId = authReq.auth?.user?.id ?? null;

      this.logger.http({
        message: `${req.method} ${req.baseUrl || req.path} ${statusCode} ${durationMs}ms`,
        requestId,
        correlationId,
        method: req.method,
        path: req.baseUrl || req.path,
        statusCode,
        durationMs,
        clinicId,
        userId,
        ip: req.ip ?? req.socket?.remoteAddress ?? null,
      });
    });

    res.on('close', () => {
      // Handles aborted or cancelled client connections
      if (!res.writableEnded) {
        decrementActive();
      }
    });

    next();
  }
}
