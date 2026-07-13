import type { Expression, MathDocument } from '@mathir/contracts';
import { type Diagnostic, validateMathDocument } from '@mathir/validator';
import {
  NONZERO_ASSUMPTION_SEMANTICS,
  RATIONAL_FUNCTION_SEMANTICS,
  type RationalFunctionLimits,
  resolveRationalFunctionLimits,
} from './constants.js';
import { type AlgebraIssue, type AlgebraIssueCode, issue } from './issues.js';
import type { PolynomialNormalForm } from './normal-form.js';
import {
  type ProviderDiagnostic,
  normalizeValidatedPolynomial,
  utf8ByteLength,
} from './normalize.js';
import {
  RationalError,
  divideRational,
  isIntegerRational,
  parseExactRational,
  rational,
} from './rational.js';
import {
  type InternalUnivariatePolynomial,
  univariateAdd,
  univariateConstant,
  univariateDegree,
  univariateDivmod,
  univariateEquals,
  univariateExactQuotient,
  univariateFromNormalForm,
  univariateGcd,
  univariateIsZero,
  univariateLeadingCoefficient,
  univariateMonic,
  univariateMultiply,
  univariateNegate,
  univariateOne,
  univariatePower,
  univariateScale,
  univariateSquareFree,
  univariateToNormalForm,
  univariateVariable,
  univariateZero,
} from './univariate-polynomial.js';

export type AssumptionMode = 'ignore' | 'document_nonzero';
export interface RationalFunctionNormalForm {
  kind: 'formal-univariate-rational-function';
  coefficientDomain: 'rational';
  variableDeclarationId: string | null;
  numerator: PolynomialNormalForm;
  denominator: PolynomialNormalForm;
}
export interface AssumptionAnalysis {
  mode: AssumptionMode;
  recognizedStatementIds: string[];
  unsupportedStatementIds: string[];
  dischargeGuard: PolynomialNormalForm | null;
}
export interface NormalizeRationalFunctionOutput {
  outcome: 'normalized' | 'unsupported' | 'invalid_document';
  semantics: typeof RATIONAL_FUNCTION_SEMANTICS;
  assumptionSemantics: typeof NONZERO_ASSUMPTION_SEMANTICS;
  assumptionMode: AssumptionMode;
  expressionId: string;
  normalForm: RationalFunctionNormalForm | null;
  domainGuard: PolynomialNormalForm | null;
  domainStatus: 'unrestricted' | 'required' | 'satisfied_by_assumptions' | 'not_applicable';
  assumptionAnalysis: AssumptionAnalysis;
  issues: AlgebraIssue[];
  validationDiagnostics: ProviderDiagnostic[];
  totalValidationDiagnostics: number;
  validationDiagnosticsTruncated: boolean;
}

export interface InternalRationalFunction {
  variableDeclarationId: string | null;
  numerator: InternalUnivariatePolynomial;
  denominator: InternalUnivariatePolynomial;
  domainGuard: InternalUnivariatePolynomial | null;
}

export class RationalFunctionFailure extends Error {
  constructor(
    readonly code: AlgebraIssueCode,
    readonly expressionId?: string,
    readonly path?: string,
  ) {
    super(code);
  }
}

const emptyAnalysis = (mode: AssumptionMode): AssumptionAnalysis => ({
  mode,
  recognizedStatementIds: [],
  unsupportedStatementIds: [],
  dischargeGuard: null,
});
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const projectDiagnostic = (d: Diagnostic): ProviderDiagnostic => {
  const out: ProviderDiagnostic = { code: d.code, severity: d.severity, message: d.message };
  if (d.path !== undefined) out.path = d.path;
  if (d.entity !== undefined) out.entity = d.entity;
  if (d.related !== undefined) out.related = d.related;
  return out;
};
const MAPPABLE_RATIONAL_FUNCTION_ERROR_CODES = [
  'MULTIVARIATE_NOT_SUPPORTED',
  'POLYNOMIAL_DIVISION_LIMIT_EXCEEDED',
  'GCD_STEP_LIMIT_EXCEEDED',
  'DOMAIN_GUARD_LIMIT_EXCEEDED',
  'ASSUMPTION_LIMIT_EXCEEDED',
  'RATIONAL_FUNCTION_SIZE_LIMIT_EXCEEDED',
  'DIVISION_BY_ZERO',
  'TERM_LIMIT_EXCEEDED',
  'DEGREE_LIMIT_EXCEEDED',
  'COEFFICIENT_LIMIT_EXCEEDED',
] as const satisfies readonly AlgebraIssueCode[];
const isMappableRationalFunctionErrorCode = (
  code: string,
): code is (typeof MAPPABLE_RATIONAL_FUNCTION_ERROR_CODES)[number] =>
  MAPPABLE_RATIONAL_FUNCTION_ERROR_CODES.some((candidate) => candidate === code);
