import type { MathDocument, ReasoningStep, Statement } from '@mathir/contracts';

const expressions: MathDocument['expressions'] = [
  { id: 'ex', kind: 'symbol', declarationId: 'x' },
  { id: 'ey', kind: 'symbol', declarationId: 'y' },
  { id: 'ea', kind: 'symbol', declarationId: 'a' },
  { id: 'eb', kind: 'symbol', declarationId: 'b' },
  { id: 'zero', kind: 'number', value: '0' },
  { id: 'one', kind: 'number', value: '1' },
  { id: 'two', kind: 'number', value: '2' },
  { id: 'minus-one', kind: 'number', value: '-1' },
  { id: 'x-plus-one', kind: 'nary', operator: 'add', operands: ['ex', 'one'] },
  { id: 'x-plus-two', kind: 'nary', operator: 'add', operands: ['ex', 'two'] },
  { id: 'x-square', kind: 'binary', operator: 'power', left: 'ex', right: 'two' },
  { id: 'binomial-square', kind: 'binary', operator: 'power', left: 'x-plus-one', right: 'two' },
  { id: 'two-x', kind: 'nary', operator: 'multiply', operands: ['two', 'ex'] },
  { id: 'expanded', kind: 'nary', operator: 'add', operands: ['x-square', 'two-x', 'one'] },
  { id: 'numerator', kind: 'binary', operator: 'subtract', left: 'x-square', right: 'one' },
  { id: 'guard', kind: 'binary', operator: 'subtract', left: 'ex', right: 'one' },
  { id: 'fraction', kind: 'binary', operator: 'divide', left: 'numerator', right: 'guard' },
  { id: 'inverse', kind: 'binary', operator: 'divide', left: 'one', right: 'ex' },
  { id: 'x-over-x-square', kind: 'binary', operator: 'divide', left: 'ex', right: 'x-square' },
  { id: 'inverse-shift', kind: 'binary', operator: 'divide', left: 'one', right: 'x-plus-one' },
  { id: 'negative-power', kind: 'binary', operator: 'power', left: 'ex', right: 'minus-one' },
];
export const equality = (id: string, left: string, right: string): Statement => ({
  id,
  kind: 'relation',
  relation: 'equal',
  left,
  right,
});
export const nonzero: Statement = {
  id: 'guard-nonzero',
  kind: 'predicate',
  predicate: 'nonzero',
  arguments: ['guard'],
};
export const positive: Statement = {
  id: 'guard-positive',
  kind: 'predicate',
  predicate: 'positive',
  arguments: ['guard'],
};
export const step = (
  conclusion: string,
  premises: string[] = [],
  overrides: Partial<ReasoningStep> = {},
): ReasoningStep => ({
  id: 'step',
  premises,
  conclusion,
  dependencies: [],
  rule: { kind: 'equivalence', name: 'simplification' },
  sideConditions: [],
  ...overrides,
});
export const document = (
  statements: Statement[],
  target: ReasoningStep,
  assumptions: string[] = [],
): MathDocument => ({
  mathirVersion: '0.1.0',
  documentId: 'step-test',
  kind: 'solution',
  declarations: [
    { id: 'x', kind: 'symbol', name: 'x' },
    { id: 'y', kind: 'symbol', name: 'y' },
    { id: 'a', kind: 'symbol', name: 'a' },
    { id: 'b', kind: 'symbol', name: 'b' },
  ],
  expressions,
  statements,
  steps: [target],
  assumptions,
  goals: [],
});
