import { polynomialNormalFormSchema, rationalFunctionNormalFormSchema } from '@mathir/algebra';
import { reasoningRuleSchema } from '@mathir/contracts';
import { z } from 'zod';
import { ALGEBRAIC_STEP_VERIFICATION_SEMANTICS } from './constants.js';

export const stepVerificationIssueSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    phase: z.enum(['step_shape', 'polynomial', 'rational_function', 'conditions', 'output']),
    stepId: z.string().optional(),
    statementId: z.string().optional(),
    expressionId: z.string().optional(),
    side: z.enum(['before', 'after']).optional(),
    path: z.string().optional(),
  })
  .strict();
export const stepConditionAnalysisSchema = z
  .object({
    mode: z.enum(['ignore', 'document_nonzero', 'step_nonzero', 'document_and_step_nonzero']),
    status: z.enum(['not_needed', 'completed', 'unavailable']),
    selectedStatementIds: z.array(z.string()),
    selectedDocumentAssumptionIds: z.array(z.string()),
    selectedStepSideConditionIds: z.array(z.string()),
    recognizedStatementIds: z.array(z.string()),
    unsupportedStatementIds: z.array(z.string()),
    recognizedDocumentAssumptionIds: z.array(z.string()),
    recognizedStepSideConditionIds: z.array(z.string()),
    unsupportedDocumentAssumptionIds: z.array(z.string()),
    unsupportedStepSideConditionIds: z.array(z.string()),
    dischargeGuard: polynomialNormalFormSchema.nullable(),
  })
  .strict();
const structuralEvidenceSchema = z
  .object({
    kind: z.literal('structural'),
    transformation: z.enum(['reflexivity', 'no_op', 'equality_symmetry']),
  })
  .strict();
const polynomialEvidenceSchema = z
  .object({
    kind: z.literal('polynomial'),
    beforeNormalForm: polynomialNormalFormSchema.nullable(),
    afterNormalForm: polynomialNormalFormSchema.nullable(),
  })
  .strict();
const rationalEvidenceSchema = z
  .object({
    kind: z.literal('rational_function'),
    beforeNormalForm: rationalFunctionNormalFormSchema.nullable(),
    afterNormalForm: rationalFunctionNormalFormSchema.nullable(),
    beforeDomainGuard: polynomialNormalFormSchema.nullable(),
    afterDomainGuard: polynomialNormalFormSchema.nullable(),
    requiredDomainGuard: polynomialNormalFormSchema.nullable(),
  })
  .strict();
export const stepEvidenceSchema = z.discriminatedUnion('kind', [
  structuralEvidenceSchema,
  polynomialEvidenceSchema,
  rationalEvidenceSchema,
]);
const diagnosticSchema = z
  .object({
    code: z.string(),
    severity: z.enum(['error', 'warning']),
    message: z.string(),
    path: z.string().optional(),
    entity: z.object({ kind: z.string(), id: z.string().optional() }).strict().optional(),
    related: z.array(z.object({ kind: z.string(), id: z.string() }).strict()).optional(),
  })
  .strict();
export const algebraicStepVerificationOutputSchema = z
  .object({
    outcome: z.enum([
      'verified',
      'conditionally_verified',
      'rejected',
      'unknown',
      'invalid_document',
    ]),
    semantics: z.literal(ALGEBRAIC_STEP_VERIFICATION_SEMANTICS),
    verificationMode: z.enum(['auto', 'polynomial', 'rational_function']),
    conditionMode: z.enum([
      'ignore',
      'document_nonzero',
      'step_nonzero',
      'document_and_step_nonzero',
    ]),
    stepId: z.string(),
    stepShape: z
      .enum([
        'identity_assertion',
        'anchored_rewrite',
        'equality_noop',
        'equality_symmetry',
        'equality_reflexivity',
      ])
      .nullable(),
    engine: z.enum(['structural', 'polynomial', 'rational_function']).nullable(),
    declaredRule: reasoningRuleSchema.nullable(),
    declaredStatus: z.enum(['parsed', 'partial', 'unparsed']).nullable(),
    premiseStatementId: z.string().nullable(),
    conclusionStatementId: z.string().nullable(),
    anchorExpressionId: z.string().nullable(),
    beforeExpressionId: z.string().nullable(),
    afterExpressionId: z.string().nullable(),
    dependencyIds: z.array(z.string()),
    sideConditionIds: z.array(z.string()),
    conditionStatus: z.enum([
      'not_required',
      'required',
      'satisfied_by_selected_conditions',
      'not_applicable',
    ]),
    conditionAnalysis: stepConditionAnalysisSchema,
    evidence: stepEvidenceSchema.nullable(),
    issues: z.array(stepVerificationIssueSchema),
    validationDiagnostics: z.array(diagnosticSchema),
    totalValidationDiagnostics: z.number().int().nonnegative(),
    validationDiagnosticsTruncated: z.boolean(),
  })
  .strict();
