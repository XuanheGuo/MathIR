import {
  type PolynomialEquivalenceOutput,
  checkPolynomialEquivalence,
  polynomialEquivalenceOutputSchema,
} from '@mathir/algebra';
import { idSchema } from '@mathir/contracts';
import { z } from 'zod';
import { boundValidationDiagnostics } from '../output-budget.js';
import type { JsonValue } from '../protocol.js';
import {
  COMMON_ALGEBRA_OUTPUT_PROPERTIES,
  ID_PATTERN,
  NORMAL_FORM_SCHEMA,
} from './schema-parts.js';
const json: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(json),
    z.record(z.string(), json),
  ]),
);
export interface CheckPolynomialEquivalenceInput {
  document: JsonValue;
  leftExpressionId: string;
  rightExpressionId: string;
}
export const checkPolynomialEquivalenceInputSchema = z
  .object({ document: json, leftExpressionId: idSchema, rightExpressionId: idSchema })
  .strict();
export const CHECK_POLYNOMIAL_EQUIVALENCE_INPUT_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://mathir.org/schema/provider/check-polynomial-equivalence-input-0.1.0.schema.json',
  type: 'object',
  additionalProperties: false,
  required: ['document', 'leftExpressionId', 'rightExpressionId'],
  properties: {
    document: {},
    leftExpressionId: { type: 'string', pattern: ID_PATTERN },
    rightExpressionId: { type: 'string', pattern: ID_PATTERN },
  },
} as const;
export const CHECK_POLYNOMIAL_EQUIVALENCE_OUTPUT_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://mathir.org/schema/provider/check-polynomial-equivalence-output-0.1.0.schema.json',
  type: 'object',
  additionalProperties: false,
  required: [
    'outcome',
    'semantics',
    'leftExpressionId',
    'rightExpressionId',
    'leftNormalForm',
    'rightNormalForm',
    'issues',
    'validationDiagnostics',
    'totalValidationDiagnostics',
    'validationDiagnosticsTruncated',
  ],
  properties: {
    outcome: { enum: ['equivalent', 'not_equivalent', 'unknown', 'invalid_document'] },
    leftExpressionId: { type: 'string' },
    rightExpressionId: { type: 'string' },
    leftNormalForm: NORMAL_FORM_SCHEMA,
    rightNormalForm: NORMAL_FORM_SCHEMA,
    ...COMMON_ALGEBRA_OUTPUT_PROPERTIES,
  },
} as const;
export function executeCheckPolynomialEquivalence(
  input: CheckPolynomialEquivalenceInput,
): PolynomialEquivalenceOutput {
  return boundValidationDiagnostics(
    checkPolynomialEquivalence(input.document, input.leftExpressionId, input.rightExpressionId),
  );
}
export function parseCheckPolynomialEquivalenceInput(raw: unknown) {
  const parsed = checkPolynomialEquivalenceInputSchema.safeParse(raw);
  return parsed.success
    ? { ok: true as const, input: parsed.data }
    : {
        ok: false as const,
        message: 'input does not match the mathir.check-polynomial-equivalence input contract',
      };
}
export { polynomialEquivalenceOutputSchema };
