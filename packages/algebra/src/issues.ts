export const ALGEBRA_ISSUE_CODES = [
  'EXPRESSION_NOT_FOUND',
  'UNSUPPORTED_EXPRESSION_KIND',
  'UNSUPPORTED_OPERATOR',
  'UNSUPPORTED_SYMBOL_DOMAIN',
  'INVALID_NUMBER_LITERAL',
  'DIVISION_BY_ZERO',
  'NON_CONSTANT_DIVISOR',
  'INVALID_EXPONENT',
  'EXPRESSION_CYCLE',
  'DEPTH_LIMIT_EXCEEDED',
  'EXPRESSION_LIMIT_EXCEEDED',
  'TERM_LIMIT_EXCEEDED',
  'DEGREE_LIMIT_EXCEEDED',
  'COEFFICIENT_LIMIT_EXCEEDED',
  'NORMAL_FORM_SIZE_LIMIT_EXCEEDED',
  'MULTIVARIATE_NOT_SUPPORTED',
  'POLYNOMIAL_DIVISION_LIMIT_EXCEEDED',
  'GCD_STEP_LIMIT_EXCEEDED',
  'DOMAIN_GUARD_LIMIT_EXCEEDED',
  'ASSUMPTION_LIMIT_EXCEEDED',
  'RATIONAL_FUNCTION_SIZE_LIMIT_EXCEEDED',
] as const;
export type AlgebraIssueCode = (typeof ALGEBRA_ISSUE_CODES)[number];
export interface AlgebraIssue {
  code: AlgebraIssueCode;
  message: string;
  expressionId?: string;
  path?: string;
  side?: 'left' | 'right';
}

const messages: Record<AlgebraIssueCode, string> = {
  EXPRESSION_NOT_FOUND: 'Expression was not found.',
  UNSUPPORTED_EXPRESSION_KIND: 'Expression kind is not supported by polynomial semantics.',
  UNSUPPORTED_OPERATOR: 'Operator is not supported by polynomial semantics.',
  UNSUPPORTED_SYMBOL_DOMAIN: 'Symbol domain is not supported by polynomial semantics.',
  INVALID_NUMBER_LITERAL: 'Number literal is not an exact supported literal.',
  DIVISION_BY_ZERO: 'Division by zero is not defined.',
  NON_CONSTANT_DIVISOR: 'Polynomial division requires a nonzero constant divisor.',
  INVALID_EXPONENT: 'Exponent must be an exact nonnegative integer within the configured limit.',
  EXPRESSION_CYCLE: 'Expression graph contains a cycle.',
  DEPTH_LIMIT_EXCEEDED: 'Expression depth limit exceeded.',
  EXPRESSION_LIMIT_EXCEEDED: 'Visited expression limit exceeded.',
  TERM_LIMIT_EXCEEDED: 'Polynomial term limit exceeded.',
  DEGREE_LIMIT_EXCEEDED: 'Polynomial total degree limit exceeded.',
  COEFFICIENT_LIMIT_EXCEEDED: 'Rational coefficient bit limit exceeded.',
  NORMAL_FORM_SIZE_LIMIT_EXCEEDED: 'Polynomial normal form byte-size limit exceeded.',
  MULTIVARIATE_NOT_SUPPORTED: 'Only constant or univariate rational functions are supported.',
  POLYNOMIAL_DIVISION_LIMIT_EXCEEDED: 'Polynomial division step limit exceeded.',
  GCD_STEP_LIMIT_EXCEEDED: 'Polynomial GCD step limit exceeded.',
  DOMAIN_GUARD_LIMIT_EXCEEDED: 'Domain guard degree limit exceeded.',
  ASSUMPTION_LIMIT_EXCEEDED: 'Document assumption processing limit exceeded.',
  RATIONAL_FUNCTION_SIZE_LIMIT_EXCEEDED: 'Rational-function normal form byte-size limit exceeded.',
};
export function issue(code: AlgebraIssueCode, expressionId?: string, path?: string): AlgebraIssue {
  const result: AlgebraIssue = { code, message: messages[code] };
  if (expressionId !== undefined) result.expressionId = expressionId;
  if (path !== undefined) result.path = path;
  return result;
}
export function compareIssues(a: AlgebraIssue, b: AlgebraIssue): number {
  const side = (v?: 'left' | 'right') => (v === 'left' ? 0 : v === 'right' ? 1 : 2);
  const values: [string | number, string | number][] = [
    [side(a.side), side(b.side)],
    [a.path ?? '', b.path ?? ''],
    [a.code, b.code],
    [a.expressionId ?? '', b.expressionId ?? ''],
  ];
  for (const [x, y] of values) {
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}
