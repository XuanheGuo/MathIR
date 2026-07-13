import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  type Diagnostic,
  compareStableText,
  sortDiagnostics,
  validateMathDocument,
} from '../src/index.js';

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
  it.each([
    ['add', [], 0],
    ['add', ['x'], 1],
    ['multiply', [], 0],
    ['multiply', ['x'], 1],
  ])('rejects %s with %i operands under MathIR v0.1', (operator, operands, count) => {
    expect(operands).toHaveLength(count);
    const result = validateMathDocument({
      mathirVersion: '0.1.0',
      documentId: 'nary-arity',
      kind: 'problem',
      declarations: [{ id: 'x-declaration', kind: 'symbol', name: 'x' }],
      expressions: [
        { id: 'x', kind: 'symbol', declarationId: 'x-declaration' },
        { id: 'target', kind: 'nary', operator, operands },
      ],
      statements: [],
      steps: [],
      assumptions: [],
      goals: [],
    });
    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual({
      code: 'INVALID_OPERATOR_ARITY',
      severity: 'error',
      path: '/expressions/1/operands',
      message: `${operator} requires at least two operands`,
      entity: { kind: 'expression', id: 'target' },
    });
  });
  it.each(['add', 'multiply'])('accepts two-operand %s under MathIR v0.1', (operator) => {
    expect(
      validateMathDocument({
        mathirVersion: '0.1.0',
        documentId: 'nary-arity-valid',
        kind: 'problem',
        declarations: [{ id: 'x-declaration', kind: 'symbol', name: 'x' }],
        expressions: [
          { id: 'x', kind: 'symbol', declarationId: 'x-declaration' },
          { id: 'target', kind: 'nary', operator, operands: ['x', 'x'] },
        ],
        statements: [],
        steps: [],
        assumptions: [],
        goals: [],
      }),
    ).toMatchObject({ valid: true, diagnostics: [] });
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
      [...a].sort((x, y) => compareStableText(x.path ?? '', y.path ?? '')).map((d) => d.path),
    );
  });
  it('sorts a copy with locale-independent fields and ignores message text', () => {
    const input: Diagnostic[] = [
      { code: 'B', severity: 'warning', path: '/z', message: 'ASCII' },
      { code: 'A', severity: 'error', path: '/é', message: '中文消息' },
      { code: 'A', severity: 'error', path: '/a', message: 'Ω' },
      { code: 'A', severity: 'error', path: '/a', message: 'different message' },
    ];
    const original = [...input];
    const first = sortDiagnostics(input);
    const second = sortDiagnostics([...input].reverse());

    expect(input).toEqual(original);
    expect(first).not.toBe(input);
    expect(first.map(({ severity, path, code }) => ({ severity, path, code }))).toEqual(
      second.map(({ severity, path, code }) => ({ severity, path, code })),
    );
    expect(sortDiagnostics(input)).toEqual(first);
    expect(first.map((diagnostic) => diagnostic.path)).toEqual(['/a', '/a', '/é', '/z']);
  });
});
