import type { RationalFunctionLimits } from './constants.js';
import type { InternalPolynomial, PolynomialNormalForm } from './normal-form.js';
import {
  type InternalRational,
  addRational,
  canonicalRational,
  checkRationalLimit,
  divideRational,
  equalRational,
  multiplyRational,
  negateRational,
  rational,
} from './rational.js';

export interface InternalUnivariatePolynomial {
  variableDeclarationId: string | null;
  coefficients: Map<number, InternalRational>;
}

const zeroRational = rational(0n);
const oneRational = rational(1n);

function variableOf(
  a: InternalUnivariatePolynomial,
  b: InternalUnivariatePolynomial,
): string | null {
  if (
    a.variableDeclarationId !== null &&
    b.variableDeclarationId !== null &&
    a.variableDeclarationId !== b.variableDeclarationId
  )
    throw new Error('MULTIVARIATE_NOT_SUPPORTED');
  return a.variableDeclarationId ?? b.variableDeclarationId;
}

function canonicalize(
  variableDeclarationId: string | null,
  entries: Iterable<readonly [number, InternalRational]>,
  limits: RationalFunctionLimits,
): InternalUnivariatePolynomial {
  const coefficients = new Map<number, InternalRational>();
  for (const [degree, raw] of entries) {
    if (!Number.isInteger(degree) || degree < 0) throw new Error('DEGREE_LIMIT_EXCEEDED');
    const coefficient = checkRationalLimit(raw, limits);
    if (coefficient.numerator !== 0n) coefficients.set(degree, coefficient);
  }
  const degree = coefficients.size === 0 ? -1 : Math.max(...coefficients.keys());
  if (degree > limits.maxPolynomialDegree) throw new Error('DEGREE_LIMIT_EXCEEDED');
  if (coefficients.size > limits.maxPolynomialTerms) throw new Error('TERM_LIMIT_EXCEEDED');
  return { variableDeclarationId, coefficients };
}

export const univariateZero = (): InternalUnivariatePolynomial => ({
  variableDeclarationId: null,
  coefficients: new Map(),
});
export const univariateConstant = (
  coefficient: InternalRational,
  limits: RationalFunctionLimits,
): InternalUnivariatePolynomial => canonicalize(null, [[0, coefficient]], limits);
export const univariateOne = (limits: RationalFunctionLimits) =>
  univariateConstant(oneRational, limits);
export const univariateVariable = (
  variableDeclarationId: string,
  limits: RationalFunctionLimits,
): InternalUnivariatePolynomial => canonicalize(variableDeclarationId, [[1, oneRational]], limits);
export const univariateDegree = (p: InternalUnivariatePolynomial): number =>
  p.coefficients.size === 0 ? -1 : Math.max(...p.coefficients.keys());
export const univariateIsZero = (p: InternalUnivariatePolynomial) => p.coefficients.size === 0;
export const univariateCoefficient = (p: InternalUnivariatePolynomial, degree: number) =>
  p.coefficients.get(degree) ?? zeroRational;
export const univariateLeadingCoefficient = (p: InternalUnivariatePolynomial) => {
  const degree = univariateDegree(p);
  return degree < 0 ? zeroRational : univariateCoefficient(p, degree);
};

