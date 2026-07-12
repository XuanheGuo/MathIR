import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { validateMathDocument } from '../../validator/src/index.js';
import { mathDocumentSchema } from '../src/index.js';

const vectorRoot = new URL('../../../test-vectors/', import.meta.url);
const read = (path: string): unknown => JSON.parse(readFileSync(new URL(path, vectorRoot), 'utf8'));
const schema = JSON.parse(
  readFileSync(new URL('../schema/mathir-document-0.1.0.schema.json', import.meta.url), 'utf8'),
);
const jsonSchemaAccepts = new Ajv2020.default({ strict: true, allErrors: true }).compile(schema);

const validVectors = [
  'minimal-problem.json',
  'algebra-solution.json',
  'conditional-equivalence.json',
  'unparsed-fragment.json',
  'piecewise-absolute-value.json',
];
const structuralInvalidVectors = ['structural-missing-document-id.json'];
const semanticInvalidVectors = [
  'duplicate-expression-id.json',
  'missing-expression-reference.json',
  'missing-statement-reference.json',
  'forward-step-dependency.json',
  'cyclic-step-dependency.json',
  'invalid-source-span.json',
  'invalid-function-arity.json',
  'invalid-compound-arity.json',
  'unsupported-version.json',
  'function-parameter-references-function.json',
  'symbol-expression-references-function.json',
  'function-call-references-symbol.json',
  'missing-piecewise-condition-statement.json',
  'missing-piecewise-value-expression.json',
  'function-domain-arity-mismatch.json',
];

describe('JSON Schema, Zod, and semantic validation boundaries', () => {
  it.each(validVectors)('accepts valid/%s in all three layers', (file) => {
    const input = read(`valid/${file}`);
    expect(jsonSchemaAccepts(input)).toBe(true);
    expect(mathDocumentSchema.safeParse(input).success).toBe(true);
    expect(validateMathDocument(input).valid).toBe(true);
  });

  it.each(structuralInvalidVectors)('rejects invalid/%s in both structural contracts', (file) => {
    const input = read(`invalid/${file}`);
    expect(jsonSchemaAccepts(input)).toBe(false);
    expect(mathDocumentSchema.safeParse(input).success).toBe(false);
  });

  it.each(semanticInvalidVectors)(
    'accepts invalid/%s structurally but rejects semantically',
    (file) => {
      const input = read(`invalid/${file}`);
      expect(jsonSchemaAccepts(input)).toBe(true);
      expect(mathDocumentSchema.safeParse(input).success).toBe(true);
      expect(validateMathDocument(input).valid).toBe(false);
    },
  );
});
