import { idSchema } from '@mathir/contracts';
import {
  type AlgebraicStepVerificationOutput,
  algebraicStepVerificationOutputSchema,
  verifyAlgebraicStep,
} from '@mathir/step-verifier';
import { z } from 'zod';
import { boundValidationDiagnostics } from '../output-budget.js';
import type { JsonValue } from '../protocol.js';
import {
  DIAGNOSTIC_SCHEMA,
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
export interface VerifyAlgebraicStepInput {
  document: JsonValue;
  stepId: string;
  verificationMode: 'auto' | 'polynomial' | 'rational_function';
  conditionMode: 'ignore' | 'document_nonzero' | 'step_nonzero' | 'document_and_step_nonzero';
}
export const verifyAlgebraicStepInputSchema = z
  .object({
    document: json,
    stepId: idSchema,
    verificationMode: z.enum(['auto', 'polynomial', 'rational_function']),
    conditionMode: z.enum([
      'ignore',
      'document_nonzero',
      'step_nonzero',
      'document_and_step_nonzero',
    ]),
  })
  .strict();
export const VERIFY_ALGEBRAIC_STEP_INPUT_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://mathir.org/schema/provider/verify-algebraic-step-input-0.1.0.schema.json',
  type: 'object',
  additionalProperties: false,
  required: ['document', 'stepId', 'verificationMode', 'conditionMode'],
  properties: {
    document: {},
    stepId: { type: 'string', pattern: ID_PATTERN },
    verificationMode: { enum: ['auto', 'polynomial', 'rational_function'] },
    conditionMode: {
      enum: ['ignore', 'document_nonzero', 'step_nonzero', 'document_and_step_nonzero'],
    },
  },
} as const;
const ID_ARRAY = { type: 'array', items: { type: 'string', pattern: ID_PATTERN } } as const;
const NULLABLE_ID = { type: ['string', 'null'], pattern: ID_PATTERN } as const;
const RULE_SCHEMA = {
  anyOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'name'],
      properties: {
        kind: { const: 'equivalence' },
        name: {
          enum: [
            'simplification',
            'algebraic_rearrangement',
            'substitution',
            'definition_expansion',
          ],
        },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'name'],
      properties: {
        kind: { const: 'implication' },
        name: { enum: ['apply_inequality', 'case_analysis', 'modus_ponens', 'specialization'] },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'name'],
      properties: {
        kind: { const: 'assertion' },
        name: { enum: ['given', 'derived', 'external_result'] },
        reference: { type: 'string' },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['kind'],
      properties: { kind: { const: 'unknown' }, raw: { type: 'string' } },
    },
  ],
} as const;
const ISSUE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['code', 'message', 'phase'],
  properties: {
    code: { type: 'string' },
    message: { type: 'string' },
    phase: { enum: ['step_shape', 'polynomial', 'rational_function', 'conditions', 'output'] },
    stepId: { type: 'string', pattern: ID_PATTERN },
    statementId: { type: 'string', pattern: ID_PATTERN },
    expressionId: { type: 'string', pattern: ID_PATTERN },
    side: { enum: ['before', 'after'] },
    path: { type: 'string' },
  },
} as const;
const CONDITION_ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'mode',
    'status',
    'selectedStatementIds',
    'selectedDocumentAssumptionIds',
    'selectedStepSideConditionIds',
    'recognizedStatementIds',
    'unsupportedStatementIds',
    'recognizedDocumentAssumptionIds',
    'recognizedStepSideConditionIds',
    'unsupportedDocumentAssumptionIds',
    'unsupportedStepSideConditionIds',
    'dischargeGuard',
  ],
  properties: {
    mode: { enum: ['ignore', 'document_nonzero', 'step_nonzero', 'document_and_step_nonzero'] },
    status: { enum: ['not_needed', 'completed', 'unavailable'] },
    selectedStatementIds: ID_ARRAY,
    selectedDocumentAssumptionIds: ID_ARRAY,
    selectedStepSideConditionIds: ID_ARRAY,
    recognizedStatementIds: ID_ARRAY,
    unsupportedStatementIds: ID_ARRAY,
    recognizedDocumentAssumptionIds: ID_ARRAY,
    recognizedStepSideConditionIds: ID_ARRAY,
    unsupportedDocumentAssumptionIds: ID_ARRAY,
    unsupportedStepSideConditionIds: ID_ARRAY,
    dischargeGuard: NULLABLE_POLYNOMIAL_NORMAL_FORM_SCHEMA,
  },
} as const;
const EVIDENCE_SCHEMA = {
  anyOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'transformation'],
      properties: {
        kind: { const: 'structural' },
        transformation: { enum: ['reflexivity', 'no_op', 'equality_symmetry'] },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'beforeNormalForm', 'afterNormalForm'],
      properties: {
        kind: { const: 'polynomial' },
        beforeNormalForm: NULLABLE_POLYNOMIAL_NORMAL_FORM_SCHEMA,
        afterNormalForm: NULLABLE_POLYNOMIAL_NORMAL_FORM_SCHEMA,
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: [
        'kind',
        'beforeNormalForm',
        'afterNormalForm',
        'beforeDomainGuard',
        'afterDomainGuard',
        'requiredDomainGuard',
      ],
      properties: {
        kind: { const: 'rational_function' },
        beforeNormalForm: NULLABLE_RATIONAL_FUNCTION_NORMAL_FORM_SCHEMA,
        afterNormalForm: NULLABLE_RATIONAL_FUNCTION_NORMAL_FORM_SCHEMA,
        beforeDomainGuard: NULLABLE_POLYNOMIAL_NORMAL_FORM_SCHEMA,
        afterDomainGuard: NULLABLE_POLYNOMIAL_NORMAL_FORM_SCHEMA,
        requiredDomainGuard: NULLABLE_POLYNOMIAL_NORMAL_FORM_SCHEMA,
      },
    },
    { type: 'null' },
  ],
} as const;
export const VERIFY_ALGEBRAIC_STEP_OUTPUT_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://mathir.org/schema/provider/verify-algebraic-step-output-0.1.0.schema.json',
  type: 'object',
  additionalProperties: false,
  required: [
    'outcome',
    'semantics',
    'verificationMode',
    'conditionMode',
    'stepId',
    'stepShape',
    'engine',
    'declaredRule',
    'declaredStatus',
    'premiseStatementId',
    'conclusionStatementId',
    'anchorExpressionId',
    'beforeExpressionId',
    'afterExpressionId',
    'dependencyIds',
    'sideConditionIds',
    'conditionStatus',
    'conditionAnalysis',
    'evidence',
    'issues',
    'validationDiagnostics',
    'totalValidationDiagnostics',
    'validationDiagnosticsTruncated',
  ],
  properties: {
    outcome: {
      enum: ['verified', 'conditionally_verified', 'rejected', 'unknown', 'invalid_document'],
    },
    semantics: { const: 'exact-algebraic-identity-and-anchored-rewrite-step-verification-v1' },
    verificationMode: { enum: ['auto', 'polynomial', 'rational_function'] },
    conditionMode: {
      enum: ['ignore', 'document_nonzero', 'step_nonzero', 'document_and_step_nonzero'],
    },
    stepId: { type: 'string', pattern: ID_PATTERN },
    stepShape: {
      enum: [
        'identity_assertion',
        'anchored_rewrite',
        'equality_noop',
        'equality_symmetry',
        'equality_reflexivity',
        null,
      ],
    },
    engine: { enum: ['structural', 'polynomial', 'rational_function', null] },
    declaredRule: { anyOf: [RULE_SCHEMA, { type: 'null' }] },
    declaredStatus: { enum: ['parsed', 'partial', 'unparsed', null] },
    premiseStatementId: NULLABLE_ID,
    conclusionStatementId: NULLABLE_ID,
    anchorExpressionId: NULLABLE_ID,
    beforeExpressionId: NULLABLE_ID,
    afterExpressionId: NULLABLE_ID,
    dependencyIds: ID_ARRAY,
    sideConditionIds: ID_ARRAY,
    conditionStatus: {
      enum: ['not_required', 'required', 'satisfied_by_selected_conditions', 'not_applicable'],
    },
    conditionAnalysis: CONDITION_ANALYSIS_SCHEMA,
    evidence: EVIDENCE_SCHEMA,
    issues: { type: 'array', items: ISSUE_SCHEMA },
    validationDiagnostics: { type: 'array', items: DIAGNOSTIC_SCHEMA },
    totalValidationDiagnostics: { type: 'integer', minimum: 0 },
    validationDiagnosticsTruncated: { type: 'boolean' },
  },
} as const;

export function executeVerifyAlgebraicStep(
  input: VerifyAlgebraicStepInput,
): AlgebraicStepVerificationOutput {
  return boundValidationDiagnostics(
    verifyAlgebraicStep(input.document, input.stepId, input.verificationMode, input.conditionMode),
  );
}
export function parseVerifyAlgebraicStepInput(raw: unknown) {
  const parsed = verifyAlgebraicStepInputSchema.safeParse(raw);
  return parsed.success
    ? { ok: true as const, input: parsed.data }
    : {
        ok: false as const,
        message: 'input does not match the mathir.verify-algebraic-step input contract',
      };
}
export { algebraicStepVerificationOutputSchema };
