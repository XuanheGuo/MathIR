import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ALGEBRA_LIMITS,
  RationalError,
  addRational,
  checkPolynomialEquivalence,
  gcd,
  multiplyRational,
  normalizePolynomial,
  normalizeValidatedPolynomial,
  parseExactRational,
} from '../src/index.js';

const base = (
  expressions: unknown[],
  declarations: unknown[] = [
    { id: 'x', kind: 'symbol', name: 'x' },
    { id: 'y', kind: 'symbol', name: 'y' },
  ],
) => ({
  mathirVersion: '0.1.0',
  documentId: 'd',
  kind: 'problem',
  declarations,
  expressions,
  statements: [],
  steps: [],
  assumptions: [],
  goals: [],
});
const n = (id: string, value: string, numberKind?: string) =>
  numberKind ? { id, kind: 'number', value, numberKind } : { id, kind: 'number', value };
const s = (id: string, declarationId: string) => ({ id, kind: 'symbol', declarationId });
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
const limits = { ...DEFAULT_ALGEBRA_LIMITS };

describe('exact rationals', () => {
  it('normalizes gcd, sign and zero', () => {
    expect(gcd(12n, 18n)).toBe(6n);
    expect(parseExactRational('-6/-8', 'rational', limits)).toEqual({
      numerator: 3n,
      denominator: 4n,
    });
    expect(parseExactRational('-0', 'integer', limits)).toEqual({ numerator: 0n, denominator: 1n });
  });
  it('adds and multiplies reduced fractions exactly', () => {
    expect(
      addRational({ numerator: 1n, denominator: 2n }, { numerator: 1n, denominator: 3n }),
    ).toEqual({ numerator: 5n, denominator: 6n });
    expect(
      multiplyRational({ numerator: -2n, denominator: 3n }, { numerator: 9n, denominator: 4n }),
    ).toEqual({ numerator: -3n, denominator: 2n });
  });
  it.each([
    ['0.1', 1n, 10n],
    ['.5', 1n, 2n],
    ['5.', 5n, 1n],
    ['-12.250', -49n, 4n],
    ['3/-4', -3n, 4n],
  ])('parses %s exactly', (value, num, den) =>
    expect(parseExactRational(value, undefined, limits)).toEqual({
      numerator: num,
      denominator: den,
    }),
  );
  it.each([' 1', '1 ', '1e3', 'NaN', 'Infinity', '1//2', ''])('rejects %s', (value) =>
    expect(() => parseExactRational(value, undefined, limits)).toThrow(RationalError),
  );
  it('distinguishes zero denominator and digit limit', () => {
    expect(() => parseExactRational('1/0', undefined, limits)).toThrowError('DIVISION_BY_ZERO');
    expect(() =>
      parseExactRational('123', 'integer', { ...limits, maxIntegerLiteralDigits: 2 }),
    ).toThrowError('INVALID_NUMBER_LITERAL');
  });
});

