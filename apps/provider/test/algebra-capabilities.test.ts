import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import {
  executeCheckPolynomialEquivalence,
  polynomialEquivalenceOutputSchema,
} from '../src/capabilities/check-polynomial-equivalence.js';
import {
  executeCheckRationalFunctionEquivalence,
  rationalFunctionEquivalenceOutputSchema,
} from '../src/capabilities/check-rational-function-equivalence.js';
import {
  executeNormalizePolynomial,
  normalizePolynomialOutputSchema,
} from '../src/capabilities/normalize-polynomial.js';
import {
  executeNormalizeRationalFunction,
  normalizeRationalFunctionOutputSchema,
} from '../src/capabilities/normalize-rational-function.js';
import { PROVIDER_CAPABILITIES } from '../src/capabilities/registry.js';

const document = {
  mathirVersion: '0.1.0',
  documentId: 'provider-algebra',
  kind: 'problem' as const,
  declarations: [{ id: 'x', kind: 'symbol' as const, name: 'x' }],
  expressions: [
    { id: 'sx', kind: 'symbol' as const, declarationId: 'x' },
    { id: 'one', kind: 'number' as const, value: '1' },
    { id: 'two', kind: 'number' as const, value: '2' },
    { id: 'sum', kind: 'nary' as const, operator: 'add' as const, operands: ['sx', 'one'] },
    {
      id: 'square',
      kind: 'binary' as const,
      operator: 'power' as const,
      left: 'sum',
      right: 'two',
    },
    { id: 'x2', kind: 'binary' as const, operator: 'power' as const, left: 'sx', right: 'two' },
    { id: 'twox', kind: 'nary' as const, operator: 'multiply' as const, operands: ['two', 'sx'] },
    {
      id: 'expanded',
      kind: 'nary' as const,
      operator: 'add' as const,
      operands: ['x2', 'twox', 'one'],
    },
    {
      id: 'quotient',
      kind: 'binary' as const,
      operator: 'divide' as const,
      left: 'sx',
      right: 'sx',
    },
  ],
  statements: [],
  steps: [],
  assumptions: [],
  goals: [],
};

describe('provider algebra registry', () => {
  it('contains exactly five unique ID/version pairs', () => {
    expect(PROVIDER_CAPABILITIES).toHaveLength(5);
    expect(
      new Set(PROVIDER_CAPABILITIES.map((c) => `${c.capabilityId}@${c.capabilityVersion}`)).size,
    ).toBe(5);
  });
  it('compiles all schemas and round-trips generated examples', () => {
    for (const capability of PROVIDER_CAPABILITIES) {
      const ajv = new Ajv2020.default({ strict: true });
      const input = ajv.compile(capability.inputSchema);
      const output = ajv.compile(capability.outputSchema);
      for (const example of capability.examples) {
        expect(input(example.input)).toBe(true);
        expect(output(example.output)).toBe(true);
        if (capability.capabilityId === 'mathir.normalize-polynomial')
          expect(normalizePolynomialOutputSchema.safeParse(example.output).success).toBe(true);
        if (capability.capabilityId === 'mathir.check-polynomial-equivalence')
          expect(polynomialEquivalenceOutputSchema.safeParse(example.output).success).toBe(true);
        if (capability.capabilityId === 'mathir.normalize-rational-function')
          expect(normalizeRationalFunctionOutputSchema.safeParse(example.output).success).toBe(
            true,
          );
        if (capability.capabilityId === 'mathir.check-rational-function-equivalence')
          expect(rationalFunctionEquivalenceOutputSchema.safeParse(example.output).success).toBe(
            true,
          );
        const parsed = capability.parseInput(example.input);
        expect(parsed.ok).toBe(true);
        if (parsed.ok) expect(capability.execute(parsed.input)).toEqual(example.output);
      }
    }
  });
  it('requires assumptionMode and exposes rational-function domain outcomes', () => {
    expect(
      executeNormalizeRationalFunction({
        document,
        expressionId: 'quotient',
        assumptionMode: 'ignore',
      }),
    ).toMatchObject({ outcome: 'normalized', domainStatus: 'required' });
    expect(
      executeCheckRationalFunctionEquivalence({
        document,
        leftExpressionId: 'quotient',
        rightExpressionId: 'one',
        assumptionMode: 'ignore',
      }),
    ).toMatchObject({ outcome: 'conditionally_equivalent', conditionStatus: 'required' });
    const normalize = PROVIDER_CAPABILITIES.find(
      (capability) => capability.capabilityId === 'mathir.normalize-rational-function',
    );
    expect(normalize?.parseInput({ document, expressionId: 'quotient' }).ok).toBe(false);
    expect(
      normalize?.parseInput({ document, expressionId: 'quotient', assumptionMode: 'automatic' }).ok,
    ).toBe(false);
  });
  it('normalizes a valid expression and reports invalid documents', () => {
    expect(executeNormalizePolynomial({ document, expressionId: 'square' }).outcome).toBe(
      'normalized',
    );
    expect(
      executeNormalizePolynomial({ document: { bad: true }, expressionId: 'square' }).outcome,
    ).toBe('invalid_document');
  });
  it('returns equivalent, not_equivalent and unknown as succeeded domain outputs', () => {
    expect(
      executeCheckPolynomialEquivalence({
        document,
        leftExpressionId: 'square',
        rightExpressionId: 'expanded',
      }).outcome,
    ).toBe('equivalent');
    expect(
      executeCheckPolynomialEquivalence({
        document,
        leftExpressionId: 'sum',
        rightExpressionId: 'sx',
      }).outcome,
    ).toBe('not_equivalent');
    const unknown = executeCheckPolynomialEquivalence({
      document,
      leftExpressionId: 'quotient',
      rightExpressionId: 'one',
    });
    expect(unknown.outcome).toBe('unknown');
    expect(unknown.issues).toContainEqual(
      expect.objectContaining({ code: 'NON_CONSTANT_DIVISOR' }),
    );
  });
  it('stays deterministic and under the provider byte budget', () => {
    for (const capability of PROVIDER_CAPABILITIES)
      for (const example of capability.examples) {
        const parsed = capability.parseInput(example.input);
        if (!parsed.ok) throw new Error('invalid example');
        const first = capability.execute(parsed.input);
        expect(capability.execute(parsed.input)).toEqual(first);
        expect(Buffer.byteLength(JSON.stringify(first), 'utf8')).toBeLessThanOrEqual(900 * 1024);
      }
  });
});
