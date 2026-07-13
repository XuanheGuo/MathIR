import { readFileSync } from 'node:fs';
import { type Diagnostic, validateMathDocument } from '@mathir/validator';
import { describe, expect, it } from 'vitest';
import {
  executeValidateDocument,
  parseValidateDocumentInput,
  validateDocumentInputSchema,
  validateDocumentOutputSchema,
  validateInputStructure,
  validateOutputStructure,
} from '../src/capability.js';
import { OUTPUT_BYTE_BUDGET } from '../src/constants.js';
import type { JsonValue } from '../src/protocol.js';

const root = new URL('../../../test-vectors/', import.meta.url);
const read = (path: string): JsonValue => JSON.parse(readFileSync(new URL(path, root), 'utf8'));

function byteSize(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

describe('executeValidateDocument', () => {
  it('accepts a minimal valid document with no diagnostics', () => {
    const output = executeValidateDocument({ document: read('valid/minimal-problem.json') });
    expect(output).toEqual({
      valid: true,
      documentId: 'minimal',
      declaredMathirVersion: '0.1.0',
      diagnostics: [],
      totalDiagnostics: 0,
      diagnosticsTruncated: false,
    });
  });

  it('accepts a valid algebra document', () => {
    const output = executeValidateDocument({ document: read('valid/algebra-solution.json') });
    expect(output.valid).toBe(true);
    expect(output.documentId).toBe('algebra-x');
    expect(output.diagnostics).toEqual([]);
  });

  it('reports a structurally invalid document as unsuccessful, not a thrown error', () => {
    const output = executeValidateDocument({
      document: read('invalid/structural-missing-document-id.json'),
    });
    expect(output.valid).toBe(false);
    expect(output.documentId).toBeNull();
    expect(output.diagnostics.some((d) => d.code === 'SCHEMA_INVALID')).toBe(true);
  });

  it('reports a semantically invalid document (unknown expression reference)', () => {
    const output = executeValidateDocument({
      document: read('invalid/missing-expression-reference.json'),
    });
    expect(output.valid).toBe(false);
    expect(output.documentId).toBe('bad-expression-ref');
    expect(output.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'UNKNOWN_EXPRESSION_REFERENCE' }),
    );
  });

  it('reports an unsupported MathIR version', () => {
    const output = executeValidateDocument({ document: read('invalid/unsupported-version.json') });
    expect(output.valid).toBe(false);
    expect(output.declaredMathirVersion).toBe('9.0.0');
    expect(output.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'UNSUPPORTED_VERSION' }),
    );
  });

  it('produces byte-identical output for repeated execution on the same input', () => {
    const input = { document: read('valid/algebra-solution.json') };
    const first = executeValidateDocument(input);
    const second = executeValidateDocument(input);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('never includes timestamp, random, or trace fields', () => {
    const output = executeValidateDocument({ document: read('valid/algebra-solution.json') });
    expect(Object.keys(output).sort()).toEqual([
      'declaredMathirVersion',
      'diagnostics',
      'diagnosticsTruncated',
      'documentId',
      'totalDiagnostics',
      'valid',
    ]);
  });

  it('extracts documentId only when it is a syntactically valid ID', () => {
    expect(executeValidateDocument({ document: { documentId: 'ok-id' } }).documentId).toBe('ok-id');
    expect(
      executeValidateDocument({ document: { documentId: 'has spaces' } }).documentId,
    ).toBeNull();
    expect(executeValidateDocument({ document: { documentId: 42 } }).documentId).toBeNull();
    expect(executeValidateDocument({ document: 'not-an-object' }).documentId).toBeNull();
    expect(executeValidateDocument({ document: null }).documentId).toBeNull();
  });

  it('extracts declaredMathirVersion only when it is a reasonable-length string', () => {
    expect(
      executeValidateDocument({ document: { mathirVersion: '0.1.0' } }).declaredMathirVersion,
    ).toBe('0.1.0');
    expect(
      executeValidateDocument({ document: { mathirVersion: '' } }).declaredMathirVersion,
    ).toBeNull();
    expect(
      executeValidateDocument({ document: { mathirVersion: 'x'.repeat(65) } })
        .declaredMathirVersion,
    ).toBeNull();
    expect(
      executeValidateDocument({ document: { mathirVersion: 7 } }).declaredMathirVersion,
    ).toBeNull();
  });

  it('leaves small results untouched by bounding', () => {
    const output = executeValidateDocument({ document: read('valid/minimal-problem.json') });
    expect(output.diagnosticsTruncated).toBe(false);
    expect(output.totalDiagnostics).toBe(output.diagnostics.length);
  });

  it('validates output against both the JSON Schema and the Zod schema', () => {
    for (const file of ['valid/minimal-problem.json', 'invalid/unsupported-version.json']) {
      const output = executeValidateDocument({ document: read(file) });
      expect(validateOutputStructure(output)).toBe(true);
      expect(validateDocumentOutputSchema.safeParse(output).success).toBe(true);
    }
  });

  describe('diagnostics truncation under the byte budget', () => {
    const DUPLICATE_COUNT = 8000;
    const document: JsonValue = {
      mathirVersion: '0.1.0',
      documentId: 'oversized',
      kind: 'problem',
      declarations: Array.from({ length: DUPLICATE_COUNT }, () => ({
        id: 'dup',
        kind: 'symbol',
        name: 'dup',
      })),
      expressions: [],
      statements: [],
      steps: [],
      assumptions: [],
      goals: [],
    };
    const output = executeValidateDocument({ document });
    const fullDiagnostics = validateMathDocument(document).diagnostics;

    it('produces more raw diagnostics than fit the budget', () => {
      expect(fullDiagnostics.length).toBe(DUPLICATE_COUNT - 1);
      expect(byteSize({ ...output, diagnostics: fullDiagnostics }) > OUTPUT_BYTE_BUDGET).toBe(true);
    });

    it('truncates, reports the true total, and stays within the byte budget', () => {
      expect(output.diagnosticsTruncated).toBe(true);
      expect(output.totalDiagnostics).toBe(DUPLICATE_COUNT - 1);
      expect(output.diagnostics.length).toBeLessThan(output.totalDiagnostics);
      expect(byteSize(output)).toBeLessThanOrEqual(OUTPUT_BYTE_BUDGET);
    });

    it('does not recompute validity from the truncated diagnostics', () => {
      expect(output.valid).toBe(false);
    });

    it('keeps a stable prefix identical to the untruncated validator order', () => {
      const toComparable = (d: Diagnostic) => ({
        code: d.code,
        severity: d.severity,
        message: d.message,
        ...(d.path !== undefined ? { path: d.path } : {}),
        ...(d.entity !== undefined ? { entity: d.entity } : {}),
        ...(d.related !== undefined ? { related: d.related } : {}),
      });
      expect(output.diagnostics).toEqual(
        fullDiagnostics.slice(0, output.diagnostics.length).map(toComparable),
      );
    });

    it('is still identical across repeated executions once truncated', () => {
      const again = executeValidateDocument({ document });
      expect(JSON.stringify(again)).toBe(JSON.stringify(output));
    });
  });
});

