import { describe, expect, it } from 'vitest';
import {
  checkRationalFunctionEquivalence,
  normalizeRationalFunction,
  rational,
  resolveRationalFunctionLimits,
  univariateAdd,
  univariateConstant,
  univariateDegree,
  univariateDerivative,
  univariateDivmod,
  univariateEquals,
  univariateGcd,
  univariateIsZero,
  univariateLeadingCoefficient,
  univariateMonic,
  univariateMultiply,
  univariateOne,
  univariatePower,
  univariateSquareFree,
  univariateSubtract,
  univariateToNormalForm,
  univariateVariable,
  univariateZero,
} from '../src/index.js';

const limits = resolveRationalFunctionLimits();
const n = (id: string, value: string) => ({ id, kind: 'number', value });
const s = (id: string, declarationId = 'x') => ({ id, kind: 'symbol', declarationId });
const b = (id: string, operator: string, left: string, right: string) => ({
  id,
  kind: 'binary',
  operator,
  left,
  right,
});
const a = (id: string, operator: string, ...operands: string[]) => ({
  id,
  kind: 'nary',
  operator,
  operands,
});
const u = (id: string, operator: string, operand: string) => ({
  id,
  kind: 'unary',
  operator,
  operand,
});
const document = (
  expressions: unknown[],
  statements: unknown[] = [],
  assumptions: string[] = [],
  declarations: unknown[] = [{ id: 'x', kind: 'symbol', name: 'x' }],
) => ({
  mathirVersion: '0.1.0',
  documentId: 'rational-test',
  kind: 'problem',
  declarations,
  expressions,
  statements,
  steps: [],
  assumptions,
  goals: [],
});
const cancellationExpressions = () => [
  s('x'),
  n('one', '1'),
  n('two', '2'),
  b('x2', 'power', 'x', 'two'),
  b('numerator', 'subtract', 'x2', 'one'),
  b('guard', 'subtract', 'x', 'one'),
  b('fraction', 'divide', 'numerator', 'guard'),
  a('sum', 'add', 'x', 'one'),
];
const coefficients = (id = 'x') => {
  const x = univariateVariable(id, limits);
  const one = univariateOne(limits);
  return { x, one, xMinusOne: univariateSubtract(x, one, limits) };
};

describe('univariate polynomial core', () => {
  it('implements zero, one, constants, variables and exact arithmetic', () => {
    const { x, one } = coefficients();
    expect(univariateIsZero(univariateZero())).toBe(true);
    expect(univariateDegree(one)).toBe(0);
    expect(univariateDegree(x)).toBe(1);
    const half = univariateConstant(rational(1n, 2n), limits);
    expect(univariateToNormalForm(univariateAdd(half, half, limits))).toEqual(
      univariateToNormalForm(one),
    );
    expect(univariateDegree(univariateMultiply(x, x, limits))).toBe(2);
    expect(
      univariateLeadingCoefficient(
        univariateMonic(univariateConstant(rational(-2n), limits), limits),
      ),
    ).toEqual(rational(1n));
  });

  it('performs exact divmod and preserves the division identity', () => {
    const { x, one, xMinusOne } = coefficients();
    const dividend = univariateSubtract(univariateMultiply(x, x, limits), one, limits);
    const { quotient, remainder } = univariateDivmod(dividend, xMinusOne, limits);
    expect(univariateIsZero(remainder)).toBe(true);
    expect(univariateEquals(quotient, univariateAdd(x, one, limits))).toBe(true);
    expect(
      univariateEquals(
        dividend,
        univariateAdd(univariateMultiply(xMinusOne, quotient, limits), remainder, limits),
      ),
    ).toBe(true);
    const nonzeroRemainder = univariateDivmod(
      univariateAdd(univariateMultiply(x, x, limits), one, limits),
      univariateAdd(x, one, limits),
      limits,
    ).remainder;
    expect(univariateIsZero(nonzeroRemainder)).toBe(false);
  });

  it('computes deterministic monic gcd and square-free parts', () => {
    const { x, one, xMinusOne } = coefficients();
    const xPlusOne = univariateAdd(x, one, limits);
    const x2MinusOne = univariateMultiply(xMinusOne, xPlusOne, limits);
    expect(univariateEquals(univariateGcd(x2MinusOne, xMinusOne, limits), xMinusOne)).toBe(true);
    expect(univariateEquals(univariateGcd(univariateZero(), xMinusOne, limits), xMinusOne)).toBe(
      true,
    );
    expect(univariateEquals(univariateSquareFree(univariatePower(x, 2, limits), limits), x)).toBe(
      true,
    );
    const repeated = univariateMultiply(univariatePower(xMinusOne, 2, limits), xPlusOne, limits);
    expect(univariateEquals(univariateSquareFree(repeated, limits), x2MinusOne)).toBe(true);
    expect(univariateDegree(univariateDerivative(repeated, limits))).toBe(2);
    expect(
      univariateDegree(univariateSquareFree(univariateConstant(rational(7n), limits), limits)),
    ).toBe(0);
  });

  it('enforces variable and deterministic algorithm limits', () => {
    expect(() =>
      univariateAdd(univariateVariable('x', limits), univariateVariable('y', limits), limits),
    ).toThrowError('MULTIVARIATE_NOT_SUPPORTED');
    const { x, one } = coefficients();
    expect(() =>
      univariateDivmod(univariateAdd(x, one, limits), one, {
        ...limits,
        maxPolynomialDivisionSteps: 0,
      }),
    ).toThrowError('POLYNOMIAL_DIVISION_LIMIT_EXCEEDED');
    expect(() => univariateGcd(x, one, { ...limits, maxGcdSteps: 0 })).toThrowError(
      'GCD_STEP_LIMIT_EXCEEDED',
    );
  });
});

