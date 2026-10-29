import test from 'node:test';
import assert from 'node:assert/strict';
import { redactSensitiveData, maskIpAddress, sanitizeHeadersForLogging } from '../src/observability/redact.js';
import { MetricsService } from '../src/observability/metrics.service.js';
import { ErrorTrackerService } from '../src/observability/error-tracker.service.js';
import { AlertingService } from '../src/observability/alerting.service.js';
import { StructuredLoggerService } from '../src/observability/structured-logger.service.js';
import { isPlatformOperator, validMonitoringCredential } from '../src/observability/operational-access.js';
import { requestId } from '../src/observability/request-id.js';

test('redactSensitiveData recursively masks secrets, credentials, tokens and sensitive health info', () => {
  const sensitivePayload = {
    user: {
      id: 'usr_123',
      email: 'doctor@lamssa.com',
      password: 'SuperSecretPassword123!',
      totpSecret: 'JBSWY3DPEHPK3PXP',
      recoveryCodes: ['code1', 'code2'],
    },
    auth: {
      token: 'jwt-token-value-here',
      authorization: 'Bearer secret-jwt-here',
      cookie: '__Host-session=session_token_12345',
    },
    payment: {
      cardNumber: '4111222233334444',
      cvv: '123',
      iban: 'SA0380000000608010167519',
    },
    patient: {
      nationalId: '1098765432',
      medicalHistory: 'Hypertension and allergy to penicillin',
      diagnosis: 'Acne vulgaris',
      notes: 'Consultation notes about skin peel',
    },
    operational: {
      statusCode: 200,
      path: '/api/v1/patients',
      method: 'POST',
      durationMs: 45,
    },
  };

  const redacted = redactSensitiveData(sensitivePayload) as Record<string, any>;

  // Sensitive items must be redacted
  assert.equal(redacted.user.password, '[REDACTED]');
  assert.equal(redacted.user.totpSecret, '[REDACTED]');
  assert.equal(redacted.user.recoveryCodes, '[REDACTED]');
  assert.equal(redacted.auth.token, '[REDACTED]');
  assert.equal(redacted.auth.authorization, '[REDACTED]');
  assert.equal(redacted.auth.cookie, '[REDACTED]');
  assert.equal(redacted.payment.cardNumber, '[REDACTED]');
  assert.equal(redacted.payment.cvv, '[REDACTED]');
  assert.equal(redacted.payment.iban, '[REDACTED]');
  assert.equal(redacted.patient.nationalId, '[REDACTED]');
  assert.equal(redacted.patient.medicalHistory, '[REDACTED]');
  assert.equal(redacted.patient.diagnosis, '[REDACTED]');
  assert.equal(redacted.patient.notes, '[REDACTED]');

  // Non-sensitive operational keys must be preserved
  assert.equal(redacted.operational.statusCode, 200);
  assert.equal(redacted.operational.path, '/api/v1/patients');
  assert.equal(redacted.operational.method, 'POST');
  assert.equal(redacted.operational.durationMs, 45);
  assert.equal(redacted.user.id, 'usr_123');
});

test('maskIpAddress truncates IPv4 to /24 and IPv6 to /64 for privacy preservation', () => {
  assert.equal(maskIpAddress('192.168.1.150'), '192.168.1.0/24');
  assert.equal(maskIpAddress('10.0.5.99'), '10.0.5.0/24');
  assert.equal(maskIpAddress('127.0.0.1'), '127.0.0.0/24');
  assert.equal(maskIpAddress('::1'), '127.0.0.0/24');
  assert.equal(maskIpAddress('::ffff:192.168.1.42'), '192.168.1.0/24');
  assert.equal(maskIpAddress('2001:0db8:85a3:0000:0000:8a2e:0370:7334'), '2001:0db8:85a3::/48');
  assert.equal(maskIpAddress(undefined), null);
  assert.equal(maskIpAddress(null), null);
});

