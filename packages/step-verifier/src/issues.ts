import type { AlgebraIssue } from '@mathir/algebra';
import type { StepVerificationIssue } from './types.js';

export const STEP_VERIFICATION_ISSUE_CODES = [
  'STEP_NOT_FOUND',
  'STEP_NOT_FULLY_PARSED',
  'UNSUPPORTED_STEP_RULE',
  'STEP_PREMISE_COUNT_UNSUPPORTED',
  'STEP_STATEMENT_KIND_UNSUPPORTED',
  'STEP_RELATION_UNSUPPORTED',
  'STEP_ANCHOR_NOT_FOUND',
  'STEP_ANCHOR_AMBIGUOUS',
  'CONDITION_LIMIT_EXCEEDED',
  'STEP_EVIDENCE_SIZE_LIMIT_EXCEEDED',
] as const;
export type StepVerificationIssueCode = (typeof STEP_VERIFICATION_ISSUE_CODES)[number];
const messages: Record<StepVerificationIssueCode, string> = {
  STEP_NOT_FOUND: 'Reasoning step was not found.',
  STEP_NOT_FULLY_PARSED: 'Reasoning step must be parsed or omit status.',
  UNSUPPORTED_STEP_RULE: 'Reasoning rule is not supported by algebraic step verification.',
  STEP_PREMISE_COUNT_UNSUPPORTED: 'Only zero or one premise is supported.',
  STEP_STATEMENT_KIND_UNSUPPORTED: 'Step statements must be relation statements.',
  STEP_RELATION_UNSUPPORTED: 'Step relation must be equality.',
  STEP_ANCHOR_NOT_FOUND: 'Premise and conclusion do not share an exact expression ID anchor.',
  STEP_ANCHOR_AMBIGUOUS: 'Premise and conclusion have multiple distinct rewrite anchors.',
  CONDITION_LIMIT_EXCEEDED: 'Selected condition count limit exceeded.',
  STEP_EVIDENCE_SIZE_LIMIT_EXCEEDED: 'Serialized verification evidence size limit exceeded.',
};
export class StepVerificationFailure extends Error {
  constructor(
    readonly code: StepVerificationIssueCode,
    readonly context?: {
      stepId?: string;
      statementId?: string;
      expressionId?: string;
      path?: string;
    },
  ) {
    super(code);
  }
}
export const stepIssue = (
  code: StepVerificationIssueCode,
  phase: StepVerificationIssue['phase'],
  context: Omit<StepVerificationIssue, 'code' | 'message' | 'phase'> = {},
): StepVerificationIssue => ({ code, message: messages[code], phase, ...context });
export const algebraIssue = (
  value: AlgebraIssue,
  phase: 'polynomial' | 'rational_function' | 'conditions',
): StepVerificationIssue => {
  const out: StepVerificationIssue = { code: value.code, message: value.message, phase };
  if (value.expressionId !== undefined) out.expressionId = value.expressionId;
  if (value.path !== undefined) out.path = value.path;
  if (value.side !== undefined) out.side = value.side === 'left' ? 'before' : 'after';
  return out;
};
const phaseOrder = { step_shape: 0, polynomial: 1, rational_function: 2, conditions: 3, output: 4 };
const sideOrder = (side?: 'before' | 'after') => (side === 'before' ? 0 : side === 'after' ? 1 : 2);
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export const compareStepIssues = (a: StepVerificationIssue, b: StepVerificationIssue): number => {
  const numeric =
    phaseOrder[a.phase] - phaseOrder[b.phase] || sideOrder(a.side) - sideOrder(b.side);
  if (numeric !== 0) return numeric;
  const values: [string, string][] = [
    [a.path ?? '', b.path ?? ''],
    [a.code, b.code],
    [a.stepId ?? '', b.stepId ?? ''],
    [a.statementId ?? '', b.statementId ?? ''],
    [a.expressionId ?? '', b.expressionId ?? ''],
  ];
  for (const [left, right] of values) {
    const order = cmp(left, right);
    if (order !== 0) return order;
  }
  return 0;
};