describe('rational-function normalization and domain guards', () => {
  it('reduces cancellation while retaining the original denominator guard', () => {
    const result = normalizeRationalFunction(
      document(cancellationExpressions()),
      'fraction',
      'ignore',
    );
    expect(result.outcome).toBe('normalized');
    expect(result.normalForm?.denominator.terms).toHaveLength(1);
    expect(result.normalForm?.numerator.terms.map((term) => term.coefficient.numerator)).toEqual([
      '1',
      '1',
    ]);
    expect(result.domainGuard?.terms.map((term) => term.coefficient.numerator)).toEqual([
      '-1',
      '1',
    ]);
    expect(result.domainStatus).toBe('required');
  });

  it('normalizes scalar factors, denominator sign and zero function', () => {
    const expressions = [
      s('x'),
      n('zero', '0'),
      n('one', '1'),
      n('two', '2'),
      n('four', '4'),
      a('x1', 'add', 'x', 'one'),
      a('two-x1', 'multiply', 'two', 'x1'),
      a('four-x1', 'multiply', 'four', 'x1'),
      b('ratio', 'divide', 'two-x1', 'four-x1'),
      u('negative-x', 'negate', 'x'),
      b('negative-denominator', 'divide', 'one', 'negative-x'),
      b('zero-ratio', 'divide', 'zero', 'x1'),
    ];
    const doc = document(expressions);
    expect(
      normalizeRationalFunction(doc, 'ratio', 'ignore').normalForm?.numerator.terms[0]?.coefficient,
    ).toEqual({ numerator: '1', denominator: '2' });
    const negative = normalizeRationalFunction(doc, 'negative-denominator', 'ignore').normalForm;
    expect(negative?.numerator.terms[0]?.coefficient.numerator).toBe('-1');
    expect(negative?.denominator.terms[0]?.powers[0]?.declarationId).toBe('x');
    const zero = normalizeRationalFunction(doc, 'zero-ratio', 'ignore');
    expect(zero.normalForm?.numerator.terms).toEqual([]);
    expect(zero.normalForm?.denominator.terms[0]?.coefficient.numerator).toBe('1');
    expect(zero.domainGuard).not.toBeNull();
  });

  it('composes nested division and negative/zero powers', () => {
    const doc = document([
      s('x'),
      n('zero', '0'),
      n('one', '1'),
      n('minus-two', '-2'),
      b('inverse', 'divide', 'one', 'x'),
      b('nested', 'divide', 'one', 'inverse'),
      b('negative-power', 'power', 'x', 'minus-two'),
      b('zero-power', 'power', 'inverse', 'zero'),
      b('same-division', 'divide', 'inverse', 'inverse'),
    ]);
    for (const id of ['nested', 'negative-power', 'zero-power', 'same-division'])
      expect(normalizeRationalFunction(doc, id, 'ignore').domainGuard).not.toBeNull();
    expect(
      normalizeRationalFunction(doc, 'nested', 'ignore').normalForm?.numerator.terms[0]?.powers[0]
        ?.exponent,
    ).toBe(1);
    expect(
      normalizeRationalFunction(doc, 'negative-power', 'ignore').normalForm?.denominator.terms[0]
        ?.powers[0]?.exponent,
    ).toBe(2);
    expect(
      normalizeRationalFunction(doc, 'zero-power', 'ignore').normalForm?.numerator.terms[0]
        ?.coefficient.numerator,
    ).toBe('1');
  });

  it('rejects zero divisors, invalid exponents, unsupported fragments and multivariate graphs', () => {
    const doc = document(
      [
        s('x'),
        s('y', 'y'),
        n('zero', '0'),
        n('half', '1/2'),
        n('huge', '257'),
        b('zero-divide', 'divide', 'x', 'zero'),
        b('fractional-power', 'power', 'x', 'half'),
        b('huge-power', 'power', 'x', 'huge'),
        b('xy', 'divide', 'x', 'y'),
        u('absolute', 'absolute', 'x'),
      ],
      [],
      [],
      [
        { id: 'x', kind: 'symbol', name: 'same' },
        { id: 'y', kind: 'symbol', name: 'same' },
      ],
    );
    expect(normalizeRationalFunction(doc, 'zero-divide', 'ignore').issues[0]?.code).toBe(
      'DIVISION_BY_ZERO',
    );
    expect(normalizeRationalFunction(doc, 'fractional-power', 'ignore').issues[0]?.code).toBe(
      'INVALID_EXPONENT',
    );
    expect(normalizeRationalFunction(doc, 'huge-power', 'ignore').issues[0]?.code).toBe(
      'INVALID_EXPONENT',
    );
    expect(normalizeRationalFunction(doc, 'xy', 'ignore').issues[0]?.code).toBe(
      'MULTIVARIATE_NOT_SUPPORTED',
    );
    expect(normalizeRationalFunction(doc, 'absolute', 'ignore').issues[0]?.code).toBe(
      'UNSUPPORTED_OPERATOR',
    );
  });
});