describe('parseValidateDocumentInput', () => {
  it('accepts a well-formed wrapper', () => {
    const result = parseValidateDocumentInput({ document: { any: 'value' } });
    expect(result).toEqual({ ok: true, input: { document: { any: 'value' } } });
  });

  it('rejects a missing document field', () => {
    expect(parseValidateDocumentInput({}).ok).toBe(false);
  });

  it('rejects additional top-level properties', () => {
    expect(parseValidateDocumentInput({ document: {}, extra: 1 }).ok).toBe(false);
  });

  it('rejects non-object input', () => {
    expect(parseValidateDocumentInput('nope').ok).toBe(false);
    expect(parseValidateDocumentInput(null).ok).toBe(false);
    expect(parseValidateDocumentInput([1, 2]).ok).toBe(false);
  });

  it('is consistent with the published JSON Schema and Zod schema for accepted input', () => {
    const raw = { document: { mathirVersion: '0.1.0' } };
    expect(parseValidateDocumentInput(raw).ok).toBe(true);
    expect(validateInputStructure(raw)).toBe(true);
    expect(validateDocumentInputSchema.safeParse(raw).success).toBe(true);
  });

  it('is consistent with the published JSON Schema and Zod schema for rejected input', () => {
    const raw = { notDocument: true };
    expect(parseValidateDocumentInput(raw).ok).toBe(false);
    expect(validateInputStructure(raw)).toBe(false);
    expect(validateDocumentInputSchema.safeParse(raw).success).toBe(false);
  });
});
