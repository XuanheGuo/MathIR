/**
 * Minimal Matherium Protocol 0.2.0 wire-contract adapter.
 *
 * This module intentionally re-declares only the subset of the Matherium wire
 * format this Provider needs. It does not depend on any `@matherium/*`
 * package: the Provider must install and run independently of the Matherium
 * monorepo. Field names, patterns, and the stable error-code subset below
 * were verified against the Matherium source at the pinned conformance SHA
 * (see docs/integration/MATHERIUM_E2E.md) and are re-checked on every CI run
 * by the external Matherium Conformance Suite.
 */
import { MATHERIUM_PROTOCOL_VERSION } from './constants.js';

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true;
  const type = typeof value;
  if (type === 'string' || type === 'boolean') return true;
  if (type === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (type === 'object') {
    // Object.create(null) dictionaries are valid JSON-shaped data too; only
    // reject values with a non-plain prototype (Date, Map, class instances).
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    return Object.values(value as Record<string, unknown>).every(isJsonValue);
  }
  return false;
}

/**
 * Round-trips a value through JSON so it both satisfies the JsonValue type
 * (optional-property `undefined` is dropped, matching actual wire behavior)
 * and reflects exactly what Fastify will serialize onto the wire.
 */
export function toJsonValue(value: unknown): JsonValue {
  if (value === undefined) throw new Error('cannot convert undefined to a JSON value');
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

// Matches the RFC 9562/4122 UUID semantics used by Matherium's z.uuid(),
// including nil and max UUIDs.
const UUID_PATTERN =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/i;
const TRACE_ID_PATTERN = /^[A-Za-z0-9._-]+$/;
const TRACE_ID_MAX_LENGTH = 128;

export interface ExecuteRequest {
  protocolVersion: string;
  invocationId: string;
  capabilityId: string;
  capabilityVersion: string;
  input: JsonValue;
  traceId: string;
  timeoutMs?: number;
}

export interface ParsedExecuteRequestSuccess {
  ok: true;
  request: ExecuteRequest;
}
export interface ParsedExecuteRequestFailure {
  ok: false;
  message: string;
}
export type ParsedExecuteRequestResult = ParsedExecuteRequestSuccess | ParsedExecuteRequestFailure;

/**
 * Structural validation of the execute envelope only. Unknown top-level
 * fields are ignored (not rejected): the real ExecuteRequest schema is not
 * `.strict()`, so a forward-compatible Hub may send fields this Provider
 * does not know about yet.
 */
export function parseExecuteRequest(raw: unknown): ParsedExecuteRequestResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, message: 'execute request body must be a JSON object' };
  }
  const body = raw as Record<string, unknown>;
  if (typeof body.protocolVersion !== 'string' || body.protocolVersion.length === 0) {
    return { ok: false, message: 'protocolVersion must be a non-empty string' };
  }
  if (typeof body.invocationId !== 'string' || !UUID_PATTERN.test(body.invocationId)) {
    return { ok: false, message: 'invocationId must be a UUID string' };
  }
  if (typeof body.capabilityId !== 'string' || body.capabilityId.length === 0) {
    return { ok: false, message: 'capabilityId must be a non-empty string' };
  }
  if (typeof body.capabilityVersion !== 'string' || body.capabilityVersion.length === 0) {
    return { ok: false, message: 'capabilityVersion must be a non-empty string' };
  }
  if (!('input' in body) || !isJsonValue(body.input)) {
    return { ok: false, message: 'input must be present and a JSON value' };
  }
  if (
    typeof body.traceId !== 'string' ||
    body.traceId.length === 0 ||
    body.traceId.length > TRACE_ID_MAX_LENGTH ||
    !TRACE_ID_PATTERN.test(body.traceId)
  ) {
    return {
      ok: false,
      message: `traceId must be a 1-${TRACE_ID_MAX_LENGTH} character token string`,
    };
  }
  if (
    body.timeoutMs !== undefined &&
    (typeof body.timeoutMs !== 'number' || !Number.isInteger(body.timeoutMs) || body.timeoutMs < 1)
  ) {
    return { ok: false, message: 'timeoutMs must be a finite integer >= 1 when present' };
  }
  const request: ExecuteRequest = {
    protocolVersion: body.protocolVersion,
    invocationId: body.invocationId,
    capabilityId: body.capabilityId,
    capabilityVersion: body.capabilityVersion,
    input: body.input,
    traceId: body.traceId,
  };
  if (body.timeoutMs !== undefined) request.timeoutMs = body.timeoutMs;
  return { ok: true, request };
}

/**
 * Error codes this Provider is allowed to emit. This is a deliberate subset
 * of the full Matherium 0.2.0 stable error-code set (which also includes
 * Hub-only codes such as UNAUTHORIZED, PROVIDER_TIMEOUT, INVOCATION_CONFLICT
 * that a Provider never originates).
 */
export const PROVIDER_ERROR_CODES = [
  'INVALID_REQUEST',
  'UNKNOWN_CAPABILITY',
  'SCHEMA_VALIDATION_FAILED',
  'INTERNAL_ERROR',
] as const;
export type ProviderErrorCode = (typeof PROVIDER_ERROR_CODES)[number];

export const PROVIDER_ERROR_STATUS: Record<ProviderErrorCode, number> = {
  INVALID_REQUEST: 400,
  UNKNOWN_CAPABILITY: 404,
  SCHEMA_VALIDATION_FAILED: 422,
  INTERNAL_ERROR: 500,
};

export interface ProtocolError {
  code: ProviderErrorCode;
  message: string;
  details?: JsonValue;
  retryable?: boolean;
}

/** Envelope used for non-2xx protocol-level rejections. */
export interface ErrorEnvelope {
  error: ProtocolError;
  traceId?: string;
}

export interface ExecuteSuccess {
  protocolVersion: typeof MATHERIUM_PROTOCOL_VERSION;
  invocationId: string;
  status: 'succeeded';
  output: JsonValue;
}

export interface ExecuteFailure {
  protocolVersion: typeof MATHERIUM_PROTOCOL_VERSION;
  invocationId: string;
  status: 'failed';
  error: ProtocolError;
}

export type ExecuteResponse = ExecuteSuccess | ExecuteFailure;

export function buildExecuteSuccess(invocationId: string, output: JsonValue): ExecuteSuccess {
  return { protocolVersion: MATHERIUM_PROTOCOL_VERSION, invocationId, status: 'succeeded', output };
}

export function buildExecuteFailure(invocationId: string, error: ProtocolError): ExecuteFailure {
  return { protocolVersion: MATHERIUM_PROTOCOL_VERSION, invocationId, status: 'failed', error };
}

export interface CapabilityExample {
  name?: string;
  input: JsonValue;
  output?: JsonValue;
}

export interface CapabilityManifest {
  capabilityId: string;
  version: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  executionMode: 'sync' | 'async';
  timeoutMs: number;
  deterministic: boolean;
  tags: string[];
  examples: CapabilityExample[];
}

export interface ServiceManifest {
  protocolVersion: string;
  serviceId: string;
  name: string;
  version: string;
  description: string;
  baseUrl: string;
  capabilities: CapabilityManifest[];
  health: { path: string };
  authentication: { type: 'none' };
  metadata: Record<string, JsonValue>;
}

export interface HealthResponse {
  status: 'ok';
  serviceId: string;
  version: string;
}
