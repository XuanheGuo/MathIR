import {
  type RationalFunctionEquivalenceOutput,
  checkRationalFunctionEquivalence,
  rationalFunctionEquivalenceOutputSchema,
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
export interface CheckRationalFunctionEquivalenceInput {
  document: JsonValue;
  leftExpressionId: string;
  rightExpressionId: string;
  assumptionMode: 'ignore' | 'document_nonzero';
}
export const checkRationalFunctionEquivalenceInputSchema = z
  .object({
    document: json,
    leftExpressionId: idSchema,
    rightExpressionId: idSchema,
    assumptionMode: z.enum(['ignore', 'document_nonzero']),
  })
  .strict();
export const CHECK_RATIONAL_FUNCTION_EQUIVALENCE_INPUT_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://mathir.org/schema/provider/check-rational-function-equivalence-input-0.1.0.schema.json',
  type: 'object',
  additionalProperties: false,
  required: ['document', 'leftExpressionId', 'rightExpressionId', 'assumptionMode'],
  properties: {
    document: {},
    leftExpressionId: { type: 'string', pattern: ID_PATTERN },
    rightExpressionId: { type: 'string', pattern: ID_PATTERN },
    assumptionMode: { enum: ['ignore', 'document_nonzero'] },
  },
} as const;
export const CHECK_RATIONAL_FUNCTION_EQUIVALENCE_OUTPUT_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://mathir.org/schema/provider/check-rational-function-equivalence-output-0.1.0.schema.json',
  type: 'object',
  additionalProperties: false,
  required: [
    'outcome',
    'semantics',
    'assumptionSemantics',
    'assumptionMode',
    'leftExpressionId',
    'rightExpressionId',
    'leftNormalForm',
    'rightNormalForm',
    'leftDomainGuard',
    'rightDomainGuard',
    'requiredDomainGuard',
    'conditionStatus',
    'assumptionAnalysis',
    'issues',
    'validationDiagnostics',
    'totalValidationDiagnostics',
    'validationDiagnosticsTruncated',
  ],
  properties: {
    outcome: {
      enum: [
        'equivalent',
        'conditionally_equivalent',
        'not_equivalent',
        'unknown',
        'invalid_document',
      ],
    },
    leftExpressionId: { type: 'string' },
    rightExpressionId: { type: 'string' },
    leftNormalForm: NULLABLE_RATIONAL_FUNCTION_NORMAL_FORM_SCHEMA,
    rightNormalForm: NULLABLE_RATIONAL_FUNCTION_NORMAL_FORM_SCHEMA,
    leftDomainGuard: NULLABLE_POLYNOMIAL_NORMAL_FORM_SCHEMA,
    rightDomainGuard: NULLABLE_POLYNOMIAL_NORMAL_FORM_SCHEMA,
    requiredDomainGuard: NULLABLE_POLYNOMIAL_NORMAL_FORM_SCHEMA,
    conditionStatus: {
      enum: ['not_required', 'required', 'satisfied_by_assumptions', 'not_applicable'],
    },
    ...COMMON_RATIONAL_FUNCTION_OUTPUT_PROPERTIES,
  },
} as const;
export function executeCheckRationalFunctionEquivalence(
  input: CheckRationalFunctionEquivalenceInput,
): RationalFunctionEquivalenceOutput {
  return boundValidationDiagnostics(
    checkRationalFunctionEquivalence(
      input.document,
      input.leftExpressionId,
      input.rightExpressionId,
      input.assumptionMode,
    ),
  );
}
export function parseCheckRationalFunctionEquivalenceInput(raw: unknown) {
  const parsed = checkRationalFunctionEquivalenceInputSchema.safeParse(raw);
  return parsed.success
    ? { ok: true as const, input: parsed.data }
    : {
        ok: false as const,
        message:
          'input does not match the mathir.check-rational-function-equivalence input contract',
      };
}
export { rationalFunctionEquivalenceOutputSchema };
