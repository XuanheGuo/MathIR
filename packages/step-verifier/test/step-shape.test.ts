import { describe, expect, it } from 'vitest';
import { algebraicStepVerificationOutputSchema, verifyAlgebraicStep } from '../src/index.js';
import { document, equality, step } from './helpers.js';

describe('supported step shapes', () => {
  it('extracts an identity assertion', () => {
    const value = verifyAlgebraicStep(
      document([equality('result', 'binomial-square', 'expanded')], step('result')),
      'step',
      'auto',
      'ignore',
    );
    expect(value).toMatchObject({
      outcome: 'verified',
      stepShape: 'identity_assertion',
      engine: 'polynomial',
    });
    expect(algebraicStepVerificationOutputSchema.safeParse(value).success).toBe(true);
  });
  it.each([
    ['equality_reflexivity', [], equality('result', 'ea', 'ea'), 'reflexivity'],
    ['equality_noop', ['premise'], equality('result', 'ea', 'eb'), 'no_op'],
    ['equality_symmetry', ['premise'], equality('result', 'eb', 'ea'), 'equality_symmetry'],
  ] as const)('recognizes %s structurally', (shape, premises, conclusion, transformation) => {
    const statements = premises.length
      ? [equality('premise', 'ea', 'eb'), conclusion]
      : [conclusion];
    const value = verifyAlgebraicStep(
      document(statements, step('result', [...premises])),
      'step',
      'auto',
      'ignore',
    );
    expect(value).toMatchObject({ outcome: 'verified', stepShape: shape, engine: 'structural' });
    expect(value.evidence).toMatchObject({ kind: 'structural', transformation });
  });
  it('handles all anchor orientations by exact expression ID', () => {
    const cases = [
      [equality('premise', 'ey', 'x-plus-one'), equality('result', 'ey', 'expanded')],
      [equality('premise', 'x-plus-one', 'ey'), equality('result', 'expanded', 'ey')],
      [equality('premise', 'x-plus-one', 'ey'), equality('result', 'ey', 'expanded')],
    ];
    for (const statements of cases) {
      const value = verifyAlgebraicStep(
        document(statements, step('result', ['premise'])),
        'step',
        'auto',
        'ignore',
      );
      expect(value.stepShape).toBe('anchored_rewrite');
      expect(value.anchorExpressionId).toBe('ey');
    }
  });
  it('returns unknown when no exact anchor exists', () => {
    const value = verifyAlgebraicStep(
      document(
        [equality('premise', 'x-plus-one', 'two'), equality('result', 'ex', 'one')],
        step('result', ['premise']),
      ),
      'step',
      'auto',
      'ignore',
    );
    expect(value).toMatchObject({ outcome: 'unknown', stepShape: null });
    expect(value.issues[0]?.code).toBe('STEP_ANCHOR_NOT_FOUND');
  });
  it('rejects unsupported rule, status, premise count, statement kind and relation as unknown', () => {
    const baseStatements = [
      equality('p1', 'ea', 'eb'),
      equality('p2', 'ea', 'eb'),
      equality('result', 'ea', 'eb'),
    ];
    const cases = [
      document(
        [equality('result', 'ea', 'eb')],
        step('result', [], { rule: { kind: 'equivalence', name: 'substitution' } }),
      ),
      document([equality('result', 'ea', 'eb')], step('result', [], { status: 'partial' })),
      document(baseStatements, step('result', ['p1', 'p2'])),
      document(
        [{ id: 'result', kind: 'predicate', predicate: 'nonzero', arguments: ['ex'] }],
        step('result'),
      ),
      document(
        [{ id: 'result', kind: 'relation', relation: 'less_than', left: 'ex', right: 'one' }],
        step('result'),
      ),
    ];
    const codes = [
      'UNSUPPORTED_STEP_RULE',
      'STEP_NOT_FULLY_PARSED',
      'STEP_PREMISE_COUNT_UNSUPPORTED',
      'STEP_STATEMENT_KIND_UNSUPPORTED',
      'STEP_RELATION_UNSUPPORTED',
    ];
    expect(
      cases.map((doc) => verifyAlgebraicStep(doc, 'step', 'auto', 'ignore').issues[0]?.code),
    ).toEqual(codes);
  });
});
