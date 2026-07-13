import { describe, expect, it } from 'vitest';
import { loadProviderConfig, parseDecimalInteger } from '../src/config.js';

describe('parseDecimalInteger', () => {
  it('returns the fallback when unset or empty', () => {
    expect(parseDecimalInteger(undefined, 42, 'X', 0, 100)).toBe(42);
    expect(parseDecimalInteger('', 42, 'X', 0, 100)).toBe(42);
  });

  it('parses a plain decimal string within range', () => {
    expect(parseDecimalInteger('4110', 0, 'X', 0, 65535)).toBe(4110);
    expect(parseDecimalInteger('0', 42, 'X', 0, 65535)).toBe(0);
  });

  it.each([
    ['trailing garbage', '4110oops'],
    ['fractional', '1.5'],
    ['exponential', '1e3'],
    ['leading whitespace', ' 4110'],
    ['trailing whitespace', '4110 '],
    ['negative', '-1'],
    ['plus sign', '+4110'],
    ['hex-looking', '0x10'],
    ['empty after trim', ' '],
  ])('rejects %s (%j)', (_label, raw) => {
    expect(() => parseDecimalInteger(raw, 0, 'X', 0, 65535)).toThrow(/invalid X/);
  });

  it('rejects values outside the given range', () => {
    expect(() => parseDecimalInteger('65536', 0, 'PORT', 0, 65535)).toThrow(/invalid PORT/);
    expect(() =>
      parseDecimalInteger('99999999999999999999', 0, 'X', 0, Number.MAX_SAFE_INTEGER),
    ).toThrow(/invalid X/);
  });

  it('keeps 0 in range for port-style minimums', () => {
    expect(parseDecimalInteger('0', 4110, 'MATHIR_PROVIDER_PORT', 0, 65535)).toBe(0);
  });
});

describe('loadProviderConfig', () => {
  it('applies defaults when nothing is set', () => {
    const config = loadProviderConfig({});
    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(4110);
    expect(config.publicUrl).toBeUndefined();
    expect(config.logLevel).toBe('info');
    expect(config.bodyLimitBytes).toBe(1024 * 1024);
  });

  it('reads all values from the environment', () => {
    const config = loadProviderConfig({
      MATHIR_PROVIDER_HOST: '0.0.0.0',
      MATHIR_PROVIDER_PORT: '4111',
      MATHIR_PROVIDER_PUBLIC_URL: 'http://example.test:4111',
      LOG_LEVEL: 'warn',
      BODY_LIMIT_BYTES: '2048',
    });
    expect(config).toEqual({
      host: '0.0.0.0',
      port: 4111,
      publicUrl: 'http://example.test:4111',
      logLevel: 'warn',
      bodyLimitBytes: 2048,
    });
  });

  it('throws with the offending value for a malformed MATHIR_PROVIDER_PORT', () => {
    expect(() => loadProviderConfig({ MATHIR_PROVIDER_PORT: '4110oops' })).toThrow(
      /invalid MATHIR_PROVIDER_PORT: 4110oops/,
    );
  });

  it('throws for a malformed BODY_LIMIT_BYTES', () => {
    expect(() => loadProviderConfig({ BODY_LIMIT_BYTES: '1.5' })).toThrow(
      /invalid BODY_LIMIT_BYTES: 1\.5/,
    );
  });
});
