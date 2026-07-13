import { describe, expect, it } from 'vitest';
import { shouldAutoFallback, verifyAlgebraicStep } from '../src/index.js';
import { document, equality, step } from './helpers.js';

describe('rational-function verification', () => {
  it('verifies equal values with the same domain', () => {
    const value = verifyAlgebraicStep(
      document([equality('result', 'inverse', 'x-over-x-square')], step('result')),
      'step',
      'rational_function',
      'ignore',
    );
    expect(value).toMatchObject({
      outcome: 'verified',
      engine: 'rational_function',
      conditionStatus: 'not_required',
    });
  });
  it('reports cancellation as conditionally verified', () => {
    const value = verifyAlgebraicStep(
      document(
        [equality('premise', 'ey', 'fraction'), equality('result', 'ey', 'x-plus-one')],
        step('result', ['premise']),
      ),
      'step',
      'auto',
      'ignore',
    );
    expect(value).toMatchObject({
      outcome: 'conditionally_verified',
      engine: 'rational_function',
      conditionStatus: 'required',
    });
    expect(value.evidence).toMatchObject({ kind: 'rational_function' });
  });
  it('rejects unequal rational functions', () => {
    const value = verifyAlgebraicStep(
      document([equality('result', 'inverse', 'inverse-shift')], step('result')),
      'step',
      'rational_function',
      'ignore',
    );
    expect(value.outcome).toBe('rejected');
  });
  it('auto-falls back only for allowlisted polynomial issues', () => {
    const division = verifyAlgebraicStep(
      document([equality('result', 'fraction', 'x-plus-one')], step('result')),
      'step',
      'auto',
      'ignore',
    );
    const exponent = verifyAlgebraicStep(
      document([equality('result', 'negative-power', 'inverse')], step('result')),
      'step',
      'auto',
      'ignore',
    );
    expect(division.engine).toBe('rational_function');
    expect(exponent).toMatchObject({ outcome: 'verified', engine: 'rational_function' });
    const limited = verifyAlgebraicStep(
      document([equality('result', 'binomial-square', 'expanded')], step('result')),
      'step',
      'auto',
      'ignore',
      { maxVisitedExpressions: 1 },
    );
    expect(limited.engine).toBe('polynomial');
  });
  it('does not auto-fallback for empty, mixed, or resource issue sets', () => {
    expect(shouldAutoFallback([])).toBe(false);
    expect(shouldAutoFallback([{ code: 'NON_CONSTANT_DIVISOR' }])).toBe(true);
    expect(shouldAutoFallback([{ code: 'INVALID_EXPONENT' }])).toBe(true);
    expect(
      shouldAutoFallback([{ code: 'NON_CONSTANT_DIVISOR' }, { code: 'UNSUPPORTED_OPERATOR' }]),
    ).toBe(false);
    expect(shouldAutoFallback([{ code: 'EXPRESSION_LIMIT_EXCEEDED' }])).toBe(false);
  });
  it('keeps a mixed fallback and non-fallback failure in the polynomial engine', () => {
    const doc = document([equality('result', 'fraction', 'absolute-x')], step('result'));
    doc.expressions.push({ id: 'absolute-x', kind: 'unary', operator: 'absolute', operand: 'ex' });
    const value = verifyAlgebraicStep(doc, 'step', 'auto', 'ignore');
    expect(value).toMatchObject({ outcome: 'unknown', engine: 'polynomial' });
    expect(value.issues.map((issue) => issue.code)).toEqual([
      'NON_CONSTANT_DIVISOR',
      'UNSUPPORTED_OPERATOR',
    ]);
  });
  it('attributes required-domain GCD failure after completed condition analysis to rational phase', () => {
    const xNonzero = {
      id: 'x-nonzero',
      kind: 'predicate' as const,
      predicate: 'nonzero' as const,
      arguments: ['ex'],
    };
    const target = step('result', ['premise'], { sideConditions: ['x-nonzero'] });
    const value = verifyAlgebraicStep(
      document(
        [
          equality('premise', 'ey', 'x-over-x'),
          equality('result', 'ey', 'shift-over-shift'),
          xNonzero,
        ],
        target,
      ),
      'step',
      'rational_function',
      'step_nonzero',
      { maxGcdSteps: 1 },
    );
    expect(value).toMatchObject({
      outcome: 'unknown',
      engine: 'rational_function',
      conditionAnalysis: {
        status: 'completed',
        recognizedStatementIds: ['x-nonzero'],
        recognizedStepSideConditionIds: ['x-nonzero'],
        unsupportedStatementIds: [],
        unsupportedStepSideConditionIds: [],
      },
    });
    expect(value.issues).toContainEqual(
      expect.objectContaining({ code: 'GCD_STEP_LIMIT_EXCEEDED', phase: 'rational_function' }),
    );
  });
});