describe('assumptions and conditional equivalence', () => {
  it('distinguishes same-domain, conditional, and unequal rational functions', () => {
    const doc = document([
      ...cancellationExpressions(),
      b('inverse', 'divide', 'one', 'x'),
      b('x-over-x', 'divide', 'x', 'x'),
      b('x2-denominator', 'divide', 'x', 'x2'),
      a('x-plus-one', 'add', 'x', 'one'),
      b('other-inverse', 'divide', 'one', 'x-plus-one'),
    ]);
    expect(checkRationalFunctionEquivalence(doc, 'inverse', 'inverse', 'ignore')).toMatchObject({
      outcome: 'equivalent',
      conditionStatus: 'not_required',
      requiredDomainGuard: null,
    });
    expect(
      checkRationalFunctionEquivalence(doc, 'inverse', 'x2-denominator', 'ignore'),
    ).toMatchObject({ outcome: 'equivalent', conditionStatus: 'not_required' });
    expect(checkRationalFunctionEquivalence(doc, 'fraction', 'sum', 'ignore')).toMatchObject({
      outcome: 'conditionally_equivalent',
      conditionStatus: 'required',
    });
    expect(checkRationalFunctionEquivalence(doc, 'x-over-x', 'one', 'ignore')).toMatchObject({
      outcome: 'conditionally_equivalent',
      conditionStatus: 'required',
    });
    expect(
      checkRationalFunctionEquivalence(doc, 'inverse', 'other-inverse', 'ignore'),
    ).toMatchObject({ outcome: 'not_equivalent', conditionStatus: 'not_applicable' });
  });

  it('recognizes explicit nonzero predicate and both not-equal orientations', () => {
    const expressions = cancellationExpressions();
    const statements = [
      { id: 'p', kind: 'predicate', predicate: 'nonzero', arguments: ['guard'] },
      { id: 'lr', kind: 'relation', relation: 'not_equal', left: 'guard', right: 'one' },
      { id: 'g0', kind: 'relation', relation: 'not_equal', left: 'guard', right: 'zero' },
      { id: 'zg', kind: 'relation', relation: 'not_equal', left: 'zero', right: 'guard' },
      { id: 'positive', kind: 'predicate', predicate: 'positive', arguments: ['guard'] },
    ];
    expressions.push(n('zero', '0'));
    const doc = document(expressions, statements, ['positive', 'zg', 'g0', 'lr', 'p']);
    const result = normalizeRationalFunction(doc, 'fraction', 'document_nonzero');
    expect(result).toMatchObject({
      outcome: 'normalized',
      domainStatus: 'satisfied_by_assumptions',
    });
    expect(result.assumptionAnalysis.recognizedStatementIds).toEqual(['g0', 'p', 'zg']);
    expect(result.assumptionAnalysis.unsupportedStatementIds).toEqual(['lr', 'positive']);
  });

  it('uses aggregate divisibility in the correct direction and ignores equality assumptions', () => {
    const expressions = [
      ...cancellationExpressions(),
      u('minus-one', 'negate', 'one'),
      a('x-plus-one', 'add', 'x', 'one'),
      a('product-guard', 'multiply', 'guard', 'x-plus-one'),
      n('zero', '0'),
    ];
    const statements = [
      { id: 'strong', kind: 'predicate', predicate: 'nonzero', arguments: ['product-guard'] },
      { id: 'weak', kind: 'predicate', predicate: 'nonzero', arguments: ['guard'] },
      { id: 'equality', kind: 'relation', relation: 'equal', left: 'x', right: 'one' },
    ];
    const strong = document(expressions, statements, ['strong', 'equality']);
    expect(
      checkRationalFunctionEquivalence(strong, 'fraction', 'sum', 'document_nonzero'),
    ).toMatchObject({ outcome: 'equivalent', conditionStatus: 'satisfied_by_assumptions' });
    const weak = document(expressions, statements, ['weak']);
    const requiredProduct = b('dummy', 'divide', 'one', 'product-guard');
    weak.expressions.push(requiredProduct);
    expect(normalizeRationalFunction(weak, 'dummy', 'document_nonzero').domainStatus).toBe(
      'required',
    );
    expect(checkRationalFunctionEquivalence(strong, 'x', 'one', 'document_nonzero').outcome).toBe(
      'not_equivalent',
    );
  });

  it('keeps ignore analysis empty and unsupported assumptions non-fatal', () => {
    const expressions = [...cancellationExpressions(), n('zero', '0')];
    const statements = [
      { id: 'bad', kind: 'predicate', predicate: 'nonzero', arguments: ['zero'] },
      { id: 'good', kind: 'predicate', predicate: 'nonzero', arguments: ['guard'] },
    ];
    const doc = document(expressions, statements, ['bad', 'good']);
    expect(normalizeRationalFunction(doc, 'fraction', 'ignore').assumptionAnalysis).toEqual({
      mode: 'ignore',
      recognizedStatementIds: [],
      unsupportedStatementIds: [],
      dischargeGuard: null,
    });
    const analyzed = normalizeRationalFunction(doc, 'fraction', 'document_nonzero');
    expect(analyzed.outcome).toBe('normalized');
    expect(analyzed.assumptionAnalysis.unsupportedStatementIds).toEqual(['bad']);
  });

  it('returns unknown for unsupported sides and invalid_document before algebra', () => {
    const valid = document([s('x'), u('bad', 'absolute', 'x')]);
    expect(checkRationalFunctionEquivalence(valid, 'bad', 'x', 'ignore').outcome).toBe('unknown');
    expect(checkRationalFunctionEquivalence(valid, 'missing', 'x', 'ignore').issues[0]?.code).toBe(
      'EXPRESSION_NOT_FOUND',
    );
    const invalid = { ...valid, expressions: [u('bad', 'absolute', 'missing')] };
    const result = checkRationalFunctionEquivalence(invalid, 'bad', 'bad', 'ignore');
    expect(result.outcome).toBe('invalid_document');
    expect(result.validationDiagnostics.length).toBeGreaterThan(0);
  });

  it('enforces assumption count and rational-function byte limits deterministically', () => {
    const doc = document([s('x')]);
    expect(
      normalizeRationalFunction(doc, 'x', 'ignore', { maxRationalFunctionBytes: 1 }).issues[0]
        ?.code,
    ).toBe('RATIONAL_FUNCTION_SIZE_LIMIT_EXCEEDED');
    expect(
      normalizeRationalFunction(doc, 'x', 'document_nonzero', { maxAssumptions: -1 }).issues[0]
        ?.code,
    ).toBe('ASSUMPTION_LIMIT_EXCEEDED');
    expect(normalizeRationalFunction(doc, 'x', 'ignore')).toEqual(
      normalizeRationalFunction(doc, 'x', 'ignore'),
    );
  });
});
