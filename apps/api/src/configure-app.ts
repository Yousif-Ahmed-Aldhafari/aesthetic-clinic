import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SafeExceptionFilter } from './common/safe-exception.filter.js';
import type { Environment } from './config/environment.js';

export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService<Environment, true>);
  const origins = config.get('CORS_ORIGINS', { infer: true });
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allowed: boolean) => void) =>
      callback(null, Boolean(origin && origins.includes(origin))),
    methods: ['GET', 'HEAD', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept'],
    credentials: false,
    maxAge: 600,
  });
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true,
    transform: true, validationError: { target: false, value: false },
  }));
  app.useGlobalFilters(new SafeExceptionFilter());
  app.getHttpAdapter().getInstance().disable('x-powered-by');
}
