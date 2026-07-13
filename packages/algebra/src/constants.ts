export const POLYNOMIAL_SEMANTICS = 'formal-commutative-polynomial-over-rationals-v1' as const;
export const RATIONAL_FUNCTION_SEMANTICS =
  'formal-univariate-rational-function-over-rationals-with-domain-guards-v1' as const;
export const NONZERO_ASSUMPTION_SEMANTICS =
  'explicit-polynomial-nonzero-document-assumptions-v1' as const;

export const DEFAULT_ALGEBRA_LIMITS = {
  maxVisitedExpressions: 10_000,
  maxExpressionDepth: 512,
  maxTerms: 4_096,
  maxExponent: 256,
  maxTotalDegree: 256,
  maxIntegerLiteralDigits: 1_024,
  maxCoefficientBits: 4_096,
  maxNormalFormBytes: 300 * 1024,
} as const;

export type AlgebraLimits = { [K in keyof typeof DEFAULT_ALGEBRA_LIMITS]: number };

export const DEFAULT_RATIONAL_FUNCTION_LIMITS = {
  maxPolynomialDegree: 256,
  maxPolynomialTerms: 257,
  maxPolynomialDivisionSteps: 1_024,
  maxGcdSteps: 512,
  maxDomainGuardDegree: 256,
  maxAssumptions: 512,
  maxRationalFunctionBytes: 300 * 1024,
} as const;

export type RationalFunctionLimits = AlgebraLimits & {
  [K in keyof typeof DEFAULT_RATIONAL_FUNCTION_LIMITS]: number;
};

export const resolveRationalFunctionLimits = (
  overrides: Partial<RationalFunctionLimits> = {},
): RationalFunctionLimits => ({
  ...DEFAULT_ALGEBRA_LIMITS,
  ...DEFAULT_RATIONAL_FUNCTION_LIMITS,
  ...overrides,
});
