export const POLYNOMIAL_SEMANTICS = 'formal-commutative-polynomial-over-rationals-v1' as const;

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
