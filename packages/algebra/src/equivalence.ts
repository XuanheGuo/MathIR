import { validateMathDocument } from '@mathir/validator';
import { POLYNOMIAL_SEMANTICS } from './constants.js';
import type { AlgebraLimits } from './constants.js';
import { type AlgebraIssue, compareIssues } from './issues.js';
import type { PolynomialNormalForm } from './normal-form.js';
import {
  type ProviderDiagnostic,
  normalizePolynomial,
  normalizeValidatedPolynomial,
} from './normalize.js';

export interface PolynomialEquivalenceOutput {
  outcome: 'equivalent' | 'not_equivalent' | 'unknown' | 'invalid_document';
  semantics: typeof POLYNOMIAL_SEMANTICS;
  leftExpressionId: string;
  rightExpressionId: string;
  leftNormalForm: PolynomialNormalForm | null;
  rightNormalForm: PolynomialNormalForm | null;
  issues: AlgebraIssue[];
  validationDiagnostics: ProviderDiagnostic[];
  totalValidationDiagnostics: number;
  validationDiagnosticsTruncated: boolean;
}
export function checkPolynomialEquivalence(
  document: unknown,
  leftExpressionId: string,
  rightExpressionId: string,
  overrides: Partial<AlgebraLimits> = {},
): PolynomialEquivalenceOutput {
  const validation = validateMathDocument(document);
  if (!validation.valid || !validation.document) {
    const n = normalizePolynomial(document, leftExpressionId);
    return {
      outcome: 'invalid_document',
      semantics: POLYNOMIAL_SEMANTICS,
      leftExpressionId,
      rightExpressionId,
      leftNormalForm: null,
      rightNormalForm: null,
      issues: [],
      validationDiagnostics: n.validationDiagnostics,
      totalValidationDiagnostics: n.totalValidationDiagnostics,
      validationDiagnosticsTruncated: n.validationDiagnosticsTruncated,
    };
  }
  const left = normalizeValidatedPolynomial(validation.document, leftExpressionId, overrides);
  const right = normalizeValidatedPolynomial(validation.document, rightExpressionId, overrides);
  const issues = [
    ...left.issues.map((x) => ({ ...x, side: 'left' as const })),
    ...right.issues.map((x) => ({ ...x, side: 'right' as const })),
  ].sort(compareIssues);
  const common = {
    semantics: POLYNOMIAL_SEMANTICS,
    leftExpressionId,
    rightExpressionId,
    leftNormalForm: left.normalForm,
    rightNormalForm: right.normalForm,
    issues,
    validationDiagnostics: [] as ProviderDiagnostic[],
    totalValidationDiagnostics: 0,
    validationDiagnosticsTruncated: false,
  };
  if (left.outcome !== 'normalized' || right.outcome !== 'normalized')
    return { outcome: 'unknown', ...common };
  return {
    outcome:
      JSON.stringify(left.normalForm) === JSON.stringify(right.normalForm)
        ? 'equivalent'
        : 'not_equivalent',
    ...common,
  };
}
