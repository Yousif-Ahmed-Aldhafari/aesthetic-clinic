import { Injectable, LoggerService } from '@nestjs/common';
import type { LogLevel, StructuredLogEntry } from './observability.types.js';
import { maskIpAddress, redactSensitiveData } from './redact.js';

@Injectable()
export class StructuredLoggerService implements LoggerService {
  private readonly buffer: StructuredLogEntry[] = [];
  private readonly maxBufferSize = 200;

  log(message: string, context?: Record<string, unknown>): void {
    this.writeEntry('info', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.writeEntry('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.writeEntry('warn', message, context);
  }

  error(message: string, traceOrContext?: string | Record<string, unknown>, context?: Record<string, unknown>): void {
    if (typeof traceOrContext === 'string') {
      const errorMeta = { ...(context ?? {}), stack: traceOrContext };
      this.writeEntry('error', message, errorMeta);
    } else {
      this.writeEntry('error', message, traceOrContext ?? context);
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.writeEntry('debug', message, context);
  }

  http(entry: Omit<StructuredLogEntry, 'timestamp' | 'level'> & { level?: LogLevel }): void {
    const level: LogLevel = entry.level ?? (entry.statusCode && entry.statusCode >= 500 ? 'error' : entry.statusCode && entry.statusCode >= 400 ? 'warn' : 'info');
    const fullEntry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: entry.message,
      requestId: entry.requestId,
      correlationId: entry.correlationId ?? null,
      method: entry.method,
      path: entry.path,
      statusCode: entry.statusCode,
      durationMs: entry.durationMs,
      clinicId: entry.clinicId ?? null,
      userId: entry.userId ?? null,
      ip: maskIpAddress(entry.ip),
      error: entry.error,
      metadata: redactSensitiveData(entry.metadata) as Record<string, unknown> | undefined,
    };

    this.pushToBuffer(fullEntry);
    this.output(fullEntry);
  }

  private writeEntry(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    const entry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      requestId: (context?.requestId as string) || 'system',
      correlationId: (context?.correlationId as string) || null,
      clinicId: (context?.clinicId as string) || null,
      userId: (context?.userId as string) || null,
      metadata: redactSensitiveData(context) as Record<string, unknown> | undefined,
    };

    this.pushToBuffer(entry);
    this.output(entry);
  }

  private pushToBuffer(entry: StructuredLogEntry): void {
    this.buffer.push(entry);
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }
  }

  private output(entry: StructuredLogEntry): void {
    const jsonStr = JSON.stringify(entry);
    if (entry.level === 'error') {
      process.stderr.write(`${jsonStr}\n`);
    } else {
      process.stdout.write(`${jsonStr}\n`);
    }
  }

  /**
   * Diagnostic log retrieval for authorized platform administrators.
   * Returns recent scrubbed log entries.
   */
  getRecentLogs(limit = 50): StructuredLogEntry[] {
    const count = Math.min(limit, this.buffer.length);
    return this.buffer.slice(-count);
  }
}
