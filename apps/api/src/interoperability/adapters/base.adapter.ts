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

  /**
   * Validates endpoint URL against strict SSRF and network isolation rules:
   * - Strict HTTPS protocol enforcement.
   * - Rejection of embedded credentials (user:pass@host).
   * - Standard HTTPS port enforcement (reject non-standard ports).
   * - Blocking of private, loopback, link-local, and cloud-metadata IP literals (IPv4/IPv6).
   * - Strict certified domain allowlist matching.
   */
  public validateEndpointSecurity(url: string): URL {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`[${this.adapterName}] Invalid endpoint URL structure: ${url}`);
    }

    // 1. Enforce HTTPS strictly
    if (parsed.protocol !== 'https:') {
      throw new Error(`[${this.adapterName}] Insecure protocol '${parsed.protocol}'. Interoperability endpoints must strictly use 'https:'.`);
    }

    // 2. Reject embedded credentials
    if (parsed.username || parsed.password) {
      throw new Error(`[${this.adapterName}] Embedded credentials in endpoint URL are prohibited.`);
    }

    // 3. Port restrictions (default 443 or explicit 443 only)
    if (parsed.port && parsed.port !== '443') {
      throw new Error(`[${this.adapterName}] Non-standard port '${parsed.port}' is prohibited for healthcare endpoints.`);
    }

    const host = parsed.hostname.toLowerCase();

    // 4. Block local, loopback, and metadata hostnames
    const blockedHosts = [
      'localhost',
      'metadata.google.internal',
      'instance-data',
      'metadata',
      '169.254.169.254',
    ];
    if (blockedHosts.includes(host)) {
      throw new Error(`[${this.adapterName}] SSRF blocked: Target hostname '${host}' is prohibited.`);
    }

    // 5. Block raw IP literals (IPv4 and IPv6) to prevent SSRF against internal subnets
    const isIpv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(host);
    const isIpv6 = host.startsWith('[') || /^[0-9a-fA-F:]+$/.test(host);
    if (isIpv4 || isIpv6) {
      throw new Error(`[${this.adapterName}] SSRF blocked: Direct IP literal addressing ('${host}') is prohibited. Certified DNS domains required.`);
    }

    // 6. Strict Allowlist matching
    const isAllowed = this.allowedDomains.some(
      (domain) => host === domain || host.endsWith(`.${domain}`),
    );
    if (!isAllowed) {
      throw new Error(`[${this.adapterName}] Endpoint host '${host}' is not in the certified allowlist.`);
    }

    return parsed;
  }

  protected isUrlAllowlisted(url: string): boolean {
    try {
      this.validateEndpointSecurity(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Prepares safe fetch options:
   * - Enforces `redirect: 'error'` to prevent redirect-based SSRF.
   * - Attaches AbortSignal timeout.
   */
  protected getSecureRequestInit(custom?: RequestInit): RequestInit {
    return {
      ...custom,
      redirect: 'error', // Strict: do not follow redirects
      signal: AbortSignal.timeout(this.config.timeoutMs),
    };
  }

  protected validatePreconditions(): void {
    if (!this.config.enabled) {
      throw new Error(`[${this.adapterName}] Integration is disabled by default. Live external transmissions are prohibited without explicit administrative enablement.`);
    }

    // Comprehensive SSRF and allowlist check
    this.validateEndpointSecurity(this.config.endpointUrl);

    if (this.config.environment === 'production') {
      // In Phase 7 readiness verification, production activation is locked
      throw new Error(`[${this.adapterName}] Production mode is locked during Phase 7 Step 7.5 readiness verification.`);
    }
  }

  /**
   * Sanitizes logging context to ensure ZERO PATIENT PII / PHI is logged.
   */
  protected sanitizeLog(message: string, context?: Record<string, any>): string {
    const safeContext = { ...context };
    delete safeContext.patientName;
    delete safeContext.fullName;
    delete safeContext.nationalId;
    delete safeContext.phone;
    delete safeContext.email;
    delete safeContext.address;
    delete safeContext.dateOfBirth;
    delete safeContext.dob;
    delete safeContext.notes;
    delete safeContext.clinicalNotes;
    delete safeContext.medicalHistory;
    return `[${this.adapterName}][${this.config.environment}] ${message} ${JSON.stringify(safeContext)}`;
  }
}
