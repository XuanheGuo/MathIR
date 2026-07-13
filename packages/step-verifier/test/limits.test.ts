import { describe, expect, it } from 'vitest';
import { verifyAlgebraicStep } from '../src/index.js';
import { document, equality, nonzero, step } from './helpers.js';

describe('step limits', () => {
  it('bounds selected conditions', () => {
    const target = step('result', ['premise'], { sideConditions: ['guard-nonzero'] });
    const value = verifyAlgebraicStep(
      document(
        [equality('premise', 'ey', 'fraction'), equality('result', 'ey', 'x-plus-one'), nonzero],
        target,
      ),
      'step',
      'rational_function',
      'step_nonzero',
      { maxSelectedConditions: 0 },
    );
    expect(value.outcome).toBe('unknown');
    expect(value.issues[0]?.code).toBe('CONDITION_LIMIT_EXCEEDED');
    expect(value.conditionAnalysis.status).toBe('unavailable');
  });
  it('bounds evidence by real UTF-8 bytes without truncating normal forms', () => {
    const value = verifyAlgebraicStep(
      document([equality('result', 'binomial-square', 'expanded')], step('result')),
      'step',
      'polynomial',
      'ignore',
      { maxEvidenceBytes: 1 },
    );
    expect(value).toMatchObject({ outcome: 'unknown', evidence: null });
    expect(value.issues[0]?.code).toBe('STEP_EVIDENCE_SIZE_LIMIT_EXCEEDED');
  });
});