export function univariateAdd(
  a: InternalUnivariatePolynomial,
  b: InternalUnivariatePolynomial,
  limits: RationalFunctionLimits,
): InternalUnivariatePolynomial {
  const variable = variableOf(a, b);
  const degrees = new Set([...a.coefficients.keys(), ...b.coefficients.keys()]);
  return canonicalize(
    variable,
    [...degrees].map(
      (degree) =>
        [
          degree,
          addRational(univariateCoefficient(a, degree), univariateCoefficient(b, degree)),
        ] as const,
    ),
    limits,
  );
}
export function univariateNegate(
  p: InternalUnivariatePolynomial,
  limits: RationalFunctionLimits,
): InternalUnivariatePolynomial {
  return canonicalize(
    p.variableDeclarationId,
    [...p.coefficients].map(
      ([degree, coefficient]) => [degree, negateRational(coefficient)] as const,
    ),
    limits,
  );
}
export const univariateSubtract = (
  a: InternalUnivariatePolynomial,
  b: InternalUnivariatePolynomial,
  limits: RationalFunctionLimits,
) => univariateAdd(a, univariateNegate(b, limits), limits);
export function univariateMultiply(
  a: InternalUnivariatePolynomial,
  b: InternalUnivariatePolynomial,
  limits: RationalFunctionLimits,
): InternalUnivariatePolynomial {
  const variable = variableOf(a, b);
  const result = new Map<number, InternalRational>();
  for (const [da, ca] of a.coefficients)
    for (const [db, cb] of b.coefficients) {
      const degree = da + db;
      if (degree > limits.maxPolynomialDegree) throw new Error('DEGREE_LIMIT_EXCEEDED');
      const product = checkRationalLimit(multiplyRational(ca, cb), limits);
      result.set(
        degree,
        checkRationalLimit(addRational(result.get(degree) ?? zeroRational, product), limits),
      );
    }
  return canonicalize(variable, result, limits);
}
export function univariatePower(
  base: InternalUnivariatePolynomial,
  exponent: number,
  limits: RationalFunctionLimits,
): InternalUnivariatePolynomial {
  let result = univariateOne(limits);
  let factor = base;
  let n = exponent;
  while (n > 0) {
    if (n % 2 === 1) result = univariateMultiply(result, factor, limits);
    n = Math.floor(n / 2);
    if (n > 0) factor = univariateMultiply(factor, factor, limits);
  }
  return result;
}
export function univariateScale(
  p: InternalUnivariatePolynomial,
  scalar: InternalRational,
  limits: RationalFunctionLimits,
): InternalUnivariatePolynomial {
  return canonicalize(
    p.variableDeclarationId,
    [...p.coefficients].map(
      ([degree, coefficient]) => [degree, multiplyRational(coefficient, scalar)] as const,
    ),
    limits,
  );
}
export function univariateMonic(
  p: InternalUnivariatePolynomial,
  limits: RationalFunctionLimits,
): InternalUnivariatePolynomial {
  if (univariateIsZero(p)) return univariateZero();
  return univariateScale(p, divideRational(oneRational, univariateLeadingCoefficient(p)), limits);
}
export function univariateDivmod(
  dividend: InternalUnivariatePolynomial,
  divisor: InternalUnivariatePolynomial,
  limits: RationalFunctionLimits,
): { quotient: InternalUnivariatePolynomial; remainder: InternalUnivariatePolynomial } {
  if (univariateIsZero(divisor)) throw new Error('DIVISION_BY_ZERO');
  variableOf(dividend, divisor);
  let remainder = canonicalize(dividend.variableDeclarationId, dividend.coefficients, limits);
  let quotient = univariateZero();
  let steps = 0;
  const divisorDegree = univariateDegree(divisor);
  const divisorLeading = univariateLeadingCoefficient(divisor);
  while (!univariateIsZero(remainder) && univariateDegree(remainder) >= divisorDegree) {
    steps += 1;
    if (steps > limits.maxPolynomialDivisionSteps)
      throw new Error('POLYNOMIAL_DIVISION_LIMIT_EXCEEDED');
    const degree = univariateDegree(remainder) - divisorDegree;
    const coefficient = checkRationalLimit(
      divideRational(univariateLeadingCoefficient(remainder), divisorLeading),
      limits,
    );
    const term = canonicalize(variableOf(dividend, divisor), [[degree, coefficient]], limits);
    quotient = univariateAdd(quotient, term, limits);
    remainder = univariateSubtract(remainder, univariateMultiply(divisor, term, limits), limits);
  }
  return { quotient, remainder };
}
export function univariateExactQuotient(
  dividend: InternalUnivariatePolynomial,
  divisor: InternalUnivariatePolynomial,
  limits: RationalFunctionLimits,
): InternalUnivariatePolynomial {
  const result = univariateDivmod(dividend, divisor, limits);
  if (!univariateIsZero(result.remainder)) throw new Error('POLYNOMIAL_DIVISION_LIMIT_EXCEEDED');
  return result.quotient;
}
export function univariateDerivative(
  p: InternalUnivariatePolynomial,
  limits: RationalFunctionLimits,
): InternalUnivariatePolynomial {
  return canonicalize(
    p.variableDeclarationId,
    [...p.coefficients]
      .filter(([degree]) => degree > 0)
      .map(
        ([degree, coefficient]) =>
          [degree - 1, multiplyRational(coefficient, rational(BigInt(degree)))] as const,
      ),
    limits,
  );
}
export function univariateGcd(
  a: InternalUnivariatePolynomial,
  b: InternalUnivariatePolynomial,
  limits: RationalFunctionLimits,
): InternalUnivariatePolynomial {
  variableOf(a, b);
  let x = a;
  let y = b;
  let steps = 0;
  while (!univariateIsZero(y)) {
    steps += 1;
    if (steps > limits.maxGcdSteps) throw new Error('GCD_STEP_LIMIT_EXCEEDED');
    const { remainder } = univariateDivmod(x, y, limits);
    x = y;
    y = remainder;
  }
  return univariateMonic(x, limits);
}
export function univariateSquareFree(
  p: InternalUnivariatePolynomial,
  limits: RationalFunctionLimits,
): InternalUnivariatePolynomial {
  if (univariateIsZero(p)) return univariateZero();
  if (univariateDegree(p) === 0) return univariateOne(limits);
  return univariateMonic(
    univariateExactQuotient(p, univariateGcd(p, univariateDerivative(p, limits), limits), limits),
    limits,
  );
}
export function univariateEquals(a: InternalUnivariatePolynomial, b: InternalUnivariatePolynomial) {
  if (a.coefficients.size !== b.coefficients.size) return false;
  for (const [degree, coefficient] of a.coefficients)
    if (!equalRational(coefficient, univariateCoefficient(b, degree))) return false;
  return true;
}
export const univariateDivides = (
  divisor: InternalUnivariatePolynomial,
  dividend: InternalUnivariatePolynomial,
  limits: RationalFunctionLimits,
) => univariateIsZero(univariateDivmod(dividend, divisor, limits).remainder);

