import { describe, expect, it } from 'vitest';
import { verifyAlgebraicStep } from '../src/index.js';
import { document, equality, nonzero, positive, step } from './helpers.js';

const statements = [
  equality('premise', 'ey', 'fraction'),
  equality('result', 'ey', 'x-plus-one'),
  nonzero,
  positive,
];
describe('declared condition selection', () => {
  it.each([
    ['ignore', [], [], 'conditionally_verified'],
    ['document_nonzero', ['guard-nonzero'], [], 'verified'],
    ['step_nonzero', [], ['guard-nonzero'], 'verified'],
    ['document_and_step_nonzero', ['guard-nonzero'], ['guard-nonzero'], 'verified'],
  ] as const)('supports %s', (mode, assumptions, sideConditions, outcome) => {
    const target = step('result', ['premise'], { sideConditions: [...sideConditions] });
    const doc = document(statements, target, [...assumptions]);
    const snapshot = structuredClone(doc);
    const value = verifyAlgebraicStep(doc, 'step', 'rational_function', mode);
    expect(value.outcome).toBe(outcome);
    expect(value.conditionAnalysis.selectedStatementIds).toEqual(
      mode === 'ignore' ? [] : ['guard-nonzero'],
    );
    expect(doc).toEqual(snapshot);
  });
  it('attributes one recognized ID to both selected sources while deduplicating the aggregate', () => {
    const target = step('result', ['premise'], {
      sideConditions: ['guard-nonzero', 'guard-positive'],
    });
    const value = verifyAlgebraicStep(
      document(statements, target, ['guard-nonzero']),
      'step',
      'rational_function',
      'document_and_step_nonzero',
    );
    expect(value.conditionStatus).toBe('satisfied_by_selected_conditions');
    expect(value.conditionAnalysis).toMatchObject({
      selectedStatementIds: ['guard-nonzero', 'guard-positive'],
      recognizedDocumentAssumptionIds: ['guard-nonzero'],
      recognizedStepSideConditionIds: ['guard-nonzero'],
      unsupportedStepSideConditionIds: ['guard-positive'],
    });
  });
  it('treats unsupported conditions as non-fatal and does not prove side conditions', () => {
    const target = step('result', ['premise'], { sideConditions: ['guard-positive'] });
    const value = verifyAlgebraicStep(
      document(statements, target),
      'step',
      'rational_function',
      'step_nonzero',
    );
    expect(value.outcome).toBe('conditionally_verified');
    expect(value.conditionAnalysis.unsupportedStatementIds).toEqual(['guard-positive']);
  });
});
