import { isIP } from 'node:net';
import { isAbsolute } from 'node:path';

export type Environment = {
  NODE_ENV: 'development' | 'test' | 'production';
  API_HOST: string;
  API_PORT: number;
  CORS_ORIGINS: string[];
  DATABASE_URL: string;
  AUTH_CSRF_SECRET: string;
  AUTH_SESSION_HOURS: number;
  AUTH_IDLE_MINUTES: number;
  AUTH_LOGIN_ACCOUNT_LIMIT: number;
  AUTH_LOGIN_IP_LIMIT: number;
  TRUST_PROXY_HOPS: number;
  PLATFORM_BASE_DOMAIN: string;
  API_ALLOWED_HOSTS: string[];
  ASSET_STORAGE_DIR: string | null;
  MFA_ENCRYPTION_KEY?: string;
  MFA_ENCRYPTION_KEY_PREVIOUS?: string;
  METRICS_SECRET_KEY?: string;
};

export function validateEnvironment(input: Record<string, unknown>): Environment {
  const errors: string[] = [];
  const mode = input.NODE_ENV ?? 'development';
  const host = input.API_HOST ?? '127.0.0.1';
  const port = Number(input.API_PORT ?? 3000);
  const databaseUrl = typeof input.DATABASE_URL === 'string' ? input.DATABASE_URL : '';
  const csrfKey = typeof input.AUTH_CSRF_SECRET === 'string' ? input.AUTH_CSRF_SECRET : '';
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(csrfKey)) errors.push('AUTH_CSRF_SECRET');
  const numeric = (key: string, fallback: number, min: number, max: number) => {
    const value = Number(input[key] ?? fallback);
    if (!Number.isInteger(value) || value < min || value > max) errors.push(key);
    return value;
  };
  const hours = numeric('AUTH_SESSION_HOURS', 8, 1, 24);
  const idle = numeric('AUTH_IDLE_MINUTES', 30, 1, 120);
  if (idle > hours*60) errors.push('AUTH_IDLE_MINUTES');
  const accountLimit = numeric('AUTH_LOGIN_ACCOUNT_LIMIT', 5, 1, 1000);
  const ipLimit = numeric('AUTH_LOGIN_IP_LIMIT', 30, 1, 10000);
  const proxyHops = numeric('TRUST_PROXY_HOPS', 0, 0, 1);
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
  const platformBase=String(input.PLATFORM_BASE_DOMAIN??'lamssa.localhost').toLowerCase();
  if(platformBase.length>190||!/^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(platformBase))errors.push('PLATFORM_BASE_DOMAIN');
  const hosts=typeof input.API_ALLOWED_HOSTS==='string'?input.API_ALLOWED_HOSTS.split(',').map(v=>v.trim().toLowerCase()).filter(Boolean):[String(host),...(mode==='production'?[]:['localhost']),...origins.flatMap(o=>{try{return[new URL(o).hostname];}catch{return[];}})];
  const validHost=(value:string)=>isIP(value.replace(/^\[|\]$/g,''))||/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(value)||
    (value===`*.${platformBase}`);
  if(!hosts.length||hosts.some(h=>!validHost(h)))errors.push('API_ALLOWED_HOSTS');
  const assetDir=input.ASSET_STORAGE_DIR===undefined?null:input.ASSET_STORAGE_DIR;
  if(assetDir!==null&&(typeof assetDir!=='string'||!isAbsolute(assetDir)||assetDir.includes('\0')))errors.push('ASSET_STORAGE_DIR');

  const mfaKey = typeof input.MFA_ENCRYPTION_KEY === 'string' ? input.MFA_ENCRYPTION_KEY : '';
  if (mode === 'production') {
    if (!mfaKey || mfaKey.length < 32 || !/^[A-Za-z0-9_-]{32,128}$/.test(mfaKey)) errors.push('MFA_ENCRYPTION_KEY');
  } else if (mfaKey && (mfaKey.length < 16 || !/^[A-Za-z0-9_-]{16,128}$/.test(mfaKey))) {
    errors.push('MFA_ENCRYPTION_KEY');
  }

  const mfaPrevKey = typeof input.MFA_ENCRYPTION_KEY_PREVIOUS === 'string' ? input.MFA_ENCRYPTION_KEY_PREVIOUS : '';
  if (mfaPrevKey && (mfaPrevKey.length < 16 || !/^[A-Za-z0-9_-]{16,128}$/.test(mfaPrevKey))) {
    errors.push('MFA_ENCRYPTION_KEY_PREVIOUS');
  }
  const metricsKey = typeof input.METRICS_SECRET_KEY === 'string' ? input.METRICS_SECRET_KEY : '';
  if (metricsKey && !/^[A-Za-z0-9_-]{43,128}$/.test(metricsKey)) errors.push('METRICS_SECRET_KEY');
  if (mode === 'production') {
    if (!metricsKey) errors.push('METRICS_SECRET_KEY');
    if (!assetDir) errors.push('ASSET_STORAGE_DIR');
    if (proxyHops !== 1) errors.push('TRUST_PROXY_HOPS');
    if (typeof input.API_ALLOWED_HOSTS !== 'string' || !input.API_ALLOWED_HOSTS.trim()) errors.push('API_ALLOWED_HOSTS');
  }

  // Report variable names only; never interpolate secrets or raw validation input.
  if (errors.length) throw new Error(`Invalid environment variables: ${[...new Set(errors)].join(', ')}`);
  return {
    NODE_ENV: mode as Environment['NODE_ENV'], API_HOST: host as string,
    API_PORT: port, CORS_ORIGINS: origins, DATABASE_URL: databaseUrl,
    AUTH_CSRF_SECRET: csrfKey, AUTH_SESSION_HOURS: hours, AUTH_IDLE_MINUTES: idle,
    AUTH_LOGIN_ACCOUNT_LIMIT: accountLimit, AUTH_LOGIN_IP_LIMIT: ipLimit, TRUST_PROXY_HOPS: proxyHops,
    PLATFORM_BASE_DOMAIN:platformBase,API_ALLOWED_HOSTS:[...new Set(hosts)],ASSET_STORAGE_DIR:assetDir as string|null,
    MFA_ENCRYPTION_KEY: mfaKey || undefined,
    MFA_ENCRYPTION_KEY_PREVIOUS: mfaPrevKey || undefined,
    METRICS_SECRET_KEY: metricsKey || undefined,
  };
}
