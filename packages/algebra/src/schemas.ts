import { z } from 'zod';
import {
  NONZERO_ASSUMPTION_SEMANTICS,
  POLYNOMIAL_SEMANTICS,
  RATIONAL_FUNCTION_SEMANTICS,
} from './constants.js';
const rational = z
  .object({
    numerator: z.string().regex(/^-?[0-9]+$/),
    denominator: z.string().regex(/^[1-9][0-9]*$/),
  })
  .strict();
const power = z
  .object({ declarationId: z.string(), exponent: z.number().int().positive() })
  .strict();
export const polynomialNormalFormSchema = z
  .object({
    kind: z.literal('formal-polynomial'),
    coefficientDomain: z.literal('rational'),
    terms: z.array(z.object({ coefficient: rational, powers: z.array(power) }).strict()),
  })
  .strict();
export const algebraIssueSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    expressionId: z.string().optional(),
    path: z.string().optional(),
    side: z.enum(['left', 'right']).optional(),
  })
  .strict();
const diagnostic = z
  .object({
    code: z.string(),
    severity: z.enum(['error', 'warning']),
    message: z.string(),
    path: z.string().optional(),
    entity: z.object({ kind: z.string(), id: z.string().optional() }).strict().optional(),
    related: z.array(z.object({ kind: z.string(), id: z.string() }).strict()).optional(),
  })
  .strict();
export const normalizePolynomialOutputSchema = z
  .object({
    outcome: z.enum(['normalized', 'unsupported', 'invalid_document']),
    semantics: z.literal(POLYNOMIAL_SEMANTICS),
    expressionId: z.string(),
    normalForm: polynomialNormalFormSchema.nullable(),
    issues: z.array(algebraIssueSchema),
    validationDiagnostics: z.array(diagnostic),
    totalValidationDiagnostics: z.number().int().nonnegative(),
    validationDiagnosticsTruncated: z.boolean(),
  })
  .strict();
export const polynomialEquivalenceOutputSchema = z
  .object({
    outcome: z.enum(['equivalent', 'not_equivalent', 'unknown', 'invalid_document']),
    semantics: z.literal(POLYNOMIAL_SEMANTICS),
    leftExpressionId: z.string(),
    rightExpressionId: z.string(),
    leftNormalForm: polynomialNormalFormSchema.nullable(),
    rightNormalForm: polynomialNormalFormSchema.nullable(),
    issues: z.array(algebraIssueSchema),
    validationDiagnostics: z.array(diagnostic),
    totalValidationDiagnostics: z.number().int().nonnegative(),
    validationDiagnosticsTruncated: z.boolean(),
  })
  .strict();

export const rationalFunctionNormalFormSchema = z
  .object({
    kind: z.literal('formal-univariate-rational-function'),
    coefficientDomain: z.literal('rational'),
    variableDeclarationId: z.string().nullable(),
    numerator: polynomialNormalFormSchema,
    denominator: polynomialNormalFormSchema,
  })
  .strict();
export const assumptionAnalysisSchema = z
  .object({
    mode: z.enum(['ignore', 'document_nonzero']),
    recognizedStatementIds: z.array(z.string()),
    unsupportedStatementIds: z.array(z.string()),
    dischargeGuard: polynomialNormalFormSchema.nullable(),
  })
  .strict();
const rationalOutputBase = {
  semantics: z.literal(RATIONAL_FUNCTION_SEMANTICS),
  assumptionSemantics: z.literal(NONZERO_ASSUMPTION_SEMANTICS),
  assumptionMode: z.enum(['ignore', 'document_nonzero']),
  assumptionAnalysis: assumptionAnalysisSchema,
  issues: z.array(algebraIssueSchema),
  validationDiagnostics: z.array(diagnostic),
  totalValidationDiagnostics: z.number().int().nonnegative(),
  validationDiagnosticsTruncated: z.boolean(),
};
export const normalizeRationalFunctionOutputSchema = z
  .object({
    outcome: z.enum(['normalized', 'unsupported', 'invalid_document']),
    ...rationalOutputBase,
    expressionId: z.string(),
    normalForm: rationalFunctionNormalFormSchema.nullable(),
    domainGuard: polynomialNormalFormSchema.nullable(),
    domainStatus: z.enum([
      'unrestricted',
      'required',
      'satisfied_by_assumptions',
      'not_applicable',
    ]),
  })
  .strict();
export const rationalFunctionEquivalenceOutputSchema = z
  .object({
    outcome: z.enum([
      'equivalent',
      'conditionally_equivalent',
      'not_equivalent',
      'unknown',
      'invalid_document',
    ]),
    ...rationalOutputBase,
    leftExpressionId: z.string(),
    rightExpressionId: z.string(),
    leftNormalForm: rationalFunctionNormalFormSchema.nullable(),
    rightNormalForm: rationalFunctionNormalFormSchema.nullable(),
    leftDomainGuard: polynomialNormalFormSchema.nullable(),
    rightDomainGuard: polynomialNormalFormSchema.nullable(),
    requiredDomainGuard: polynomialNormalFormSchema.nullable(),
    conditionStatus: z.enum([
      'not_required',
      'required',
      'satisfied_by_assumptions',
      'not_applicable',
    ]),
  })
  .strict();
