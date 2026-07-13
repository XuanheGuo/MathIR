import {
  VALIDATE_DOCUMENT_INPUT_JSON_SCHEMA,
  VALIDATE_DOCUMENT_OUTPUT_JSON_SCHEMA,
  executeValidateDocument,
  parseValidateDocumentInput,
} from '../capability.js';
import { CAPABILITY_TIMEOUT_MS } from '../constants.js';
import type { CapabilityExample, JsonValue } from '../protocol.js';
import {
  CHECK_POLYNOMIAL_EQUIVALENCE_INPUT_JSON_SCHEMA,
  CHECK_POLYNOMIAL_EQUIVALENCE_OUTPUT_JSON_SCHEMA,
  executeCheckPolynomialEquivalence,
  parseCheckPolynomialEquivalenceInput,
} from './check-polynomial-equivalence.js';
import {
  NORMALIZE_POLYNOMIAL_INPUT_JSON_SCHEMA,
  NORMALIZE_POLYNOMIAL_OUTPUT_JSON_SCHEMA,
  executeNormalizePolynomial,
  parseNormalizePolynomialInput,
} from './normalize-polynomial.js';

export type ParseResult<I> = { ok: true; input: I } | { ok: false; message: string };
export interface ProviderCapability<I = unknown, O = unknown> {
  capabilityId: string;
  capabilityVersion: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  deterministic: true;
  timeoutMs: number;
  tags: string[];
  examples: CapabilityExample[];
  parseInput(raw: unknown): ParseResult<I>;
  execute(input: I): O;
}
const minimal = {
  mathirVersion: '0.1.0',
  documentId: 'minimal',
  kind: 'problem',
  declarations: [],
  expressions: [],
  statements: [],
  steps: [],
  assumptions: [],
  goals: [],
} as JsonValue;
const invalid = {
  mathirVersion: '0.1.0',
  documentId: 'bad-expression-ref',
  kind: 'problem',
  declarations: [],
  expressions: [{ id: 'neg', kind: 'unary', operator: 'negate', operand: 'missing' }],
  statements: [],
  steps: [],
  assumptions: [],
  goals: [],
} as JsonValue;
const normalizeDoc = {
  mathirVersion: '0.1.0',
  documentId: 'normalize-example',
  kind: 'problem',
  declarations: [{ id: 'x', kind: 'symbol', name: 'x' }],
  expressions: [
    { id: 'sx', kind: 'symbol', declarationId: 'x' },
    { id: 'one', kind: 'number', value: '1', numberKind: 'integer' },
    { id: 'left-sum', kind: 'nary', operator: 'add', operands: ['sx', 'one'] },
    { id: 'right-subtract', kind: 'binary', operator: 'subtract', left: 'sx', right: 'one' },
    { id: 'target', kind: 'nary', operator: 'add', operands: ['left-sum', 'right-subtract'] },
  ],
  statements: [],
  steps: [],
  assumptions: [],
  goals: [],
} as JsonValue;
const equivalenceDoc = {
  mathirVersion: '0.1.0',
  documentId: 'equivalence-example',
  kind: 'problem',
  declarations: [{ id: 'x', kind: 'symbol', name: 'x' }],
  expressions: [
    { id: 'sx', kind: 'symbol', declarationId: 'x' },
    { id: 'one', kind: 'number', value: '1' },
    { id: 'two', kind: 'number', value: '2' },
    { id: 'sum', kind: 'nary', operator: 'add', operands: ['sx', 'one'] },
    { id: 'left', kind: 'binary', operator: 'power', left: 'sum', right: 'two' },
    { id: 'x2', kind: 'binary', operator: 'power', left: 'sx', right: 'two' },
    { id: 'twox', kind: 'nary', operator: 'multiply', operands: ['two', 'sx'] },
    { id: 'right', kind: 'nary', operator: 'add', operands: ['x2', 'twox', 'one'] },
  ],
  statements: [],
  steps: [],
  assumptions: [],
  goals: [],
} as JsonValue;
const example = <I, O>(name: string, input: I, execute: (input: I) => O): CapabilityExample => ({
  name,
  input: input as JsonValue,
  output: execute(input) as JsonValue,
});
function defineCapability<I, O>(capability: ProviderCapability<I, O>): ProviderCapability {
  return {
    ...capability,
    parseInput: capability.parseInput,
    execute: (input: unknown) => capability.execute(input as I),
  };
}

