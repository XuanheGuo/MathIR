import {
  type NormalizePolynomialOutput,
  normalizePolynomial,
  normalizePolynomialOutputSchema,
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
export interface NormalizePolynomialInput {
  document: JsonValue;
  expressionId: string;
}
export const normalizePolynomialInputSchema = z
  .object({ document: json, expressionId: idSchema })
  .strict();
export const NORMALIZE_POLYNOMIAL_INPUT_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://mathir.org/schema/provider/normalize-polynomial-input-0.1.0.schema.json',
  type: 'object',
  additionalProperties: false,
  required: ['document', 'expressionId'],
  properties: { document: {}, expressionId: { type: 'string', pattern: ID_PATTERN } },
} as const;
export const NORMALIZE_POLYNOMIAL_OUTPUT_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://mathir.org/schema/provider/normalize-polynomial-output-0.1.0.schema.json',
  type: 'object',
  additionalProperties: false,
  required: [
    'outcome',
    'semantics',
    'expressionId',
    'normalForm',
    'issues',
    'validationDiagnostics',
    'totalValidationDiagnostics',
    'validationDiagnosticsTruncated',
  ],
  properties: {
    outcome: { enum: ['normalized', 'unsupported', 'invalid_document'] },
    expressionId: { type: 'string' },
    normalForm: NORMAL_FORM_SCHEMA,
    ...COMMON_ALGEBRA_OUTPUT_PROPERTIES,
  },
} as const;
export function executeNormalizePolynomial(
  input: NormalizePolynomialInput,
): NormalizePolynomialOutput {
  return boundValidationDiagnostics(normalizePolynomial(input.document, input.expressionId));
}
export function parseNormalizePolynomialInput(raw: unknown) {
  const parsed = normalizePolynomialInputSchema.safeParse(raw);
  return parsed.success
    ? { ok: true as const, input: parsed.data }
    : {
        ok: false as const,
        message: 'input does not match the mathir.normalize-polynomial input contract',
      };
}
export { normalizePolynomialOutputSchema };
