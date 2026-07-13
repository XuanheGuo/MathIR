import {
  type AlgebraIssue,
  type PolynomialEquivalenceOutput,
  type ProviderDiagnostic,
  type RationalFunctionEquivalenceOutput,
  checkPolynomialEquivalence,
  checkRationalFunctionEquivalence,
} from '@mathir/algebra';
import type { MathDocument, ReasoningStep } from '@mathir/contracts';
import { validateMathDocument } from '@mathir/validator';
import {
  completeConditionAnalysis,
  emptyConditionAnalysis,
  selectConditions,
} from './conditions.js';
import {
  ALGEBRAIC_STEP_VERIFICATION_SEMANTICS,
  AUTO_FALLBACK_ISSUE_CODES,
  type StepVerificationLimits,
  resolveStepVerificationLimits,
} from './constants.js';
import { StepVerificationFailure, algebraIssue, compareStepIssues, stepIssue } from './issues.js';
import { type ExtractedStepShape, extractStepShape } from './step-shape.js';
import type {
  AlgebraicStepEvidence,
  AlgebraicStepVerificationMode,
  AlgebraicStepVerificationOutput,
  StepConditionMode,
} from './types.js';

const projectDiagnostics = (diagnostics: ReturnType<typeof validateMathDocument>['diagnostics']) =>
  diagnostics.map((diagnostic): ProviderDiagnostic => {
    const out: ProviderDiagnostic = {
      code: diagnostic.code,
      severity: diagnostic.severity,
      message: diagnostic.message,
    };
    if (diagnostic.path !== undefined) out.path = diagnostic.path;
    if (diagnostic.entity !== undefined) out.entity = diagnostic.entity;
    if (diagnostic.related !== undefined) out.related = diagnostic.related;
    return out;
  });
const emptyBase = (
  stepId: string,
  verificationMode: AlgebraicStepVerificationMode,
  conditionMode: StepConditionMode,
): AlgebraicStepVerificationOutput => ({
  outcome: 'unknown',
  semantics: ALGEBRAIC_STEP_VERIFICATION_SEMANTICS,
  verificationMode,
  conditionMode,
  stepId,
  stepShape: null,
  engine: null,
  declaredRule: null,
  declaredStatus: null,
  premiseStatementId: null,
  conclusionStatementId: null,
  anchorExpressionId: null,
  beforeExpressionId: null,
  afterExpressionId: null,
  dependencyIds: [],
  sideConditionIds: [],
  conditionStatus: 'not_applicable',
  conditionAnalysis: emptyConditionAnalysis(conditionMode),
  evidence: null,
  issues: [],
  validationDiagnostics: [],
  totalValidationDiagnostics: 0,
  validationDiagnosticsTruncated: false,
});
const supportedRule = (step: ReasoningStep) =>
  step.rule.kind === 'equivalence' &&
  (step.rule.name === 'simplification' || step.rule.name === 'algebraic_rearrangement');
const applyShape = (output: AlgebraicStepVerificationOutput, shape: ExtractedStepShape) => {
  output.stepShape = shape.stepShape;
  output.premiseStatementId = shape.premiseStatementId;
  output.conclusionStatementId = shape.conclusionStatementId;
  output.anchorExpressionId = shape.anchorExpressionId;
  output.beforeExpressionId = shape.beforeExpressionId;
  output.afterExpressionId = shape.afterExpressionId;
};
const mapAlgebraIssues = (
  issues: AlgebraIssue[],
  phase: 'polynomial' | 'rational_function' | 'conditions',
) => issues.map((issue) => algebraIssue(issue, phase));
const polynomialEvidence = (result: PolynomialEquivalenceOutput): AlgebraicStepEvidence => ({
  kind: 'polynomial',
  beforeNormalForm: result.leftNormalForm,
  afterNormalForm: result.rightNormalForm,
});
const rationalEvidence = (result: RationalFunctionEquivalenceOutput): AlgebraicStepEvidence => ({
  kind: 'rational_function',
  beforeNormalForm: result.leftNormalForm,
  afterNormalForm: result.rightNormalForm,
  beforeDomainGuard: result.leftDomainGuard,
  afterDomainGuard: result.rightDomainGuard,
  requiredDomainGuard: result.requiredDomainGuard,
});
const evidenceBytes = (value: AlgebraicStepEvidence) =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;
const finalize = (
  output: AlgebraicStepVerificationOutput,
  limits: StepVerificationLimits,
): AlgebraicStepVerificationOutput => {
  output.issues.sort(compareStepIssues);
  if (output.evidence && evidenceBytes(output.evidence) > limits.maxEvidenceBytes) {
    output.outcome = 'unknown';
    output.conditionStatus = 'not_applicable';
    output.evidence = null;
    output.issues.push(
      stepIssue('STEP_EVIDENCE_SIZE_LIMIT_EXCEEDED', 'output', { stepId: output.stepId }),
    );
    output.issues.sort(compareStepIssues);
  }
  return output;
};

