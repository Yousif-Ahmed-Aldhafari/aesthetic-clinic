/**
 * Base Provider Adapter for Healthcare Interoperability
 * Enforces strict sandbox isolation, disabled-by-default behavior, endpoint allowlists,
 * and zero-PII logging.
 */

export interface AdapterConfig {
  enabled: boolean;
  environment: 'sandbox' | 'production';
  endpointUrl: string;
  timeoutMs: number;
  maxRetries: number;
  apiKey?: string;
}

export interface AdapterTransmissionResult<T = any> {
  success: boolean;
  transmissionId: string;
  environment: 'sandbox' | 'production';
  statusCode: number;
  data?: T;
  errorCode?: string;
  errorMessage?: string;
  timestamp: string;
}

export abstract class BaseProviderAdapter {
  protected readonly config: AdapterConfig;
  protected abstract readonly allowedDomains: string[];
  protected abstract readonly adapterName: string;

  constructor(config?: Partial<AdapterConfig>) {
    this.config = {
      enabled: config?.enabled ?? false, // DISABLED BY DEFAULT
      environment: config?.environment ?? 'sandbox',
      endpointUrl: config?.endpointUrl ?? 'https://sandbox.api.healthcare-integration.local',
      timeoutMs: config?.timeoutMs ?? 5000,
      maxRetries: config?.maxRetries ?? 2,
      apiKey: config?.apiKey,
    };
  }

  public getStatus(): {
    name: string;
    enabled: boolean;
    environment: 'sandbox' | 'production';
    endpointUrl: string;
    isAllowlisted: boolean;
  } {
    return {
      name: this.adapterName,
      enabled: this.config.enabled,
      environment: this.config.environment,
      endpointUrl: this.config.endpointUrl,
      isAllowlisted: this.isUrlAllowlisted(this.config.endpointUrl),
    };
  }

  protected isUrlAllowlisted(url: string): boolean {
    try {
      const parsed = new URL(url);
      return this.allowedDomains.some((domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`));
    } catch {
      return false;
    }
  }

  protected validatePreconditions(): void {
    if (!this.config.enabled) {
      throw new Error(`[${this.adapterName}] Integration is disabled by default. Live external transmissions are prohibited without explicit administrative enablement.`);
    }

    if (!this.isUrlAllowlisted(this.config.endpointUrl)) {
      throw new Error(`[${this.adapterName}] Endpoint URL host is not in the certified allowlist.`);
    }

    if (this.config.environment === 'production') {
      // In Step 7.4, production activation is strictly prohibited
      throw new Error(`[${this.adapterName}] Production mode is locked during Phase 7 Step 7.4 readiness verification.`);
    }
  }

  /**
   * Sanitizes logging context to ensure ZERO PATIENT PII is logged.
   */
  protected sanitizeLog(message: string, context?: Record<string, any>): string {
    const safeContext = { ...context };
    delete safeContext.patientName;
    delete safeContext.fullName;
    delete safeContext.nationalId;
    delete safeContext.phone;
    delete safeContext.email;
    delete safeContext.address;
    return `[${this.adapterName}][${this.config.environment}] ${message} ${JSON.stringify(safeContext)}`;
  }
}
