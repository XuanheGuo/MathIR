import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { PROVIDER_CAPABILITIES } from '../src/capabilities/registry.js';
import {
  VERIFY_ALGEBRAIC_STEP_INPUT_JSON_SCHEMA,
  VERIFY_ALGEBRAIC_STEP_OUTPUT_JSON_SCHEMA,
  algebraicStepVerificationOutputSchema,
  executeVerifyAlgebraicStep,
  parseVerifyAlgebraicStepInput,
  verifyAlgebraicStepInputSchema,
} from '../src/capabilities/verify-algebraic-step.js';
import { serializedByteSize } from '../src/output-budget.js';

const capability = PROVIDER_CAPABILITIES.find(
  (item) => item.capabilityId === 'mathir.verify-algebraic-step',
);
if (!capability) throw new Error('step capability missing');

describe('mathir.verify-algebraic-step capability', () => {
  it('uses strict Draft 2020-12 schemas aligned with Zod', () => {
    const ajv = new Ajv2020.default({ strict: true });
    expect(() => ajv.compile(VERIFY_ALGEBRAIC_STEP_INPUT_JSON_SCHEMA)).not.toThrow();
    const validateOutput = ajv.compile(VERIFY_ALGEBRAIC_STEP_OUTPUT_JSON_SCHEMA);
    for (const example of capability.examples) {
      expect(verifyAlgebraicStepInputSchema.safeParse(example.input).success).toBe(true);
      expect(algebraicStepVerificationOutputSchema.safeParse(example.output).success).toBe(true);
      expect(validateOutput(example.output)).toBe(true);
    }
  });
  it('generates polynomial, conditional rational, and discharged examples from real execution', () => {
    expect(
      capability.examples.map((example) => (example.output as { outcome: string }).outcome),
    ).toEqual(['verified', 'conditionally_verified', 'verified']);
    for (const example of capability.examples) {
      const parsed = parseVerifyAlgebraicStepInput(example.input);
      if (!parsed.ok) throw new Error('invalid generated example');
      const fresh = executeVerifyAlgebraicStep(parsed.input);
      expect(fresh).toEqual(example.output);
      expect(JSON.stringify(fresh)).toBe(JSON.stringify(example.output));
      expect(serializedByteSize(fresh)).toBeLessThanOrEqual(900 * 1024);
    }
  });
  it('rejects malformed modes and additional wrapper properties', () => {
    const input = capability.examples[0]?.input as Record<string, unknown>;
    expect(parseVerifyAlgebraicStepInput({ ...input, verificationMode: 'guess' }).ok).toBe(false);
    expect(parseVerifyAlgebraicStepInput({ ...input, conditionMode: 'all' }).ok).toBe(false);
    expect(parseVerifyAlgebraicStepInput({ ...input, extra: true }).ok).toBe(false);
  });
  it('returns invalid_document and missing-step as succeeded domain outputs', () => {
    const input = capability.examples[0]?.input as Record<string, unknown>;
    const parsed = verifyAlgebraicStepInputSchema.parse(input);
    expect(executeVerifyAlgebraicStep({ ...parsed, document: null }).outcome).toBe(
      'invalid_document',
    );
    expect(executeVerifyAlgebraicStep({ ...parsed, stepId: 'missing' }).outcome).toBe('unknown');
  });
});
