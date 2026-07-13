import type { AlgebraLimits } from './constants.js';
import type { CanonicalRational, InternalRational } from './rational.js';
import {
  addRational,
  canonicalRational,
  checkRationalLimit,
  multiplyRational,
  rational,
} from './rational.js';

export interface PolynomialPower {
  declarationId: string;
  exponent: number;
}
export interface PolynomialTerm {
  coefficient: CanonicalRational;
  powers: PolynomialPower[];
}
export interface PolynomialNormalForm {
  kind: 'formal-polynomial';
  coefficientDomain: 'rational';
  terms: PolynomialTerm[];
}
export interface InternalPolynomialTerm {
  coefficient: InternalRational;
  powers: PolynomialPower[];
}
export type InternalPolynomial = Map<string, InternalPolynomialTerm>;
export const zeroPolynomial = (): InternalPolynomial => new Map();
export const constantPolynomial = (coefficient: InternalRational): InternalPolynomial =>
  coefficient.numerator === 0n ? zeroPolynomial() : new Map([['', { coefficient, powers: [] }]]);
export const variablePolynomial = (declarationId: string): InternalPolynomial =>
  new Map([
    [`${declarationId}^1`, { coefficient: rational(1n), powers: [{ declarationId, exponent: 1 }] }],
  ]);
export const monomialKey = (powers: PolynomialPower[]) =>
  powers.map((p) => `${p.declarationId}^${p.exponent}`).join('*');
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
function assertBounds(poly: InternalPolynomial, limits: AlgebraLimits): InternalPolynomial {
  if (poly.size > limits.maxTerms) throw new Error('TERM_LIMIT_EXCEEDED');
  for (const term of poly.values()) {
    checkRationalLimit(term.coefficient, limits);
    if (term.powers.reduce((n, p) => n + p.exponent, 0) > limits.maxTotalDegree)
      throw new Error('DEGREE_LIMIT_EXCEEDED');
  }
  return poly;
}
function insert(
  out: InternalPolynomial,
  term: InternalPolynomialTerm,
  limits: AlgebraLimits,
): void {
  const key = monomialKey(term.powers);
  const old = out.get(key);
  const coefficient = checkRationalLimit(
    old ? addRational(old.coefficient, term.coefficient) : term.coefficient,
    limits,
  );
  if (coefficient.numerator === 0n) out.delete(key);
  else out.set(key, { coefficient, powers: term.powers });
  if (out.size > limits.maxTerms) throw new Error('TERM_LIMIT_EXCEEDED');
}
export function addPolynomial(
  a: InternalPolynomial,
  b: InternalPolynomial,
  limits: AlgebraLimits,
): InternalPolynomial {
  const out = new Map(a);
  for (const term of b.values()) insert(out, term, limits);
  return assertBounds(out, limits);
}
export function negatePolynomial(a: InternalPolynomial): InternalPolynomial {
  return new Map(
    [...a].map(([k, t]) => [
      k,
      { ...t, coefficient: rational(-t.coefficient.numerator, t.coefficient.denominator) },
    ]),
  );
}
export function multiplyPolynomial(
  a: InternalPolynomial,
  b: InternalPolynomial,
  limits: AlgebraLimits,
): InternalPolynomial {
  const out = zeroPolynomial();
  for (const x of a.values())
    for (const y of b.values()) {
      const merged = new Map<string, number>();
      for (const p of [...x.powers, ...y.powers])
        merged.set(p.declarationId, (merged.get(p.declarationId) ?? 0) + p.exponent);
      const powers = [...merged]
        .map(([declarationId, exponent]) => ({ declarationId, exponent }))
        .sort((x, y) => compareText(x.declarationId, y.declarationId));
      insert(
        out,
        {
          coefficient: checkRationalLimit(multiplyRational(x.coefficient, y.coefficient), limits),
          powers,
        },
        limits,
      );
    }
  return assertBounds(out, limits);
}
export function powerPolynomial(
  base: InternalPolynomial,
  exponent: number,
  limits: AlgebraLimits,
): InternalPolynomial {
  let result = constantPolynomial(rational(1n));
  let factor = base;
  let n = exponent;
  while (n > 0) {
    if (n % 2 === 1) result = multiplyPolynomial(result, factor, limits);
    n = Math.floor(n / 2);
    if (n > 0) factor = multiplyPolynomial(factor, factor, limits);
  }
  return assertBounds(result, limits);
}
export function toNormalForm(poly: InternalPolynomial): PolynomialNormalForm {
  const terms = [...poly.entries()]
    .sort(([a], [b]) => compareText(a, b))
    .map(([, t]) => ({ coefficient: canonicalRational(t.coefficient), powers: t.powers }));
  return { kind: 'formal-polynomial', coefficientDomain: 'rational', terms };
}
