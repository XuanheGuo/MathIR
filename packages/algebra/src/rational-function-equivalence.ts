import { validateMathDocument } from '@mathir/validator';
import {
  NONZERO_ASSUMPTION_SEMANTICS,
  RATIONAL_FUNCTION_SEMANTICS,
  type RationalFunctionLimits,
  resolveRationalFunctionLimits,
} from './constants.js';
import { type AlgebraIssue, compareIssues, issue } from './issues.js';
import type { PolynomialNormalForm } from './normal-form.js';
import type { ProviderDiagnostic } from './normalize.js';
import {
  type AssumptionAnalysis,
  type AssumptionMode,
  type InternalRationalFunction,
  type RationalFunctionFailure,
  type RationalFunctionNormalForm,
  analyzeAssumptions,
  evaluateValidatedRationalFunction,
  guardDischarged,
  normalizeRationalFunction,
  rationalFunctionToNormalForm,
  rationalFunctionValuesEqual,
  requiredDomainGuard,
} from './rational-function.js';
import { univariateToNormalForm } from './univariate-polynomial.js';

export interface RationalFunctionEquivalenceOutput {
  outcome:
    | 'equivalent'
    | 'conditionally_equivalent'
    | 'not_equivalent'
    | 'unknown'
    | 'invalid_document';
  semantics: typeof RATIONAL_FUNCTION_SEMANTICS;
  assumptionSemantics: typeof NONZERO_ASSUMPTION_SEMANTICS;
  assumptionMode: AssumptionMode;
  leftExpressionId: string;
  rightExpressionId: string;
  leftNormalForm: RationalFunctionNormalForm | null;
  rightNormalForm: RationalFunctionNormalForm | null;
  leftDomainGuard: PolynomialNormalForm | null;
  rightDomainGuard: PolynomialNormalForm | null;
  requiredDomainGuard: PolynomialNormalForm | null;
  conditionStatus: 'not_required' | 'required' | 'satisfied_by_assumptions' | 'not_applicable';
  assumptionAnalysis: AssumptionAnalysis;
  issues: AlgebraIssue[];
  validationDiagnostics: ProviderDiagnostic[];
  totalValidationDiagnostics: number;
  validationDiagnosticsTruncated: boolean;
}

const emptyAnalysis = (mode: AssumptionMode): AssumptionAnalysis => ({
  mode,
  recognizedStatementIds: [],
  unsupportedStatementIds: [],
  dischargeGuard: null,
});

export function checkRationalFunctionEquivalence(
  document: unknown,
  leftExpressionId: string,
  rightExpressionId: string,
  assumptionMode: AssumptionMode,
  overrides: Partial<RationalFunctionLimits> = {},
): RationalFunctionEquivalenceOutput {
  const validation = validateMathDocument(document);
  const base = {
    semantics: RATIONAL_FUNCTION_SEMANTICS,
    assumptionSemantics: NONZERO_ASSUMPTION_SEMANTICS,
    assumptionMode,
    leftExpressionId,
    rightExpressionId,
    validationDiagnosticsTruncated: false,
  } as const;
  if (!validation.valid || !validation.document) {
    const normalized = normalizeRationalFunction(document, leftExpressionId, assumptionMode);
    return {
      outcome: 'invalid_document',
      ...base,
      leftNormalForm: null,
      rightNormalForm: null,
      leftDomainGuard: null,
      rightDomainGuard: null,
      requiredDomainGuard: null,
      conditionStatus: 'not_applicable',
      assumptionAnalysis: emptyAnalysis(assumptionMode),
      issues: [],
      validationDiagnostics: normalized.validationDiagnostics,
      totalValidationDiagnostics: normalized.totalValidationDiagnostics,
    };
  }
  const limits = resolveRationalFunctionLimits(overrides);
  const results: {
    value: InternalRationalFunction | null;
    issue: AlgebraIssue | null;
  }[] = [];
  for (const [side, expressionId] of [
    ['left', leftExpressionId],
    ['right', rightExpressionId],
  ] as const) {
    try {
      results.push({
        value: evaluateValidatedRationalFunction(validation.document, expressionId, limits),
        issue: null,
      });
    } catch (error) {
      const failure = error as RationalFunctionFailure;
      results.push({
        value: null,
        issue: {
          ...issue(failure.code, failure.expressionId ?? expressionId, failure.path),
          side,
        },
      });
    }
  }
  const left = results[0]?.value ?? null;
  const right = results[1]?.value ?? null;
  const common = {
    ...base,
    leftNormalForm: left ? rationalFunctionToNormalForm(left) : null,
    rightNormalForm: right ? rationalFunctionToNormalForm(right) : null,
    leftDomainGuard: left?.domainGuard ? univariateToNormalForm(left.domainGuard) : null,
    rightDomainGuard: right?.domainGuard ? univariateToNormalForm(right.domainGuard) : null,
    validationDiagnostics: [] as ProviderDiagnostic[],
    totalValidationDiagnostics: 0,
  };
  const algebraIssues = results
    .flatMap((result) => (result.issue ? [result.issue] : []))
    .sort(compareIssues);
  if (!left || !right) {
    return {
      outcome: 'unknown',
      ...common,
      requiredDomainGuard: null,
      conditionStatus: 'not_applicable',
      assumptionAnalysis: emptyAnalysis(assumptionMode),
      issues: algebraIssues,
    };
  }
  if (
    left.variableDeclarationId !== null &&
    right.variableDeclarationId !== null &&
    left.variableDeclarationId !== right.variableDeclarationId
  ) {
    return {
      outcome: 'unknown',
      ...common,
      requiredDomainGuard: null,
      conditionStatus: 'not_applicable',
      assumptionAnalysis: emptyAnalysis(assumptionMode),
      issues: [
        {
          ...issue('MULTIVARIATE_NOT_SUPPORTED', rightExpressionId),
          side: 'right',
        },
      ],
    };
  }
  let analysis: ReturnType<typeof analyzeAssumptions>;
  try {
    analysis = analyzeAssumptions(validation.document, assumptionMode, limits);
  } catch {
    return {
      outcome: 'unknown',
      ...common,
      requiredDomainGuard: null,
      conditionStatus: 'not_applicable',
      assumptionAnalysis: emptyAnalysis(assumptionMode),
      issues: [...algebraIssues, issue('ASSUMPTION_LIMIT_EXCEEDED')],
    };
  }
  if (!rationalFunctionValuesEqual(left, right)) {
    return {
      outcome: 'not_equivalent',
      ...common,
      requiredDomainGuard: null,
      conditionStatus: 'not_applicable',
      assumptionAnalysis: analysis.publicAnalysis,
      issues: [],
    };
  }
  const required = requiredDomainGuard(left.domainGuard, right.domainGuard, limits);
  const requiredNormal = required ? univariateToNormalForm(required) : null;
  if (required === null) {
    return {
      outcome: 'equivalent',
      ...common,
      requiredDomainGuard: null,
      conditionStatus: 'not_required',
      assumptionAnalysis: analysis.publicAnalysis,
      issues: [],
    };
  }
  if (guardDischarged(required, analysis.guard, limits)) {
    return {
      outcome: 'equivalent',
      ...common,
      requiredDomainGuard: requiredNormal,
      conditionStatus: 'satisfied_by_assumptions',
      assumptionAnalysis: analysis.publicAnalysis,
      issues: [],
    };
  }
  return {
    outcome: 'conditionally_equivalent',
    ...common,
    requiredDomainGuard: requiredNormal,
    conditionStatus: 'required',
    assumptionAnalysis: analysis.publicAnalysis,
    issues: [],
  };
}
