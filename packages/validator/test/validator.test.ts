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
};

describe('validateMathDocument', () => {
  for (const file of [
    'minimal-problem.json',
    'algebra-solution.json',
    'conditional-equivalence.json',
    'unparsed-fragment.json',
  ]) {
    it(`accepts ${file}`, () =>
      expect(validateMathDocument(read(`valid/${file}`))).toMatchObject({
        valid: true,
        diagnostics: [],
      }));
  }
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