test('sanitizeHeadersForLogging strips authorization, cookies, and sensitive api tokens', () => {
  const headers = {
    host: 'api.lamssa.com',
    'user-agent': 'Mozilla/5.0 Chrome/120',
    authorization: 'Bearer super-secret-jwt',
    cookie: '__Host-session=abc12345; __Host-csrf=xyz',
    'set-cookie': ['__Host-session=def56789; Path=/; Secure; HttpOnly'],
    'x-csrf-token': 'csrf-token-secret-data',
    'x-metrics-key': 'secret-prometheus-token',
    'x-request-id': 'req-12345',
    'x-correlation-id': 'corr-67890',
  };

  const sanitized = sanitizeHeadersForLogging(headers);
  assert.equal(sanitized.host, 'api.lamssa.com');
  assert.equal(sanitized['user-agent'], 'Mozilla/5.0 Chrome/120');
  assert.equal(sanitized['x-request-id'], 'req-12345');
  assert.equal(sanitized['x-correlation-id'], 'corr-67890');

  // Redacted headers
  assert.equal(sanitized.authorization, '[REDACTED_AUTHORIZATION]');
  assert.equal(sanitized.cookie, '[REDACTED_COOKIE]');
  assert.equal(sanitized['set-cookie'], '[REDACTED_SET_COOKIE]');
  assert.equal(sanitized['x-csrf-token'], '[REDACTED_CSRF_TOKEN]');
  assert.equal(sanitized['x-metrics-key'], '[REDACTED_HEADER]');
});

test('MetricsService accurately tracks request counts, status classes, latency percentiles, and failed logins', () => {
  const metrics = new MetricsService();

  // Record active request
  const endRequest = metrics.recordRequestStart();
  let snapshot = metrics.getSnapshot();
  assert.equal(snapshot.activeRequests, 1);
  endRequest();
  snapshot = metrics.getSnapshot();
  assert.equal(snapshot.activeRequests, 0);

  // Record varying latency requests
  for (let i = 1; i <= 100; i++) {
    metrics.recordRequest(200, i); // 1ms through 100ms
  }
  metrics.recordRequest(404, 50);
  metrics.recordRequest(500, 200);

  // Record failed logins
  metrics.recordFailedLogin();
  metrics.recordFailedLogin();

  snapshot = metrics.getSnapshot();
  assert.equal(snapshot.requestsTotal['2xx'], 100);
  assert.equal(snapshot.requestsTotal['4xx'], 1);
  assert.equal(snapshot.requestsTotal['5xx'], 1);
  assert.equal(snapshot.failedLoginsTotal, 2);

  // Latency percentiles for 1..100 + 50 + 200 (102 data points)
  assert.ok(snapshot.latency.p50 >= 45 && snapshot.latency.p50 <= 55, `p50 was ${snapshot.latency.p50}`);
  assert.ok(snapshot.latency.p95 >= 90 && snapshot.latency.p95 <= 105, `p95 was ${snapshot.latency.p95}`);
  assert.ok(snapshot.latency.p99 >= 95 && snapshot.latency.p99 <= 200, `p99 was ${snapshot.latency.p99}`);
  assert.equal(snapshot.latency.max, 200);

  // Check Prometheus exposition
  const prom = metrics.toPrometheusFormat();
  assert.ok(prom.includes('# TYPE lamssa_http_requests_total counter'));
  assert.ok(prom.includes('lamssa_http_requests_total{status_class="2xx"} 100'));
  assert.ok(prom.includes('lamssa_http_requests_total{status_class="5xx"} 1'));
  assert.ok(prom.includes('lamssa_auth_failed_logins_total 2'));
  assert.ok(prom.includes('lamssa_http_request_duration_ms{quantile="0.95"}'));
  assert.ok(prom.includes('lamssa_uptime_seconds'));
});

test('ErrorTrackerService produces deterministic fingerprints and aggregates duplicate errors', () => {
  const tracker = new ErrorTrackerService();

  // Capture two errors with dynamic IDs that should normalize to the same fingerprint
  const err1 = new Error('Record not found for patient id 7c9e6679-7425-40de-944b-e07fc1f90ae7');
  const err2 = new Error('Record not found for patient id 123e4567-e89b-12d3-a456-426614174000');

  tracker.captureException(err1, { method: 'GET', path: '/api/v1/patients/1' });
  tracker.captureException(err2, { method: 'GET', path: '/api/v1/patients/2' });

  const groups = tracker.getErrorGroups();
  assert.equal(groups.length, 1, 'Should group identical errors with parameterized IDs into one group');
  assert.equal(groups[0].occurrences, 2);
  assert.equal(groups[0].message, err1.message);
  assert.ok(groups[0].fingerprint.length === 64, 'Fingerprint should be a 64-char SHA-256 hex string');
});

