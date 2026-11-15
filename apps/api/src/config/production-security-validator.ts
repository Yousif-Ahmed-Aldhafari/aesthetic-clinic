import type { Environment } from './environment.js';

export class ProductionSecurityValidationError extends Error {
  constructor(public readonly violations: string[]) {
    super(`Production security validation failed: ${violations.join(', ')}`);
    this.name = 'ProductionSecurityValidationError';
  }
}

export function validateProductionSecurity(env: Environment): void {
  const violations: string[] = [];

  // In non-production, only check essential type and range bounds
  if (env.NODE_ENV !== 'production') {
    return;
  }

  // 1. Mandatory TLS on Database in Production
  try {
    const dbUrl = new URL(env.DATABASE_URL);
    const isLoopback = dbUrl.hostname === '127.0.0.1' || dbUrl.hostname === 'localhost';
    const sslMode = dbUrl.searchParams.get('sslmode') || dbUrl.searchParams.get('ssl');
    if (!isLoopback && sslMode !== 'require' && sslMode !== 'verify-full' && sslMode !== 'verify-ca' && sslMode !== 'true') {
      violations.push('DATABASE_URL_REQUIRES_TLS_ENCRYPTION');
    }
  } catch {
    violations.push('DATABASE_URL_MALFORMED');
  }

  // 2. Strict KMS Provider and Key Validation
  if (env.KMS_PROVIDER === 'synthetic') {
    violations.push('SYNTHETIC_KMS_FORBIDDEN_IN_PRODUCTION');
  } else if (env.KMS_PROVIDER === 'external') {
    if (!env.KMS_EXTERNAL_ENDPOINT) {
      violations.push('KMS_EXTERNAL_ENDPOINT_REQUIRED');
    } else {
      try {
        const endpointUrl = new URL(env.KMS_EXTERNAL_ENDPOINT);
        if (endpointUrl.protocol !== 'https:') {
          violations.push('KMS_EXTERNAL_ENDPOINT_MUST_BE_HTTPS');
        }
      } catch {
        violations.push('KMS_EXTERNAL_ENDPOINT_INVALID_URL');
      }
    }
    if (!env.KMS_EXTERNAL_KEY_ID) {
      violations.push('KMS_EXTERNAL_KEY_ID_REQUIRED');
    }
  } else if (env.KMS_PROVIDER === 'local') {
    // Local provider in production requires an explicit, strong master key (never dev fallback)
    if (!env.KMS_LOCAL_MASTER_KEY || env.KMS_LOCAL_MASTER_KEY.length < 32) {
      violations.push('KMS_LOCAL_MASTER_KEY_REQUIRES_MIN_32_CHARS_IN_PRODUCTION');
    } else if (
      env.KMS_LOCAL_MASTER_KEY.includes('dev-') ||
      env.KMS_LOCAL_MASTER_KEY.includes('test-') ||
      env.KMS_LOCAL_MASTER_KEY.includes('fallback')
    ) {
      violations.push('KMS_LOCAL_MASTER_KEY_USES_INSECURE_TEMPLATE');
    }
  }

  // 3. Reverse Proxy & Host Header Hardening
  if (env.TRUST_PROXY_HOPS !== 1) {
    violations.push('TRUST_PROXY_HOPS_MUST_BE_EXACTLY_ONE_BEHIND_REVERSE_PROXY');
  }

  if (env.API_ALLOWED_HOSTS.length === 0 || env.API_ALLOWED_HOSTS.includes('*')) {
    violations.push('API_ALLOWED_HOSTS_WILDCARD_OR_EMPTY_FORBIDDEN');
  }

  // 4. HTTPS CORS Origins Only
  for (const origin of env.CORS_ORIGINS) {
    try {
      const url = new URL(origin);
      if (url.protocol !== 'https:') {
        violations.push(`CORS_ORIGIN_MUST_BE_HTTPS_${origin}`);
      }
    } catch {
      violations.push(`CORS_ORIGIN_INVALID_${origin}`);
    }
  }

  // 5. Session Expiration Policies for Production Outpatient Platform
  if (env.AUTH_SESSION_HOURS > 12) {
    violations.push('AUTH_SESSION_HOURS_EXCEEDS_12_HOUR_MAXIMUM');
  }
  if (env.AUTH_IDLE_MINUTES > 60) {
    violations.push('AUTH_IDLE_MINUTES_EXCEEDS_60_MINUTE_MAXIMUM');
  }

  // 6. Mandatory Static Asset Storage Directory
  if (!env.ASSET_STORAGE_DIR || !env.ASSET_STORAGE_DIR.startsWith('/')) {
    violations.push('ASSET_STORAGE_DIR_MUST_BE_CONFIGURED_ABSOLUTE_PATH');
  }

  // 7. Mandatory Secret Strengths and Template Detection
  if (!env.MFA_ENCRYPTION_KEY || env.MFA_ENCRYPTION_KEY.length < 32) {
    violations.push('MFA_ENCRYPTION_KEY_MIN_32_CHARS_REQUIRED');
  }
  if (!env.CLINICAL_MEDIA_ENCRYPTION_KEY || env.CLINICAL_MEDIA_ENCRYPTION_KEY.length < 32) {
    violations.push('CLINICAL_MEDIA_ENCRYPTION_KEY_MIN_32_CHARS_REQUIRED');
  }
  if (!env.METRICS_SECRET_KEY || env.METRICS_SECRET_KEY.length < 43) {
    violations.push('METRICS_SECRET_KEY_MIN_43_CHARS_REQUIRED');
  }
  if (!env.AUTH_CSRF_SECRET || env.AUTH_CSRF_SECRET.length < 43) {
    violations.push('AUTH_CSRF_SECRET_MIN_43_CHARS_REQUIRED');
  }

  if (violations.length > 0) {
    throw new ProductionSecurityValidationError(violations);
  }
}
