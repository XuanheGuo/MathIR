import type {
  PolynomialEquivalenceOutput,
  RationalFunctionEquivalenceOutput,
} from '@mathir/algebra';
import { describe, expect, it } from 'vitest';
import { verifyAlgebraicStep } from '../src/index.js';
import { type ValidationMetadata, applyValidationMetadata } from '../src/validation-metadata.js';

const diagnostic = {
  code: 'SCHEMA_INVALID',
  severity: 'error' as const,
  message: 'example',
};
const output = () => verifyAlgebraicStep(null, 'step', 'polynomial', 'ignore');

describe('validation metadata propagation', () => {
  it('preserves polynomial invalid-document truncation metadata', () => {
    const source: Pick<PolynomialEquivalenceOutput, keyof ValidationMetadata> = {
      validationDiagnostics: [diagnostic],
      totalValidationDiagnostics: 100,
      validationDiagnosticsTruncated: true,
    };
    const value = output();
    applyValidationMetadata(value, source);
    expect(value.validationDiagnostics).toEqual([diagnostic]);
    expect(value.totalValidationDiagnostics).toBe(100);
    expect(value.validationDiagnosticsTruncated).toBe(true);
  });

  it('preserves rational invalid-document truncation metadata', () => {
    const source: Pick<RationalFunctionEquivalenceOutput, keyof ValidationMetadata> = {
      validationDiagnostics: [diagnostic],
      totalValidationDiagnostics: 100,
      validationDiagnosticsTruncated: true,
    };
    const value = output();
    applyValidationMetadata(value, source);
    expect(value.validationDiagnostics).toEqual(source.validationDiagnostics);
    expect(value.totalValidationDiagnostics).toBe(source.totalValidationDiagnostics);
    expect(value.validationDiagnosticsTruncated).toBe(true);
  });

  it('keeps a false truncation flag false without changing diagnostics or total count', () => {
    const source: ValidationMetadata = {
      validationDiagnostics: [diagnostic],
      totalValidationDiagnostics: 1,
      validationDiagnosticsTruncated: false,
    };
    const value = output();
    applyValidationMetadata(value, source);
    expect(value.validationDiagnostics).toBe(source.validationDiagnostics);
    expect(value.totalValidationDiagnostics).toBe(1);
    expect(value.validationDiagnosticsTruncated).toBe(false);
  });
});
