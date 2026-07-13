import { describe, expect, it } from 'vitest';
import { verifyAlgebraicStep } from '../src/index.js';
import { document, equality, step } from './helpers.js';

describe('polynomial verification', () => {
  it('verifies exact polynomial identities with canonical evidence', () => {
    const value = verifyAlgebraicStep(
      document([equality('result', 'binomial-square', 'expanded')], step('result')),
      'step',
      'polynomial',
      'ignore',
    );
    expect(value).toMatchObject({
      outcome: 'verified',
      engine: 'polynomial',
      conditionStatus: 'not_required',
    });
    expect(value.evidence).toMatchObject({ kind: 'polynomial' });
  });
  it('rejects a precisely unequal rewrite', () => {
    const value = verifyAlgebraicStep(
      document(
        [equality('premise', 'ey', 'x-plus-one'), equality('result', 'ey', 'x-plus-two')],
        step('result', ['premise']),
      ),
      'step',
      'polynomial',
      'ignore',
    );
    expect(value).toMatchObject({
      outcome: 'rejected',
      engine: 'polynomial',
      stepShape: 'anchored_rewrite',
    });
  });
  it('returns unknown for a missing expression and for resource limits', () => {
    const doc = document([equality('result', 'binomial-square', 'expanded')], step('result'));
    const missing = structuredClone(doc);
    missing.expressions = missing.expressions.filter((expression) => expression.id !== 'expanded');
    expect(verifyAlgebraicStep(missing, 'step', 'polynomial', 'ignore').outcome).toBe(
      'invalid_document',
    );
    const limited = verifyAlgebraicStep(doc, 'step', 'polynomial', 'ignore', {
      maxVisitedExpressions: 1,
    });
    expect(limited.outcome).toBe('unknown');
    expect(limited.issues.some((issue) => issue.code === 'EXPRESSION_LIMIT_EXCEEDED')).toBe(true);
  });
});