export function mapRationalFunctionError(error: unknown): AlgebraIssueCode {
  if (error instanceof RationalFunctionFailure || error instanceof RationalError) return error.code;
  if (
    error instanceof Error &&
    Object.getPrototypeOf(error) === Error.prototype &&
    isMappableRationalFunctionErrorCode(error.message)
  )
    return error.message;
  throw error;
}

function mergeVariable(a: string | null, b: string | null): string | null {
  if (a !== null && b !== null && a !== b) throw new Error('MULTIVARIATE_NOT_SUPPORTED');
  return a ?? b;
}
function combineGuards(
  guards: (InternalUnivariatePolynomial | null)[],
  limits: RationalFunctionLimits,
): InternalUnivariatePolynomial | null {
  let combined = univariateOne(limits);
  let constrained = false;
  for (const guard of guards) {
    if (guard === null) continue;
    if (univariateIsZero(guard)) throw new Error('DIVISION_BY_ZERO');
    if (univariateDegree(guard) === 0) continue;
    const normalized = univariateSquareFree(univariateMonic(guard, limits), limits);
    constrained = true;
    if (univariateDegree(combined) === 0) {
      combined = normalized;
      if (univariateDegree(combined) > limits.maxDomainGuardDegree)
        throw new Error('DOMAIN_GUARD_LIMIT_EXCEEDED');
      continue;
    }
    if (univariateEquals(combined, normalized)) continue;
    const common =
      univariateDegree(combined) >= univariateDegree(normalized)
        ? univariateGcd(combined, normalized, limits)
        : univariateGcd(normalized, combined, limits);
    const extra = univariateExactQuotient(normalized, common, limits);
    if (univariateDegree(combined) + univariateDegree(extra) > limits.maxDomainGuardDegree)
      throw new Error('DOMAIN_GUARD_LIMIT_EXCEEDED');
    combined = univariateMonic(univariateMultiply(combined, extra, limits), limits);
  }
  if (!constrained) return null;
  return univariateDegree(combined) === 0 ? null : combined;
}
function reduceRationalFunction(
  variableDeclarationId: string | null,
  numerator: InternalUnivariatePolynomial,
  denominator: InternalUnivariatePolynomial,
  domainGuard: InternalUnivariatePolynomial | null,
  limits: RationalFunctionLimits,
): InternalRationalFunction {
  if (univariateIsZero(denominator)) throw new Error('DIVISION_BY_ZERO');
  if (univariateIsZero(numerator)) {
    return {
      variableDeclarationId,
      numerator: univariateZero(),
      denominator: univariateOne(limits),
      domainGuard,
    };
  }
  const divisor = univariateGcd(numerator, denominator, limits);
  let reducedNumerator = univariateExactQuotient(numerator, divisor, limits);
  let reducedDenominator = univariateExactQuotient(denominator, divisor, limits);
  const inverseLeading = divideRational(
    rational(1n),
    univariateLeadingCoefficient(reducedDenominator),
  );
  reducedNumerator = univariateScale(reducedNumerator, inverseLeading, limits);
  reducedDenominator = univariateScale(reducedDenominator, inverseLeading, limits);
  return {
    variableDeclarationId,
    numerator: reducedNumerator,
    denominator: reducedDenominator,
    domainGuard,
  };
}
function rfConstant(
  value: ReturnType<typeof rational>,
  limits: RationalFunctionLimits,
): InternalRationalFunction {
  return {
    variableDeclarationId: null,
    numerator: univariateConstant(value, limits),
    denominator: univariateOne(limits),
    domainGuard: null,
  };
}
function rfAdd(
  a: InternalRationalFunction,
  b: InternalRationalFunction,
  limits: RationalFunctionLimits,
): InternalRationalFunction {
  const variable = mergeVariable(a.variableDeclarationId, b.variableDeclarationId);
  return reduceRationalFunction(
    variable,
    univariateAdd(
      univariateMultiply(a.numerator, b.denominator, limits),
      univariateMultiply(b.numerator, a.denominator, limits),
      limits,
    ),
    univariateMultiply(a.denominator, b.denominator, limits),
    combineGuards([a.domainGuard, b.domainGuard], limits),
    limits,
  );
}
function rfMultiply(
  a: InternalRationalFunction,
  b: InternalRationalFunction,
  limits: RationalFunctionLimits,
): InternalRationalFunction {
  return reduceRationalFunction(
    mergeVariable(a.variableDeclarationId, b.variableDeclarationId),
    univariateMultiply(a.numerator, b.numerator, limits),
    univariateMultiply(a.denominator, b.denominator, limits),
    combineGuards([a.domainGuard, b.domainGuard], limits),
    limits,
  );
}
function rfDivide(
  a: InternalRationalFunction,
  b: InternalRationalFunction,
  limits: RationalFunctionLimits,
): InternalRationalFunction {
  if (univariateIsZero(b.numerator)) throw new Error('DIVISION_BY_ZERO');
  return reduceRationalFunction(
    mergeVariable(a.variableDeclarationId, b.variableDeclarationId),
    univariateMultiply(a.numerator, b.denominator, limits),
    univariateMultiply(a.denominator, b.numerator, limits),
    combineGuards([a.domainGuard, b.domainGuard, b.numerator], limits),
    limits,
  );
}
function rfPower(
  base: InternalRationalFunction,
  exponent: number,
  exponentGuard: InternalUnivariatePolynomial | null,
  limits: RationalFunctionLimits,
): InternalRationalFunction {
  const guard = combineGuards(
    [base.domainGuard, exponentGuard, exponent < 0 ? base.numerator : null],
    limits,
  );
  if (exponent === 0)
    return reduceRationalFunction(
      base.variableDeclarationId,
      univariateOne(limits),
      univariateOne(limits),
      guard,
      limits,
    );
  const n = Math.abs(exponent);
  return reduceRationalFunction(
    base.variableDeclarationId,
    univariatePower(exponent > 0 ? base.numerator : base.denominator, n, limits),
    univariatePower(exponent > 0 ? base.denominator : base.numerator, n, limits),
    guard,
    limits,
  );
}