const validateCapability = defineCapability({
  capabilityId: 'mathir.validate-document',
  capabilityVersion: '0.1.0',
  name: 'Validate MathIR Document',
  description:
    'Validates MathIR structure and deterministic semantic consistency without proving mathematics.',
  inputSchema: VALIDATE_DOCUMENT_INPUT_JSON_SCHEMA,
  outputSchema: VALIDATE_DOCUMENT_OUTPUT_JSON_SCHEMA,
  deterministic: true,
  timeoutMs: CAPABILITY_TIMEOUT_MS,
  tags: ['mathir', 'validation', 'deterministic'],
  parseInput: parseValidateDocumentInput,
  execute: (input) => executeValidateDocument(input),
  examples: [
    example('minimal-valid-document', { document: minimal }, executeValidateDocument),
    example('semantically-invalid-document', { document: invalid }, executeValidateDocument),
  ],
});
const normalizeCapability = defineCapability({
  capabilityId: 'mathir.normalize-polynomial',
  capabilityVersion: '0.1.0',
  name: 'Normalize Formal Polynomial',
  description:
    'Normalizes a supported MathIR expression as a formal commutative polynomial over exact rational coefficients.',
  inputSchema: NORMALIZE_POLYNOMIAL_INPUT_JSON_SCHEMA,
  outputSchema: NORMALIZE_POLYNOMIAL_OUTPUT_JSON_SCHEMA,
  deterministic: true,
  timeoutMs: CAPABILITY_TIMEOUT_MS,
  tags: ['mathir', 'algebra', 'polynomial', 'deterministic'],
  parseInput: parseNormalizePolynomialInput,
  execute: executeNormalizePolynomial,
  examples: [
    example(
      'combine-polynomial-terms',
      { document: normalizeDoc, expressionId: 'target' },
      executeNormalizePolynomial,
    ),
  ],
});
const equivalenceCapability = defineCapability({
  capabilityId: 'mathir.check-polynomial-equivalence',
  capabilityVersion: '0.1.0',
  name: 'Check Formal Polynomial Equivalence',
  description:
    'Exactly compares canonical formal polynomial normal forms inside the supported fragment.',
  inputSchema: CHECK_POLYNOMIAL_EQUIVALENCE_INPUT_JSON_SCHEMA,
  outputSchema: CHECK_POLYNOMIAL_EQUIVALENCE_OUTPUT_JSON_SCHEMA,
  deterministic: true,
  timeoutMs: CAPABILITY_TIMEOUT_MS,
  tags: ['mathir', 'algebra', 'equivalence', 'deterministic'],
  parseInput: parseCheckPolynomialEquivalenceInput,
  execute: executeCheckPolynomialEquivalence,
  examples: [
    example(
      'binomial-square',
      { document: equivalenceDoc, leftExpressionId: 'left', rightExpressionId: 'right' },
      executeCheckPolynomialEquivalence,
    ),
  ],
});
const compare = (a: ProviderCapability, b: ProviderCapability) =>
  a.capabilityId < b.capabilityId
    ? -1
    : a.capabilityId > b.capabilityId
      ? 1
      : a.capabilityVersion < b.capabilityVersion
        ? -1
        : a.capabilityVersion > b.capabilityVersion
          ? 1
          : 0;
export const PROVIDER_CAPABILITIES: readonly ProviderCapability[] = [
  equivalenceCapability,
  normalizeCapability,
  validateCapability,
].sort(compare);
const registry = new Map(
  PROVIDER_CAPABILITIES.map((c) => [`${c.capabilityId}@${c.capabilityVersion}`, c]),
);
if (registry.size !== PROVIDER_CAPABILITIES.length)
  throw new Error('duplicate provider capability ID/version');
export function findProviderCapability(
  id: string,
  version: string,
): ProviderCapability | undefined {
  return registry.get(`${id}@${version}`);
}
