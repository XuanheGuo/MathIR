export const MATHERIUM_PROTOCOL_VERSION = '0.2.0';
export const SERVICE_ID = 'mathir-validator';
export const SERVICE_VERSION = '0.3.0';
export const CAPABILITY_ID = 'mathir.validate-document';
export const CAPABILITY_VERSION = '0.1.0';
export const NORMALIZE_POLYNOMIAL_CAPABILITY_ID = 'mathir.normalize-polynomial';
export const CHECK_POLYNOMIAL_EQUIVALENCE_CAPABILITY_ID = 'mathir.check-polynomial-equivalence';
export const NORMALIZE_RATIONAL_FUNCTION_CAPABILITY_ID = 'mathir.normalize-rational-function';
export const CHECK_RATIONAL_FUNCTION_EQUIVALENCE_CAPABILITY_ID =
  'mathir.check-rational-function-equivalence';
export const EXECUTE_PATH = '/v0/execute';
export const MANIFEST_PATH = '/.well-known/matherium/service.json';
export const HEALTH_PATH = '/health';

export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = 4110;
export const DEFAULT_BODY_LIMIT_BYTES = 1024 * 1024;
export const OUTPUT_BYTE_BUDGET = 900 * 1024;
export const CAPABILITY_TIMEOUT_MS = 5000;