export function evaluateValidatedRationalFunction(
  document: MathDocument,
  expressionId: string,
  overrides: Partial<RationalFunctionLimits> = {},
): InternalRationalFunction {
  const limits = resolveRationalFunctionLimits(overrides);
  const expressions = new Map<string, { expression: Expression; index: number }>(
    document.expressions.map((expression, index) => [expression.id, { expression, index }]),
  );
  const declarations = new Map(
    document.declarations.map((declaration) => [declaration.id, declaration]),
  );
  const memo = new Map<string, InternalRationalFunction>();
  const visiting = new Set<string>();
  let visited = 0;
  const fail = (code: AlgebraIssueCode, id?: string, path?: string): never => {
    throw new RationalFunctionFailure(code, id, path);
  };
  const visit = (id: string, depth: number): InternalRationalFunction => {
    const cached = memo.get(id);
    if (cached) return cached;
    const found = expressions.get(id);
    if (!found) return fail('EXPRESSION_NOT_FOUND', id);
    const path = `/expressions/${found.index}`;
    if (depth > limits.maxExpressionDepth) return fail('DEPTH_LIMIT_EXCEEDED', id, path);
    if (visiting.has(id)) return fail('EXPRESSION_CYCLE', id, path);
    visited += 1;
    if (visited > limits.maxVisitedExpressions) return fail('EXPRESSION_LIMIT_EXCEEDED', id, path);
    visiting.add(id);
    try {
      const expression = found.expression;
      let result: InternalRationalFunction;
      switch (expression.kind) {
        case 'number':
          result = rfConstant(
            parseExactRational(expression.value, expression.numberKind, limits),
            limits,
          );
          break;
        case 'symbol': {
          const declaration = declarations.get(expression.declarationId);
          if (!declaration || declaration.kind !== 'symbol')
            return fail('UNSUPPORTED_EXPRESSION_KIND', id, path);
          if (declaration.domain?.kind === 'boolean' || declaration.domain?.kind === 'set')
            return fail('UNSUPPORTED_SYMBOL_DOMAIN', id, `${path}/declarationId`);
          result = {
            variableDeclarationId: expression.declarationId,
            numerator: univariateVariable(expression.declarationId, limits),
            denominator: univariateOne(limits),
            domainGuard: null,
          };
          break;
        }
        case 'unary':
          if (expression.operator !== 'negate')
            return fail('UNSUPPORTED_OPERATOR', id, `${path}/operator`);
          {
            const child = visit(expression.operand, depth + 1);
            result = {
              ...child,
              numerator: univariateNegate(child.numerator, limits),
            };
          }
          break;
        case 'nary': {
          if (expression.operator !== 'add' && expression.operator !== 'multiply')
            return fail('UNSUPPORTED_OPERATOR', id, `${path}/operator`);
          result = rfConstant(rational(expression.operator === 'add' ? 0n : 1n), limits);
          for (const operand of expression.operands)
            result =
              expression.operator === 'add'
                ? rfAdd(result, visit(operand, depth + 1), limits)
                : rfMultiply(result, visit(operand, depth + 1), limits);
          break;
        }
        case 'binary':
          if (expression.operator === 'subtract') {
            const right = visit(expression.right, depth + 1);
            result = rfAdd(
              visit(expression.left, depth + 1),
              { ...right, numerator: univariateNegate(right.numerator, limits) },
              limits,
            );
          } else if (expression.operator === 'divide') {
            result = rfDivide(
              visit(expression.left, depth + 1),
              visit(expression.right, depth + 1),
              limits,
            );
          } else if (expression.operator === 'power') {
            const exponentValue = visit(expression.right, depth + 1);
            const numerator =
              exponentValue.numerator.coefficients.get(0) ??
              (univariateIsZero(exponentValue.numerator) ? rational(0n) : undefined);
            const denominator = exponentValue.denominator.coefficients.get(0);
            if (
              exponentValue.numerator.coefficients.size > 1 ||
              exponentValue.denominator.coefficients.size > 1 ||
              !numerator ||
              !denominator
            )
              return fail('INVALID_EXPONENT', id, `${path}/right`);
            const exponent = divideRational(numerator, denominator);
            if (
              !isIntegerRational(exponent) ||
              exponent.numerator < -256n ||
              exponent.numerator > 256n
            )
              return fail('INVALID_EXPONENT', id, `${path}/right`);
            const base = visit(expression.left, depth + 1);
            const variable = mergeVariable(
              base.variableDeclarationId,
              exponentValue.variableDeclarationId,
            );
            result = {
              ...rfPower(base, Number(exponent.numerator), exponentValue.domainGuard, limits),
              variableDeclarationId: variable,
            };
          } else return fail('UNSUPPORTED_OPERATOR', id, `${path}/operator`);
          break;
        case 'function_call':
        case 'piecewise':
        case 'unparsed':
          return fail('UNSUPPORTED_EXPRESSION_KIND', id, path);
      }
      memo.set(id, result);
      return result;
    } catch (error) {
      if (error instanceof RationalFunctionFailure) throw error;
      throw new RationalFunctionFailure(mapRationalFunctionError(error), id, path);
    } finally {
      visiting.delete(id);
    }
  };
  return visit(expressionId, 0);
}

