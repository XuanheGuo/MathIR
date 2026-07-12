import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateMathDocument } from '../src/index.js';

const root = new URL('../../../test-vectors/', import.meta.url);
const read = (path: string): unknown => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const expected: Record<string, string> = {
  'duplicate-expression-id.json': 'DUPLICATE_ID',
  'missing-expression-reference.json': 'UNKNOWN_EXPRESSION_REFERENCE',
  'missing-statement-reference.json': 'UNKNOWN_STATEMENT_REFERENCE',
  'forward-step-dependency.json': 'FORWARD_STEP_DEPENDENCY',
  'cyclic-step-dependency.json': 'CYCLIC_STEP_DEPENDENCY',
  'invalid-source-span.json': 'INVALID_SOURCE_SPAN',
  'invalid-function-arity.json': 'INVALID_FUNCTION_ARITY',
  'invalid-compound-arity.json': 'INVALID_COMPOUND_ARITY',
  'unsupported-version.json': 'UNSUPPORTED_VERSION',
  'function-parameter-references-function.json': 'INVALID_DECLARATION_KIND',
  'symbol-expression-references-function.json': 'INVALID_DECLARATION_KIND',
  'function-call-references-symbol.json': 'INVALID_DECLARATION_KIND',
  'missing-piecewise-condition-statement.json': 'UNKNOWN_STATEMENT_REFERENCE',
  'missing-piecewise-value-expression.json': 'UNKNOWN_EXPRESSION_REFERENCE',
  'function-domain-arity-mismatch.json': 'INVALID_FUNCTION_ARITY',
  'structural-missing-document-id.json': 'SCHEMA_INVALID',
};

describe('validateMathDocument', () => {
  for (const file of [
    'minimal-problem.json',
    'algebra-solution.json',
    'conditional-equivalence.json',
    'unparsed-fragment.json',
    'piecewise-absolute-value.json',
  ]) {
    it(`accepts ${file}`, () =>
      expect(validateMathDocument(read(`valid/${file}`))).toMatchObject({
        valid: true,
        diagnostics: [],
      }));
  }
  it.each([
    [
      'function-parameter-references-function.json',
      '/declarations/1/parameters/0',
      'declaration',
      'f',
    ],
    [
      'symbol-expression-references-function.json',
      '/expressions/0/declarationId',
      'expression',
      'symbol-expression',
    ],
    [
      'function-call-references-symbol.json',
      '/expressions/0/functionDeclarationId',
      'expression',
      'call',
    ],
  ])('reports typed declaration ownership for %s', (file, path, kind, id) => {
    const result = validateMathDocument(read(`invalid/${file}`));
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'INVALID_DECLARATION_KIND',
        path,
        entity: { kind, id },
      }),
    );
  });
  it.each([
    [
      'missing-piecewise-condition-statement.json',
      'UNKNOWN_STATEMENT_REFERENCE',
      '/expressions/1/branches/0/condition',
    ],
    [
      'missing-piecewise-value-expression.json',
      'UNKNOWN_EXPRESSION_REFERENCE',
      '/expressions/1/branches/0/value',
    ],
  ])('checks piecewise namespaces for %s', (file, code, path) => {
    const result = validateMathDocument(read(`invalid/${file}`));
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code,
        path,
        entity: { kind: 'expression', id: 'piece' },
      }),
    );
  });
  it('reports function declaration domain arity at the declaration', () => {
    const result = validateMathDocument(read('invalid/function-domain-arity-mismatch.json'));
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'INVALID_FUNCTION_ARITY',
        path: '/declarations/2/domain',
        entity: { kind: 'declaration', id: 'f' },
        message: expect.stringContaining('domain entries'),
      }),
    );
  });
  for (const [file, code] of Object.entries(expected)) {
    it(`rejects ${file} with ${code}`, () => {
      const result = validateMathDocument(read(`invalid/${file}`));
      expect(result.valid).toBe(false);
      expect(result.diagnostics.map((d) => d.code)).toContain(code);
    });
  }
  it('never throws on malformed unknown input', () => {
    for (const value of [null, 1, 'x', [], {}, { mathirVersion: null }])
      expect(() => validateMathDocument(value)).not.toThrow();
  });
  it('sorts diagnostics deterministically', () => {
    const a = validateMathDocument(read('invalid/cyclic-step-dependency.json')).diagnostics;
    const b = validateMathDocument(read('invalid/cyclic-step-dependency.json')).diagnostics;
    expect(a).toEqual(b);
    expect(a.map((d) => d.path)).toEqual(
      [...a].sort((x, y) => (x.path ?? '').localeCompare(y.path ?? '')).map((d) => d.path),
    );
  });
});
