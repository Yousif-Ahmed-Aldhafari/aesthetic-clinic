import { randomUUID } from 'node:crypto';

const SAFE_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function requestId(value: unknown, fallback?: string): string {
  return typeof value === 'string' && SAFE_REQUEST_ID.test(value) ? value : (fallback ?? randomUUID());
}