export const rationalFunctionToNormalForm = (
  value: InternalRationalFunction,
): RationalFunctionNormalForm => ({
  kind: 'formal-univariate-rational-function',
  coefficientDomain: 'rational',
  variableDeclarationId: value.variableDeclarationId,
  numerator: univariateToNormalForm(value.numerator),
  denominator: univariateToNormalForm(value.denominator),
});

interface InternalAssumptionAnalysis {
  publicAnalysis: AssumptionAnalysis;
  guard: InternalUnivariatePolynomial | null;
}
const ASSUMPTION_RESOURCE_CODES = new Set<AlgebraIssueCode>([
  'DEPTH_LIMIT_EXCEEDED',
  'EXPRESSION_LIMIT_EXCEEDED',
  'TERM_LIMIT_EXCEEDED',
  'DEGREE_LIMIT_EXCEEDED',
  'COEFFICIENT_LIMIT_EXCEEDED',
  'NORMAL_FORM_SIZE_LIMIT_EXCEEDED',
]);
export function analyzeAssumptions(
  document: MathDocument,
  mode: AssumptionMode,
  limits: RationalFunctionLimits,
  variableDeclarationId: string | null = null,
): InternalAssumptionAnalysis {
  if (mode === 'ignore') return { publicAnalysis: emptyAnalysis(mode), guard: null };
  if (document.assumptions.length > limits.maxAssumptions)
    throw new RationalFunctionFailure('ASSUMPTION_LIMIT_EXCEEDED');
  const ids = [...new Set(document.assumptions)].sort(compareText);
  const statements = new Map(document.statements.map((statement) => [statement.id, statement]));
  const recognized: string[] = [];
  const unsupported: string[] = [];
  const guards: InternalUnivariatePolynomial[] = [];
  const polynomial = (id: string): InternalUnivariatePolynomial | null => {
    const result = normalizeValidatedPolynomial(document, id, limits);
    if (result.outcome !== 'normalized' || result.normalForm === null) {
      const resource = result.issues.find((entry) => ASSUMPTION_RESOURCE_CODES.has(entry.code));
      if (resource) throw new RationalFunctionFailure(resource.code, id);
      return null;
    }
    try {
      return univariateFromNormalForm(result.normalForm, limits);
    } catch (error) {
      const code = mapRationalFunctionError(error);
      if (code === 'MULTIVARIATE_NOT_SUPPORTED') return null;
      throw new RationalFunctionFailure(code, id);
    }
  };
  for (const id of ids) {
    const statement = statements.get(id);
    let candidate: InternalUnivariatePolynomial | null = null;
    if (
      statement?.kind === 'predicate' &&
      statement.predicate === 'nonzero' &&
      statement.arguments.length === 1
    ) {
      candidate = polynomial(statement.arguments[0] as string);
    } else if (statement?.kind === 'relation' && statement.relation === 'not_equal') {
      const left = polynomial(statement.left);
      const right = polynomial(statement.right);
      if (left && right) {
        const leftZero = univariateIsZero(left);
        const rightZero = univariateIsZero(right);
        if (leftZero !== rightZero) candidate = leftZero ? right : left;
      }
    }
    if (candidate === null || univariateIsZero(candidate)) {
      unsupported.push(id);
      continue;
    }
    const guard = univariateSquareFree(univariateMonic(candidate, limits), limits);
    if (
      guard.variableDeclarationId !== null &&
      variableDeclarationId !== null &&
      guard.variableDeclarationId !== variableDeclarationId
    ) {
      unsupported.push(id);
      continue;
    }
    if (
      guards.some(
        (existing) =>
          existing.variableDeclarationId !== null &&
          guard.variableDeclarationId !== null &&
          existing.variableDeclarationId !== guard.variableDeclarationId,
      )
    ) {
      unsupported.push(id);
      continue;
    }
    if (univariateDegree(guard) > 0) guards.push(guard);
    recognized.push(id);
  }
  const guard = combineGuards(guards, limits);
  return {
    publicAnalysis: {
      mode,
      recognizedStatementIds: recognized,
      unsupportedStatementIds: unsupported,
      dischargeGuard: guard ? univariateToNormalForm(guard) : null,
    },
    guard,
  };
}
export function guardDischarged(
  required: InternalUnivariatePolynomial | null,
  assumption: InternalUnivariatePolynomial | null,
  limits: RationalFunctionLimits,
): boolean {
  if (required === null) return true;
  if (assumption === null) return false;
  return univariateIsZero(univariateDivmod(assumption, required, limits).remainder);
}

