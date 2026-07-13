import type { Expression, MathDocument } from '@mathir/contracts';
import { type Diagnostic, validateMathDocument } from '@mathir/validator';
import { type AlgebraLimits, DEFAULT_ALGEBRA_LIMITS, POLYNOMIAL_SEMANTICS } from './constants.js';
import { type AlgebraIssue, type AlgebraIssueCode, compareIssues, issue } from './issues.js';
import {
  type InternalPolynomial,
  type PolynomialNormalForm,
  addPolynomial,
  constantPolynomial,
  multiplyPolynomial,
  negatePolynomial,
  powerPolynomial,
  toNormalForm,
  variablePolynomial,
} from './normal-form.js';
import {
  RationalError,
  checkRationalLimit,
  divideRational,
  isIntegerRational,
  multiplyRational,
  parseExactRational,
  rational,
} from './rational.js';

export interface ProviderDiagnostic {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  path?: string;
  entity?: { kind: string; id?: string };
  related?: { kind: string; id: string }[];
}
export interface NormalizePolynomialOutput {
  outcome: 'normalized' | 'unsupported' | 'invalid_document';
  semantics: typeof POLYNOMIAL_SEMANTICS;
  expressionId: string;
  normalForm: PolynomialNormalForm | null;
  issues: AlgebraIssue[];
  validationDiagnostics: ProviderDiagnostic[];
  totalValidationDiagnostics: number;
  validationDiagnosticsTruncated: boolean;
}
class AlgebraFailure extends Error {
  constructor(
    readonly code: AlgebraIssueCode,
    readonly expressionId?: string,
    readonly path?: string,
  ) {
    super(code);
  }
}
const pathFor = (index: number) => `/expressions/${index}`;
const errorCode = (err: unknown): AlgebraIssueCode => {
  if (err instanceof AlgebraFailure || err instanceof RationalError) return err.code;
  if (
    err instanceof Error &&
    ['TERM_LIMIT_EXCEEDED', 'DEGREE_LIMIT_EXCEEDED', 'COEFFICIENT_LIMIT_EXCEEDED'].includes(
      err.message,
    )
  )
    return err.message as AlgebraIssueCode;
  throw err;
};
function projectDiagnostic(d: Diagnostic): ProviderDiagnostic {
  const out: ProviderDiagnostic = { code: d.code, severity: d.severity, message: d.message };
  if (d.path !== undefined) out.path = d.path;
  if (d.entity !== undefined) out.entity = d.entity;
  if (d.related !== undefined) out.related = d.related;
  return out;
}

export function normalizePolynomial(
  document: unknown,
  expressionId: string,
): NormalizePolynomialOutput {
  const validation = validateMathDocument(document);
  if (!validation.valid || !validation.document) {
    const diagnostics = validation.diagnostics.map(projectDiagnostic);
    return {
      outcome: 'invalid_document',
      semantics: POLYNOMIAL_SEMANTICS,
      expressionId,
      normalForm: null,
      issues: [],
      validationDiagnostics: diagnostics,
      totalValidationDiagnostics: diagnostics.length,
      validationDiagnosticsTruncated: false,
    };
  }
  return normalizeValidatedPolynomial(validation.document, expressionId);
}

