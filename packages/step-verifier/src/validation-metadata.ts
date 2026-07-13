import type { ProviderDiagnostic } from '@mathir/algebra';
import type { AlgebraicStepVerificationOutput } from './types.js';

export interface ValidationMetadata {
  validationDiagnostics: ProviderDiagnostic[];
  totalValidationDiagnostics: number;
  validationDiagnosticsTruncated: boolean;
}

export const applyValidationMetadata = (
  output: AlgebraicStepVerificationOutput,
  source: ValidationMetadata,
): void => {
  output.validationDiagnostics = source.validationDiagnostics;
  output.totalValidationDiagnostics = source.totalValidationDiagnostics;
  output.validationDiagnosticsTruncated = source.validationDiagnosticsTruncated;
};
