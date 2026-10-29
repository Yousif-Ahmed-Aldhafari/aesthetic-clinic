import { Global, Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { StructuredLoggerService } from './structured-logger.service.js';
import { MetricsService } from './metrics.service.js';
import { ErrorTrackerService } from './error-tracker.service.js';
import { AlertingService } from './alerting.service.js';
import { CorrelationMiddleware } from './correlation.middleware.js';
import { ObservabilityController } from './observability.controller.js';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [ObservabilityController],
  providers: [
    StructuredLoggerService,
    MetricsService,
    ErrorTrackerService,
    AlertingService,
    CorrelationMiddleware,
  ],
  exports: [
    StructuredLoggerService,
    MetricsService,
    ErrorTrackerService,
    AlertingService,
    CorrelationMiddleware,
  ],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
