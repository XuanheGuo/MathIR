import { z } from 'zod';
import { POLYNOMIAL_SEMANTICS } from './constants.js';
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
