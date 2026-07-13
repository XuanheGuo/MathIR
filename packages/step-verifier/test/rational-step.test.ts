import { describe, expect, it } from 'vitest';
import { verifyAlgebraicStep } from '../src/index.js';
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
});
