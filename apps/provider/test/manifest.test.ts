import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import {
  VALIDATE_DOCUMENT_INPUT_JSON_SCHEMA,
  VALIDATE_DOCUMENT_OUTPUT_JSON_SCHEMA,
  type ValidateDocumentInput,
  executeValidateDocument,
  parseValidateDocumentInput,
  validateDocumentInputSchema,
  validateDocumentOutputSchema,
  validateOutputStructure,
} from '../src/capability.js';
import {
  CAPABILITY_ID,
  CAPABILITY_VERSION,
  HEALTH_PATH,
  MATHERIUM_PROTOCOL_VERSION,
  SERVICE_ID,
  SERVICE_VERSION,
} from '../src/constants.js';
import { buildManifest, buildValidateDocumentCapabilityManifest } from '../src/manifest.js';

const BASE_URL = 'http://127.0.0.1:4110';

describe('buildManifest', () => {
  const manifest = buildManifest(BASE_URL);

  it('declares the fixed Matherium protocol version', () => {
    expect(manifest.protocolVersion).toBe('0.2.0');
    expect(manifest.protocolVersion).toBe(MATHERIUM_PROTOCOL_VERSION);
  });

  it('declares stable service identity', () => {
    expect(manifest.serviceId).toBe(SERVICE_ID);
    expect(manifest.serviceId).toBe('mathir-validator');
    expect(manifest.version).toBe(SERVICE_VERSION);
    expect(manifest.version).toBe('0.3.0');
    expect(manifest.name).toBe('MathIR Validator');
  });

  it('reflects the injected base URL exactly', () => {
    expect(manifest.baseUrl).toBe(BASE_URL);
  });

  it('declares no authentication', () => {
    expect(manifest.authentication).toEqual({ type: 'none' });
  });

  it('declares the health path', () => {
    expect(manifest.health).toEqual({ path: HEALTH_PATH });
    expect(manifest.health.path).toBe('/health');
  });

  it('carries exactly five capabilities in stable ASCII order', () => {
    expect(manifest.capabilities).toHaveLength(5);
    expect(
      manifest.capabilities.map((capability) => `${capability.capabilityId}@${capability.version}`),
    ).toEqual([
      'mathir.check-polynomial-equivalence@0.1.0',
      'mathir.check-rational-function-equivalence@0.1.0',
      'mathir.normalize-polynomial@0.1.0',
      'mathir.normalize-rational-function@0.1.0',
      `${CAPABILITY_ID}@${CAPABILITY_VERSION}`,
    ]);
  });

  it('declares the capability as synchronous and deterministic', () => {
    const capability = buildValidateDocumentCapabilityManifest();
    expect(capability.executionMode).toBe('sync');
    expect(capability.deterministic).toBe(true);
  });

  it('carries the strict input wrapper schema', () => {
    const capability = buildValidateDocumentCapabilityManifest();
    expect(capability.inputSchema).toBe(VALIDATE_DOCUMENT_INPUT_JSON_SCHEMA);
    expect(capability.inputSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['document'],
    });
  });

  it('carries the bounded output schema', () => {
    const capability = buildValidateDocumentCapabilityManifest();
    expect(capability.outputSchema).toBe(VALIDATE_DOCUMENT_OUTPUT_JSON_SCHEMA);
    expect(capability.outputSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: [
        'valid',
        'documentId',
        'declaredMathirVersion',
        'diagnostics',
        'totalDiagnostics',
        'diagnosticsTruncated',
      ],
    });
  });

  it('compiles both schemas under Ajv 2020 strict mode', () => {
    const ajv = new Ajv2020.default({ strict: true });
    expect(() => ajv.compile(VALIDATE_DOCUMENT_INPUT_JSON_SCHEMA)).not.toThrow();
    expect(() => ajv.compile(VALIDATE_DOCUMENT_OUTPUT_JSON_SCHEMA)).not.toThrow();
  });

  it('carries at least two examples: a valid document and a semantically invalid one', () => {
    const capability = buildValidateDocumentCapabilityManifest();
    expect(capability.examples.length).toBeGreaterThanOrEqual(2);
    const outputs = capability.examples.map((example) => example.output as { valid: boolean });
    expect(outputs.some((o) => o.valid === true)).toBe(true);
    expect(outputs.some((o) => o.valid === false)).toBe(true);
  });

  it('has examples whose input/output satisfy both the Zod and JSON Schema contracts', () => {
    const capability = buildValidateDocumentCapabilityManifest();
    for (const example of capability.examples) {
      expect(validateDocumentInputSchema.safeParse(example.input).success).toBe(true);
      expect(validateOutputStructure(example.output)).toBe(true);
      expect(validateDocumentOutputSchema.safeParse(example.output).success).toBe(true);
    }
  });

  it('has example outputs that are byte-identical to a fresh execution', () => {
    const capability = buildValidateDocumentCapabilityManifest();
    for (const example of capability.examples) {
      const parsed = parseValidateDocumentInput(example.input);
      if (!parsed.ok) throw new Error('example input must satisfy its own contract');
      const input: ValidateDocumentInput = parsed.input;
      const fresh = executeValidateDocument(input);
      expect(JSON.stringify(fresh)).toBe(JSON.stringify(example.output));
    }
  });
});