describe('normalization and equivalence', () => {
  it('distributes and combines canonical terms', () => {
    const doc = base([
      s('sx', 'x'),
      s('sy', 'y'),
      a('sum', 'add', 'sx', 'sy'),
      a('product', 'multiply', 'sx', 'sum'),
      a('expanded', 'add', 'xx', 'xy'),
      a('xx', 'multiply', 'sx', 'sx'),
      a('xy', 'multiply', 'sx', 'sy'),
    ]);
    expect(checkPolynomialEquivalence(doc, 'product', 'expanded').outcome).toBe('equivalent');
  });
  it('uses declaration IDs, not names or expression IDs', () => {
    const doc = base(
      [s('left', 'x'), s('renamed', 'x'), s('other', 'y')],
      [
        { id: 'x', kind: 'symbol', name: 'same' },
        { id: 'y', kind: 'symbol', name: 'same' },
      ],
    );
    expect(checkPolynomialEquivalence(doc, 'left', 'renamed').outcome).toBe('equivalent');
    expect(checkPolynomialEquivalence(doc, 'left', 'other').outcome).toBe('not_equivalent');
  });
  it('handles exact decimals without floating point', () => {
    const doc = base([n('a', '0.1'), n('b', '0.2'), n('c', '0.3'), a('sum', 'add', 'a', 'b')]);
    expect(checkPolynomialEquivalence(doc, 'sum', 'c').outcome).toBe('equivalent');
  });
  it('normalizes square and constant division', () => {
    const doc = base([
      s('sx', 'x'),
      n('one', '1'),
      n('two', '2'),
      a('x1', 'add', 'sx', 'one'),
      b('square', 'power', 'x1', 'two'),
      b('half', 'divide', 'sx', 'two'),
    ]);
    expect(normalizePolynomial(doc, 'square').normalForm?.terms).toHaveLength(3);
    expect(normalizePolynomial(doc, 'half').normalForm?.terms[0]?.coefficient).toEqual({
      numerator: '1',
      denominator: '2',
    });
  });
  it('supports exponent zero, one and subtraction to zero', () => {
    const doc = base([
      s('sx', 'x'),
      n('zero', '0'),
      n('one', '1'),
      b('p0', 'power', 'sx', 'zero'),
      b('p1', 'power', 'sx', 'one'),
      b('sub', 'subtract', 'sx', 'sx'),
    ]);
    expect(normalizePolynomial(doc, 'p0').normalForm?.terms[0]?.coefficient.numerator).toBe('1');
    expect(checkPolynomialEquivalence(doc, 'p1', 'sx').outcome).toBe('equivalent');
    expect(normalizePolynomial(doc, 'sub').normalForm?.terms).toEqual([]);
  });
  it('is commutative, associative and deterministic', () => {
    const doc = base([
      s('sx', 'x'),
      s('sy', 'y'),
      a('xy', 'add', 'sx', 'sy'),
      a('yx', 'add', 'sy', 'sx'),
    ]);
    const first = normalizePolynomial(doc, 'xy');
    expect(checkPolynomialEquivalence(doc, 'xy', 'yx').outcome).toBe('equivalent');
    expect(normalizePolynomial(doc, 'xy')).toEqual(first);
  });
  it('defines empty add as zero and empty multiply as one', () => {
    const doc = base([a('zero', 'add'), a('one', 'multiply')]);
    expect(normalizePolynomial(doc, 'zero').normalForm?.terms).toEqual([]);
    expect(normalizePolynomial(doc, 'one').normalForm?.terms[0]?.coefficient).toEqual({
      numerator: '1',
      denominator: '1',
    });
  });
  it('returns exact non-equivalence', () => {
    const doc = base([s('sx', 'x'), n('one', '1'), a('x1', 'add', 'sx', 'one')]);
    expect(checkPolynomialEquivalence(doc, 'x1', 'sx').outcome).toBe('not_equivalent');
    expect(checkPolynomialEquivalence(doc, 'sx', 'x1').outcome).toBe('not_equivalent');
  });
  it.each([
    ['divide', 'NON_CONSTANT_DIVISOR'],
    ['absolute', 'UNSUPPORTED_OPERATOR'],
  ])('returns unknown for %s', (_label, code) => {
    const expressions =
      _label === 'divide'
        ? [s('sx', 'x'), b('bad', 'divide', 'sx', 'sx'), n('one', '1')]
        : [
            s('sx', 'x'),
            { id: 'bad', kind: 'unary', operator: 'absolute', operand: 'sx' },
            n('one', '1'),
          ];
    const result = checkPolynomialEquivalence(base(expressions), 'bad', 'one');
    expect(result.outcome).toBe('unknown');
    expect(result.issues[0]?.code).toBe(code);
  });
  it('reports invalid documents without algebra issues', () => {
    const result = normalizePolynomial({ bad: true }, 'x');
    expect(result.outcome).toBe('invalid_document');
    expect(result.issues).toEqual([]);
    expect(result.validationDiagnostics.length).toBeGreaterThan(0);
  });
  it('rejects zero division and invalid exponents', () => {
    const doc = base([
      s('sx', 'x'),
      n('zero', '0'),
      n('neg', '-1'),
      b('div', 'divide', 'sx', 'zero'),
      b('pow', 'power', 'sx', 'neg'),
    ]);
    expect(normalizePolynomial(doc, 'div').issues[0]?.code).toBe('DIVISION_BY_ZERO');
    expect(normalizePolynomial(doc, 'pow').issues[0]?.code).toBe('INVALID_EXPONENT');
  });
  it('rejects variable and rational exponents', () => {
    const doc = base([
      s('sx', 'x'),
      s('sy', 'y'),
      n('half', '1/2'),
      b('variable', 'power', 'sx', 'sy'),
      b('fractional', 'power', 'sx', 'half'),
    ]);
    expect(normalizePolynomial(doc, 'variable').issues[0]?.code).toBe('INVALID_EXPONENT');
    expect(normalizePolynomial(doc, 'fractional').issues[0]?.code).toBe('INVALID_EXPONENT');
  });
  it('defensively detects cycles', () => {
    const document = base([
      { id: 'a', kind: 'unary', operator: 'negate', operand: 'b' },
      { id: 'b', kind: 'unary', operator: 'negate', operand: 'a' },
    ]);
    expect(normalizePolynomial(document, 'a').issues[0]?.code).toBe('EXPRESSION_CYCLE');
  });
  it('enforces deterministic limits in low-level API', () => {
    const document = base([s('sx', 'x'), n('e', '3'), b('p', 'power', 'sx', 'e')]);
    const validated = document as never;
    expect(
      normalizeValidatedPolynomial(validated, 'p', { maxTotalDegree: 2 }).issues[0]?.code,
    ).toBe('DEGREE_LIMIT_EXCEEDED');
    expect(
      normalizeValidatedPolynomial(validated, 'p', { maxNormalFormBytes: 1 }).issues[0]?.code,
    ).toBe('NORMAL_FORM_SIZE_LIMIT_EXCEEDED');
  });
  it('enforces depth and visited expression limits', () => {
    const doc = base([
      s('sx', 'x'),
      { id: 'n1', kind: 'unary', operator: 'negate', operand: 'sx' },
      { id: 'n2', kind: 'unary', operator: 'negate', operand: 'n1' },
    ]) as never;
    expect(normalizeValidatedPolynomial(doc, 'n2', { maxExpressionDepth: 1 }).issues[0]?.code).toBe(
      'DEPTH_LIMIT_EXCEEDED',
    );
    expect(
      normalizeValidatedPolynomial(doc, 'n2', { maxVisitedExpressions: 1 }).issues[0]?.code,
    ).toBe('EXPRESSION_LIMIT_EXCEEDED');
  });
  it('enforces term and coefficient limits', () => {
    const doc = base([
      s('sx', 'x'),
      s('sy', 'y'),
      a('sum', 'add', 'sx', 'sy'),
      n('two', '2'),
      b('square', 'power', 'sum', 'two'),
      n('large', '1024'),
    ]) as never;
    expect(normalizeValidatedPolynomial(doc, 'square', { maxTerms: 2 }).issues[0]?.code).toBe(
      'TERM_LIMIT_EXCEEDED',
    );
    expect(
      normalizeValidatedPolynomial(doc, 'large', { maxCoefficientBits: 3 }).issues[0]?.code,
    ).toBe('COEFFICIENT_LIMIT_EXCEEDED');
  });
  it.each([
    [{ id: 'bad', kind: 'unary', operator: 'not', operand: 'sx' }, 'UNSUPPORTED_OPERATOR'],
    [
      { id: 'bad', kind: 'binary', operator: 'implies', left: 'sx', right: 'sx' },
      'UNSUPPORTED_OPERATOR',
    ],
    [{ id: 'bad', kind: 'nary', operator: 'and', operands: ['sx', 'sx'] }, 'UNSUPPORTED_OPERATOR'],
    [{ id: 'bad', kind: 'unparsed', raw: 'x', reason: 'ambiguous' }, 'UNSUPPORTED_EXPRESSION_KIND'],
  ])('rejects unsupported fragment %#', (expression, code) => {
    const result = normalizePolynomial(base([s('sx', 'x'), expression]), 'bad');
    expect(result.issues[0]?.code).toBe(code);
  });
  it('rejects non-scalar symbol domains and scientific notation', () => {
    const domainDoc = base(
      [s('sx', 'x')],
      [{ id: 'x', kind: 'symbol', name: 'x', domain: { kind: 'boolean' } }],
    );
    expect(normalizePolynomial(domainDoc, 'sx').issues[0]?.code).toBe('UNSUPPORTED_SYMBOL_DOMAIN');
    expect(normalizePolynomial(base([n('bad', '1e3')]), 'bad').issues[0]?.code).toBe(
      'INVALID_NUMBER_LITERAL',
    );
  });
  it('orders left issues before right issues', () => {
    const doc = base([
      s('sx', 'x'),
      { id: 'abs', kind: 'unary', operator: 'absolute', operand: 'sx' },
      { id: 'not', kind: 'unary', operator: 'not', operand: 'sx' },
    ]);
    const result = checkPolynomialEquivalence(doc, 'abs', 'not');
    expect(result.issues.map((i) => i.side)).toEqual(['left', 'right']);
  });
});
