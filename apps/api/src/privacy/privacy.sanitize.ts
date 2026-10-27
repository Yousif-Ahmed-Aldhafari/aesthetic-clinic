/**
 * Formula Injection Protection (CSV / Spreadsheet Injection)
 * Neutralizes any cell beginning with dangerous formula characters (=, +, -, @, |, %)
 * or leading whitespace / control characters followed by formula triggers by prefixing with an apostrophe.
 */
export function sanitizeFormulaField(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  // Match formula triggers even with leading whitespace or ASCII control characters
  if (/^[\s\u0000-\u001f]*[=+\-@|%]/.test(str) || /^[\t\r\n]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

export function sanitizeObjectForExport<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = sanitizeFormulaField(value);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        typeof item === 'object' && item !== null
          ? sanitizeObjectForExport(item as Record<string, unknown>)
          : typeof item === 'string'
            ? sanitizeFormulaField(item)
            : item,
      );
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeObjectForExport(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

