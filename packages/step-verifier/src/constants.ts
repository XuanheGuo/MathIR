import {
  DEFAULT_ALGEBRA_LIMITS,
  DEFAULT_RATIONAL_FUNCTION_LIMITS,
  type RationalFunctionLimits,
} from '@mathir/algebra';

export const ALGEBRAIC_STEP_VERIFICATION_SEMANTICS =
  'exact-algebraic-identity-and-anchored-rewrite-step-verification-v1' as const;

export const DEFAULT_STEP_VERIFICATION_LIMITS = {
  maxSelectedConditions: 512,
  maxIssueCount: 1_024,
  maxEvidenceBytes: 700 * 1024,
} as const;

export type StepVerificationLimits = RationalFunctionLimits & {
  [K in keyof typeof DEFAULT_STEP_VERIFICATION_LIMITS]: number;
};

export const resolveStepVerificationLimits = (
  overrides: Partial<StepVerificationLimits> = {},
): StepVerificationLimits => ({
  ...DEFAULT_ALGEBRA_LIMITS,
  ...DEFAULT_RATIONAL_FUNCTION_LIMITS,
  ...DEFAULT_STEP_VERIFICATION_LIMITS,
  ...overrides,
});

export const AUTO_FALLBACK_ISSUE_CODES = ['NON_CONSTANT_DIVISOR', 'INVALID_EXPONENT'] as const;