export function univariateToNormalForm(p: InternalUnivariatePolynomial): PolynomialNormalForm {
  return {
    kind: 'formal-polynomial',
    coefficientDomain: 'rational',
    terms: [...p.coefficients]
      .sort(([a], [b]) => a - b)
      .map(([degree, coefficient]) => ({
        coefficient: canonicalRational(coefficient),
        powers:
          degree === 0 || p.variableDeclarationId === null
            ? []
            : [{ declarationId: p.variableDeclarationId, exponent: degree }],
      })),
  };
}
export function univariateFromNormalForm(
  p: PolynomialNormalForm,
  limits: RationalFunctionLimits,
): InternalUnivariatePolynomial {
  let variable: string | null = null;
  const entries: [number, InternalRational][] = [];
  for (const term of p.terms) {
    if (term.powers.length > 1) throw new Error('MULTIVARIATE_NOT_SUPPORTED');
    const power = term.powers[0];
    if (power) {
      if (variable !== null && variable !== power.declarationId)
        throw new Error('MULTIVARIATE_NOT_SUPPORTED');
      variable = power.declarationId;
    }
    entries.push([
      power?.exponent ?? 0,
      rational(BigInt(term.coefficient.numerator), BigInt(term.coefficient.denominator)),
    ]);
  }
  return canonicalize(variable, entries, limits);
}
export function univariateFromInternalPolynomial(
  p: InternalPolynomial,
  limits: RationalFunctionLimits,
): InternalUnivariatePolynomial {
  const normal: PolynomialNormalForm = {
    kind: 'formal-polynomial',
    coefficientDomain: 'rational',
    terms: [...p.values()].map((term) => ({
      coefficient: canonicalRational(term.coefficient),
      powers: term.powers,
    })),
  };
  return univariateFromNormalForm(normal, limits);
}