export function normalizeRationalFunction(
  document: unknown,
  expressionId: string,
  assumptionMode: AssumptionMode,
  overrides: Partial<RationalFunctionLimits> = {},
): NormalizeRationalFunctionOutput {
  const validation = validateMathDocument(document);
  const base = {
    semantics: RATIONAL_FUNCTION_SEMANTICS,
    assumptionSemantics: NONZERO_ASSUMPTION_SEMANTICS,
    assumptionMode,
    expressionId,
    validationDiagnosticsTruncated: false,
  } as const;
  if (!validation.valid || !validation.document) {
    const diagnostics = validation.diagnostics.map(projectDiagnostic);
    return {
      outcome: 'invalid_document',
      ...base,
      normalForm: null,
      domainGuard: null,
      domainStatus: 'not_applicable',
      assumptionAnalysis: emptyAnalysis(assumptionMode),
      issues: [],
      validationDiagnostics: diagnostics,
      totalValidationDiagnostics: diagnostics.length,
    };
  }
  const limits = resolveRationalFunctionLimits(overrides);
  let analysis: InternalAssumptionAnalysis = {
    publicAnalysis: emptyAnalysis(assumptionMode),
    guard: null,
  };
  try {
    const value = evaluateValidatedRationalFunction(validation.document, expressionId, limits);
    analysis = analyzeAssumptions(
      validation.document,
      assumptionMode,
      limits,
      value.variableDeclarationId,
    );
    const normalForm = rationalFunctionToNormalForm(value);
    const domainGuard = value.domainGuard ? univariateToNormalForm(value.domainGuard) : null;
    if (utf8ByteLength(JSON.stringify(normalForm)) > limits.maxRationalFunctionBytes)
      throw new RationalFunctionFailure('RATIONAL_FUNCTION_SIZE_LIMIT_EXCEEDED', expressionId);
    const satisfied = guardDischarged(value.domainGuard, analysis.guard, limits);
    return {
      outcome: 'normalized',
      ...base,
      normalForm,
      domainGuard,
      domainStatus:
        value.domainGuard === null
          ? 'unrestricted'
          : satisfied
            ? 'satisfied_by_assumptions'
            : 'required',
      assumptionAnalysis: analysis.publicAnalysis,
      issues: [],
      validationDiagnostics: [],
      totalValidationDiagnostics: 0,
    };
  } catch (error) {
    const failure = error instanceof RationalFunctionFailure ? error : undefined;
    const code = mapRationalFunctionError(error);
    return {
      outcome: 'unsupported',
      ...base,
      normalForm: null,
      domainGuard: null,
      domainStatus: 'not_applicable',
      assumptionAnalysis: analysis.publicAnalysis,
      issues: [issue(code, failure?.expressionId ?? expressionId, failure?.path)],
      validationDiagnostics: [],
      totalValidationDiagnostics: 0,
    };
  }
}

export function rationalFunctionValuesEqual(
  a: InternalRationalFunction,
  b: InternalRationalFunction,
): boolean {
  return (
    mergeVariable(a.variableDeclarationId, b.variableDeclarationId) !== undefined &&
    univariateEquals(a.numerator, b.numerator) &&
    univariateEquals(a.denominator, b.denominator)
  );
}

export function requiredDomainGuard(
  left: InternalUnivariatePolynomial | null,
  right: InternalUnivariatePolynomial | null,
  limits: RationalFunctionLimits,
): InternalUnivariatePolynomial | null {
  const one = univariateOne(limits);
  const l = left ?? one;
  const r = right ?? one;
  const common = univariateGcd(l, r, limits);
  const extraLeft = univariateExactQuotient(l, common, limits);
  const extraRight = univariateExactQuotient(r, common, limits);
  if (univariateDegree(extraLeft) + univariateDegree(extraRight) > limits.maxDomainGuardDegree)
    throw new Error('DOMAIN_GUARD_LIMIT_EXCEEDED');
  const required = univariateSquareFree(univariateMultiply(extraLeft, extraRight, limits), limits);
  return univariateDegree(required) === 0 ? null : required;
}