export function normalizeValidatedPolynomial(
  document: MathDocument,
  expressionId: string,
  overrides: Partial<AlgebraLimits> = {},
): NormalizePolynomialOutput {
  const limits: AlgebraLimits = { ...DEFAULT_ALGEBRA_LIMITS, ...overrides };
  const expressions = new Map<string, { expression: Expression; index: number }>(
    document.expressions.map((expression, index) => [expression.id, { expression, index }]),
  );
  const declarations = new Map(document.declarations.map((d) => [d.id, d]));
  const memo = new Map<string, InternalPolynomial>();
  const visiting = new Set<string>();
  let visited = 0;
  const fail = (code: AlgebraIssueCode, id?: string, path?: string): never => {
    throw new AlgebraFailure(code, id, path);
  };
  const visit = (id: string, depth: number): InternalPolynomial => {
    const cached = memo.get(id);
    if (cached) return cached;
    const found = expressions.get(id);
    if (!found) return fail('EXPRESSION_NOT_FOUND', id);
    const base = pathFor(found.index);
    if (depth > limits.maxExpressionDepth) return fail('DEPTH_LIMIT_EXCEEDED', id, base);
    if (visiting.has(id)) return fail('EXPRESSION_CYCLE', id, base);
    visited += 1;
    if (visited > limits.maxVisitedExpressions) return fail('EXPRESSION_LIMIT_EXCEEDED', id, base);
    visiting.add(id);
    try {
      const x = found.expression;
      let result: InternalPolynomial;
      switch (x.kind) {
        case 'number':
          result = constantPolynomial(parseExactRational(x.value, x.numberKind, limits));
          break;
        case 'symbol': {
          const declaration = declarations.get(x.declarationId);
          if (!declaration || declaration.kind !== 'symbol')
            return fail('UNSUPPORTED_EXPRESSION_KIND', id, base);
          if (declaration.domain?.kind === 'boolean' || declaration.domain?.kind === 'set')
            return fail('UNSUPPORTED_SYMBOL_DOMAIN', id, `${base}/declarationId`);
          result = variablePolynomial(x.declarationId);
          break;
        }
        case 'unary':
          if (x.operator !== 'negate') return fail('UNSUPPORTED_OPERATOR', id, `${base}/operator`);
          result = negatePolynomial(visit(x.operand, depth + 1));
          break;
        case 'nary': {
          if (x.operator !== 'add' && x.operator !== 'multiply')
            return fail('UNSUPPORTED_OPERATOR', id, `${base}/operator`);
          result =
            x.operator === 'add'
              ? constantPolynomial(rational(0n))
              : constantPolynomial(rational(1n));
          for (const operand of x.operands)
            result =
              x.operator === 'add'
                ? addPolynomial(result, visit(operand, depth + 1), limits)
                : multiplyPolynomial(result, visit(operand, depth + 1), limits);
          break;
        }
        case 'binary': {
          if (x.operator === 'subtract')
            result = addPolynomial(
              visit(x.left, depth + 1),
              negatePolynomial(visit(x.right, depth + 1)),
              limits,
            );
          else if (x.operator === 'divide') {
            const left = visit(x.left, depth + 1);
            const right = visit(x.right, depth + 1);
            if (right.size === 0) return fail('DIVISION_BY_ZERO', id, `${base}/right`);
            const divisor = right.get('');
            if (right.size !== 1 || !divisor)
              return fail('NON_CONSTANT_DIVISOR', id, `${base}/right`);
            if (divisor.coefficient.numerator === 0n)
              return fail('DIVISION_BY_ZERO', id, `${base}/right`);
            const inverse = divideRational(rational(1n), divisor.coefficient);
            result = new Map(
              [...left].map(([key, term]) => [
                key,
                {
                  ...term,
                  coefficient: checkRationalLimit(
                    multiplyRational(term.coefficient, inverse),
                    limits,
                  ),
                },
              ]),
            );
          } else if (x.operator === 'power') {
            const exponentPoly = visit(x.right, depth + 1);
            const term = exponentPoly.get('');
            const exponent =
              exponentPoly.size === 0
                ? rational(0n)
                : exponentPoly.size === 1 && term
                  ? term.coefficient
                  : null;
            if (
              !exponent ||
              !isIntegerRational(exponent) ||
              exponent.numerator < 0n ||
              exponent.numerator > BigInt(limits.maxExponent)
            )
              return fail('INVALID_EXPONENT', id, `${base}/right`);
            result = powerPolynomial(visit(x.left, depth + 1), Number(exponent.numerator), limits);
          } else return fail('UNSUPPORTED_OPERATOR', id, `${base}/operator`);
          break;
        }
        case 'function_call':
        case 'piecewise':
        case 'unparsed':
          return fail('UNSUPPORTED_EXPRESSION_KIND', id, base);
      }
      memo.set(id, result);
      return result;
    } catch (err) {
      if (err instanceof AlgebraFailure) throw err;
      throw new AlgebraFailure(errorCode(err), id, base);
    } finally {
      visiting.delete(id);
    }
  };
  try {
    const normalForm = toNormalForm(visit(expressionId, 0));
    if (Buffer.byteLength(JSON.stringify(normalForm), 'utf8') > limits.maxNormalFormBytes)
      throw new AlgebraFailure('NORMAL_FORM_SIZE_LIMIT_EXCEEDED', expressionId);
    return {
      outcome: 'normalized',
      semantics: POLYNOMIAL_SEMANTICS,
      expressionId,
      normalForm,
      issues: [],
      validationDiagnostics: [],
      totalValidationDiagnostics: 0,
      validationDiagnosticsTruncated: false,
    };
  } catch (err) {
    const code = errorCode(err);
    const failure = err instanceof AlgebraFailure ? err : undefined;
    return {
      outcome: 'unsupported',
      semantics: POLYNOMIAL_SEMANTICS,
      expressionId,
      normalForm: null,
      issues: [issue(code, failure?.expressionId ?? expressionId, failure?.path)].sort(
        compareIssues,
      ),
      validationDiagnostics: [],
      totalValidationDiagnostics: 0,
      validationDiagnosticsTruncated: false,
    };
  }
}
