import { isIP } from 'node:net';

export type Environment = {
  NODE_ENV: 'development' | 'test' | 'production';
  API_HOST: string;
  API_PORT: number;
  CORS_ORIGINS: string[];
  DATABASE_URL: string;
};

export function validateEnvironment(input: Record<string, unknown>): Environment {
  const errors: string[] = [];
  const mode = input.NODE_ENV ?? 'development';
  const host = input.API_HOST ?? '127.0.0.1';
  const port = Number(input.API_PORT ?? 3000);
  const databaseUrl = typeof input.DATABASE_URL === 'string' ? input.DATABASE_URL : '';
  if (!['development', 'test', 'production'].includes(String(mode))) errors.push('NODE_ENV');
  if (typeof host !== 'string' || !isIP(host)) errors.push('API_HOST');
  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push('API_PORT');
  try {
    const url = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2) {
      errors.push('DATABASE_URL');
    }
  } catch { errors.push('DATABASE_URL'); }

  const origins = typeof input.CORS_ORIGINS === 'string'
    ? [...new Set(input.CORS_ORIGINS.split(',').map(value => value.trim()).filter(Boolean))]
    : [];
  if (origins.length === 0) errors.push('CORS_ORIGINS');
  for (const origin of origins) {
    try {
      const url = new URL(origin);
      if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin ||
          (mode === 'production' && url.protocol !== 'https:')) errors.push('CORS_ORIGINS');
    } catch { errors.push('CORS_ORIGINS'); }
  }
  // Report variable names only; never interpolate secrets or raw validation input.
  if (errors.length) throw new Error(`Invalid environment variables: ${[...new Set(errors)].join(', ')}`);
  return {
    NODE_ENV: mode as Environment['NODE_ENV'], API_HOST: host as string,
    API_PORT: port, CORS_ORIGINS: origins, DATABASE_URL: databaseUrl,
  };
}
