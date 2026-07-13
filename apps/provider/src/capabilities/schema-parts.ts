export const ID_PATTERN = '^[A-Za-z][A-Za-z0-9._:-]{0,127}$';
export const RATIONAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['numerator', 'denominator'],
  properties: {
    numerator: { type: 'string', pattern: '^-?[0-9]+$' },
    denominator: { type: 'string', pattern: '^[1-9][0-9]*$' },
  },
} as const;
export const POWER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['declarationId', 'exponent'],
  properties: {
    declarationId: { type: 'string', pattern: ID_PATTERN },
    exponent: { type: 'integer', minimum: 1 },
  },
} as const;
export const POLYNOMIAL_NORMAL_FORM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'coefficientDomain', 'terms'],
  properties: {
    kind: { const: 'formal-polynomial' },
    coefficientDomain: { const: 'rational' },
    terms: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['coefficient', 'powers'],
        properties: {
          coefficient: RATIONAL_SCHEMA,
          powers: { type: 'array', items: POWER_SCHEMA },
        },
      },
    },
  },
} as const;
export const NORMAL_FORM_SCHEMA = {
  anyOf: [POLYNOMIAL_NORMAL_FORM_SCHEMA, { type: 'null' }],
} as const;
export const RATIONAL_FUNCTION_NORMAL_FORM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'coefficientDomain', 'variableDeclarationId', 'numerator', 'denominator'],
  properties: {
    kind: { const: 'formal-univariate-rational-function' },
    coefficientDomain: { const: 'rational' },
    variableDeclarationId: { type: ['string', 'null'] },
    numerator: POLYNOMIAL_NORMAL_FORM_SCHEMA,
    denominator: POLYNOMIAL_NORMAL_FORM_SCHEMA,
  },
} as const;
export const NULLABLE_RATIONAL_FUNCTION_NORMAL_FORM_SCHEMA = {
  anyOf: [RATIONAL_FUNCTION_NORMAL_FORM_SCHEMA, { type: 'null' }],
} as const;
export const NULLABLE_POLYNOMIAL_NORMAL_FORM_SCHEMA = {
  anyOf: [POLYNOMIAL_NORMAL_FORM_SCHEMA, { type: 'null' }],
} as const;
export const ASSUMPTION_ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['mode', 'recognizedStatementIds', 'unsupportedStatementIds', 'dischargeGuard'],
  properties: {
    mode: { enum: ['ignore', 'document_nonzero'] },
    recognizedStatementIds: { type: 'array', items: { type: 'string', pattern: ID_PATTERN } },
    unsupportedStatementIds: { type: 'array', items: { type: 'string', pattern: ID_PATTERN } },
    dischargeGuard: NULLABLE_POLYNOMIAL_NORMAL_FORM_SCHEMA,
  },
} as const;
export const ISSUE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['code', 'message'],
  properties: {
    code: { type: 'string' },
    message: { type: 'string' },
    expressionId: { type: 'string' },
    path: { type: 'string' },
    side: { enum: ['left', 'right'] },
  },
} as const;
export const DIAGNOSTIC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['code', 'severity', 'message'],
  properties: {
    code: { type: 'string' },
    severity: { enum: ['error', 'warning'] },
    message: { type: 'string' },
    path: { type: 'string' },
    entity: {
      type: 'object',
      additionalProperties: false,
      required: ['kind'],
      properties: { kind: { type: 'string' }, id: { type: 'string' } },
    },
    related: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'id'],
        properties: { kind: { type: 'string' }, id: { type: 'string' } },
      },
    },
  },
} as const;
export const COMMON_ALGEBRA_OUTPUT_PROPERTIES = {
  semantics: { const: 'formal-commutative-polynomial-over-rationals-v1' },
  issues: { type: 'array', items: ISSUE_SCHEMA },
  validationDiagnostics: { type: 'array', items: DIAGNOSTIC_SCHEMA },
  totalValidationDiagnostics: { type: 'integer', minimum: 0 },
  validationDiagnosticsTruncated: { type: 'boolean' },
} as const;
export const COMMON_RATIONAL_FUNCTION_OUTPUT_PROPERTIES = {
  semantics: {
    const: 'formal-univariate-rational-function-over-rationals-with-domain-guards-v1',
  },
  assumptionSemantics: { const: 'explicit-polynomial-nonzero-document-assumptions-v1' },
  assumptionMode: { enum: ['ignore', 'document_nonzero'] },
  assumptionAnalysis: ASSUMPTION_ANALYSIS_SCHEMA,
  issues: { type: 'array', items: ISSUE_SCHEMA },
  validationDiagnostics: { type: 'array', items: DIAGNOSTIC_SCHEMA },
  totalValidationDiagnostics: { type: 'integer', minimum: 0 },
  validationDiagnosticsTruncated: { type: 'boolean' },
} as const;
