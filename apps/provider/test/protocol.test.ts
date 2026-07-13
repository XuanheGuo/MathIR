import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isJsonValue, parseExecuteRequest } from '../src/protocol.js';

function baseEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    protocolVersion: '0.2.0',
    invocationId: randomUUID(),
    capabilityId: 'mathir.validate-document',
    capabilityVersion: '0.1.0',
    traceId: 'trace-1',
    input: { document: {} },
    ...overrides,
  };
}

describe('isJsonValue', () => {
  it('accepts a plain object', () => {
    expect(isJsonValue({ a: 1, b: 'x', c: null, d: [1, 2, 3] })).toBe(true);
  });

  it('accepts a null-prototype dictionary as a valid JSON object', () => {
    const dict = Object.create(null);
    dict.a = 1;
    dict.b = { nested: true };
    expect(isJsonValue(dict)).toBe(true);
  });

  it('rejects a Date instance', () => {
    expect(isJsonValue(new Date())).toBe(false);
  });

  it('rejects a Map instance', () => {
    expect(isJsonValue(new Map())).toBe(false);
  });

  it('rejects a class instance', () => {
    class Point {
      x = 1;
      y = 2;
    }
    expect(isJsonValue(new Point())).toBe(false);
  });

  it('rejects a null-prototype dictionary containing a BigInt value', () => {
    const dict = Object.create(null);
    dict.big = 10n;
    expect(isJsonValue(dict)).toBe(false);
  });

  it('rejects a null-prototype dictionary containing an undefined value', () => {
    const dict = Object.create(null);
    dict.missing = undefined;
    expect(isJsonValue(dict)).toBe(false);
  });

  it('rejects a nested Date inside an otherwise-plain object', () => {
    expect(isJsonValue({ when: new Date() })).toBe(false);
  });
});

describe('parseExecuteRequest timeoutMs', () => {
  it('accepts a valid positive integer timeout', () => {
    const result = parseExecuteRequest(baseEnvelope({ timeoutMs: 5000 }));
    expect(result.ok).toBe(true);
  });

  it('accepts an envelope with no timeoutMs at all', () => {
    const result = parseExecuteRequest(baseEnvelope());
    expect(result.ok).toBe(true);
  });

  it.each([
    ['fractional', 1.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['zero', 0],
    ['negative', -1],
    ['numeric string', '5000'],
  ])('rejects timeoutMs = %s (%p)', (_label, value) => {
    const result = parseExecuteRequest(baseEnvelope({ timeoutMs: value }));
    expect(result.ok).toBe(false);
  });
});

describe('parseExecuteRequest traceId', () => {
  it('accepts a 128-character traceId', () => {
    const result = parseExecuteRequest(baseEnvelope({ traceId: 'a'.repeat(128) }));
    expect(result.ok).toBe(true);
  });

  it('rejects a 129-character traceId', () => {
    const result = parseExecuteRequest(baseEnvelope({ traceId: 'a'.repeat(129) }));
    expect(result.ok).toBe(false);
  });

  it('rejects an empty traceId', () => {
    const result = parseExecuteRequest(baseEnvelope({ traceId: '' }));
    expect(result.ok).toBe(false);
  });

  it('rejects a traceId with characters outside A-Za-z0-9._-', () => {
    const result = parseExecuteRequest(baseEnvelope({ traceId: 'trace id/with spaces' }));
    expect(result.ok).toBe(false);
  });

  it('accepts a traceId using every allowed character class', () => {
    const result = parseExecuteRequest(baseEnvelope({ traceId: 'Trace-ID_123.v2' }));
    expect(result.ok).toBe(true);
  });
});
