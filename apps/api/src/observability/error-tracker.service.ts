import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { ErrorGroupRecord } from './observability.types.js';
import { redactSensitiveData } from './redact.js';

export interface ErrorReportingProvider {
  name: string;
  captureException(exception: unknown, context?: Record<string, unknown>): Promise<void>;
}

@Injectable()
export class ErrorTrackerService {
  private readonly errorGroups = new Map<string, ErrorGroupRecord>();
  private readonly maxGroups = 100;
  private readonly externalProviders: ErrorReportingProvider[] = [];

  registerProvider(provider: ErrorReportingProvider): void {
    this.externalProviders.push(provider);
  }

  /**
   * Generates a deterministic SHA-256 fingerprint for error grouping.
   * Strips dynamic parameters (UUIDs, dates, numbers) to avoid fragmented grouping.
   */
  generateFingerprint(code: string, message: string): string {
    const normalizedMessage = message
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?/gi, '<TIMESTAMP>')
      .replace(/\+?[0-9]{8,15}/g, '<PHONE>')
      .replace(/\b\d+\b/g, '<NUM>')
      .trim();

    return createHash('sha256')
      .update(`${code}:${normalizedMessage}`)
      .digest('hex');
  }

  captureException(
    exception: unknown,
    context?: {
      code?: string;
      message?: string;
      path?: string;
      method?: string;
      requestId?: string;
      clinicId?: string;
      metadata?: Record<string, unknown>;
    },
  ): string {
    const code = context?.code ?? (exception instanceof Error ? exception.name : 'UNKNOWN_ERROR');
    const rawMessage = context?.message ?? (exception instanceof Error ? exception.message : String(exception));
    const fingerprint = this.generateFingerprint(code, rawMessage);
    const now = new Date().toISOString();

    const existing = this.errorGroups.get(fingerprint);
    if (existing) {
      existing.occurrences++;
      existing.lastSeenAt = now;
      if (context?.path) existing.samplePath = context.path;
    } else {
      if (this.errorGroups.size >= this.maxGroups) {
        // Evict oldest group
        const oldestKey = Array.from(this.errorGroups.keys())[0];
        this.errorGroups.delete(oldestKey);
      }

      this.errorGroups.set(fingerprint, {
        fingerprint,
        code,
        message: rawMessage.slice(0, 300),
        firstSeenAt: now,
        lastSeenAt: now,
        occurrences: 1,
        samplePath: context?.path,
      });
    }

    // Forward to any registered external error reporting providers with redacted context
    if (this.externalProviders.length > 0) {
      const sanitizedContext = redactSensitiveData(context) as Record<string, unknown>;
      for (const provider of this.externalProviders) {
        provider.captureException(exception, sanitizedContext).catch(() => {});
      }
    }

    return fingerprint;
  }

  getErrorGroups(): ErrorGroupRecord[] {
    return Array.from(this.errorGroups.values()).sort(
      (a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime(),
    );
  }
}
