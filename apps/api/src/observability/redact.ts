const SENSITIVE_KEY_REGEX =
  /(password|token|secret|cookie|credential|card|cvv|pan|iban|authorization|csrf|medical|diagnosis|clinical|symptom|prescription|treatment|nationalid|passport|totp|recoverycode|base32secret|encryptionkey|notes|history)/i;

/**
 * Mask IP address for privacy compliance (IPv4 /24, IPv6 /48).
 */
export function maskIpAddress(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const clean = ip.trim();

  // Localhost IPv6
  if (clean === '::1') {
    return '127.0.0.0/24';
  }

  // IPv4 or IPv4-mapped IPv6 (::ffff:192.0.2.1)
  const ipv4Match = clean.match(/(?:(?:::ffff:)?)((\d{1,3}\.){3})\d{1,3}/);
  if (ipv4Match) {
    return `${ipv4Match[1]}0/24`;
  }

  // IPv6
  if (clean.includes(':')) {
    const parts = clean.split(':').filter(Boolean);
    if (parts.length >= 3) {
      return `${parts.slice(0, 3).join(':')}::/48`;
    }
    return 'xxxx::/48';
  }

  return 'masked-ip';
}

/**
 * Recursively scrubs sensitive credentials, tokens, PII, and medical details from log data.
 */
export function redactSensitiveData(input: unknown, depth = 0): unknown {
  if (depth > 5) return '[TRUNCATED_DEPTH]';
  if (input === null || input === undefined) return input;

  if (typeof input === 'string') {
    // Truncate excessively long strings
    if (input.length > 2000) {
      return `${input.slice(0, 2000)}...[TRUNCATED_${input.length - 2000}_BYTES]`;
    }
    return input;
  }

  if (typeof input === 'number' || typeof input === 'boolean') {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => redactSensitiveData(item, depth + 1));
  }

  if (typeof input === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (SENSITIVE_KEY_REGEX.test(key)) {
        cleaned[key] = '[REDACTED]';
      } else {
        cleaned[key] = redactSensitiveData(value, depth + 1);
      }
    }
    return cleaned;
  }

  return String(input);
}

/**
 * Sanitize HTTP headers for safe logging.
 */
export function sanitizeHeadersForLogging(headers: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!headers) return {};
  const safe: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(headers)) {
    const lkey = key.toLowerCase();
    if (lkey === 'authorization') {
      safe[key] = '[REDACTED_AUTHORIZATION]';
    } else if (lkey === 'cookie') {
      safe[key] = '[REDACTED_COOKIE]';
    } else if (lkey === 'set-cookie') {
      safe[key] = '[REDACTED_SET_COOKIE]';
    } else if (lkey === 'x-csrf-token') {
      safe[key] = '[REDACTED_CSRF_TOKEN]';
    } else if (lkey === 'x-mfa-token' || lkey.includes('secret') || lkey.includes('key')) {
      safe[key] = '[REDACTED_HEADER]';
    } else if (typeof val === 'string') {
      safe[key] = val.slice(0, 200);
    } else {
      safe[key] = val;
    }
  }
  return safe;
}
