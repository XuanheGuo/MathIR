import type { AlgebraLimits } from './constants.js';

export interface CanonicalRational {
  numerator: string;
  denominator: string;
}
export interface InternalRational {
  numerator: bigint;
  denominator: bigint;
}
export class RationalError extends Error {
  constructor(
    readonly code: 'INVALID_NUMBER_LITERAL' | 'DIVISION_BY_ZERO' | 'COEFFICIENT_LIMIT_EXCEEDED',
  ) {
    super(code);
  }
}
const abs = (x: bigint) => (x < 0n ? -x : x);
export function gcd(a: bigint, b: bigint): bigint {
  let x = abs(a);
  let y = abs(b);
  while (y !== 0n) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x;
}
export function rational(numerator: bigint, denominator = 1n): InternalRational {
  if (denominator === 0n) throw new RationalError('DIVISION_BY_ZERO');
  if (numerator === 0n) return { numerator: 0n, denominator: 1n };
  const sign = denominator < 0n ? -1n : 1n;
  const divisor = gcd(numerator, denominator);
  return { numerator: (sign * numerator) / divisor, denominator: abs(denominator) / divisor };
}
export function bitLength(x: bigint): number {
  return abs(x).toString(2).length;
}
export function checkRationalLimit(x: InternalRational, limits: AlgebraLimits): InternalRational {
  if (
    bitLength(x.numerator) > limits.maxCoefficientBits ||
    bitLength(x.denominator) > limits.maxCoefficientBits
  )
    throw new RationalError('COEFFICIENT_LIMIT_EXCEEDED');
  return x;
}
export const addRational = (a: InternalRational, b: InternalRational) =>
  rational(
    a.numerator * b.denominator + b.numerator * a.denominator,
    a.denominator * b.denominator,
  );
export const subtractRational = (a: InternalRational, b: InternalRational) =>
  addRational(a, negateRational(b));
export const multiplyRational = (a: InternalRational, b: InternalRational) =>
  rational(a.numerator * b.numerator, a.denominator * b.denominator);
export const divideRational = (a: InternalRational, b: InternalRational) =>
  rational(a.numerator * b.denominator, a.denominator * b.numerator);
export const negateRational = (a: InternalRational) => rational(-a.numerator, a.denominator);
export const equalRational = (a: InternalRational, b: InternalRational) =>
  a.numerator === b.numerator && a.denominator === b.denominator;
export const isIntegerRational = (a: InternalRational) => a.denominator === 1n;
export const canonicalRational = (a: InternalRational): CanonicalRational => ({
  numerator: a.numerator.toString(),
  denominator: a.denominator.toString(),
});

const integerPattern = /^[+-]?[0-9]+$/;
const decimalPattern = /^[+-]?(?:[0-9]+\.[0-9]*|[0-9]*\.[0-9]+)$/;
const rationalPattern = /^([+-]?[0-9]+)\/([+-]?[0-9]+)$/;
export function parseExactRational(
  value: string,
  numberKind: 'integer' | 'decimal' | 'rational' | undefined,
  limits: AlgebraLimits,
): InternalRational {
  const kind =
    numberKind ?? (value.includes('/') ? 'rational' : value.includes('.') ? 'decimal' : 'integer');
  let result: InternalRational;
  if (kind === 'integer' && integerPattern.test(value)) {
    if (value.replace(/^[+-]/, '').length > limits.maxIntegerLiteralDigits)
      throw new RationalError('INVALID_NUMBER_LITERAL');
    result = rational(BigInt(value));
  } else if (kind === 'decimal' && decimalPattern.test(value)) {
    const negative = value.startsWith('-');
    const unsigned = /^[+-]/.test(value) ? value.slice(1) : value;
    const [whole = '', fraction = ''] = unsigned.split('.');
    if ((whole.length || 1) + fraction.length > limits.maxIntegerLiteralDigits)
      throw new RationalError('INVALID_NUMBER_LITERAL');
    const digits = `${whole || '0'}${fraction}`;
    result = rational(
      (negative ? -1n : 1n) * BigInt(digits || '0'),
      10n ** BigInt(fraction.length),
    );
  } else if (kind === 'rational') {
    const match = rationalPattern.exec(value);
    if (!match) throw new RationalError('INVALID_NUMBER_LITERAL');
    if (
      (match[1]?.replace(/^[+-]/, '').length ?? 0) > limits.maxIntegerLiteralDigits ||
      (match[2]?.replace(/^[+-]/, '').length ?? 0) > limits.maxIntegerLiteralDigits
    )
      throw new RationalError('INVALID_NUMBER_LITERAL');
    result = rational(BigInt(match[1] ?? ''), BigInt(match[2] ?? ''));
  } else throw new RationalError('INVALID_NUMBER_LITERAL');
  return checkRationalLimit(result, limits);
}