test('AlertingService triggers alerts, respects 15-minute deduplication, and resolves when health returns', () => {
  const logger = new StructuredLoggerService();
  const metrics = new MetricsService();
  const alerting = new AlertingService(metrics, logger);

  // Initially healthy
  let active = alerting.evaluateRules();
  assert.equal(active.length, 0);

  // Simulate database down
  metrics.recordDatabaseHealth(false, 0);
  active = alerting.evaluateRules();
  assert.equal(active.length, 1);
  assert.equal(active[0].ruleId, 'DATABASE_DOWN');
  assert.equal(active[0].severity, 'critical');
  const triggeredAt = active[0].triggeredAt;

  // Immediate second evaluation: alert must deduplicate and NOT create a new alert entry
  active = alerting.evaluateRules();
  assert.equal(active.length, 1);
  assert.equal(active[0].triggeredAt, triggeredAt);

  // Recovery: simulate database back up
  metrics.recordDatabaseHealth(true, 4);
  active = alerting.evaluateRules();
  assert.equal(active.length, 0, 'Alert must be auto-resolved when health condition clears');

  // Trigger high 5xx rate
  for (let i = 0; i < 15; i++) {
    metrics.recordRequest(500, 10);
  }
  active = alerting.evaluateRules();
  const errorAlert = active.find((a) => a.ruleId === 'HIGH_5XX_ERROR_RATE');
  assert.ok(errorAlert, 'HIGH_5XX_ERROR_RATE should trigger after >= 10 5xx responses');
  assert.equal(errorAlert?.severity, 'critical');

  // Trigger brute force login alert
  for (let i = 0; i < 35; i++) {
    metrics.recordFailedLogin();
  }
  active = alerting.evaluateRules();
  const bruteAlert = active.find((a) => a.ruleId === 'AUTH_BRUTE_FORCE_SPIKE');
  assert.ok(bruteAlert, 'AUTH_BRUTE_FORCE_SPIKE should trigger after >= 30 failed logins');
  assert.equal(bruteAlert?.severity, 'warning');
});

test('global telemetry denies clinic administrators and accepts only platform operators', () => {
  const clinicAdmin = { status: 'ACTIVE', platformRole: null, memberships: [{ role: 'CLINIC_ADMIN', status: 'ACTIVE' }] } as any;
  const otherClinicOwner = { status: 'ACTIVE', platformRole: null, memberships: [{ role: 'CLINIC_OWNER', status: 'ACTIVE' }] } as any;
  const platformOperator = { status: 'ACTIVE', platformRole: 'PLATFORM_ADMIN', memberships: [] } as any;
  assert.equal(isPlatformOperator(clinicAdmin), false);
  assert.equal(isPlatformOperator(otherClinicOwner), false);
  assert.equal(isPlatformOperator(platformOperator), true);
  assert.equal(isPlatformOperator({ ...platformOperator, status: 'DISABLED' }), false);
});

test('monitoring service credential is scoped, bounded and compared without plaintext equality', () => {
  const key = 'A'.repeat(48);
  assert.equal(validMonitoringCredential(key, key), true);
  assert.equal(validMonitoringCredential('B'.repeat(48), key), false);
  assert.equal(validMonitoringCredential(undefined, key), false);
  assert.equal(validMonitoringCredential(key, undefined), false);
  assert.equal(validMonitoringCredential('A'.repeat(513), key), false);
});

test('request identifiers reject header injection and unbounded attacker-controlled values', () => {
  assert.equal(requestId('safe.req-1:trace'), 'safe.req-1:trace');
  assert.equal(requestId('line\r\ninjection', 'server-generated'), 'server-generated');
  assert.equal(requestId('x'.repeat(129), 'server-generated'), 'server-generated');
});
