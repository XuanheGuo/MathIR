import { DEFAULT_BODY_LIMIT_BYTES, DEFAULT_HOST, DEFAULT_PORT } from './constants.js';

/**
 * `Number.parseInt` accepts trailing garbage ("4110oops" -> 4110) and
 * exponential/fractional forms via coercion quirks. This requires the raw
 * string to be nothing but decimal digits before converting, so malformed
 * env values fail loudly at startup instead of silently picking a wrong
 * port or body limit.
 */
export function parseDecimalInteger(
  raw: string | undefined,
  fallback: number,
  name: string,
  minimum: number,
  maximum: number,
): number {
  if (raw === undefined || raw.length === 0) return fallback;
  if (!/^[0-9]+$/.test(raw)) {
    throw new Error(`invalid ${name}: ${raw}`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`invalid ${name}: ${raw}`);
  }
  return value;
}

export interface ProviderConfig {
  host: string;
  port: number;
  publicUrl: string | undefined;
  logLevel: string;
  bodyLimitBytes: number;
}

export function loadProviderConfig(env: Record<string, string | undefined>): ProviderConfig {
  return {
    host: env.MATHIR_PROVIDER_HOST ?? DEFAULT_HOST,
    // 0 is kept in range: tests and ad hoc local runs rely on the OS
    // assigning an ephemeral port.
    port: parseDecimalInteger(
      env.MATHIR_PROVIDER_PORT,
      DEFAULT_PORT,
      'MATHIR_PROVIDER_PORT',
      0,
      65535,
    ),
    publicUrl: env.MATHIR_PROVIDER_PUBLIC_URL,
    logLevel: env.LOG_LEVEL ?? 'info',
    bodyLimitBytes: parseDecimalInteger(
      env.BODY_LIMIT_BYTES,
      DEFAULT_BODY_LIMIT_BYTES,
      'BODY_LIMIT_BYTES',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
  };
}
