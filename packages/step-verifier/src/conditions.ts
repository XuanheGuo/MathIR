import type { AssumptionAnalysis, MathDocument, ReasoningStep } from './internal-types.js';
import type { StepConditionAnalysis, StepConditionMode } from './types.js';

const sortUnique = (values: readonly string[]) =>
  [...new Set(values)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
export interface SelectedConditions {
  documentIds: string[];
  stepIds: string[];
  allIds: string[];
}
export const selectConditions = (
  document: MathDocument,
  step: ReasoningStep,
  mode: StepConditionMode,
): SelectedConditions => {
  const documentIds =
    mode === 'document_nonzero' || mode === 'document_and_step_nonzero'
      ? sortUnique(document.assumptions)
      : [];
  const stepIds =
    mode === 'step_nonzero' || mode === 'document_and_step_nonzero'
      ? sortUnique(step.sideConditions)
      : [];
  return { documentIds, stepIds, allIds: sortUnique([...documentIds, ...stepIds]) };
};
export const emptyConditionAnalysis = (
  mode: StepConditionMode,
  selected: SelectedConditions = { documentIds: [], stepIds: [], allIds: [] },
  status: StepConditionAnalysis['status'] = 'not_needed',
): StepConditionAnalysis => ({
  mode,
  status,
  selectedStatementIds: selected.allIds,
  selectedDocumentAssumptionIds: selected.documentIds,
  selectedStepSideConditionIds: selected.stepIds,
  recognizedStatementIds: [],
  unsupportedStatementIds: [],
  recognizedDocumentAssumptionIds: [],
  recognizedStepSideConditionIds: [],
  unsupportedDocumentAssumptionIds: [],
  unsupportedStepSideConditionIds: [],
  dischargeGuard: null,
});
export const completeConditionAnalysis = (
  mode: StepConditionMode,
  selected: SelectedConditions,
  analysis: AssumptionAnalysis,
): StepConditionAnalysis => {
  const recognized = new Set(analysis.recognizedStatementIds);
  const unsupported = new Set(analysis.unsupportedStatementIds);
  const filter = (ids: string[], set: Set<string>) => ids.filter((id) => set.has(id));
  return {
    mode,
    status: 'completed',
    selectedStatementIds: selected.allIds,
    selectedDocumentAssumptionIds: selected.documentIds,
    selectedStepSideConditionIds: selected.stepIds,
    recognizedStatementIds: sortUnique(analysis.recognizedStatementIds),
    unsupportedStatementIds: sortUnique(analysis.unsupportedStatementIds),
    recognizedDocumentAssumptionIds: filter(selected.documentIds, recognized),
    recognizedStepSideConditionIds: filter(selected.stepIds, recognized),
    unsupportedDocumentAssumptionIds: filter(selected.documentIds, unsupported),
    unsupportedStepSideConditionIds: filter(selected.stepIds, unsupported),
    dischargeGuard: analysis.dischargeGuard,
  };
};
