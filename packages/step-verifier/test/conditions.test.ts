import { describe, expect, it } from 'vitest';
import { conditionAnalysisCompleted, verifyAlgebraicStep } from '../src/index.js';
import { document, equality, nonzero, positive, step } from './helpers.js';

const statements = [
  equality('premise', 'ey', 'fraction'),
  equality('result', 'ey', 'x-plus-one'),
  nonzero,
  positive,
];
describe('declared condition selection', () => {
  it('requires recognized and unsupported coverage of every selected ID', () => {
    expect(
      conditionAnalysisCompleted([], {
        mode: 'document_nonzero',
        recognizedStatementIds: [],
        unsupportedStatementIds: [],
        dischargeGuard: null,
      }),
    ).toBe(true);
    const analysis = {
      mode: 'document_nonzero' as const,
      recognizedStatementIds: ['recognized'],
      unsupportedStatementIds: ['unsupported'],
      dischargeGuard: null,
    };
    expect(conditionAnalysisCompleted(['unsupported', 'recognized'], analysis)).toBe(true);
    expect(conditionAnalysisCompleted(['recognized', 'missing'], analysis)).toBe(false);
  });
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
  it('attributes a selected condition expression resource failure to conditions', () => {
    const target = step('depth-result', [], { sideConditions: ['deep-nonzero'] });
    const doc = document(
      [
        equality('depth-result', 'inverse', 'negative-power'),
        {
          id: 'deep-nonzero',
          kind: 'predicate',
          predicate: 'nonzero',
          arguments: ['deep-4'],
        },
      ],
      target,
    );
    doc.expressions.push(
      { id: 'deep-1', kind: 'unary', operator: 'negate', operand: 'ex' },
      { id: 'deep-2', kind: 'unary', operator: 'negate', operand: 'deep-1' },
      { id: 'deep-3', kind: 'unary', operator: 'negate', operand: 'deep-2' },
      { id: 'deep-4', kind: 'unary', operator: 'negate', operand: 'deep-3' },
    );
    const value = verifyAlgebraicStep(doc, 'step', 'rational_function', 'step_nonzero', {
      maxExpressionDepth: 2,
    });
    expect(value).toMatchObject({
      outcome: 'unknown',
      engine: 'rational_function',
      conditionAnalysis: { status: 'unavailable' },
    });
    expect(value.issues).toContainEqual(
      expect.objectContaining({ code: 'DEPTH_LIMIT_EXCEEDED', phase: 'conditions' }),
    );
  });
});
