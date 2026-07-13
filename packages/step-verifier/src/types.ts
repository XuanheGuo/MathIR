import type {
  PolynomialNormalForm,
  ProviderDiagnostic,
  RationalFunctionNormalForm,
} from '@mathir/algebra';
import type { ReasoningStep } from '@mathir/contracts';
import type { ALGEBRAIC_STEP_VERIFICATION_SEMANTICS } from './constants.js';

export type AlgebraicStepVerificationMode = 'auto' | 'polynomial' | 'rational_function';
export type StepConditionMode =
  | 'ignore'
  | 'document_nonzero'
  | 'step_nonzero'
  | 'document_and_step_nonzero';
export type AlgebraicStepVerificationOutcome =
  | 'verified'
  | 'conditionally_verified'
  | 'rejected'
  | 'unknown'
  | 'invalid_document';
export type AlgebraicStepShape =
  | 'identity_assertion'
  | 'anchored_rewrite'
  | 'equality_noop'
  | 'equality_symmetry'
  | 'equality_reflexivity';
export type AlgebraicStepEngine = 'structural' | 'polynomial' | 'rational_function';
export type StepConditionStatus =
  | 'not_required'
  | 'required'
  | 'satisfied_by_selected_conditions'
  | 'not_applicable';

export interface StepVerificationIssue {
  code: string;
  message: string;
  phase: 'step_shape' | 'polynomial' | 'rational_function' | 'conditions' | 'output';
  stepId?: string;
  statementId?: string;
  expressionId?: string;
  side?: 'before' | 'after';
  path?: string;
}
export interface StructuralStepEvidence {
  kind: 'structural';
  transformation: 'reflexivity' | 'no_op' | 'equality_symmetry';
}
export interface PolynomialStepEvidence {
  kind: 'polynomial';
  beforeNormalForm: PolynomialNormalForm | null;
  afterNormalForm: PolynomialNormalForm | null;
}
export interface RationalFunctionStepEvidence {
  kind: 'rational_function';
  beforeNormalForm: RationalFunctionNormalForm | null;
  afterNormalForm: RationalFunctionNormalForm | null;
  beforeDomainGuard: PolynomialNormalForm | null;
  afterDomainGuard: PolynomialNormalForm | null;
  requiredDomainGuard: PolynomialNormalForm | null;
}
export type AlgebraicStepEvidence =
  | StructuralStepEvidence
  | PolynomialStepEvidence
  | RationalFunctionStepEvidence;
export interface StepConditionAnalysis {
  mode: StepConditionMode;
  status: 'not_needed' | 'completed' | 'unavailable';
  selectedStatementIds: string[];
  selectedDocumentAssumptionIds: string[];
  selectedStepSideConditionIds: string[];
  recognizedStatementIds: string[];
  unsupportedStatementIds: string[];
  recognizedDocumentAssumptionIds: string[];
  recognizedStepSideConditionIds: string[];
  unsupportedDocumentAssumptionIds: string[];
  unsupportedStepSideConditionIds: string[];
  dischargeGuard: PolynomialNormalForm | null;
}
export interface AlgebraicStepVerificationOutput {
  outcome: AlgebraicStepVerificationOutcome;
  semantics: typeof ALGEBRAIC_STEP_VERIFICATION_SEMANTICS;
  verificationMode: AlgebraicStepVerificationMode;
  conditionMode: StepConditionMode;
  stepId: string;
  stepShape: AlgebraicStepShape | null;
  engine: AlgebraicStepEngine | null;
  declaredRule: ReasoningStep['rule'] | null;
  declaredStatus: ReasoningStep['status'] | null;
  premiseStatementId: string | null;
  conclusionStatementId: string | null;
  anchorExpressionId: string | null;
  beforeExpressionId: string | null;
  afterExpressionId: string | null;
  dependencyIds: string[];
  sideConditionIds: string[];
  conditionStatus: StepConditionStatus;
  conditionAnalysis: StepConditionAnalysis;
  evidence: AlgebraicStepEvidence | null;
  issues: StepVerificationIssue[];
  validationDiagnostics: ProviderDiagnostic[];
  totalValidationDiagnostics: number;
  validationDiagnosticsTruncated: boolean;
}
