import type { MathDocument, ReasoningStep, Statement } from '@mathir/contracts';
import { StepVerificationFailure } from './issues.js';
import type { AlgebraicStepShape, StructuralStepEvidence } from './types.js';

export interface ExtractedStepShape {
  stepShape: AlgebraicStepShape;
  premiseStatementId: string | null;
  conclusionStatementId: string;
  anchorExpressionId: string | null;
  beforeExpressionId: string;
  afterExpressionId: string;
  structuralEvidence: StructuralStepEvidence | null;
}

const equality = (
  statement: Statement | undefined,
  statementId: string,
): Extract<Statement, { kind: 'relation' }> => {
  if (!statement || statement.kind !== 'relation')
    throw new StepVerificationFailure('STEP_STATEMENT_KIND_UNSUPPORTED', { statementId });
  if (statement.relation !== 'equal')
    throw new StepVerificationFailure('STEP_RELATION_UNSUPPORTED', { statementId });
  return statement;
};

export function extractStepShape(document: MathDocument, step: ReasoningStep): ExtractedStepShape {
  if (step.premises.length > 1)
    throw new StepVerificationFailure('STEP_PREMISE_COUNT_UNSUPPORTED', { stepId: step.id });
  const statements = new Map(document.statements.map((statement) => [statement.id, statement]));
  const conclusion = equality(statements.get(step.conclusion), step.conclusion);
  if (step.premises.length === 0) {
    if (conclusion.left === conclusion.right)
      return {
        stepShape: 'equality_reflexivity',
        premiseStatementId: null,
        conclusionStatementId: conclusion.id,
        anchorExpressionId: null,
        beforeExpressionId: conclusion.left,
        afterExpressionId: conclusion.right,
        structuralEvidence: { kind: 'structural', transformation: 'reflexivity' },
      };
    return {
      stepShape: 'identity_assertion',
      premiseStatementId: null,
      conclusionStatementId: conclusion.id,
      anchorExpressionId: null,
      beforeExpressionId: conclusion.left,
      afterExpressionId: conclusion.right,
      structuralEvidence: null,
    };
  }
  const premiseId = step.premises[0] as string;
  const premise = equality(statements.get(premiseId), premiseId);
  if (premise.left === conclusion.left && premise.right === conclusion.right)
    return {
      stepShape: 'equality_noop',
      premiseStatementId: premise.id,
      conclusionStatementId: conclusion.id,
      anchorExpressionId: null,
      beforeExpressionId: premise.left,
      afterExpressionId: conclusion.left,
      structuralEvidence: { kind: 'structural', transformation: 'no_op' },
    };
  if (premise.left === conclusion.right && premise.right === conclusion.left)
    return {
      stepShape: 'equality_symmetry',
      premiseStatementId: premise.id,
      conclusionStatementId: conclusion.id,
      anchorExpressionId: null,
      beforeExpressionId: premise.left,
      afterExpressionId: conclusion.right,
      structuralEvidence: { kind: 'structural', transformation: 'equality_symmetry' },
    };
  const candidates: { anchor: string; before: string; after: string }[] = [];
  if (premise.left === conclusion.left)
    candidates.push({ anchor: premise.left, before: premise.right, after: conclusion.right });
  if (premise.left === conclusion.right)
    candidates.push({ anchor: premise.left, before: premise.right, after: conclusion.left });
  if (premise.right === conclusion.left)
    candidates.push({ anchor: premise.right, before: premise.left, after: conclusion.right });
  if (premise.right === conclusion.right)
    candidates.push({ anchor: premise.right, before: premise.left, after: conclusion.left });
  const unique = [
    ...new Map(candidates.map((c) => [`${c.anchor}\u0000${c.before}\u0000${c.after}`, c])).values(),
  ];
  if (unique.length === 0)
    throw new StepVerificationFailure('STEP_ANCHOR_NOT_FOUND', { stepId: step.id });
  if (unique.length !== 1)
    throw new StepVerificationFailure('STEP_ANCHOR_AMBIGUOUS', { stepId: step.id });
  const candidate = unique[0] as (typeof unique)[number];
  return {
    stepShape: 'anchored_rewrite',
    premiseStatementId: premise.id,
    conclusionStatementId: conclusion.id,
    anchorExpressionId: candidate.anchor,
    beforeExpressionId: candidate.before,
    afterExpressionId: candidate.after,
    structuralEvidence: null,
  };
}
