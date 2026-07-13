import { MATHIR_VERSION } from '@mathir/contracts';
import {
  VALIDATE_DOCUMENT_INPUT_JSON_SCHEMA,
  VALIDATE_DOCUMENT_OUTPUT_JSON_SCHEMA,
  type ValidateDocumentInput,
  executeValidateDocument,
} from './capability.js';
import {
  CAPABILITY_ID,
  CAPABILITY_TIMEOUT_MS,
  CAPABILITY_VERSION,
  HEALTH_PATH,
  MATHERIUM_PROTOCOL_VERSION,
  SERVICE_ID,
  SERVICE_VERSION,
} from './constants.js';
import {
  type CapabilityExample,
  type CapabilityManifest,
  type JsonValue,
  type ServiceManifest,
  toJsonValue,
} from './protocol.js';

const MINIMAL_VALID_DOCUMENT: JsonValue = {
  mathirVersion: '0.1.0',
  documentId: 'minimal',
  kind: 'problem',
  declarations: [],
  expressions: [],
  statements: [],
  steps: [],
  assumptions: [],
  goals: [],
};

const SEMANTICALLY_INVALID_DOCUMENT: JsonValue = {
  mathirVersion: '0.1.0',
  documentId: 'bad-expression-ref',
  kind: 'problem',
  declarations: [],
  expressions: [{ id: 'neg', kind: 'unary', operator: 'negate', operand: 'missing' }],
  statements: [],
  steps: [],
  assumptions: [],
  goals: [],
};

function buildExample(name: string, document: JsonValue): CapabilityExample {
  const input: ValidateDocumentInput = { document };
  return { name, input: toJsonValue(input), output: toJsonValue(executeValidateDocument(input)) };
}

export const CAPABILITY_EXAMPLES: CapabilityExample[] = [
  buildExample('minimal-valid-document', MINIMAL_VALID_DOCUMENT),
  buildExample('semantically-invalid-document', SEMANTICALLY_INVALID_DOCUMENT),
];

export function buildValidateDocumentCapabilityManifest(): CapabilityManifest {
  return {
    capabilityId: CAPABILITY_ID,
    version: CAPABILITY_VERSION,
    name: 'Validate MathIR Document',
    description:
      'Validates MathIR structure and deterministic semantic consistency without proving mathematics.',
    inputSchema: VALIDATE_DOCUMENT_INPUT_JSON_SCHEMA,
    outputSchema: VALIDATE_DOCUMENT_OUTPUT_JSON_SCHEMA,
    executionMode: 'sync',
    timeoutMs: CAPABILITY_TIMEOUT_MS,
    deterministic: true,
    tags: ['mathir', 'validation', 'deterministic'],
    examples: CAPABILITY_EXAMPLES,
  };
}

export function buildManifest(baseUrl: string): ServiceManifest {
  return {
    protocolVersion: MATHERIUM_PROTOCOL_VERSION,
    serviceId: SERVICE_ID,
    name: 'MathIR Validator',
    version: SERVICE_VERSION,
    description: 'Deterministic validation service for MathIR documents.',
    baseUrl,
    capabilities: [buildValidateDocumentCapabilityManifest()],
    health: { path: HEALTH_PATH },
    authentication: { type: 'none' },
    metadata: {
      project: 'mathir',
      role: 'validator-provider',
      mathirVersion: MATHIR_VERSION,
    },
  };
}