export function verifyAlgebraicStep(
  document: unknown,
  stepId: string,
  verificationMode: AlgebraicStepVerificationMode,
  conditionMode: StepConditionMode,
  overrides: Partial<StepVerificationLimits> = {},
): AlgebraicStepVerificationOutput {
  const limits = resolveStepVerificationLimits(overrides);
  const output = emptyBase(stepId, verificationMode, conditionMode);
  const validation = validateMathDocument(document);
  if (!validation.valid || !validation.document) {
    const diagnostics = projectDiagnostics(validation.diagnostics);
    output.outcome = 'invalid_document';
    output.validationDiagnostics = diagnostics;
    output.totalValidationDiagnostics = diagnostics.length;
    return output;
  }
  const validated = validation.document;
  const step = validated.steps.find((candidate) => candidate.id === stepId);
  if (!step) {
    output.issues = [stepIssue('STEP_NOT_FOUND', 'step_shape', { stepId })];
    return output;
  }
  output.declaredRule = step.rule;
  output.declaredStatus = step.status ?? null;
  output.conclusionStatementId = step.conclusion;
  output.premiseStatementId = step.premises.length === 1 ? (step.premises[0] ?? null) : null;
  output.dependencyIds = [...step.dependencies];
  output.sideConditionIds = [...step.sideConditions];
  if (step.status === 'partial' || step.status === 'unparsed') {
    output.issues = [stepIssue('STEP_NOT_FULLY_PARSED', 'step_shape', { stepId })];
    return output;
  }
  if (!supportedRule(step)) {
    output.issues = [stepIssue('UNSUPPORTED_STEP_RULE', 'step_shape', { stepId })];
    return output;
  }
  let shape: ExtractedStepShape;
  try {
    shape = extractStepShape(validated, step);
  } catch (error) {
    if (!(error instanceof StepVerificationFailure)) throw error;
    output.issues = [stepIssue(error.code, 'step_shape', { ...error.context, stepId })];
    return output;
  }
  applyShape(output, shape);
  if (shape.structuralEvidence) {
    output.outcome = 'verified';
    output.engine = 'structural';
    output.conditionStatus = 'not_required';
    output.evidence = shape.structuralEvidence;
    return finalize(output, limits);
  }
  const before = shape.beforeExpressionId;
  const after = shape.afterExpressionId;
  let polynomial: PolynomialEquivalenceOutput | null = null;
  if (verificationMode !== 'rational_function') {
    polynomial = checkPolynomialEquivalence(validated, before, after, limits);
    output.engine = 'polynomial';
    output.evidence = polynomialEvidence(polynomial);
    output.issues = mapAlgebraIssues(polynomial.issues, 'polynomial');
    if (polynomial.outcome === 'equivalent') {
      output.outcome = 'verified';
      output.conditionStatus = 'not_required';
      return finalize(output, limits);
    }
    if (polynomial.outcome === 'not_equivalent') {
      output.outcome = 'rejected';
      return finalize(output, limits);
    }
    if (polynomial.outcome === 'invalid_document') {
      output.outcome = 'invalid_document';
      output.validationDiagnostics = polynomial.validationDiagnostics;
      output.totalValidationDiagnostics = polynomial.totalValidationDiagnostics;
      return finalize(output, limits);
    }
    if (verificationMode === 'polynomial') return finalize(output, limits);
    const allowed = new Set<string>(AUTO_FALLBACK_ISSUE_CODES);
    if (
      polynomial.issues.length === 0 ||
      polynomial.issues.some((issue) => !allowed.has(issue.code))
    )
      return finalize(output, limits);
  }
  const selected = selectConditions(validated, step, conditionMode);
  output.conditionAnalysis = emptyConditionAnalysis(conditionMode, selected, 'completed');
  if (selected.allIds.length > limits.maxSelectedConditions) {
    output.engine = 'rational_function';
    output.evidence = null;
    output.conditionAnalysis = emptyConditionAnalysis(conditionMode, selected, 'unavailable');
    output.issues = [stepIssue('CONDITION_LIMIT_EXCEEDED', 'conditions', { stepId })];
    return finalize(output, limits);
  }
  const rationalDocument: MathDocument = { ...validated, assumptions: selected.allIds };
  const rational = checkRationalFunctionEquivalence(
    rationalDocument,
    before,
    after,
    conditionMode === 'ignore' ? 'ignore' : 'document_nonzero',
    limits,
  );
  output.engine = 'rational_function';
  output.evidence = rationalEvidence(rational);
  const conditionUnavailable =
    rational.outcome === 'unknown' &&
    selected.allIds.length > 0 &&
    rational.leftNormalForm !== null &&
    rational.rightNormalForm !== null &&
    rational.issues.length > 0;
  const issuePhase = conditionUnavailable ? 'conditions' : 'rational_function';
  output.issues = mapAlgebraIssues(rational.issues, issuePhase);
  output.conditionAnalysis = conditionUnavailable
    ? emptyConditionAnalysis(conditionMode, selected, 'unavailable')
    : completeConditionAnalysis(conditionMode, selected, rational.assumptionAnalysis);
  if (rational.outcome === 'equivalent') {
    output.outcome = 'verified';
    output.conditionStatus =
      rational.conditionStatus === 'satisfied_by_assumptions'
        ? 'satisfied_by_selected_conditions'
        : 'not_required';
  } else if (rational.outcome === 'conditionally_equivalent') {
    output.outcome = 'conditionally_verified';
    output.conditionStatus = 'required';
  } else if (rational.outcome === 'not_equivalent') {
    output.outcome = 'rejected';
  } else if (rational.outcome === 'invalid_document') {
    output.outcome = 'invalid_document';
    output.validationDiagnostics = rational.validationDiagnostics;
    output.totalValidationDiagnostics = rational.totalValidationDiagnostics;
  }
  return finalize(output, limits);
}
