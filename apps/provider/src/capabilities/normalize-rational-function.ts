import {
  type NormalizeRationalFunctionOutput,
  normalizeRationalFunction,
  normalizeRationalFunctionOutputSchema,
} from '@mathir/algebra';
import { idSchema } from '@mathir/contracts';
import { z } from 'zod';
import { boundValidationDiagnostics } from '../output-budget.js';
import type { JsonValue } from '../protocol.js';
import {
  COMMON_RATIONAL_FUNCTION_OUTPUT_PROPERTIES,
  ID_PATTERN,
  NULLABLE_POLYNOMIAL_NORMAL_FORM_SCHEMA,
  NULLABLE_RATIONAL_FUNCTION_NORMAL_FORM_SCHEMA,
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
const assumptionMode = z.enum(['ignore', 'document_nonzero']);
export interface NormalizeRationalFunctionInput {
  document: JsonValue;
  expressionId: string;
  assumptionMode: 'ignore' | 'document_nonzero';
}
export const normalizeRationalFunctionInputSchema = z
  .object({ document: json, expressionId: idSchema, assumptionMode })
  .strict();
export const NORMALIZE_RATIONAL_FUNCTION_INPUT_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://mathir.org/schema/provider/normalize-rational-function-input-0.1.0.schema.json',
  type: 'object',
  additionalProperties: false,
  required: ['document', 'expressionId', 'assumptionMode'],
  properties: {
    document: {},
    expressionId: { type: 'string', pattern: ID_PATTERN },
    assumptionMode: { enum: ['ignore', 'document_nonzero'] },
  },
} as const;
export const NORMALIZE_RATIONAL_FUNCTION_OUTPUT_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://mathir.org/schema/provider/normalize-rational-function-output-0.1.0.schema.json',
  type: 'object',
  additionalProperties: false,
  required: [
    'outcome',
    'semantics',
    'assumptionSemantics',
    'assumptionMode',
    'expressionId',
    'normalForm',
    'domainGuard',
    'domainStatus',
    'assumptionAnalysis',
    'issues',
    'validationDiagnostics',
    'totalValidationDiagnostics',
    'validationDiagnosticsTruncated',
  ],
  properties: {
    outcome: { enum: ['normalized', 'unsupported', 'invalid_document'] },
    expressionId: { type: 'string' },
    normalForm: NULLABLE_RATIONAL_FUNCTION_NORMAL_FORM_SCHEMA,
    domainGuard: NULLABLE_POLYNOMIAL_NORMAL_FORM_SCHEMA,
    domainStatus: {
      enum: ['unrestricted', 'required', 'satisfied_by_assumptions', 'not_applicable'],
    },
    ...COMMON_RATIONAL_FUNCTION_OUTPUT_PROPERTIES,
  },
} as const;
export function executeNormalizeRationalFunction(
  input: NormalizeRationalFunctionInput,
): NormalizeRationalFunctionOutput {
  return boundValidationDiagnostics(
    normalizeRationalFunction(input.document, input.expressionId, input.assumptionMode),
  );
}
export function parseNormalizeRationalFunctionInput(raw: unknown) {
  const parsed = normalizeRationalFunctionInputSchema.safeParse(raw);
  return parsed.success
    ? { ok: true as const, input: parsed.data }
    : {
        ok: false as const,
        message: 'input does not match the mathir.normalize-rational-function input contract',
      };
}
export { normalizeRationalFunctionOutputSchema };
