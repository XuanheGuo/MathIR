import { OUTPUT_BYTE_BUDGET } from './constants.js';
export function serializedByteSize(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}
export function boundValidationDiagnostics<
  T extends {
    validationDiagnostics: unknown[];
    totalValidationDiagnostics: number;
    validationDiagnosticsTruncated: boolean;
  },
>(full: T): T {
  if (serializedByteSize(full) <= OUTPUT_BYTE_BUDGET) return full;
  let lo = 0;
  let hi = full.validationDiagnostics.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = {
      ...full,
      validationDiagnostics: full.validationDiagnostics.slice(0, mid),
      validationDiagnosticsTruncated: mid < full.totalValidationDiagnostics,
    };
    if (serializedByteSize(candidate) <= OUTPUT_BYTE_BUDGET) lo = mid;
    else hi = mid - 1;
  }
  const bounded = {
    ...full,
    validationDiagnostics: full.validationDiagnostics.slice(0, lo),
    validationDiagnosticsTruncated: lo < full.totalValidationDiagnostics,
  };
  if (serializedByteSize(bounded) > OUTPUT_BYTE_BUDGET)
    throw new Error('provider output exceeds byte budget');
  return bounded;
}
