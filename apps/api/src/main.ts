import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { configureApp } from './configure-app.js';
import type { Environment } from './config/environment.js';

async function bootstrap(): Promise<void> {
  // Import inside the boundary so invalid configuration cannot print raw startup errors.
  const { AppModule } = await import('./app.module.js');
  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  configureApp(app);
  app.enableShutdownHooks();
  const config = app.get(ConfigService<Environment, true>);
  try {
    await app.listen(config.get('API_PORT', { infer: true }), config.get('API_HOST', { infer: true }));
    console.info('Lamssa API listening; health endpoint: /api/v1/health');
  } catch (error) {
    await app.close();
    throw error;
  }
}

void bootstrap().catch(() => {
  console.error('Lamssa API startup failed. Check environment configuration and service availability.');
  process.exitCode = 1;
});
