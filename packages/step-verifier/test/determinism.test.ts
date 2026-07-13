import { describe, expect, it } from 'vitest';
import { algebraicStepVerificationOutputSchema, verifyAlgebraicStep } from '../src/index.js';
import { document, equality, nonzero, step } from './helpers.js';

describe('deterministic output', () => {
  it('is deeply and byte identical across repeated runs', () => {
    const target = step('result', ['premise'], {
      sideConditions: ['guard-nonzero', 'guard-nonzero'],
    });
    const doc = document(
      [equality('premise', 'ey', 'fraction'), equality('result', 'ey', 'x-plus-one'), nonzero],
      target,
    );
    const first = verifyAlgebraicStep(doc, 'step', 'auto', 'step_nonzero');
    const second = verifyAlgebraicStep(doc, 'step', 'auto', 'step_nonzero');
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(algebraicStepVerificationOutputSchema.safeParse(first).success).toBe(true);
  });
  it('preserves dependency and side-condition source order while sorting set-like analysis', () => {
    const target = step('result', [], {
      dependencies: [],
      sideConditions: ['guard-nonzero', 'guard-nonzero'],
    });
    const value = verifyAlgebraicStep(
      document([equality('result', 'fraction', 'x-plus-one'), nonzero], target),
      'step',
      'rational_function',
      'step_nonzero',
    );
    expect(value.sideConditionIds).toEqual(['guard-nonzero', 'guard-nonzero']);
    expect(value.conditionAnalysis.selectedStatementIds).toEqual(['guard-nonzero']);
  });
});
