import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as capabilityModule from '../src/capability.js';
import {
  CAPABILITY_ID,
  CAPABILITY_VERSION,
  EXECUTE_PATH,
  HEALTH_PATH,
  MANIFEST_PATH,
  MATHERIUM_PROTOCOL_VERSION,
  SERVICE_ID,
  SERVICE_VERSION,
} from '../src/constants.js';
import { buildServer, formatBoundBaseUrl } from '../src/server.js';

const BASE_URL = 'http://127.0.0.1:4110';

function validExecuteBody(overrides: Record<string, unknown> = {}) {
  return {
    protocolVersion: MATHERIUM_PROTOCOL_VERSION,
    invocationId: randomUUID(),
    capabilityId: CAPABILITY_ID,
    capabilityVersion: CAPABILITY_VERSION,
    traceId: 'test-trace-1',
    input: {
      document: {
        mathirVersion: '0.1.0',
        documentId: 'minimal',
        kind: 'problem',
        declarations: [],
        expressions: [],
        statements: [],
        steps: [],
        assumptions: [],
        goals: [],
      },
    },
    ...overrides,
  };
}

describe('provider HTTP server', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildServer({ logger: false, publicUrl: BASE_URL });
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /health reports service identity', async () => {
    const response = await app.inject({ method: 'GET', url: HEALTH_PATH });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      serviceId: SERVICE_ID,
      version: SERVICE_VERSION,
    });
  });

  it('GET the manifest at the well-known path', async () => {
    const response = await app.inject({ method: 'GET', url: MANIFEST_PATH });
    expect(response.statusCode).toBe(200);
    const manifest = response.json();
    expect(manifest.protocolVersion).toBe('0.2.0');
    expect(manifest.serviceId).toBe('mathir-validator');
    expect(manifest.baseUrl).toBe(BASE_URL);
    expect(
      manifest.capabilities.map((capability: { capabilityId: string }) => capability.capabilityId),
    ).toEqual([
      'mathir.check-polynomial-equivalence',
      'mathir.check-rational-function-equivalence',
      'mathir.normalize-polynomial',
      'mathir.normalize-rational-function',
      'mathir.validate-document',
      'mathir.verify-algebraic-step',
    ]);
  });

  it('executes a valid MathIR document and echoes the invocationId exactly', async () => {
    const body = validExecuteBody();
    const response = await app.inject({ method: 'POST', url: EXECUTE_PATH, payload: body });
    expect(response.statusCode).toBe(200);
    const parsed = response.json();
    expect(parsed).toEqual({
      protocolVersion: '0.2.0',
      invocationId: body.invocationId,
      status: 'succeeded',
      output: {
        valid: true,
        documentId: 'minimal',
        declaredMathirVersion: '0.1.0',
        diagnostics: [],
        totalDiagnostics: 0,
        diagnosticsTruncated: false,
      },
    });
  });

  it('treats an invalid MathIR document as a successful invocation', async () => {
    const body = validExecuteBody({
      input: {
        document: {
          mathirVersion: '0.1.0',
          documentId: 'bad-expression-ref',
          kind: 'problem',
          declarations: [],
          expressions: [{ id: 'neg', kind: 'unary', operator: 'negate', operand: 'missing' }],
          statements: [],
          steps: [],
          assumptions: [],
          goals: [],
        },
      },
    });
    const response = await app.inject({ method: 'POST', url: EXECUTE_PATH, payload: body });
    expect(response.statusCode).toBe(200);
    const parsed = response.json();
    expect(parsed.status).toBe('succeeded');
    expect(parsed.output.valid).toBe(false);
    expect(parsed.output.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'UNKNOWN_EXPRESSION_REFERENCE' }),
    );
  });

  it.each(['add', 'multiply'])(
    'preserves the validation capability contract for empty %s',
    async (operator) => {
      const body = validExecuteBody({
        input: {
          document: {
            mathirVersion: '0.1.0',
            documentId: `empty-${operator}`,
            kind: 'problem',
            declarations: [],
            expressions: [{ id: 'target', kind: 'nary', operator, operands: [] }],
            statements: [],
            steps: [],
            assumptions: [],
            goals: [],
          },
        },
      });
      const response = await app.inject({ method: 'POST', url: EXECUTE_PATH, payload: body });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        invocationId: body.invocationId,
        status: 'succeeded',
        output: {
          valid: false,
          diagnostics: [
            {
              code: 'INVALID_OPERATOR_ARITY',
              message: `${operator} requires at least two operands`,
            },
          ],
        },
      });
    },
  );

  it('rejects an invalid execute envelope with 400 INVALID_REQUEST', async () => {
    const response = await app.inject({ method: 'POST', url: EXECUTE_PATH, payload: {} });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_REQUEST' } });
  });

  it('rejects a GUID-shaped but semantically invalid invocationId with 400 INVALID_REQUEST', async () => {
    const response = await app.inject({
      method: 'POST',
      url: EXECUTE_PATH,
      // Right shape (8-4-4-4-12 hex), wrong version/variant nibbles for RFC
      // 9562/4122 — Matherium's z.uuid() (and now this provider) reject it.
      payload: validExecuteBody({ invocationId: '12345678-1234-0000-0000-123456789abc' }),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_REQUEST' } });
  });

  it('rejects an unsupported protocol version with 400 INVALID_REQUEST', async () => {
    const response = await app.inject({
      method: 'POST',
      url: EXECUTE_PATH,
      payload: validExecuteBody({ protocolVersion: '0.1.0' }),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_REQUEST' } });
  });

  it('rejects an unknown capability id with 404 UNKNOWN_CAPABILITY', async () => {
    const response = await app.inject({
      method: 'POST',
      url: EXECUTE_PATH,
      payload: validExecuteBody({ capabilityId: 'mathir.does-not-exist' }),
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'UNKNOWN_CAPABILITY' } });
  });

  it('rejects a wrong capability version with 404 UNKNOWN_CAPABILITY', async () => {
    const response = await app.inject({
      method: 'POST',
      url: EXECUTE_PATH,
      payload: validExecuteBody({ capabilityVersion: '9.9.9' }),
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'UNKNOWN_CAPABILITY' } });
  });

  it('rejects an input wrapper that violates the capability input contract with 422', async () => {
    const response = await app.inject({
      method: 'POST',
      url: EXECUTE_PATH,
      payload: validExecuteBody({ input: { document: {}, extraField: true } }),
    });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ error: { code: 'SCHEMA_VALIDATION_FAILED' } });
  });

  it('rejects malformed JSON with 400 and no stack leakage', async () => {
    const response = await app.inject({
      method: 'POST',
      url: EXECUTE_PATH,
      payload: '{ this is not json',
      headers: { 'content-type': 'application/json' },
    });
    expect(response.statusCode).toBe(400);
    const parsed = response.json();
    expect(parsed.error.code).toBe('INVALID_REQUEST');
    expect(response.body).not.toMatch(/at .*\.(js|ts):\d+/);
  });

  it('never returns extra keys on the error envelope (no accidental detail leakage)', async () => {
    const response = await app.inject({ method: 'POST', url: EXECUTE_PATH, payload: {} });
    const parsed = response.json();
    expect(Object.keys(parsed)).toEqual(['error']);
    expect(Object.keys(parsed.error).sort()).toEqual(['code', 'message']);
  });

  it('rejects a fractional timeoutMs with 400 INVALID_REQUEST', async () => {
    const response = await app.inject({
      method: 'POST',
      url: EXECUTE_PATH,
      payload: validExecuteBody({ timeoutMs: 1500.5 }),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_REQUEST' } });
  });

  it('accepts a valid integer timeoutMs', async () => {
    const response = await app.inject({
      method: 'POST',
      url: EXECUTE_PATH,
      payload: validExecuteBody({ timeoutMs: 5000 }),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('succeeded');
  });

  it('accepts a 128-character traceId', async () => {
    const response = await app.inject({
      method: 'POST',
      url: EXECUTE_PATH,
      payload: validExecuteBody({ traceId: 'a'.repeat(128) }),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('succeeded');
  });

  it('rejects a 129-character traceId with 400 INVALID_REQUEST', async () => {
    const response = await app.inject({
      method: 'POST',
      url: EXECUTE_PATH,
      payload: validExecuteBody({ traceId: 'a'.repeat(129) }),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_REQUEST' } });
  });
});

describe('provider HTTP server body limit', () => {
  it('rejects an oversized body with INVALID_REQUEST', async () => {
    const app = buildServer({ logger: false, publicUrl: BASE_URL, bodyLimitBytes: 128 });
    try {
      const oversized = validExecuteBody({ traceId: 'x'.repeat(1000) });
      const response = await app.inject({ method: 'POST', url: EXECUTE_PATH, payload: oversized });
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      expect(response.statusCode).toBeLessThan(500);
      expect(response.json()).toMatchObject({ error: { code: 'INVALID_REQUEST' } });
    } finally {
      await app.close();
    }
  });
});

describe('provider HTTP server manifest baseUrl resolution', () => {
  it('derives the base URL from the bound address when no publicUrl is configured', async () => {
    const app = buildServer({ logger: false });
    try {
      await app.listen({ host: '127.0.0.1', port: 0 });
      const response = await app.inject({ method: 'GET', url: MANIFEST_PATH });
      const manifest = response.json();
      expect(manifest.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    } finally {
      await app.close();
    }
  });
});

describe('formatBoundBaseUrl', () => {
  // Pure-function tests: whether the CI runner's kernel/network stack
  // actually supports binding an IPv6 socket must not decide pass/fail.
  it('formats an IPv4 address without brackets', () => {
    expect(formatBoundBaseUrl({ address: '127.0.0.1', port: 4110, family: 'IPv4' })).toBe(
      'http://127.0.0.1:4110',
    );
  });

  it('brackets an IPv6 loopback address', () => {
    expect(formatBoundBaseUrl({ address: '::1', port: 4110, family: 'IPv6' })).toBe(
      'http://[::1]:4110',
    );
  });

  it('brackets an IPv6 wildcard address', () => {
    expect(formatBoundBaseUrl({ address: '::', port: 4110, family: 'IPv6' })).toBe(
      'http://[::]:4110',
    );
  });

  it('brackets a colon-containing address even if family is misreported', () => {
    expect(formatBoundBaseUrl({ address: 'fe80::1', port: 4110, family: 'IPv4' })).toBe(
      'http://[fe80::1]:4110',
    );
  });
});

describe('provider HTTP server internal error handling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sanitizes an internal exception into a 200 ExecuteFailure without leaking details', async () => {
    // Manifest example generation already ran executeValidateDocument once at
    // module load time; spying (rather than re-mocking the module graph) only
    // affects the call server.ts makes while handling this request.
    vi.spyOn(capabilityModule, 'executeValidateDocument').mockImplementation(() => {
      throw new Error('sensitive internal detail: /etc/secret-config.json');
    });
    const app = buildServer({ logger: false, publicUrl: BASE_URL });
    try {
      const body = validExecuteBody();
      const response = await app.inject({ method: 'POST', url: EXECUTE_PATH, payload: body });
      expect(response.statusCode).toBe(200);
      const parsed = response.json();
      expect(parsed).toEqual({
        protocolVersion: '0.2.0',
        invocationId: body.invocationId,
        status: 'failed',
        error: { code: 'INTERNAL_ERROR', message: 'internal error', retryable: false },
      });
      expect(response.body).not.toContain('sensitive internal detail');
      expect(response.body).not.toContain('secret-config');
    } finally {
      await app.close();
    }
  });
});
