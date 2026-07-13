import { describe, expect, it } from 'vitest';
import {
  PolynomialInvariantError,
  RationalError,
  RationalFunctionFailure,
  checkRationalFunctionEquivalence,
  mapRationalFunctionError,
  normalizeRationalFunction,
  rational,
  resolveRationalFunctionLimits,
  univariateAdd,
  univariateConstant,
  univariateDegree,
  univariateDerivative,
  univariateDivmod,
  univariateEquals,
  univariateExactQuotient,
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
  it('maps only explicit rational-function errors and rethrows unexpected failures', () => {
    expect(mapRationalFunctionError(new Error('GCD_STEP_LIMIT_EXCEEDED'))).toBe(
      'GCD_STEP_LIMIT_EXCEEDED',
    );
    expect(mapRationalFunctionError(new RationalFunctionFailure('GCD_STEP_LIMIT_EXCEEDED'))).toBe(
      'GCD_STEP_LIMIT_EXCEEDED',
    );
    expect(mapRationalFunctionError(new RationalError('COEFFICIENT_LIMIT_EXCEEDED'))).toBe(
      'COEFFICIENT_LIMIT_EXCEEDED',
    );
    const typeError = new TypeError('GCD_STEP_LIMIT_EXCEEDED');
    expect(() => mapRationalFunctionError(typeError)).toThrow(typeError);
    const rangeError = new RangeError('GCD_STEP_LIMIT_EXCEEDED');
    expect(() => mapRationalFunctionError(rangeError)).toThrow(rangeError);
    const unexpected = new Error('boom');
    expect(() => mapRationalFunctionError(unexpected)).toThrow(unexpected);
  });

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

  it('distinguishes non-exact quotient invariants from division resource limits', () => {
    const { x, one } = coefficients();
    const dividend = univariateAdd(univariateMultiply(x, x, limits), one, limits);
    const divisor = univariateAdd(x, one, limits);
    expect(() => univariateExactQuotient(dividend, divisor, limits)).toThrow(
      PolynomialInvariantError,
    );
    try {
      univariateExactQuotient(dividend, divisor, limits);
      throw new Error('expected non-exact quotient to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(PolynomialInvariantError);
      expect(() => mapRationalFunctionError(error)).toThrow(error);
    }
    const limited = { ...limits, maxPolynomialDivisionSteps: 0 };
    const limitError = (() => {
      try {
        univariateExactQuotient(univariateMultiply(x, x, limits), x, limited);
      } catch (error) {
        return error;
      }
      throw new Error('expected polynomial division limit to fail');
    })();
    expect(mapRationalFunctionError(limitError)).toBe('POLYNOMIAL_DIVISION_LIMIT_EXCEEDED');
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

  it('returns unknown when required-domain GCD exceeds its step limit', () => {
    const doc = document([
      s('x'),
      n('one', '1'),
      a('x-plus-one', 'add', 'x', 'one'),
      b('left', 'divide', 'x', 'x'),
      b('right', 'divide', 'x-plus-one', 'x-plus-one'),
    ]);
    const result = checkRationalFunctionEquivalence(doc, 'left', 'right', 'ignore', {
      maxGcdSteps: 1,
    });
    expect(result).toMatchObject({
      outcome: 'unknown',
      conditionStatus: 'not_applicable',
      requiredDomainGuard: null,
    });
    expect(result.leftNormalForm).not.toBeNull();
    expect(result.rightNormalForm).not.toBeNull();
    expect(result.leftDomainGuard).not.toBeNull();
    expect(result.rightDomainGuard).not.toBeNull();
    expect(result.issues.map((entry) => entry.code)).toContain('GCD_STEP_LIMIT_EXCEEDED');
  });

  it('returns unknown with the computed guard when assumption discharge exceeds division steps', () => {
    const expressions = [
      s('x'),
      n('one', '1'),
      a('x-plus-one', 'add', 'x', 'one'),
      b('left', 'divide', 'x', 'x'),
    ];
    const statements = [
      { id: 'nonzero-x', kind: 'predicate', predicate: 'nonzero', arguments: ['x'] },
      {
        id: 'nonzero-x-plus-one',
        kind: 'predicate',
        predicate: 'nonzero',
        arguments: ['x-plus-one'],
      },
    ];
    const doc = document(expressions, statements, ['nonzero-x', 'nonzero-x-plus-one']);
    const result = checkRationalFunctionEquivalence(doc, 'left', 'one', 'document_nonzero', {
      maxPolynomialDivisionSteps: 1,
    });
    expect(result).toMatchObject({
      outcome: 'unknown',
      conditionStatus: 'not_applicable',
    });
    expect(result.requiredDomainGuard?.terms.at(-1)?.powers[0]).toEqual({
      declarationId: 'x',
      exponent: 1,
    });
    expect(result.assumptionAnalysis.recognizedStatementIds).toEqual([
      'nonzero-x',
      'nonzero-x-plus-one',
    ]);
    expect(result.issues.map((entry) => entry.code)).toContain(
      'POLYNOMIAL_DIVISION_LIMIT_EXCEEDED',
    );
  });

  it('canonicalizes 300 duplicate nonzero assumptions without false guard growth', () => {
    const statements = Array.from({ length: 300 }, (_, index) => ({
      id: `a${String(index + 1).padStart(3, '0')}`,
      kind: 'predicate',
      predicate: 'nonzero',
      arguments: ['x'],
    }));
    const assumptions = statements.map((statement) => statement.id);
    const doc = document([s('x'), b('target', 'divide', 'x', 'x')], statements, assumptions);
    const result = normalizeRationalFunction(doc, 'target', 'document_nonzero', {
      maxAssumptions: 512,
      maxDomainGuardDegree: 1,
    });
    expect(result.outcome).toBe('normalized');
    expect(result.assumptionAnalysis.recognizedStatementIds).toHaveLength(300);
    expect(result.assumptionAnalysis.unsupportedStatementIds).toEqual([]);
    expect(result.assumptionAnalysis.dischargeGuard?.terms).toEqual([
      {
        coefficient: { numerator: '1', denominator: '1' },
        powers: [{ declarationId: 'x', exponent: 1 }],
      },
    ]);
  });

  it('canonicalizes scalar-multiple and overlapping assumption guards', () => {
    const expressions = [
      s('x'),
      n('one', '1'),
      n('two', '2'),
      a('two-x', 'multiply', 'two', 'x'),
      a('x-plus-one', 'add', 'x', 'one'),
      a('overlap', 'multiply', 'x', 'x-plus-one'),
    ];
    const statements = [
      { id: 'x-nonzero', kind: 'predicate', predicate: 'nonzero', arguments: ['x'] },
      { id: 'two-x-nonzero', kind: 'predicate', predicate: 'nonzero', arguments: ['two-x'] },
      {
        id: 'overlap-nonzero',
        kind: 'predicate',
        predicate: 'nonzero',
        arguments: ['overlap'],
      },
    ];
    const scalar = normalizeRationalFunction(
      document(expressions, statements, ['x-nonzero', 'two-x-nonzero']),
      'one',
      'document_nonzero',
    );
    expect(scalar.assumptionAnalysis.dischargeGuard?.terms).toHaveLength(1);
    expect(scalar.assumptionAnalysis.dischargeGuard?.terms[0]?.coefficient).toEqual({
      numerator: '1',
      denominator: '1',
    });
    const overlap = normalizeRationalFunction(
      document(expressions, statements, ['x-nonzero', 'overlap-nonzero']),
      'one',
      'document_nonzero',
    );
    expect(
      overlap.assumptionAnalysis.dischargeGuard?.terms.map((term) => term.powers[0]?.exponent ?? 0),
    ).toEqual([1, 2]);
  });

  it('still rejects genuinely distinct guard degree beyond the configured limit', () => {
    const expressions = [s('x'), n('one', '1'), a('x-plus-one', 'add', 'x', 'one')];
    const statements = [
      { id: 'x-nonzero', kind: 'predicate', predicate: 'nonzero', arguments: ['x'] },
      {
        id: 'x-plus-one-nonzero',
        kind: 'predicate',
        predicate: 'nonzero',
        arguments: ['x-plus-one'],
      },
    ];
    const result = normalizeRationalFunction(
      document(expressions, statements, ['x-nonzero', 'x-plus-one-nonzero']),
      'one',
      'document_nonzero',
      { maxDomainGuardDegree: 1 },
    );
    expect(result.outcome).toBe('unsupported');
    expect(result.issues.map((entry) => entry.code)).toContain('DOMAIN_GUARD_LIMIT_EXCEEDED');
  });

  it('preserves concrete assumption resource codes instead of relabeling every failure', () => {
    const statements = [
      { id: 'x-nonzero', kind: 'predicate', predicate: 'nonzero', arguments: ['x'] },
    ];
    const result = checkRationalFunctionEquivalence(
      document([s('x'), n('one', '1')], statements, ['x-nonzero']),
      'one',
      'one',
      'document_nonzero',
      { maxPolynomialDegree: 0 },
    );
    expect(result.outcome).toBe('unknown');
    expect(result.issues.map((entry) => entry.code)).toEqual(['DEGREE_LIMIT_EXCEEDED']);
  });

  it('propagates assumption polynomial depth limits instead of marking them unsupported', () => {
    const expressions = [
      n('one', '1'),
      u('deep-one', 'negate', 'one'),
      u('deep-two', 'negate', 'deep-one'),
      u('deep-three', 'negate', 'deep-two'),
    ];
    const statements = [
      {
        id: 'deep-nonzero',
        kind: 'predicate',
        predicate: 'nonzero',
        arguments: ['deep-three'],
      },
    ];
    const result = checkRationalFunctionEquivalence(
      document(expressions, statements, ['deep-nonzero']),
      'one',
      'one',
      'document_nonzero',
      { maxExpressionDepth: 1 },
    );
    expect(result.outcome).toBe('unknown');
    expect(result.issues.map((entry) => entry.code)).toContain('DEPTH_LIMIT_EXCEEDED');
    expect(result.assumptionAnalysis.unsupportedStatementIds).not.toContain('deep-nonzero');
  });

  it('propagates assumption expression-count limits instead of silently ignoring the DAG', () => {
    const expressions = [
      n('one', '1'),
      u('count-one', 'negate', 'one'),
      u('count-two', 'negate', 'count-one'),
      u('count-three', 'negate', 'count-two'),
    ];
    const statements = [
      {
        id: 'large-nonzero',
        kind: 'predicate',
        predicate: 'nonzero',
        arguments: ['count-three'],
      },
    ];
    const result = checkRationalFunctionEquivalence(
      document(expressions, statements, ['large-nonzero']),
      'one',
      'one',
      'document_nonzero',
      { maxVisitedExpressions: 2 },
    );
    expect(result.outcome).toBe('unknown');
    expect(result.issues.map((entry) => entry.code)).toContain('EXPRESSION_LIMIT_EXCEEDED');
    expect(result.assumptionAnalysis.unsupportedStatementIds).not.toContain('large-nonzero');
  });
});
